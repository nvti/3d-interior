import { Form, Link, redirect, useActionData, useNavigation } from "react-router";
import { asc, eq, inArray } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { z } from "zod";
import type { Route } from "./+types/model-edit";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { flattenTree, getCategoryTree } from "~/lib/categories.server";
import { afterModelChanged, getManualRelatedIds, getModelCards, RELATED_LIMIT, suggestRelated } from "~/lib/models.server";
import { ensureUpload } from "~/lib/downloads.server";
import { mediaVariantUrl } from "~/lib/r2.server";
import { extractTiptapText, isTiptapDoc, renderTiptapHtml } from "~/lib/tiptap";
import { formatBytes, formatDate, FORMATS, slugify, STYLES } from "~/lib/format";
import { AdminTop, FlashError, Section, StatusBadge } from "~/components/admin-ui";
import { RichEditor } from "~/components/rich-editor";
import { ImageManager } from "~/components/image-manager";
import { RelatedPicker, type RelatedItem } from "~/components/related-picker";

const { models, modelImages, media, tags, modelTags, modelRelated, orderItems } = schema;

const toRelatedItem = (m: RelatedItem): RelatedItem => ({ id: m.id, title: m.title, sku: m.sku, coverUrl: m.coverUrl });

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const db = getDb();
  const cats = flattenTree(await getCategoryTree("model")).map((c) => ({
    id: c.id,
    label: `${"— ".repeat(c.depth)}${c.name}`,
  }));
  if (params.id === "new")
    return {
      model: null,
      images: [],
      tags: "",
      cats,
      related: [],
      suggested: [],
      relatedLimit: RELATED_LIMIT,
      evictDays: Number(env.R2_EVICT_DAYS) || 30,
    };

  const [model] = await db.select().from(models).where(eq(models.id, params.id)).limit(1);
  if (!model) throw new Response("Không tìm thấy", { status: 404 });
  const manualIds = await getManualRelatedIds(model.id, false);
  const [imgs, tagRows, related, suggested] = await Promise.all([
    db
      .select({ id: media.id, r2Key: media.r2Key, variants: media.variants, caption: modelImages.caption })
      .from(modelImages)
      .innerJoin(media, eq(media.id, modelImages.mediaId))
      .where(eq(modelImages.modelId, model.id))
      .orderBy(asc(modelImages.sortOrder)),
    db
      .select({ name: tags.name })
      .from(modelTags)
      .innerJoin(tags, eq(tags.id, modelTags.tagId))
      .where(eq(modelTags.modelId, model.id)),
    getModelCards(manualIds, { anyStatus: true }),
    suggestRelated(model, RELATED_LIMIT, manualIds).then((ids) => getModelCards(ids)),
  ]);
  return {
    model,
    images: imgs.map((i) => ({ id: i.id, url: mediaVariantUrl(i, 400), caption: i.caption })),
    tags: tagRows.map((t) => t.name).join(", "),
    cats,
    related: related.map(toRelatedItem),
    suggested: suggested.map(toRelatedItem),
    relatedLimit: RELATED_LIMIT,
    evictDays: Number(env.R2_EVICT_DAYS) || 30,
  };
}

const intNull = z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(/[^\d]/g, ""))), z.number().int().min(0).nullable());

const Fields = z.object({
  title: z.string().trim().min(1, "Cần nhập tiêu đề").max(200),
  slug: z.string().trim().max(100).optional(),
  sku: z.string().trim().max(100).optional(),
  categoryId: z.string().min(1, "Chọn thư mục"),
  subtitle: z.string().trim().max(300).optional(),
  description: z.string().trim().max(2000).optional(),
  priceVnd: intNull,
  style: z.string().trim().max(60).optional(),
  renderEngine: z.enum(["", "vray", "corona", "other"]).optional(),
  maxVersion: z.string().trim().max(20).optional(),
  materials: z.string().trim().max(200).optional(),
  widthMm: intNull,
  depthMm: intNull,
  heightMm: intNull,
  fileKey: z.string().trim().max(500).optional(),
  status: z.enum(["draft", "published", "archived"]),
  metaTitle: z.string().trim().max(200).optional(),
  metaDescription: z.string().trim().max(400).optional(),
});

export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const db = getDb();
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");
  const id = params.id;

  if (intent === "push-r2" && id !== "new") {
    await ensureUpload(id, true);
    return { ok: "Đã đưa vào hàng đợi – tool máy nhà sẽ upload khi online." };
  }
  if (intent === "delete" && id !== "new") {
    const [sold] = await db.select({ id: orderItems.orderId }).from(orderItems).where(eq(orderItems.modelId, id)).limit(1);
    if (sold) {
      await db.update(models).set({ status: "archived" }).where(eq(models.id, id));
      await afterModelChanged(id);
      return { ok: "Mẫu đã có người mua nên được chuyển sang Lưu trữ thay vì xoá." };
    }
    const [m] = await db.select({ fileKey: models.fileKey, r2: models.r2Status }).from(models).where(eq(models.id, id)).limit(1);
    if (m?.r2 === "ready" && m.fileKey) await env.MODELS.delete(m.fileKey);
    await db.delete(models).where(eq(models.id, id));
    await afterModelChanged(id);
    return redirect("/admin/models");
  }

  const raw = Object.fromEntries(["title", "slug", "sku", "categoryId", "subtitle", "description", "priceVnd", "style", "renderEngine", "maxVersion", "materials", "widthMm", "depthMm", "heightMm", "fileKey", "status", "metaTitle", "metaDescription"].map((k) => [k, form.get(k) ?? undefined]));
  const parsed = Fields.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(" · ") };
  const f = parsed.data;

  let contentJson: unknown = null;
  try {
    contentJson = JSON.parse(String(form.get("content") ?? "null"));
  } catch {
    return { error: "Nội dung không hợp lệ" };
  }
  const doc = isTiptapDoc(contentJson) ? contentJson : null;
  const formats = form.getAll("formats").map(String).filter((x) => FORMATS.includes(x));
  const slug = slugify(f.slug || f.title);
  if (!slug) return { error: "Slug không hợp lệ" };

  const [dup] = await db.select({ id: models.id }).from(models).where(eq(models.slug, slug)).limit(1);
  if (dup && dup.id !== id) return { error: `Slug “${slug}” đã được dùng cho mẫu khác` };

  const values = {
    title: f.title,
    slug,
    categoryId: f.categoryId,
    subtitle: f.subtitle || null,
    description: f.description || null,
    priceVnd: f.priceVnd ?? 0,
    style: f.style || null,
    renderEngine: f.renderEngine ? f.renderEngine : null,
    maxVersion: f.maxVersion || null,
    materials: f.materials || null,
    widthMm: f.widthMm,
    depthMm: f.depthMm,
    heightMm: f.heightMm,
    formats,
    status: f.status,
    metaTitle: f.metaTitle || null,
    metaDescription: f.metaDescription || null,
    contentJson: doc,
    contentHtml: doc ? renderTiptapHtml(doc, env.MEDIA_PUBLIC_URL) : null,
    contentText: doc ? extractTiptapText(doc).trim() : null,
    relatedAuto: form.get("relatedAuto") === "on",
    // SKU & fileKey là "khoá" để tool máy nhà nhận diện mẫu: chỉ ghi khi form có gửi trường này
    ...(form.has("sku") ? { sku: f.sku || null } : {}),
    ...(form.has("fileKey") ? { fileKey: f.fileKey || null } : {}),
  };

  let modelId = id;
  if (id === "new") {
    const [row] = await db
      .insert(models)
      .values({ ...values, publishedAt: f.status === "published" ? new Date() : null })
      .returning({ id: models.id });
    modelId = row.id;
  } else {
    const [cur] = await db.select({ publishedAt: models.publishedAt }).from(models).where(eq(models.id, id)).limit(1);
    await db
      .update(models)
      .set({ ...values, publishedAt: cur?.publishedAt ?? (f.status === "published" ? new Date() : null) })
      .where(eq(models.id, id));
  }

  // Ảnh: thay toàn bộ theo thứ tự mới
  const imgs = z
    .array(z.object({ id: z.string(), caption: z.string().max(200).nullable() }))
    .catch([])
    .parse(JSON.parse(String(form.get("images") ?? "[]")));
  const stmts = [db.delete(modelImages).where(eq(modelImages.modelId, modelId))];
  // Tag
  const tagNames = [...new Set(String(form.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 30);
  const tagRows = tagNames.map((name) => ({ id: crypto.randomUUID(), name, slug: slugify(name) })).filter((t) => t.slug);
  if (tagRows.length) {
    await db.insert(tags).values(tagRows).onConflictDoNothing({ target: tags.slug });
  }
  const tagIds = tagRows.length
    ? (await db.select({ id: tags.id }).from(tags).where(inArray(tags.slug, tagRows.map((t) => t.slug)))).map((t) => t.id)
    : [];
  // Mẫu tương tự chọn tay: giữ thứ tự, bỏ chính nó và id không còn tồn tại
  const relatedRaw = z
    .array(z.string())
    .catch([])
    .parse(JSON.parse(String(form.get("related") ?? "[]")))
    .filter((rid, i, xs) => rid !== modelId && xs.indexOf(rid) === i)
    .slice(0, 24);
  const existing = relatedRaw.length
    ? new Set((await db.select({ id: models.id }).from(models).where(inArray(models.id, relatedRaw))).map((r) => r.id))
    : new Set<string>();
  const relatedIds = relatedRaw.filter((rid) => existing.has(rid));
  await db.batch([
    stmts[0],
    db.delete(modelTags).where(eq(modelTags.modelId, modelId)),
    db.delete(modelRelated).where(eq(modelRelated.modelId, modelId)),
    ...imgs.map((img, i) => db.insert(modelImages).values({ modelId, mediaId: img.id, sortOrder: i, caption: img.caption })),
    ...tagIds.map((tagId) => db.insert(modelTags).values({ modelId, tagId }).onConflictDoNothing()),
    ...relatedIds.map((relatedId, i) => db.insert(modelRelated).values({ modelId, relatedId, sortOrder: i })),
  ]);

  await afterModelChanged(modelId);
  if (id === "new") return redirect(`/admin/models/${modelId}`);
  return { ok: "Đã lưu." };
}

export default function ModelEdit({ loaderData }: Route.ComponentProps) {
  const { model: m, images, tags: tagStr, cats, related, suggested, relatedLimit, evictDays } = loaderData;
  const res = useActionData<typeof action>();
  const nav = useNavigation();
  const saving = nav.state === "submitting";
  const isNew = !m;

  return (
    <Form method="post" className="flex flex-col">
      <AdminTop crumbs={[{ to: "/admin/models", label: "Mẫu 3D" }]} title={m?.title ?? "Thêm mẫu mới"}>
        {m && m.status === "published" && (
          <Link to={`/models/${m.slug}`} target="_blank" className="btn-outline btn-sm">
            Xem trên web
          </Link>
        )}
        <button name="intent" value="save" className="btn-primary btn-sm" disabled={saving}>
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </AdminTop>

      <div className="flex flex-wrap items-start gap-6 p-7">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
          <FlashError error={res && "error" in res ? res.error : null} />
          {res && "ok" in res && <p role="status" className="rounded-lg bg-ok-bg px-4 py-3 text-sm text-ok">{res.ok}</p>}

          <Section title="Thông tin chung">
            <label className="field-label">
              Tiêu đề
              <input name="title" required defaultValue={m?.title ?? ""} className="field" />
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="field-label flex-[1_1_260px]">
                Đường dẫn (slug) <span className="font-normal text-muted">để trống sẽ tự tạo từ tiêu đề</span>
                <input name="slug" defaultValue={m?.slug ?? ""} className="field font-mono text-[13px]" />
              </label>
              <label className="field-label flex-[1_1_260px]">
                Thư mục
                <select name="categoryId" required defaultValue={m?.categoryId ?? ""} className="field">
                  <option value="" disabled>
                    Chọn thư mục…
                  </option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field-label">
              Câu mô tả tinh thần <span className="font-normal text-muted">hiện in nghiêng dưới tiêu đề</span>
              <input name="subtitle" defaultValue={m?.subtitle ?? ""} className="field" />
            </label>
            <label className="field-label">
              Mô tả ngắn <span className="font-normal text-muted">dùng cho tìm kiếm và thẻ chia sẻ</span>
              <textarea name="description" rows={3} defaultValue={m?.description ?? ""} className="field h-auto py-2.5 leading-relaxed" />
            </label>
          </Section>

          <Section title="Ảnh preview" aside="ảnh đầu tiên là ảnh bìa · ảnh được tự resize sang WebP">
            <ImageManager name="images" initial={images} alt={m?.title ?? ""} />
          </Section>

          <Section title="Thông số">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              <label className="field-label">
                Giá (VND) <span className="font-normal text-muted">0 = miễn phí</span>
                <input name="priceVnd" inputMode="numeric" defaultValue={m?.priceVnd ?? 0} className="field font-mono text-sm" />
              </label>
              <label className="field-label">
                Phong cách
                <input name="style" list="styles" defaultValue={m?.style ?? ""} className="field" />
                <datalist id="styles">
                  {STYLES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              <label className="field-label">
                Render engine
                <select name="renderEngine" defaultValue={m?.renderEngine ?? ""} className="field">
                  <option value="">—</option>
                  <option value="corona">Corona</option>
                  <option value="vray">V-Ray</option>
                  <option value="other">Khác</option>
                </select>
              </label>
              <label className="field-label">
                Phiên bản 3ds Max
                <input name="maxVersion" defaultValue={m?.maxVersion ?? ""} className="field font-mono text-sm" />
              </label>
              <label className="field-label">
                Chất liệu
                <input name="materials" defaultValue={m?.materials ?? ""} placeholder="Vải bố, gỗ sồi" className="field" />
              </label>
              <label className="field-label">
                Mã mẫu (SKU)
                <input name="sku" defaultValue={m?.sku ?? ""} className="field font-mono text-sm" />
              </label>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="pb-1.5 text-[13px] font-medium">Định dạng</legend>
              <div className="flex flex-wrap gap-2">
                {FORMATS.map((f) => (
                  <label key={f} className="flex h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 font-mono text-xs">
                    <input type="checkbox" name="formats" value={f} defaultChecked={m?.formats?.includes(f)} className="accent-ink" /> {f}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="pb-1.5 text-[13px] font-medium">Kích thước (mm)</legend>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    ["widthMm", "Rộng"],
                    ["depthMm", "Sâu"],
                    ["heightMm", "Cao"],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k} className="flex flex-col gap-1 text-xs text-muted">
                    {l}
                    <input name={k} inputMode="numeric" defaultValue={m?.[k] ?? ""} className="field h-10 font-mono text-sm text-ink" />
                  </label>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section title="Nội dung">
            <RichEditor name="content" initial={m?.contentJson ?? null} />
          </Section>

          <Section title="Mẫu tương tự" aside={`trang mẫu hiện ${relatedLimit} mẫu`}>
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" name="relatedAuto" defaultChecked={m?.relatedAuto ?? true} className="mt-0.5 accent-ink" />
              <span>
                Tự điền thêm cho đủ {relatedLimit} mẫu{" "}
                <span className="text-muted">– tắt nếu chỉ muốn hiện các mẫu chọn tay</span>
              </span>
            </label>
            {m ? (
              <RelatedPicker name="related" modelId={m.id} initial={related} suggested={suggested} limit={relatedLimit} />
            ) : (
              <p className="text-[13px] text-muted">Lưu mẫu trước, sau đó chọn mẫu tương tự.</p>
            )}
          </Section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <Section title="Trạng thái">
            <label className="field-label">
              Hiển thị
              <select name="status" defaultValue={m?.status ?? "draft"} className="field">
                <option value="draft">Bản nháp</option>
                <option value="published">Đã xuất bản</option>
                <option value="archived">Lưu trữ</option>
              </select>
            </label>
            {m && <p className="text-[13px] text-muted">Sửa lần cuối {formatDate(m.updatedAt)}</p>}
          </Section>

          <Section title="File mẫu">
            <label className="field-label">
              Key file (đường dẫn tương đối trong thư viện)
              <input name="fileKey" defaultValue={m?.fileKey ?? ""} className="field font-mono text-xs" />
            </label>
            {m && (
              <dl className="flex flex-col gap-2.5 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Dung lượng</dt>
                  <dd className="font-mono text-xs">{formatBytes(m.fileSizeBytes)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Trên R2</dt>
                  <dd>
                    <StatusBadge status={m.r2Status} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Lần tải cuối</dt>
                  <dd className="text-xs">{formatDate(m.lastDownloadAt)}</dd>
                </div>
              </dl>
            )}
            <p className="text-xs leading-relaxed text-muted">
              File được đẩy lên R2 khi có đơn đầu tiên và tự xoá sau {evictDays} ngày không có lượt tải.
            </p>
            {m && (
              <button name="intent" value="push-r2" className="btn-outline btn-sm" disabled={saving || !m.fileKey}>
                Đẩy lên R2 ngay
              </button>
            )}
          </Section>

          <Section title="Tag">
            <label className="field-label">
              Phân cách bằng dấu phẩy
              <input name="tags" defaultValue={tagStr} placeholder="vải bố, gỗ sồi, màu be" className="field" />
            </label>
          </Section>

          <Section title="SEO">
            <label className="field-label">
              Meta title
              <input name="metaTitle" defaultValue={m?.metaTitle ?? ""} className="field" />
            </label>
            <label className="field-label">
              Meta description
              <textarea name="metaDescription" rows={3} defaultValue={m?.metaDescription ?? ""} className="field h-auto py-2.5" />
            </label>
          </Section>

          {!isNew && (
            <button
              name="intent"
              value="delete"
              className="self-start text-[13px] text-danger underline underline-offset-4"
              onClick={(e) => {
                if (!confirm("Xoá mẫu này? Nếu mẫu đã có người mua, mẫu sẽ được chuyển sang Lưu trữ.")) e.preventDefault();
              }}
            >
              Xoá mẫu
            </button>
          )}
        </aside>
      </div>
    </Form>
  );
}
