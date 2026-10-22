import { drizzle } from "drizzle-orm/d1";
import { env } from "cloudflare:workers";
import * as schema from "~/db/schema";

let _db: ReturnType<typeof create> | undefined;

function create() {
  return drizzle(env.DB, { schema });
}

/** Một instance Drizzle dùng chung (binding D1 an toàn để tái sử dụng giữa các request) */
export function getDb() {
  return (_db ??= create());
}

export type DB = ReturnType<typeof getDb>;
export { schema };
