import { and, asc, eq, like, sql } from "drizzle-orm";
import { getDb, schema } from "./db.server";
import { slugify } from "./format";

const { categories, models } = schema;
type Kind = "model" | "post";

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  path: string;
  depth: number;
  sortOrder: number;
  parentId: string | null;
  children: CategoryNode[];
};

export async function getCategoryTree(kind: Kind): Promise<CategoryNode[]> {
  const rows = await getDb()
    .select()
    .from(categories)
    .where(eq(categories.kind, kind))
    .orderBy(asc(categories.depth), asc(categories.sortOrder), asc(categories.name));
  const byId = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];
  for (const r of rows) byId.set(r.id, { ...r, children: [] });
  for (const n of byId.values()) {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  const sort = (list: CategoryNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "vi"));
    list.forEach((c) => sort(c.children));
  };
  sort(roots);
  return roots;
}

export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

export async function categoryCounts(): Promise<Record<string, number>> {
  // đếm mẫu đã xuất bản theo từng nhánh (theo path)
  const rows = await getDb().all<{ path: string; n: number }>(sql`
    SELECT c.path AS path,
      (SELECT COUNT(*) FROM models m JOIN categories c2 ON c2.id = m.category_id
        WHERE m.status = 'published' AND c2.path LIKE c.path || '%') AS n
    FROM categories c WHERE c.kind = 'model'`);
  return Object.fromEntries(rows.map((r) => [r.path, r.n]));
}

export async function createCategory(kind: Kind, name: string, parentId: string | null) {
  const db = getDb();
  let parentPath = "/";
  let depth = 0;
  if (parentId) {
    const [p] = await db.select().from(categories).where(eq(categories.id, parentId)).limit(1);
    if (!p) throw new Error("Không tìm thấy thư mục cha");
    parentPath = p.path;
    depth = p.depth + 1;
  }
  const slug = slugify(name) || "muc";
  const path = `${parentPath}${slug}/`;
  const [{ max } = { max: 0 }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${categories.sortOrder}), 0)` })
    .from(categories)
    .where(and(eq(categories.kind, kind), parentId ? eq(categories.parentId, parentId) : sql`${categories.parentId} IS NULL`));
  const [row] = await db
    .insert(categories)
    .values({ kind, name, slug, path, depth, parentId, sortOrder: (max ?? 0) + 1 })
    .returning();
  return row;
}

/** Đảm bảo có cả chuỗi thư mục theo danh sách tên (dùng khi import từ máy nhà) */
export async function ensureCategoryPath(kind: Kind, names: string[]) {
  const db = getDb();
  let parentId: string | null = null;
  let path = "/";
  let last: typeof categories.$inferSelect | undefined;
  for (const name of names) {
    path = `${path}${slugify(name) || "muc"}/`;
    const found: (typeof categories.$inferSelect)[] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.kind, kind), eq(categories.path, path)))
      .limit(1);
    last = found[0] ?? (await createCategory(kind, name, parentId));
    parentId = last.id;
  }
  if (!last) throw new Error("Đường dẫn thư mục rỗng");
  return last;
}

/** Đổi tên / chuyển thư mục cha: cập nhật path + depth cho cả nhánh trong một batch */
export async function updateCategory(id: string, input: { name?: string; parentId?: string | null }) {
  const db = getDb();
  const [node] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!node) throw new Error("Không tìm thấy thư mục");

  const name = input.name?.trim() || node.name;
  const parentId = input.parentId === undefined ? node.parentId : input.parentId;
  let parentPath = "/";
  let depth = 0;
  if (parentId) {
    const [p] = await db.select().from(categories).where(eq(categories.id, parentId)).limit(1);
    if (!p) throw new Error("Không tìm thấy thư mục cha");
    if (p.path.startsWith(node.path)) throw new Error("Không thể chuyển thư mục vào chính nhánh con của nó");
    parentPath = p.path;
    depth = p.depth + 1;
  }
  const slug = input.name ? slugify(name) || node.slug : node.slug;
  const newPath = `${parentPath}${slug}/`;
  const depthDelta = depth - node.depth;

  const descendants = await db
    .select({ id: categories.id, path: categories.path, depth: categories.depth })
    .from(categories)
    .where(and(eq(categories.kind, node.kind), like(categories.path, `${node.path}%`)));

  const stmts = descendants.map((d) =>
    db
      .update(categories)
      .set({
        path: newPath + d.path.slice(node.path.length),
        depth: d.depth + depthDelta,
        ...(d.id === id ? { name, slug, parentId } : {}),
      })
      .where(eq(categories.id, d.id)),
  );
  if (stmts.length) await db.batch(stmts as [ (typeof stmts)[number], ...typeof stmts ]);
  return { oldPath: node.path, newPath };
}

export async function moveCategory(id: string, dir: "up" | "down") {
  const db = getDb();
  const [node] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!node) return;
  const siblings = await db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.kind, node.kind),
        node.parentId ? eq(categories.parentId, node.parentId) : sql`${categories.parentId} IS NULL`,
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  const i = siblings.findIndex((s) => s.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= siblings.length) return;
  const reordered = [...siblings];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  const stmts = reordered.map((s, idx) =>
    db.update(categories).set({ sortOrder: idx + 1 }).where(eq(categories.id, s.id)),
  );
  await db.batch(stmts as [ (typeof stmts)[number], ...typeof stmts ]);
}

export async function deleteCategory(id: string) {
  const db = getDb();
  const [child] = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, id)).limit(1);
  if (child) throw new Error("Thư mục còn thư mục con");
  const [m] = await db.select({ id: models.id }).from(models).where(eq(models.categoryId, id)).limit(1);
  if (m) throw new Error("Thư mục còn mẫu – hãy chuyển mẫu sang thư mục khác trước");
  await db.delete(categories).where(eq(categories.id, id));
}
