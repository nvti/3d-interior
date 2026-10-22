import { Link } from "react-router";
import { useState } from "react";
import { authClient } from "~/lib/auth-client";
import { PageTitle } from "./site";
import { IconGoogle } from "./icons";

type Props = { mode: "login" | "register"; next: string; google: boolean; oauthError?: string | null };

export function AuthForm({ mode, next, google, oauthError }: Props) {
  const [error, setError] = useState<string | null>(oauthError ? oauthErrorMessage(oauthError) : null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function onGoogle() {
    setGoogleBusy(true);
    setError(null);
    // Google lỗi thì Better Auth đưa về trang này kèm ?error=<mã>
    const res = await authClient.signIn.social({
      provider: "google",
      callbackURL: next || "/",
      errorCallbackURL: `/${mode}?next=${encodeURIComponent(next)}`,
    });
    if (res.error) {
      setGoogleBusy(false);
      setError("Không kết nối được Google, vui lòng thử lại.");
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const name = String(f.get("name") ?? "").trim();
    if (!email || !password || (mode === "register" && !name)) {
      setError("Vui lòng điền đầy đủ thông tin.");
      return;
    }
    if (password.length < 8) {
      setError("Mật khẩu cần ít nhất 8 ký tự.");
      return;
    }
    setBusy(true);
    setError(null);
    const res =
      mode === "login"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name });
    setBusy(false);
    if (res.error) {
      setError(
        res.error.status === 401
          ? "Email hoặc mật khẩu không đúng."
          : res.error.message || "Không thực hiện được, vui lòng thử lại.",
      );
      return;
    }
    window.location.assign(next || "/");
  }

  return (
    <div className="mx-auto flex max-w-[520px] flex-col gap-10 px-5 pt-16 pb-24">
      <PageTitle
        eyebrow="Tài khoản"
        title={mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
        sub={mode === "login" ? "Để mua và tải lại mẫu bất cứ lúc nào." : "Mất chưa tới một phút."}
      />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 border-t border-ink pt-8">
        {google && (
          <>
            <button type="button" className="btn-outline h-13 gap-3" disabled={googleBusy} onClick={onGoogle}>
              <IconGoogle />
              {googleBusy ? "Đang chuyển tới Google…" : "Tiếp tục với Google"}
            </button>
            <div className="flex items-center gap-4 text-[12px] tracking-wide text-muted uppercase">
              <span className="h-px flex-1 bg-line" />
              hoặc dùng email
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}
        {mode === "register" && (
          <label className="field-label">
            Tên của bạn hoặc studio
            <input name="name" autoComplete="name" className="field" />
          </label>
        )}
        <label className="field-label">
          Email
          <input name="email" type="email" autoComplete="email" className="field" onInput={() => setError(null)} />
        </label>
        <label className="field-label">
          Mật khẩu
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="field"
            onInput={() => setError(null)}
          />
        </label>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <button className="btn-primary h-13" disabled={busy}>
          {busy ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
        </button>
      </form>
      <p className="text-sm text-muted">
        {mode === "login" ? (
          <>
            Chưa có tài khoản?{" "}
            <Link to={`/register?next=${encodeURIComponent(next)}`} className="text-ink underline underline-offset-4">
              Đăng ký
            </Link>
          </>
        ) : (
          <>
            Đã có tài khoản?{" "}
            <Link to={`/login?next=${encodeURIComponent(next)}`} className="text-ink underline underline-offset-4">
              Đăng nhập
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

export function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

function oauthErrorMessage(code: string): string {
  if (code === "access_denied") return "Bạn đã huỷ đăng nhập bằng Google.";
  if (code === "account_already_linked_to_different_user")
    return "Tài khoản Google này đã gắn với một tài khoản khác.";
  return "Đăng nhập bằng Google không thành công, vui lòng thử lại.";
}
