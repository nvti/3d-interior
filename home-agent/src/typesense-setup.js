// Tạo collection Typesense (chạy một lần, hoặc với --recreate để xoá & tạo lại).
// Sau đó gọi website đưa toàn bộ mẫu vào hàng đợi đồng bộ.
//
// Dùng: npm run typesense:setup -- [--recreate]
import { config } from "./config.js";
import { api, log } from "./lib.js";

const ts = config.typesense();
const H = { "X-TYPESENSE-API-KEY": ts.apiKey, "Content-Type": "application/json" };

const schema = {
  name: ts.collection,
  fields: [
    { name: "slug", type: "string", index: false, optional: true },
    { name: "sku", type: "string", optional: true },
    { name: "title", type: "string" },
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
  ],
  default_sorting_field: "published_at",
  token_separators: ["-", "/"],
};

async function main() {
  const recreate = process.argv.includes("--recreate");
  const exists = await fetch(`${ts.url}/collections/${ts.collection}`, { headers: H });
  if (exists.ok && recreate) {
    log("Xoá collection cũ…");
    await fetch(`${ts.url}/collections/${ts.collection}`, { method: "DELETE", headers: H });
  }
  if (!exists.ok || recreate) {
    log(`Tạo collection "${ts.collection}" (lần đầu sẽ tải model ${ts.embedModel}, có thể mất vài phút)…`);
    const r = await fetch(`${ts.url}/collections`, { method: "POST", headers: H, body: JSON.stringify(schema) });
    if (!r.ok) throw new Error(`Tạo collection lỗi ${r.status}: ${await r.text()}`);
  } else {
    log("Collection đã tồn tại (dùng --recreate để tạo lại).");
  }
  const q = await api("/api/agent/reindex", {});
  log(`Đã đưa ${q.queued} mẫu vào hàng đợi đồng bộ. Website sẽ đẩy dần sang Typesense.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
