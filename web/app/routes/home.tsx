import { Form, Link, useNavigation, useSearchParams, useSubmit } from "react-router";
import { and, desc, eq } from "drizzle-orm";
import type { Route } from "./+types/home";
import { categoryCounts, getCategoryTree, type CategoryNode } from "~/lib/categories.server";
import { parseSearchQuery, searchModels } from "~/lib/search.server";
import { getDb, schema } from "~/lib/db.server";
import { mediaVariantUrl } from "~/lib/r2.server";
import { FORMATS, RENDER_ENGINES, STYLES } from "~/lib/format";
import { ModelGrid } from "~/components/site";
import { IconArrow, IconCamera, IconChevron, IconX } from "~/components/icons";

export function meta({ loaderData: data }: Route.MetaArgs) {
  const t = data?.activeCat ? `${data.activeCat.name} – Thư viện mẫu 3D` : "Thư viện mẫu nội thất 3D";
  return [{ title: t }, { name: "description", content: "Mẫu nội thất 3D cho 3ds Max, V-Ray, Corona." }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = parseSearchQuery(url);
  const [result, tree, counts] = await Promise.all([searchModels(q), getCategoryTree("model"), categoryCounts()]);

  const findByPath = (nodes: CategoryNode[], path: string): CategoryNode | null => {
    for (const n of nodes) {
      if (n.path === path) return n;
      if (path.startsWith(n.path)) return findByPath(n.children, path);
    }
    return null;
  };
  const active = q.cat ? findByPath(tree, q.cat) : null;
  const trail: { name: string; path: string }[] = [];
  if (active) {
    let nodes = tree;
    for (const seg of active.path.split("/").filter(Boolean)) {
      const p = (trail.at(-1)?.path ?? "/") + seg + "/";
      const n = nodes.find((x) => x.path === p);
      if (!n) break;
      trail.push({ name: n.name, path: n.path });
      nodes = n.children;
    }
  }
  const parentOfActive = active?.parentId ? findByPath(tree, trail.at(-2)?.path ?? "") : null;
  // tab danh mục con: con của mục đang chọn, hoặc anh em nếu mục đang chọn là lá
  const subTabs = active
    ? active.children.length
      ? { parent: active, list: active.children }
      : { parent: parentOfActive, list: parentOfActive?.children ?? [] }
    : null;

  const isLanding = !q.q && !q.cat && !q.styles.length && !q.engines.length && !q.formats.length && q.price === "all" && q.page === 1;

  let feature: { title: string; excerpt: string | null; slug: string; cover: string | null } | null = null;
  if (isLanding) {
    const [p] = await getDb()
      .select({ title: schema.posts.title, excerpt: schema.posts.excerpt, slug: schema.posts.slug, r2Key: schema.media.r2Key, variants: schema.media.variants })
      .from(schema.posts)
      .leftJoin(schema.media, eq(schema.media.id, schema.posts.coverMediaId))
      .where(and(eq(schema.posts.type, "post"), eq(schema.posts.status, "published")))
      .orderBy(desc(schema.posts.publishedAt))
      .limit(1);
    if (p) feature = { title: p.title, excerpt: p.excerpt, slug: p.slug, cover: p.r2Key ? mediaVariantUrl({ r2Key: p.r2Key, variants: p.variants }, 1200) : null };
  }

  return {
    query: q,
    result,
    total: tree.reduce((s, n) => s + (counts[n.path] ?? 0), 0),
    roots: tree.map((n) => ({ name: n.name, path: n.path, count: counts[n.path] ?? 0 })),
    activeCat: active ? { name: active.name, path: active.path } : null,
    trail,
    subTabs: subTabs
      ? {
          parent: subTabs.parent ? { name: subTabs.parent.name, path: subTabs.parent.path } : null,
          list: subTabs.list.map((c) => ({ name: c.name, path: c.path, count: counts[c.path] ?? 0 })),
        }
      : null,
    isLanding,
    feature,
  };
}

function useParamHref() {
  const [params] = useSearchParams();
  return (changes: Record<string, string | string[] | null>) => {
    const p = new URLSearchParams(params);
    p.delete("page");
    for (const [k, v] of Object.entries(changes)) {
      p.delete(k);
      if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
      else if (v !== null && v !== "") p.set(k, v);
    }
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { query, result, roots, activeCat, trail, subTabs, isLanding, feature } = loaderData;
  const href = useParamHref();
  const submit = useSubmit();
  const nav = useNavigation();
  const loading = nav.state === "loading" && nav.location?.pathname === "/";
  const activeRoot = trail[0]?.path;
  const hasFilters = query.styles.length + query.engines.length + query.formats.length > 0 || query.price !== "all";

  const half = Math.min(8, result.items.length);
  return (
    <>
      {/* Hero + ô tìm kiếm */}
      <section className="mx-auto flex max-w-[1440px] flex-col gap-10 px-5 pt-16 pb-14 md:px-12 md:pt-20">
        {isLanding && (
          <>
            <div className="flex flex-wrap justify-between gap-3 font-mono text-xs text-muted">
              <span>{loaderData.total} mẫu · cập nhật thường xuyên</span>
              <span>V-Ray · Corona · .max · .fbx · .obj</span>
            </div>
            <h1 className="max-w-[1100px] font-display text-[clamp(44px,6.4vw,96px)] font-medium leading-[0.98] tracking-[-0.035em]">
              Thư viện mẫu nội thất 3D{" "}
              <span className="font-serif font-normal italic tracking-[-0.01em]">cho người làm không gian.</span>
            </h1>
          </>
        )}
        <Form method="get" action="/" className="flex max-w-[1100px] flex-col gap-4">
          {query.cat && <input type="hidden" name="cat" value={query.cat} />}
          <div className="flex items-center gap-3 border-b-[1.5px] border-ink pb-3.5 md:gap-4">
            <label className="flex min-w-0 flex-1">
              <span className="sr-only">Tìm mẫu</span>
              <input
                type="search"
                name="q"
                defaultValue={query.q}
                key={query.q}
                placeholder="Mô tả thứ bạn cần — “ghế gỗ uốn cong, nệm vải bố”"
                className="min-w-0 flex-1 bg-transparent font-display text-xl tracking-tight outline-none md:text-2xl"
              />
            </label>
            <button
              type="button"
              disabled
              title="Sắp ra mắt"
              className="hidden h-12 items-center gap-2 rounded-full border border-ink px-4 text-sm opacity-60 md:flex"
            >
              <IconCamera /> Tìm bằng ảnh
            </button>
            <button type="submit" aria-label="Tìm" className="flex size-12 flex-none items-center justify-center rounded-full bg-ink text-white">
              <IconArrow />
            </button>
          </div>
          {isLanding && (
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <span className="label-mono pt-0.5 text-xs">Gợi ý</span>
              {["Japandi", "Đèn thả mây tre", "Sofa module", "Indochine", "Bàn ăn gỗ óc chó"].map((s) => (
                <Link key={s} to={`/?q=${encodeURIComponent(s)}`} className="hover:text-muted">
                  {s}
                </Link>
              ))}
            </div>
          )}
        </Form>
      </section>

      {/* Chỉ mục danh mục gốc */}
      {roots.length > 0 && (
        <nav aria-label="Danh mục chính" className="mx-auto max-w-[1440px] px-5 md:px-12">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] border-t border-ink">
            {roots.map((c, i) => (
              <Link
                key={c.path}
                to={href({ cat: c.path, q: null })}
                className="flex flex-col gap-5 border-b border-line py-4 pr-4 pb-5 hover:bg-paper/60"
                aria-current={activeRoot === c.path ? "page" : undefined}
              >
                <span className="flex justify-between font-mono text-[11px] text-muted">
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span>{c.count}</span>
                </span>
                <span className="flex items-center gap-2 font-display text-xl font-medium tracking-tight">
                  {c.name}
                  {activeRoot === c.path && <span aria-hidden className="inline-block size-[7px] rounded-full bg-accent" />}
                </span>
              </Link>
            ))}
          </div>
        </nav>
      )}

      <main className="mx-auto flex max-w-[1440px] flex-col gap-7 px-5 pt-16 pb-10 md:px-12 md:pt-[72px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex flex-col gap-3">
            <span className="font-mono text-xs text-muted">
              <Link to="/">Thư viện</Link>
              {trail.map((t) => (
                <span key={t.path}>
                  {" / "}
                  <Link to={href({ cat: t.path })}>{t.name}</Link>
                </span>
              ))}
            </span>
            <h2 className="font-display text-[clamp(36px,5vw,56px)] font-medium leading-none tracking-[-0.03em]">
              {query.q ? `“${query.q}”` : (activeCat?.name ?? "Tất cả mẫu")}{" "}
              <sup className="align-super font-mono text-sm font-normal tracking-normal text-muted">{result.found}</sup>
            </h2>
          </div>
          {subTabs && subTabs.list.length > 0 && (
            <div role="tablist" aria-label="Danh mục con" className="flex flex-wrap gap-6 text-sm">
              {subTabs.parent && (
                <Link
                  role="tab"
                  aria-selected={activeCat?.path === subTabs.parent.path}
                  to={href({ cat: subTabs.parent.path })}
                  className={`flex h-10 items-center ${activeCat?.path === subTabs.parent.path ? "border-b-[1.5px] border-ink" : "text-muted hover:text-ink"}`}
                >
                  Tất cả
                </Link>
              )}
              {subTabs.list.map((c) => (
                <Link
                  key={c.path}
                  role="tab"
                  aria-selected={activeCat?.path === c.path}
                  to={href({ cat: c.path })}
                  className={`flex h-10 items-center ${activeCat?.path === c.path ? "border-b-[1.5px] border-ink" : "text-muted hover:text-ink"}`}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Bộ lọc */}
        <Form
          method="get"
          action="/"
          onChange={(e) => submit(e.currentTarget, { preventScrollReset: true })}
          className="flex flex-wrap items-center gap-2.5 border-y border-line py-3"
        >
          {query.q && <input type="hidden" name="q" value={query.q} />}
          {query.cat && <input type="hidden" name="cat" value={query.cat} />}
          <FilterMenu label="Phong cách" name="style" options={STYLES.map((s) => [s, s])} selected={query.styles} />
          <FilterMenu
            label="Render"
            name="engine"
            options={Object.entries(RENDER_ENGINES).filter(([k]) => k !== "other")}
            selected={query.engines}
          />
          <FilterMenu label="Định dạng" name="format" options={FORMATS.map((f) => [f, f])} selected={query.formats} mono />
          <details className="relative">
            <summary className={`pill list-none ${query.price !== "all" ? "pill-on" : ""}`}>
              Giá{query.price === "free" ? " · Miễn phí" : query.price === "paid" ? " · Có phí" : ""} <IconChevron />
            </summary>
            <div className="absolute left-0 z-20 mt-2 flex w-48 flex-col gap-1 rounded-xl border border-line bg-white p-3 shadow-sm">
              {[
                ["all", "Tất cả"],
                ["free", "Miễn phí"],
                ["paid", "Có phí"],
              ].map(([v, l]) => (
                <label key={v} className="flex min-h-9 items-center gap-2.5 text-sm">
                  <input type="radio" name="price" value={v} defaultChecked={query.price === v} className="size-4 accent-ink" />
                  {l}
                </label>
              ))}
            </div>
          </details>
          {hasFilters && (
            <Link to={href({ style: null, engine: null, format: null, price: null })} className="flex h-10 items-center gap-1.5 px-1.5 text-[13px] text-muted underline underline-offset-4">
              <IconX size={12} /> Xoá lọc
            </Link>
          )}
          <label className="ml-auto flex items-center gap-2 font-mono text-xs text-muted">
            Sắp xếp
            <select name="sort" defaultValue={query.sort} className="h-10 cursor-pointer bg-transparent font-sans text-[13px] text-ink">
              <option value="relevance">Liên quan nhất</option>
              <option value="newest">Mới nhất</option>
              <option value="price_asc">Giá tăng dần</option>
              <option value="price_desc">Giá giảm dần</option>
            </select>
          </label>
        </Form>

        <div className={`pt-3 transition-opacity ${loading ? "opacity-50" : ""}`}>
          {result.items.length ? (
            <ModelGrid items={result.items.slice(0, half)} />
          ) : (
            <div className="flex flex-col items-start gap-4 py-16">
              <p className="font-serif text-3xl italic">Chưa tìm thấy mẫu phù hợp.</p>
              <p className="text-sm text-muted">Thử mô tả theo cách khác, hoặc bỏ bớt bộ lọc.</p>
              <Link to="/" className="btn-outline btn-sm">
                Xem tất cả mẫu
              </Link>
            </div>
          )}
        </div>
      </main>

      {feature && (
        <section aria-label="Tạp chí" className="my-12 bg-ink text-ground">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-end gap-12 px-5 py-[72px] md:px-12">
            <div className="flex flex-[1_1_340px] flex-col gap-5">
              <span className="font-mono text-xs text-[#A8A6A0]">Tạp chí</span>
              <h2 className="font-serif text-[clamp(40px,5vw,64px)] font-normal italic leading-none">{feature.title}</h2>
              {feature.excerpt && <p className="max-w-[420px] text-[15px] leading-relaxed text-[#C9C7C1]">{feature.excerpt}</p>}
              <Link to={`/blog/${feature.slug}`} className="btn self-start bg-ground text-ink hover:bg-white">
                Đọc bài <IconArrow size={16} />
              </Link>
            </div>
            <div className="relative aspect-[16/10] flex-[2_1_520px] bg-[#3A3936]">
              {feature.cover && <img src={feature.cover} alt="" className="absolute inset-0 size-full object-cover" />}
            </div>
          </div>
        </section>
      )}

      {result.items.length > half && (
        <div className="mx-auto max-w-[1440px] px-5 pt-6 md:px-12">
          <ModelGrid items={result.items.slice(half)} offset={half} />
        </div>
      )}

      {result.pages > 1 && (
        <nav aria-label="Phân trang" className="mx-auto flex max-w-[1440px] flex-col items-center gap-3.5 px-5 pt-14 pb-10 md:px-12">
          <span className="label-mono text-xs">
            Trang {result.page} / {result.pages}
          </span>
          <div className="flex gap-2.5">
            {result.page > 1 && <PageLink page={result.page - 1} label="Trang trước" />}
            {result.page < result.pages && (
              <PageLink page={result.page + 1} label="Trang sau" />
            )}
          </div>
        </nav>
      )}
    </>
  );
}

function PageLink({ page, label }: { page: number; label: string }) {
  const [params] = useSearchParams();
  const p = new URLSearchParams(params);
  p.set("page", String(page));
  return (
    <Link to={`/?${p}`} className="btn-outline">
      {label}
    </Link>
  );
}

function FilterMenu({
  label,
  name,
  options,
  selected,
  mono,
}: {
  label: string;
  name: string;
  options: [string, string][];
  selected: string[];
  mono?: boolean;
}) {
  const on = selected.length > 0;
  const summary = on ? options.filter(([v]) => selected.includes(v)).map(([, l]) => l).join(", ") : "";
  return (
    <details className="relative">
      <summary className={`pill list-none ${on ? "pill-on" : ""}`}>
        {label}
        {on && <span className="max-w-40 truncate"> · {summary}</span>} <IconChevron />
      </summary>
      <div className="absolute left-0 z-20 mt-2 flex w-56 flex-col gap-1 rounded-xl border border-line bg-white p-3 shadow-sm">
        {options.map(([v, l]) => (
          <label key={v} className={`flex min-h-9 items-center gap-2.5 text-sm ${mono ? "font-mono text-[13px]" : ""}`}>
            <input type="checkbox" name={name} value={v} defaultChecked={selected.includes(v)} className="size-4 accent-ink" />
            {l}
          </label>
        ))}
      </div>
    </details>
  );
}
