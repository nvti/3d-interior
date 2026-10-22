// Việc chạy nền: consumer đồng bộ Typesense + cron hằng ngày
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb, schema } from "~/lib/db.server";
import { buildSearchDoc, type SearchSyncMessage } from "~/lib/models.server";
import { ensureUpload } from "~/lib/downloads.server";
import { tsDelete, tsUpsert, typesenseEnabled } from "~/lib/typesense.server";

const { models, downloadRequests, orders } = schema;

export async function handleSearchSync(batch: MessageBatch<SearchSyncMessage>) {
  if (!typesenseEnabled()) {
    batch.ackAll();
    return;
  }
  for (const msg of batch.messages) {
    try {
      const doc = await buildSearchDoc(msg.body.modelId);
      if (doc) await tsUpsert(doc);
      else await tsDelete(msg.body.modelId);
      msg.ack();
    } catch (e) {
      // máy nhà offline: thử lại sau 5 phút
      console.warn("Đồng bộ Typesense lỗi, sẽ thử lại:", (e as Error).message);
      msg.retry({ delaySeconds: 300 });
    }
  }
}

const DAY = 86400_000;

export async function runDailyJobs() {
  const db = getDb();
  const now = Date.now();
  const evictDays = Number(env.R2_EVICT_DAYS) || 30;

  // 1) Dọn file trên R2 private lâu không có lượt tải
  const cutoff = new Date(now - evictDays * DAY);
  const candidates = await db
    .select({ id: models.id, fileKey: models.fileKey })
    .from(models)
    .where(
      and(
        eq(models.r2Status, "ready"),
        or(lt(models.lastDownloadAt, cutoff), and(isNull(models.lastDownloadAt), lt(models.r2ReadyAt, cutoff))),
        // giữ lại nếu còn link chưa hết hạn (khách có thể chưa mở email)
        sql`NOT EXISTS (SELECT 1 FROM download_requests d WHERE d.model_id = ${models.id}
              AND d.status = 'ready' AND d.expires_at > ${Math.floor(now / 1000)})`,
      ),
    )
    .limit(200);
  for (const m of candidates) {
    if (m.fileKey) await env.MODELS.delete(m.fileKey);
    await db.update(models).set({ r2Status: "absent", r2ReadyAt: null }).where(eq(models.id, m.id));
  }

  // 2) Job upload bị kẹt > 6 giờ (máy nhà tắt lâu, job hết hạn trong queue): đẩy lại
  const stuck = await db
    .select({ id: models.id, attempts: models.r2UploadAttempts })
    .from(models)
    .where(and(eq(models.r2Status, "uploading"), lt(models.r2UploadRequestedAt, new Date(now - 6 * 3600_000))))
    .limit(100);
  for (const m of stuck) {
    if (m.attempts >= 10) {
      await db.update(models).set({ r2Status: "failed" }).where(eq(models.id, m.id));
      console.error(`Mẫu ${m.id} upload thất bại sau ${m.attempts} lần`);
    } else {
      await ensureUpload(m.id, true);
    }
  }

  // 3) Hết hạn link tải & đơn chờ thanh toán quá 3 ngày
  await db
    .update(downloadRequests)
    .set({ status: "expired" })
    .where(and(eq(downloadRequests.status, "ready"), lt(downloadRequests.expiresAt, new Date(now))));
  await db
    .update(orders)
    .set({ status: "expired" })
    .where(and(eq(orders.status, "pending"), lt(orders.createdAt, new Date(now - 3 * DAY))));

  // 4) Mẫu "failed" vẫn có người chờ: thử lại mỗi ngày
  const waitingFailed = await db
    .selectDistinct({ id: models.id })
    .from(models)
    .innerJoin(downloadRequests, eq(downloadRequests.modelId, models.id))
    .where(and(eq(models.r2Status, "failed"), inArray(downloadRequests.status, ["waiting_upload"])))
    .limit(50);
  for (const m of waitingFailed) await ensureUpload(m.id);

  console.log(
    `Cron: dọn ${candidates.length} file, đẩy lại ${stuck.length} job kẹt, thử lại ${waitingFailed.length} mẫu lỗi`,
  );
}
