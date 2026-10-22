import { Link } from "react-router";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/index";
import { getDb } from "~/lib/db.server";
import { requireAdmin } from "~/lib/auth.server";
import { typesenseEnabled } from "~/lib/typesense.server";
import { formatPrice } from "~/lib/format";
import { AdminTop } from "~/components/admin-ui";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const db = getDb();
  const [s] = await db.all<Record<string, number>>(sql`
    SELECT
      (SELECT COUNT(*) FROM models) AS models,
      (SELECT COUNT(*) FROM models WHERE status = 'published') AS published,
      (SELECT COUNT(*) FROM models WHERE status = 'draft') AS drafts,
      (SELECT COUNT(*) FROM models WHERE r2_status = 'ready') AS onR2,
      (SELECT COALESCE(SUM(file_size_bytes), 0) FROM models WHERE r2_status = 'ready') AS r2Bytes,
      (SELECT COUNT(*) FROM models WHERE r2_status = 'uploading') AS uploading,
      (SELECT COUNT(*) FROM models WHERE r2_status = 'failed') AS failed,
      (SELECT COUNT(*) FROM orders WHERE status = 'paid') AS paidOrders,
      (SELECT COALESCE(SUM(total_vnd), 0) FROM orders WHERE status = 'paid') AS revenue,
      (SELECT COALESCE(SUM(total_vnd), 0) FROM orders WHERE status = 'paid' AND paid_at > unixepoch() - 30*86400) AS revenue30,
      (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pendingOrders,
      (SELECT COUNT(*) FROM user) AS users`);
  return { s, typesense: typesenseEnabled() };
}

export default function AdminHome({ loaderData }: Route.ComponentProps) {
  const { s, typesense } = loaderData;
  const tiles: [string, string, string?][] = [
    ["Mẫu đã xuất bản", `${s.published} / ${s.models}`, "/admin/models?status=published"],
    ["Bản nháp chờ duyệt", String(s.drafts), "/admin/models?status=draft"],
    ["Doanh thu 30 ngày", formatPrice(s.revenue30)],
    ["Tổng doanh thu", formatPrice(s.revenue)],
    ["Đơn đã thanh toán", String(s.paidOrders), "/admin/orders?status=paid"],
    ["Đơn chờ chuyển khoản", String(s.pendingOrders), "/admin/orders?status=pending"],
    ["Mẫu đang có trên R2", `${s.onR2} · ${(s.r2Bytes / 1e9).toFixed(1)} GB`],
    ["Đang đẩy lên / lỗi", `${s.uploading} / ${s.failed}`, "/admin/models?r2=failed"],
    ["Khách hàng", String(s.users)],
  ];
  return (
    <>
      <AdminTop title="Tổng quan" />
      <div className="flex flex-col gap-6 p-7">
        {!typesense && (
          <p className="rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn">
            Chưa cấu hình Typesense (TYPESENSE_URL / TYPESENSE_API_KEY) – website đang dùng tìm kiếm cơ bản bằng D1.
          </p>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {tiles.map(([label, value, to]) => {
            const body = (
              <>
                <span className="text-[13px] text-muted">{label}</span>
                <span className="font-display text-[28px] font-medium tracking-tight">{value}</span>
              </>
            );
            return to ? (
              <Link key={label} to={to} className="card flex flex-col gap-2 hover:border-ink">
                {body}
              </Link>
            ) : (
              <div key={label} className="card flex flex-col gap-2">
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
