# Thư viện mẫu 3D

Website bán mẫu nội thất 3D theo từng mẫu: tìm kiếm (từ khoá + ngữ nghĩa, gõ không dấu), thanh toán VietQR, tải file qua link riêng, trang quản trị, blog.

📖 Mô tả chi tiết từng chức năng: [docs/chuc-nang.md](docs/chuc-nang.md)

```
web/          Website – Cloudflare Worker (React Router v8 + Hono + Drizzle + Better Auth + Tailwind)
home-agent/   Tool chạy trên máy nhà (Node.js + TypeScript) – quét thư viện, đăng mẫu, upload file lên R2
              khi có đơn, kèm docker compose cho Typesense + Cloudflare Tunnel
```

## Kiến trúc

```
Khách ──> Worker (trang web + API)
            ├─ D1            dữ liệu: mẫu, cây thư mục, đơn hàng, quyền tải, link tải
            ├─ R2 public     ảnh preview & ảnh bài viết (custom domain, cache vĩnh viễn)
            ├─ R2 private    file .zip – chỉ những mẫu đã có người mua
            ├─ Queues        tv3d-upload (máy nhà kéo job) · tv3d-search-sync (đồng bộ Typesense)
            ├─ Cron 2h sáng  dọn file R2 lâu không tải, đẩy lại job kẹt, hết hạn link
            └─ Tunnel+Access ──> Máy nhà: Typesense (embedding đa ngôn ngữ)
Máy nhà: kho 2TB + home-agent  (scan: đăng mẫu · worker: nén & upload khi có đơn)
```

**Luồng mua & tải**

1. Khách thanh toán bằng VietQR → SePay gọi webhook → đơn chuyển sang *đã thanh toán*, khách được cấp quyền tải.
2. Mỗi mẫu tạo một *yêu cầu tải* với token riêng.
   - File đã có trên R2: email gửi link ngay.
   - File chưa có: job vào queue `tv3d-upload` → home-agent nén thư mục, upload lên R2 → website gửi email có link.
3. Link `/d/<token>` kiểm tra quyền và hạn dùng, rồi chuyển hướng sang presigned URL của R2 (hạn 15 phút). Mỗi lần khách bấm *Tải xuống* trong *Mẫu đã mua* là một token mới.
4. Cron mỗi đêm xoá khỏi R2 những mẫu quá `R2_EVICT_DAYS` ngày không có lượt tải. Mẫu nào còn link chưa hết hạn thì được giữ lại.

**Tìm kiếm**: dùng Typesense ở chế độ hybrid (từ khoá + ngữ nghĩa, model `ts/multilingual-e5-small`). Khi máy nhà không phản hồi trong 2,5 giây, website tự chuyển sang D1 FTS5: vẫn tìm không dấu được, nhưng chỉ theo từ khoá.

---

## 1. Chạy thử trên máy

Cần Node.js ≥ 20 và pnpm (`corepack enable` hoặc `brew install pnpm`). Không cần tài khoản Cloudflare: D1, R2 và Queue được giả lập trên máy. Khi chạy `pnpm dev`, ảnh và file tải đi qua Worker (`/media`, `/dev-files`), còn home-agent dùng `R2_MODE=local` để upload và nhận job qua website local (xem `web/workers/api/dev.ts`). Các route này không có trong bản build production.

**Bước 1 – Website** (terminal 1):

```bash
cd web
pnpm install
cp .dev.vars.example .dev.vars        # đổi BETTER_AUTH_SECRET: openssl rand -base64 32
pnpm db:migrate:local
pnpm dev                              # http://localhost:5173 – để chạy suốt
```

**Bước 2 – Dữ liệu thử** (terminal 2):

```bash
cd home-agent
pnpm install
cp .env.local.example .env
pnpm sample                           # tạo ./sample-library: 8 mẫu kèm ảnh preview
pnpm scan --publish                   # đăng mẫu lên website local

cd ../web
pnpm db:seed:local                    # trang tĩnh ở footer, 1 bài tạp chí, giá cho các mẫu thử
```

Đăng ký tài khoản ở `/register`, rồi gán quyền admin:

```bash
pnpm db:admin:local ban@email.com
```

**Bước 3 – Thử luồng mua & tải**:

1. Mở một mẫu có giá, bấm *Mua mẫu này* → *Tạo đơn & lấy mã chuyển khoản*. Ghi lại mã đơn (`TV3D…`) và số tiền.
2. Giả lập SePay báo đã nhận tiền (hoặc bấm *Xác nhận đã nhận tiền* trong `/admin/orders`):

   ```bash
   curl -X POST http://localhost:5173/api/webhooks/sepay -H 'Authorization: Apikey dev-sepay-key' -H 'Content-Type: application/json' -d '{"id":1,"transferType":"in","transferAmount":149000,"content":"TV3DXXXXXX"}'
   ```

3. Chạy tool đẩy file (terminal 3). Nó nén thư mục mẫu và upload lên R2 giả lập:

   ```bash
   cd home-agent && pnpm worker
   ```

4. Email (in ra console của `pnpm dev`, vì chưa có `RESEND_API_KEY`) chứa link `/d/…`. Bấm *Tải xuống* trong `/purchases` cũng được.

**Tuỳ chọn – Tìm kiếm Typesense** (cần Docker). Không bật thì website dùng tìm kiếm D1:

```bash
cd home-agent
docker compose up -d typesense
pnpm typesense:setup                  # lần đầu tải model embedding, mất vài phút
```

Rồi đặt `TYPESENSE_API_KEY="local-typesense-key"` trong `web/.dev.vars`. Website tự khởi động lại. Sau đó chạy lại `pnpm typesense:setup` để đồng bộ mẫu, vì queue local nằm trong bộ nhớ và mất job khi server khởi động lại.

Xoá toàn bộ dữ liệu local để làm lại từ đầu: `rm -rf web/.wrangler home-agent/.agent`.

## 2. Triển khai lên Cloudflare

Tất cả lệnh chạy trong thư mục `web/`, sau khi đăng nhập bằng `pnpm wrangler login`.

```bash
# Database
pnpm wrangler d1 create tv3d                  # chép database_id vào wrangler.jsonc

# Storage
pnpm wrangler r2 bucket create tv3d-media     # public – gắn custom domain trong dashboard (vd. img.tenmien.com)
pnpm wrangler r2 bucket create tv3d-models    # private – KHÔNG bật public access

# Queues
pnpm wrangler queues create tv3d-upload
pnpm wrangler queues create tv3d-search-sync
pnpm wrangler queues consumer http add tv3d-upload --visibility-timeout-secs 1800 --message-retries 10
```

Trong `wrangler.jsonc`, sửa các giá trị `vars`: `PUBLIC_SITE_URL`, `SITE_NAME`, `MEDIA_PUBLIC_URL` (domain của bucket public), `R2_ACCOUNT_ID`, thông tin ngân hàng (`BANK_BIN` là mã BIN theo VietQR, ví dụ Vietcombank 970436), `EMAIL_FROM`, `TYPESENSE_URL`.

Đặt các secret:

```bash
pnpm wrangler secret put BETTER_AUTH_SECRET     # openssl rand -base64 32
pnpm wrangler secret put AGENT_TOKEN            # openssl rand -hex 32 – dùng chung với home-agent
pnpm wrangler secret put R2_ACCESS_KEY_ID       # R2 API token: Object Read cho tv3d-models (để ký link tải)
pnpm wrangler secret put R2_SECRET_ACCESS_KEY
pnpm wrangler secret put SEPAY_API_KEY
pnpm wrangler secret put RESEND_API_KEY
pnpm wrangler secret put TYPESENSE_API_KEY
pnpm wrangler secret put CF_ACCESS_CLIENT_ID      # service token của Cloudflare Access (bước 4)
pnpm wrangler secret put CF_ACCESS_CLIENT_SECRET
# Tuỳ chọn – đăng nhập Google:
pnpm wrangler secret put GOOGLE_CLIENT_ID
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
```

Áp migration rồi deploy:

```bash
pnpm db:migrate:remote
pnpm deploy
```

Gán quyền admin trên production: lệnh `UPDATE user ...` ở trên, đổi `--local` thành `--remote`.

## 3. Thanh toán & email

- **SePay** (sepay.vn): liên kết tài khoản ngân hàng, tạo webhook trỏ tới `https://<tên miền>/api/webhooks/sepay`, chọn xác thực *API Key*, dán đúng giá trị `SEPAY_API_KEY`. Nội dung chuyển khoản chứa mã đơn dạng `TV3DXXXXXX`; website tự khớp đơn theo mã và kiểm tra số tiền. Đối chiếu lại định dạng payload với tài liệu SePay hiện hành trước khi nhận tiền thật.
- Webhook bị lỡ thì admin bấm *Xác nhận đã nhận tiền* trong `/admin/orders`.
- **Resend** (resend.com): xác minh tên miền gửi thư rồi điền `EMAIL_FROM` cho khớp.

## 4. Máy nhà: Typesense + Tunnel + home-agent

```bash
cd home-agent
cp .env.example .env        # điền thông tin
./agent.sh check            # kiểm tra .env + website, R2, Queue, thư viện
./agent.sh start            # chạy Typesense + cloudflared + worker upload, rồi test tunnel
```

`agent.sh` gom mọi thao tác (chạy qua docker compose, không in giá trị bí mật):

| Lệnh | Việc |
|---|---|
| `check` | kiểm tra biến bắt buộc, AGENT_TOKEN với website, R2 đọc/ghi 2 bucket, quyền Queue, thư mục thư viện |
| `start` / `stop` / `restart [dịch vụ]` | chạy / dừng / khởi động lại (`typesense`, `cloudflared`, `agent`) |
| `status`, `test` | trạng thái container, Typesense local, tunnel đã kết nối, gọi thử `TUNNEL_HOSTNAME` qua Access |
| `logs [dịch vụ]` | xem log |
| `scan [--publish …]`, `typesense-setup` | quét thư viện / đồng bộ Typesense (chạy trong container) |
| `update` | kéo image mới, build lại agent |

Dùng file env khác: `./agent.sh -e .env.production start`. Trên macOS, nếu thư viện nằm ở ổ ngoài (`/Volumes/...`), cho phép Docker Desktop truy cập ổ đó (Settings → Resources → File sharing).

1. **Tunnel**: vào Cloudflare Zero Trust → Networks → Tunnels → tạo tunnel, lấy token điền vào `TUNNEL_TOKEN`. Thêm *Public hostname*, ví dụ `search.tenmien.com` → `http://typesense:8108`.
2. **Access** (bảo vệ Tunnel): Zero Trust → Access → Applications → thêm *Self-hosted* cho `search.tenmien.com`, policy *Service Auth*. Tạo *Service token* rồi đặt vào 2 secret `CF_ACCESS_CLIENT_*` của Worker. Sau bước này chỉ Worker gọi được Typesense.
3. Đặt `TYPESENSE_URL=https://search.tenmien.com` trong `wrangler.jsonc` rồi deploy lại.
4. Tạo collection và đồng bộ toàn bộ mẫu: `./agent.sh typesense-setup` (hoặc `pnpm typesense:setup`). Chạy lại lệnh này sau mỗi lần cập nhật website có thêm trường tìm kiếm: script tự thêm trường còn thiếu và đồng bộ lại, không cần `--recreate`.

**Quy ước thư mục thư viện**

```
LIBRARY_ROOT/
  Nội thất/Phòng khách/Sofa/            ← cây danh mục (bao nhiêu cấp cũng được)
    [SF-014] Sofa module Japandi/       ← một mẫu: có ít nhất 1 file .max/.fbx/.obj/.skp/...
      sofa.max  sofa.fbx
      01.jpg  02.jpg                    ← ảnh preview (ngay trong thư mục mẫu)
      maps/...                          ← texture (không dùng làm preview)
```

- Mã trong `[...]` (hoặc dạng `SF-014 - Tên`) là SKU, dùng để nhận diện mẫu; không có thì tool tự sinh mã.
- Tên engine/phiên bản trong tên file (`corona`, `vray`, `max2021`) được nhận tự động.

```bash
pnpm scan --dry-run --limit 20     # xem trước, không ghi gì
pnpm scan --only "Nội thất/Phòng khách"
pnpm scan --publish                # đăng & xuất bản luôn (mặc định: bản nháp)
pnpm worker                        # chạy liên tục để nhận job upload
```

- `scan` tạo ảnh WebP (400/1200/2000px) lên bucket public và đăng metadata. Lần sau chỉ xử lý thư mục có thay đổi. **Không** nén hay upload file mẫu ở bước này.
- `worker` nên chạy thường trực: `docker compose --profile agent up -d`, hoặc dùng `pm2`/launchd.
- Code nằm trong `home-agent/src/*.ts`. Các lệnh `pnpm scan/worker/typesense:setup` tự biên dịch sang `dist/` trước khi chạy; `pnpm typecheck` để kiểm tra kiểu. Kiểu dữ liệu trao đổi với website nằm ở `src/types.ts`, nên giữ khớp với `web/workers/api/agent.ts`.
- Chạy `scan` trong Docker: `docker compose --profile agent run --rm agent node dist/scan.js --publish`.
- Máy nhà tắt thì job vẫn chờ trong queue. Cron mỗi đêm đẩy lại job kẹt quá 6 giờ.

## 5. Quản trị

`/admin`:

- **Tổng quan**: số liệu mẫu, doanh thu, dung lượng R2.
- **Mẫu 3D**: lọc theo trạng thái và file R2. Trang sửa gồm ảnh (upload tự resize WebP, sắp xếp, chú thích), thông số, tag, nội dung (editor Tiptap), SEO, nút đẩy file lên R2 ngay.
- **Cây thư mục**: thêm, đổi tên, chuyển nhánh (cập nhật đường dẫn cả nhánh và chỉ mục tìm kiếm), đổi thứ tự, xoá. Có cây riêng cho mẫu và cho blog.
- **Bài viết & trang**: Tạp chí (gắn được mẫu vào bài) và trang tĩnh. Footer trỏ tới các slug `about`, `payment-guide`, `license`, `contact`.
- **Đơn hàng**: xác nhận tiền thủ công, hoàn tiền (thu hồi quyền tải).

Nội dung từ editor được render thành HTML ở server theo whitelist: chỉ giữ thẻ hợp lệ, link `http(s)`, ảnh từ domain media.

## 6. Chưa làm / bước tiếp theo

- **Tìm bằng ảnh**: nút đã có nhưng tạm khoá. Cần thêm trường embedding ảnh (CLIP) trong Typesense và endpoint upload ảnh truy vấn.
- Kéo thả trực tiếp trên cây thư mục; hiện đang dùng nút lên/xuống và chọn thư mục cha.
- Watermark ảnh preview khi `scan`.
- Giới hạn tần suất (rate limit) cho đăng nhập và `/d/:token`, ví dụ bằng Cloudflare WAF rate limiting rules.
- Test tự động.
