// Nhập mẫu từ máy nhà: bấm "Quét mẫu mới" -> home-agent liệt kê thư mục mẫu chưa có trên website
// -> chọn trên cây thư mục -> home-agent tạo ảnh preview, nhờ AI viết nội dung, đăng thành bản nháp.
// Website không gọi được vào máy nhà: chỉ ghi việc vào D1, home-agent hỏi định kỳ (workers/api/agent.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import { Form, Link, useNavigation, useRevalidator } from "react-router";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { Route } from "./+types/library";
import { requireAdmin } from "~/lib/auth.server";
import { getDb, schema } from "~/lib/db.server";
import type { LibraryCandidate } from "~/db/schema";
import { formatBytes, formatDate } from "~/lib/format";
import { AdminBody, AdminTop, EmptyState, FlashError, Section } from "~/components/admin-ui";
import { IconChevron, IconSearch, IconUpload } from "~/components/icons";

const { libraryScans, libraryImports } = schema;
const MAX_PER_SUBMIT = 500;
// home-agent hỏi việc mỗi 15 giây; chờ lâu hơn thế này thì có lẽ máy nhà đang tắt
const AGENT_SLOW_MS = 60_000;

type ImportStatus = "pending" | "running" | "done" | "failed";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const db = getDb();
  const [[scan], imports] = await Promise.all([
    db.select().from(libraryScans).orderBy(desc(libraryScans.createdAt)).limit(1),
    db.select().from(libraryImports).orderBy(desc(libraryImports.createdAt)).limit(300),
  ]);
  // lần nhập gần nhất của mỗi thư mục
  const byRel: Record<string, { status: ImportStatus; modelId: string | null; error: string | null }> = {};
  for (const i of imports) byRel[i.rel] ??= { status: i.status, modelId: i.modelId, error: i.error };
  return { scan: scan ?? null, imports: imports.slice(0, 50), byRel, now: Date.now() };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const db = getDb();
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "scan") {
    const [busy] = await db
      .select({ id: libraryScans.id })
      .from(libraryScans)
      .where(or(eq(libraryScans.status, "pending"), eq(libraryScans.status, "running")))
      .limit(1);
    if (!busy) await db.insert(libraryScans).values({});
    return { ok: "Đã gửi yêu cầu quét – máy nhà sẽ nhận trong ít giây." };
  }

  if (intent === "retry") {
    await db
      .update(libraryImports)
      .set({ status: "pending", error: null })
      .where(and(eq(libraryImports.id, String(form.get("id"))), eq(libraryImports.status, "failed")));
    return { ok: "Đã giao lại cho máy nhà." };
  }

  if (intent === "import") {
    const rels: string[] = [...new Set(form.getAll("rel").map(String))];
    if (!rels.length) return { error: "Chưa chọn mẫu nào." };
    if (rels.length > MAX_PER_SUBMIT) return { error: `Mỗi lần nhập tối đa ${MAX_PER_SUBMIT} mẫu.` };
    const [scan] = await db.select().from(libraryScans).orderBy(desc(libraryScans.createdAt)).limit(1);
    const byRel = new Map((scan?.candidates ?? []).map((c) => [c.rel, c]));
    // bỏ thư mục đang chép dở hoặc đã được giao (D1 giới hạn 100 tham số mỗi câu lệnh)
    const busy = new Set<string>();
    for (let i = 0; i < rels.length; i += 90) {
      const rows = await db
        .select({ rel: libraryImports.rel })
        .from(libraryImports)
        .where(
          and(
            inArray(libraryImports.rel, rels.slice(i, i + 90)),
            inArray(libraryImports.status, ["pending", "running", "done"]),
          ),
        );
      for (const r of rows) busy.add(r.rel);
    }
    const todo = rels
      .map((rel) => byRel.get(rel))
      .filter((c): c is LibraryCandidate => !!c && !c.copying && !busy.has(c.rel))
      .map((c) => ({ rel: c.rel, sku: c.sku, title: c.title }));
    if (!todo.length) return { error: "Các mẫu đã chọn đều đang nhập, đã nhập hoặc đang chép dở." };
    for (let i = 0; i < todo.length; i += 20) await db.insert(libraryImports).values(todo.slice(i, i + 20));
    const skipped = rels.length - todo.length;
    return { ok: `Đã giao ${todo.length} mẫu cho máy nhà${skipped ? ` (bỏ qua ${skipped} mẫu đã giao hoặc đang chép)` : ""}.` };
  }
  return { error: "Thao tác không hợp lệ" };
}

/* ------------------------------------------------------------------ */
/* Cây thư mục                                                         */
/* ------------------------------------------------------------------ */

type Folder = { key: string; name: string; folders: Folder[]; items: LibraryCandidate[]; rels: string[] };

function buildTree(list: LibraryCandidate[]): Folder {
  const root: Folder = { key: "", name: "", folders: [], items: [], rels: [] };
  for (const c of list) {
    let node = root;
    for (const name of c.categoryPath) {
      const key = `${node.key}/${name}`;
      let next = node.folders.find((f) => f.key === key);
      if (!next) node.folders.push((next = { key, name, folders: [], items: [], rels: [] }));
      node = next;
    }
    node.items.push(c);
  }
  // danh sách mẫu trong cả nhánh, để tích chọn cả thư mục
  const fill = (f: Folder): string[] => (f.rels = [...f.items.map((c) => c.rel), ...f.folders.flatMap(fill)]);
  fill(root);
  return root;
}

function TriCheckbox({ checked, mixed, disabled, onChange, label }: { checked: boolean; mixed: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className="size-4 flex-none accent-ink disabled:opacity-40"
    />
  );
}

const IMPORT_LABEL: Record<ImportStatus, string> = {
  pending: "Chờ máy nhà",
  running: "Đang nhập",
  done: "Đã nhập",
  failed: "Lỗi",
};
const IMPORT_STYLE: Record<ImportStatus, string> = {
  pending: "bg-ground text-ink-2",
  running: "bg-warn-bg text-warn",
  done: "bg-ok-bg text-ok",
  failed: "bg-[#FCE8E8] text-danger",
};

function ImportBadge({ status }: { status: ImportStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${IMPORT_STYLE[status]}`}>
      <span className={`size-1.5 rounded-full bg-current ${status === "running" ? "animate-pulse" : "opacity-70"}`} aria-hidden />
      {IMPORT_LABEL[status]}
    </span>
  );
}

function Flag({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tone === "warn" ? "bg-warn-bg text-warn" : "bg-ground text-muted"}`}>
      {children}
    </span>
  );
}

type TreeCtx = {
  selected: Set<string>;
  canPick: Set<string>;
  byRel: Record<string, { status: ImportStatus; modelId: string | null; error: string | null }>;
  open: (key: string) => boolean;
  toggle: (rels: string[], on: boolean) => void;
  toggleOpen: (key: string) => void;
};

function FolderView({ f, depth, t }: { f: Folder; depth: number; t: TreeCtx }) {
  const { selected, canPick, toggle, toggleOpen } = t;
  const pick = f.rels.filter((r) => canPick.has(r));
  const n = pick.filter((r) => selected.has(r)).length;
  const open = t.open(f.key);
  return (
    <li>
      <div className="flex items-center gap-2.5 border-b border-[#F0EEE9] py-2 pr-3" style={{ paddingLeft: 12 + depth * 22 }}>
        <button
          type="button"
          onClick={() => toggleOpen(f.key)}
          aria-expanded={open}
          aria-label={open ? `Thu gọn ${f.name}` : `Mở ${f.name}`}
          className="flex size-5 flex-none items-center justify-center rounded text-muted hover:bg-ground hover:text-ink"
        >
          <IconChevron size={11} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <TriCheckbox
          label={`Chọn cả thư mục ${f.name}`}
          checked={pick.length > 0 && n === pick.length}
          mixed={n > 0 && n < pick.length}
          disabled={!pick.length}
          onChange={() => toggle(pick, n < pick.length)}
        />
        <button type="button" onClick={() => toggleOpen(f.key)} className="min-w-0 truncate text-left text-sm font-medium">
          {f.name}
        </button>
        <span className="font-mono text-[11px] text-faint">{f.rels.length}</span>
      </div>
      {open && (
        <ul>
          {f.folders.map((c) => (
            <FolderView key={c.key} f={c} depth={depth + 1} t={t} />
          ))}
          {f.items.map((c) => (
            <ItemView key={c.rel} c={c} depth={depth + 1} t={t} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ItemView({ c, depth, t }: { c: LibraryCandidate; depth: number; t: TreeCtx }) {
  const { selected, canPick, toggle } = t;
  const imp = t.byRel[c.rel];
  const can = canPick.has(c.rel);
  return (
    <li>
      <label
        className={`flex items-start gap-2.5 border-b border-[#F0EEE9] py-2.5 pr-3 ${can ? "cursor-pointer hover:bg-paper" : ""}`}
        style={{ paddingLeft: 12 + depth * 22 + 30 }}
      >
        <input
          type="checkbox"
          checked={selected.has(c.rel)}
          disabled={!can}
          onChange={(e) => toggle([c.rel], e.target.checked)}
          className="mt-0.5 size-4 flex-none accent-ink disabled:opacity-40"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-sm">{c.title}</span>
            <span className="font-mono text-[11px] text-muted">{c.sku}</span>
            {c.copying && <Flag tone="warn">Đang chép dở</Flag>}
            {!c.images && <Flag tone="warn">Không có ảnh</Flag>}
            {imp && <ImportBadge status={imp.status} />}
            {imp?.status === "done" && imp.modelId && (
              <Link to={`/admin/models/${imp.modelId}`} className="text-[12px] underline underline-offset-4">
                Sửa bản nháp
              </Link>
            )}
          </span>
          <span className="text-[12px] text-muted">
            {c.images} ảnh · {formatBytes(c.bytes)} · {c.formats.join(" ")}
          </span>
          {imp?.status === "failed" && imp.error && <span className="text-[12px] text-danger">{imp.error}</span>}
        </span>
      </label>
    </li>
  );
}


/* ------------------------------------------------------------------ */

export default function AdminLibrary({ loaderData, actionData }: Route.ComponentProps) {
  const { scan, imports, byRel, now } = loaderData;
  const nav = useNavigation();
  const revalidator = useRevalidator();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const scanning = scan?.status === "pending" || scan?.status === "running";
  const importing = imports.some((i) => i.status === "pending" || i.status === "running");
  // còn việc dở thì hỏi lại định kỳ để cập nhật tiến độ
  useEffect(() => {
    if (!scanning && !importing) return;
    const t = setInterval(() => revalidator.state === "idle" && revalidator.revalidate(), 3000);
    return () => clearInterval(t);
  }, [scanning, importing, revalidator]);

  const candidates = scan?.status === "done" ? (scan.candidates ?? []) : [];
  const selectable = (c: LibraryCandidate) => !c.copying && !["pending", "running", "done"].includes(byRel[c.rel]?.status ?? "");
  const canPick = useMemo(() => new Set(candidates.filter(selectable).map((c) => c.rel)), [candidates, byRel]);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? candidates.filter((c) => `${c.title} ${c.sku} ${c.rel}`.toLowerCase().includes(k)) : candidates;
  }, [candidates, q]);
  const tree = useMemo(() => buildTree(shown), [shown]);
  // bỏ chọn những mẫu vừa được giao / không còn chọn được
  const picked = [...selected].filter((r) => canPick.has(r));

  const toggle = (rels: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rels) if (canPick.has(r)) on ? next.add(r) : next.delete(r);
      return next;
    });
  const toggleOpen = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const submitting = nav.state !== "idle" && nav.formData?.get("intent") === "import";
  useEffect(() => {
    if (actionData && "ok" in actionData) setSelected(new Set());
  }, [actionData]);

  const waitedMs = scan ? now - new Date(scan.createdAt).getTime() : 0;

  const t: TreeCtx = { selected, canPick, byRel, open: (key) => !closed.has(key) || !!q, toggle, toggleOpen };

  return (
    <>
      <AdminTop
        crumbs={[{ to: "/admin/models", label: "Mẫu 3D" }]}
        title="Nhập mẫu mới"
        subtitle="Chép thư mục mẫu vào đúng danh mục trong thư viện ở máy nhà, rồi quét và chọn mẫu cần đăng."
      >
        <Form method="post">
          <button name="intent" value="scan" disabled={scanning} className="btn-primary btn-sm">
            <IconSearch size={15} /> {scanning ? "Đang quét…" : "Quét mẫu mới"}
          </button>
        </Form>
      </AdminTop>
      <AdminBody>
        <FlashError error={actionData && "error" in actionData ? actionData.error : null} />
        {actionData && "ok" in actionData && (
          <p role="status" className="rounded-lg border border-[#CFE3D9] bg-ok-bg px-4 py-3 text-sm text-ok">
            {actionData.ok}
          </p>
        )}

        <Section
          title="Mẫu chưa có trên website"
          aside={
            scan?.status === "done"
              ? `Quét lúc ${formatDate(scan.finishedAt)} ${new Date(scan.finishedAt ?? 0).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
              : undefined
          }
        >
          {!scan ? (
            <EmptyState title="Chưa quét lần nào" hint="Bấm “Quét mẫu mới” để máy nhà liệt kê các thư mục mẫu chưa đăng." />
          ) : scan.status === "pending" ? (
            <EmptyState
              title="Đang chờ máy nhà nhận việc…"
              hint={
                waitedMs > AGENT_SLOW_MS
                  ? "Đã hơn một phút mà máy nhà chưa phản hồi – kiểm tra home-agent (pnpm worker) có đang chạy không."
                  : "home-agent hỏi việc mỗi 15 giây."
              }
            />
          ) : scan.status === "running" ? (
            <EmptyState title="Máy nhà đang quét thư viện…" hint="Thư viện lớn có thể mất vài phút." />
          ) : scan.status === "failed" ? (
            <FlashError error={`Quét lỗi: ${scan.error ?? "không rõ"}`} />
          ) : !candidates.length ? (
            <EmptyState title="Không có mẫu mới" hint="Mọi thư mục mẫu trong thư viện đều đã có trên website." />
          ) : (
            <Form method="post" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative flex-[1_1_240px]">
                  <span className="sr-only">Lọc theo tên, mã hoặc thư mục</span>
                  <IconSearch size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lọc theo tên, mã hoặc thư mục" className="field pl-10!" />
                </label>
                <button type="button" onClick={() => toggle(shown.map((c) => c.rel), true)} className="btn-outline btn-sm">
                  Chọn tất cả{q ? " (đang lọc)" : ""}
                </button>
                <button type="button" onClick={() => setSelected(new Set())} disabled={!picked.length} className="btn-outline btn-sm">
                  Bỏ chọn
                </button>
                <button
                  type="button"
                  onClick={() => setClosed(closed.size ? new Set() : new Set(collectKeys(tree)))}
                  className="px-1 text-[13px] text-muted underline underline-offset-4 hover:text-ink"
                >
                  {closed.size ? "Mở hết" : "Thu gọn hết"}
                </button>
              </div>

              {scan.totalFound != null && scan.totalFound > candidates.length && (
                <p className="text-[13px] text-warn">
                  Tìm thấy {scan.totalFound} mẫu, chỉ hiện {candidates.length} mẫu đầu. Nhập bớt rồi quét lại để thấy phần còn lại.
                </p>
              )}

              <ul className="-mx-5 border-t border-[#F0EEE9]">
                {tree.folders.map((f) => (
                  <FolderView key={f.key} f={f} depth={0} t={t} />
                ))}
              </ul>
              {!shown.length && <p className="text-sm text-muted">Không có mẫu khớp “{q}”.</p>}

              {picked.map((rel) => (
                <input key={rel} type="hidden" name="rel" value={rel} />
              ))}
              <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-line bg-white/95 px-5 py-3 backdrop-blur">
                <span className="text-[13px] text-muted">
                  Đã chọn <span className="font-medium text-ink">{picked.length}</span> / {canPick.size} mẫu có thể nhập · mẫu nhập vào ở dạng
                  bản nháp, AI viết sẵn nội dung
                </span>
                <button name="intent" value="import" disabled={!picked.length || submitting} className="btn-primary btn-sm">
                  <IconUpload size={15} /> {submitting ? "Đang giao…" : `Nhập ${picked.length || ""} mẫu`}
                </button>
              </div>
            </Form>
          )}
        </Section>

        {imports.length > 0 && (
          <Section title="Lượt nhập gần đây" aside={importing ? "Đang cập nhật tự động" : undefined}>
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="admin-table min-w-[640px]">
                <thead>
                  <tr>
                    <th>Mẫu</th>
                    <th>Trạng thái</th>
                    <th>Lúc giao</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {imports.map((i) => (
                    <tr key={i.id}>
                      <td className="py-2.5">
                        <span className="flex flex-col">
                          <span className="font-medium">{i.title}</span>
                          <span className="font-mono text-[11px] text-muted">
                            {i.sku} · {i.rel}
                          </span>
                          {i.status === "failed" && i.error && <span className="text-[12px] text-danger">{i.error}</span>}
                        </span>
                      </td>
                      <td>
                        <ImportBadge status={i.status} />
                      </td>
                      <td className="text-[13px] whitespace-nowrap text-muted">{formatDate(i.createdAt)}</td>
                      <td className="text-right">
                        {i.status === "done" && i.modelId ? (
                          <Link to={`/admin/models/${i.modelId}`} className="btn-outline btn-sm whitespace-nowrap">
                            Sửa & xuất bản
                          </Link>
                        ) : i.status === "failed" ? (
                          <Form method="post">
                            <input type="hidden" name="id" value={i.id} />
                            <button name="intent" value="retry" className="btn-outline btn-sm">
                              Thử lại
                            </button>
                          </Form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </AdminBody>
    </>
  );
}

const collectKeys = (f: Folder): string[] => f.folders.flatMap((c) => [c.key, ...collectKeys(c)]);
