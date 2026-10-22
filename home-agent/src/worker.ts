// Chạy liên tục trên máy nhà: kéo job từ Cloudflare Queue (HTTP pull; R2_MODE=local: hỏi website local),
// nén thư mục mẫu, upload lên bucket private, báo website gửi link cho khách.
//
// Dùng: pnpm worker
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { api, errorMessage, headSize, loadState, log, putObject, sleep, zipFolder } from "./lib.js";
import type { AgentState, PulledMessage, UploadJob } from "./types.js";

const VISIBILITY_MS = 30 * 60 * 1000; // phải đủ để nén + upload mẫu lớn nhất
const MAX_ATTEMPTS = 8;

/** Lỗi không thể thử lại (thư mục không còn...) */
class FatalJobError extends Error {}

type CfResponse<T> = { success?: boolean; errors?: unknown; result?: T };

async function queueCall<T>(action: "pull" | "ack", body: unknown): Promise<T | undefined> {
  const q = config.queue();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${q.accountId}/queues/${q.queueId}/messages/${action}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${q.apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json().catch(() => ({}))) as CfResponse<T>;
  if (!res.ok || data.success === false) {
    throw new Error(`Queue ${action} ${res.status}: ${JSON.stringify(data.errors ?? data).slice(0, 300)}`);
  }
  return data.result;
}

const ack = (leaseId: string) => queueCall("ack", { acks: [{ lease_id: leaseId }], retries: [] });
const retryLater = (leaseId: string, delaySeconds: number) =>
  queueCall("ack", { acks: [], retries: [{ lease_id: leaseId, delay_seconds: delaySeconds }] });

/** Body từ HTTP pull có thể là object, chuỗi JSON, hoặc base64 */
export function parseJob(raw: unknown): UploadJob {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      v = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    }
  }
  const j = v as Partial<UploadJob>;
  if (!j || typeof j.modelId !== "string" || typeof j.fileKey !== "string") {
    throw new FatalJobError(`Job không hợp lệ: ${JSON.stringify(raw).slice(0, 200)}`);
  }
  return { modelId: j.modelId, fileKey: j.fileKey, sha256: j.sha256 ?? null, sizeBytes: j.sizeBytes ?? null };
}

async function handle(job: UploadJob, state: AgentState): Promise<void> {
  const { modelsBucket } = config.r2();
  const entry = state.models[job.fileKey];
  if (!entry) throw new FatalJobError(`Không tìm thấy thư mục cho ${job.fileKey} – chạy lại "pnpm scan"`);
  const dir = path.join(config.libraryRoot(), entry.rel);
  try {
    await fsp.access(dir);
  } catch {
    throw new FatalJobError(`Thư mục không còn tồn tại: ${entry.rel}`);
  }

  const tmp = path.join(config.workDir(), "tmp", job.fileKey);
  log(`↻ ${entry.sku}: nén ${entry.rel}`);
  const z = await zipFolder(dir, tmp);
  log(`  ${(z.size / 1e6).toFixed(1)} MB – đang upload…`);
  try {
    await putObject(modelsBucket, job.fileKey, fs.createReadStream(z.file), "application/zip");
    process.stdout.write("\n");
    const remote = await headSize(modelsBucket, job.fileKey);
    if (remote !== z.size) throw new Error(`Dung lượng trên R2 (${remote}) khác file local (${z.size})`);
    const r = await api<{ notified: number }>("/api/agent/uploaded", {
      modelId: job.modelId,
      sizeBytes: z.size,
      sha256: z.sha256,
    });
    log(`✓ ${entry.sku}: xong, đã báo ${r.notified} khách`);
  } finally {
    await fsp.rm(z.file, { force: true });
  }
}

/** R2_MODE=local: lấy job từ website local (mẫu đang 'uploading' trong D1) thay cho Cloudflare Queue */
async function localLoop(): Promise<void> {
  log(`Chế độ local – lấy job upload từ ${config.siteUrl()}…`);
  for (;;) {
    let jobs: UploadJob[] = [];
    try {
      jobs = await api<UploadJob[]>("/api/dev/upload-jobs", undefined, "GET");
    } catch (e) {
      log("Không lấy được job (website local đã chạy chưa?):", errorMessage(e));
      await sleep(5_000);
      continue;
    }
    const state = await loadState();
    for (const job of jobs) {
      try {
        await handle(job, state);
      } catch (e) {
        log("✗ LỖI:", errorMessage(e));
        await api("/api/agent/upload-failed", { modelId: job.modelId, reason: errorMessage(e) }).catch(() => {});
      }
    }
    if (!jobs.length) await sleep(3_000);
  }
}

async function main(): Promise<void> {
  if (config.localMode()) return localLoop();
  log("Tool máy nhà đang chạy – chờ job upload…");
  let idle = 0;
  for (;;) {
    let messages: PulledMessage[] = [];
    try {
      const r = await queueCall<{ messages?: PulledMessage[] }>("pull", {
        batch_size: 1,
        visibility_timeout_ms: VISIBILITY_MS,
      });
      messages = r?.messages ?? [];
    } catch (e) {
      log("Không kéo được job:", errorMessage(e));
      await sleep(30_000);
      continue;
    }
    if (!messages.length) {
      idle = Math.min(idle + 1, 6);
      await sleep(5_000 * idle); // rảnh thì chờ lâu dần: 5s → 30s
      continue;
    }
    idle = 0;
    const state = await loadState(); // đọc lại mỗi lần để thấy kết quả scan mới
    for (const m of messages) {
      let job: UploadJob | undefined;
      try {
        job = parseJob(m.body);
        await handle(job, state);
        await ack(m.lease_id);
      } catch (e) {
        log("✗ LỖI:", errorMessage(e));
        const giveUp = e instanceof FatalJobError || (m.attempts ?? 0) >= MAX_ATTEMPTS;
        if (giveUp) {
          if (job) await api("/api/agent/upload-failed", { modelId: job.modelId, reason: errorMessage(e) }).catch(() => {});
          await ack(m.lease_id).catch(() => {});
        } else {
          await retryLater(m.lease_id, 120).catch(() => {});
        }
      }
    }
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
