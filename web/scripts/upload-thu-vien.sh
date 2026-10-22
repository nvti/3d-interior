#!/usr/bin/env bash
# Upload toàn bộ ảnh preview trong "THU VIEN" lên bucket R2 (mặc định tv3d-media).
# Key trên R2: thu-vien/<THƯ MỤC>/<tên file>  (giữ nguyên cấu trúc thư mục)
#
# Dùng (chạy trong thư mục web/):
#   bash scripts/upload-thu-vien.sh                 # upload thật
#   DRY_RUN=1 bash scripts/upload-thu-vien.sh       # chỉ in danh sách, không upload
#   BUCKET=ten-khac PREFIX=abc JOBS=4 bash scripts/upload-thu-vien.sh
set -euo pipefail

SRC="${SRC:-../THU VIEN}"
BUCKET="${BUCKET:-tv3d-media}"
PREFIX="${PREFIX:-thu-vien}"
JOBS="${JOBS:-8}"
LOG="${LOG:-upload-thu-vien.log}"

upload_one() {
  local file="$1"
  local rel="${file#"$SRC"/}"
  # API Cloudflare (WAF) chặn URL có ".." (coi là path traversal) → gộp thành "."
  local key; key="$(echo "$PREFIX/$rel" | sed -E 's/\.{2,}/./g')"
  local ext; ext="$(echo "${file##*.}" | tr '[:upper:]' '[:lower:]')"
  local type
  case "$ext" in
    jpg|jpeg) type="image/jpeg" ;;
    png) type="image/png" ;;
    webp) type="image/webp" ;;
    *) echo "SKIP $rel"; return 0 ;;
  esac
  if [ -n "${DRY_RUN:-}" ]; then
    echo "DRY  $BUCKET/$key ($type)"
    return 0
  fi
  if pnpm exec wrangler r2 object put "$BUCKET/$key" \
      --file "$file" --content-type "$type" \
      --cache-control "public, max-age=31536000, immutable" \
      --remote >/dev/null 2>&1; then
    echo "OK   $key"
  else
    echo "FAIL $key"
  fi
}
export -f upload_one
export SRC BUCKET PREFIX DRY_RUN

find "$SRC" -type f ! -name '.DS_Store' -print0 \
  | xargs -0 -n 1 -P "$JOBS" bash -c 'upload_one "$0"' \
  | tee "$LOG"

echo "---"
echo "OK:   $(grep -c '^OK' "$LOG" || true)"
echo "FAIL: $(grep -c '^FAIL' "$LOG" || true)  (xem $LOG, chạy lại file lỗi bằng tay)"
