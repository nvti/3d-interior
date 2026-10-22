import { Link, useNavigate } from "react-router";
import { and, eq } from "drizzle-orm";
import { useState } from "react";
import type { Route } from "./+types/model";
import { getModelBySlug, getRelated } from "~/lib/models.server";
import { getUser } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { cart, useCart } from "~/lib/cart";
import { formatBytes, formatPrice, RENDER_ENGINES } from "~/lib/format";
import { ModelGrid, Placeholder } from "~/components/site";
import { IconArrow } from "~/components/icons";

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: "Không tìm thấy mẫu" }];
  const m = data.model;
  return [
    { title: m.metaTitle || `${m.title} – mẫu 3D` },
    { name: "description", content: m.metaDescription || m.description || m.subtitle || "" },
    ...(data.images[0]?.url ? [{ property: "og:image", content: data.images[0].url }] : []),
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const found = await getModelBySlug(params.slug);
  if (!found) throw new Response("Không tìm thấy", { status: 404 });
  const [similar, user] = await Promise.all([getRelated(found.model), getUser(request)]);
  let owned = false;
  if (user) {
    const [e] = await getDb()
      .select({ revoked: schema.entitlements.revoked })
      .from(schema.entitlements)
      .where(and(eq(schema.entitlements.userId, user.id), eq(schema.entitlements.modelId, found.model.id)))
      .limit(1);
    owned = !!e && !e.revoked;
  }
  const m = found.model;
  return {
    model: {
      id: m.id,
      slug: m.slug,
      sku: m.sku,
      title: m.title,
      subtitle: m.subtitle,
      description: m.description,
      contentHtml: m.contentHtml,
      priceVnd: m.priceVnd,
      renderEngine: m.renderEngine,
      maxVersion: m.maxVersion,
      formats: m.formats ?? [],
      materials: m.materials,
      style: m.style,
      widthMm: m.widthMm,
      depthMm: m.depthMm,
      heightMm: m.heightMm,
      fileSizeBytes: m.fileSizeBytes,
      metaTitle: m.metaTitle,
      metaDescription: m.metaDescription,
    },
    trail: found.ancestors.map((a) => ({ name: a.name, path: a.path })),
    images: found.images.map((i) => ({ id: i.id, url: i.url, urlLarge: i.urlLarge, alt: i.alt, caption: i.caption })),
    tags: found.tags,
    similar,
    owned,
  };
}

const CAPTIONS = ["Phối cảnh", "Góc nhìn", "Cận vật liệu", "Chi tiết", "Bản vẽ"];

export default function ModelPage({ loaderData }: Route.ComponentProps) {
  const { model: m, images, trail, tags, similar, owned } = loaderData;
  const navigate = useNavigate();
  const items = useCart();
  const inCart = items.some((i) => i.id === m.id);
  const [hero, ...rest] = images;
  const [active, setActive] = useState(0);
  const dims = m.widthMm || m.depthMm || m.heightMm ? `${m.widthMm ?? "–"} × ${m.depthMm ?? "–"} × ${m.heightMm ?? "–"}` : null;
  const cartItem = { id: m.id, slug: m.slug, title: m.title, priceVnd: m.priceVnd, coverUrl: hero?.url ?? null };

  const specs: [string, React.ReactNode, boolean?][] = [
    ["Render", m.renderEngine ? RENDER_ENGINES[m.renderEngine] : "—"],
    ["3ds Max", m.maxVersion ?? "—"],
    ["Định dạng", m.formats.length ? m.formats.join(" · ") : "—"],
    ["Dung lượng", formatBytes(m.fileSizeBytes)],
  ];

  return (
    <>
      <div className="mx-auto flex max-w-[1440px] flex-wrap justify-between gap-3 px-5 pt-6 font-mono text-xs text-muted md:px-12">
        <span>
          <Link to="/">← Thư viện</Link>
          {trail.map((t) => (
            <span key={t.path}>
              {" / "}
              <Link to={`/?cat=${encodeURIComponent(t.path)}`}>{t.name}</Link>
            </span>
          ))}
        </span>
        {m.sku && <span>№ {m.sku}</span>}
      </div>

      <div className="mx-auto flex max-w-[1440px] flex-wrap items-start gap-14 px-5 pt-8 pb-20 md:px-12">
        <section aria-label="Ảnh mẫu" className="flex min-w-0 flex-[1.5_1_560px] flex-col gap-4">
          {images.length === 0 && <Placeholder className="aspect-[5/4]" />}
          {hero && (
            <figure className="flex flex-col gap-2.5">
              <a href={images[active]?.urlLarge ?? hero.urlLarge ?? "#"} target="_blank" rel="noreferrer" className="block aspect-[5/4] bg-tone-1">
                <img src={images[active]?.url ?? hero.url ?? ""} alt={images[active]?.alt ?? m.title} className="size-full object-cover" />
              </a>
              <figcaption className="flex justify-between font-mono text-[11px] text-muted">
                <span>
                  {String(active + 1).padStart(2, "0")} — {images[active]?.caption ?? CAPTIONS[active % CAPTIONS.length]}
                </span>
                <span>{m.renderEngine ? `Render ${RENDER_ENGINES[m.renderEngine]}` : ""}</span>
              </figcaption>
            </figure>
          )}
          {rest.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Xem ảnh ${i + 1}`}
                  aria-pressed={i === active}
                  className={`aspect-square overflow-hidden bg-tone-2 ${i === active ? "outline outline-2 outline-offset-2 outline-ink" : ""}`}
                >
                  {img.url && <img src={img.url} alt="" loading="lazy" className="size-full object-cover" />}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="flex min-w-0 flex-[1_1_380px] flex-col gap-7">
          <div className="flex flex-col gap-3.5">
            <span className="font-mono text-xs text-muted">{[trail.at(-1)?.name, m.style].filter(Boolean).join(" · ")}</span>
            <h1 className="font-display text-[clamp(40px,4.4vw,56px)] font-medium leading-[0.98] tracking-[-0.035em]">{m.title}</h1>
            {m.subtitle && <p className="font-serif text-2xl italic leading-snug text-ink-2">{m.subtitle}</p>}
          </div>

          <div className="flex flex-col gap-3 border-t border-ink pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-[32px] font-medium tracking-tight">{formatPrice(m.priceVnd)}</span>
              <span className="font-mono text-[11px] text-muted">VND · giấy phép thương mại</span>
            </div>
            {owned ? (
              <Link to="/purchases" className="btn-primary h-14 justify-between px-6">
                Bạn đã có mẫu này — tải xuống <IconArrow />
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-primary h-14 justify-between px-6"
                  onClick={() => navigate(`/checkout?m=${m.id}`)}
                >
                  {m.priceVnd ? "Mua mẫu này" : "Nhận miễn phí"} <IconArrow />
                </button>
                <button
                  type="button"
                  className="btn-outline h-14"
                  onClick={() => (inCart ? navigate("/cart") : cart.add(cartItem))}
                >
                  {inCart ? "Đã trong giỏ — xem giỏ" : "Thêm vào giỏ"}
                </button>
              </>
            )}
            <p className="mt-1 text-[13px] leading-relaxed text-muted">Link tải được gửi qua email và luôn có trong mục Mẫu đã mua.</p>
          </div>

          <dl className="grid grid-cols-2 border border-ink">
            {specs.map(([k, v], i) => (
              <div key={k} className={`flex flex-col gap-1.5 border-b border-ink px-4 py-3.5 ${i % 2 === 0 ? "border-r" : ""}`}>
                <dt className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">{k}</dt>
                <dd className="text-[15px]">{v}</dd>
              </div>
            ))}
            <div className="col-span-2 flex flex-col gap-1.5 border-b border-ink px-4 py-3.5">
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Kích thước · R × S × C</dt>
              <dd className="font-display text-[22px] tracking-tight">
                {dims ?? "—"} {dims && <span className="font-mono text-xs text-muted">mm</span>}
              </dd>
            </div>
            <div className="flex flex-col gap-1.5 border-r border-ink px-4 py-3.5">
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Chất liệu</dt>
              <dd className="text-[15px]">{m.materials || "—"}</dd>
            </div>
            <div className="flex flex-col gap-1.5 px-4 py-3.5">
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">Mã mẫu</dt>
              <dd className="font-mono text-sm">{m.sku ?? "—"}</dd>
            </div>
          </dl>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <Link key={t.slug} to={`/?q=${encodeURIComponent(t.name)}`} className="rounded-full border border-line-strong px-3.5 py-1.5 text-[13px] hover:border-ink">
                  {t.name}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {(m.contentHtml || m.description) && (
        <section className="border-t border-ink">
          <div className="mx-auto flex max-w-[1440px] flex-wrap gap-x-14 gap-y-8 px-5 pt-14 pb-[72px] md:px-12">
            <div className="flex flex-[1_1_240px] flex-col gap-2">
              <span className="label-mono text-xs">Ghi chú</span>
              <h2 className="font-serif text-[40px] font-normal italic leading-none">Về mẫu này</h2>
            </div>
            <article className="max-w-[720px] flex-[3_1_520px]">
              {m.contentHtml ? (
                <div className="prose-content" dangerouslySetInnerHTML={{ __html: m.contentHtml }} />
              ) : (
                <p className="prose-content">{m.description}</p>
              )}
            </article>
          </div>
        </section>
      )}

      {similar.length > 0 && (
        <section className="mx-auto flex max-w-[1440px] flex-col gap-7 px-5 pb-16 md:px-12">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-t border-line pt-6">
            <h2 className="font-display text-[32px] font-medium tracking-tight">Mẫu tương tự</h2>
            {trail.at(-1) && (
              <Link to={`/?cat=${encodeURIComponent(trail.at(-1)!.path)}`} className="text-sm underline underline-offset-4">
                Xem tất cả
              </Link>
            )}
          </div>
          <ModelGrid items={similar} />
        </section>
      )}
    </>
  );
}
