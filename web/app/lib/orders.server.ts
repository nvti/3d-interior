import { and, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb, schema } from "./db.server";
import { createDownloadRequest, linkFor } from "./downloads.server";
import { downloadListHtml, emailLayout, sendEmail } from "./email.server";
import type { SessionUser } from "./auth.server";

const { orders, orderItems, entitlements, models } = schema;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function orderCodePattern() {
  return new RegExp(`${env.ORDER_CODE_PREFIX}\\s*([${ALPHABET}]{6})`, "i");
}

export async function createOrder(u: SessionUser, modelIds: string[]) {
  const db = getDb();
  const unique = [...new Set(modelIds)].slice(0, 50);
  if (!unique.length) throw new Response("Giỏ hàng trống", { status: 400 });

  const [items, owned] = await Promise.all([
    db
      .select({ id: models.id, priceVnd: models.priceVnd })
      .from(models)
      .where(and(inArray(models.id, unique), eq(models.status, "published"))),
    db
      .select({ modelId: entitlements.modelId })
      .from(entitlements)
      .where(and(eq(entitlements.userId, u.id), eq(entitlements.revoked, false), inArray(entitlements.modelId, unique))),
  ]);
  const ownedSet = new Set(owned.map((o) => o.modelId));
  const toBuy = items.filter((i) => !ownedSet.has(i.id));
  if (!toBuy.length) return { order: null, alreadyOwned: true as const };

  const total = toBuy.reduce((s, i) => s + i.priceVnd, 0);
  const id = crypto.randomUUID();
  const code = env.ORDER_CODE_PREFIX + randomCode();
  await db.batch([
    db.insert(orders).values({ id, code, userId: u.id, email: u.email, totalVnd: total }),
    db.insert(orderItems).values(toBuy.map((i) => ({ orderId: id, modelId: i.id, priceVnd: i.priceVnd }))),
  ]);
  if (total === 0) await markOrderPaid(id, { provider: "free", providerRef: `free:${id}` });
  return { order: { id, code, total }, alreadyOwned: false as const };
}

/** Xác nhận thanh toán: cấp quyền, tạo link tải, gửi một email tổng hợp. Gọi lại nhiều lần vẫn an toàn. */
export async function markOrderPaid(orderId: string, p: { provider: string; providerRef: string }) {
  const db = getDb();
  const updated = await db
    .update(orders)
    .set({ status: "paid", paidAt: new Date(), provider: p.provider, providerRef: p.providerRef })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
    .returning({ userId: orders.userId, email: orders.email, code: orders.code });
  const o = updated[0];
  if (!o) return false; // đã xử lý trước đó

  const items = await db
    .select({ modelId: orderItems.modelId })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  if (items.length) {
    await db
      .insert(entitlements)
      .values(items.map((i) => ({ userId: o.userId, modelId: i.modelId, orderId })))
      .onConflictDoUpdate({ target: [entitlements.userId, entitlements.modelId], set: { revoked: false, orderId } });
  }

  const links: { title: string; url: string | null }[] = [];
  for (const i of items) {
    const r = await createDownloadRequest({ userId: o.userId, modelId: i.modelId, email: o.email, notify: "when_ready" });
    links.push({ title: r.title, url: r.ready ? await linkFor(r.id) : null });
  }
  try {
    await sendEmail({
      to: o.email,
      subject: `Đơn ${o.code} đã thanh toán – link tải mẫu`,
      html: emailLayout(
        "Cảm ơn bạn!",
        `<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Đơn <strong>${o.code}</strong> đã được xác nhận. Các mẫu luôn có trong mục <a href="${env.PUBLIC_SITE_URL}/purchases">Mẫu đã mua</a>.</p>` +
          downloadListHtml(links),
      ),
      text: links.map((l) => `${l.title}: ${l.url ?? "đang chuẩn bị"}`).join("\n"),
    });
  } catch (e) {
    console.error("Gửi email đơn hàng lỗi", e);
  }
  return true;
}

export function vietQrUrl(amount: number, code: string) {
  const u = new URL(`https://img.vietqr.io/image/${env.BANK_BIN}-${env.BANK_ACCOUNT_NO}-compact2.png`);
  u.searchParams.set("amount", String(amount));
  u.searchParams.set("addInfo", code);
  u.searchParams.set("accountName", env.BANK_ACCOUNT_NAME);
  return u.toString();
}
