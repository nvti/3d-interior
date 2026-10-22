// Quản lý ảnh preview của mẫu: upload nhiều ảnh, sắp xếp, chọn ảnh bìa (ảnh đầu tiên), xoá.
import { useRef, useState } from "react";
import { uploadImage } from "~/lib/image-upload.client";
import { IconUp, IconDown, IconX, IconUpload } from "./icons";

export type ImageItem = { id: string; url: string | null; caption: string | null };

export function ImageManager({ name, initial, alt }: { name: string; initial: ImageItem[]; alt: string }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const copy = [...xs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const f of Array.from(files)) {
      setBusy((b) => b + 1);
      try {
        const m = await uploadImage(f, alt);
        setItems((xs) => [...xs, { id: m.id, url: m.thumbUrl, caption: null }]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy((b) => b - 1);
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={JSON.stringify(items.map((i) => ({ id: i.id, caption: i.caption })))} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {items.map((img, i) => (
          <div key={img.id} className="flex flex-col gap-1.5">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-tone-1">
              {img.url && <img src={img.url} alt="" className="size-full object-cover" />}
              {i === 0 && <span className="absolute top-2 left-2 rounded bg-ink px-1.5 py-0.5 text-[11px] font-medium text-white">Ảnh bìa</span>}
              <div className="absolute top-1.5 right-1.5 flex gap-1">
                <button type="button" aria-label="Lên trước" onClick={() => move(i, -1)} className="flex size-7 items-center justify-center rounded-md bg-white/90">
                  <IconUp />
                </button>
                <button type="button" aria-label="Xuống sau" onClick={() => move(i, 1)} className="flex size-7 items-center justify-center rounded-md bg-white/90">
                  <IconDown />
                </button>
                <button
                  type="button"
                  aria-label="Bỏ ảnh"
                  onClick={() => setItems((xs) => xs.filter((x) => x.id !== img.id))}
                  className="flex size-7 items-center justify-center rounded-md bg-white/90"
                >
                  <IconX size={12} />
                </button>
              </div>
            </div>
            <label className="sr-only" htmlFor={`cap-${img.id}`}>
              Chú thích ảnh {i + 1}
            </label>
            <input
              id={`cap-${img.id}`}
              placeholder="Chú thích (tuỳ chọn)"
              value={img.caption ?? ""}
              onChange={(e) => setItems((xs) => xs.map((x) => (x.id === img.id ? { ...x, caption: e.target.value || null } : x)))}
              className="h-8 rounded-md border border-line px-2 text-xs"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFiles(e.dataTransfer.files);
          }}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-line-strong bg-paper text-xs text-muted"
        >
          <IconUpload />
          {busy ? `Đang tải ${busy} ảnh…` : "Thả ảnh hoặc bấm để chọn"}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}
