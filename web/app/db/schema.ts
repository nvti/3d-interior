// Drizzle schema (Cloudflare D1 / SQLite)
// - Bảng auth (user, session, account, verification) theo Better Auth
// - Nội dung: categories (cây), media, models, tags, posts
// - Bán hàng: orders, order_items, entitlements, download_requests

import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const ts = (name: string) => integer(name, { mode: "timestamp" });

const timestamps = {
  createdAt: ts("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: ts("updated_at")
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
};

const seo = {
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
};

const publishStatus = () =>
  text("status", { enum: ["draft", "published", "archived"] })
    .notNull()
    .default("draft");

/* ================================================================== */
/* Auth (Better Auth)                                                  */
/* ================================================================== */

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("customer"), // "customer" | "admin"
  createdAt: ts("created_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ================================================================== */
/* Cây thư mục: parentId + materialized path ("/noi-that/sofa/")       */
/* kind: dùng chung cho cây mẫu 3D và chuyên mục blog                   */
/* ================================================================== */
export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    kind: text("kind", { enum: ["model", "post"] }).notNull().default("model"),
    parentId: text("parent_id").references((): AnySQLiteColumn => categories.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    path: text("path").notNull(),
    depth: integer("depth").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    description: text("description"),
    ...seo,
    ...timestamps,
  },
  (t) => [
    uniqueIndex("categories_kind_path_uq").on(t.kind, t.path),
    index("categories_parent_idx").on(t.parentId, t.sortOrder),
  ],
);

/* ================================================================== */
/* Media (bucket public). variants: { "400": key, "1200": key, ... }   */
/* ================================================================== */
export type MediaVariants = Record<string, string>;

export const media = sqliteTable("media", {
  id: id(),
  r2Key: text("r2_key").notNull().unique(), // bản lớn nhất
  variants: text("variants", { mode: "json" }).$type<MediaVariants>(),
  mimeType: text("mime_type").notNull(),
  width: integer("width"),
  height: integer("height"),
  sizeBytes: integer("size_bytes"),
  alt: text("alt"),
  ...timestamps,
});

/* ================================================================== */
/* Mẫu 3D                                                              */
/* ================================================================== */
export const R2_STATUSES = ["absent", "uploading", "ready", "failed"] as const;
export type R2Status = (typeof R2_STATUSES)[number];

export const models = sqliteTable(
  "models",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    sku: text("sku").unique(), // mã nội bộ, khớp thư mục trên máy nhà
    title: text("title").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),

    priceVnd: integer("price_vnd").notNull().default(0), // 0 = miễn phí
    style: text("style"),
    renderEngine: text("render_engine", { enum: ["vray", "corona", "other"] }),
    maxVersion: text("max_version"),
    formats: text("formats", { mode: "json" }).$type<string[]>(),
    materials: text("materials"),
    widthMm: integer("width_mm"),
    depthMm: integer("depth_mm"),
    heightMm: integer("height_mm"),
    attributes: text("attributes", { mode: "json" }).$type<Record<string, unknown>>(),

    subtitle: text("subtitle"), // câu mô tả tinh thần mẫu (in nghiêng)
    description: text("description"),
    contentJson: text("content_json", { mode: "json" }),
    contentHtml: text("content_html"),
    contentText: text("content_text"),

    fileKey: text("file_key"), // key trong bucket private (= đường dẫn tương đối ở máy nhà)
    fileSizeBytes: integer("file_size_bytes"),
    fileSha256: text("file_sha256"),

    r2Status: text("r2_status", { enum: R2_STATUSES }).notNull().default("absent"),
    r2UploadRequestedAt: ts("r2_upload_requested_at"),
    r2ReadyAt: ts("r2_ready_at"),
    r2UploadAttempts: integer("r2_upload_attempts").notNull().default(0),
    lastDownloadAt: ts("last_download_at"),

    // mục "Mẫu tương tự": true = sau các mẫu admin chọn, hệ thống tự điền cho đủ
    relatedAuto: integer("related_auto", { mode: "boolean" }).notNull().default(true),

    status: publishStatus(),
    publishedAt: ts("published_at"),
    ...seo,
    ...timestamps,
  },
  (t) => [
    index("models_category_idx").on(t.categoryId, t.status),
    index("models_status_published_idx").on(t.status, t.publishedAt),
    index("models_r2_cleanup_idx").on(t.r2Status, t.lastDownloadAt),
  ],
);

export const modelImages = sqliteTable(
  "model_images",
  {
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    caption: text("caption"),
  },
  (t) => [primaryKey({ columns: [t.modelId, t.mediaId] })],
);

/** Mẫu tương tự do admin chọn tay (hiện trước các mẫu hệ thống tự gợi ý) */
export const modelRelated = sqliteTable(
  "model_related",
  {
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    relatedId: text("related_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.modelId, t.relatedId] })],
);

export const tags = sqliteTable("tags", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const modelTags = sqliteTable(
  "model_tags",
  {
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.modelId, t.tagId] }), index("model_tags_tag_idx").on(t.tagId)],
);

/* ================================================================== */
/* Blog + trang tĩnh                                                   */
/* ================================================================== */
export const posts = sqliteTable(
  "posts",
  {
    id: id(),
    type: text("type", { enum: ["post", "page"] }).notNull().default("post"),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    coverMediaId: text("cover_media_id").references(() => media.id, { onDelete: "set null" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    contentJson: text("content_json", { mode: "json" }),
    contentHtml: text("content_html"),
    contentText: text("content_text"),
    status: publishStatus(),
    publishedAt: ts("published_at"),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    ...seo,
    ...timestamps,
  },
  (t) => [
    uniqueIndex("posts_type_slug_uq").on(t.type, t.slug),
    index("posts_status_published_idx").on(t.type, t.status, t.publishedAt),
  ],
);

export const postModels = sqliteTable(
  "post_models",
  {
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.postId, t.modelId] })],
);

/* ================================================================== */
/* Bán hàng & tải file                                                  */
/* ================================================================== */
export const orders = sqliteTable(
  "orders",
  {
    id: id(),
    code: text("code").notNull().unique(), // mã ngắn ghi trong nội dung chuyển khoản
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    email: text("email").notNull(),
    status: text("status", { enum: ["pending", "paid", "failed", "refunded", "expired"] })
      .notNull()
      .default("pending"),
    totalVnd: integer("total_vnd").notNull(),
    provider: text("provider"),
    providerRef: text("provider_ref").unique(), // chống xử lý webhook 2 lần
    paidAt: ts("paid_at"),
    ...timestamps,
  },
  (t) => [index("orders_user_idx").on(t.userId, t.createdAt), index("orders_status_idx").on(t.status)],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "restrict" }),
    priceVnd: integer("price_vnd").notNull(),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.modelId] })],
);

export const entitlements = sqliteTable(
  "entitlements",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "restrict" }),
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.userId, t.modelId] })],
);

export const downloadRequests = sqliteTable(
  "download_requests",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["waiting_upload", "ready", "expired", "failed"] })
      .notNull()
      .default("waiting_upload"),
    notifyEmail: text("notify_email"),
    emailedAt: ts("emailed_at"),
    expiresAt: ts("expires_at").notNull(),
    clickCount: integer("click_count").notNull().default(0),
    maxClicks: integer("max_clicks").notNull().default(5),
    ...timestamps,
  },
  (t) => [
    index("download_requests_model_status_idx").on(t.modelId, t.status),
    index("download_requests_user_idx").on(t.userId, t.createdAt),
  ],
);

/* ================================================================== */
/* Nhập mẫu từ máy nhà: admin bấm quét -> chọn mẫu -> home-agent nhập  */
/* ================================================================== */

/** Thư mục mẫu chưa có trên website, do home-agent báo về sau mỗi lần quét */
export type LibraryCandidate = {
  rel: string; // đường dẫn tương đối trong LIBRARY_ROOT
  categoryPath: string[];
  title: string;
  sku: string;
  images: number;
  bytes: number;
  formats: string[];
  copying: boolean; // file vừa thay đổi trong vài phút gần đây – có thể đang chép dở
};

export const libraryScans = sqliteTable("library_scans", {
  id: id(),
  status: text("status", { enum: ["pending", "running", "done", "failed"] })
    .notNull()
    .default("pending"),
  candidates: text("candidates", { mode: "json" }).$type<LibraryCandidate[]>(),
  totalFound: integer("total_found"), // có thể lớn hơn số candidates (bị cắt bớt)
  error: text("error"),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
  ...timestamps,
});

export const libraryImports = sqliteTable(
  "library_imports",
  {
    id: id(),
    rel: text("rel").notNull(),
    sku: text("sku").notNull(),
    title: text("title").notNull(),
    status: text("status", { enum: ["pending", "running", "done", "failed"] })
      .notNull()
      .default("pending"),
    modelId: text("model_id").references(() => models.id, { onDelete: "set null" }),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("library_imports_status_idx").on(t.status, t.createdAt), index("library_imports_rel_idx").on(t.rel)],
);

/* ================================================================== */
/* Cài đặt chỉnh từ trang quản trị (ghi đè vars trong wrangler.jsonc)  */
/* ================================================================== */

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: ts("updated_at")
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date()),
});
