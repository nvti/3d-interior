// Bước 2: từ kết quả describe.mjs (out/*.json) sinh file SQL cho D1:
// danh mục, media (ảnh đã upload R2), mẫu (đã xuất bản, giá 0), tag, và bảng tìm kiếm models_fts.
//
//   node scripts/thu-vien/build-sql.mjs --local      # bỏ qua mẫu đã có trong D1 local
//   node scripts/thu-vien/build-sql.mjs --remote     # bỏ qua mẫu đã có trên D1 Cloudflare
//   OVERWRITE=1 node scripts/thu-vien/build-sql.mjs --local   # ghi đè nội dung mẫu đã có
// Rồi áp file:  pnpm wrangler d1 execute tv3d --local --file scripts/thu-vien/thu-vien.sql
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { slugify, stripDiacritics } from "../../app/lib/format.ts";
import { extractTiptapText, renderTiptapHtml } from "../../app/lib/tiptap.ts";
import { categoryPathFor } from "./categories.mjs";
import { listImages, OUT_DIR } from "./common.mjs";

const target = process.argv.includes("--remote") ? "--remote" : "--local";
const OVERWRITE = !!process.env.OVERWRITE;
const SQL_FILE = path.join(OUT_DIR, "..", "thu-vien.sql");

const q = (v) => (v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const uuid = (hex) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
// id cố định theo nội dung -> chạy lại không tạo bản ghi trùng
const idFor = (kind, key) => uuid(crypto.createHash("sha1").update(`${kind}:${key}`).digest("hex"));
// Làm sạch chữ AI đọc nhầm từ watermark (tên tác giả, website) và tag chung chung
const WATERMARK = /\s*\b(Chung\s*Mua(\s*[-–]?\s*[IiLlTt]{1,2}ee)?|[IiLl]{1,2}ee(?=\s|$)|3dsky|3ddd)\b/gi;
const clean = (s) => s.replace(WATERMARK, "").replace(/\s{2,}/g, " ").trim();
const cleanTag = (s) => clean(s).replace(/\b(3d( model| scene)?|3ds ?max|v-?ray|corona)\b/gi, "").replace(/\s{2,}/g, " ").trim();
function cleanText(t) {
  return {
    ...t,
    title: clean(t.title),
    subtitle: clean(t.subtitle),
    description: clean(t.description),
    paragraphs: t.paragraphs.map(clean),
    highlights: t.highlights.map(clean),
    tags: t.tags.map(cleanTag).filter(Boolean),
    keywords_en: t.keywords_en.map(cleanTag).filter(Boolean),
  };
}

// Google cắt meta description ở khoảng 160 ký tự
const metaDesc = (s) => (s.length <= 160 ? s : s.slice(0, 157).replace(/[\s,.;:]+\S*$/, "") + "…");
const catSql = (p) => `(SELECT id FROM categories WHERE kind = 'model' AND path = ${q(p)})`;

function existingSkus() {
  const out = execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "tv3d", target, "--json", "--command", "SELECT sku FROM models WHERE sku LIKE 'TV-%'"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  return new Set(JSON.parse(out)[0].results.map((r) => r.sku));
}

function contentDoc(t) {
  const para = (s) => ({ type: "paragraph", content: [{ type: "text", text: s }] });
  return {
    type: "doc",
    content: [
      ...t.paragraphs.map(para),
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Điểm nổi bật" }] },
      { type: "bulletList", content: t.highlights.map((h) => ({ type: "listItem", content: [para(h)] })) },
    ],
  };
}

const images = new Map((await listImages()).map((i) => [i.id, i]));
const results = [];
for (const f of (await fs.readdir(OUT_DIR)).filter((f) => f.endsWith(".json"))) {
  const img = images.get(f.replace(/\.json$/, ""));
  if (img) results.push({ img, t: cleanText(JSON.parse(await fs.readFile(path.join(OUT_DIR, f), "utf8"))) });
}
results.sort((a, b) => a.img.rel.localeCompare(b.img.rel));

const skip = OVERWRITE ? new Set() : existingSkus();
const sql = [];

// danh mục: tạo cả nhánh cha, giữ nguyên danh mục đã có (theo path)
const cats = new Map();
for (const { img } of results) {
  let p = "/";
  for (const [depth, name] of categoryPathFor(img.folder).entries()) {
    const parent = p;
    p = `${p}${slugify(name) || "muc"}/`;
    if (!cats.has(p)) cats.set(p, { name, parent, depth });
  }
}
for (const [p, c] of cats) {
  sql.push(
    `INSERT INTO categories (id, kind, parent_id, name, slug, path, depth, sort_order) VALUES (${q(idFor("category", p))}, 'model', ${
      c.depth ? catSql(c.parent) : "NULL"
    }, ${q(c.name)}, ${q(p.split("/").at(-2))}, ${q(p)}, ${c.depth}, 0) ON CONFLICT (kind, path) DO NOTHING;`,
  );
}

let written = 0;
for (const { img, t } of results) {
  const sku = `TV-${img.id.slice(0, 10).toUpperCase()}`;
  if (skip.has(sku)) continue;
  const modelId = idFor("model", img.id);
  const mediaId = idFor("media", img.id);
  const catPath = "/" + categoryPathFor(img.folder).map((n) => slugify(n) || "muc").join("/") + "/";
  const slug = `${slugify(t.title).slice(0, 72).replace(/-+$/, "")}-${img.id.slice(0, 5)}`;
  const doc = contentDoc(t);
  const contentText = extractTiptapText(doc);
  const tagNames = [...new Map([...t.tags, ...t.keywords_en].map((n) => [slugify(n), n.trim().toLowerCase()])).entries()]
    .filter(([s]) => s)
    .slice(0, 20);
  const { width, height } = await sharp(img.file).metadata();
  const sizeBytes = (await fs.stat(img.file)).size;
  const attributes = { colors: t.colors, room: t.room, source: "thu-vien", sourceFile: img.rel };
  // ảnh có cả 2 logo / không có logo: để trống, admin chọn sau
  const renderEngine = t.render_engine === "vray" || t.render_engine === "corona" ? t.render_engine : null;

  sql.push(
    `INSERT INTO media (id, r2_key, variants, mime_type, width, height, size_bytes, alt) VALUES (${q(mediaId)}, ${q(img.r2Key)}, NULL, ${q(
      img.mimeType,
    )}, ${q(width)}, ${q(height)}, ${sizeBytes}, ${q(t.title)}) ON CONFLICT (r2_key) DO UPDATE SET alt = excluded.alt;`,
    `INSERT INTO models (id, slug, sku, title, category_id, price_vnd, style, render_engine, formats, materials, attributes, subtitle, description, content_json, content_html, content_text, meta_title, meta_description, status, published_at)
VALUES (${q(modelId)}, ${q(slug)}, ${q(sku)}, ${q(t.title)}, ${catSql(catPath)}, 0, ${q(t.style)}, ${q(renderEngine)}, '[]',${q(t.materials)}, ${q(
      JSON.stringify(attributes),
    )}, ${q(t.subtitle)}, ${q(t.description)}, ${q(JSON.stringify(doc))}, ${q(renderTiptapHtml(doc, ""))}, ${q(contentText)}, ${q(
      t.title,
    )}, ${q(metaDesc(t.description))}, 'published', unixepoch())
ON CONFLICT (id) DO UPDATE SET title = excluded.title, category_id = excluded.category_id, style = excluded.style, render_engine = excluded.render_engine, materials = excluded.materials, attributes = excluded.attributes, subtitle = excluded.subtitle, description = excluded.description, content_json = excluded.content_json, content_html = excluded.content_html, content_text = excluded.content_text, meta_title = excluded.meta_title, meta_description = excluded.meta_description, updated_at = unixepoch();`,
    `INSERT INTO model_images (model_id, media_id, sort_order) VALUES (${q(modelId)}, (SELECT id FROM media WHERE r2_key = ${q(img.r2Key)}), 0) ON CONFLICT DO NOTHING;`,
    `DELETE FROM model_tags WHERE model_id = ${q(modelId)};`,
  );
  for (const [tagSlug, name] of tagNames) {
    sql.push(
      `INSERT INTO tags (id, name, slug) VALUES (${q(idFor("tag", tagSlug))}, ${q(name)}, ${q(tagSlug)}) ON CONFLICT (slug) DO NOTHING;`,
      `INSERT INTO model_tags (model_id, tag_id) VALUES (${q(modelId)}, (SELECT id FROM tags WHERE slug = ${q(tagSlug)})) ON CONFLICT DO NOTHING;`,
    );
  }
  // giống syncFts() trong app/lib/models.server.ts
  const tagText = tagNames.map(([, n]) => n).join(" ");
  sql.push(
    `DELETE FROM models_fts WHERE model_id = ${q(modelId)};`,
    `INSERT INTO models_fts (model_id, title, description, tags, body) VALUES (${q(modelId)}, ${q(stripDiacritics(`${t.title} ${t.subtitle}`))}, ${q(
      stripDiacritics(t.description),
    )}, ${q(stripDiacritics(`${tagText} ${t.style} ${t.materials}`))}, ${q(stripDiacritics(contentText.slice(0, 4000)))});`,
  );
  written++;
}

// tag cũ không còn mẫu nào dùng (sau khi ghi đè nội dung)
if (OVERWRITE) sql.push("DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM model_tags mt WHERE mt.tag_id = tags.id);");

await fs.writeFile(SQL_FILE, sql.join("\n") + "\n");
console.log(`${results.length} kết quả · ${cats.size} danh mục · ghi ${written} mẫu · bỏ qua ${results.length - written} mẫu đã có`);
console.log(`-> ${path.relative(process.cwd(), SQL_FILE)}`);
console.log(`Áp vào D1:  pnpm wrangler d1 execute tv3d ${target} --file ${path.relative(process.cwd(), SQL_FILE)}`);
