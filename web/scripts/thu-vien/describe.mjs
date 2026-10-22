// Bước 1: nhìn từng ảnh preview trong "THU VIEN" bằng Claude Haiku, sinh nội dung mẫu (tiếng Việt).
// Kết quả mỗi ảnh lưu ở scripts/thu-vien/out/<id>.json – chạy lại sẽ bỏ qua ảnh đã xong.
//
//   ANTHROPIC_API_KEY=... node scripts/thu-vien/describe.mjs              # toàn bộ
//   LIMIT=10 node scripts/thu-vien/describe.mjs                            # thử 10 ảnh
//   CONCURRENCY=8 ONLY="FURNITURE - SOFA" node scripts/thu-vien/describe.mjs
//   MOCK=1 node scripts/thu-vien/describe.mjs                              # không gọi API (thử pipeline)
import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import { categoryPathFor } from "./categories.mjs";
import { listImages, OUT_DIR, STYLES } from "./common.mjs";

const MODEL = "claude-haiku-5-5";
const CONCURRENCY = Number(process.env.CONCURRENCY) || 6;
const LIMIT = Number(process.env.LIMIT) || Infinity;
const ONLY = process.env.ONLY;
const MOCK = !!process.env.MOCK;

const ModelText = z.object({
  title: z.string().describe("Tên mẫu tiếng Việt, tối đa 60 ký tự, chỉ viết hoa chữ đầu và tên riêng (vd: Bộ phụ kiện phòng tắm Meir Black)"),
  subtitle: z.string().describe("Một câu ngắn gợi tinh thần/cảm xúc của mẫu"),
  description: z.string().describe("2 câu, 140–200 ký tự, dùng làm mô tả ngắn và meta description"),
  paragraphs: z.array(z.string()).describe("3 đoạn: hình dáng & chi tiết; vật liệu & màu sắc; gợi ý không gian sử dụng"),
  highlights: z.array(z.string()).describe("3–5 điểm nổi bật ngắn gọn"),
  tags: z.array(z.string()).describe("8–12 từ khoá tiếng Việt viết thường: loại đồ, vật liệu, màu, phong cách, phòng"),
  keywords_en: z.array(z.string()).describe("4–6 từ khoá tiếng Anh viết thường để khách tìm bằng tiếng Anh"),
  render_engine: z.enum(["vray", "corona", "both", "unknown"]).describe("Theo logo V-Ray/Corona in trên ảnh; không thấy logo thì unknown"),
  style: z.enum(STYLES).describe("Phong cách gần nhất"),
  materials: z.string().describe("Vật liệu chính, cách nhau bằng dấu phẩy, ví dụ: Gỗ óc chó, vải bouclé"),
  colors: z.array(z.string()).describe("2–4 màu chủ đạo bằng tiếng Việt"),
  room: z.string().describe("Không gian phù hợp nhất, ví dụ: Phòng khách"),
});

const SYSTEM = `Bạn là biên tập viên của một website bán mẫu 3D nội thất (file 3ds Max/V-Ray/Corona) cho kiến trúc sư và dân dựng hình tại Việt Nam.
Bạn nhận một ảnh render preview của MỘT mẫu 3D, kèm danh mục và tên file gốc.
Viết nội dung tiếng Việt tự nhiên, chính xác theo những gì thấy trong ảnh – không bịa kích thước, thương hiệu hay thông số không nhìn thấy.
Nếu tên file chứa tên sản phẩm/thương hiệu rõ ràng (không phải chuỗi số ngẫu nhiên) thì dùng nó trong tiêu đề.
Nếu ảnh là vật liệu (texture), HDRI hay script thì mô tả đúng bản chất đó thay vì gọi là đồ nội thất.
Viết như mô tả sản phẩm: cụ thể, dễ tìm kiếm, không sáo rỗng, không nhắc tới "ảnh" hay "hình render".
Tiêu đề viết hoa kiểu câu tiếng Việt, không viết hoa mọi chữ; không liệt kê hết các biến thể trong tiêu đề.
Vật liệu: chỉ nêu loại gỗ/đá cụ thể khi nhìn rõ hoặc có chữ ghi trên ảnh, nếu không thì mô tả chung (vd: "gỗ tông nâu").
Tag và từ khoá: không dùng từ chung chung như "3d", "mẫu 3d", "nội thất 3d", "3d model", "3ds max", "vray".
Bỏ qua watermark của website (3dsky, 3ddd…) và tên tác giả in trên ảnh.`;

const client = MOCK ? null : new Anthropic({ maxRetries: 6 });

async function imageBlock(file) {
  // thu nhỏ: API giới hạn 5MB/ảnh, và ảnh nhỏ tốn ít token hơn
  const buf = await sharp(file).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } };
}

function mockText(item) {
  const leaf = item.categoryPath.at(-1);
  return {
    title: `${leaf} ${item.baseName.slice(0, 24)}`,
    subtitle: `Mẫu ${leaf.toLowerCase()} dựng sẵn cho phối cảnh nội thất.`,
    description: `Mẫu 3D ${leaf.toLowerCase()} thuộc nhóm ${item.categoryPath[0].toLowerCase()}, dựng sẵn vật liệu, dùng ngay cho phối cảnh.`,
    paragraphs: [`(MOCK) ${item.rel}`, "Đoạn mô tả vật liệu.", "Đoạn gợi ý không gian."],
    highlights: ["Dựng sẵn vật liệu", "Tỉ lệ chuẩn"],
    tags: [leaf.toLowerCase(), item.categoryPath[0].toLowerCase(), "mẫu 3d"],
    keywords_en: [item.folder.toLowerCase()],
    style: "Hiện đại",
    render_engine: "unknown",
    materials: "",
    colors: [],
    room: "",
  };
}

async function describe(item) {
  if (MOCK) return { text: mockText(item), usage: null };
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(ModelText), effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          await imageBlock(item.file),
          {
            type: "text",
            text: `Danh mục: ${item.categoryPath.join(" > ")} (thư mục gốc: ${item.folder})\nTên file gốc: ${item.baseName}`,
          },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error(`refusal: ${response.stop_details?.category ?? "?"}`);
  if (response.stop_reason === "max_tokens") throw new Error("max_tokens");
  if (!response.parsed_output) throw new Error("không parse được JSON");
  return { text: response.parsed_output, usage: response.usage };
}

const all = (await listImages()).filter((i) => !ONLY || i.folder.startsWith(ONLY));
await fs.mkdir(OUT_DIR, { recursive: true });
const done = new Set((await fs.readdir(OUT_DIR)).map((f) => f.replace(/\.json$/, "")));
const todo = all.filter((i) => !done.has(i.id)).slice(0, LIMIT);
console.log(`Tổng ${all.length} ảnh · đã xong ${all.length - all.filter((i) => !done.has(i.id)).length} · chạy lần này ${todo.length}${MOCK ? " (MOCK)" : ""}`);

let ok = 0;
let fail = 0;
let inTok = 0;
let outTok = 0;
const failures = [];
let next = 0;

async function worker() {
  while (next < todo.length) {
    const item = todo[next++];
    try {
      const { text, usage } = await describe({ ...item, categoryPath: categoryPathFor(item.folder) });
      inTok += usage?.input_tokens ?? 0;
      outTok += usage?.output_tokens ?? 0;
      await fs.writeFile(
        path.join(OUT_DIR, `${item.id}.json`),
        JSON.stringify({ rel: item.rel, model: MOCK ? "mock" : MODEL, ...text }, null, 2),
      );
      ok++;
    } catch (e) {
      fail++;
      failures.push(`${item.rel}: ${e.message}`);
    }
    const n = ok + fail;
    if (n % 25 === 0 || n === todo.length) {
      const cost = (inTok * 0.1 + outTok * 0.5) / 1e6;
      console.log(`${n}/${todo.length} · OK ${ok} · lỗi ${fail} · ~$${cost.toFixed(3)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

if (failures.length) {
  await fs.writeFile(path.join(OUT_DIR, "..", "describe-errors.log"), failures.join("\n") + "\n");
  console.log(`Lỗi ${failures.length} ảnh – xem scripts/thu-vien/describe-errors.log, chạy lại lệnh để thử lại.`);
}
