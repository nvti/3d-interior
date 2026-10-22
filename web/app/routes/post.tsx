import type { Route } from "./+types/post";
import { getPublishedPost } from "~/lib/posts.server";
import { Article } from "~/components/article";

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: "Không tìm thấy bài viết" }];
  return [
    { title: data.metaTitle || data.title },
    { name: "description", content: data.metaDescription || data.excerpt || "" },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const p = await getPublishedPost("post", params.slug);
  if (!p) throw new Response("Không tìm thấy", { status: 404 });
  return p;
}

export default function PostPage({ loaderData: p }: Route.ComponentProps) {
  return <Article eyebrow="Tạp chí" title={p.title} excerpt={p.excerpt} cover={p.cover} html={p.contentHtml} date={p.publishedAt} models={p.models} />;
}
