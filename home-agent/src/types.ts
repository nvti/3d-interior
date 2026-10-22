// Kiểu dữ liệu dùng chung giữa tool máy nhà và API của website (workers/api/agent.ts)

export type RenderEngine = "vray" | "corona" | "other";

/** Ảnh preview đã upload lên bucket public */
export type PreviewImage = {
  key: string; // key bản lớn nhất
  variants: Record<string, string>; // { "400": key, "1200": key, "2000": key }
  width?: number;
  height?: number;
  sizeBytes?: number;
  mimeType: string;
};

/** Body của POST /api/agent/models */
export type ModelUpsert = {
  sku: string;
  title: string;
  categoryPath: string[];
  fileKey: string;
  fileSizeBytes: number;
  fileSha256: string; // chữ ký thư mục (64 ký tự hex)
  formats: string[];
  renderEngine?: RenderEngine;
  maxVersion?: string;
  images: PreviewImage[];
  publish: boolean;
};

export type ModelUpsertResult = { ok: true; modelId: string; created: boolean };

/** Job trong queue tv3d-upload (do website gửi, xem app/lib/downloads.server.ts) */
export type UploadJob = { modelId: string; fileKey: string; sha256: string | null; sizeBytes: number | null };

/** state.json: ánh xạ fileKey -> thư mục trên ổ cứng */
export type StateEntry = { rel: string; sku: string; signature: string; modelId: string };
export type AgentState = { models: Record<string, StateEntry> };

/** Message trả về từ Cloudflare Queues HTTP pull */
export type PulledMessage = {
  id: string;
  body: unknown;
  lease_id: string;
  attempts?: number;
  timestamp_ms?: number;
};
