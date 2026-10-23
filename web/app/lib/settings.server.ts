// Cài đặt thanh toán chỉnh từ /admin/settings, lưu trong bảng settings.
// Ô nào chưa lưu thì lấy từ vars/secrets (wrangler.jsonc, .dev.vars) như trước.
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb, schema } from "./db.server";

export type PaymentSettings = {
  bankBin: string;
  bankAccountNo: string;
  bankAccountName: string;
  sepayApiKey: string;
};

const KEY = "payment";

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const [row] = await getDb().select().from(schema.settings).where(eq(schema.settings.key, KEY)).limit(1);
  const saved = (row?.value ?? {}) as Partial<PaymentSettings>;
  return {
    bankBin: saved.bankBin || env.BANK_BIN,
    bankAccountNo: saved.bankAccountNo || env.BANK_ACCOUNT_NO,
    bankAccountName: saved.bankAccountName || env.BANK_ACCOUNT_NAME,
    sepayApiKey: saved.sepayApiKey || env.SEPAY_API_KEY || "",
  };
}

export async function savePaymentSettings(patch: Partial<PaymentSettings>) {
  const db = getDb();
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, KEY)).limit(1);
  const value = { ...((row?.value ?? {}) as Partial<PaymentSettings>), ...patch };
  await db
    .insert(schema.settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
}

/** Ngân hàng hay dùng với VietQR (BIN theo NAPAS) */
export const BANKS: { bin: string; name: string }[] = [
  { bin: "970436", name: "Vietcombank" },
  { bin: "970415", name: "VietinBank" },
  { bin: "970418", name: "BIDV" },
  { bin: "970405", name: "Agribank" },
  { bin: "970422", name: "MB Bank" },
  { bin: "970407", name: "Techcombank" },
  { bin: "970416", name: "ACB" },
  { bin: "970432", name: "VPBank" },
  { bin: "970423", name: "TPBank" },
  { bin: "970403", name: "Sacombank" },
  { bin: "970437", name: "HDBank" },
  { bin: "970441", name: "VIB" },
  { bin: "970443", name: "SHB" },
  { bin: "970431", name: "Eximbank" },
  { bin: "970426", name: "MSB" },
  { bin: "970448", name: "OCB" },
  { bin: "970440", name: "SeABank" },
  { bin: "970454", name: "Viet Capital Bank" },
  { bin: "970449", name: "LPBank" },
  { bin: "970429", name: "SCB" },
  { bin: "970425", name: "ABBANK" },
  { bin: "970427", name: "VietABank" },
  { bin: "970428", name: "Nam A Bank" },
  { bin: "970438", name: "BaoViet Bank" },
  { bin: "970452", name: "KienlongBank" },
  { bin: "970400", name: "Saigonbank" },
  { bin: "970430", name: "PG Bank" },
  { bin: "970419", name: "NCB" },
  { bin: "970433", name: "VietBank" },
  { bin: "970412", name: "PVcomBank" },
];
