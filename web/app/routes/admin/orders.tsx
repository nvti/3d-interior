import { Form, Link, useSearchParams } from "react-router";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Route } from "./+types/orders";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { markOrderPaid } from "~/lib/orders.server";
import { formatDate, formatPrice } from "~/lib/format";
import { AdminTop, StatusBadge } from "~/components/admin-ui";

const { orders, orderItems, entitlements, models } = schema;

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const status = new URL(request.url).searchParams.get("status") ?? "";
  const valid = ["pending", "paid", "refunded", "expired"] as const;
  const s = valid.find((v) => v === status);
  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(s ? eq(orders.status, s) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(200);
  const items = rows.length
    ? await db
        .select({ orderId: orderItems.orderId, title: models.title })
        .from(orderItems)
        .innerJoin(models, eq(models.id, orderItems.modelId))
        .where(inArray(orderItems.orderId, rows.map((r) => r.id)))
    : [];
  return {
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

export default function AdminOrders({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const status = params.get("status") ?? "";
  return (
    <>
      <AdminTop title="Đơn hàng" />
      <div className="flex flex-col gap-4 p-7">
        <div role="tablist" className="flex flex-wrap gap-6 text-sm">
          {[
            ["", "Tất cả"],
            ["pending", "Chờ thanh toán"],
            ["paid", "Đã thanh toán"],
            ["refunded", "Hoàn tiền"],
            ["expired", "Hết hạn"],
          ].map(([k, l]) => (
            <Link key={k} role="tab" aria-selected={status === k} to={k ? `?status=${k}` : "?"} className={`h-10 ${status === k ? "border-b-[1.5px] border-ink font-medium" : "text-muted"}`}>
              {l}
            </Link>
          ))}
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Mã</th>
                <th className="px-4 py-3 font-medium">Khách</th>
                <th className="px-4 py-3 font-medium">Mẫu</th>
                <th className="px-4 py-3 font-medium">Tổng</th>
                <th className="px-4 py-3 font-medium">Ngày</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.map((o) => (
                <tr key={o.id} className="border-b border-[#ECEAE5] align-top last:border-0">
                  <td className="px-4 py-3 font-mono text-[13px]">{o.code}</td>
                  <td className="px-4 py-3">{o.email}</td>
                  <td className="max-w-64 px-4 py-3 text-muted">{o.items.join(", ")}</td>
                  <td className="px-4 py-3 font-mono text-[13px]">{formatPrice(o.totalVnd)}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Form method="post" className="flex gap-2">
                      <input type="hidden" name="id" value={o.id} />
                      {o.status === "pending" && (
                        <button
                          name="intent"
                          value="mark-paid"
                          className="text-[13px] underline underline-offset-4"
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
                          className="text-[13px] text-danger underline underline-offset-4"
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
              {loaderData.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    Chưa có đơn hàng.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
