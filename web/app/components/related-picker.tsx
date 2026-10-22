// Chọn "Mẫu tương tự" cho một mẫu: tìm & thêm, sắp xếp, bỏ; ghim từ danh sách gợi ý tự động.
import { useEffect, useState } from "react";
import { IconDown, IconSearch, IconUp, IconX } from "./icons";

export type RelatedItem = { id: string; title: string; sku: string | null; coverUrl: string | null };

export function RelatedPicker({
  name,
  modelId,
  initial,
  suggested,
  limit,
}: {
  name: string;
  modelId: string;
  initial: RelatedItem[];
  suggested: RelatedItem[];
  limit: number;
}) {
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<RelatedItem[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term) return setResults([]);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/models/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        if (res.ok) setResults(await res.json());
      } catch {
        // gõ tiếp -> request cũ bị huỷ
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const chosen = new Set(items.map((i) => i.id));
  const add = (it: RelatedItem) => setItems((xs) => (xs.some((x) => x.id === it.id) ? xs : [...xs, it]));
  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const copy = [...xs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name={name} value={JSON.stringify(items.map((i) => i.id))} />

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium">
          Chọn tay <span className="font-normal text-muted">({items.length}) · hiện trước, theo thứ tự này</span>
        </p>
        {items.length === 0 && <p className="text-[13px] text-muted">Chưa chọn mẫu nào.</p>}
        {items.map((it, i) => (
          <Row key={it.id} item={it} dim={i >= limit}>
            <IconButton label="Lên trước" onClick={() => move(i, -1)}>
              <IconUp />
            </IconButton>
            <IconButton label="Xuống sau" onClick={() => move(i, 1)}>
              <IconDown />
            </IconButton>
            <IconButton label="Bỏ" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}>
              <IconX size={12} />
            </IconButton>
          </Row>
        ))}
        {items.length > limit && <p className="text-xs text-muted">Trang mẫu chỉ hiện {limit} mẫu đầu.</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label className="field-label">
          Thêm mẫu
          <span className="relative">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              placeholder="Tìm theo tên hoặc mã mẫu"
              className="field pl-9"
            />
          </span>
        </label>
        {searching && <p className="text-xs text-muted">Đang tìm…</p>}
        {results
          .filter((r) => r.id !== modelId)
          .map((r) => (
            <Row key={r.id} item={r}>
              <button type="button" className="btn-outline btn-sm" disabled={chosen.has(r.id)} onClick={() => add(r)}>
                {chosen.has(r.id) ? "Đã chọn" : "Thêm"}
              </button>
            </Row>
          ))}
      </div>

      {suggested.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-medium">
            Gợi ý tự động <span className="font-normal text-muted">· theo độ giống nội dung, ghim để giữ cố định</span>
          </p>
          {suggested.map((s) => (
            <Row key={s.id} item={s}>
              <button type="button" className="btn-outline btn-sm" disabled={chosen.has(s.id)} onClick={() => add(s)}>
                {chosen.has(s.id) ? "Đã ghim" : "Ghim"}
              </button>
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ item, dim, children }: { item: RelatedItem; dim?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border border-line p-1.5 ${dim ? "opacity-50" : ""}`}>
      <div className="size-11 shrink-0 overflow-hidden rounded-md bg-tone-1">
        {item.coverUrl && <img src={item.coverUrl} alt="" className="size-full object-cover" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px]">{item.title}</span>
        {item.sku && <span className="font-mono text-[11px] text-muted">{item.sku}</span>}
      </div>
      <div className="flex shrink-0 gap-1">{children}</div>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="flex size-7 items-center justify-center rounded-md border border-line">
      {children}
    </button>
  );
}
