// Chỉ dùng khi chạy local (pnpm dev) – thay cho R2 thật và Queue HTTP pull.
// app.ts chỉ gắn router này khi import.meta.env.DEV, nên không có trong bản build production.
//   GET  /media/*                      ảnh từ bucket MEDIA giả lập (MEDIA_PUBLIC_URL=http://localhost:5173/media)
//   GET  /dev-files/*                  file mẫu từ bucket MODELS giả lập (thay cho presigned URL)
//   PUT  /api/dev/r2/:bucket/*         home-agent (R2_MODE=local) upload ảnh / file zip
//   HEAD /api/dev/r2/:bucket/*         kiểm tra dung lượng sau khi upload
//   GET  /api/dev/upload-jobs          home-agent lấy job upload (mẫu đang 'uploading' trong D1)
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb, schema } from "~/lib/db.server";
import { safeEqual } from "~/lib/crypto.server";
import type { UploadJob } from "~/lib/downloads.server";

export const dev = new Hono();

function bucket(name: string): R2Bucket | undefined {
  if (name === "tv3d-media" || name === "media") return env.MEDIA;
  if (name === env.MODELS_BUCKET_NAME || name === "models") return env.MODELS;
  return undefined;
}

async function serve(b: R2Bucket, key: string, download?: string) {
  const obj = await b.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("Content-Length", String(obj.size));
  if (download) h.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(download)}`);
  return new Response(obj.body, { headers: h });
}

const keyAfter = (path: string, prefix: string) => decodeURIComponent(path.slice(prefix.length));

dev.get("/media/*", (c) => serve(env.MEDIA, keyAfter(c.req.path, "/media/")));

dev.get("/dev-files/*", (c) =>
  serve(env.MODELS, keyAfter(c.req.path, "/dev-files/"), c.req.query("name") || undefined),
);

// /api/dev/* dành cho home-agent: cùng token với /api/agent
dev.use("/api/dev/*", async (c, next) => {
  const auth = c.req.header("Authorization") ?? "";
  if (!env.AGENT_TOKEN || !safeEqual(auth, `Bearer ${env.AGENT_TOKEN}`)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

dev.put("/api/dev/r2/:bucket/*", async (c) => {
  const b = bucket(c.req.param("bucket"));
  if (!b) return c.json({ error: "unknown bucket" }, 400);
  const key = keyAfter(c.req.path, `/api/dev/r2/${c.req.param("bucket")}/`);
  const obj = await b.put(key, await c.req.arrayBuffer(), {
    httpMetadata: {
      contentType: c.req.header("Content-Type") ?? "application/octet-stream",
      cacheControl: c.req.header("Cache-Control"),
    },
  });
  return c.json({ ok: true, key, size: obj?.size ?? 0 });
});

// Hono trả lời HEAD bằng route GET (bỏ body)
dev.get("/api/dev/r2/:bucket/*", async (c) => {
  const b = bucket(c.req.param("bucket"));
  if (!b) return c.body(null, 400);
  const obj = await b.head(keyAfter(c.req.path, `/api/dev/r2/${c.req.param("bucket")}/`));
  if (!obj) return c.body(null, 404);
  return c.body(null, 200, { "Content-Length": String(obj.size) });
});

dev.get("/api/dev/upload-jobs", async (c) => {
  const { models } = schema;
  const rows = await getDb()
    .select({ modelId: models.id, fileKey: models.fileKey, sha256: models.fileSha256, sizeBytes: models.fileSizeBytes })
    .from(models)
    .where(eq(models.r2Status, "uploading"))
    .limit(10);
  return c.json(rows.filter((r): r is UploadJob => !!r.fileKey));
});
