// Quét thư viện trên ổ cứng -> tạo ảnh preview WebP -> đăng mẫu lên website.
// Không nén/upload file mẫu ở bước này: file chỉ được nén & đẩy lên R2 khi có người mua (xem worker.ts).
//
// Quy ước thư mục:
//   LIBRARY_ROOT/Nội thất/Phòng khách/Sofa/[SF-014] Sofa module Japandi/
//       ├── sofa.max, sofa.fbx        <- có file mẫu => đây là một mẫu
//       ├── preview-01.jpg ...        <- ảnh preview (ở ngay thư mục mẫu)
//       └── maps/...                  <- texture (không dùng làm preview)
//   Thư mục cha = cây danh mục. Tên thư mục mẫu = tiêu đề; mã trong [..] = SKU (không có thì tự sinh).
//
// Dùng: pnpm scan [--publish] [--dry-run] [--force] [--limit 50] [--only "Nội thất/Phòng khách"]
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { config, IMAGE_EXTS, MODEL_EXTS } from "./config.js";
import { api, errorMessage, folderSignature, loadState, log, putObject, saveState, slugify, walk } from "./lib.js";
import type { ModelUpsert, ModelUpsertResult, PreviewImage, RenderEngine } from "./types.js";

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

const WIDTHS = [400, 1200, 2000] as const;
const MAX_PREVIEWS = 8;

export function parseFolderName(name: string, rel: string): { title: string; sku: string } {
  const m = name.match(/^\s*\[([^\]]+)\]\s*(.+)$/) ?? name.match(/^\s*([A-Z]{1,5}-?\d{2,6})\s*[-_.]\s*(.+)$/);
  const raw = m?.[2] ?? name;
  const title = raw.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  const sku = m?.[1]?.trim() ?? "M-" + crypto.createHash("sha1").update(rel).digest("hex").slice(0, 8).toUpperCase();
  return { title, sku };
}

function detectEngine(names: string[]): RenderEngine | undefined {
  const s = names.join(" ").toLowerCase();
  if (s.includes("corona")) return "corona";
  if (s.includes("vray") || s.includes("v-ray")) return "vray";
  return undefined;
}

function detectMaxVersion(names: string[]): string | undefined {
  return names.join(" ").match(/(?:max|3dsmax)[\s_-]?(20\d{2})/i)?.[1];
}

async function makePreviews(dir: string, imageFiles: string[], sku: string): Promise<PreviewImage[]> {
  const out: PreviewImage[] = [];
  const { mediaBucket } = config.r2();
  for (const [i, f] of imageFiles.slice(0, MAX_PREVIEWS).entries()) {
    const src = sharp(path.join(dir, f), { failOn: "none" }).rotate();
    const meta = await src.metadata();
    const variants: Record<string, string> = {};
    let largest = "";
    for (const w of WIDTHS) {
      if (w !== WIDTHS[0] && w > (meta.width ?? 0) * 1.1) continue; // không phóng to ảnh nhỏ
      const buf = await src.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
      const key = `m/agent/${slugify(sku)}/${String(i + 1).padStart(2, "0")}-${w}.webp`;
      if (!DRY) await putObject(mediaBucket, key, buf, "image/webp", "public, max-age=31536000, immutable");
      variants[String(w)] = key;
      largest = key;
    }
    out.push({ key: largest, variants, width: meta.width, height: meta.height, mimeType: "image/webp" });
  }
  return out;
}

async function main(): Promise<void> {
  const root = config.libraryRoot();
  const state = await loadState();
  const start = ONLY ? path.join(root, ONLY) : root;
  let done = 0;
  let skipped = 0;
  let failed = 0;

  await walk(start, async (dir, entries) => {
    if (done >= LIMIT) return true;
    const files = entries.filter((e) => e.isFile()).map((e) => e.name);
    const modelFiles = files.filter((f) => MODEL_EXTS.includes(path.extname(f).toLowerCase()));
    if (!modelFiles.length) return false; // chưa phải thư mục mẫu, đi sâu tiếp

    const rel = path.relative(root, dir);
    const parts = rel.split(path.sep);
    const folderName = parts.at(-1);
    if (parts.length < 2 || !folderName) {
      log("bỏ qua (mẫu phải nằm trong ít nhất một thư mục danh mục):", rel);
      return true;
    }
    const { title, sku } = parseFolderName(folderName, rel);
    const categoryPath = parts.slice(0, -1);
    // key ASCII để link tải không bị lỗi mã hoá
    const fileKey = [...categoryPath.map(slugify), `${slugify(sku)}-${slugify(title)}.zip`].join("/");

    try {
      const sig = await folderSignature(dir);
      const prev = state.models[fileKey];
      if (prev && prev.signature === sig.signature && !FORCE) {
        skipped++;
        return true;
      }
      const images = files
        .filter((f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
        .sort((a, b) => a.localeCompare(b));
      const formats = [...new Set(modelFiles.map((f) => path.extname(f).toLowerCase()))];
      log(
        `${DRY ? "[thử] " : ""}${sku} · ${title} · ${categoryPath.join(" / ")} · ${images.length} ảnh · ${(sig.bytes / 1e6).toFixed(0)} MB`,
      );

      // ảnh preview chỉ tạo khi mẫu mới (admin có thể đã chỉnh ảnh trên web)
      const previews = prev ? [] : await makePreviews(dir, images, sku);
      if (!DRY) {
        const body: ModelUpsert = {
          sku,
          title,
          categoryPath,
          fileKey,
          fileSizeBytes: sig.bytes,
          fileSha256: sig.signature, // chữ ký thư mục; dung lượng zip thật được gửi lại khi upload
          formats,
          renderEngine: detectEngine([...files, ...parts]),
          maxVersion: detectMaxVersion([...files, ...parts]),
          images: previews,
          publish: PUBLISH,
        };
        const r = await api<ModelUpsertResult>("/api/agent/models", body);
        state.models[fileKey] = { rel, sku, signature: sig.signature, modelId: r.modelId };
        if (done % 20 === 0) await saveState(state);
      }
      done++;
    } catch (e) {
      failed++;
      log("LỖI", rel, errorMessage(e));
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
