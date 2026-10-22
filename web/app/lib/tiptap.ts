// Render nội dung Tiptap JSON thành HTML AN TOÀN ở phía server.
// Không tin HTML do trình duyệt gửi lên: chỉ render các node/mark nằm trong whitelist,
// escape toàn bộ text, kiểm tra URL của link và ảnh.

export type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const v = href.trim();
  if (/^(https?:|mailto:)/i.test(v) || v.startsWith("/") || v.startsWith("#")) return v;
  return null;
}

function safeImgSrc(src: unknown, mediaBase: string): string | null {
  if (typeof src !== "string") return null;
  return src.startsWith(mediaBase + "/") ? src : null;
}

function renderMarks(text: string, marks: TiptapNode["marks"] = []): string {
  let out = esc(text);
  for (const m of marks) {
    switch (m.type) {
      case "bold":
        out = `<strong>${out}</strong>`;
        break;
      case "italic":
        out = `<em>${out}</em>`;
        break;
      case "underline":
        out = `<u>${out}</u>`;
        break;
      case "strike":
        out = `<s>${out}</s>`;
        break;
      case "code":
        out = `<code>${out}</code>`;
        break;
      case "link": {
        const href = safeHref(m.attrs?.href);
        if (href) {
          const ext = /^https?:/i.test(href);
          out = `<a href="${esc(href)}"${ext ? ' rel="noopener nofollow" target="_blank"' : ""}>${out}</a>`;
        }
        break;
      }
    }
  }
  return out;
}

export function renderTiptapHtml(node: TiptapNode | null | undefined, mediaBase: string): string {
  if (!node) return "";
  const kids = () => (node.content ?? []).map((c) => renderTiptapHtml(c, mediaBase)).join("");
  switch (node.type) {
    case "doc":
      return kids();
    case "paragraph":
      return `<p>${kids()}</p>`;
    case "heading": {
      const lvl = Math.min(4, Math.max(2, Number(node.attrs?.level ?? 2)));
      return `<h${lvl}>${kids()}</h${lvl}>`;
    }
    case "text":
      return renderMarks(node.text ?? "", node.marks);
    case "hardBreak":
      return "<br>";
    case "horizontalRule":
      return "<hr>";
    case "bulletList":
      return `<ul>${kids()}</ul>`;
    case "orderedList":
      return `<ol>${kids()}</ol>`;
    case "listItem":
      return `<li>${kids()}</li>`;
    case "blockquote":
      return `<blockquote>${kids()}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${kids()}</code></pre>`;
    case "image": {
      const src = safeImgSrc(node.attrs?.src, mediaBase);
      if (!src) return "";
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      return `<figure><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy"></figure>`;
    }
    default:
      return kids();
  }
}

export function extractTiptapText(node: TiptapNode | null | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  const parts = (node.content ?? []).map(extractTiptapText);
  const block = ["paragraph", "heading", "listItem", "blockquote", "codeBlock"].includes(node.type);
  return parts.join(block ? "" : "\n").trim() + (block ? "\n" : "");
}

export function isTiptapDoc(v: unknown): v is TiptapNode {
  return !!v && typeof v === "object" && (v as TiptapNode).type === "doc";
}
