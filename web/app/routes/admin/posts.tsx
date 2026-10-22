import { Link } from "react-router";
import { desc, eq } from "drizzle-orm";
import type { Route } from "./+types/posts";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { formatDate } from "~/lib/format";
import { AdminBody, AdminTabs, AdminTop, EmptyState, StatusBadge } from "~/components/admin-ui";
import { IconPlus } from "~/components/icons";

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
  const newLink = (
    <Link to={`/admin/posts/new?type=${type}`} className="btn-primary btn-sm">
      <IconPlus size={15} /> {type === "post" ? "Viết bài" : "Thêm trang"}
    </Link>
  );
  return (
    <>
      <AdminTop title="Bài viết & trang">{newLink}</AdminTop>
      <AdminBody>
        <AdminTabs
          current={type}
          tabs={[
            { key: "post", label: "Tạp chí", to: "?type=post" },
            { key: "page", label: "Trang tĩnh", to: "?type=page" },
          ]}
        />
        {type === "page" && (
          <p className="text-[13px] text-muted">
            Footer đang trỏ tới các trang có slug: <span className="font-mono text-[12px]">about, payment-guide, license, contact</span>.
          </p>
        )}
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(18,18,18,0.04)]">
          {rows.length === 0 ? (
            <EmptyState title="Chưa có nội dung" action={newLink} />
          ) : (
            <table className="admin-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Tiêu đề</th>
                  <th>Đường dẫn</th>
                  <th>Cập nhật</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/admin/posts/${r.id}`} className="font-medium hover:underline hover:underline-offset-4">
                        {r.title}
                      </Link>
                    </td>
                    <td className="font-mono text-xs text-muted">
                      /{type === "post" ? "blog" : "p"}/{r.slug}
                    </td>
                    <td className="text-[13px] whitespace-nowrap text-muted">{formatDate(r.updatedAt)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </AdminBody>
    </>
  );
}
