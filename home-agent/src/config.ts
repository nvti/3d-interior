// Cấu hình tool máy nhà – đọc từ file .env (chạy bằng: node --env-file=.env ...)
import path from "node:path";

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Thiếu biến môi trường ${name} (xem .env.example)`);
    process.exit(1);
  }
  return v;
}

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  mediaBucket: string;
  modelsBucket: string;
};

export type QueueConfig = { accountId: string; apiToken: string; queueId: string };

export type TypesenseConfig = { url: string; apiKey: string; collection: string; embedModel: string; imageModel: string };

export const config = {
  libraryRoot: (): string => path.resolve(req("LIBRARY_ROOT")),
  workDir: (): string => path.resolve(process.env.WORK_DIR || "./.agent"),
  siteUrl: (): string => req("SITE_URL").replace(/\/$/, ""),
  agentToken: (): string => req("AGENT_TOKEN"),

  /** R2_MODE=local: upload và nhận job qua website đang chạy local (pnpm dev), không cần Cloudflare */
  localMode: (): boolean => process.env.R2_MODE === "local",

  r2: (): R2Config =>
    process.env.R2_MODE === "local"
      ? {
          accountId: "local",
          accessKeyId: "",
          secretAccessKey: "",
          mediaBucket: process.env.R2_MEDIA_BUCKET || "tv3d-media",
          modelsBucket: process.env.R2_MODELS_BUCKET || "tv3d-models",
        }
      : {
          accountId: req("R2_ACCOUNT_ID"),
          accessKeyId: req("R2_ACCESS_KEY_ID"),
          secretAccessKey: req("R2_SECRET_ACCESS_KEY"),
          mediaBucket: req("R2_MEDIA_BUCKET"),
          modelsBucket: req("R2_MODELS_BUCKET"),
        },

  queue: (): QueueConfig => ({
    accountId: req("R2_ACCOUNT_ID"),
    apiToken: req("CF_API_TOKEN"),
    queueId: req("UPLOAD_QUEUE_ID"),
  }),

  typesense: (): TypesenseConfig => ({
    url: (process.env.TYPESENSE_LOCAL_URL || "http://localhost:8108").replace(/\/$/, ""),
    apiKey: req("TYPESENSE_API_KEY"),
    collection: process.env.TYPESENSE_COLLECTION || "models",
    embedModel: process.env.TYPESENSE_EMBED_MODEL || "ts/multilingual-e5-small",
    imageModel: process.env.TYPESENSE_IMAGE_MODEL || "ts/clip-vit-b-p32",
  }),
};

/** Đuôi file được coi là file mẫu 3D (thư mục chứa ít nhất một file này = một mẫu) */
export const MODEL_EXTS = [".max", ".fbx", ".obj", ".skp", ".gltf", ".glb", ".3ds", ".c4d", ".blend"];
export const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"];
/** Thư mục con chứa texture – ảnh trong đó không dùng làm preview */
export const TEXTURE_DIRS = ["maps", "map", "textures", "texture", "tex"];
