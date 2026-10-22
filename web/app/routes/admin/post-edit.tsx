import { Form, redirect, useActionData, useNavigation } from "react-router";
import { and, asc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { useState } from "react";
import { z } from "zod";
import type { Route } from "./+types/post-edit";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { flattenTree, getCategoryTree } from "~/lib/categories.server";
import { mediaVariantUrl } from "~/lib/r2.server";
import { extractTiptapText, isTiptapDoc, renderTiptapHtml } from "~/lib/tiptap";
import { slugify } from "~/lib/format";
import { uploadImage } from "~/lib/image-upload.client";
import { AdminTop, FlashError, Section } from "~/components/admin-ui";
import { RichEditor } from "~/components/rich-editor";

const { posts, postModels, models, media } = schema;

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const db = getDb();
  const cats = flattenTree(await getCategoryTree("post")).map((c) => ({ id: c.id, label: `${"— ".repeat(c.depth)}${c.name}` }));
  if (params.id === "new") {
    const type = new URL(request.url).searchParams.get("type") === "page" ? "page" : "post";
    return { post: null, type, cats, cover: null, modelSkus: "" };
  }
  const [post] = await db.select().from(posts).where(eq(posts.id, params.id)).limit(1);
  if (!post) throw new Response("Không tìm thấy", { status: 404 });
  const [cover] = post.coverMediaId
    ? await db.select({ r2Key: media.r2Key, variants: media.variants }).from(media).where(eq(media.id, post.coverMediaId)).limit(1)
    : [];
  const linked = await db
    .select({ sku: models.sku, slug: models.slug })
    .from(postModels)
    .innerJoin(models, eq(models.id, postModels.modelId))
    .where(eq(postModels.postId, post.id))
    .orderBy(asc(postModels.sortOrder));
  return {
    post,
    type: post.type,
    cats,
    cover: cover ? mediaVariantUrl(cover, 1200) : null,
    modelSkus: linked.map((l) => l.sku ?? l.slug).join(", "),
  };
}

const Fields = z.object({
  title: z.string().trim().min(1, "Cần nhập tiêu đề").max(200),
  slug: z.string().trim().max(100).optional(),
  type: z.enum(["post", "page"]),
  excerpt: z.string().trim().max(600).optional(),
  categoryId: z.string().optional(),
  coverMediaId: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]),
  metaTitle: z.string().trim().max(200).optional(),
  metaDescription: z.string().trim().max(400).optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  const db = getDb();
  const form = await request.formData();
  if (form.get("intent") === "delete" && params.id !== "new") {
    await db.delete(posts).where(eq(posts.id, params.id));
    return redirect("/admin/posts");
  }
  const parsed = Fields.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(" · ") };
  const f = parsed.data;
  const slug = slugify(f.slug || f.title);
  const [dup] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.type, f.type), eq(posts.slug, slug))).limit(1);
  if (dup && dup.id !== params.id) return { error: `Slug “${slug}” đã được dùng` };

  let doc: unknown = null;
  try {
    doc = JSON.parse(String(form.get("content") ?? "null"));
  } catch {
    return { error: "Nội dung không hợp lệ" };
  }
  const content = isTiptapDoc(doc) ? doc : null;
  const values = {
    title: f.title,
    slug,
    type: f.type,
    excerpt: f.excerpt || null,
    categoryId: f.categoryId || null,
    coverMediaId: f.coverMediaId || null,
    status: f.status,
    metaTitle: f.metaTitle || null,
    metaDescription: f.metaDescription || null,
    contentJson: content,
    contentHtml: content ? renderTiptapHtml(content, env.MEDIA_PUBLIC_URL) : null,
    contentText: content ? extractTiptapText(content).trim() : null,
  };

  let id = params.id;
  if (id === "new") {
    const [row] = await db
      .insert(posts)
      .values({ ...values, authorId: admin.id, publishedAt: f.status === "published" ? new Date() : null })
      .returning({ id: posts.id });
    id = row.id;
  } else {
    const [cur] = await db.select({ publishedAt: posts.publishedAt }).from(posts).where(eq(posts.id, id)).limit(1);
    await db
      .update(posts)
      .set({ ...values, publishedAt: cur?.publishedAt ?? (f.status === "published" ? new Date() : null) })
      .where(eq(posts.id, id));
  }

  // Mẫu gắn trong bài: nhập SKU hoặc slug, phân cách bằng dấu phẩy
  const keys = String(form.get("models") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 24);
  const found = keys.length
    ? await db.select({ id: models.id, sku: models.sku, slug: models.slug }).from(models).where(inArray(models.sku, keys))
    : [];
  const bySlug = keys.length
    ? await db.select({ id: models.id, sku: models.sku, slug: models.slug }).from(models).where(inArray(models.slug, keys))
    : [];
  const all = [...found, ...bySlug];
  const ordered = keys.map((k) => all.find((m) => m.sku === k || m.slug === k)).filter((m): m is NonNullable<typeof m> => !!m);
  await db.batch([
    db.delete(postModels).where(eq(postModels.postId, id)),
    ...[...new Map(ordered.map((m) => [m.id, m])).values()].map((m, i) =>
      db.insert(postModels).values({ postId: id, modelId: m.id, sortOrder: i }),
    ),
  ]);

  if (params.id === "new") return redirect(`/admin/posts/${id}`);
  return { ok: "Đã lưu." };
}

export default function PostEdit({ loaderData }: Route.ComponentProps) {
  const { post: p, type, cats, cover, modelSkus } = loaderData;
  const res = useActionData<typeof action>();
  const nav = useNavigation();
  const [coverId, setCoverId] = useState(p?.coverMediaId ?? "");
  const [coverUrl, setCoverUrl] = useState(cover);
  const [uploading, setUploading] = useState(false);

  return (
    <Form method="post" className="flex flex-col">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="coverMediaId" value={coverId} />
      <AdminTop crumbs={[{ to: `/admin/posts?type=${type}`, label: type === "post" ? "Tạp chí" : "Trang tĩnh" }]} title={p?.title ?? (type === "post" ? "Bài viết mới" : "Trang mới")}>
        <button className="btn-primary btn-sm" disabled={nav.state === "submitting"}>
          {nav.state === "submitting" ? "Đang lưu…" : "Lưu"}
        </button>
      </AdminTop>
      <div className="flex flex-wrap items-start gap-6 p-7">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <FlashError error={res && "error" in res ? res.error : null} />
          {res && "ok" in res && <p role="status" className="rounded-lg bg-ok-bg px-4 py-3 text-sm text-ok">{res.ok}</p>}
          <Section title="Nội dung chính">
            <label className="field-label">
              Tiêu đề
              <input name="title" required defaultValue={p?.title ?? ""} className="field" />
            </label>
            <label className="field-label">
              Slug
              <input name="slug" defaultValue={p?.slug ?? ""} className="field font-mono text-[13px]" />
            </label>
            <label className="field-label">
              Sapo / mô tả ngắn
              <textarea name="excerpt" rows={2} defaultValue={p?.excerpt ?? ""} className="field h-auto py-2.5" />
            </label>
            <RichEditor name="content" initial={p?.contentJson ?? null} />
          </Section>
        </div>
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <Section title="Trạng thái">
            <select name="status" defaultValue={p?.status ?? "draft"} className="field" aria-label="Trạng thái">
              <option value="draft">Bản nháp</option>
              <option value="published">Đã xuất bản</option>
              <option value="archived">Lưu trữ</option>
            </select>
          </Section>
          <Section title="Ảnh bìa">
            {coverUrl ? <img src={coverUrl} alt="" className="aspect-[16/10] w-full rounded-lg object-cover" /> : <div className="aspect-[16/10] rounded-lg bg-tone-1" />}
            <label className="btn-outline btn-sm cursor-pointer">
              {uploading ? "Đang tải…" : "Chọn ảnh"}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  try {
                    const m = await uploadImage(f);
                    setCoverId(m.id);
                    setCoverUrl(m.thumbUrl);
                  } catch (err) {
                    alert((err as Error).message);
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
          </Section>
          {type === "post" && (
            <Section title="Chuyên mục & mẫu">
              <label className="field-label">
                Chuyên mục
                <select name="categoryId" defaultValue={p?.categoryId ?? ""} className="field">
                  <option value="">—</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Mẫu gắn trong bài <span className="font-normal text-muted">SKU hoặc slug, phân cách bằng dấu phẩy</span>
                <textarea name="models" rows={2} defaultValue={modelSkus} className="field h-auto py-2.5 font-mono text-xs" />
              </label>
            </Section>
          )}
          <Section title="SEO">
            <label className="field-label">
              Meta title
              <input name="metaTitle" defaultValue={p?.metaTitle ?? ""} className="field" />
            </label>
            <label className="field-label">
              Meta description
              <textarea name="metaDescription" rows={3} defaultValue={p?.metaDescription ?? ""} className="field h-auto py-2.5" />
            </label>
          </Section>
          {p && (
            <button
              name="intent"
              value="delete"
              className="self-start text-[13px] text-danger underline underline-offset-4"
              onClick={(e) => {
                if (!confirm("Xoá nội dung này?")) e.preventDefault();
              }}
            >
              Xoá
            </button>
          )}
        </aside>
      </div>
    </Form>
  );
}
