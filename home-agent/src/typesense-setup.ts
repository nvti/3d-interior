// Tạo collection Typesense (chạy một lần, hoặc với --recreate để xoá & tạo lại).
// Sau đó gọi website đưa toàn bộ mẫu vào hàng đợi đồng bộ.
//
// Dùng: pnpm typesense:setup [--recreate]
import { config } from "./config.js";
import { api, log } from "./lib.js";

const ts = config.typesense();
const H = { "X-TYPESENSE-API-KEY": ts.apiKey, "Content-Type": "application/json" };

type Field = {
  name: string;
  type: string;
  facet?: boolean;
  optional?: boolean;
  index?: boolean;
  store?: boolean;
  embed?: { from: string[]; model_config: { model_name: string } };
};

// Các trường phải khớp với SearchDoc trong web/app/lib/typesense.server.ts
const fields: Field[] = [
  { name: "slug", type: "string", index: false, optional: true },
  { name: "sku", type: "string", optional: true },
  { name: "title", type: "string" },
  // bản không dấu (website tự sinh) – để gõ không dấu vẫn khớp từ khoá
  { name: "title_plain", type: "string", optional: true },
  { name: "text_plain", type: "string", optional: true },
  { name: "subtitle", type: "string", optional: true },
  { name: "description", type: "string", optional: true },
  { name: "content_text", type: "string", optional: true },
  { name: "tags", type: "string[]", facet: true, optional: true },
  { name: "category_id", type: "string", facet: true },
  { name: "category_path", type: "string", facet: true },
  { name: "category_ancestors", type: "string[]", facet: true },
  { name: "style", type: "string", facet: true, optional: true },
  { name: "render_engine", type: "string", facet: true, optional: true },
  { name: "formats", type: "string[]", facet: true, optional: true },
  { name: "materials", type: "string", optional: true },
  { name: "price_vnd", type: "int32" },
  { name: "is_free", type: "bool", facet: true },
  { name: "published_at", type: "int64" },
  {
    // embedding tự sinh trong Typesense bằng model đa ngôn ngữ (chạy trên CPU máy nhà)
    name: "embedding",
    type: "float[]",
    embed: {
      from: ["title", "subtitle", "description", "tags", "materials", "style", "content_text"],
      model_config: { model_name: ts.embedModel },
    },
  },
  // URL ảnh đại diện (website ghi) và URL ảnh đã nhúng (home-agent ghi, xem images.ts) – lệch nhau thì nhúng lại
  { name: "cover_url", type: "string", index: false, optional: true },
  { name: "image_key", type: "string", index: false, optional: true },
  // ảnh JPEG base64 do home-agent gửi, chỉ dùng để sinh image_embedding rồi bỏ đi
  { name: "image", type: "image", store: false, optional: true },
  {
    // embedding ảnh CLIP – tìm bằng ảnh
    name: "image_embedding",
    type: "float[]",
    optional: true,
    embed: { from: ["image"], model_config: { model_name: ts.imageModel } },
  },
];

const schema = {
  name: ts.collection,
  fields,
  default_sorting_field: "published_at",
  token_separators: ["-", "/"],
};

async function main(): Promise<void> {
  const recreate = process.argv.includes("--recreate");
  const exists = await fetch(`${ts.url}/collections/${ts.collection}`, { headers: H });
  if (exists.ok && recreate) {
    log("Xoá collection cũ…");
    await fetch(`${ts.url}/collections/${ts.collection}`, { method: "DELETE", headers: H });
  }
  if (!exists.ok || recreate) {
    log(`Tạo collection "${ts.collection}" (lần đầu sẽ tải model ${ts.embedModel} và ${ts.imageModel}, có thể mất vài phút)…`);
    const r = await fetch(`${ts.url}/collections`, { method: "POST", headers: H, body: JSON.stringify(schema) });
    if (!r.ok) throw new Error(`Tạo collection lỗi ${r.status}: ${await r.text()}`);
  } else {
    // collection cũ: thêm các trường mới (không cần tạo lại, embedding giữ nguyên)
    const current = (await exists.json()) as { fields: { name: string }[] };
    const have = new Set(current.fields.map((f) => f.name));
    const missing = fields.filter((f) => !have.has(f.name));
    if (missing.length) {
      log(`Thêm trường: ${missing.map((f) => f.name).join(", ")}…`);
      const r = await fetch(`${ts.url}/collections/${ts.collection}`, {
        method: "PATCH",
        headers: H,
        body: JSON.stringify({ fields: missing }),
      });
      if (!r.ok) throw new Error(`Cập nhật collection lỗi ${r.status}: ${await r.text()}`);
    } else {
      log("Collection đã tồn tại (dùng --recreate để tạo lại).");
    }
  }
  const q = await api<{ queued: number }>("/api/agent/reindex", {});
  log(`Đã đưa ${q.queued} mẫu vào hàng đợi đồng bộ. Website sẽ đẩy dần sang Typesense.`);
  log(`Ảnh preview sẽ được nhúng khi chạy "pnpm typesense:images" (worker cũng tự chạy định kỳ).`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
