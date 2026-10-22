// Việc admin giao ở /admin/library: "Quét mẫu mới" (liệt kê thư mục mẫu chưa có trên website)
// và nhập những mẫu đã chọn (ảnh preview + nội dung AI -> bản nháp). Chạy nền trong worker.
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { aiEnabled, describeModel } from "./describe.js";
import { api, errorMessage, folderSignature, loadState, log, saveState, sleep, walk } from "./lib.js";
import { makePreviews, modelFolder, upsertBody } from "./library.js";
import type { LibraryCandidate, LibraryTasks, ModelUpsertResult } from "./types.js";

const POLL_MS = 15_000;
// có file mới ghi trong khoảng này thì coi như đang chép dở – chưa cho nhập
const COPY_QUIET_MS = 2 * 60 * 1000;

async function scanCandidates(): Promise<LibraryCandidate[]> {
  const root = config.libraryRoot();
  const known = new Set(
    (await api<{ sku: string | null }[]>("/api/agent/models/index", undefined, "GET")).map((r) => r.sku),
  );
  const out: LibraryCandidate[] = [];
  await walk(root, async (dir, entries) => {
    const f = modelFolder(root, dir, entries.filter((e) => e.isFile()).map((e) => e.name));
    if (!f) return false;
    if (!f.categoryPath.length || known.has(f.sku)) return true;
    const sig = await folderSignature(dir);
    out.push({
      rel: f.rel,
      categoryPath: f.categoryPath,
      title: f.title,
      sku: f.sku,
      images: f.images.length,
      bytes: sig.bytes,
      formats: f.formats,
      copying: Date.now() - sig.changedMs < COPY_QUIET_MS,
    });
    return true;
  });
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

async function runScan(id: string): Promise<void> {
  await api(`/api/agent/library/scans/${id}`, { status: "running" });
  log("Quét mẫu mới theo yêu cầu từ trang admin…");
  try {
    const candidates = await scanCandidates();
    await api(`/api/agent/library/scans/${id}`, { status: "done", candidates });
    log(`Quét xong: ${candidates.length} mẫu chưa có trên website`);
  } catch (e) {
    log("✗ Quét lỗi:", errorMessage(e));
    await api(`/api/agent/library/scans/${id}`, { status: "failed", error: errorMessage(e) });
  }
}

async function importFolder(rel: string): Promise<string> {
  const root = config.libraryRoot();
  const dir = path.resolve(root, rel);
  if (!dir.startsWith(root + path.sep)) throw new Error(`Đường dẫn nằm ngoài thư viện: ${rel}`);
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => {
    throw new Error(`Thư mục không còn tồn tại: ${rel}`);
  });
  const f = modelFolder(root, dir, entries.filter((e) => e.isFile()).map((e) => e.name));
  if (!f) throw new Error("Thư mục không có file mẫu 3D");
  if (!f.categoryPath.length) throw new Error("Mẫu phải nằm trong ít nhất một thư mục danh mục");
  const sig = await folderSignature(dir);
  if (Date.now() - sig.changedMs < COPY_QUIET_MS) throw new Error("Thư mục vừa thay đổi – có thể đang chép dở, thử lại sau ít phút");

  log(`↓ Nhập ${f.sku} · ${f.title} · ${f.images.length} ảnh`);
  const images = await makePreviews(dir, f.images, f.sku);
  let ai;
  try {
    ai = await describeModel(dir, f);
  } catch (e) {
    // thiếu nội dung AI không chặn việc nhập – admin tự viết
    log(`  AI lỗi, nhập không kèm nội dung: ${errorMessage(e)}`);
  }
  const r = await api<ModelUpsertResult>("/api/agent/models", { ...upsertBody(f, sig, images, false), ai });
  const state = await loadState();
  state.models[f.fileKey] = { rel: f.rel, sku: f.sku, signature: sig.signature, modelId: r.modelId };
  await saveState(state);
  log(`✓ ${f.sku}: đã tạo bản nháp${ai ? " (kèm nội dung AI)" : ""}`);
  return r.modelId;
}

async function runImport(id: string, rel: string): Promise<void> {
  await api(`/api/agent/library/imports/${id}`, { status: "running" });
  try {
    const modelId = await importFolder(rel);
    await api(`/api/agent/library/imports/${id}`, { status: "done", modelId });
  } catch (e) {
    log("✗ Nhập lỗi", rel, errorMessage(e));
    await api(`/api/agent/library/imports/${id}`, { status: "failed", error: errorMessage(e) });
  }
}

/** Hỏi website định kỳ xem admin có giao việc quét/nhập không */
export async function libraryLoop(): Promise<void> {
  if (!aiEnabled()) log("Chưa có ANTHROPIC_API_KEY – mẫu nhập từ trang admin sẽ không kèm nội dung AI");
  for (;;) {
    try {
      const t = await api<LibraryTasks>("/api/agent/library/tasks", undefined, "GET");
      if (t.scan) await runScan(t.scan.id);
      for (const job of t.imports) await runImport(job.id, job.rel);
      if (t.scan || t.imports.length) continue; // còn việc thì hỏi tiếp ngay
    } catch (e) {
      log("Không lấy được việc nhập mẫu:", errorMessage(e));
    }
    await sleep(POLL_MS);
  }
}
