import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import { and, eq } from "drizzle-orm";
import { getAuth, getUser } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import type { SearchSyncMessage } from "~/lib/models.server";
import { agent } from "./api/agent";
import { adminApi } from "./api/admin";
import { webhooks } from "./api/webhooks";
import { handleSearchSync, runDailyJobs } from "./jobs";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

const app = new Hono();

// Chạy local: ảnh, file mẫu và job upload đi qua Worker thay cho R2/Queue thật (xem api/dev.ts)
if (import.meta.env.DEV) app.route("/", (await import("./api/dev")).dev);

// Better Auth
app.on(["GET", "POST"], "/api/auth/*", (c) => getAuth().handler(c.req.raw));

app.route("/api/webhooks", webhooks);
app.route("/api/agent", agent);
app.route("/api/admin", adminApi);

// Trạng thái một yêu cầu tải (trang "Mẫu đã mua" hỏi định kỳ)
app.get("/api/download-requests/:id", async (c) => {
  const u = await getUser(c.req.raw);
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const [r] = await getDb()
    .select({ status: schema.downloadRequests.status })
    .from(schema.downloadRequests)
    .where(and(eq(schema.downloadRequests.id, c.req.param("id")), eq(schema.downloadRequests.userId, u.id)))
    .limit(1);
  if (!r) return c.json({ error: "not found" }, 404);
  return c.json(r);
});

// Còn lại: React Router (SSR)
app.all("*", (c) => requestHandler(c.req.raw));

app.onError((err, c) => {
  if (err instanceof Response) return err;
  if (err && typeof err === "object" && "issues" in err) {
    return c.json({ error: "invalid input", issues: (err as { issues: unknown }).issues }, 400);
  }
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

export default {
  fetch: app.fetch,

  async queue(batch) {
    if (batch.queue === "tv3d-search-sync") {
      await handleSearchSync(batch as MessageBatch<SearchSyncMessage>);
    } else {
      batch.retryAll();
    }
  },

  async scheduled(_controller, _env, ctx) {
    ctx.waitUntil(runDailyJobs());
  },
} satisfies ExportedHandler<Env>;
