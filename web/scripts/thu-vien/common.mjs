// Dùng chung cho describe.mjs và build-sql.mjs
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = process.env.SRC ?? path.resolve(here, "../../../THU VIEN");
export const OUT_DIR = process.env.OUT ?? path.join(here, "out");
export const R2_PREFIX = "thu-vien";

// giữ khớp với STYLES trong app/lib/format.ts
export const STYLES = ["Hiện đại", "Japandi", "Indochine", "Bắc Âu", "Tân cổ điển", "Công nghiệp", "Wabi-sabi"];

const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Toàn bộ ảnh preview, sắp theo đường dẫn. id ổn định theo đường dẫn tương đối. */
export async function listImages() {
  const out = [];
  for (const folder of (await fs.readdir(SRC_DIR, { withFileTypes: true })).filter((d) => d.isDirectory())) {
    for (const name of await fs.readdir(path.join(SRC_DIR, folder.name))) {
      const ext = name.split(".").pop().toLowerCase();
      if (!MIME[ext]) continue;
      const rel = `${folder.name}/${name}`;
      out.push({
        id: crypto.createHash("sha1").update(rel).digest("hex").slice(0, 16),
        rel,
        file: path.join(SRC_DIR, rel),
        folder: folder.name,
        baseName: name.replace(/\.[^.]+$/, ""),
        mimeType: MIME[ext],
        // giống upload-thu-vien.sh: API Cloudflare chặn ".." nên key gộp thành "."
        r2Key: `${R2_PREFIX}/${rel}`.replace(/\.{2,}/g, "."),
      });
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}
