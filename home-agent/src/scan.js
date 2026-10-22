// Quét thư viện trên ổ cứng -> tạo ảnh preview WebP -> đăng mẫu lên website.
// Không nén/upload file mẫu ở bước này: file chỉ được nén & đẩy lên R2 khi có người mua (xem worker.js).
//
// Quy ước thư mục:
//   LIBRARY_ROOT/Nội thất/Phòng khách/Sofa/[SF-014] Sofa module Japandi/
//       ├── sofa.max, sofa.fbx        <- có file mẫu => đây là một mẫu
//       ├── preview-01.jpg ...        <- ảnh preview (ở ngay thư mục mẫu)
//       └── maps/...                  <- texture (không dùng làm preview)
//   Thư mục cha = cây danh mục. Tên thư mục mẫu = tiêu đề; mã trong [..] = SKU (không có thì tự sinh).
//
// Dùng: npm run scan -- [--publish] [--dry-run] [--limit 50] [--only "Nội thất/Phòng khách"]
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { config, IMAGE_EXTS, MODEL_EXTS, TEXTURE_DIRS } from "./config.js";
import { api, folderSignature, loadState, log, putObject, saveState, slugify, walk } from "./lib.js";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const PUBLISH = flag("publish");
const DRY = flag("dry-run");
const FORCE = flag("force");
const LIMIT = Number(opt("limit")) || Infinity;
const ONLY = opt("only");

const WIDTHS = [400, 1200, 2000];

function parseFolderName(name, rel) {
  const m = name.match(/^\s*\[([^\]]+)\]\s*(.+)$/) || name.match(/^\s*([A-Z]{1,5}-?\d{2,6})\s*[-_.]\s*(.+)$/);
  const title = (m ? m[2] : name).replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const sku = m ? m[1].trim() : "M-" + crypto.createHash("sha1").update(rel).digest("hex").slice(0, 8).toUpperCase();
  return { title, sku };
}

function detectEngine(names) {
  const s = names.join(" ").toLowerCase();
  if (s.includes("corona")) return "corona";
  if (s.includes("vray") || s.includes("v-ray")) return "vray";
  return undefined;
}

function detectMaxVersion(names) {
  const m = names.join(" ").match(/(?:max|3dsmax)[\s_-]?(20\d{2})/i);
  return m ? m[1] : undefined;
}

async function makePreviews(dir, imageFiles, sku) {
  const out = [];
  const { mediaBucket } = config.r2();
  for (const [i, f] of imageFiles.slice(0, 8).entries()) {
    const src = sharp(path.join(dir, f), { failOn: "none" }).rotate();
    const meta = await src.metadata();
    const variants = {};
    let largest = "";
    for (const w of WIDTHS) {
      if (w > (meta.width ?? 0) * 1.1 && w !== WIDTHS[0]) continue;
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

async function main() {
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
    if (parts.length < 2) {
      log("bỏ qua (mẫu phải nằm trong ít nhất một thư mục danh mục):", rel);
      return true;
    }
    const { title, sku } = parseFolderName(parts.at(-1), rel);
    const categoryPath = parts.slice(0, -1);
    const fileKey = [...categoryPath.map(slugify), `${slugify(sku)}-${slugify(title)}.zip`].join("/");

    try {
      const sig = await folderSignature(dir);
      const prev = state.models[fileKey];
      if (prev && prev.signature === sig.signature && !FORCE) {
        skipped++;
        return true;
      }
      const images = files.filter((f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase())).sort((a, b) => a.localeCompare(b));
      const formats = [...new Set(modelFiles.map((f) => path.extname(f).toLowerCase()))];
      log(`${DRY ? "[thử] " : ""}${sku} · ${title} · ${categoryPath.join(" / ")} · ${images.length} ảnh · ${(sig.bytes / 1e6).toFixed(0)} MB`);

      // ảnh preview chỉ tạo khi mẫu mới (admin có thể đã chỉnh ảnh trên web)
      const previews = prev ? [] : await makePreviews(dir, images, sku);
      if (!DRY) {
        const r = await api("/api/agent/models", {
          sku,
          title,
          categoryPath,
          fileKey,
          fileSizeBytes: sig.bytes,
          fileSha256: sig.signature, // chữ ký thư mục; sha thật của zip được gửi lại khi upload
          formats,
          renderEngine: detectEngine([...files, ...parts]),
          maxVersion: detectMaxVersion([...files, ...parts]),
          images: previews,
          publish: PUBLISH,
        });
        state.models[fileKey] = { rel, sku, signature: sig.signature, modelId: r.modelId };
        if (done % 20 === 0) await saveState(state);
      }
      done++;
    } catch (e) {
      failed++;
      log("LỖI", rel, e.message);
    }
    return true;
  });

  if (!DRY) await saveState(state);
  log(`Xong: ${done} mẫu đã đăng/cập nhật, ${skipped} không đổi, ${failed} lỗi.`);
  if (!PUBLISH && done) log("Mẫu mới ở trạng thái Bản nháp – duyệt và xuất bản trong /admin/models (hoặc chạy lại với --publish).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

