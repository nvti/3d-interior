import { Form, Link, useSearchParams } from "react-router";
import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import type { Route } from "./+types/models";
import { getDb, schema } from "~/lib/db.server";
import { requireAdmin } from "~/lib/auth.server";
import { getCovers } from "~/lib/models.server";
import { formatDate, formatPrice } from "~/lib/format";
import { AdminBody, AdminTop, EmptyState, Pagination, StatusBadge } from "~/components/admin-ui";
import { IconPlus, IconSearch, IconUpload } from "~/components/icons";

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
  const filtered = !!(params.get("q") || params.get("status") || params.get("r2"));
  return (
    <>
      <AdminTop title="Mẫu 3D" subtitle={`${total} mẫu${filtered ? " khớp bộ lọc" : " trong thư viện"}`}>
        <Link to="/admin/library" className="btn-outline btn-sm">
          <IconUpload size={15} /> Nhập từ máy nhà
        </Link>
        <Link to="/admin/models/new" className="btn-primary btn-sm">
          <IconPlus size={15} /> Thêm mẫu
        </Link>
      </AdminTop>
      <AdminBody>
        <Form className="card flex flex-wrap items-center gap-3 p-3">
          <label className="relative flex-[1_1_260px]">
            <span className="sr-only">Tìm theo tên hoặc mã</span>
            <IconSearch size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <input name="q" defaultValue={params.get("q") ?? ""} placeholder="Tìm theo tên hoặc mã mẫu" className="field pl-10!" />
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
          <button className="btn-primary btn-sm h-11">Lọc</button>
          {filtered && (
            <Link to="?" className="px-1 text-[13px] text-muted underline underline-offset-4 hover:text-ink">
              Xoá lọc
            </Link>
          )}
        </Form>

        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(18,18,18,0.04)]">
          {rows.length === 0 ? (
            <EmptyState
              title="Không có mẫu nào"
              hint={filtered ? "Thử đổi từ khoá hoặc bỏ bớt bộ lọc." : "Mẫu được đăng từ máy nhà (home-agent) hoặc thêm tay."}
              action={
                filtered ? (
                  <Link to="?" className="btn-outline btn-sm">Xoá lọc</Link>
                ) : (
                  <Link to="/admin/models/new" className="btn-primary btn-sm">Thêm mẫu</Link>
                )
              }
            />
          ) : (
            <table className="admin-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Mẫu</th>
                  <th>Thư mục</th>
                  <th className="text-right">Giá</th>
                  <th>Trạng thái</th>
                  <th>File</th>
                  <th>Cập nhật</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5">
                      <Link to={`/admin/models/${r.id}`} className="group flex items-center gap-3">
                        <span className="block size-12 flex-none overflow-hidden rounded-lg border border-line bg-tone-1">
                          {r.cover && <img src={r.cover} alt="" loading="lazy" className="size-full object-cover" />}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium group-hover:underline group-hover:underline-offset-4">{r.title}</span>
                          <span className="font-mono text-[11px] text-muted">{r.sku ?? "—"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="text-muted">{r.category}</td>
                    <td className={`text-right font-mono text-[13px] ${r.priceVnd ? "" : "text-ok"}`}>{formatPrice(r.priceVnd)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>
                      <StatusBadge status={r.r2Status} />
                    </td>
                    <td className="text-[13px] whitespace-nowrap text-muted">{formatDate(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pagination page={page} pages={pages} href={pageHref} />
      </AdminBody>
    </>
  );
}
