// Nhận diện thư mục mẫu và tạo ảnh preview – dùng chung cho "pnpm scan" và việc nhập mẫu từ trang admin.
//
// Quy ước thư mục:
//   LIBRARY_ROOT/Nội thất/Phòng khách/Sofa/[SF-014] Sofa module Japandi/
//       ├── sofa.max, sofa.fbx        <- có file mẫu => đây là một mẫu
//       ├── preview-01.jpg ...        <- ảnh preview (ở ngay thư mục mẫu)
//       └── maps/...                  <- texture (không dùng làm preview)
//   Thư mục cha = cây danh mục. Tên thư mục mẫu = tiêu đề; mã trong [..] = SKU (không có thì tự sinh).
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { config, IMAGE_EXTS, MODEL_EXTS } from "./config.js";
import { putObject, slugify, type FolderSignature } from "./lib.js";
import type { ModelUpsert, PreviewImage, RenderEngine } from "./types.js";

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

export type ModelFolder = {
  rel: string;
  categoryPath: string[]; // rỗng = mẫu nằm ngay gốc thư viện (không hợp lệ)
  title: string;
  sku: string;
  fileKey: string;
  modelFiles: string[];
  images: string[]; // ảnh preview, theo thứ tự tên file
  formats: string[];
  renderEngine?: RenderEngine;
  maxVersion?: string;
};

/** Thư mục có ít nhất một file mẫu 3D thì là một mẫu; không thì trả về undefined */
export function modelFolder(root: string, dir: string, files: string[]): ModelFolder | undefined {
  const modelFiles = files.filter((f) => MODEL_EXTS.includes(path.extname(f).toLowerCase()));
  if (!modelFiles.length) return undefined;
  const rel = path.relative(root, dir);
  // macOS có thể trả tên file dạng NFD – chuẩn hoá để tên danh mục/tiêu đề khớp với chữ gõ trên web
  const parts = rel.split(path.sep).map((p) => p.normalize("NFC"));
  const { title, sku } = parseFolderName(parts.at(-1) ?? "", rel);
  const categoryPath = parts.slice(0, -1);
  return {
    rel,
    categoryPath,
    title,
    sku,
    // key ASCII để link tải không bị lỗi mã hoá
    fileKey: [...categoryPath.map(slugify), `${slugify(sku)}-${slugify(title)}.zip`].join("/"),
    modelFiles,
    images: files.filter((f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase())).sort((a, b) => a.localeCompare(b)),
    formats: [...new Set(modelFiles.map((f) => path.extname(f).toLowerCase()))],
    renderEngine: detectEngine([...files, ...parts]),
    maxVersion: detectMaxVersion([...files, ...parts]),
  };
}

/** Tạo các cỡ WebP cho tối đa 8 ảnh đầu và upload lên bucket public */
export async function makePreviews(dir: string, imageFiles: string[], sku: string, dry = false): Promise<PreviewImage[]> {
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
      if (!dry) await putObject(mediaBucket, key, buf, "image/webp", "public, max-age=31536000, immutable");
      variants[String(w)] = key;
      largest = key;
    }
    out.push({ key: largest, variants, width: meta.width, height: meta.height, mimeType: "image/webp" });
  }
  return out;
}

export function upsertBody(f: ModelFolder, sig: FolderSignature, images: PreviewImage[], publish: boolean): ModelUpsert {
  return {
    sku: f.sku,
    title: f.title,
    categoryPath: f.categoryPath,
    fileKey: f.fileKey,
    fileSizeBytes: sig.bytes,
    fileSha256: sig.signature, // chữ ký thư mục; dung lượng zip thật được gửi lại khi upload
    formats: f.formats,
    renderEngine: f.renderEngine,
    maxVersion: f.maxVersion,
    images,
    publish,
  };
}
