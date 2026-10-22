// Resize ảnh ngay trong trình duyệt thành nhiều kích thước WebP rồi upload lên bucket public.
const WIDTHS = [400, 1200, 2000] as const;

async function toWebp(bitmap: ImageBitmap, width: number): Promise<Blob> {
  const scale = Math.min(1, width / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không chuyển được sang WebP"))), "image/webp", 0.86),
  );
}

export type UploadedMedia = { id: string; url: string; thumbUrl: string; variants: Record<string, string> };

export async function uploadImage(file: File, alt = ""): Promise<UploadedMedia> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} không phải ảnh`);
  const bitmap = await createImageBitmap(file);
  const form = new FormData();
  // luôn có ít nhất một biến thể; bỏ các kích thước lớn hơn ảnh gốc
  const widths = WIDTHS.filter((w, i) => i === 0 || w <= bitmap.width * 1.1);
  for (const w of widths) form.append(`file_${w}`, await toWebp(bitmap, w), `${w}.webp`);
  form.set("width", String(bitmap.width));
  form.set("height", String(bitmap.height));
  form.set("alt", alt);
  bitmap.close();
  const res = await fetch("/api/admin/media", { method: "POST", body: form });
  const data = (await res.json()) as UploadedMedia & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Upload thất bại");
  return data;
}

/** Ảnh truy vấn cho tìm bằng ảnh: thu nhỏ còn 336px, JPEG (Typesense/CLIP không đọc WebP), trả về base64 */
export async function imageToSearchJpeg(file: File): Promise<{ base64: string; dataUrl: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Hãy chọn một file ảnh");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 336 / Math.min(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas");
  ctx.fillStyle = "#fff"; // ảnh PNG trong suốt -> nền trắng như ảnh preview
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), dataUrl };
}
