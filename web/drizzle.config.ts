import { defineConfig } from "drizzle-kit";

// Chỉ dùng để SINH file migration SQL (pnpm db:generate).
// Áp migration lên D1 bằng wrangler: pnpm db:migrate:local / db:migrate:remote
export default defineConfig({
  dialect: "sqlite",
  schema: "./app/db/schema.ts",
  out: "./migrations",
});
