# Tài liệu chức năng

Tài liệu này mô tả những gì hệ thống **đang làm được**, chia theo người dùng: khách hàng, quản trị viên, tool máy nhà và các tác vụ tự động. Cách cài đặt và triển khai xem ở [README](../README.md).

**Mục lục**

1. [Khách hàng](#1-khách-hàng)
2. [Quản trị viên](#2-quản-trị-viên)
3. [Tool máy nhà](#3-tool-máy-nhà)
4. [Tác vụ tự động](#4-tác-vụ-tự-động)
5. [Quy tắc nghiệp vụ](#5-quy-tắc-nghiệp-vụ)
6. [Bản đồ trang](#6-bản-đồ-trang)
7. [Chưa có](#7-chưa-có)

---

## 1. Khách hàng

### 1.1 Tìm kiếm & duyệt thư viện — `/`

- **Ô tìm kiếm** nhận câu mô tả tự nhiên, ví dụ “ghế gỗ uốn cong, nệm vải bố”.
  - Có Typesense: tìm **hybrid**, kết hợp khớp từ khoá với tìm theo nghĩa (model đa ngôn ngữ), nên mô tả bằng tiếng Việt hay tiếng Anh đều ra kết quả gần nghĩa.
  - Gõ **không dấu** vẫn tìm được, kể cả chữ “đ” (`den may tre` → “Đèn thả mây tre”). Gõ dở từ cũng được (`giuong indo` → “Giường gỗ Indochine”).
  - Máy nhà không phản hồi trong 2,5 giây thì tự chuyển sang **tìm kiếm dự phòng** bằng D1. Chế độ này vẫn tìm không dấu và theo tiền tố, nhưng chỉ khớp từ khoá. Khách không thấy khác biệt nào về giao diện.
- **Tìm bằng ảnh** (nút camera cạnh ô tìm kiếm): chọn một ảnh, website trả về tối đa 48 mẫu có ảnh đại diện giống nhất (CLIP). Bộ lọc vẫn dùng được, đổi bộ lọc thì tìm lại với ảnh đó; *Bỏ ảnh* để quay về danh sách thường. Cần máy nhà đang chạy – nếu không, trang báo lỗi, không có dự phòng.
- **Chỉ mục danh mục gốc**: hàng danh mục đánh số `01, 02…`, kèm số mẫu của cả nhánh.
- **Danh mục con** hiện dạng tab dưới tiêu đề. Chọn danh mục cha thì thấy mẫu của cả nhánh.
- **Breadcrumb** theo đường dẫn danh mục, ví dụ `Thư viện / Nội thất / Phòng khách / Sofa`.
- **Bộ lọc** đặt trên một thanh ngang, chọn đến đâu cập nhật kết quả đến đó:
  - Phong cách: Hiện đại, Japandi, Indochine, Bắc Âu, Tân cổ điển, Công nghiệp, Wabi-sabi.
  - Render: V-Ray, Corona.
  - Định dạng: `.max`, `.fbx`, `.obj`, `.skp`, `.gltf`.
  - Giá: tất cả / miễn phí / có phí.
  - Nút *Xoá lọc*.
- **Sắp xếp**: liên quan nhất, mới nhất, giá tăng dần, giá giảm dần.
- **Phân trang**: 24 mẫu mỗi trang.
- **Thẻ mẫu** gồm ảnh bìa (4:5), mã mẫu, tên, giá (hoặc “Miễn phí”), dòng thông số (engine, định dạng, chất liệu).
- **Trang chủ** (khi chưa tìm, chưa lọc) có thêm tiêu đề lớn, các gợi ý tìm nhanh, và một dải giới thiệu bài Tạp chí mới nhất nếu đã có bài.
- Không tìm thấy kết quả thì hiện thông báo kèm gợi ý bỏ bớt bộ lọc.

### 1.2 Chi tiết mẫu — `/models/:slug`

- **Ảnh**: ảnh lớn kèm chú thích (`01 — Phối cảnh`…). Bấm ảnh nhỏ để đổi ảnh lớn, bấm ảnh lớn để mở bản 2000px.
- **Thông tin**: danh mục · phong cách, tên mẫu, câu mô tả tinh thần (in nghiêng), giá.
- **Bảng thông số** kiểu khung tên bản vẽ: render engine, phiên bản 3ds Max, định dạng, dung lượng, kích thước R × S × C (mm), chất liệu, mã mẫu.
- **Tag**: bấm một tag để tìm các mẫu cùng tag.
- **Nút mua**, tuỳ theo trạng thái:
  - Chưa sở hữu: *Mua mẫu này* (sang trang thanh toán) và *Thêm vào giỏ*.
  - Mẫu miễn phí: nút là *Nhận miễn phí*.
  - Đã sở hữu: *Bạn đã có mẫu này — tải xuống* (sang Mẫu đã mua).
- **Về mẫu này**: nội dung viết bằng editor trong admin.
- **Đi cùng không gian này**: 4 mẫu ngẫu nhiên cùng danh mục.
- **SEO**: meta title/description riêng cho từng mẫu (nếu admin đã nhập), ảnh chia sẻ là ảnh bìa.

### 1.3 Giỏ hàng — `/cart`

- Lưu trên trình duyệt, không cần đăng nhập. Mở nhiều tab vẫn đồng bộ.
- Xem danh sách, bỏ từng mẫu, xem tạm tính, bấm *Thanh toán*.
- Giá trong giỏ chỉ để hiển thị. Khi tạo đơn, giá luôn được tính lại ở server.

### 1.4 Thanh toán — `/checkout` → `/orders/:id`

1. Khách phải đăng nhập (chưa đăng nhập thì được chuyển sang đăng nhập rồi quay lại).
2. Trang xác nhận liệt kê mẫu, tổng tiền và email nhận link tải.
3. Bấm tạo đơn:
   - Những mẫu khách **đã sở hữu** tự động bị bỏ khỏi đơn.
   - Tổng tiền **bằng 0** (toàn mẫu miễn phí): đơn được xác nhận ngay.
   - Có phí: chuyển sang trang đơn hàng có **mã VietQR**, số tiền, nội dung chuyển khoản (mã đơn dạng `TV3DXXXXXX`), số tài khoản và chủ tài khoản.
4. Trang đơn hàng **tự kiểm tra trạng thái mỗi 5 giây**. Ngân hàng xác nhận xong thì trang chuyển sang *Thanh toán thành công* và các mẫu vừa mua tự bỏ khỏi giỏ.
5. Đơn không thanh toán sau 3 ngày chuyển sang *Hết hạn*.

### 1.5 Mẫu đã mua & tải file — `/purchases`, `/d/:token`

- Danh sách mọi mẫu đã mua, gồm ảnh, tên, ngày mua, mã đơn, dung lượng và trạng thái:
  - **Sẵn sàng**: nút *Tải xuống*.
  - **Đang chuẩn bị**: file đang được đưa từ máy nhà lên máy chủ. Nút đổi thành “Sẽ gửi qua email”.
- **Mỗi lần bấm Tải xuống tạo một link riêng**. Link riêng chuyển tiếp sang link tải trực tiếp từ máy chủ, link này chỉ dùng được 15 phút.
- **Email sau thanh toán** gửi một thư tổng hợp: mẫu nào sẵn sàng có nút tải ngay; mẫu nào đang chuẩn bị sẽ được gửi riêng một email khi file sẵn sàng.
- **Link trong email** (`/d/…`):
  - Dùng được trong **72 giờ**, tối đa **5 lần bấm**.
  - Link bị sửa, hết hạn hoặc dùng quá số lần thì hiện thông báo và nút về *Mẫu đã mua* để tạo link mới.
  - Nếu file đã bị dọn khỏi máy chủ sau khi gửi link, hệ thống tự đưa file lên lại rồi gửi email mới.
  - Khách đã bị thu hồi quyền (do hoàn tiền) thì không tải được.
- File tải về được đặt tên theo tên mẫu, ví dụ `sofa-module-japandi.zip`.

### 1.6 Tài khoản

- **Đăng ký** (`/register`): tên hoặc tên studio, email, mật khẩu từ 8 ký tự.
- **Đăng nhập** (`/login`): email và mật khẩu. Nếu đã cấu hình Google thì có thêm nút *Tiếp tục với Google* ở đầu form (cả ở `/register`); lần đầu dùng Google sẽ tự tạo tài khoản, email trùng tài khoản cũ thì gộp vào tài khoản đó.
- Phiên đăng nhập giữ **30 ngày**. *Đăng xuất* ở thanh trên cùng.
- Sau khi đăng nhập, khách được đưa về đúng trang đang xem trước đó.

### 1.7 Tạp chí & trang tĩnh — `/blog`, `/blog/:slug`, `/p/:slug`

- Danh sách bài: bài mới nhất hiện lớn, các bài khác dạng lưới.
- Trang bài viết gồm tiêu đề, sapo, ảnh bìa, nội dung, và mục **Mẫu trong bài** (các mẫu admin gắn vào bài, bấm vào là mua được).
- Trang tĩnh dùng cho Giới thiệu, Hướng dẫn thanh toán, Giấy phép sử dụng, Liên hệ. Footer trỏ sẵn tới các slug `about`, `payment-guide`, `license`, `contact`.

---

## 2. Quản trị viên

Vào `/admin` (link *Quản trị* hiện trên thanh trên cùng khi đăng nhập bằng tài khoản admin). Mọi trang và API admin đều kiểm tra quyền riêng; khách thường vào sẽ nhận lỗi 403.

### 2.1 Tổng quan — `/admin`

Các ô số liệu (bấm được để lọc nhanh): mẫu đã xuất bản / tổng số, bản nháp chờ duyệt, doanh thu 30 ngày, tổng doanh thu, đơn đã thanh toán, đơn chờ chuyển khoản, số mẫu đang có trên R2 kèm dung lượng, số mẫu đang đẩy lên hoặc bị lỗi, số khách hàng. Nếu chưa cấu hình Typesense, trang hiện cảnh báo website đang dùng tìm kiếm cơ bản.

### 2.2 Mẫu 3D — `/admin/models`, `/admin/models/:id`

**Danh sách**
- Tìm theo tên hoặc mã mẫu; lọc theo trạng thái (đã xuất bản / bản nháp / lưu trữ) và theo file trên R2 (có / chưa có / đang đẩy / lỗi).
- Bảng gồm ảnh bìa, tên, mã, thư mục, giá, trạng thái, trạng thái file. Mỗi trang 50 dòng.
- Nút *+ Thêm mẫu*.

**Trang sửa mẫu**

| Khối | Nội dung |
|---|---|
| Thông tin chung | Tiêu đề; slug (để trống thì tự tạo từ tiêu đề, có kiểm tra trùng); thư mục (chọn trong cây); câu mô tả tinh thần; mô tả ngắn (dùng cho tìm kiếm và thẻ chia sẻ) |
| Ảnh preview | Thả hoặc chọn nhiều ảnh cùng lúc. Ảnh **tự resize ngay trong trình duyệt** thành WebP 400/1200/2000px rồi mới tải lên. Sắp xếp lên/xuống, ảnh đầu tiên là ảnh bìa, chú thích từng ảnh, bỏ ảnh. Mỗi ảnh tối đa 15MB, nhận JPG/PNG/WebP/AVIF |
| Thông số | Giá VND (gõ `150.000` cũng được; `0` = miễn phí), phong cách (có gợi ý), render engine, phiên bản 3ds Max, chất liệu, mã mẫu (SKU), định dạng (chọn nhiều), kích thước R/S/C (mm) |
| Nội dung | Editor có định dạng: in đậm, nghiêng, gạch chân, H2/H3, danh sách, đánh số, trích dẫn, link, chèn ảnh (tự upload), đường kẻ |
| Trạng thái | Bản nháp / Đã xuất bản / Lưu trữ; ngày sửa lần cuối |
| File mẫu | Key file trong thư viện, dung lượng, trạng thái trên R2, lần tải cuối; nút *Đẩy lên R2 ngay* |
| Tag | Nhập cách nhau bằng dấu phẩy, tối đa 30 tag; tag chưa có sẽ được tạo mới |
| SEO | Meta title, meta description |

- *Lưu* xong, chỉ mục tìm kiếm được cập nhật ngay (D1), còn Typesense cập nhật qua hàng đợi. Nếu máy nhà đang tắt, Typesense sẽ được cập nhật khi máy bật lại.
- *Xem trên web* hiện khi mẫu đã xuất bản.
- *Xoá mẫu*: nếu mẫu **đã có người mua** thì không xoá mà chuyển sang *Lưu trữ*, để khách cũ vẫn tải được. Mẫu chưa bán thì xoá hẳn, kèm file trên R2.
- **An toàn nội dung**: HTML hiển thị cho khách được tạo lại ở server theo whitelist. Thẻ lạ, link `javascript:`, ảnh không nằm trên domain media đều bị loại bỏ.

### 2.3 Cây thư mục — `/admin/categories`

- Hai cây riêng: **Mẫu 3D** và **Chuyên mục blog**.
- **Thêm** thư mục vào gốc hoặc vào một thư mục bất kỳ.
- **Sửa**: đổi tên và/hoặc chuyển sang thư mục cha khác. Đường dẫn của **cả nhánh** được cập nhật trong một lần, và các mẫu thuộc nhánh tự được cập nhật lại trong chỉ mục tìm kiếm. Hệ thống chặn việc chuyển một thư mục vào chính nhánh con của nó.
- **Đổi thứ tự** giữa các thư mục cùng cấp bằng nút lên/xuống.
- **Xoá**: chỉ xoá được thư mục không còn thư mục con và không còn mẫu.
- Mỗi dòng hiện đường dẫn (`/noi-that/phong-khach/sofa/`) và số mẫu của nhánh.
- Cây cũng được **tự tạo khi import** từ máy nhà, theo đúng cấu trúc thư mục trên ổ cứng.

### 2.4 Bài viết & trang — `/admin/posts`, `/admin/posts/:id`

- Hai tab: **Tạp chí** (bài viết) và **Trang tĩnh**.
- Trang soạn gồm: tiêu đề, slug, sapo, nội dung (cùng editor với mẫu), trạng thái, ảnh bìa (tải lên và tự resize), chuyên mục, meta SEO.
- **Gắn mẫu vào bài**: nhập SKU hoặc slug cách nhau bằng dấu phẩy, tối đa 24 mẫu, theo đúng thứ tự nhập. Các mẫu này hiện cuối bài để khách mua.
- Xoá bài hoặc trang.

### 2.5 Đơn hàng — `/admin/orders`

- Lọc: tất cả / chờ thanh toán / đã thanh toán / hoàn tiền / hết hạn.
- Bảng gồm mã đơn, email khách, các mẫu trong đơn, tổng tiền, ngày tạo, trạng thái.
- **Xác nhận đã nhận tiền** (đơn chờ): dùng khi webhook không về nhưng tiền đã vào tài khoản. Thao tác này chạy đúng quy trình như thanh toán tự động: cấp quyền, tạo link, gửi email.
- **Hoàn tiền** (đơn đã thanh toán, có phí): đơn chuyển sang *Đã hoàn tiền* và khách **mất quyền tải** các mẫu trong đơn. Bản thân việc trả tiền cho khách thì làm thủ công qua ngân hàng.

### 2.6 Cấp quyền admin

Chưa có giao diện cấp quyền. Admin được gán bằng lệnh SQL, xem README mục 1 và 2.

---

## 3. Tool máy nhà

Chạy trong thư mục `home-agent/` (Node.js ≥ 20.6, viết bằng TypeScript; mỗi lệnh tự biên dịch trước khi chạy).

### 3.1 `pnpm scan`: quét thư viện và đăng mẫu

- Duyệt thư mục thư viện. Thư mục nào có ít nhất một file mẫu (`.max .fbx .obj .skp .gltf .glb .3ds .c4d .blend`) thì được coi là **một mẫu**. Các thư mục cha phía trên trở thành **cây danh mục**.
- **Tên thư mục mẫu** = tiêu đề. **SKU** lấy từ `[SF-014] Tên` hoặc `SF-014 - Tên`; nếu không có thì tool tự sinh một mã cố định theo đường dẫn.
- **Tự nhận** render engine (`corona`, `vray` trong tên file hoặc tên thư mục) và phiên bản Max (`max2021`).
- **Ảnh preview**: lấy tối đa 8 ảnh nằm ngay trong thư mục mẫu, bỏ qua ảnh trong `maps/`, `textures/`… Tạo WebP 400/1200/2000px rồi tải lên bucket public. Ảnh chỉ tạo **khi mẫu mới**, để không ghi đè ảnh admin đã sắp xếp lại.
- **Không đè chỉnh sửa của admin**: với mẫu đã có, tool chỉ cập nhật thông tin file và chỉ điền các trường còn trống. Tiêu đề, nội dung, giá admin đã sửa được giữ nguyên.
- **Chỉ xử lý thư mục có thay đổi**, so theo số file, tổng dung lượng và thời gian sửa. Nếu nội dung một mẫu đã thay đổi, bản cũ trên R2 bị xoá để lần mua sau đưa lên bản mới.
- Mẫu mới mặc định là **Bản nháp**. Thêm `--publish` để xuất bản luôn.
- Tuỳ chọn: `--dry-run` (chỉ in ra, không ghi gì), `--limit N`, `--only "Nội thất/Phòng khách"`, `--force` (xử lý lại dù không đổi).
- Bước này **không nén và không upload file mẫu**, nên quét 2TB vẫn nhanh và không tốn thêm dung lượng.

### 3.2 `pnpm worker`: đưa file lên khi có đơn

- Chạy thường trực. Định kỳ hỏi hàng đợi `tv3d-upload` xem có job mới không; lúc rảnh chờ lâu dần từ 5 đến 30 giây.
- Với mỗi job: nén thư mục mẫu thành zip tạm → upload nhiều phần song song lên bucket private (tự thử lại từng phần khi mạng chập chờn) → so dung lượng trên R2 với file local → báo website. Website chuyển các yêu cầu tải đang chờ sang *sẵn sàng* và gửi email cho khách. Cuối cùng xoá zip tạm.
- Upload lỗi thì thử lại sau 2 phút, tối đa 8 lần, sau đó báo lỗi về website (mẫu chuyển sang *Lỗi*). Không tìm thấy thư mục thì báo lỗi ngay.
- Máy tắt thì job vẫn nằm chờ trong hàng đợi.

### 3.3 `pnpm typesense:setup`

Tạo collection tìm kiếm trên Typesense, với embedding sinh từ tiêu đề, mô tả, tag, chất liệu, phong cách và nội dung bằng model `ts/multilingual-e5-small`. Sau đó đưa toàn bộ mẫu vào hàng đợi đồng bộ. Thêm `--recreate` để xoá và tạo lại.

### 3.4 `pnpm typesense:images`

Nhúng ảnh đại diện của các mẫu vào Typesense (model CLIP `ts/clip-vit-b-p32`) cho tìm bằng ảnh. Chỉ xử lý mẫu mới hoặc vừa đổi ảnh đại diện (so `cover_url` với `image_key`); `--force` để nhúng lại tất cả. Worker cũng tự chạy việc này 10 phút một lần.

### 3.5 Docker

`docker-compose.yml` chạy Typesense, Cloudflare Tunnel và (tuỳ chọn) worker; cả ba đều tự khởi động lại. Xem README mục 4.

---

## 4. Tác vụ tự động

| Tác vụ | Khi nào | Việc làm |
|---|---|---|
| Đồng bộ tìm kiếm | Mỗi lần mẫu được thêm, sửa hoặc xoá, và khi đổi cây thư mục | Cập nhật chỉ mục D1 ngay; đẩy sang Typesense qua hàng đợi. Máy nhà offline thì thử lại mỗi 5 phút |
| Dọn R2 | Mỗi đêm, 2h sáng giờ Việt Nam | Xoá file mẫu quá 30 ngày không có lượt tải. Mẫu còn link tải chưa hết hạn thì giữ lại. Xử lý tối đa 200 mẫu mỗi lần |
| Đẩy lại job kẹt | Cùng lúc | Mẫu kẹt ở *đang đẩy lên* quá 6 giờ thì đẩy lại; quá 10 lần thì chuyển sang *Lỗi* |
| Thử lại mẫu lỗi | Cùng lúc | Mẫu *Lỗi* mà vẫn có khách đang chờ thì thử đẩy lại |
| Hết hạn | Cùng lúc | Link tải quá hạn → hết hạn; đơn chờ quá 3 ngày → hết hạn |
| Gửi email | Khi thanh toán xong và khi file sẵn sàng | Qua Resend. Chưa cấu hình thì chỉ ghi log |

---

## 5. Quy tắc nghiệp vụ

**Vòng đời file mẫu trên R2**

```
Chưa có ──(có đơn / admin bấm đẩy)──> Đang đẩy lên ──(máy nhà upload xong)──> Có trên R2
   ▲                                       │                                      │
   │                                       └──(lỗi nhiều lần)──> Lỗi ──(thử lại)───┘
   └──────────────(30 ngày không ai tải, hoặc file ở máy nhà thay đổi)────────────────┘
```

- Nhiều người cùng mua một mẫu chưa có trên R2 thì file **chỉ được upload một lần**, và tất cả đều nhận email khi xong.
- Mỗi lần cấp link tải được tính là một lượt tải, dùng để quyết định thời điểm dọn file.

**Đơn hàng**: `Chờ thanh toán → Đã thanh toán → (Hoàn tiền)`, hoặc `Chờ thanh toán → Hết hạn`.
- Webhook chỉ xác nhận khi nội dung chuyển khoản chứa đúng mã đơn **và** số tiền ≥ tổng đơn.
- Mỗi giao dịch chỉ được xử lý một lần; webhook gửi lặp không tạo quyền tải trùng.

**Quyền tải**: mỗi khách mỗi mẫu có một quyền tải. Mua lại mẫu đã sở hữu thì mẫu đó tự bị bỏ khỏi đơn. Hoàn tiền thì thu hồi quyền; mua lại sau đó thì quyền được cấp lại.

**Giới hạn**

| Mục | Giá trị | Đổi ở đâu |
|---|---|---|
| Hạn link tải (email / Mẫu đã mua) | 72 giờ, tối đa 5 lần bấm | `DOWNLOAD_LINK_TTL_HOURS` |
| Hạn link trực tiếp từ R2 | 15 phút | `PRESIGN_TTL_SECONDS` |
| Dọn file R2 sau | 30 ngày không tải | `R2_EVICT_DAYS` |
| Đơn chờ hết hạn sau | 3 ngày | code (`workers/jobs.ts`) |
| Số mẫu tối đa một đơn | 50 | code |
| Kết quả mỗi trang | 24 | code (`search.server.ts`) |
| Mật khẩu tối thiểu | 8 ký tự | code |

---

## 6. Bản đồ trang

| Đường dẫn | Ai dùng | Chức năng |
|---|---|---|
| `/` | Mọi người | Trang chủ, tìm kiếm, lọc theo danh mục (`?q= &cat= &style= &engine= &format= &price= &sort= &page=`) |
| `/models/:slug` | Mọi người | Chi tiết mẫu |
| `/cart` | Mọi người | Giỏ hàng |
| `/checkout` | Đã đăng nhập | Xác nhận & tạo đơn |
| `/orders/:id` | Chủ đơn | Mã QR, trạng thái đơn |
| `/purchases` | Đã đăng nhập | Danh sách mẫu đã mua, tải xuống |
| `/d/:token` | Người có link | Mở link tải |
| `/blog`, `/blog/:slug` | Mọi người | Tạp chí |
| `/p/:slug` | Mọi người | Trang tĩnh |
| `/login`, `/register` | Khách | Tài khoản |
| `/admin/…` | Admin | Quản trị (mục 2) |
| `/api/webhooks/sepay` | SePay | Nhận thông báo chuyển khoản |
| `/api/agent/…` | Tool máy nhà | Đăng mẫu, báo upload, đồng bộ lại |
| `/api/admin/media` | Admin | Tải ảnh lên |

---

## 7. Chưa có

- Kéo thả trực tiếp trên cây thư mục (hiện dùng nút lên/xuống và chọn thư mục cha).
- Watermark ảnh preview.
- Bản thu nhỏ cho ảnh nhập từ THU VIEN (hiện thẻ mẫu tải ảnh gốc, nặng hơn cần thiết nhiều lần).
- Tối ưu tải ảnh: hàng đầu tải ngay thay vì lazy; lazy load ở giỏ hàng, thanh toán, mẫu đã mua, admin.
- Giao diện cấp quyền admin, quên mật khẩu, xác minh email.
- Mã giảm giá, gói credit, gói thuê bao.
- Thanh toán quốc tế (PayPal, thẻ).
- Giới hạn tần suất đăng nhập và mở link tải (nên cấu hình bằng Cloudflare WAF rate limiting).
- Thống kê chi tiết: mẫu bán chạy, từ khoá khách hay tìm.
