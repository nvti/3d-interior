import { NavLink, Outlet } from "react-router";
import { env } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/layout";
import { requireAdmin } from "~/lib/auth.server";
import { getDb } from "~/lib/db.server";
import { IconArrowLeft, IconCube, IconDashboard, IconDoc, IconFolder, IconReceipt } from "~/components/icons";

export const meta: Route.MetaFunction = () => [{ title: "Quản trị" }, { name: "robots", content: "noindex" }];

export async function loader({ request }: Route.LoaderArgs) {
  const u = await requireAdmin(request);
  // số việc đang chờ, hiện thành badge cạnh menu
  const [todo] = await getDb().all<{ drafts: number; pending: number }>(sql`
    SELECT
      (SELECT COUNT(*) FROM models WHERE status = 'draft') AS drafts,
      (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending`);
  return { siteName: env.SITE_NAME, name: u.name, email: u.email, todo };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  const { siteName, name, email, todo } = loaderData;
  const links = [
    { to: "/admin", label: "Tổng quan", icon: IconDashboard, end: true },
    { to: "/admin/models", label: "Mẫu 3D", icon: IconCube, badge: todo.drafts, hint: "bản nháp" },
    { to: "/admin/categories", label: "Cây thư mục", icon: IconFolder },
    { to: "/admin/posts", label: "Bài viết & trang", icon: IconDoc },
    { to: "/admin/orders", label: "Đơn hàng", icon: IconReceipt, badge: todo.pending, hint: "đơn chờ thanh toán" },
  ];
  return (
    <div className="flex min-h-screen flex-col bg-[#F2F1EC] md:flex-row">
      <nav
        aria-label="Quản trị"
        className="sticky top-0 z-20 no-scrollbar flex flex-none gap-1 overflow-x-auto bg-ink px-3 py-2.5 text-sm text-ground md:h-screen md:w-60 md:flex-col md:overflow-visible md:px-3.5 md:py-5"
      >
        <a href="/admin" className="hidden items-center gap-2.5 px-2.5 pb-6 md:flex">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent font-display text-[15px] font-semibold text-white">
            {siteName.slice(0, 1)}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-display text-[15px] font-semibold">{siteName}</span>
            <span className="label-mono text-[#8F8C84]">QUẢN TRỊ</span>
          </span>
        </a>
        <span className="label-mono hidden px-2.5 pb-2 text-[#77746D] md:block">MENU</span>
        {links.map(({ to, label, icon: Icon, end, badge, hint }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group flex flex-none items-center gap-3 rounded-lg px-2.5 py-2 whitespace-nowrap transition-colors md:py-2.5 ${
                isActive ? "bg-[#2C2B28] font-medium text-white" : "text-[#C9C6BE] hover:bg-[#1F1E1C] hover:text-white"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className={isActive ? "text-accent" : "text-[#8F8C84] group-hover:text-[#C9C6BE]"} />
                <span className="flex-1">{label}</span>
                {!!badge && (
                  <span
                    title={`${badge} ${hint}`}
                    className="min-w-5 rounded-full bg-accent px-1.5 text-center font-mono text-[11px] leading-5 font-medium text-white"
                  >
                    {badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
        <div className="mt-auto hidden flex-col gap-1 border-t border-[#2C2B28] pt-4 md:flex">
          <div className="flex items-center gap-3 px-2.5 py-2">
            <span className="flex size-8 flex-none items-center justify-center rounded-full bg-[#2C2B28] text-[13px] font-medium uppercase">
              {(name || email).slice(0, 1)}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] font-medium text-white">{name}</span>
              <span className="truncate text-[12px] text-[#8F8C84]">{email}</span>
            </span>
          </div>
          <a href="/" className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[#C9C6BE] hover:bg-[#1F1E1C] hover:text-white">
            <IconArrowLeft size={18} className="text-[#8F8C84]" />
            Về website
          </a>
        </div>
        <a href="/" className="flex flex-none items-center gap-2 rounded-lg px-2.5 py-2 whitespace-nowrap text-[#C9C6BE] md:hidden">
          <IconArrowLeft size={16} /> Website
        </a>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
