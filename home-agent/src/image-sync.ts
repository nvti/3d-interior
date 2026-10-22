// Nhúng ảnh preview của các mẫu vào Typesense (CLIP) cho tìm bằng ảnh. Worker cũng tự chạy việc này định kỳ.
//
// Dùng: pnpm typesense:images [--force]   (--force: nhúng lại tất cả)
import { log } from "./lib.js";
import { syncImages } from "./images.js";

syncImages({ force: process.argv.includes("--force") })
  .then((r) => log(`Xong: nhúng ${r.embedded} ảnh, ${r.failed} lỗi (collection có ${r.total} mẫu).`))
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
