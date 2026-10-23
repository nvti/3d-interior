import { Form, useActionData, useNavigation } from "react-router";
import { useRef, useState } from "react";
import { env } from "cloudflare:workers";
import type { Route } from "./+types/settings";
import { requireAdmin } from "~/lib/auth.server";
import { BANKS, getPaymentSettings, savePaymentSettings } from "~/lib/settings.server";
import { vietQrUrl } from "~/lib/orders.server";
import { AdminBody, AdminTop, FlashError, Section } from "~/components/admin-ui";

export const meta: Route.MetaFunction = () => [{ title: "Cài đặt" }];

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const pay = await getPaymentSettings();
  const ready = /^\d{6}$/.test(pay.bankBin) && /^\d+$/.test(pay.bankAccountNo);
  return {
    bank: { bin: pay.bankBin, accountNo: pay.bankAccountNo, accountName: pay.bankAccountName },
    // không trả key về trình duyệt, chỉ 4 ký tự cuối để nhận ra
    sepayKeyTail: pay.sepayApiKey ? pay.sepayApiKey.slice(-4) : null,
    webhookUrl: `${env.PUBLIC_SITE_URL}/api/webhooks/sepay`,
    orderPrefix: env.ORDER_CODE_PREFIX,
    qrPreview: ready ? vietQrUrl(pay, 10000, `${env.ORDER_CODE_PREFIX}TEST01`) : null,
    banks: BANKS,
  };
}

/** Tên chủ tài khoản theo kiểu ngân hàng: in hoa, bỏ dấu */
function normalizeName(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "D")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  if (intent === "bank") {
    const bankBin = String(form.get("bankBin") ?? "").trim();
    const bankAccountNo = String(form.get("bankAccountNo") ?? "").replace(/\s/g, "");
    const bankAccountName = normalizeName(String(form.get("bankAccountName") ?? ""));
    if (!/^\d{6}$/.test(bankBin)) return { error: "Mã BIN ngân hàng gồm 6 chữ số" };
    if (!/^\d{4,20}$/.test(bankAccountNo)) return { error: "Số tài khoản chỉ gồm chữ số" };
    if (!bankAccountName) return { error: "Cần nhập tên chủ tài khoản" };
    await savePaymentSettings({ bankBin, bankAccountNo, bankAccountName });
    return { ok: "Đã lưu tài khoản ngân hàng" };
  }
  if (intent === "sepay") {
    const sepayApiKey = String(form.get("sepayApiKey") ?? "").trim();
    if (!sepayApiKey) return { error: "Nhập API key mới, hoặc để nguyên nếu không đổi" };
    if (sepayApiKey.length < 16) return { error: "API key nên dài ít nhất 16 ký tự" };
    await savePaymentSettings({ sepayApiKey });
    return { ok: "Đã lưu API key SePay" };
  }
  return { error: "Thao tác không hợp lệ" };
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function AdminSettings({ loaderData }: Route.ComponentProps) {
  const { bank, sepayKeyTail, webhookUrl, orderPrefix, qrPreview, banks } = loaderData;
  const res = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle" ? nav.formData?.get("intent") : null;
  const known = banks.some((b) => b.bin === bank.bin);
  const [bin, setBin] = useState(known ? bank.bin : "other");
  const keyRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  return (
    <>
      <AdminTop title="Cài đặt" subtitle="Tài khoản nhận tiền và kết nối SePay để tự xác nhận đơn." />
      <AdminBody className="max-w-4xl">
        <FlashError error={res && "error" in res ? res.error : null} />
        {res && "ok" in res && (
          <p role="status" className="rounded-lg border border-[#CFE6D6] bg-ok-bg px-4 py-3 text-sm text-ok">
            {res.ok}
          </p>
        )}

        <Section title="Tài khoản ngân hàng" aside="hiện trên mã VietQR ở trang thanh toán">
          <div className="flex flex-wrap gap-6">
            <Form method="post" className="flex flex-[1_1_320px] flex-col gap-4">
              <input type="hidden" name="intent" value="bank" />
              <label className="field-label">
                Ngân hàng
                <select value={bin} onChange={(e) => setBin(e.target.value)} name={bin === "other" ? undefined : "bankBin"} className="field">
                  {banks.map((b) => (
                    <option key={b.bin} value={b.bin}>
                      {b.name}
                    </option>
                  ))}
                  <option value="other">Ngân hàng khác (nhập mã BIN)</option>
                </select>
              </label>
              {bin === "other" && (
                <label className="field-label">
                  Mã BIN
                  <input name="bankBin" defaultValue={known ? "" : bank.bin} inputMode="numeric" pattern="\d{6}" required className="field font-mono" />
                  <span className="field-hint">6 chữ số theo danh sách NAPAS / VietQR</span>
                </label>
              )}
              <label className="field-label">
                Số tài khoản
                <input name="bankAccountNo" defaultValue={bank.accountNo === "REPLACE_ME" ? "" : bank.accountNo} inputMode="numeric" required className="field font-mono" />
              </label>
              <label className="field-label">
                Chủ tài khoản
                <input name="bankAccountName" defaultValue={bank.accountName === "REPLACE_ME" ? "" : bank.accountName} required className="field uppercase" />
                <span className="field-hint">tự chuyển thành chữ in hoa không dấu, đúng như trên app ngân hàng</span>
              </label>
              <button className="btn-primary btn-sm self-start" disabled={busy === "bank"}>
                {busy === "bank" ? "Đang lưu…" : "Lưu tài khoản"}
              </button>
            </Form>
            <div className="flex flex-none flex-col items-center gap-2 self-start rounded-lg border border-line bg-paper p-4">
              {qrPreview ? (
                <img src={qrPreview} alt="Mã QR mẫu với tài khoản hiện tại" width={180} height={180} className="size-[180px] bg-white" />
              ) : (
                <span className="flex size-[180px] items-center justify-center text-center text-[13px] text-muted">Chưa có tài khoản hợp lệ</span>
              )}
              <span className="label-mono">QR mẫu · 10.000đ</span>
            </div>
          </div>
        </Section>

        <Section title="SePay" aside={sepayKeyTail ? `đang dùng key …${sepayKeyTail}` : "chưa có API key"}>
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-ink-2">
            <li>Trên my.sepay.vn, liên kết đúng tài khoản ngân hàng ở trên.</li>
            <li>
              Vào <b>Tích hợp WebHooks</b> → Thêm webhook, sự kiện <b>Có tiền vào</b>, URL bên dưới, kiểu chứng thực <b>API Key</b>.
            </li>
            <li>Dán cùng một API key vào SePay và ô bên dưới rồi lưu.</li>
            <li>
              Khách chuyển khoản với nội dung chứa mã đơn (dạng <span className="font-mono">{orderPrefix}XXXXXX</span>); đủ tiền là đơn tự chuyển sang đã thanh toán.
            </li>
          </ol>

          <div className="field-label">
            URL webhook
            <div className="flex gap-2">
              <input readOnly value={webhookUrl} className="field font-mono text-[13px]" onFocus={(e) => e.currentTarget.select()} />
              <button
                type="button"
                className="btn-outline btn-sm h-11 flex-none"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? "Đã chép" : "Chép"}
              </button>
            </div>
          </div>

          <Form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="sepay" />
            <label className="field-label">
              API key
              <div className="flex gap-2">
                <input
                  ref={keyRef}
                  name="sepayApiKey"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={sepayKeyTail ? `•••• ${sepayKeyTail} — nhập key mới để thay` : "Dán hoặc tạo key mới"}
                  className="field font-mono text-[13px]"
                />
                <button
                  type="button"
                  className="btn-outline btn-sm h-11 flex-none"
                  onClick={() => {
                    if (keyRef.current) keyRef.current.value = randomKey();
                  }}
                >
                  Tạo key
                </button>
              </div>
              <span className="field-hint">Đổi key ở đây thì phải đổi cả trong SePay, nếu không webhook sẽ bị từ chối.</span>
            </label>
            <button className="btn-primary btn-sm self-start" disabled={busy === "sepay"}>
              {busy === "sepay" ? "Đang lưu…" : "Lưu API key"}
            </button>
          </Form>
        </Section>
      </AdminBody>
    </>
  );
}
