import { Form, Link, useSearchParams } from "react-router";
import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import type { Route } from "./+types/models";
import { getDb, schema } from "~/lib/db.server";
import { requireAdmin } from "~/lib/auth.server";
import { getCovers } from "~/lib/models.server";
import { formatPrice } from "~/lib/format";
import { AdminTop, StatusBadge } from "~/components/admin-ui";

const PER = 50;

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request); // loader con chạy song song với layout nên phải tự kiểm tra quyền
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const status = url.searchParams.get("status") ?? "";
  const r2 = url.searchParams.get("r2") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const { models, categories } = schema;

  const where: SQL[] = [];
  if (q) where.push(or(like(models.title, `%${q}%`), like(models.sku, `%${q}%`))!);
  if (status === "draft" || status === "published" || status === "archived") where.push(eq(models.status, status));
  if (r2 === "ready" || r2 === "absent" || r2 === "uploading" || r2 === "failed") where.push(eq(models.r2Status, r2));
  const cond = where.length ? and(...where) : undefined;

  const db = getDb();
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: models.id,
        sku: models.sku,
        title: models.title,
        status: models.status,
        r2Status: models.r2Status,
        priceVnd: models.priceVnd,
        updatedAt: models.updatedAt,
        category: categories.name,
      })
      .from(models)
      .innerJoin(categories, eq(categories.id, models.categoryId))
      .where(cond)
      .orderBy(desc(models.updatedAt))
      .limit(PER)
      .offset((page - 1) * PER),
    db.select({ n: sql<number>`COUNT(*)` }).from(models).where(cond),
  ]);
  const covers = await getCovers(rows.map((r) => r.id));
  return { rows: rows.map((r) => ({ ...r, cover: covers.get(r.id) ?? null })), total: n, page, pages: Math.ceil(n / PER) };
}

export default function AdminModels({ loaderData }: Route.ComponentProps) {
  const { rows, total, page, pages } = loaderData;
  const [params] = useSearchParams();
  const pageHref = (p: number) => {
    const s = new URLSearchParams(params);
    s.set("page", String(p));
    return `?${s}`;
  };
  return (
    <>
      <AdminTop title={`Mẫu 3D · ${total}`}>
        <Link to="/admin/models/new" className="btn-primary btn-sm">
          + Thêm mẫu
        </Link>
      </AdminTop>
      <div className="flex flex-col gap-4 p-7">
        <Form className="flex flex-wrap gap-3">
          <label className="flex-[1_1_260px]">
            <span className="sr-only">Tìm theo tên hoặc mã</span>
            <input name="q" defaultValue={params.get("q") ?? ""} placeholder="Tìm theo tên hoặc mã mẫu" className="field" />
          </label>
          <label>
            <span className="sr-only">Trạng thái</span>
            <select name="status" defaultValue={params.get("status") ?? ""} className="field w-44">
              <option value="">Mọi trạng thái</option>
              <option value="published">Đã xuất bản</option>
              <option value="draft">Bản nháp</option>
              <option value="archived">Lưu trữ</option>
            </select>
          </label>
          <label>
            <span className="sr-only">File trên R2</span>
            <select name="r2" defaultValue={params.get("r2") ?? ""} className="field w-48">
              <option value="">File: tất cả</option>
              <option value="ready">Có trên R2</option>
              <option value="absent">Chưa có trên R2</option>
              <option value="uploading">Đang đẩy lên</option>
              <option value="failed">Lỗi upload</option>
            </select>
          </label>
          <button className="btn-outline btn-sm h-11">Lọc</button>
        </Form>

        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-line text-left text-[12px] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Mẫu</th>
                <th className="px-4 py-3 font-medium">Thư mục</th>
                <th className="px-4 py-3 font-medium">Giá</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">File</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[#ECEAE5] last:border-0 hover:bg-paper">
                  <td className="px-4 py-2.5">
                    <Link to={`/admin/models/${r.id}`} className="flex items-center gap-3">
                      <span className="block size-11 flex-none overflow-hidden rounded bg-tone-1">
                        {r.cover && <img src={r.cover} alt="" className="size-full object-cover" />}
                      </span>
                      <span className="flex flex-col">
                        <span className="font-medium">{r.title}</span>
                        <span className="font-mono text-[11px] text-muted">{r.sku ?? "—"}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{r.category}</td>
                  <td className="px-4 py-2.5 font-mono text-[13px]">{formatPrice(r.priceVnd)}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={r.r2Status} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    Không có mẫu nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center gap-3 text-sm">
            {page > 1 && <Link to={pageHref(page - 1)} className="btn-outline btn-sm">Trang trước</Link>}
            <span className="text-muted">
              Trang {page} / {pages}
            </span>
            {page < pages && <Link to={pageHref(page + 1)} className="btn-outline btn-sm">Trang sau</Link>}
          </div>
        )}
      </div>
    </>
  );
}
