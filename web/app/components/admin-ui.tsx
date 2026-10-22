import { Link } from "react-router";
import { IconChevronRight } from "~/components/icons";

export function AdminTop({
  crumbs,
  title,
  subtitle,
  children,
}: {
  crumbs?: { to: string; label: string }[];
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  // dính trên cùng ở màn lớn để nút Lưu luôn trong tầm tay khi cuộn form dài
  return (
    <div className="z-10 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-line bg-white/90 px-5 py-4 backdrop-blur md:sticky md:top-0 md:px-8">
      <div className="flex min-w-0 flex-col gap-1">
        {crumbs && (
          <nav aria-label="Đường dẫn" className="flex items-center gap-1.5 text-[13px] text-muted">
            {crumbs.map((c) => (
              <span key={c.to} className="flex items-center gap-1.5">
                <Link to={c.to} className="hover:text-ink">
                  {c.label}
                </Link>
                <IconChevronRight size={11} className="text-faint" />
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate font-display text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2.5">{children}</div>}
    </div>
  );
}

/** Vùng nội dung bên dưới AdminTop – lề thống nhất cho mọi trang */
export function AdminBody({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`flex flex-col gap-5 px-5 py-6 md:px-8 md:py-7 ${className}`}>{children}</div>;
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-4 shadow-[0_1px_2px_rgba(18,18,18,0.04)]">
      <div className="-mx-5 -mt-1 flex flex-wrap items-baseline justify-between gap-3 border-b border-[#ECEAE5] px-5 pb-3.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside && <span className="text-[13px] text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** Thanh tab dạng nút bo tròn, có thể kèm số đếm */
export function AdminTabs({ tabs, current }: { tabs: { key: string; label: string; to: string; count?: number }[]; current: string }) {
  return (
    <div role="tablist" className="no-scrollbar flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-white p-1 text-[13px]">
      {tabs.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            role="tab"
            aria-selected={on}
            to={t.to}
            className={`flex h-8 flex-none items-center gap-2 rounded-full px-3.5 transition-colors ${on ? "bg-ink font-medium text-white" : "text-muted hover:bg-ground hover:text-ink"}`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`font-mono text-[11px] ${on ? "text-[#B9B6AE]" : "text-faint"}`}>{t.count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="mb-1 size-10 rounded-full border border-dashed border-line-strong" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-[13px] text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Pagination({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Phân trang" className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">
        Trang <span className="font-medium text-ink">{page}</span> / {pages}
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link to={href(page - 1)} className="btn-outline btn-sm">
            Trang trước
          </Link>
        )}
        {page < pages && (
          <Link to={href(page + 1)} className="btn-outline btn-sm">
            Trang sau
          </Link>
        )}
      </span>
    </nav>
  );
}

const STATUS_STYLE: Record<string, string> = {
  published: "bg-ok-bg text-ok",
  paid: "bg-ok-bg text-ok",
  ready: "bg-ok-bg text-ok",
  draft: "bg-ground text-ink-2",
  absent: "bg-ground text-ink-2",
  pending: "bg-warn-bg text-warn",
  uploading: "bg-warn-bg text-warn",
  archived: "bg-ground text-muted",
  expired: "bg-ground text-muted",
  failed: "bg-[#FCE8E8] text-danger",
  refunded: "bg-[#FCE8E8] text-danger",
};

const STATUS_LABEL: Record<string, string> = {
  published: "Đã xuất bản",
  draft: "Bản nháp",
  archived: "Lưu trữ",
  paid: "Đã thanh toán",
  pending: "Chờ thanh toán",
  expired: "Hết hạn",
  refunded: "Đã hoàn tiền",
  failed: "Lỗi",
  ready: "Có trên R2",
  absent: "Chưa có trên R2",
  uploading: "Đang đẩy lên",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[status] ?? "bg-ground"}`}
    >
      <span className={`size-1.5 rounded-full bg-current ${status === "uploading" ? "animate-pulse" : "opacity-70"}`} aria-hidden />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function FlashError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-[#F3CFCF] bg-[#FCE8E8] px-4 py-3 text-sm text-danger">
      {error}
    </p>
  );
}
