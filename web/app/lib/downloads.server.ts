// Luồng tải file:
// mua / bấm "Tải xuống" -> download_request (token riêng)
//   - file đã có trên R2  -> link sẵn sàng ngay
//   - chưa có             -> đưa job vào UPLOAD_QUEUE, tool máy nhà upload, rồi gửi email
// Link /d/:token -> kiểm tra -> ký presigned URL ngắn hạn -> chuyển hướng
import { and, eq, inArray, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb, schema } from "./db.server";
import { presignModelDownload } from "./r2.server";
import { downloadListHtml, emailLayout, sendEmail } from "./email.server";
import { slugify } from "./format";
import { safeEqual } from "./crypto.server";

const { models, downloadRequests, entitlements } = schema;

export type UploadJob = { modelId: string; fileKey: string; sha256: string | null; sizeBytes: number | null };

/* ---------------------------- token ---------------------------- */

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

let _key: Promise<CryptoKey> | undefined;
function hmacKey() {
  return (_key ??= crypto.subtle.importKey(
    "raw",
    enc.encode("download-token:" + env.BETTER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  ));
}

/** token = <requestId>.<hmac>; có thể tạo lại từ requestId nên không cần lưu token gốc */
export async function tokenFor(requestId: string) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(requestId));
  return `${requestId}.${b64url(sig)}`;
}

async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function linkFor(requestId: string) {
  return `${env.PUBLIC_SITE_URL}/d/${await tokenFor(requestId)}`;
}

/* ------------------------ đảm bảo file trên R2 ------------------------ */

/** Chuyển mẫu sang 'uploading' và đưa job vào queue (chỉ một lần dù nhiều người mua cùng lúc) */
export async function ensureUpload(modelId: string, force = false): Promise<void> {
  const db = getDb();
  const statuses = force ? ["absent", "failed", "uploading"] : ["absent", "failed"];
  const updated = await db
    .update(models)
    .set({
      r2Status: "uploading",
      r2UploadRequestedAt: new Date(),
      r2UploadAttempts: sql`${models.r2UploadAttempts} + 1`,
    })
    .where(and(eq(models.id, modelId), inArray(models.r2Status, statuses as ["absent"])))
    .returning({ fileKey: models.fileKey, sha: models.fileSha256, size: models.fileSizeBytes });
  const row = updated[0];
  if (!row) return; // đã ready hoặc đang upload
  if (!row.fileKey) {
    await db.update(models).set({ r2Status: "failed" }).where(eq(models.id, modelId));
    console.error(`Mẫu ${modelId} chưa có fileKey – không thể đẩy lên R2`);
    return;
  }
  // contentType json: bắt buộc để tool máy nhà đọc được qua HTTP pull
  await env.UPLOAD_QUEUE.send({ modelId, fileKey: row.fileKey, sha256: row.sha, sizeBytes: row.size } satisfies UploadJob, {
    contentType: "json",
  });
}

/* ------------------------ tạo yêu cầu tải ------------------------ */

type Notify = "none" | "when_ready";

export async function createDownloadRequest(opts: {
  userId: string;
  modelId: string;
  email: string | null;
  notify: Notify;
}) {
  const db = getDb();
  const [model] = await db
    .select({ id: models.id, title: models.title, r2Status: models.r2Status })
    .from(models)
    .where(eq(models.id, opts.modelId))
    .limit(1);
  if (!model) throw new Response("Không tìm thấy mẫu", { status: 404 });

  const ready = model.r2Status === "ready";
  const id = crypto.randomUUID();
  const ttlH = Number(env.DOWNLOAD_LINK_TTL_HOURS) || 72;
  await db.insert(downloadRequests).values({
    id,
    tokenHash: await sha256Hex(await tokenFor(id)),
    userId: opts.userId,
    modelId: model.id,
    status: ready ? "ready" : "waiting_upload",
    notifyEmail: opts.notify === "when_ready" ? opts.email : null,
    expiresAt: new Date(Date.now() + ttlH * 3600_000),
  });
  if (!ready) await ensureUpload(model.id);
  return { id, ready, title: model.title };
}

/* ------------------------ khi tool máy nhà upload xong ------------------------ */

export async function markUploaded(modelId: string, info: { sizeBytes?: number; sha256?: string }) {
  const db = getDb();
  await db
    .update(models)
    .set({
      r2Status: "ready",
      r2ReadyAt: new Date(),
      lastDownloadAt: new Date(), // tính là vừa có lượt tải để không bị dọn ngay
      // fileSha256 giữ nguyên = chữ ký thư mục (dùng để phát hiện mẫu đổi trên máy nhà)
      ...(info.sizeBytes ? { fileSizeBytes: info.sizeBytes } : {}),
    })
    .where(eq(models.id, modelId));

  const ttlH = Number(env.DOWNLOAD_LINK_TTL_HOURS) || 72;
  const waiting = await db
    .update(downloadRequests)
    .set({ status: "ready", expiresAt: new Date(Date.now() + ttlH * 3600_000) })
    .where(and(eq(downloadRequests.modelId, modelId), eq(downloadRequests.status, "waiting_upload")))
    .returning({ id: downloadRequests.id, email: downloadRequests.notifyEmail });

  const [m] = await db.select({ title: models.title }).from(models).where(eq(models.id, modelId)).limit(1);
  for (const r of waiting) {
    if (!r.email) continue;
    try {
      const url = await linkFor(r.id);
      await sendEmail({
        to: r.email,
        subject: `File đã sẵn sàng: ${m?.title ?? "mẫu 3D"}`,
        html: emailLayout("File của bạn đã sẵn sàng", downloadListHtml([{ title: m?.title ?? "", url }])),
        text: `Tải mẫu ${m?.title}: ${url}`,
      });
      await db.update(downloadRequests).set({ emailedAt: new Date() }).where(eq(downloadRequests.id, r.id));
    } catch (e) {
      console.error("Gửi email tải file lỗi", e);
    }
  }
  return { notified: waiting.length };
}

export async function markUploadFailed(modelId: string, reason: string) {
  console.error(`Upload mẫu ${modelId} lỗi: ${reason}`);
  await getDb().update(models).set({ r2Status: "failed" }).where(eq(models.id, modelId));
}

/* ------------------------ mở link /d/:token ------------------------ */

export type ResolveResult =
  | { kind: "redirect"; url: string }
  | { kind: "waiting"; title: string }
  | { kind: "invalid"; reason: string };

export async function resolveDownloadToken(token: string): Promise<ResolveResult> {
  const [id, sig] = token.split(".");
  if (!id || !sig) return { kind: "invalid", reason: "Link không hợp lệ." };
  if (!safeEqual(await tokenFor(id), token)) return { kind: "invalid", reason: "Link không hợp lệ." };

  const db = getDb();
  const [r] = await db
    .select({ req: downloadRequests, title: models.title, fileKey: models.fileKey, r2Status: models.r2Status, slug: models.slug })
    .from(downloadRequests)
    .innerJoin(models, eq(models.id, downloadRequests.modelId))
    .where(eq(downloadRequests.id, id))
    .limit(1);
  if (!r) return { kind: "invalid", reason: "Link không tồn tại." };
  if (r.req.status === "waiting_upload") return { kind: "waiting", title: r.title };
  if (r.req.status !== "ready" || r.req.expiresAt.getTime() < Date.now())
    return { kind: "invalid", reason: "Link đã hết hạn. Bạn có thể tạo link mới trong mục Mẫu đã mua." };
  if (r.req.clickCount >= r.req.maxClicks)
    return { kind: "invalid", reason: "Link đã dùng quá số lần cho phép. Hãy tạo link mới trong mục Mẫu đã mua." };

  const [ent] = await db
    .select({ revoked: entitlements.revoked })
    .from(entitlements)
    .where(and(eq(entitlements.userId, r.req.userId), eq(entitlements.modelId, r.req.modelId)))
    .limit(1);
  if (!ent || ent.revoked) return { kind: "invalid", reason: "Bạn không còn quyền tải mẫu này." };

  if (r.r2Status !== "ready" || !r.fileKey) {
    // file đã bị dọn khỏi R2 sau khi tạo link: đẩy lại và chờ
    await db.update(downloadRequests).set({ status: "waiting_upload" }).where(eq(downloadRequests.id, id));
    await ensureUpload(r.req.modelId);
    return { kind: "waiting", title: r.title };
  }

  await db.batch([
    db
      .update(downloadRequests)
      .set({ clickCount: sql`${downloadRequests.clickCount} + 1` })
      .where(eq(downloadRequests.id, id)),
    db.update(models).set({ lastDownloadAt: new Date() }).where(eq(models.id, r.req.modelId)),
  ]);
  const ext = r.fileKey.split(".").pop() || "zip";
  const url = await presignModelDownload(r.fileKey, `${slugify(r.slug || r.title)}.${ext}`);
  return { kind: "redirect", url };
}
