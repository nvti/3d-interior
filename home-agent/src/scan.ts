// Quét thư viện trên ổ cứng -> tạo ảnh preview WebP -> đăng mẫu lên website.
// Không nén/upload file mẫu ở bước này: file chỉ được nén & đẩy lên R2 khi có người mua (xem worker.ts).
// Quy ước thư mục: xem library.ts. Muốn chọn từng mẫu để nhập (kèm nội dung AI) thì dùng /admin/library.
//
// Dùng: pnpm scan [--publish] [--dry-run] [--force] [--limit 50] [--only "Nội thất/Phòng khách"]
import path from "node:path";
import { config } from "./config.js";
import { api, errorMessage, folderSignature, loadState, log, saveState, walk } from "./lib.js";
import { makePreviews, modelFolder, upsertBody } from "./library.js";
import type { ModelUpsertResult } from "./types.js";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string): string | undefined => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const PUBLISH = flag("publish");
const DRY = flag("dry-run");
const FORCE = flag("force");
const LIMIT = Number(opt("limit")) || Infinity;
const ONLY = opt("only");

async function main(): Promise<void> {
  const root = config.libraryRoot();
  const state = await loadState();
  const start = ONLY ? path.join(root, ONLY) : root;
  let done = 0;
  let skipped = 0;
  let failed = 0;

  await walk(start, async (dir, entries) => {
    if (done >= LIMIT) return true;
    const f = modelFolder(root, dir, entries.filter((e) => e.isFile()).map((e) => e.name));
    if (!f) return false; // chưa phải thư mục mẫu, đi sâu tiếp
    if (!f.categoryPath.length) {
      log("bỏ qua (mẫu phải nằm trong ít nhất một thư mục danh mục):", f.rel);
      return true;
    }

    try {
      const sig = await folderSignature(dir);
      const prev = state.models[f.fileKey];
      if (prev && prev.signature === sig.signature && !FORCE) {
        skipped++;
        return true;
      }
      log(
        `${DRY ? "[thử] " : ""}${f.sku} · ${f.title} · ${f.categoryPath.join(" / ")} · ${f.images.length} ảnh · ${(sig.bytes / 1e6).toFixed(0)} MB`,
      );

      // ảnh preview chỉ tạo khi mẫu mới (admin có thể đã chỉnh ảnh trên web)
      const previews = prev ? [] : await makePreviews(dir, f.images, f.sku, DRY);
      if (!DRY) {
        const r = await api<ModelUpsertResult>("/api/agent/models", upsertBody(f, sig, previews, PUBLISH));
        state.models[f.fileKey] = { rel: f.rel, sku: f.sku, signature: sig.signature, modelId: r.modelId };
        if (done % 20 === 0) await saveState(state);
      }
      done++;
    } catch (e) {
      failed++;
      log("LỖI", f.rel, errorMessage(e));
    }
    return true;
  });

  if (!DRY) await saveState(state);
  log(`Xong: ${done} mẫu đã đăng/cập nhật, ${skipped} không đổi, ${failed} lỗi.`);
  if (!PUBLISH && done && !DRY) {
    log("Mẫu mới ở trạng thái Bản nháp – duyệt và xuất bản trong /admin/models (hoặc chạy lại với --publish).");
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
