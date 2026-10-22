import { Link } from "react-router";
import { and, desc, eq } from "drizzle-orm";
import type { Route } from "./+types/blog";
import { getDb, schema } from "~/lib/db.server";
import { mediaVariantUrl } from "~/lib/r2.server";
import { formatDate } from "~/lib/format";
import { PageTitle, Placeholder } from "~/components/site";

export const meta: Route.MetaFunction = () => [{ title: "Tạp chí" }];

export async function loader() {
  const rows = await getDb()
    .select({
      slug: schema.posts.slug,
      title: schema.posts.title,
      excerpt: schema.posts.excerpt,
      publishedAt: schema.posts.publishedAt,
      r2Key: schema.media.r2Key,
      variants: schema.media.variants,
    })
    .from(schema.posts)
    .leftJoin(schema.media, eq(schema.media.id, schema.posts.coverMediaId))
    .where(and(eq(schema.posts.type, "post"), eq(schema.posts.status, "published")))
    .orderBy(desc(schema.posts.publishedAt))
    .limit(60);
  return {
    posts: rows.map((r) => ({
      ...r,
      cover: r.r2Key ? mediaVariantUrl({ r2Key: r.r2Key, variants: r.variants }, 1200) : null,
    })),
  };
}

export default function Blog({ loaderData }: Route.ComponentProps) {
  const [lead, ...rest] = loaderData.posts;
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-14 px-5 pt-16 pb-24 md:px-12 md:pt-20">
      <PageTitle eyebrow="Tạp chí" title="Ghi chép về vật liệu, không gian và cách dựng." />
      {!lead && <p className="font-serif text-2xl italic">Chưa có bài viết.</p>}
      {lead && (
        <Link to={`/blog/${lead.slug}`} className="grid gap-8 border-t border-ink pt-8 md:grid-cols-[3fr_2fr]">
          {lead.cover ? <img src={lead.cover} alt="" className="aspect-[16/10] w-full object-cover" /> : <Placeholder className="aspect-[16/10]" />}
          <div className="flex flex-col gap-4">
            <span className="label-mono text-xs">{formatDate(lead.publishedAt)}</span>
            <h2 className="font-serif text-5xl italic leading-none">{lead.title}</h2>
            {lead.excerpt && <p className="text-[15px] leading-relaxed text-ink-2">{lead.excerpt}</p>}
          </div>
        </Link>
      )}
      {rest.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-x-6 gap-y-12">
          {rest.map((p, i) => (
            <Link key={p.slug} to={`/blog/${p.slug}`} className="flex flex-col gap-3.5">
              {p.cover ? <img src={p.cover} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" /> : <Placeholder index={i} className="aspect-[4/3]" />}
              <span className="label-mono">{formatDate(p.publishedAt)}</span>
              <span className="font-display text-xl font-medium tracking-tight">{p.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
