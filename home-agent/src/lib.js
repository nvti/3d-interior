import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { ZipArchive } from "archiver";
import { config } from "./config.js";

/* ------------------------------ tiện ích ------------------------------ */

export function slugify(s) {
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

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

/* ------------------------------ trạng thái ------------------------------ */
// state.json: map fileKey -> { rel, sku, signature, modelId } để tool biết thư mục nào ứng với file nào

export async function loadState() {
  const file = path.join(config.workDir(), "state.json");
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    return { models: {} };
  }
}

export async function saveState(state) {
  await fsp.mkdir(config.workDir(), { recursive: true });
  const file = path.join(config.workDir(), "state.json");
  await fsp.writeFile(file + ".tmp", JSON.stringify(state, null, 2));
  await fsp.rename(file + ".tmp", file);
}

/* ------------------------------ R2 (S3 API) ------------------------------ */

let _s3;
export function s3() {
  const c = config.r2();
  return (_s3 ??= new S3Client({
    region: "auto",
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  }));
}

export async function putObject(bucket, key, body, contentType, cacheControl) {
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

export async function headSize(bucket, key) {
  const r = await s3().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return r.ContentLength ?? 0;
}

/* ------------------------------ API website ------------------------------ */

export async function api(pathname, body, method = "POST") {
  const res = await fetch(`${config.siteUrl()}${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${config.agentToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${pathname} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

/* ------------------------------ nén thư mục ------------------------------ */

/** Nén cả thư mục mẫu thành một file zip tạm; trả về đường dẫn, dung lượng, sha256 */
export async function zipFolder(dir, outFile) {
  await fsp.mkdir(path.dirname(outFile), { recursive: true });
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outFile);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("warning", (e) => (e.code === "ENOENT" ? log("cảnh báo:", e.message) : reject(e)));
    archive.on("error", reject);
    archive.on("data", (chunk) => hash.update(chunk));
    out.on("close", resolve);
    out.on("error", reject);
    archive.pipe(out);
    archive.glob("**/*", { cwd: dir, dot: false, ignore: ["**/Thumbs.db", "**/.DS_Store", "**/desktop.ini"] });
    archive.finalize();
  });
  const { size } = await fsp.stat(outFile);
  return { file: outFile, size, sha256: hash.digest("hex") };
}

/* ------------------------------ quét thư mục ------------------------------ */

export async function walk(dir, onDir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (e) {
    log("bỏ qua (không đọc được):", dir, e.code);
    return;
  }
  const stop = await onDir(dir, entries);
  if (stop) return; // thư mục mẫu: không đi sâu hơn
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith(".")) await walk(path.join(dir, e.name), onDir);
  }
}

/** Chữ ký nhanh của một thư mục (tổng dung lượng + thời gian sửa mới nhất) – không cần đọc nội dung */
export async function folderSignature(dir) {
  let bytes = 0;
  let latest = 0;
  let files = 0;
  async function rec(d) {
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await rec(p);
      else if (e.isFile()) {
        const st = await fsp.stat(p);
        bytes += st.size;
        files += 1;
        latest = Math.max(latest, st.mtimeMs);
      }
    }
  }
  await rec(dir);
  const signature = crypto.createHash("sha256").update(`${files}:${bytes}:${Math.floor(latest)}`).digest("hex");
  return { bytes, files, signature };
}
