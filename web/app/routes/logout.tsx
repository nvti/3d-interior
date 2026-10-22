import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { getAuth } from "~/lib/auth.server";

export async function action({ request }: Route.ActionArgs) {
  const res = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
  const headers = new Headers();
  for (const c of res.headers.getSetCookie()) headers.append("Set-Cookie", c);
  return redirect("/", { headers });
}

export async function loader() {
  return redirect("/");
}
