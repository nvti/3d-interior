import type { Route } from "./+types/page";
import { getPublishedPost } from "~/lib/posts.server";
import { Article } from "~/components/article";

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: "Không tìm thấy trang" }];
  return [{ title: data.metaTitle || data.title }, { name: "description", content: data.metaDescription || data.excerpt || "" }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const p = await getPublishedPost("page", params.slug);
  if (!p) throw new Response("Không tìm thấy", { status: 404 });
  return p;
}

export default function StaticPage({ loaderData: p }: Route.ComponentProps) {
  return <Article eyebrow="Thông tin" title={p.title} excerpt={p.excerpt} cover={p.cover} html={p.contentHtml} models={p.models} />;
}
