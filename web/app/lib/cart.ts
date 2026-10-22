// Giỏ hàng lưu ở trình duyệt (localStorage). Giá thật luôn được tính lại ở server khi tạo đơn.
import { useSyncExternalStore } from "react";

export type CartItem = { id: string; slug: string; title: string; priceVnd: number; coverUrl: string | null };

const KEY = "tv3d-cart";
const listeners = new Set<() => void>();
let cache: CartItem[] | null = null;
const EMPTY: CartItem[] = [];

function read(): CartItem[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]") as CartItem[];
  } catch {
    cache = [];
  }
  return cache;
}

function write(items: CartItem[]) {
  cache = items;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* bỏ qua khi trình duyệt chặn storage */
  }
  listeners.forEach((l) => l());
}

export const cart = {
  add(item: CartItem) {
    const items = read();
    if (!items.some((i) => i.id === item.id)) write([...items, item]);
  },
  remove(id: string) {
    write(read().filter((i) => i.id !== id));
  },
  removeMany(ids: string[]) {
    const s = new Set(ids);
    write(read().filter((i) => !s.has(i.id)));
  },
  clear() {
    write([]);
  },
};

export function useCart(): CartItem[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
          cache = null;
          cb();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => EMPTY,
  );
}
