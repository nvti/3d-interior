// API cho trang admin: upload ảnh lên bucket public
import { Hono } from "hono";
import { and, desc, like, or } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getUser } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { getModelCards } from "~/lib/models.server";

export const adminApi = new Hono();

adminApi.use("*", async (c, next) => {
  const u = await getUser(c.req.raw);
  if (!u || u.role !== "admin") return c.json({ error: "forbidden" }, 403);
  await next();
});

const ALLOWED = new Set(["image/webp", "image/jpeg", "image/png", "image/avif"]);

/**
 * multipart/form-data:
 *   file_<width> = các biến thể (trình duyệt đã resize sẵn), vd file_400, file_1200, file_2000
 *   width, height, alt
 */
adminApi.post("/media", async (c) => {
  const form = await c.req.formData();
  const variants: Record<string, string> = {};
  const id = crypto.randomUUID();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  let largestKey = "";
  let largestW = 0;
  let largestSize = 0;
  let mime = "image/webp";

  for (const [name, value] of form.entries()) {
    if (!name.startsWith("file_") || typeof value === "string") continue;
    const file = value as File;
    if (!ALLOWED.has(file.type)) return c.json({ error: `Định dạng ${file.type} không hỗ trợ` }, 400);
    if (file.size > 15 * 1024 * 1024) return c.json({ error: "Ảnh quá 15MB" }, 400);
    const w = Number(name.slice(5)) || 0;
    const ext = file.type.split("/")[1];
    const key = `m/${day}/${id}-${w}.${ext}`;
    await env.MEDIA.put(key, file.stream(), {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
    });
    variants[String(w)] = key;
    if (w >= largestW) {
      largestW = w;
      largestKey = key;
      largestSize = file.size;
      mime = file.type;
    }
  }
  if (!largestKey) return c.json({ error: "Không có file" }, 400);

  const [row] = await getDb()
    .insert(schema.media)
    .values({
      id,
      r2Key: largestKey,
      variants,
      mimeType: mime,
      width: Number(form.get("width")) || null,
      height: Number(form.get("height")) || null,
      sizeBytes: largestSize,
      alt: String(form.get("alt") ?? "") || null,
    })
    .returning();
  const thumbKey = variants["400"] ?? largestKey;
  return c.json({
    id: row.id,
    url: `${env.MEDIA_PUBLIC_URL}/${largestKey}`,
    thumbUrl: `${env.MEDIA_PUBLIC_URL}/${thumbKey}`,
    variants,
  });
});

/** Tìm mẫu theo tên / SKU để chọn làm "Mẫu tương tự" (mọi trạng thái) */
adminApi.get("/models/search", async (c) => {
  // mỗi từ phải có trong tên hoặc SKU ("rèm damask" khớp "Bộ rèm cửa họa tiết damask")
  const words = (c.req.query("q") ?? "").trim().slice(0, 100).split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return c.json([]);
  const { models } = schema;
  const rows = await getDb()
    .select({ id: models.id })
    .from(models)
    .where(and(...words.map((w) => or(like(models.title, `%${w}%`), like(models.sku, `%${w}%`)))))
    .orderBy(desc(models.updatedAt))
    .limit(10);
  const cards = await getModelCards(rows.map((r) => r.id), { anyStatus: true });
  return c.json(cards.map((m) => ({ id: m.id, title: m.title, sku: m.sku, coverUrl: m.coverUrl })));
});
