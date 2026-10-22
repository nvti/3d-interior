import { Link } from "react-router";
import { desc, eq, sql } from "drizzle-orm";
import type { Route } from "./+types/index";
import { getDb, schema } from "~/lib/db.server";
import { requireAdmin } from "~/lib/auth.server";
import { typesenseEnabled } from "~/lib/typesense.server";
import { formatDate, formatPrice } from "~/lib/format";
import { AdminBody, AdminTop, EmptyState, StatusBadge } from "~/components/admin-ui";
import { IconArrow, IconCloud, IconCube, IconPlus, IconReceipt, IconUsers, IconWallet } from "~/components/icons";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const db = getDb();
  const { orders, models } = schema;
  const [[s], recentOrders, drafts] = await Promise.all([
    db.all<Record<string, number>>(sql`
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
      (SELECT COUNT(*) FROM orders WHERE status = 'paid' AND paid_at > unixepoch() - 30*86400) AS paid30,
      (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pendingOrders,
      (SELECT COUNT(*) FROM user) AS users`),
    db
      .select({ id: orders.id, code: orders.code, email: orders.email, status: orders.status, totalVnd: orders.totalVnd, createdAt: orders.createdAt })
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(6),
    db
      .select({ id: models.id, title: models.title, sku: models.sku, updatedAt: models.updatedAt })
      .from(models)
      .where(eq(models.status, "draft"))
      .orderBy(desc(models.updatedAt))
      .limit(6),
  ]);
  return { s, recentOrders, drafts, typesense: typesenseEnabled() };
}

function Stat({
  label,
  value,
  hint,
  to,
  icon: Icon,
  tone = "light",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  to?: string;
  icon: (p: { size?: number; className?: string }) => React.ReactNode;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  const body = (
    <>
      <span className="flex items-center justify-between gap-3">
        <span className={`text-[13px] ${dark ? "text-[#B9B6AE]" : "text-muted"}`}>{label}</span>
        <span className={`flex size-8 items-center justify-center rounded-lg ${dark ? "bg-[#2C2B28] text-accent" : "bg-ground text-ink-2"}`}>
          <Icon size={17} />
        </span>
      </span>
      <span className="font-display text-[22px] leading-none md:text-[28px] font-medium tracking-tight">{value}</span>
      {hint && <span className={`text-[12px] ${dark ? "text-[#8F8C84]" : "text-muted"}`}>{hint}</span>}
    </>
  );
  const cls = `flex min-w-0 flex-col gap-3 rounded-xl border p-4 transition-colors md:p-5 ${
    dark ? "border-ink bg-ink text-white" : "border-line bg-white shadow-[0_1px_2px_rgba(18,18,18,0.04)]"
  }`;
  return to ? (
    <Link to={to} className={`${cls} ${dark ? "hover:bg-ink-2" : "hover:border-line-strong"}`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Panel({ title, to, linkLabel, children }: { title: string; to: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(18,18,18,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-[#ECEAE5] px-5 py-3.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <Link to={to} className="flex items-center gap-1 text-[13px] text-muted hover:text-ink">
          {linkLabel} <IconArrow size={14} />
        </Link>
      </div>
      {children}
    </section>
  );
}

export default function AdminHome({ loaderData }: Route.ComponentProps) {
  const { s, recentOrders, drafts, typesense } = loaderData;
  const publishedPct = s.models ? Math.round((s.published / s.models) * 100) : 0;
  return (
    <>
      <AdminTop title="Tổng quan" subtitle="Tình hình bán hàng và kho mẫu">
        <Link to="/admin/posts/new?type=post" className="btn-outline btn-sm">
          Viết bài
        </Link>
        <Link to="/admin/models/new" className="btn-primary btn-sm">
          <IconPlus size={15} /> Thêm mẫu
        </Link>
      </AdminTop>
      <AdminBody className="gap-6">
        {!typesense && (
          <p className="rounded-lg border border-[#F1DDB5] bg-warn-bg px-4 py-3 text-sm text-warn">
            Chưa cấu hình Typesense (TYPESENSE_URL / TYPESENSE_API_KEY) – website đang dùng tìm kiếm cơ bản bằng D1.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          <Stat tone="dark" icon={IconWallet} label="Doanh thu 30 ngày" value={formatPrice(s.revenue30)} hint={`${s.paid30} đơn đã thanh toán`} />
          <Stat icon={IconWallet} label="Tổng doanh thu" value={formatPrice(s.revenue)} hint={`${s.paidOrders} đơn từ trước tới nay`} to="/admin/orders?status=paid" />
          <Stat
            icon={IconReceipt}
            label="Đơn chờ chuyển khoản"
            value={s.pendingOrders}
            hint={s.pendingOrders ? "Kiểm tra tài khoản nếu webhook chưa báo" : "Không có đơn nào đang chờ"}
            to="/admin/orders?status=pending"
          />
          <Stat
            icon={IconCube}
            label="Mẫu đã xuất bản"
            value={
              <>
                {s.published}
                <span className="text-[18px] text-faint"> / {s.models}</span>
              </>
            }
            hint={
              <span className="flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ground">
                  <span className="block h-full rounded-full bg-ok" style={{ width: `${publishedPct}%` }} />
                </span>
                {publishedPct}%
              </span>
            }
            to="/admin/models?status=published"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
          <Stat icon={IconCube} label="Bản nháp chờ duyệt" value={s.drafts} to="/admin/models?status=draft" />
          <Stat icon={IconCloud} label="Mẫu đang có trên R2" value={s.onR2} hint={`${(s.r2Bytes / 1e9).toFixed(1)} GB dung lượng`} to="/admin/models?r2=ready" />
          <Stat
            icon={IconCloud}
            label="Đang đẩy lên / lỗi"
            value={
              <>
                {s.uploading}
                <span className={`text-[18px] ${s.failed ? "text-danger" : "text-faint"}`}> / {s.failed}</span>
              </>
            }
            hint={s.failed ? `${s.failed} mẫu upload lỗi cần xem lại` : "Không có lỗi upload"}
            to="/admin/models?r2=failed"
          />
          <Stat icon={IconUsers} label="Khách hàng" value={s.users} hint="Tài khoản đã đăng ký" />
        </div>

        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <Panel title="Đơn hàng gần đây" to="/admin/orders" linkLabel="Tất cả đơn">
            {recentOrders.length ? (
              <div className="overflow-x-auto">
                <table className="admin-table min-w-[520px]">
                  <tbody>
                    {recentOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="font-mono text-[13px]">{o.code}</td>
                        <td className="max-w-52 truncate text-muted">{o.email}</td>
                        <td className="text-right font-mono text-[13px]">{formatPrice(o.totalVnd)}</td>
                        <td className="text-right">
                          <StatusBadge status={o.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Chưa có đơn hàng" />
            )}
          </Panel>
          <Panel title="Bản nháp chờ duyệt" to="/admin/models?status=draft" linkLabel="Xem hết">
            {drafts.length ? (
              <ul>
                {drafts.map((m) => (
                  <li key={m.id} className="border-b border-[#ECEAE5] last:border-0">
                    <Link to={`/admin/models/${m.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[#FAFAF8]">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{m.title}</span>
                        <span className="font-mono text-[11px] text-muted">{m.sku ?? "—"}</span>
                      </span>
                      <span className="text-[12px] text-muted">{formatDate(m.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Không còn bản nháp" hint="Mọi mẫu đã được duyệt." />
            )}
          </Panel>
        </div>
      </AdminBody>
    </>
  );
}
