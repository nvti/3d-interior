import { Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/checkout";
import { requireUser } from "~/lib/auth.server";
import { getModelCards } from "~/lib/models.server";
import { createOrder } from "~/lib/orders.server";
import { formatPrice } from "~/lib/format";
import { PageTitle, Placeholder } from "~/components/site";
import { IconArrow } from "~/components/icons";

export const meta: Route.MetaFunction = () => [{ title: "Thanh toán" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const ids = new URL(request.url).searchParams.getAll("m").slice(0, 50);
  const items = await getModelCards(ids);
  return { items, email: user.email };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const ids = form.getAll("m").map(String);
  const r = await createOrder(user, ids);
  if (r.alreadyOwned || !r.order) return redirect("/purchases?owned=1");
  return redirect(`/orders/${r.order.id}`);
}

export default function Checkout({ loaderData }: Route.ComponentProps) {
  const { items, email } = loaderData;
  const nav = useNavigation();
  const total = items.reduce((s, i) => s + i.priceVnd, 0);
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-10 px-5 pt-16 pb-24 md:px-12">
      <PageTitle eyebrow="Thanh toán" title="Xác nhận đơn hàng" sub={`Link tải sẽ được gửi tới ${email}.`} />
      {items.length === 0 ? (
        <p className="text-muted">
          Không có mẫu nào để thanh toán. <Link to="/" className="underline">Quay lại thư viện</Link>
        </p>
      ) : (
        <Form method="post" className="flex flex-col gap-8">
          <ul className="border-t border-ink">
            {items.map((i, idx) => (
              <li key={i.id} className="flex items-center gap-6 border-b border-line py-4">
                <input type="hidden" name="m" value={i.id} />
                <div className="w-16 flex-none">
                  {i.coverUrl ? <img src={i.coverUrl} alt="" className="aspect-[4/5] w-full object-cover" /> : <Placeholder index={idx} className="aspect-[4/5]" />}
                </div>
                <span className="flex-1 font-display text-lg font-medium tracking-tight">{i.title}</span>
                <span className="font-mono text-sm">{formatPrice(i.priceVnd)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex flex-col gap-1">
              <span className="label-mono text-xs">Tổng</span>
              <span className="font-display text-3xl font-medium tracking-tight">{formatPrice(total)}</span>
            </div>
            <button className="btn-primary h-14 px-8" disabled={nav.state !== "idle"}>
              {total ? "Tạo đơn & lấy mã chuyển khoản" : "Nhận mẫu miễn phí"} <IconArrow />
            </button>
          </div>
          <p className="text-[13px] text-muted">Mẫu bạn đã sở hữu sẽ tự được bỏ khỏi đơn.</p>
        </Form>
      )}
    </div>
  );
}
