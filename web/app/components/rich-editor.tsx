// Editor nội dung (Tiptap). Lưu JSON vào input ẩn; HTML được render an toàn ở server.
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { useRef, useState } from "react";
import { uploadImage } from "~/lib/image-upload.client";

export function RichEditor({ name, initial }: { name: string; initial: unknown }) {
  const [json, setJson] = useState(() => JSON.stringify(initial ?? { type: "doc", content: [{ type: "paragraph" }] }));
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false } }),
      Image,
    ],
    content: (initial as object) ?? "",
    editorProps: {
      attributes: { class: "prose-content min-h-[280px] px-7 py-6 outline-none" },
    },
    onUpdate: ({ editor }) => setJson(JSON.stringify(editor.getJSON())),
  });

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={json} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  if (!editor) return <div className="h-12 border-b border-line bg-paper" />;

  const btn = (active: boolean) =>
    `flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-[13px] ${active ? "bg-ink text-white" : "hover:bg-ground"}`;
  const c = () => editor.chain().focus();

  return (
    <div role="toolbar" aria-label="Định dạng nội dung" className="flex flex-wrap items-center gap-0.5 border-b border-line bg-paper px-3 py-1.5">
      <button type="button" aria-label="In đậm" className={`${btn(editor.isActive("bold"))} font-semibold`} onClick={() => c().toggleBold().run()}>
        B
      </button>
      <button type="button" aria-label="In nghiêng" className={`${btn(editor.isActive("italic"))} italic`} onClick={() => c().toggleItalic().run()}>
        I
      </button>
      <button type="button" aria-label="Gạch chân" className={`${btn(editor.isActive("underline"))} underline`} onClick={() => c().toggleUnderline().run()}>
        U
      </button>
      <span aria-hidden className="mx-1.5 h-5 w-px bg-line" />
      <button type="button" className={`${btn(editor.isActive("heading", { level: 2 }))} font-semibold`} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        H2
      </button>
      <button type="button" className={`${btn(editor.isActive("heading", { level: 3 }))} font-semibold`} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        H3
      </button>
      <span aria-hidden className="mx-1.5 h-5 w-px bg-line" />
      <button type="button" className={btn(editor.isActive("bulletList"))} onClick={() => c().toggleBulletList().run()}>
        • Danh sách
      </button>
      <button type="button" className={btn(editor.isActive("orderedList"))} onClick={() => c().toggleOrderedList().run()}>
        1. Đánh số
      </button>
      <button type="button" className={btn(editor.isActive("blockquote"))} onClick={() => c().toggleBlockquote().run()}>
        Trích dẫn
      </button>
      <button
        type="button"
        className={btn(editor.isActive("link"))}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("Đường dẫn (để trống để bỏ link)", prev ?? "https://");
          if (url === null) return;
          if (!url) c().extendMarkRange("link").unsetLink().run();
          else c().extendMarkRange("link").setLink({ href: url }).run();
        }}
      >
        Link
      </button>
      <button type="button" className={btn(false)} disabled={uploading} onClick={() => fileRef.current?.click()}>
        {uploading ? "Đang tải ảnh…" : "Ảnh"}
      </button>
      <button type="button" className={btn(false)} onClick={() => c().setHorizontalRule().run()}>
        —
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setUploading(true);
          try {
            const m = await uploadImage(f);
            c().setImage({ src: m.url, alt: "" }).run();
          } catch (err) {
            alert((err as Error).message);
          } finally {
            setUploading(false);
          }
        }}
      />
    </div>
  );
}
