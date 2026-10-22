// Webhook SePay (VietQR chuyển khoản ngân hàng).
// SePay gọi POST khi tài khoản có giao dịch; header: "Authorization: Apikey <SEPAY_API_KEY>".
// Kiểm tra lại định dạng payload với tài liệu SePay hiện hành trước khi chạy thật.
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb, schema } from "~/lib/db.server";
import { markOrderPaid, orderCodePattern } from "~/lib/orders.server";
import { safeEqual } from "~/lib/crypto.server";

export const webhooks = new Hono();

type SepayPayload = {
  id: number | string;
  transferType?: "in" | "out";
  transferAmount?: number;
  content?: string;
  description?: string;
  referenceCode?: string;
};

webhooks.post("/sepay", async (c) => {
  const auth = c.req.header("Authorization") ?? "";
  if (!env.SEPAY_API_KEY || !safeEqual(auth, `Apikey ${env.SEPAY_API_KEY}`)) {
    return c.json({ success: false, error: "unauthorized" }, 401);
  }
  const p = (await c.req.json()) as SepayPayload;
  if (p.transferType && p.transferType !== "in") return c.json({ success: true, ignored: "out" });

  const text = `${p.content ?? ""} ${p.description ?? ""}`.toUpperCase();
  const m = text.match(orderCodePattern());
  if (!m) return c.json({ success: true, ignored: "no-order-code" });
  const code = env.ORDER_CODE_PREFIX + m[1].toUpperCase();

  const db = getDb();
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.code, code), eq(schema.orders.status, "pending")))
    .limit(1);
  if (!order) return c.json({ success: true, ignored: "order-not-pending" });
  if ((p.transferAmount ?? 0) < order.totalVnd) {
    console.warn(`Đơn ${code}: chuyển thiếu (${p.transferAmount} < ${order.totalVnd})`);
    return c.json({ success: true, ignored: "amount-too-low" });
  }

  await markOrderPaid(order.id, { provider: "sepay", providerRef: `sepay:${p.id}` });
  return c.json({ success: true });
});
