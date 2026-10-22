import { Link, useRevalidator } from "react-router";
import { and, eq } from "drizzle-orm";
import { useEffect } from "react";
import { env } from "cloudflare:workers";
import type { Route } from "./+types/order";
import { requireUser } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { vietQrUrl } from "~/lib/orders.server";
import { cart } from "~/lib/cart";
import { formatPrice } from "~/lib/format";
import { PageTitle } from "~/components/site";
import { IconArrow } from "~/components/icons";

export const meta: Route.MetaFunction = () => [{ title: "Đơn hàng" }];

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const db = getDb();
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.id, params.id), eq(schema.orders.userId, user.id)))
    .limit(1);
  if (!order) throw new Response("Không tìm thấy", { status: 404 });
  const items = await db
    .select({ id: schema.models.id, title: schema.models.title, price: schema.orderItems.priceVnd })
    .from(schema.orderItems)
    .innerJoin(schema.models, eq(schema.models.id, schema.orderItems.modelId))
    .where(eq(schema.orderItems.orderId, order.id));
  return {
    order: { id: order.id, code: order.code, status: order.status, total: order.totalVnd },
    items,
    qr: order.status === "pending" ? vietQrUrl(order.totalVnd, order.code) : null,
    bank: { accountNo: env.BANK_ACCOUNT_NO, accountName: env.BANK_ACCOUNT_NAME },
  };
}

export default function OrderPage({ loaderData }: Route.ComponentProps) {
  const { order, items, qr, bank } = loaderData;
  const { revalidate } = useRevalidator();
  const paid = order.status === "paid";

  useEffect(() => {
    if (order.status !== "pending") return;
    const t = setInterval(revalidate, 5000);
    return () => clearInterval(t);
  }, [order.status, revalidate]);

  useEffect(() => {
    if (paid) cart.removeMany(items.map((i) => i.id));
  }, [paid, items]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-10 px-5 pt-16 pb-24 md:px-12">
      <PageTitle
        eyebrow={`Đơn ${order.code}`}
        title={paid ? "Thanh toán thành công" : order.status === "pending" ? "Chuyển khoản để hoàn tất" : "Đơn đã hết hạn"}
        sub={paid ? "Link tải đã được gửi qua email. Bạn cũng có thể tải ngay trong mục Mẫu đã mua." : undefined}
      />

      {order.status === "pending" && qr && (
        <div className="flex flex-wrap gap-12 border-t border-ink pt-8">
          <div className="flex flex-col items-center gap-3 bg-white p-5">
            <img src={qr} alt={`Mã QR chuyển khoản ${formatPrice(order.total)}`} width={280} height={280} className="size-[280px]" />
            <span className="label-mono">Quét bằng app ngân hàng</span>
          </div>
          <dl className="grid flex-1 grid-cols-[auto_1fr] content-start gap-x-8 gap-y-4 text-[15px]">
            <dt className="label-mono pt-1 text-xs">Số tiền</dt>
            <dd className="font-display text-2xl font-medium">{formatPrice(order.total)}</dd>
            <dt className="label-mono pt-1 text-xs">Nội dung</dt>
            <dd className="font-mono text-lg">{order.code}</dd>
            <dt className="label-mono pt-1 text-xs">Số tài khoản</dt>
            <dd className="font-mono">{bank.accountNo}</dd>
            <dt className="label-mono pt-1 text-xs">Chủ tài khoản</dt>
            <dd>{bank.accountName}</dd>
            <dd className="col-span-2 mt-4 flex items-center gap-3 text-sm text-muted">
              <span aria-hidden className="inline-block size-2 animate-pulse rounded-full bg-accent" />
              Đang chờ ngân hàng xác nhận — trang sẽ tự cập nhật.
            </dd>
          </dl>
        </div>
      )}

      <ul className="border-t border-line">
        {items.map((i) => (
          <li key={i.id} className="flex justify-between gap-4 border-b border-line py-3.5">
            <span className="font-display text-lg tracking-tight">{i.title}</span>
            <span className="font-mono text-sm">{formatPrice(i.price)}</span>
          </li>
        ))}
      </ul>

      {paid && (
        <Link to="/purchases" className="btn-primary h-14 self-start px-8">
          Đến Mẫu đã mua <IconArrow />
        </Link>
      )}
    </div>
  );
}
