-- Bảng tìm kiếm dự phòng (khi Typesense ở máy nhà không phản hồi).
-- unicode61 remove_diacritics 2: gõ không dấu vẫn khớp ("ghe go" ~ "ghế gỗ")
CREATE VIRTUAL TABLE IF NOT EXISTS models_fts USING fts5(
  model_id UNINDEXED,
  title,
  description,
  tags,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);
