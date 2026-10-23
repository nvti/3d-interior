// Tìm kiếm mẫu: ưu tiên Typesense (hybrid từ khoá + ngữ nghĩa),
// tự chuyển sang D1 FTS5 khi máy nhà không phản hồi.
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "./db.server";
import { getModelCards, type ModelCard } from "./models.server";
import { tsQuote, tsSearch, tsSearchPost, typesenseEnabled } from "./typesense.server";
import { stripDiacritics } from "./format";

export const PAGE_SIZE = 24;

export type SearchQuery = {
  q: string;
  cat: string | null; // path danh mục, vd "/noi-that/phong-khach/"
  styles: string[];
  engines: string[];
  formats: string[];
  price: "all" | "free" | "paid";
  sort: "relevance" | "newest" | "price_asc" | "price_desc";
  page: number;
};

export function parseSearchQuery(url: URL): SearchQuery {
  const p = url.searchParams;
  const sort = p.get("sort");
  const price = p.get("price");
  return {
    q: (p.get("q") ?? "").trim().slice(0, 200),
    cat: p.get("cat"),
    styles: p.getAll("style").slice(0, 10),
    engines: p.getAll("engine").slice(0, 5),
    formats: p.getAll("format").slice(0, 10),
    price: price === "free" || price === "paid" ? price : "all",
    sort: sort === "newest" || sort === "price_asc" || sort === "price_desc" ? sort : "relevance",
    page: Math.max(1, Math.min(500, Number(p.get("page")) || 1)),
  };
}

export type FacetOption = { value: string; count: number };
export type Facets = { styles: FacetOption[]; engines: FacetOption[]; formats: FacetOption[]; free: number; paid: number };

/** Các giá trị lọc đang có trong mẫu đã đăng (trong danh mục đang xem), kèm số mẫu – nhiều nhất trước */
export async function getFacets(cat: string | null): Promise<Facets> {
  const db = getDb();
  const scope = cat
    ? sql`m.status = 'published' AND m.category_id IN (SELECT id FROM categories WHERE path LIKE ${cat + "%"})`
    : sql`m.status = 'published'`;
  const rows = await db.all<{ k: string; v: string | number | null; n: number }>(sql`
    SELECT 'style' AS k, m.style AS v, COUNT(*) AS n FROM models m WHERE ${scope} AND m.style IS NOT NULL AND m.style != '' GROUP BY m.style
    UNION ALL SELECT 'engine', m.render_engine, COUNT(*) FROM models m WHERE ${scope} AND m.render_engine IS NOT NULL GROUP BY m.render_engine
    UNION ALL SELECT 'format', j.value, COUNT(*) FROM models m, json_each(m.formats) j WHERE ${scope} GROUP BY j.value
    UNION ALL SELECT 'free', m.price_vnd = 0, COUNT(*) FROM models m WHERE ${scope} GROUP BY m.price_vnd = 0
    ORDER BY 3 DESC`);
  const pick = (k: string) => rows.filter((r) => r.k === k).map((r) => ({ value: String(r.v), count: r.n }));
  return {
    styles: pick("style"),
    engines: pick("engine"),
    formats: pick("format"),
    free: rows.find((r) => r.k === "free" && r.v === 1)?.n ?? 0,
    paid: rows.find((r) => r.k === "free" && r.v === 0)?.n ?? 0,
  };
}

export type SearchResult = {
  items: ModelCard[];
  found: number;
  page: number;
  pages: number;
  source: "typesense" | "d1";
};

export async function searchModels(q: SearchQuery): Promise<SearchResult> {
  if (typesenseEnabled()) {
    try {
      return await searchTypesense(q);
    } catch (err) {
      console.warn("Typesense không phản hồi, dùng D1 FTS5:", (err as Error).message);
    }
  }
  return searchD1(q);
}

function tsFilters(q: SearchQuery): string[] {
  const filters: string[] = [];
  if (q.cat) filters.push(`category_ancestors:=${tsQuote(q.cat)}`);
  if (q.styles.length) filters.push(`style:=[${q.styles.map(tsQuote).join(",")}]`);
  if (q.engines.length) filters.push(`render_engine:=[${q.engines.map(tsQuote).join(",")}]`);
  if (q.formats.length) filters.push(`formats:=[${q.formats.map(tsQuote).join(",")}]`);
  if (q.price === "free") filters.push("is_free:=true");
  if (q.price === "paid") filters.push("is_free:=false");
  return filters;
}

async function searchTypesense(q: SearchQuery): Promise<SearchResult> {
  const filters = tsFilters(q);

  const sortBy =
    q.sort === "newest"
      ? "published_at:desc"
      : q.sort === "price_asc"
        ? "price_vnd:asc"
        : q.sort === "price_desc"
          ? "price_vnd:desc"
          : q.q
            ? "_text_match:desc"
            : "published_at:desc";

  const params: Record<string, string> = {
    q: q.q || "*",
    // *_plain: bản không dấu – "giuong" khớp "Giường"; câu có dấu vẫn khớp các trường gốc
    query_by: q.q ? "title,title_plain,tags,subtitle,description,content_text,text_plain,embedding" : "title",
    sort_by: sortBy,
    per_page: String(PAGE_SIZE),
    page: String(q.page),
    exclude_fields: "embedding",
    include_fields: "id",
  };
  if (q.q) {
    params.vector_query = "embedding:([], alpha: 0.35)"; // 0.35 = nghiêng về từ khoá
    // khớp đủ từ chưa đủ một trang -> bỏ bớt từ để lấy thêm mẫu khớp một phần (xếp sau)
    params.drop_tokens_threshold = String(PAGE_SIZE);
  }
  if (filters.length) params.filter_by = filters.join(" && ");

  const res = await tsSearch(params);
  const items = await getModelCards(res.ids);
  return { items, found: res.found, page: q.page, pages: Math.ceil(res.found / PAGE_SIZE), source: "typesense" };
}

export const IMAGE_SEARCH_LIMIT = 48;
/** Ảnh truy vấn: JPEG base64 do trình duyệt thu nhỏ sẵn (~30 KB) */
const MAX_IMAGE_B64 = 600_000;

export class ImageSearchError extends Error {}

/**
 * Tìm bằng ảnh: Typesense sinh embedding CLIP cho ảnh truy vấn, so với image_embedding của các mẫu.
 * Không có bản dự phòng D1 – máy nhà không phản hồi thì báo lỗi. Bộ lọc vẫn áp dụng, không phân trang.
 */
export async function searchByImage(q: SearchQuery, imageB64: string): Promise<SearchResult> {
  if (!imageB64 || imageB64.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageB64)) {
    throw new ImageSearchError("Ảnh không hợp lệ hoặc quá lớn.");
  }
  if (!typesenseEnabled()) throw new ImageSearchError("Tìm bằng ảnh tạm thời không khả dụng.");
  const filters = tsFilters(q);
  const params: Record<string, string> = {
    q: "*",
    vector_query: `image_embedding:([], image:${imageB64}, k: ${IMAGE_SEARCH_LIMIT})`,
    per_page: String(IMAGE_SEARCH_LIMIT),
    include_fields: "id",
    exclude_fields: "embedding,image_embedding",
  };
  if (filters.length) params.filter_by = filters.join(" && ");
  let res;
  try {
    res = await tsSearchPost(params);
  } catch (err) {
    console.warn("Tìm bằng ảnh lỗi:", (err as Error).message);
    throw new ImageSearchError("Máy chủ tìm kiếm không phản hồi, thử lại sau.");
  }
  const items = await getModelCards(res.ids);
  return { items, found: items.length, page: 1, pages: 1, source: "typesense" };
}

function ftsTokens(input: string): string[] {
  return stripDiacritics(input)
    .replace(/["'*^():]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .slice(0, 8);
}

/** "all": khớp đủ mọi từ · "any": khớp ít nhất một từ (bm25 xếp mẫu khớp nhiều từ lên trước) */
function ftsMatch(tokens: string[], mode: "all" | "any"): string | null {
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t}"*`).join(mode === "all" ? " " : " OR ");
}

async function searchD1(q: SearchQuery): Promise<SearchResult> {
  const tokens = q.q ? ftsTokens(q.q) : [];
  const strict = await searchD1With(q, ftsMatch(tokens, "all"));
  // giống drop_tokens của Typesense: ít kết quả khớp đủ từ thì nới ra khớp một phần
  if (tokens.length > 1 && strict.found < PAGE_SIZE) return searchD1With(q, ftsMatch(tokens, "any"));
  return strict;
}

async function searchD1With(q: SearchQuery, match: string | null): Promise<SearchResult> {
  const db = getDb();
  const where: SQL[] = [sql`m.status = 'published'`];

  if (q.cat) where.push(sql`c.path LIKE ${q.cat + "%"}`);
  if (q.styles.length) where.push(sql`m.style IN (${sql.join(q.styles.map((s) => sql`${s}`), sql`, `)})`);
  if (q.engines.length)
    where.push(sql`m.render_engine IN (${sql.join(q.engines.map((s) => sql`${s}`), sql`, `)})`);
  if (q.formats.length)
    where.push(
      sql`EXISTS (SELECT 1 FROM json_each(m.formats) j WHERE j.value IN (${sql.join(
        q.formats.map((s) => sql`${s}`),
        sql`, `,
      )}))`,
    );
  if (q.price === "free") where.push(sql`m.price_vnd = 0`);
  if (q.price === "paid") where.push(sql`m.price_vnd > 0`);

  const from = match
    ? sql`models_fts f JOIN models m ON m.id = f.model_id JOIN categories c ON c.id = m.category_id`
    : sql`models m JOIN categories c ON c.id = m.category_id`;
  if (match) where.push(sql`models_fts MATCH ${match}`);
  const whereSql = sql.join(where, sql` AND `);

  const order =
    q.sort === "newest"
      ? sql`m.published_at DESC`
      : q.sort === "price_asc"
        ? sql`m.price_vnd ASC`
        : q.sort === "price_desc"
          ? sql`m.price_vnd DESC`
          : match
            ? sql`bm25(models_fts, 0, 5.0, 1.0, 3.0, 0.5)`
            : sql`m.published_at DESC`;

  const offset = (q.page - 1) * PAGE_SIZE;
  const [rows, countRows] = await Promise.all([
    db.all<{ id: string }>(
      sql`SELECT m.id AS id FROM ${from} WHERE ${whereSql} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    ),
    db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ${from} WHERE ${whereSql}`),
  ]);
  const found = countRows[0]?.n ?? 0;
  const items = await getModelCards(rows.map((r) => r.id));
  return { items, found, page: q.page, pages: Math.ceil(found / PAGE_SIZE), source: "d1" };
}
