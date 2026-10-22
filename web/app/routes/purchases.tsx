import { Form, Link, redirect, useSearchParams } from "react-router";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Route } from "./+types/purchases";
import { requireUser } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import { getCovers } from "~/lib/models.server";
import { createDownloadRequest, tokenFor } from "~/lib/downloads.server";
import { formatBytes, formatDate } from "~/lib/format";
import { PageTitle, Placeholder } from "~/components/site";
import { IconDownload } from "~/components/icons";

export const meta: Route.MetaFunction = () => [{ title: "Mẫu đã mua" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const db = getDb();
  const rows = await db
    .select({
      id: schema.models.id,
      slug: schema.models.slug,
      title: schema.models.title,
      sizeBytes: schema.models.fileSizeBytes,
      r2Status: schema.models.r2Status,
      boughtAt: schema.entitlements.createdAt,
      orderCode: schema.orders.code,
    })
    .from(schema.entitlements)
    .innerJoin(schema.models, eq(schema.models.id, schema.entitlements.modelId))
    .leftJoin(schema.orders, eq(schema.orders.id, schema.entitlements.orderId))
    .where(and(eq(schema.entitlements.userId, user.id), eq(schema.entitlements.revoked, false)))
    .orderBy(desc(schema.entitlements.createdAt));
  const ids = rows.map((r) => r.id);
  const [covers, waiting] = await Promise.all([
    getCovers(ids),
    ids.length
      ? db
          .selectDistinct({ modelId: schema.downloadRequests.modelId })
          .from(schema.downloadRequests)
          .where(
            and(
              eq(schema.downloadRequests.userId, user.id),
              eq(schema.downloadRequests.status, "waiting_upload"),
              inArray(schema.downloadRequests.modelId, ids),
            ),
          )
      : Promise.resolve([]),
  ]);
  const waitingSet = new Set(waiting.map((w) => w.modelId));
  return {
    email: user.email,
    rows: rows.map((r) => ({
      ...r,
      cover: covers.get(r.id) ?? null,
      preparing: waitingSet.has(r.id) || r.r2Status === "uploading",
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const form = await request.formData();
  const modelId = String(form.get("modelId") ?? "");
  const [ent] = await getDb()
    .select({ revoked: schema.entitlements.revoked })
    .from(schema.entitlements)
    .where(and(eq(schema.entitlements.userId, user.id), eq(schema.entitlements.modelId, modelId)))
    .limit(1);
  if (!ent || ent.revoked) throw new Response("Không có quyền", { status: 403 });

  // mỗi lần bấm tải = một link riêng
  const r = await createDownloadRequest({ userId: user.id, modelId, email: user.email, notify: "when_ready" });
  if (r.ready) return redirect(`/d/${await tokenFor(r.id)}`);
  return redirect(`/purchases?preparing=${encodeURIComponent(r.title)}`);
}

export default function Purchases({ loaderData }: Route.ComponentProps) {
  const { rows, email } = loaderData;
  const [params] = useSearchParams();
  const preparingTitle = params.get("preparing");
  const anyPreparing = rows.some((r) => r.preparing);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-9 px-5 pt-16 pb-24 md:px-12 md:pt-[72px]">
      <PageTitle
        eyebrow={`Tài khoản · ${rows.length} mẫu`}
        title="Mẫu đã mua"
        sub="Tải lại bất cứ lúc nào — mỗi lần tải là một link mới, chỉ dành cho bạn."
      />

      {(preparingTitle || anyPreparing) && (
        <div role="status" className="flex items-baseline gap-3.5 border-y border-ink border-b-line py-4 text-[15px] leading-relaxed">
          <span aria-hidden className="inline-block size-2 flex-none -translate-y-px rounded-full bg-accent" />
          <span>
            {preparingTitle ? `“${preparingTitle}” đang được chuẩn bị. ` : "Có mẫu đang được chuẩn bị. "}
            Link tải sẽ được gửi tới <span className="font-mono text-[13px]">{email}</span> khi file sẵn sàng, thường trong vài phút.
          </span>
        </div>
      )}
      {params.get("owned") && <p className="text-sm text-muted">Bạn đã sở hữu các mẫu trong đơn này.</p>}

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 border-t border-line pt-8">
          <p className="font-serif text-2xl italic">Bạn chưa mua mẫu nào.</p>
          <Link to="/" className="btn-outline btn-sm">
            Khám phá thư viện
          </Link>
        </div>
      ) : (
        <ul className="border-t border-line">
          {rows.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-7 gap-y-4 border-b border-line py-5">
              <span className="w-11 flex-none font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
              <Link to={`/models/${r.slug}`} className="w-24 flex-none">
                {r.cover ? <img src={r.cover} alt="" className="aspect-[4/5] w-full object-cover" /> : <Placeholder index={i} className="aspect-[4/5]" />}
              </Link>
              <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
                <Link to={`/models/${r.slug}`} className="font-display text-xl font-medium tracking-tight">
                  {r.title}
                </Link>
                <span className="font-mono text-[11.5px] uppercase text-muted">
                  Mua {formatDate(r.boughtAt)} {r.orderCode && `· Đơn ${r.orderCode}`} · {formatBytes(r.sizeBytes)}
                </span>
              </div>
              <span className="flex w-36 flex-none items-center gap-2 text-[13px]">
                <span aria-hidden className={`inline-block size-[7px] rounded-full ${r.preparing ? "bg-accent" : "bg-ink"}`} />
                {r.preparing ? "Đang chuẩn bị" : "Sẵn sàng"}
              </span>
              {r.preparing ? (
                <button type="button" disabled className="btn h-12 border border-line-strong text-muted">
                  Sẽ gửi qua email
                </button>
              ) : (
                <Form method="post" reloadDocument>
                  <input type="hidden" name="modelId" value={r.id} />
                  <button className="btn-primary">
                    Tải xuống <IconDownload />
                  </button>
                </Form>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted">
        Gặp lỗi khi tải? <Link to="/p/contact" className="underline">Liên hệ hỗ trợ</Link> kèm mã đơn hàng.
      </p>
    </div>
  );
}
