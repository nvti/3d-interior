import { env } from "cloudflare:workers";
import { Outlet } from "react-router";
import type { Route } from "./+types/_site";
import { getUser } from "~/lib/auth.server";
import { SiteFooter, SiteHeader } from "~/components/site";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUser(request);
  return { siteName: env.SITE_NAME, user: user ? { name: user.name, role: user.role } : null };
}

export default function SiteLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader siteName={loaderData.siteName} user={loaderData.user} />
      <div className="flex-1">
        <Outlet />
      </div>
      <SiteFooter siteName={loaderData.siteName} />
    </div>
  );
}
