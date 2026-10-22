// Tiện ích dùng chung cho cả client và server

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Bỏ dấu tiếng Việt – dùng cho tìm kiếm không dấu */
export function stripDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

const vnd = new Intl.NumberFormat("vi-VN");

export function formatPrice(priceVnd: number): string {
  if (!priceVnd) return "Miễn phí";
  return `${vnd.format(priceVnd)}đ`;
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(d?: Date | number | string | null): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function padNo(n: number, len = 3) {
  return String(n).padStart(len, "0");
}

export const RENDER_ENGINES: Record<string, string> = {
  vray: "V-Ray",
  corona: "Corona",
  other: "Khác",
};

export const STYLES = [
  "Hiện đại",
  "Japandi",
  "Indochine",
  "Bắc Âu",
  "Tân cổ điển",
  "Công nghiệp",
  "Wabi-sabi",
];

export const FORMATS = [".max", ".fbx", ".obj", ".skp", ".gltf"];
