import { NavLink, Outlet } from "react-router";
import { env } from "cloudflare:workers";
import type { Route } from "./+types/layout";
import { requireAdmin } from "~/lib/auth.server";

export const meta: Route.MetaFunction = () => [{ title: "Quản trị" }, { name: "robots", content: "noindex" }];

export async function loader({ request }: Route.LoaderArgs) {
  const u = await requireAdmin(request);
  return { siteName: env.SITE_NAME, name: u.name };
}

const LINKS = [
  ["/admin", "Tổng quan", true],
  ["/admin/models", "Mẫu 3D", false],
  ["/admin/categories", "Cây thư mục", false],
  ["/admin/posts", "Bài viết & trang", false],
  ["/admin/orders", "Đơn hàng", false],
] as const;

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen flex-wrap items-stretch bg-[#F2F1EC]">
      <nav aria-label="Quản trị" className="flex flex-[1_1_220px] flex-col gap-1 bg-ink px-3.5 py-5 text-sm text-ground md:max-w-60">
        <span className="px-2.5 pb-4 text-base font-semibold">
          {loaderData.siteName} <span className="font-normal text-[#B9B6AE]">admin</span>
        </span>
        {LINKS.map(([to, label, end]) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `rounded-md px-2.5 py-2.5 ${isActive ? "bg-[#33322F] font-medium text-white" : "text-[#D8D5CD] hover:text-white"}`}
          >
            {label}
          </NavLink>
        ))}
        <a href="/" className="mt-auto rounded-md px-2.5 py-2.5 text-[#B9B6AE] hover:text-white">
          ← Về website
        </a>
      </nav>
      <div className="flex min-w-0 flex-[999_1_640px] flex-col">
        <Outlet />
      </div>
    </div>
  );
}
