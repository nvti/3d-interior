import { AwsClient } from "aws4fetch";
import { env } from "cloudflare:workers";
import type { MediaVariants } from "~/db/schema";

let _aws: AwsClient | undefined;
function aws() {
  return (_aws ??= new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  }));
}

/** Link tải có chữ ký, hạn ngắn, trỏ thẳng vào bucket private (khách tải trực tiếp từ R2). */
export async function presignModelDownload(key: string, downloadName: string): Promise<string> {
  if (import.meta.env.DEV) {
    // chạy local: tải từ bucket giả lập qua Worker (workers/api/dev.ts)
    return `${env.PUBLIC_SITE_URL}/dev-files/${key.split("/").map(encodeURIComponent).join("/")}?name=${encodeURIComponent(downloadName)}`;
  }
  const ttl = Number(env.PRESIGN_TTL_SECONDS) || 900;
  const url = new URL(
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.MODELS_BUCKET_NAME}/${key
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  );
  url.searchParams.set("X-Amz-Expires", String(ttl));
  url.searchParams.set(
    "response-content-disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
  );
  const signed = await aws().sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } });
  return signed.url;
}

export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `${env.MEDIA_PUBLIC_URL}/${key}`;
}

/** Chọn biến thể ảnh gần nhất với kích thước cần dùng */
export function mediaVariantUrl(
  m: { r2Key: string; variants: MediaVariants | null } | null | undefined,
  width: 400 | 1200 | 2000,
): string | null {
  if (!m) return null;
  const v = m.variants ?? {};
  const sizes = Object.keys(v)
    .map(Number)
    .sort((a, b) => a - b);
  const pick = sizes.find((s) => s >= width) ?? sizes.at(-1);
  return mediaUrl(pick ? v[String(pick)] : m.r2Key);
}
