import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import { getDb, schema } from "./db.server";

function createAuth() {
  return betterAuth({
    appName: env.SITE_NAME,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.PUBLIC_SITE_URL,
    basePath: "/api/auth",
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : undefined,
    user: {
      additionalFields: {
        // khách không tự đổi được role; admin được gán bằng SQL (xem README)
        role: { type: "string", defaultValue: "customer", input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
  });
}

let _auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (_auth ??= createAuth());
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export async function getUser(request: Request): Promise<SessionUser | null> {
  const s = await getAuth().api.getSession({ headers: request.headers });
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: string };
  return { id: u.id, name: u.name, email: u.email, role: u.role ?? "customer" };
}

export async function requireUser(request: Request): Promise<SessionUser> {
  const u = await getUser(request);
  if (!u) {
    const url = new URL(request.url);
    throw redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return u;
}

export async function requireAdmin(request: Request): Promise<SessionUser> {
  const u = await requireUser(request);
  if (u.role !== "admin") throw new Response("Không có quyền truy cập", { status: 403 });
  return u;
}
