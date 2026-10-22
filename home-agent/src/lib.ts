import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { Dirent } from "node:fs";
import type { Readable } from "node:stream";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { ZipArchive } from "archiver";
import { config } from "./config.js";
import type { AgentState } from "./types.js";

/* ------------------------------ tiện ích ------------------------------ */

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function log(...args: unknown[]): void {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ------------------------------ trạng thái ------------------------------ */
// state.json: map fileKey -> { rel, sku, signature, modelId } để tool biết thư mục nào ứng với file nào

const stateFile = () => path.join(config.workDir(), "state.json");

export async function loadState(): Promise<AgentState> {
  try {
    return JSON.parse(await fsp.readFile(stateFile(), "utf8")) as AgentState;
  } catch {
    return { models: {} };
  }
}

export async function saveState(state: AgentState): Promise<void> {
  await fsp.mkdir(config.workDir(), { recursive: true });
  const file = stateFile();
  await fsp.writeFile(file + ".tmp", JSON.stringify(state, null, 2));
  await fsp.rename(file + ".tmp", file);
}

/* ------------------------------ R2 (S3 API) ------------------------------ */

let _s3: S3Client | undefined;
export function s3(): S3Client {
  const c = config.r2();
  return (_s3 ??= new S3Client({
    region: "auto",
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  }));
}

export async function putObject(
  bucket: string,
  key: string,
  body: Buffer | Readable,
  contentType: string,
  cacheControl?: string,
): Promise<void> {
  if (config.localMode()) {
    const data = Buffer.isBuffer(body) ? body : Buffer.concat(await body.toArray());
    await api(devR2Path(bucket, key), data, "PUT", { "Content-Type": contentType, ...(cacheControl ? { "Cache-Control": cacheControl } : {}) });
    return;
  }
  const up = new Upload({
    client: s3(),
    params: { Bucket: bucket, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl },
    queueSize: 4,
    partSize: 16 * 1024 * 1024, // 16MB/phần, tự thử lại từng phần khi mạng chập chờn
    leavePartsOnError: false,
  });
  up.on("httpUploadProgress", (p) => {
    if (p.total && p.loaded && p.total > 200 * 1024 * 1024) {
      process.stdout.write(`\r  ↑ ${(p.loaded / 1e6).toFixed(0)}/${(p.total / 1e6).toFixed(0)} MB`);
    }
  });
  await up.done();
}

export async function headSize(bucket: string, key: string): Promise<number> {
  if (config.localMode()) {
    const res = await fetch(config.siteUrl() + devR2Path(bucket, key), {
      method: "HEAD",
      headers: { Authorization: `Bearer ${config.agentToken()}` },
    });
    if (!res.ok) throw new Error(`HEAD ${key} ${res.status}`);
    return Number(res.headers.get("Content-Length") ?? 0);
  }
  const r = await s3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return r.ContentLength ?? 0;
}

/** R2 giả lập của website local (web/workers/api/dev.ts) */
const devR2Path = (bucket: string, key: string) =>
  `/api/dev/r2/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

/* ------------------------------ API website ------------------------------ */

/** body là Buffer thì gửi nguyên dạng nhị phân, còn lại gửi JSON */
export async function api<T = unknown>(
  pathname: string,
  body?: unknown,
  method = "POST",
  headers: Record<string, string> = { "Content-Type": "application/json" },
): Promise<T> {
  const res = await fetch(`${config.siteUrl()}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${config.agentToken()}`, ...headers },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? new Uint8Array(body) : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${pathname} ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/* ------------------------------ nén thư mục ------------------------------ */

export type ZipResult = { file: string; size: number; sha256: string };

/** Nén cả thư mục mẫu thành một file zip tạm; trả về đường dẫn, dung lượng, sha256 */
export async function zipFolder(dir: string, outFile: string): Promise<ZipResult> {
  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(outFile);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("warning", (e: NodeJS.ErrnoException) => (e.code === "ENOENT" ? log("cảnh báo:", e.message) : reject(e)));
    archive.on("error", reject);
    archive.on("data", (chunk: Buffer) => hash.update(chunk));
    out.on("close", () => resolve());
    out.on("error", reject);
    archive.pipe(out);
    archive.glob("**/*", { cwd: dir, dot: false, ignore: ["**/Thumbs.db", "**/.DS_Store", "**/desktop.ini"] });
    void archive.finalize();
  });
  const { size } = await fsp.stat(outFile);
  return { file: outFile, size, sha256: hash.digest("hex") };
}

/* ------------------------------ quét thư mục ------------------------------ */

/** Duyệt cây thư mục; onDir trả về true để KHÔNG đi sâu hơn (thư mục mẫu) */
export async function walk(dir: string, onDir: (dir: string, entries: Dirent[]) => Promise<boolean>): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (e) {
    log("bỏ qua (không đọc được):", dir, (e as NodeJS.ErrnoException).code);
    return;
  }
  const stop = await onDir(dir, entries);
  if (stop) return;
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith(".")) await walk(path.join(dir, e.name), onDir);
  }
}

export type FolderSignature = { bytes: number; files: number; signature: string; changedMs: number };

/** Chữ ký nhanh của một thư mục (số file + tổng dung lượng + thời gian sửa mới nhất) – không cần đọc nội dung.
 *  changedMs: lần cuối có file được ghi/chép vào (ctime – Finder giữ nguyên mtime gốc khi chép) */
export async function folderSignature(dir: string): Promise<FolderSignature> {
  let bytes = 0;
  let latest = 0;
  let changedMs = 0;
  let files = 0;
  async function rec(d: string): Promise<void> {
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await rec(p);
      else if (e.isFile()) {
        const st = await fsp.stat(p);
        bytes += st.size;
        files += 1;
        latest = Math.max(latest, st.mtimeMs);
        changedMs = Math.max(changedMs, st.mtimeMs, st.ctimeMs);
      }
    }
  }
  await rec(dir);
  const signature = crypto.createHash("sha256").update(`${files}:${bytes}:${Math.floor(latest)}`).digest("hex");
  return { bytes, files, signature, changedMs };
}
