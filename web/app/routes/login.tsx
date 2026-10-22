import { redirect } from "react-router";
import { env } from "cloudflare:workers";
import type { Route } from "./+types/login";
import { getUser } from "~/lib/auth.server";
import { AuthForm, safeNext } from "~/components/auth-form";

export const meta: Route.MetaFunction = () => [{ title: "Đăng nhập" }];

export async function loader({ request }: Route.LoaderArgs) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  if (await getUser(request)) throw redirect(next);
  return { next, google: !!env.GOOGLE_CLIENT_ID };
}

export default function Login({ loaderData }: Route.ComponentProps) {
  return <AuthForm mode="login" next={loaderData.next} google={loaderData.google} />;
}
