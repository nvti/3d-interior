-- Dữ liệu thử cho local: các trang tĩnh ở footer, một bài tạp chí, giá cho thư viện thử.
-- Chạy: pnpm db:seed:local   (chạy lại nhiều lần không sao)
INSERT OR IGNORE INTO posts (id, type, slug, title, excerpt, content_html, content_text, status, published_at) VALUES
  ('seed-page-about', 'page', 'about', 'Giới thiệu', 'Thư viện mẫu 3D nội thất cho kiến trúc sư và studio diễn hoạ.',
   '<p>Thư viện mẫu 3D nội thất, tuyển chọn cho kiến trúc sư và studio diễn hoạ. <em>Đây là nội dung thử.</em></p>',
   'Thư viện mẫu 3D nội thất, tuyển chọn cho kiến trúc sư và studio diễn hoạ.', 'published', unixepoch()),
  ('seed-page-payment', 'page', 'payment-guide', 'Hướng dẫn thanh toán', 'Chuyển khoản qua VietQR.',
   '<p>Quét mã VietQR trên trang đơn hàng, giữ nguyên nội dung chuyển khoản. Đơn được xác nhận tự động sau vài giây.</p>',
   'Quét mã VietQR trên trang đơn hàng, giữ nguyên nội dung chuyển khoản.', 'published', unixepoch()),
  ('seed-page-license', 'page', 'license', 'Giấy phép sử dụng', 'Quyền sử dụng mẫu đã mua.',
   '<p>Mẫu đã mua được dùng cho dự án thương mại của bạn. Không bán lại hoặc chia sẻ file gốc.</p>',
   'Mẫu đã mua được dùng cho dự án thương mại của bạn.', 'published', unixepoch()),
  ('seed-page-contact', 'page', 'contact', 'Liên hệ', 'Hỗ trợ khách hàng.',
   '<p>Email: hotro@example.test</p>', 'Email: hotro@example.test', 'published', unixepoch()),
  ('seed-post-japandi', 'post', 'phong-cach-japandi', 'Phong cách Japandi trong phòng khách', 'Gỗ sáng, vải thô và khoảng trống.',
   '<p>Japandi kết hợp sự tối giản của Nhật Bản và sự ấm áp của Bắc Âu. <em>Bài viết thử.</em></p>',
   'Japandi kết hợp sự tối giản của Nhật Bản và sự ấm áp của Bắc Âu.', 'published', unixepoch());

-- Giá + thông số cho các mẫu của thư viện thử (home-agent: pnpm sample && pnpm scan --publish).
-- Chạy lại lệnh seed sau khi scan. BT-001 để 0đ để thử mẫu miễn phí.
UPDATE models SET price_vnd = 149000, style = 'Japandi', materials = 'Gỗ sồi, vải bố', subtitle = 'Đường cong mềm, gỗ sáng, vải thô.' WHERE sku = 'SF-001' AND price_vnd = 0;
UPDATE models SET price_vnd = 199000, style = 'Cổ điển', materials = 'Da bò, gỗ óc chó' WHERE sku = 'SF-002' AND price_vnd = 0;
UPDATE models SET price_vnd = 129000, style = 'Tối giản', materials = 'Nỉ, gỗ thông' WHERE sku = 'GN-001' AND price_vnd = 0;
UPDATE models SET price_vnd = 89000,  style = 'Bắc Âu', materials = 'Gỗ tần bì, dây giấy' WHERE sku = 'GA-001' AND price_vnd = 0;
UPDATE models SET price_vnd = 59000,  style = 'Japandi', materials = 'Giấy washi, tre' WHERE sku = 'DT-001' AND price_vnd = 0;
UPDATE models SET price_vnd = 49000,  style = 'Nhiệt đới' WHERE sku = 'CX-001' AND price_vnd = 0;
UPDATE models SET price_vnd = 39000,  style = 'Hiện đại' WHERE sku = 'TR-001' AND price_vnd = 0;
