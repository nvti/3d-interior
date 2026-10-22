// So sánh chuỗi chống timing attack (crypto.subtle.timingSafeEqual là API riêng của Workers)
const enc = new TextEncoder();
type WorkersSubtle = SubtleCrypto & { timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean };

export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.byteLength !== y.byteLength) return false;
  return (crypto.subtle as WorkersSubtle).timingSafeEqual(x, y);
}
