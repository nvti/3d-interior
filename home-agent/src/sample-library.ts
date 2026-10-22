// Tạo thư viện mẫu giả để chạy thử local: cây danh mục, file mẫu (nội dung ngẫu nhiên), texture, ảnh preview.
// Không cần .env.
//
// Dùng: pnpm sample [thư-mục-đích]   (mặc định ./sample-library)
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { log } from "./lib.js";

type Sample = { path: string[]; folder: string; base: string; hue: number };

const SAMPLES: Sample[] = [
  { path: ["Nội thất", "Phòng khách", "Sofa"], folder: "[SF-001] Sofa module Japandi", base: "sofa_japandi_corona_max2021", hue: 30 },
  { path: ["Nội thất", "Phòng khách", "Sofa"], folder: "[SF-002] Sofa da Chesterfield", base: "chesterfield_vray_max2020", hue: 15 },
  { path: ["Nội thất", "Phòng khách", "Bàn trà"], folder: "[BT-001] Bàn trà gỗ óc chó tròn", base: "ban_tra_oc_cho_corona", hue: 25 },
  { path: ["Nội thất", "Phòng ngủ", "Giường"], folder: "[GN-001] Giường bọc nỉ tối giản", base: "giuong_ni_corona_max2022", hue: 210 },
  { path: ["Nội thất", "Phòng ăn", "Ghế ăn"], folder: "[GA-001] Ghế ăn Wishbone", base: "wishbone_vray", hue: 40 },
  { path: ["Đèn", "Đèn thả"], folder: "[DT-001] Đèn thả giấy Akari", base: "akari_corona", hue: 50 },
  { path: ["Trang trí", "Cây xanh"], folder: "[CX-001] Chậu cây bàng Singapore", base: "bang_singapore_corona", hue: 110 },
  { path: ["Trang trí", "Tranh"], folder: "[TR-001] Bộ tranh trừu tượng 3 tấm", base: "tranh_truu_tuong_vray", hue: 280 },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** Ảnh preview 1600×1200: nền màu, khối hình đơn giản, tiêu đề */
function previewSvg(title: string, hue: number, n: number): string {
  const bg = `hsl(${hue} 22% ${88 - n * 6}%)`;
  const fg = `hsl(${hue} 30% ${38 - n * 4}%)`;
  const w = 900 - n * 120;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200">
  <rect width="1600" height="1200" fill="${bg}"/>
  <rect x="0" y="860" width="1600" height="340" fill="hsl(${hue} 15% 70%)" opacity=".35"/>
  <rect x="${800 - w / 2}" y="${520 + n * 30}" width="${w}" height="${340 - n * 30}" rx="48" fill="${fg}"/>
  <rect x="${800 - w / 2 + 40}" y="${860}" width="24" height="70" fill="${fg}"/>
  <rect x="${800 + w / 2 - 64}" y="${860}" width="24" height="70" fill="${fg}"/>
  <text x="80" y="140" font-family="Helvetica, Arial, sans-serif" font-size="64" fill="${fg}">${esc(title)}</text>
  <text x="80" y="210" font-family="Helvetica, Arial, sans-serif" font-size="32" fill="${fg}" opacity=".7">Ảnh mẫu ${n + 1} · dữ liệu thử</text>
</svg>`;
}

async function main(): Promise<void> {
  const root = path.resolve(process.argv[2] || "./sample-library");
  for (const s of SAMPLES) {
    const dir = path.join(root, ...s.path, s.folder);
    await fsp.mkdir(path.join(dir, "maps"), { recursive: true });
    const title = s.folder.replace(/^\[[^\]]+\]\s*/, "");
    // file mẫu giả: nội dung ngẫu nhiên để file zip có dung lượng thật
    await fsp.writeFile(path.join(dir, `${s.base}.max`), crypto.randomBytes(300_000));
    await fsp.writeFile(path.join(dir, `${s.base}.fbx`), crypto.randomBytes(150_000));
    for (let n = 0; n < 3; n++) {
      await sharp(Buffer.from(previewSvg(title, s.hue, n)))
        .jpeg({ quality: 85 })
        .toFile(path.join(dir, `${String(n + 1).padStart(2, "0")}.jpg`));
    }
    await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 120, g: 90, b: 60 } } })
      .jpeg()
      .toFile(path.join(dir, "maps", "texture.jpg"));
    log("✓", path.relative(root, dir));
  }
  log(`Xong: ${SAMPLES.length} mẫu trong ${root}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
