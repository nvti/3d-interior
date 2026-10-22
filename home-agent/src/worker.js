// Chạy liên tục trên máy nhà: kéo job từ Cloudflare Queue (HTTP pull),
// nén thư mục mẫu, upload lên bucket private, báo website gửi link cho khách.
//
// Dùng: npm run worker
import path from "node:path";
import fsp from "node:fs/promises";
import { config } from "./config.js";
import { api, headSize, loadState, log, putObject, sleep, zipFolder } from "./lib.js";

const VISIBILITY_MS = 30 * 60 * 1000; // phải đủ để nén + upload mẫu lớn nhất

async function queueCall(action, body) {
  const q = config.queue();
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${q.accountId}/queues/${q.queueId}/messages/${action}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${q.apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(`Queue ${action} ${res.status}: ${JSON.stringify(data.errors ?? data).slice(0, 300)}`);
  return data.result;
}

function parseBody(raw) {
  if (raw && typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(Buffer.from(String(raw), "base64").toString("utf8"));
  }
}

async function handle(job, state) {
  const { modelsBucket } = config.r2();
  const entry = state.models[job.fileKey];
  if (!entry) throw Object.assign(new Error(`Không tìm thấy thư mục cho ${job.fileKey} – chạy lại "npm run scan"`), { fatal: true });
  const dir = path.join(config.libraryRoot(), entry.rel);
  try {
    await fsp.access(dir);
  } catch {
    throw Object.assign(new Error(`Thư mục không còn tồn tại: ${entry.rel}`), { fatal: true });
  }

  const tmp = path.join(config.workDir(), "tmp", job.fileKey);
  log(`↻ ${entry.sku}: nén ${entry.rel}`);
  const z = await zipFolder(dir, tmp);
  log(`  ${(z.size / 1e6).toFixed(1)} MB – đang upload…`);
  try {
    await putObject(modelsBucket, job.fileKey, (await import("node:fs")).createReadStream(z.file), "application/zip");
    process.stdout.write("\n");
    const remote = await headSize(modelsBucket, job.fileKey);
    if (remote !== z.size) throw new Error(`Dung lượng trên R2 (${remote}) khác file local (${z.size})`);
    const r = await api("/api/agent/uploaded", { modelId: job.modelId, sizeBytes: z.size, sha256: z.sha256 });
    log(`✓ ${entry.sku}: xong, đã báo ${r.notified} khách`);
  } finally {
    await fsp.rm(z.file, { force: true });
  }
}

async function main() {
  log("Tool máy nhà đang chạy – chờ job upload…");
  let idle = 0;
  for (;;) {
    let messages = [];
    try {
      const r = await queueCall("pull", { batch_size: 1, visibility_timeout_ms: VISIBILITY_MS });
      messages = r?.messages ?? [];
    } catch (e) {
      log("Không kéo được job:", e.message);
      await sleep(30_000);
      continue;
    }
    if (!messages.length) {
      idle = Math.min(idle + 1, 6);
      await sleep(5_000 * idle); // chờ lâu dần khi rảnh: 5s → 30s
      continue;
    }
    idle = 0;
    const state = await loadState(); // đọc lại mỗi lần để thấy kết quả scan mới
    for (const m of messages) {
      let job;
      try {
        job = parseBody(m.body);
        await handle(job, state);
        await queueCall("ack", { acks: [{ lease_id: m.lease_id }], retries: [] });
      } catch (e) {
        log("✗ LỖI:", e.message);
        if (e.fatal || (m.attempts ?? 0) >= 8) {
          if (job?.modelId) await api("/api/agent/upload-failed", { modelId: job.modelId, reason: e.message }).catch(() => {});
          await queueCall("ack", { acks: [{ lease_id: m.lease_id }], retries: [] }).catch(() => {});
        } else {
          await queueCall("ack", { acks: [], retries: [{ lease_id: m.lease_id, delay_seconds: 120 }] }).catch(() => {});
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
