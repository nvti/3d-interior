import { env } from "cloudflare:workers";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=Inter:wght@400;500;600&family=Cormorant+Garamond:ital,wght@1,400;1,500&family=IBM+Plex+Mono:wght@400;500&display=swap",
  },
];

export function loader() {
  return { siteName: env.SITE_NAME, siteUrl: env.PUBLIC_SITE_URL };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const site = useRouteLoaderData<typeof loader>("root");
  return (
    <html lang="vi">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ecebe8" />
        <Meta />
        {/* Sau <Meta /> để ảnh og:image riêng của từng trang (nếu có) được ưu tiên */}
        {site && (
          <>
            <meta property="og:site_name" content={site.siteName} />
            <meta property="og:type" content="website" />
            <meta property="og:image" content={`${site.siteUrl}/og-image.png`} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta name="twitter:card" content="summary_large_image" />
          </>
        )}
        <Links />
      </head>
      <body className="min-h-screen bg-ground font-sans text-ink">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Có lỗi xảy ra";
  let details = "Vui lòng thử lại sau ít phút.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Không tìm thấy trang";
      details = "Trang bạn tìm có thể đã được chuyển hoặc không còn tồn tại.";
    } else if (error.status === 403) {
      title = "Không có quyền truy cập";
      details = typeof error.data === "string" ? error.data : details;
    } else {
      details = error.statusText || details;
    }
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-24">
      <span className="label-mono">Lỗi</span>
      <h1 className="font-display text-5xl font-medium tracking-tight">{title}</h1>
      <p className="font-serif text-2xl italic text-ink-2">{details}</p>
      <Link to="/" className="btn-outline self-start">
        Về thư viện
      </Link>
      {stack && (
        <pre className="overflow-x-auto rounded-lg bg-paper p-4 text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
