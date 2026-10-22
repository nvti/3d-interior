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
  const res = await fetch(`${base()}/documents?action=upsert`, {
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

export type TsSearchResult = { ids: string[]; found: number };

export async function tsSearch(params: Record<string, string>, timeoutMs = 2500): Promise<TsSearchResult> {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${base()}/documents/search?${qs}`, {
    headers: headers(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Typesense search ${res.status}`);
  const data = (await res.json()) as { found: number; hits: { document: { id: string } }[] };
  return { ids: data.hits.map((h) => h.document.id), found: data.found };
}

/** Giá trị trong filter_by của Typesense phải bọc backtick */
export const tsQuote = (v: string) => "`" + v.replace(/`/g, "") + "`";
