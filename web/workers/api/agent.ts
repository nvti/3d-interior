// API cho tool máy nhà (Bearer AGENT_TOKEN)
import { Hono } from "hono";
import { and, asc, eq, lt, or } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { getDb, schema } from "~/lib/db.server";
import { ensureCategoryPath } from "~/lib/categories.server";
import { markUploaded, markUploadFailed } from "~/lib/downloads.server";
import { afterModelChanged, ensureTags, listPublishedModelIds } from "~/lib/models.server";
import { slugify, STYLES } from "~/lib/format";
import { extractTiptapText, renderTiptapHtml, type TiptapNode } from "~/lib/tiptap";
import { safeEqual } from "~/lib/crypto.server";

const { models, media, modelImages, modelTags, libraryScans, libraryImports } = schema;

export const agent = new Hono();

agent.use("*", async (c, next) => {
  const auth = c.req.header("Authorization") ?? "";
  if (!env.AGENT_TOKEN || !safeEqual(auth, `Bearer ${env.AGENT_TOKEN}`)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

agent.get("/health", (c) => c.json({ ok: true }));

agent.post("/uploaded", async (c) => {
  const body = z
    .object({ modelId: z.string(), sizeBytes: z.number().int().positive().optional(), sha256: z.string().optional() })
    .parse(await c.req.json());
  const r = await markUploaded(body.modelId, body);
  return c.json({ ok: true, ...r });
});

agent.post("/upload-failed", async (c) => {
  const body = z.object({ modelId: z.string(), reason: z.string().max(2000) }).parse(await c.req.json());
  await markUploadFailed(body.modelId, body.reason);
  return c.json({ ok: true });
});

const ImageInput = z.object({
  key: z.string(), // key bản lớn nhất trong bucket media
  variants: z.record(z.string(), z.string()).optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  sizeBytes: z.number().int().optional(),
  mimeType: z.string().default("image/webp"),
});

const ModelInput = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  categoryPath: z.array(z.string().min(1)).min(1), // ["Nội thất", "Phòng khách", "Sofa"]
  fileKey: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  fileSha256: z.string().length(64), // chữ ký thư mục trên máy nhà (đổi = file mẫu đã thay đổi)
  formats: z.array(z.string()).default([]),
  renderEngine: z.enum(["vray", "corona", "other"]).optional(),
  maxVersion: z.string().optional(),
  images: z.array(ImageInput).default([]),
  publish: z.boolean().default(false),
  ai: z
    .object({
      title: z.string().min(1).max(120),
      subtitle: z.string().max(300),
      description: z.string().max(400),
      paragraphs: z.array(z.string()).max(6),
      highlights: z.array(z.string()).max(8),
      tags: z.array(z.string()).max(30),
      style: z.string(),
      materials: z.string().max(300),
      colors: z.array(z.string()).max(6),
      room: z.string().max(80),
    })
    .optional(), // nội dung AI viết từ ảnh preview – chỉ dùng khi tạo mẫu mới
});

type AiText = NonNullable<z.infer<typeof ModelInput>["ai"]>;

/** Nội dung AI -> các cột của mẫu (giống scripts/thu-vien/build-sql.mjs) */
function aiFields(t: AiText) {
  const para = (text: string): TiptapNode => ({ type: "paragraph", content: [{ type: "text", text }] });
  const doc: TiptapNode = {
    type: "doc",
    content: [
      ...t.paragraphs.filter(Boolean).map(para),
      ...(t.highlights.length
        ? [
            { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Điểm nổi bật" }] },
            { type: "bulletList", content: t.highlights.map((h) => ({ type: "listItem", content: [para(h)] })) },
          ]
        : []),
    ],
  };
  // Google cắt meta description ở khoảng 160 ký tự
  const meta = t.description.length <= 160 ? t.description : t.description.slice(0, 157).replace(/[\s,.;:]+\S*$/, "") + "…";
  return {
    title: t.title,
    subtitle: t.subtitle || null,
    description: t.description || null,
    style: STYLES.includes(t.style) ? t.style : null,
    materials: t.materials || null,
    attributes: { colors: t.colors, room: t.room, source: "ai" },
    contentJson: doc,
    contentHtml: renderTiptapHtml(doc, env.MEDIA_PUBLIC_URL),
    contentText: extractTiptapText(doc).trim(),
    metaTitle: t.title,
    metaDescription: meta || null,
  };
}

/** Thêm hoặc cập nhật mẫu theo SKU (thư mục trên máy nhà). Không ghi đè nội dung admin đã sửa. */
agent.post("/models", async (c) => {
  const input = ModelInput.parse(await c.req.json());
  const db = getDb();
  const cat = await ensureCategoryPath("model", input.categoryPath);
  const [existing] = await db.select().from(models).where(eq(models.sku, input.sku)).limit(1);

  let modelId: string;
  if (existing) {
    modelId = existing.id;
    const fileChanged = existing.fileSha256 !== input.fileSha256 || existing.fileKey !== input.fileKey;
    await db
      .update(models)
      .set({
        fileKey: input.fileKey,
        fileSha256: input.fileSha256,
        // giữ dung lượng zip thật (do worker báo) nếu thư mục không đổi
        ...(fileChanged || !existing.fileSizeBytes ? { fileSizeBytes: input.fileSizeBytes } : {}),
        formats: existing.formats?.length ? existing.formats : input.formats,
        renderEngine: existing.renderEngine ?? input.renderEngine,
        maxVersion: existing.maxVersion ?? input.maxVersion,
        // file đổi nội dung -> bản trên R2 đã cũ
        ...(fileChanged && existing.r2Status === "ready" ? { r2Status: "absent" as const } : {}),
      })
      .where(eq(models.id, modelId));
    if (fileChanged && existing.r2Status === "ready" && existing.fileKey) {
      await env.MODELS.delete(existing.fileKey);
    }
  } else {
    const ai = input.ai ? aiFields(input.ai) : undefined;
    const title = ai?.title ?? input.title;
    let slug = slugify(title) || slugify(input.sku);
    const [dup] = await db.select({ id: models.id }).from(models).where(eq(models.slug, slug)).limit(1);
    if (dup) slug = `${slug}-${slugify(input.sku)}`.slice(0, 90);
    const [row] = await db
      .insert(models)
      .values({
        ...ai,
        sku: input.sku,
        slug,
        title,
        categoryId: cat.id,
        fileKey: input.fileKey,
        fileSizeBytes: input.fileSizeBytes,
        fileSha256: input.fileSha256,
        formats: input.formats,
        renderEngine: input.renderEngine,
        maxVersion: input.maxVersion,
        status: input.publish ? "published" : "draft",
        publishedAt: input.publish ? new Date() : null,
      })
      .returning({ id: models.id });
    modelId = row.id;
    if (input.ai) {
      const tagIds = await ensureTags(input.ai.tags);
      if (tagIds.length) await db.insert(modelTags).values(tagIds.map((tagId) => ({ modelId, tagId }))).onConflictDoNothing();
    }
  }

  // ảnh: chỉ thêm khi mẫu chưa có ảnh (admin có thể đã sắp xếp lại)
  const [hasImage] = await db
    .select({ id: modelImages.mediaId })
    .from(modelImages)
    .where(eq(modelImages.modelId, modelId))
    .limit(1);
  if (!hasImage && input.images.length) {
    let order = 0;
    for (const img of input.images) {
      const [m] = await db
        .insert(media)
        .values({
          r2Key: img.key,
          variants: img.variants ?? null,
          width: img.width,
          height: img.height,
          sizeBytes: img.sizeBytes,
          mimeType: img.mimeType,
          alt: input.ai?.title ?? input.title,
        })
        .onConflictDoUpdate({ target: media.r2Key, set: { variants: img.variants ?? null } })
        .returning({ id: media.id });
      await db
        .insert(modelImages)
        .values({ modelId, mediaId: m.id, sortOrder: order++ })
        .onConflictDoNothing();
    }
  }

  await afterModelChanged(modelId);
  return c.json({ ok: true, modelId, created: !existing });
});

agent.post("/reindex", async (c) => {
  const ids = await listPublishedModelIds();
  for (let i = 0; i < ids.length; i += 100) {
    await env.SEARCH_QUEUE.sendBatch(ids.slice(i, i + 100).map((modelId) => ({ body: { modelId } })));
  }
  return c.json({ ok: true, queued: ids.length });
});

/** Danh sách SKU đã có (để tool máy nhà bỏ qua thư mục không đổi) */
agent.get("/models/index", async (c) => {
  const rows = await getDb()
    .select({ sku: models.sku, sha: models.fileSha256, id: models.id })
    .from(models);
  return c.json(rows);
});

/* ------------------------------------------------------------------ */
/* Nhập mẫu: admin bấm "Quét mẫu mới" và chọn mẫu ở /admin/library      */
/* ------------------------------------------------------------------ */

// việc "running" quá lâu coi như máy nhà đã tắt giữa chừng -> giao lại
const STALE_MS = 30 * 60 * 1000;
const MAX_CANDIDATES = 2000;

/** Việc đang chờ cho home-agent: một lần quét và/hoặc vài mẫu cần nhập */
agent.get("/library/tasks", async (c) => {
  const db = getDb();
  const stale = new Date(Date.now() - STALE_MS);
  const [scan] = await db
    .select({ id: libraryScans.id })
    .from(libraryScans)
    .where(or(eq(libraryScans.status, "pending"), and(eq(libraryScans.status, "running"), lt(libraryScans.updatedAt, stale))))
    .orderBy(asc(libraryScans.createdAt))
    .limit(1);
  const imports = await db
    .select({ id: libraryImports.id, rel: libraryImports.rel })
    .from(libraryImports)
    .where(
      or(eq(libraryImports.status, "pending"), and(eq(libraryImports.status, "running"), lt(libraryImports.updatedAt, stale))),
    )
    .orderBy(asc(libraryImports.createdAt))
    .limit(5);
  return c.json({ scan: scan ?? null, imports });
});

const Candidate = z.object({
  rel: z.string().min(1),
  categoryPath: z.array(z.string()),
  title: z.string(),
  sku: z.string(),
  images: z.number().int(),
  bytes: z.number(),
  formats: z.array(z.string()),
  copying: z.boolean(),
});

agent.post("/library/scans/:id", async (c) => {
  const body = z
    .object({
      status: z.enum(["running", "done", "failed"]),
      candidates: z.array(Candidate).optional(),
      error: z.string().max(2000).optional(),
    })
    .parse(await c.req.json());
  const now = new Date();
  const list = body.candidates ?? [];
  await getDb()
    .update(libraryScans)
    .set({
      status: body.status,
      ...(body.status === "running" ? { startedAt: now, error: null } : { finishedAt: now }),
      ...(body.candidates ? { candidates: list.slice(0, MAX_CANDIDATES), totalFound: list.length } : {}),
      ...(body.error ? { error: body.error } : {}),
    })
    .where(eq(libraryScans.id, c.req.param("id")));
  return c.json({ ok: true });
});

agent.post("/library/imports/:id", async (c) => {
  const body = z
    .object({
      status: z.enum(["running", "done", "failed"]),
      modelId: z.string().optional(),
      error: z.string().max(2000).optional(),
    })
    .parse(await c.req.json());
  await getDb()
    .update(libraryImports)
    .set({ status: body.status, modelId: body.modelId, error: body.error ?? null })
    .where(eq(libraryImports.id, c.req.param("id")));
  return c.json({ ok: true });
});
