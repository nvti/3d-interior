// Nhìn ảnh preview của một mẫu bằng Claude, viết nội dung tiếng Việt (tiêu đề, mô tả, tag…).
// Prompt giống web/scripts/thu-vien/describe.mjs – sửa một bên thì sửa cả bên kia.
// Không có ANTHROPIC_API_KEY thì bỏ qua: mẫu vẫn được nhập, chỉ thiếu nội dung.
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import type { ModelFolder } from "./library.js";
import type { AiText } from "./types.js";

const MODEL = process.env.AI_MODEL || "claude-haiku-5-5";
const MAX_IMAGES = 3;
// giữ khớp với STYLES trong web/app/lib/format.ts
const STYLES = ["Hiện đại", "Japandi", "Indochine", "Bắc Âu", "Tân cổ điển", "Công nghiệp", "Wabi-sabi"] as const;

const ModelText = z.object({
  title: z.string().describe("Tên mẫu tiếng Việt, tối đa 60 ký tự, chỉ viết hoa chữ đầu và tên riêng (vd: Bộ phụ kiện phòng tắm Meir Black)"),
  subtitle: z.string().describe("Một câu ngắn gợi tinh thần/cảm xúc của mẫu"),
  description: z.string().describe("2 câu, 140–200 ký tự, dùng làm mô tả ngắn và meta description"),
  paragraphs: z.array(z.string()).describe("3 đoạn: hình dáng & chi tiết; vật liệu & màu sắc; gợi ý không gian sử dụng"),
  highlights: z.array(z.string()).describe("3–5 điểm nổi bật ngắn gọn"),
  tags: z.array(z.string()).describe("8–12 từ khoá tiếng Việt viết thường: loại đồ, vật liệu, màu, phong cách, phòng"),
  keywords_en: z.array(z.string()).describe("4–6 từ khoá tiếng Anh viết thường để khách tìm bằng tiếng Anh"),
  style: z.enum(STYLES).describe("Phong cách gần nhất"),
  materials: z.string().describe("Vật liệu chính, cách nhau bằng dấu phẩy, ví dụ: Gỗ óc chó, vải bouclé"),
  colors: z.array(z.string()).describe("2–4 màu chủ đạo bằng tiếng Việt"),
  room: z.string().describe("Không gian phù hợp nhất, ví dụ: Phòng khách"),
});

const SYSTEM = `Bạn là biên tập viên của một website bán mẫu 3D nội thất (file 3ds Max/V-Ray/Corona) cho kiến trúc sư và dân dựng hình tại Việt Nam.
Bạn nhận vài ảnh render preview của MỘT mẫu 3D, kèm danh mục, tên thư mục và tên file gốc.
Viết nội dung tiếng Việt tự nhiên, chính xác theo những gì thấy trong ảnh – không bịa kích thước, thương hiệu hay thông số không nhìn thấy.
Nếu tên thư mục/file chứa tên sản phẩm/thương hiệu rõ ràng (không phải chuỗi số ngẫu nhiên) thì dùng nó trong tiêu đề.
Nếu ảnh là vật liệu (texture), HDRI hay script thì mô tả đúng bản chất đó thay vì gọi là đồ nội thất.
Viết như mô tả sản phẩm: cụ thể, dễ tìm kiếm, không sáo rỗng, không nhắc tới "ảnh" hay "hình render".
Tiêu đề viết hoa kiểu câu tiếng Việt, không viết hoa mọi chữ; không liệt kê hết các biến thể trong tiêu đề.
Vật liệu: chỉ nêu loại gỗ/đá cụ thể khi nhìn rõ hoặc có chữ ghi trên ảnh, nếu không thì mô tả chung (vd: "gỗ tông nâu").
Tag và từ khoá: không dùng từ chung chung như "3d", "mẫu 3d", "nội thất 3d", "3d model", "3ds max", "vray".
Bỏ qua watermark của website (3dsky, 3ddd…) và tên tác giả in trên ảnh.`;

// tag chung chung AI đôi khi vẫn sinh ra
const GENERIC = /\b(3d( model| scene)?|3ds ?max|v-?ray|corona)\b/gi;

let client: Anthropic | undefined;

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

async function imageBlock(file: string) {
  // thu nhỏ: API giới hạn 5MB/ảnh, và ảnh nhỏ tốn ít token hơn
  const buf = await sharp(file, { failOn: "none" })
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: buf.toString("base64") } };
}

export async function describeModel(dir: string, f: ModelFolder): Promise<AiText | undefined> {
  if (!aiEnabled() || !f.images.length) return undefined;
  client ??= new Anthropic({ maxRetries: 4 });
  const images = await Promise.all(f.images.slice(0, MAX_IMAGES).map((img) => imageBlock(path.join(dir, img))));
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(ModelText), effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          ...images,
          {
            type: "text",
            text: `Danh mục: ${f.categoryPath.join(" > ")}\nTên thư mục: ${path.basename(f.rel)}\nFile mẫu: ${f.modelFiles.join(", ")}`,
          },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("AI từ chối mô tả ảnh");
  const t = response.parsed_output;
  if (!t) throw new Error(`AI không trả về nội dung (${response.stop_reason})`);
  const tags = [...t.tags, ...t.keywords_en].map((s) => s.replace(GENERIC, "").replace(/\s{2,}/g, " ").trim().toLowerCase()).filter(Boolean);
  return {
    title: t.title,
    subtitle: t.subtitle,
    description: t.description,
    paragraphs: t.paragraphs,
    highlights: t.highlights,
    tags: [...new Set(tags)].slice(0, 20),
    style: t.style,
    materials: t.materials,
    colors: t.colors,
    room: t.room,
  };
}
