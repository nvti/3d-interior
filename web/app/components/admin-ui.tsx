import { Link } from "react-router";

export function AdminTop({
  crumbs,
  title,
  children,
}: {
  crumbs?: { to: string; label: string }[];
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-line bg-white px-7 py-4">
      <div className="flex flex-col gap-0.5">
        {crumbs && (
          <span className="text-[13px] text-muted">
            {crumbs.map((c) => (
              <span key={c.to}>
                <Link to={c.to}>{c.label}</Link> /{" "}
              </span>
            ))}
          </span>
        )}
        <h1 className="font-display text-[22px] font-semibold tracking-tight">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2.5">{children}</div>}
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside && <span className="text-[13px] text-muted">{aside}</span>}
      </div>
      {children}
    </section>
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
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[status] ?? "bg-ground"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function FlashError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg bg-[#FCE8E8] px-4 py-3 text-sm text-danger">
      {error}
    </p>
  );
}
