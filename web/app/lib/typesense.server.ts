// Client Typesense tối giản bằng fetch, đi qua Cloudflare Tunnel + Access.
import { env } from "cloudflare:workers";

export type SearchDoc = {
  id: string;
  slug: string;
  sku: string;
  title: string;
  /** Bản không dấu của title / các trường văn bản – để gõ không dấu vẫn khớp từ khoá */
  title_plain: string;
  text_plain: string;
  subtitle: string;
  description: string;
  content_text: string;
  tags: string[];
  category_id: string;
  category_path: string;
  category_ancestors: string[];
  style: string;
  render_engine: string;
  formats: string[];
  materials: string;
  price_vnd: number;
  is_free: boolean;
  published_at: number;
  /** Ảnh đại diện 400px – home-agent tải về để sinh image_embedding (CLIP) */
  cover_url: string;
};

function headers(): HeadersInit {
  const h: Record<string, string> = {
    "X-TYPESENSE-API-KEY": env.TYPESENSE_API_KEY,
    "Content-Type": "application/json",
  };
  if (env.CF_ACCESS_CLIENT_ID) {
    h["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    h["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }
  return h;
}

const base = () => `${env.TYPESENSE_URL}/collections/${env.TYPESENSE_COLLECTION}`;

export function typesenseEnabled() {
  return !!env.TYPESENSE_API_KEY && !env.TYPESENSE_URL.includes("example.com");
}

export async function tsUpsert(doc: SearchDoc) {
  // emplace (không phải upsert): giữ image_embedding / image_key do home-agent ghi
  const res = await fetch(`${base()}/documents?action=emplace`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(doc),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Typesense upsert ${res.status}: ${await res.text()}`);
}

export async function tsDelete(id: string) {
  const res = await fetch(`${base()}/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok && res.status !== 404) throw new Error(`Typesense delete ${res.status}`);
}

export type TsFacetCount = { value: string; count: number };
export type TsSearchResult = { ids: string[]; found: number; facets: Record<string, TsFacetCount[]> };

export async function tsSearch(params: Record<string, string>, timeoutMs = 2500): Promise<TsSearchResult> {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${base()}/documents/search?${qs}`, {
    headers: headers(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Typesense search ${res.status}`);
  const data = (await res.json()) as {
    found: number;
    hits: { document: { id: string } }[];
    facet_counts?: { field_name: string; counts: TsFacetCount[] }[];
  };
  const facets = Object.fromEntries(
    (data.facet_counts ?? []).map((f) => [f.field_name, f.counts.map(({ value, count }) => ({ value, count }))]),
  );
  return { ids: data.hits.map((h) => h.document.id), found: data.found, facets };
}

/** Tìm qua multi_search (POST) – cho tham số dài như ảnh base64 trong vector_query */
export async function tsSearchPost(params: Record<string, string>, timeoutMs = 8000): Promise<TsSearchResult> {
  const res = await fetch(`${env.TYPESENSE_URL}/multi_search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ searches: [{ collection: env.TYPESENSE_COLLECTION, ...params }] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Typesense search ${res.status}`);
  const data = (await res.json()) as {
    results: { found?: number; hits?: { document: { id: string } }[]; error?: string; code?: number }[];
  };
  const r = data.results[0];
  if (!r || r.error) throw new Error(`Typesense search ${r?.code ?? ""}: ${r?.error ?? "không có kết quả"}`);
  return { ids: (r.hits ?? []).map((h) => h.document.id), found: r.found ?? 0, facets: {} };
}

/** Giá trị trong filter_by của Typesense phải bọc backtick */
export const tsQuote = (v: string) => "`" + v.replace(/`/g, "") + "`";
