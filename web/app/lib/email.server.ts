import { env } from "cloudflare:workers";

type Mail = { to: string; subject: string; html: string; text?: string };

/** Gửi email qua Resend. Chưa cấu hình RESEND_API_KEY thì chỉ ghi log (tiện khi dev). */
export async function sendEmail(mail: Mail) {
  if (!env.RESEND_API_KEY) {
    console.log("[email:dev]", mail.to, mail.subject, mail.text ?? "");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) throw new Error(`Gửi email thất bại ${res.status}: ${await res.text()}`);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Khung email tối giản, cùng tinh thần với website */
export function emailLayout(title: string, body: string) {
  return `<!doctype html><html lang="vi"><body style="margin:0;background:#ECEBE8;font-family:Inter,Arial,sans-serif;color:#121212">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#F7F7F5;border:1px solid #D4D2CC">
<tr><td style="padding:28px 32px;border-bottom:1px solid #D4D2CC;font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:600">${esc(env.SITE_NAME)}</td></tr>
<tr><td style="padding:32px"><h1 style="margin:0 0 16px;font-size:26px;font-weight:500;letter-spacing:-.02em">${esc(title)}</h1>${body}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #D4D2CC;font-size:12px;color:#5C5B57">Bạn nhận được email này vì đã mua mẫu tại ${esc(env.PUBLIC_SITE_URL)}.</td></tr>
</table></td></tr></table></body></html>`;
}

export function downloadListHtml(items: { title: string; url: string | null }[]) {
  return items
    .map((i) =>
      i.url
        ? `<p style="margin:0 0 12px;font-size:15px"><strong style="font-weight:600">${esc(i.title)}</strong><br>
<a href="${esc(i.url)}" style="display:inline-block;margin-top:8px;padding:10px 18px;background:#121212;color:#fff;text-decoration:none;border-radius:999px;font-size:14px">Tải xuống</a></p>`
        : `<p style="margin:0 0 12px;font-size:15px"><strong style="font-weight:600">${esc(i.title)}</strong><br>
<span style="color:#5C5B57;font-size:13px">Đang chuẩn bị file – chúng tôi sẽ gửi link riêng khi sẵn sàng.</span></p>`,
    )
    .join("");
}

export { esc as escapeHtml };
