// Cấu hình tool máy nhà – đọc từ file .env (chạy bằng: node --env-file=.env ...)
import path from "node:path";

function req(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Thiếu biến môi trường ${name} (xem .env.example)`);
    process.exit(1);
  }
  return v;
}

export const config = {
  libraryRoot: () => path.resolve(req("LIBRARY_ROOT")),
  workDir: () => path.resolve(process.env.WORK_DIR || "./.agent"),
  siteUrl: () => req("SITE_URL").replace(/\/$/, ""),
  agentToken: () => req("AGENT_TOKEN"),

  r2: () => ({
    accountId: req("R2_ACCOUNT_ID"),
    accessKeyId: req("R2_ACCESS_KEY_ID"),
    secretAccessKey: req("R2_SECRET_ACCESS_KEY"),
    mediaBucket: req("R2_MEDIA_BUCKET"),
    modelsBucket: req("R2_MODELS_BUCKET"),
  }),

  queue: () => ({
    accountId: req("R2_ACCOUNT_ID"),
    apiToken: req("CF_API_TOKEN"),
    queueId: req("UPLOAD_QUEUE_ID"),
  }),

  typesense: () => ({
    url: (process.env.TYPESENSE_LOCAL_URL || "http://localhost:8108").replace(/\/$/, ""),
    apiKey: req("TYPESENSE_API_KEY"),
    collection: process.env.TYPESENSE_COLLECTION || "models",
    embedModel: process.env.TYPESENSE_EMBED_MODEL || "ts/multilingual-e5-small",
  }),
};

/** Đuôi file được coi là file mẫu 3D (thư mục chứa ít nhất một file này = một mẫu) */
export const MODEL_EXTS = [".max", ".fbx", ".obj", ".skp", ".gltf", ".glb", ".3ds", ".c4d", ".blend"];
export const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"];
/** Thư mục con chứa texture – ảnh trong đó không dùng làm preview */
export const TEXTURE_DIRS = ["maps", "map", "textures", "texture", "tex"];
