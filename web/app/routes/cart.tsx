import { Link } from "react-router";
import type { Route } from "./+types/cart";
import { cart, useCart } from "~/lib/cart";
import { formatPrice } from "~/lib/format";
import { PageTitle, Placeholder } from "~/components/site";
import { IconArrow, IconX } from "~/components/icons";

export const meta: Route.MetaFunction = () => [{ title: "Giỏ hàng" }];

export default function CartPage() {
  const items = useCart();
  const total = items.reduce((s, i) => s + i.priceVnd, 0);
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-10 px-5 pt-16 pb-24 md:px-12">
      <PageTitle eyebrow={`Giỏ hàng · ${items.length} mẫu`} title="Giỏ hàng" />
      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-4 border-t border-ink pt-8">
          <p className="font-serif text-2xl italic">Giỏ đang trống.</p>
          <Link to="/" className="btn-outline btn-sm">
            Khám phá thư viện
          </Link>
        </div>
      ) : (
        <>
          <ul className="border-t border-ink">
            {items.map((i, idx) => (
              <li key={i.id} className="flex items-center gap-6 border-b border-line py-5">
                <span className="w-8 font-mono text-xs text-muted">{String(idx + 1).padStart(2, "0")}</span>
                <Link to={`/models/${i.slug}`} className="w-20 flex-none">
                  {i.coverUrl ? <img src={i.coverUrl} alt="" className="aspect-[4/5] w-full object-cover" /> : <Placeholder index={idx} className="aspect-[4/5]" />}
                </Link>
                <Link to={`/models/${i.slug}`} className="flex-1 font-display text-xl font-medium tracking-tight">
                  {i.title}
                </Link>
                <span className="font-mono text-sm">{formatPrice(i.priceVnd)}</span>
                <button type="button" onClick={() => cart.remove(i.id)} aria-label={`Bỏ ${i.title} khỏi giỏ`} className="flex size-10 items-center justify-center rounded-full hover:bg-paper">
                  <IconX />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex flex-col gap-1">
              <span className="label-mono text-xs">Tạm tính</span>
              <span className="font-display text-3xl font-medium tracking-tight">{formatPrice(total)}</span>
            </div>
            <Link to={`/checkout?${items.map((i) => `m=${i.id}`).join("&")}`} className="btn-primary h-14 px-8">
              Thanh toán <IconArrow />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
