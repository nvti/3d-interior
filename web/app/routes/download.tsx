// Link tải trong email / từ trang Mẫu đã mua: /d/:token
import { Link, redirect } from "react-router";
import type { Route } from "./+types/download";
import { resolveDownloadToken } from "~/lib/downloads.server";

export const meta: Route.MetaFunction = () => [{ title: "Tải mẫu" }, { name: "robots", content: "noindex" }];

export async function loader({ params }: Route.LoaderArgs) {
  const r = await resolveDownloadToken(params.token);
  if (r.kind === "redirect") throw redirect(r.url, { headers: { "Cache-Control": "no-store" } });
  return r;
}

export default function DownloadPage({ loaderData }: Route.ComponentProps) {
  const r = loaderData;
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-24">
      <span className="label-mono">Tải mẫu</span>
      {r.kind === "waiting" ? (
        <>
          <h1 className="font-display text-5xl font-medium tracking-tight">Đang chuẩn bị file</h1>
          <p className="font-serif text-2xl italic text-ink-2">
            “{r.title}” đang được đưa lên máy chủ. Chúng tôi sẽ gửi email kèm link tải khi file sẵn sàng.
          </p>
        </>
      ) : r.kind === "invalid" ? (
        <>
          <h1 className="font-display text-5xl font-medium tracking-tight">Không thể tải</h1>
          <p className="font-serif text-2xl italic text-ink-2">{r.reason}</p>
        </>
      ) : null}
      <Link to="/purchases" className="btn-outline self-start">
        Đến Mẫu đã mua
      </Link>
    </main>
  );
}
