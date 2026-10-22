import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "./db.server";
import { mediaVariantUrl } from "./r2.server";
import { getModelCards } from "./models.server";

export async function getPublishedPost(type: "post" | "page", slug: string) {
  const db = getDb();
  const [p] = await db
    .select({ post: schema.posts, r2Key: schema.media.r2Key, variants: schema.media.variants })
    .from(schema.posts)
    .leftJoin(schema.media, eq(schema.media.id, schema.posts.coverMediaId))
    .where(and(eq(schema.posts.type, type), eq(schema.posts.slug, slug), eq(schema.posts.status, "published")))
    .limit(1);
  if (!p) return null;
  const linked = await db
    .select({ id: schema.postModels.modelId })
    .from(schema.postModels)
    .where(eq(schema.postModels.postId, p.post.id))
    .orderBy(asc(schema.postModels.sortOrder));
  return {
    title: p.post.title,
    excerpt: p.post.excerpt,
    contentHtml: p.post.contentHtml,
    publishedAt: p.post.publishedAt,
    metaTitle: p.post.metaTitle,
    metaDescription: p.post.metaDescription,
    cover: p.r2Key ? mediaVariantUrl({ r2Key: p.r2Key, variants: p.variants }, 2000) : null,
    models: await getModelCards(linked.map((l) => l.id)),
  };
}
