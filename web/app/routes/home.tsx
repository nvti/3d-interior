import { useEffect, useRef, useState } from "react";
import { Form, Link, useFetcher, useNavigation, useSearchParams, useSubmit } from "react-router";
import { and, desc, eq } from "drizzle-orm";
import type { Route } from "./+types/home";
import { categoryCounts, getCategoryTree, type CategoryNode } from "~/lib/categories.server";
import {
  getFacets,
  ImageSearchError,
  parseSearchQuery,
  resolveTags,
  searchByImage,
  searchModels,
  type FacetOption,
} from "~/lib/search.server";
import { getDb, schema } from "~/lib/db.server";
import { mediaVariantUrl } from "~/lib/r2.server";
import { RENDER_ENGINES } from "~/lib/format";
import { imageToSearchJpeg } from "~/lib/image-upload.client";
import { ModelGrid } from "~/components/site";
import { IconArrow, IconCamera, IconSettings, IconX } from "~/components/icons";

export function meta({ loaderData: data }: Route.MetaArgs) {
  const t = data?.activeCat ? `${data.activeCat.name} – Thư viện mẫu 3D` : "Thư viện mẫu nội thất 3D";
  return [{ title: t }, { name: "description", content: "Mẫu nội thất 3D cho 3ds Max, V-Ray, Corona." }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = parseSearchQuery(url);
  const selectedTags = await resolveTags(q.tags);
  const [result, tree, counts, facets] = await Promise.all([
    searchModels(q, selectedTags),
    getCategoryTree("model"),
    categoryCounts(),
    getFacets(q.cat),
  ]);

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

  const isLanding = !q.q && !q.cat && !q.styles.length && !q.engines.length && !q.formats.length && !q.tags.length && q.price === "all" && q.page === 1;

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
    facets,
    selectedTags,
  };
}

/** Tìm bằng ảnh: ảnh JPEG base64 (trình duyệt đã thu nhỏ), bộ lọc lấy từ URL */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const image = String(form.get("image") ?? "");
  try {
    const q = parseSearchQuery(new URL(request.url));
    return { result: await searchByImage(q, await resolveTags(q.tags), image) };
  } catch (err) {
    if (err instanceof ImageSearchError) return { error: err.message };
    throw err;
  }
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
  const { query, roots, activeCat, trail, subTabs, isLanding, feature, facets, selectedTags } = loaderData;
  // giá trị đang chọn vẫn hiện (số 0) dù danh mục mới không còn mẫu nào khớp, để bỏ chọn được
  const withSelected = (opts: FacetOption[], selected: string[]) => [
    ...opts,
    ...selected.filter((v) => !opts.some((o) => o.value === v)).map((value) => ({ value, count: 0 })),
  ];
  const styleOpts = withSelected(facets.styles, query.styles);
  const engineOpts = withSelected(facets.engines, query.engines);
  const formatOpts = withSelected(facets.formats, query.formats);
  const showPrice = (facets.free > 0 && facets.paid > 0) || query.price !== "all";
  // tag: đang chọn lên đầu, sau đó là tag hay gặp trong kết quả hiện tại
  const tagOpts = [
    ...selectedTags.map((t) => ({ ...t, count: null as number | null })),
    ...(loaderData.result.tagFacets ?? []),
  ];
  const hasFacets = styleOpts.length + engineOpts.length + formatOpts.length + tagOpts.length > 0 || showPrice;
  const href = useParamHref();
  const submit = useSubmit();
  const nav = useNavigation();
  const loading = nav.state === "loading" && nav.location?.pathname === "/";
  const activeRoot = trail[0]?.path;
  const filterCount =
    query.styles.length + query.engines.length + query.formats.length + query.tags.length + (query.price !== "all" ? 1 : 0);
  const hasFilters = filterCount > 0;
  const [showFilters, setShowFilters] = useState(false);

  // Tìm bằng ảnh: giữ ảnh truy vấn trong state, tìm lại mỗi khi bộ lọc trên URL đổi
  const [params] = useSearchParams();
  const search = params.toString();
  const fetcher = useFetcher<typeof action>();
  const [imageQuery, setImageQuery] = useState<{ base64: string; dataUrl: string } | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const submitImage = fetcher.submit;
  useEffect(() => {
    if (!imageQuery) return;
    submitImage({ image: imageQuery.base64 }, { method: "post", action: `/?index${search ? "&" + search : ""}` });
  }, [imageQuery, search, submitImage]);

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setImageError(null);
    try {
      setImageQuery(await imageToSearchJpeg(file));
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setImageError((e as Error).message);
    }
  }

  const imageData = imageQuery ? fetcher.data : undefined;
  const imageMode = !!imageQuery;
  const shownError = imageError ?? imageData?.error ?? null;
  const result = imageData?.result ?? (imageMode ? { ...loaderData.result, items: [], found: 0, pages: 1 } : loaderData.result);
  const imageLoading = imageMode && fetcher.state !== "idle";

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
        <Form method="get" action="/" onSubmit={() => setImageQuery(null)} className="flex max-w-[1100px] flex-col gap-4">
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
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void pickImage(e.currentTarget.files?.[0]);
                e.currentTarget.value = ""; // chọn lại cùng ảnh vẫn tìm
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Tìm bằng ảnh"
              className="flex size-12 flex-none items-center justify-center gap-2 rounded-full border border-ink text-sm hover:bg-paper md:w-auto md:px-4"
            >
              <IconCamera /> <span className="hidden md:inline">Tìm bằng ảnh</span>
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

      <main ref={resultsRef} className="mx-auto flex max-w-[1440px] scroll-mt-4 flex-col gap-7 px-5 pt-16 pb-10 md:px-12 md:pt-[72px]">
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
            {imageQuery ? (
              <div className="flex items-center gap-4">
                <img src={imageQuery.dataUrl} alt="Ảnh đang tìm" className="size-16 flex-none rounded-lg object-cover md:size-20" />
                <h2 className="font-display text-[clamp(32px,4.4vw,48px)] font-medium leading-none tracking-[-0.03em]">
                  Mẫu giống ảnh{" "}
                  <sup className="align-super font-mono text-sm font-normal tracking-normal text-muted">
                    {imageLoading ? "…" : result.found}
                  </sup>
                </h2>
                <button
                  type="button"
                  onClick={() => setImageQuery(null)}
                  className="flex h-10 items-center gap-1.5 px-1.5 text-[13px] text-muted underline underline-offset-4"
                >
                  <IconX size={12} /> Bỏ ảnh
                </button>
              </div>
            ) : (
              <h2 className="font-display text-[clamp(36px,5vw,56px)] font-medium leading-none tracking-[-0.03em]">
                {query.q ? `“${query.q}”` : (activeCat?.name ?? "Tất cả mẫu")}{" "}
                <sup className="align-super font-mono text-sm font-normal tracking-normal text-muted">{result.found}</sup>
              </h2>
            )}
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

        <div className="flex items-center gap-2.5 border-y border-line py-3">
          {hasFacets && (
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-controls="filters"
              className={`pill lg:hidden ${hasFilters ? "pill-on" : ""}`}
            >
              <IconSettings size={16} /> Bộ lọc{filterCount > 0 && ` · ${filterCount}`}
            </button>
          )}
          <label className="ml-auto flex items-center gap-2 font-mono text-xs text-muted">
            Sắp xếp
            <select
              name="sort"
              form="filters"
              defaultValue={query.sort}
              key={query.sort}
              onChange={(e) => e.currentTarget.form && submit(e.currentTarget.form, { preventScrollReset: true })}
              className="h-10 cursor-pointer bg-transparent font-sans text-[13px] text-ink"
            >
              <option value="relevance">Liên quan nhất</option>
              <option value="newest">Mới nhất</option>
              <option value="price_asc">Giá tăng dần</option>
              <option value="price_desc">Giá giảm dần</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
        {/* Bộ lọc lấy theo dữ liệu mẫu đang có: cột trái trên desktop, bấm nút "Bộ lọc" để mở trên mobile */}
        <Form
          id="filters"
          method="get"
          action="/"
          key={search}
          onChange={(e) => submit(e.currentTarget, { preventScrollReset: true })}
          className={
            hasFacets
              ? `${showFilters ? "flex" : "hidden"} flex-col gap-9 lg:sticky lg:top-6 lg:flex lg:w-52 lg:flex-none`
              : "hidden" // vẫn giữ form để ô Sắp xếp gửi kèm q/cat
          }
        >
          {query.q && <input type="hidden" name="q" value={query.q} />}
          {query.cat && <input type="hidden" name="cat" value={query.cat} />}
          {styleOpts.length > 0 && (
            <FilterGroup title="Phong cách">
              <div className="flex flex-col gap-1">
                {styleOpts.map((o) => (
                  <label key={o.value} className="flex min-h-9 cursor-pointer items-center gap-3 text-[15px]">
                    <input
                      type="checkbox"
                      name="style"
                      value={o.value}
                      defaultChecked={query.styles.includes(o.value)}
                      className="size-[18px] flex-none accent-ink"
                    />
                    <span className="flex-1">{o.value}</span>
                    <FacetCount n={o.count} />
                  </label>
                ))}
              </div>
            </FilterGroup>
          )}
          {engineOpts.length > 0 && (
            <FilterGroup title="Render">
              <div className="flex flex-wrap gap-2 lg:flex-col lg:items-start">
                {engineOpts.map((o) => (
                  <ToggleChip
                    key={o.value}
                    name="engine"
                    value={o.value}
                    checked={query.engines.includes(o.value)}
                    className="h-10 rounded-full px-4 text-[15px] font-medium"
                  >
                    <EngineLogo engine={o.value} /> {RENDER_ENGINES[o.value] ?? o.value} <FacetCount n={o.count} />
                  </ToggleChip>
                ))}
              </div>
            </FilterGroup>
          )}
          {tagOpts.length > 0 && <TagFilter options={tagOpts} selected={query.tags} />}
          {formatOpts.length > 0 && (
            <FilterGroup title="Định dạng">
              <div className="flex flex-wrap gap-2">
                {formatOpts.map((o) => (
                  <ToggleChip
                    key={o.value}
                    name="format"
                    value={o.value}
                    checked={query.formats.includes(o.value)}
                    className="h-9 rounded-md px-3 font-mono text-[13px]"
                  >
                    {o.value} <FacetCount n={o.count} />
                  </ToggleChip>
                ))}
              </div>
            </FilterGroup>
          )}
          {showPrice && (
            <FilterGroup title="Giá">
              <div className="flex flex-wrap gap-2">
                {[
                  ["all", "Tất cả"],
                  ["free", "Miễn phí"],
                  ["paid", "Có phí"],
                ].map(([v, l]) => (
                  <ToggleChip key={v} type="radio" name="price" value={v} checked={query.price === v} className="h-9 rounded-md px-3 text-[13px]">
                    {l}
                  </ToggleChip>
                ))}
              </div>
            </FilterGroup>
          )}
          {hasFilters && (
            <Link
              to={href({ style: null, engine: null, format: null, tag: null, price: null })}
              preventScrollReset
              className="flex items-center gap-1.5 self-start text-[13px] text-muted underline underline-offset-4"
            >
              <IconX size={12} /> Xoá lọc
            </Link>
          )}
        </Form>

        <div className={`min-w-0 flex-1 transition-opacity ${loading || imageLoading ? "opacity-50" : ""}`}>
          {shownError ? (
            <div role="alert" className="flex flex-col items-start gap-4 py-16">
              <p className="font-serif text-3xl italic">Không tìm được bằng ảnh.</p>
              <p className="text-sm text-muted">{shownError}</p>
            </div>
          ) : result.items.length ? (
            <ModelGrid items={result.items.slice(0, half)} />
          ) : imageMode ? (
            <div className="flex flex-col items-start gap-4 py-16">
              <p className="font-serif text-3xl italic">{imageLoading ? "Đang tìm mẫu giống ảnh…" : "Chưa thấy mẫu giống ảnh này."}</p>
              {!imageLoading && <p className="text-sm text-muted">Thử ảnh khác rõ vật thể hơn, hoặc bỏ bớt bộ lọc.</p>}
            </div>
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
        </div>
      </main>

      {feature && !imageMode && (
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
        <div className="mx-auto flex max-w-[1440px] gap-12 px-5 pt-6 md:px-12">
          {/* chừa chỗ cột lọc để lưới thẳng hàng với nửa trên */}
          {hasFacets && <div aria-hidden className="hidden w-52 flex-none lg:block" />}
          <div className="min-w-0 flex-1">
            <ModelGrid items={result.items.slice(half)} offset={half} />
          </div>
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

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 font-display text-lg font-medium tracking-tight">{title}</legend>
      {children}
    </fieldset>
  );
}

const TAGS_SHOWN = 12;

function TagFilter({ options, selected }: { options: { slug: string; name: string; count: number | null }[]; selected: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? options : options.slice(0, Math.max(TAGS_SHOWN, selected.length));
  return (
    <FilterGroup title="Thẻ">
      <div className="flex flex-wrap gap-1.5">
        {shown.map((t) => (
          <ToggleChip key={t.slug} name="tag" value={t.slug} checked={selected.includes(t.slug)} className="h-8 rounded-full px-3 text-[13px]">
            {t.name}
            {t.count !== null && <FacetCount n={t.count} />}
          </ToggleChip>
        ))}
      </div>
      {options.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="self-start text-[13px] text-muted underline underline-offset-4">
          Xem thêm {options.length - shown.length} thẻ
        </button>
      )}
    </FilterGroup>
  );
}

function FacetCount({ n }: { n: number }) {
  return <span className="font-mono text-xs tabular-nums opacity-60">{n}</span>;
}

/** Nút bật/tắt dạng chip, bên trong là checkbox/radio thật để form gửi đi */
function ToggleChip({
  type = "checkbox",
  name,
  value,
  checked,
  className,
  children,
}: {
  type?: "checkbox" | "radio";
  name: string;
  value: string;
  checked: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 bg-paper select-none hover:bg-tone-1/60 has-checked:bg-ink has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink ${className}`}
    >
      <input type={type} name={name} value={value} defaultChecked={checked} className="sr-only" />
      {children}
    </label>
  );
}

/** Logo rút gọn của engine render */
function EngineLogo({ engine }: { engine: string }) {
  if (engine === "vray")
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="9" fill="#2B57C5" />
        <path d="M5.5 6h2.6l1.9 5.4L12 6h2.5l-3.3 8.2H8.8z" fill="#fff" />
      </svg>
    );
  if (engine === "corona")
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="6.2" fill="none" stroke="#F0561D" strokeWidth="3.2" strokeDasharray="33 6" transform="rotate(20 10 10)" />
      </svg>
    );
  return null;
}
