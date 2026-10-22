// Nhúng ảnh preview vào Typesense (CLIP) cho tìm bằng ảnh.
// Website ghi cover_url vào mỗi tài liệu; ở đây tải ảnh đó, đổi sang JPEG (Typesense không đọc WebP)
// rồi cập nhật trường image -> Typesense tự sinh image_embedding. image_key = URL đã nhúng,
// nên chỉ mẫu đổi ảnh đại diện (hoặc collection vừa tạo lại) mới phải nhúng lại.
import sharp from "sharp";
import { config } from "./config.js";
import { errorMessage, log } from "./lib.js";

type Doc = { id: string; cover_url?: string; image_key?: string };

export type ImageSyncResult = { embedded: number; failed: number; total: number };

export async function syncImages({ force = false } = {}): Promise<ImageSyncResult> {
  const ts = config.typesense();
  const base = `${ts.url}/collections/${ts.collection}/documents`;
  const H = { "X-TYPESENSE-API-KEY": ts.apiKey, "Content-Type": "application/json" };

  const res = await fetch(`${base}/export?include_fields=id,cover_url,image_key`, { headers: H });
  if (!res.ok) throw new Error(`Typesense export ${res.status}: ${await res.text()}`);
  const docs = (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Doc);
  const todo = docs.filter((d) => d.cover_url && (force || d.cover_url !== d.image_key));

  let embedded = 0;
  let failed = 0;
  for (const d of todo) {
    try {
      const img = await fetch(d.cover_url!, { signal: AbortSignal.timeout(30_000) });
      if (!img.ok) throw new Error(`tải ảnh ${img.status}`);
      // CLIP chỉ cần 224px; giữ 336px để cắt giữa không mất chi tiết
      const jpg = await sharp(Buffer.from(await img.arrayBuffer()), { failOn: "none" })
        .resize(336, 336, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 85 })
        .toBuffer();
      const r = await fetch(`${base}/${encodeURIComponent(d.id)}`, {
        method: "PATCH",
        headers: H,
        body: JSON.stringify({ image: jpg.toString("base64"), image_key: d.cover_url }),
      });
      if (!r.ok) throw new Error(`Typesense cập nhật ${r.status}: ${await r.text()}`);
      embedded++;
    } catch (e) {
      failed++;
      log(`✗ ảnh ${d.id}:`, errorMessage(e));
    }
  }
  return { embedded, failed, total: docs.length };
}

/** Chạy nền trong worker: nhúng ảnh mẫu mới/đổi ảnh định kỳ */
export async function imageSyncLoop(intervalMs = 10 * 60 * 1000): Promise<void> {
  if (!process.env.TYPESENSE_API_KEY) return;
  for (;;) {
    try {
      const r = await syncImages();
      if (r.embedded || r.failed) log(`Ảnh tìm kiếm: nhúng ${r.embedded}, lỗi ${r.failed}`);
    } catch (e) {
      log("Không nhúng được ảnh (Typesense đã chạy chưa?):", errorMessage(e));
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
