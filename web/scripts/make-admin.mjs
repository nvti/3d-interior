// Gán quyền admin cho một tài khoản đã đăng ký (database local).
// Dùng: pnpm db:admin:local ban@email.com
import { execFileSync } from "node:child_process";

const email = process.argv[2];
if (!email || !/^[^\s@']+@[^\s@']+$/.test(email)) {
  console.error("Dùng: pnpm db:admin:local <email đã đăng ký>");
  process.exit(1);
}
const out = execFileSync(
  "wrangler",
  [
    "d1", "execute", "tv3d", "--local", "--json", "--command",
    `UPDATE user SET role='admin' WHERE email='${email}'; SELECT count(*) AS n FROM user WHERE email='${email}'`,
  ],
  { encoding: "utf8" },
);
const found = JSON.parse(out).at(-1)?.results?.[0]?.n ?? 0;
console.log(found ?`✓ ${email} đã là admin` : `Không tìm thấy tài khoản ${email} – đăng ký ở /register trước`);
