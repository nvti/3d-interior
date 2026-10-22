import { Form, Link, useActionData, useSearchParams } from "react-router";
import { like, eq, and } from "drizzle-orm";
import { env } from "cloudflare:workers";
import type { Route } from "./+types/categories";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import {
  categoryCounts,
  createCategory,
  deleteCategory,
  flattenTree,
  getCategoryTree,
  moveCategory,
  updateCategory,
  type CategoryNode,
} from "~/lib/categories.server";
import { AdminTop, FlashError } from "~/components/admin-ui";
import { IconDown, IconUp } from "~/components/icons";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const kind = new URL(request.url).searchParams.get("kind") === "post" ? "post" : "model";
  const tree = await getCategoryTree(kind);
  const counts = kind === "model" ? await categoryCounts() : {};
  return { kind, tree, flat: flattenTree(tree).map((c) => ({ id: c.id, label: `${"— ".repeat(c.depth)}${c.name}`, path: c.path })), counts };
}

/** Sau khi đổi path, tài liệu tìm kiếm của các mẫu trong nhánh cần cập nhật */
async function reindexBranch(path: string) {
  const rows = await getDb()
    .select({ id: schema.models.id })
    .from(schema.models)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.models.categoryId))
    .where(and(eq(schema.categories.kind, "model"), like(schema.categories.path, `${path}%`)));
  for (let i = 0; i < rows.length; i += 100) {
    await env.SEARCH_QUEUE.sendBatch(rows.slice(i, i + 100).map((r) => ({ body: { modelId: r.id } })));
  }
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const kind = form.get("kind") === "post" ? "post" : "model";
  const id = String(form.get("id") ?? "");
  try {
    if (intent === "create") {
      const name = String(form.get("name") ?? "").trim();
      if (!name) return { error: "Cần nhập tên thư mục" };
      await createCategory(kind, name, String(form.get("parentId") || "") || null);
    } else if (intent === "update") {
      const name = String(form.get("name") ?? "").trim();
      const parentRaw = String(form.get("parentId") ?? "");
      const r = await updateCategory(id, { name: name || undefined, parentId: parentRaw === "" ? null : parentRaw });
      if (kind === "model" && r.oldPath !== r.newPath) await reindexBranch(r.newPath);
    } else if (intent === "up" || intent === "down") {
      await moveCategory(id, intent);
    } else if (intent === "delete") {
      await deleteCategory(id);
    }
    return { ok: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export default function AdminCategories({ loaderData }: Route.ComponentProps) {
  const { kind, tree, flat, counts } = loaderData;
  const res = useActionData<typeof action>();
  const [params] = useSearchParams();
  const editing = params.get("edit");

  return (
    <>
      <AdminTop title="Cây thư mục" />
      <div className="flex flex-col gap-5 p-7">
        <div role="tablist" className="flex gap-6 text-sm">
          {(
            [
              ["model", "Mẫu 3D"],
              ["post", "Chuyên mục blog"],
            ] as const
          ).map(([k, l]) => (
            <Link key={k} role="tab" aria-selected={kind === k} to={`?kind=${k}`} className={`h-10 ${kind === k ? "border-b-[1.5px] border-ink font-medium" : "text-muted"}`}>
              {l}
            </Link>
          ))}
        </div>
        <FlashError error={res && "error" in res ? res.error : null} />

        <Form method="post" className="card flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="kind" value={kind} />
          <label className="field-label flex-[2_1_220px]">
            Thư mục mới
            <input name="name" placeholder="Tên thư mục" className="field" />
          </label>
          <label className="field-label flex-[2_1_220px]">
            Nằm trong
            <select name="parentId" className="field">
              <option value="">(Gốc)</option>
              {flat.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary btn-sm h-11">Thêm</button>
        </Form>

        <div className="overflow-hidden rounded-xl border border-line bg-white">
          {tree.length === 0 && <p className="p-8 text-center text-sm text-muted">Chưa có thư mục nào.</p>}
          <ul>
            {tree.map((n) => (
              <TreeRow key={n.id} node={n} kind={kind} flat={flat} counts={counts} editing={editing} />
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function TreeRow({
  node,
  kind,
  flat,
  counts,
  editing,
}: {
  node: CategoryNode;
  kind: string;
  flat: { id: string; label: string; path: string }[];
  counts: Record<string, number>;
  editing: string | null;
}) {
  const isEditing = editing === node.id;
  return (
    <li>
      <div className="flex flex-wrap items-center gap-3 border-b border-[#ECEAE5] px-4 py-2.5" style={{ paddingLeft: 16 + node.depth * 28 }}>
        {isEditing ? (
          <Form method="post" className="flex flex-1 flex-wrap items-center gap-2">
            <input type="hidden" name="intent" value="update" />
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={node.id} />
            <label className="sr-only" htmlFor={`n-${node.id}`}>Tên</label>
            <input id={`n-${node.id}`} name="name" defaultValue={node.name} className="field h-9 w-56" />
            <label className="sr-only" htmlFor={`p-${node.id}`}>Thư mục cha</label>
            <select id={`p-${node.id}`} name="parentId" defaultValue={node.parentId ?? ""} className="field h-9 w-64">
              <option value="">(Gốc)</option>
              {flat
                .filter((c) => !c.path.startsWith(node.path))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </select>
            <button className="btn-primary btn-sm h-9">Lưu</button>
            <Link to={`?kind=${kind}`} className="text-[13px] text-muted">
              Huỷ
            </Link>
          </Form>
        ) : (
          <>
            <span className="flex-1 text-sm">
              <span className="font-medium">{node.name}</span>{" "}
              <span className="font-mono text-[11px] text-muted">{node.path}</span>
            </span>
            {kind === "model" && <span className="font-mono text-xs text-muted">{counts[node.path] ?? 0} mẫu</span>}
            <Form method="post" className="flex items-center gap-1">
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={node.id} />
              <button name="intent" value="up" aria-label={`Đưa ${node.name} lên`} className="flex size-8 items-center justify-center rounded-md hover:bg-ground">
                <IconUp />
              </button>
              <button name="intent" value="down" aria-label={`Đưa ${node.name} xuống`} className="flex size-8 items-center justify-center rounded-md hover:bg-ground">
                <IconDown />
              </button>
              <Link to={`?kind=${kind}&edit=${node.id}`} className="px-2 text-[13px] underline underline-offset-4">
                Sửa
              </Link>
              <button
                name="intent"
                value="delete"
                className="px-2 text-[13px] text-danger"
                onClick={(e) => {
                  if (!confirm(`Xoá thư mục “${node.name}”?`)) e.preventDefault();
                }}
              >
                Xoá
              </button>
            </Form>
          </>
        )}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <TreeRow key={c.id} node={c} kind={kind} flat={flat} counts={counts} editing={editing} />
          ))}
        </ul>
      )}
    </li>
  );
}
