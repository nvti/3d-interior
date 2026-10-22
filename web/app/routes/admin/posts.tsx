import { Link, useSearchParams } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/posts";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { formatDate } from "~/lib/format";
import { AdminTop, StatusBadge } from "~/components/admin-ui";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const type = new URL(request.url).searchParams.get("type") === "page" ? "page" : "post";
  const rows = await getDb()
    .select({ id: schema.posts.id, title: schema.posts.title, slug: schema.posts.slug, status: schema.posts.status, updatedAt: schema.posts.updatedAt })
    .from(schema.posts)
    .where(eq(schema.posts.type, type))
    .orderBy(desc(schema.posts.updatedAt))
    .limit(200);
  return { type, rows };
}

export default function AdminPosts({ loaderData }: Route.ComponentProps) {
  const { type, rows } = loaderData;
  const [params] = useSearchParams();
  void params;
  return (
    <>
      <AdminTop title="Bài viết & trang">
        <Link to={`/admin/posts/new?type=${type}`} className="btn-primary btn-sm">
          + {type === "post" ? "Viết bài" : "Thêm trang"}
        </Link>
      </AdminTop>
      <div className="flex flex-col gap-4 p-7">
        <div role="tablist" className="flex gap-6 text-sm">
          {(
            [
              ["post", "Tạp chí"],
              ["page", "Trang tĩnh"],
            ] as const
          ).map(([k, l]) => (
            <Link key={k} role="tab" aria-selected={type === k} to={`?type=${k}`} className={`h-10 ${type === k ? "border-b-[1.5px] border-ink font-medium" : "text-muted"}`}>
              {l}
            </Link>
          ))}
        </div>
        {type === "page" && (
          <p className="text-[13px] text-muted">
            Footer đang trỏ tới các trang có slug: about, payment-guide, license, contact.
          </p>
        )}
        <ul className="overflow-hidden rounded-xl border border-line bg-white">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-4 border-b border-[#ECEAE5] px-4 py-3 last:border-0">
              <Link to={`/admin/posts/${r.id}`} className="flex-1 font-medium">
                {r.title}
              </Link>
              <span className="font-mono text-xs text-muted">/{type === "post" ? "blog" : "p"}/{r.slug}</span>
              <span className="text-xs text-muted">{formatDate(r.updatedAt)}</span>
              <StatusBadge status={r.status} />
            </li>
          ))}
          {rows.length === 0 && <li className="p-8 text-center text-sm text-muted">Chưa có nội dung.</li>}
        </ul>
      </div>
    </>
  );
}
