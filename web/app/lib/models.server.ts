import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb, schema } from "./db.server";
import { mediaVariantUrl } from "./r2.server";
import { tsQuote, tsSearch, typesenseEnabled, type SearchDoc } from "./typesense.server";
import { stripDiacritics } from "./format";

const { models, categories, modelImages, media, tags, modelTags, modelRelated } = schema;

export type ModelCard = {
  id: string;
  slug: string;
  sku: string | null;
  title: string;
  priceVnd: number;
  renderEngine: string | null;
  formats: string[];
  materials: string | null;
  style: string | null;
  coverUrl: string | null;
};

/** Lấy dữ liệu thẻ mẫu theo danh sách id, giữ nguyên thứ tự. anyStatus: cả bản nháp (trang admin) */
export async function getModelCards(ids: string[], { anyStatus = false } = {}): Promise<ModelCard[]> {
  if (!ids.length) return [];
  const db = getDb();
  const rows = await db
    .select({
      id: models.id,
      slug: models.slug,
      sku: models.sku,
      title: models.title,
      priceVnd: models.priceVnd,
      renderEngine: models.renderEngine,
      formats: models.formats,
      materials: models.materials,
      style: models.style,
    })
    .from(models)
    .where(and(inArray(models.id, ids), anyStatus ? undefined : eq(models.status, "published")));
  const covers = await getCovers(ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ ...r, formats: r.formats ?? [], coverUrl: covers.get(r.id) ?? null }));
}

export async function getCovers(ids: string[], width: 400 | 1200 = 400) {
  const out = new Map<string, string | null>();
  if (!ids.length) return out;
  const rows = await getDb()
    .select({
      modelId: modelImages.modelId,
      r2Key: media.r2Key,
      variants: media.variants,
      sortOrder: modelImages.sortOrder,
    })
    .from(modelImages)
    .innerJoin(media, eq(media.id, modelImages.mediaId))
    .where(inArray(modelImages.modelId, ids))
    .orderBy(asc(modelImages.sortOrder));
  for (const r of rows) if (!out.has(r.modelId)) out.set(r.modelId, mediaVariantUrl(r, width));
  return out;
}

export async function getModelBySlug(slug: string) {
  const db = getDb();
  const [row] = await db
    .select({ model: models, category: categories })
    .from(models)
    .innerJoin(categories, eq(categories.id, models.categoryId))
    .where(and(eq(models.slug, slug), eq(models.status, "published")))
    .limit(1);
  if (!row) return null;
  const [images, tagRows, ancestors] = await Promise.all([
    db
      .select({ id: media.id, r2Key: media.r2Key, variants: media.variants, alt: media.alt, caption: modelImages.caption })
      .from(modelImages)
      .innerJoin(media, eq(media.id, modelImages.mediaId))
      .where(eq(modelImages.modelId, row.model.id))
      .orderBy(asc(modelImages.sortOrder)),
    db
      .select({ name: tags.name, slug: tags.slug })
      .from(modelTags)
      .innerJoin(tags, eq(tags.id, modelTags.tagId))
      .where(eq(modelTags.modelId, row.model.id)),
    getAncestors(row.category.path, "model"),
  ]);
  return {
    ...row,
    images: images.map((i) => ({ ...i, url: mediaVariantUrl(i, 1200), urlLarge: mediaVariantUrl(i, 2000) })),
    tags: tagRows,
    ancestors,
  };
}

/* ------------------------------------------------------------------ */
/* Mẫu tương tự                                                        */
/* ------------------------------------------------------------------ */

export const RELATED_LIMIT = 8;

type RelatedSource = { id: string; categoryId: string; relatedAuto: boolean };

/** Id các mẫu admin chọn tay, theo thứ tự admin sắp. publishedOnly=false cho trang admin */
export async function getManualRelatedIds(modelId: string, publishedOnly = true) {
  const rows = await getDb()
    .select({ id: modelRelated.relatedId })
    .from(modelRelated)
    .innerJoin(models, eq(models.id, modelRelated.relatedId))
    .where(and(eq(modelRelated.modelId, modelId), publishedOnly ? eq(models.status, "published") : undefined))
    .orderBy(asc(modelRelated.sortOrder));
  return rows.map((r) => r.id);
}

/** Mục "Mẫu tương tự" trên trang mẫu: mẫu chọn tay trước, rồi hệ thống tự điền (nếu bật) cho đủ limit */
export async function getRelated(m: RelatedSource, limit = RELATED_LIMIT) {
  const ids = (await getManualRelatedIds(m.id)).slice(0, limit);
  if (m.relatedAuto && ids.length < limit) ids.push(...(await suggestRelated(m, limit - ids.length, ids)));
  return getModelCards(ids);
}

/**
 * Gợi ý tự động: mẫu có embedding gần nhất trong Typesense (cùng model ngữ nghĩa với ô tìm kiếm).
 * Typesense không phản hồi / mẫu chưa xuất bản -> D1: số tag chung + ưu tiên cùng thư mục.
 */
export async function suggestRelated(m: Pick<RelatedSource, "id" | "categoryId">, limit: number, exclude: string[] = []) {
  if (limit <= 0) return [];
  if (typesenseEnabled()) {
    try {
      const skip = [m.id, ...exclude];
      const res = await tsSearch(
        {
          q: "*",
          vector_query: `embedding:([], id: ${m.id}, k: ${limit + skip.length})`,
          filter_by: `id:!=[${skip.map(tsQuote).join(",")}]`,
          per_page: String(limit),
          include_fields: "id",
          exclude_fields: "embedding",
        },
        1500,
      );
      if (res.ids.length) return res.ids;
    } catch (err) {
      console.warn("Typesense không gợi ý được mẫu tương tự, dùng D1:", (err as Error).message);
    }
  }
  return suggestRelatedD1(m, limit, exclude);
}

async function suggestRelatedD1(m: Pick<RelatedSource, "id" | "categoryId">, limit: number, exclude: string[]) {
  const notIn = exclude.length ? sql`AND m.id NOT IN (${sql.join(exclude.map((id) => sql`${id}`), sql`, `)})` : sql``;
  const rows = await getDb().all<{ id: string }>(sql`
    WITH shared AS (
      SELECT b.model_id AS id, COUNT(*) AS n
      FROM model_tags a JOIN model_tags b ON b.tag_id = a.tag_id
      WHERE a.model_id = ${m.id} AND b.model_id != ${m.id}
      GROUP BY b.model_id
    )
    SELECT m.id AS id FROM models m LEFT JOIN shared s ON s.id = m.id
    WHERE m.status = 'published' AND m.id != ${m.id} ${notIn}
      AND (s.n IS NOT NULL OR m.category_id = ${m.categoryId})
    ORDER BY COALESCE(s.n, 0) + (CASE WHEN m.category_id = ${m.categoryId} THEN 3 ELSE 0 END) DESC, random()
    LIMIT ${limit}`);
  return rows.map((r) => r.id);
}

export async function getAncestors(path: string, kind: "model" | "post") {
  const parts = path.split("/").filter(Boolean);
  const paths = parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/") + "/");
  if (!paths.length) return [];
  const rows = await getDb()
    .select({ id: categories.id, name: categories.name, path: categories.path })
    .from(categories)
    .where(and(eq(categories.kind, kind), inArray(categories.path, paths)));
  return paths.map((p) => rows.find((r) => r.path === p)).filter((r): r is NonNullable<typeof r> => !!r);
}

/* ------------------------------------------------------------------ */
/* Đồng bộ tìm kiếm                                                    */
/* ------------------------------------------------------------------ */

export async function buildSearchDoc(modelId: string): Promise<SearchDoc | null> {
  const db = getDb();
  const [row] = await db
    .select({ m: models, c: categories })
    .from(models)
    .innerJoin(categories, eq(categories.id, models.categoryId))
    .where(eq(models.id, modelId))
    .limit(1);
  if (!row || row.m.status !== "published") return null;
  const [tagRows, covers] = await Promise.all([
    db
      .select({ name: tags.name })
      .from(modelTags)
      .innerJoin(tags, eq(tags.id, modelTags.tagId))
      .where(eq(modelTags.modelId, modelId)),
    getCovers([modelId]),
  ]);
  const parts = row.c.path.split("/").filter(Boolean);
  const contentText = (row.m.contentText ?? "").slice(0, 4000);
  const tagNames = tagRows.map((t) => t.name);
  return {
    id: row.m.id,
    slug: row.m.slug,
    sku: row.m.sku ?? "",
    title: row.m.title,
    title_plain: stripDiacritics(row.m.title),
    text_plain: stripDiacritics(
      [tagNames.join(" "), row.m.subtitle, row.m.description, row.m.materials, row.m.style, contentText]
        .filter(Boolean)
        .join(" \n"),
    ),
    subtitle: row.m.subtitle ?? "",
    description: row.m.description ?? "",
    content_text: contentText,
    tags: tagNames,
    category_id: row.c.id,
    category_path: row.c.path,
    category_ancestors: parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/") + "/"),
    style: row.m.style ?? "",
    render_engine: row.m.renderEngine ?? "",
    formats: row.m.formats ?? [],
    materials: row.m.materials ?? "",
    price_vnd: row.m.priceVnd,
    is_free: row.m.priceVnd === 0,
    published_at: Math.floor((row.m.publishedAt?.getTime() ?? 0) / 1000),
    cover_url: covers.get(modelId) ?? "",
  };
}

/** Cập nhật bảng FTS5 dự phòng (luôn chạy, không phụ thuộc máy nhà) */
export async function syncFts(modelId: string, doc: SearchDoc | null) {
  // dùng D1 batch trực tiếp: xoá rồi chèn trong cùng một giao dịch
  const del = env.DB.prepare("DELETE FROM models_fts WHERE model_id = ?").bind(modelId);
  if (!doc) {
    await del.run();
    return;
  }
  const ins = env.DB.prepare(
    "INSERT INTO models_fts (model_id, title, description, tags, body) VALUES (?, ?, ?, ?, ?)",
  ).bind(
    modelId,
    // tự bỏ dấu (kể cả đ → d, thứ tokenizer của SQLite không xử lý)
    stripDiacritics(`${doc.title} ${doc.subtitle}`),
    stripDiacritics(doc.description),
    stripDiacritics(`${doc.tags.join(" ")} ${doc.style} ${doc.materials}`),
    stripDiacritics(doc.content_text),
  );
  await env.DB.batch([del, ins]);
}

export type SearchSyncMessage = { modelId: string };

/** Gọi sau mỗi lần thêm/sửa/xoá mẫu: cập nhật FTS ngay, đưa việc Typesense vào hàng đợi */
export async function afterModelChanged(modelId: string) {
  const doc = await buildSearchDoc(modelId);
  await syncFts(modelId, doc);
  await env.SEARCH_QUEUE.send({ modelId } satisfies SearchSyncMessage);
}

export async function listPublishedModelIds(limit = 100000) {
  const rows = await getDb().select({ id: models.id }).from(models).orderBy(desc(models.updatedAt)).limit(limit);
  return rows.map((r) => r.id);
}
