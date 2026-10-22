import { Form, Link, NavLink } from "react-router";
import { useCart } from "~/lib/cart";
import { formatPrice, RENDER_ENGINES } from "~/lib/format";
import type { ModelCard } from "~/lib/models.server";

// Chữ KÊ vẽ bằng path (giống public/brand/ke-logo.svg): chữ theo màu chữ hiện tại, dấu mũ màu cam
export function Logo({ label, className = "" }: { label: string; className?: string }) {
  return (
    <svg viewBox="-4 -50 166 154" role="img" aria-label={label} className={`w-auto ${className}`}>
      <path fill="currentColor" d="M0 0h18v100H0z M18 46 52 0h21L18 72z M24 62 40 42 82 100H52z M98 0h60v17H116v24.5h34v17h-34V83h42v17H98z" />
      <path d="M107 -12 128 -33 149 -12" fill="none" stroke="var(--color-accent)" strokeWidth="14" />
    </svg>
  );
}

export function SiteHeader({ siteName, user }: { siteName: string; user: { name: string; role: string } | null }) {
  const items = useCart();
  const nav = ({ isActive }: { isActive: boolean }) =>
    isActive ? "border-b border-ink pb-0.5" : "hover:text-muted";
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-line px-5 py-5 md:px-12">
      <Link to="/" className="flex items-end gap-3">
        <Logo label={siteName} className="h-[22px]" />
        <span className="label-mono hidden sm:inline">Thư viện mẫu 3D</span>
      </Link>
      <nav aria-label="Chính" className="flex flex-wrap gap-7 text-sm">
        <NavLink to="/" end className={nav}>
          Thư viện
        </NavLink>
        <NavLink to="/blog" className={nav}>
          Tạp chí
        </NavLink>
        <NavLink to="/p/about" className={nav}>
          Giới thiệu
        </NavLink>
      </nav>
      <nav aria-label="Tài khoản" className="flex flex-wrap items-center gap-6 text-sm">
        {user ? (
          <>
            {user.role === "admin" && (
              <Link to="/admin" className="hover:text-muted">
                Quản trị
              </Link>
            )}
            <NavLink to="/purchases" className={nav}>
              Mẫu đã mua
            </NavLink>
            <Form method="post" action="/logout">
              <button className="hover:text-muted">Đăng xuất</button>
            </Form>
          </>
        ) : (
          <Link to="/login" className="hover:text-muted">
            Đăng nhập
          </Link>
        )}
        <Link to="/cart" className="flex h-10 items-center gap-2 rounded-full border border-ink px-4 hover:bg-ink hover:text-white">
          Giỏ <span className="font-mono text-xs">({items.length})</span>
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter({ siteName }: { siteName: string }) {
  return (
    <footer className="mt-16 flex flex-col gap-12 border-t border-ink px-5 pt-14 pb-8 md:px-12">
      <div className="flex flex-wrap justify-between gap-10">
        <p className="max-w-md font-serif text-[32px] italic leading-tight">
          Thư viện mẫu nội thất cho người làm không gian.
        </p>
        <div className="flex flex-wrap gap-14 text-sm">
          <div className="flex flex-col gap-2.5">
            <span className="label-mono">Thư viện</span>
            <Link to="/">Tất cả mẫu</Link>
            <Link to="/?price=free">Mẫu miễn phí</Link>
            <Link to="/blog">Tạp chí</Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="label-mono">Hỗ trợ</span>
            <Link to="/p/payment-guide">Hướng dẫn thanh toán</Link>
            <Link to="/p/license">Giấy phép sử dụng</Link>
            <Link to="/p/contact">Liên hệ</Link>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Logo label={siteName} className="h-[clamp(56px,10vw,160px)]" />
        <span className="label-mono">© {new Date().getFullYear()} · Việt Nam</span>
      </div>
    </footer>
  );
}

const TONES = ["bg-tone-1", "bg-tone-2", "bg-tone-3", "bg-tone-4"];

export function Placeholder({ index = 0, className = "" }: { index?: number; className?: string }) {
  return <div className={`${TONES[index % TONES.length]} ${className}`} />;
}

export function ModelCardView({ m, index }: { m: ModelCard; index: number }) {
  const meta = [m.renderEngine ? RENDER_ENGINES[m.renderEngine] : null, m.formats.join(" "), m.materials]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();
  return (
    <Link to={`/models/${m.slug}`} className="group flex flex-col gap-3.5" prefetch="intent">
      <div className={`relative aspect-[4/5] overflow-hidden ${TONES[index % TONES.length]}`}>
        {m.coverUrl && (
          <img
            src={m.coverUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        )}
        <span className="absolute inset-x-3.5 top-3.5 flex justify-between font-mono text-[11px] text-ink-2 mix-blend-multiply">
          <span>№ {m.sku ?? "—"}</span>
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-lg font-medium leading-tight tracking-tight">{m.title}</span>
          <span className="whitespace-nowrap font-mono text-[13px]">{formatPrice(m.priceVnd)}</span>
        </div>
        {meta && <span className="font-mono text-[11px] tracking-wide text-muted">{meta}</span>}
      </div>
    </Link>
  );
}

export function ModelGrid({ items, offset = 0 }: { items: ModelCard[]; offset?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-6 gap-y-14">
      {items.map((m, i) => (
        <ModelCardView key={m.id} m={m} index={i + offset} />
      ))}
    </div>
  );
}

export function PageTitle({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-3.5">
      {eyebrow && <span className="label-mono text-xs">{eyebrow}</span>}
      <h1 className="font-display text-[clamp(40px,6vw,64px)] font-medium leading-[0.98] tracking-[-0.035em]">{title}</h1>
      {sub && <p className="max-w-xl font-serif text-[22px] italic leading-snug text-ink-2">{sub}</p>}
    </div>
  );
}
