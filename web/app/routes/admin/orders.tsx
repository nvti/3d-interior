import { Form, Link, useSearchParams } from "react-router";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Route } from "./+types/orders";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { markOrderPaid } from "~/lib/orders.server";
import { formatDate, formatPrice } from "~/lib/format";
import { AdminBody, AdminTabs, AdminTop, EmptyState, StatusBadge } from "~/components/admin-ui";

const { orders, orderItems, entitlements, models } = schema;

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const status = new URL(request.url).searchParams.get("status") ?? "";
  const valid = ["pending", "paid", "refunded", "expired"] as const;
  const s = valid.find((v) => v === status);
  const db = getDb();
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(s ? eq(orders.status, s) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(200),
    db.select({ status: orders.status, n: sql<number>`COUNT(*)` }).from(orders).groupBy(orders.status),
  ]);
  const counts: Record<string, number> = Object.fromEntries(countRows.map((c) => [c.status, c.n]));
  counts[""] = countRows.reduce((a, c) => a + c.n, 0);
  const items = rows.length
    ? await db
        .select({ orderId: orderItems.orderId, title: models.title })
        .from(orderItems)
        .innerJoin(models, eq(models.id, orderItems.modelId))
        .where(inArray(orderItems.orderId, rows.map((r) => r.id)))
    : [];
  return {
    counts,
    rows: rows.map((r) => ({ ...r, items: items.filter((i) => i.orderId === r.id).map((i) => i.title) })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const id = String(form.get("id"));
  const db = getDb();
  if (form.get("intent") === "mark-paid") {
    // dùng khi webhook không nhận được nhưng đã kiểm tra tiền vào tài khoản
    await markOrderPaid(id, { provider: "manual", providerRef: `manual:${id}` });
  } else if (form.get("intent") === "refund") {
    const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (o && o.status === "paid") {
      await db.batch([
        db.update(orders).set({ status: "refunded" }).where(eq(orders.id, id)),
        db.update(entitlements).set({ revoked: true }).where(and(eq(entitlements.orderId, id), eq(entitlements.userId, o.userId))),
      ]);
    }
  }
  return { ok: true };
}

const TABS = [
  ["", "Tất cả"],
  ["pending", "Chờ thanh toán"],
  ["paid", "Đã thanh toán"],
  ["refunded", "Hoàn tiền"],
  ["expired", "Hết hạn"],
] as const;

export default function AdminOrders({ loaderData }: Route.ComponentProps) {
  const { rows, counts } = loaderData;
  const [params] = useSearchParams();
  const status = params.get("status") ?? "";
  return (
    <>
      <AdminTop title="Đơn hàng" subtitle="Đơn được xác nhận tự động qua webhook SePay; xác nhận tay khi đã kiểm tra tiền vào tài khoản." />
      <AdminBody>
        <AdminTabs current={status} tabs={TABS.map(([k, l]) => ({ key: k, label: l, to: k ? `?status=${k}` : "?", count: counts[k] ?? 0 }))} />
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(18,18,18,0.04)]">
          {rows.length === 0 ? (
            <EmptyState title="Chưa có đơn hàng" hint={status ? "Không có đơn nào ở trạng thái này." : undefined} />
          ) : (
            <table className="admin-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Khách</th>
                  <th>Mẫu</th>
                  <th className="text-right">Tổng</th>
                  <th>Ngày tạo</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="align-top">
                    <td className="font-mono text-[13px] font-medium">{o.code}</td>
                    <td>{o.email}</td>
                    <td className="max-w-72 text-muted">
                      <span className="line-clamp-2">{o.items.join(", ")}</span>
                      {o.items.length > 1 && <span className="font-mono text-[11px] text-faint">{o.items.length} mẫu</span>}
                    </td>
                    <td className="text-right font-mono text-[13px] font-medium">{formatPrice(o.totalVnd)}</td>
                    <td className="whitespace-nowrap text-muted">{formatDate(o.createdAt)}</td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="text-right">
                      <Form method="post" className="flex justify-end gap-2">
                        <input type="hidden" name="id" value={o.id} />
                        {o.status === "pending" && (
                          <button
                            name="intent"
                            value="mark-paid"
                            className="inline-flex h-8 cursor-pointer items-center rounded-full bg-ink px-3.5 text-[12px] font-medium whitespace-nowrap text-white hover:bg-ink-2"
                            onClick={(e) => {
                              if (!confirm(`Xác nhận đã nhận ${formatPrice(o.totalVnd)} cho đơn ${o.code}?`)) e.preventDefault();
                            }}
                          >
                            Xác nhận đã nhận tiền
                          </button>
                        )}
                        {o.status === "paid" && o.totalVnd > 0 && (
                          <button
                            name="intent"
                            value="refund"
                            className="inline-flex h-8 cursor-pointer items-center rounded-full border border-[#E9C3C3] px-3.5 text-[12px] font-medium whitespace-nowrap text-danger hover:bg-[#FCE8E8]"
                            onClick={(e) => {
                              if (!confirm(`Đánh dấu hoàn tiền đơn ${o.code}? Khách sẽ mất quyền tải các mẫu trong đơn.`)) e.preventDefault();
                            }}
                          >
                            Hoàn tiền
                          </button>
                        )}
                      </Form>
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
