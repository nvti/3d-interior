import { redirect } from "react-router";
import { env } from "cloudflare:workers";
import type { Route } from "./+types/register";
import { getUser } from "~/lib/auth.server";
import { AuthForm, safeNext } from "~/components/auth-form";

export const meta: Route.MetaFunction = () => [{ title: "Tạo tài khoản" }];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  if (await getUser(request)) throw redirect(next);
  return { next, google: !!env.GOOGLE_CLIENT_ID, oauthError: url.searchParams.get("error") };
}

export default function Register({ loaderData }: Route.ComponentProps) {
  return <AuthForm mode="register" next={loaderData.next} google={loaderData.google} oauthError={loaderData.oauthError} />;
}
