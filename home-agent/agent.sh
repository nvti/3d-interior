#!/usr/bin/env bash
# Quản lý home-agent trên máy nhà: Typesense + Cloudflare Tunnel + worker upload (docker compose).
#
#   ./agent.sh check            kiểm tra .env + kết nối (website, R2, Queue, thư viện)
#   ./agent.sh start            kiểm tra rồi chạy tất cả, sau đó test tunnel
#   ./agent.sh stop             dừng tất cả
#   ./agent.sh restart [dịch vụ] khởi động lại (typesense | cloudflared | agent)
#   ./agent.sh status           trạng thái container + health
#   ./agent.sh logs [dịch vụ]   xem log (Ctrl+C để thoát)
#   ./agent.sh test             test Typesense local + tunnel
#   ./agent.sh scan [--publish …]  quét thư viện, đăng mẫu lên website
#   ./agent.sh typesense-setup  tạo collection + đồng bộ toàn bộ mẫu
#   ./agent.sh update           build lại image agent, kéo bản mới typesense/cloudflared
#
# Dùng file env khác:  ./agent.sh -e .env.production start
# Script không bao giờ in giá trị bí mật (chỉ in độ dài).
set -uo pipefail
cd "$(dirname "$0")"

ENV_FILE=".env"
if [ "${1:-}" = "-e" ]; then
  ENV_FILE="${2:?Thiếu tên file sau -e}"
  shift 2
fi
export AGENT_ENV_FILE="$ENV_FILE"

if [ -t 1 ]; then R=$'\e[31m'; G=$'\e[32m'; Y=$'\e[33m'; B=$'\e[1m'; N=$'\e[0m'; else R= G= Y= B= N=; fi
ok() { printf "  ${G}✓${N} %s\n" "$*"; }
warn() { printf "  ${Y}!${N} %s\n" "$*"; WARNS=$((WARNS + 1)); }
fail() { printf "  ${R}✗${N} %s\n" "$*"; FAILS=$((FAILS + 1)); }
title() { printf "\n${B}%s${N}\n" "$*"; }
FAILS=0
WARNS=0

REQUIRED="SITE_URL AGENT_TOKEN LIBRARY_ROOT R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_MEDIA_BUCKET R2_MODELS_BUCKET CF_API_TOKEN UPLOAD_QUEUE_ID TYPESENSE_API_KEY TUNNEL_TOKEN"
SECRET_RE='TOKEN|SECRET|KEY'

# Đọc file env (KEY=VALUE, bỏ comment, bỏ ngoặc kép) – không chạy code trong file
load_env() {
  [ -f "$ENV_FILE" ] || { echo "${R}Không có file $ENV_FILE${N} – copy từ .env.example rồi điền giá trị."; exit 1; }
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '' | \#*) continue ;; esac
    key="${line%%=*}"
    val="${line#*=}"
    key="$(echo "$key" | tr -d '[:space:]')"
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && export "$key=$val"
  done <"$ENV_FILE"
}

compose() { docker compose --env-file "$ENV_FILE" --profile agent "$@"; }

http_code() { curl -s -o /dev/null -w "%{http_code}" --max-time "${TIMEOUT:-10}" "$@" 2>/dev/null || echo "000"; }

check_env() {
  title "Biến môi trường ($ENV_FILE)"
  for k in $REQUIRED; do
    v="${!k:-}"
    if [ -z "$v" ]; then
      fail "$k chưa đặt"
    elif [[ "$k" =~ $SECRET_RE ]]; then
      ok "$k (${#v} ký tự)"
    else
      ok "$k = $v"
    fi
  done
  [ "${R2_MODE:-}" = "local" ] && fail "R2_MODE=local – đây là chế độ thử với web local, xoá dòng này khi chạy thật"
  case "${SITE_URL:-}" in *localhost* | *127.0.0.1*) warn "SITE_URL trỏ về máy local (${SITE_URL})" ;; esac
  case "${LIBRARY_ROOT:-}" in *sample-library*) warn "LIBRARY_ROOT đang là thư viện thử (${LIBRARY_ROOT})" ;; esac
  [ -n "${TUNNEL_HOSTNAME:-}" ] || warn "TUNNEL_HOSTNAME chưa đặt (vd search.tihado.com) – bỏ qua test tunnel từ internet"
}

check_online() {
  title "Kết nối"
  if docker info >/dev/null 2>&1; then ok "Docker đang chạy"; else fail "Docker chưa chạy – mở Docker Desktop"; fi

  if [ -n "${LIBRARY_ROOT:-}" ]; then
    if [ -d "$LIBRARY_ROOT" ] && [ -r "$LIBRARY_ROOT" ]; then
      ok "Thư viện: $LIBRARY_ROOT ($(find "$LIBRARY_ROOT" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ') thư mục cấp 1)"
    else
      fail "Không đọc được LIBRARY_ROOT: $LIBRARY_ROOT (ổ ngoài chưa cắm?)"
    fi
  fi

  if [ -n "${SITE_URL:-}" ] && [ -n "${AGENT_TOKEN:-}" ]; then
    c=$(http_code -H "Authorization: Bearer $AGENT_TOKEN" "${SITE_URL%/}/api/agent/health")
    case "$c" in
      200) ok "Website ${SITE_URL} nhận AGENT_TOKEN" ;;
      401) fail "Website từ chối AGENT_TOKEN (401) – token khác secret AGENT_TOKEN của Worker" ;;
      *) fail "Không gọi được ${SITE_URL}/api/agent/health (HTTP $c)" ;;
    esac
  fi

  if [ -n "${R2_ACCOUNT_ID:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]; then
    ep="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    for b in "${R2_MEDIA_BUCKET:-}" "${R2_MODELS_BUCKET:-}"; do
      [ -n "$b" ] || continue
      s3=(--aws-sigv4 "aws:amz:auto:s3" --user "${R2_ACCESS_KEY_ID}:${R2_SECRET_ACCESS_KEY}")
      r=$(http_code "${s3[@]}" "$ep/$b?list-type=2&max-keys=1")
      w=$(http_code "${s3[@]}" -X PUT --data-binary "ok" -H "Content-Type: text/plain" "$ep/$b/.agent-healthcheck")
      [ "$w" = "200" ] && http_code "${s3[@]}" -X DELETE "$ep/$b/.agent-healthcheck" >/dev/null
      if [ "$r" = "200" ] && [ "$w" = "200" ]; then ok "R2 $b: đọc + ghi"; else fail "R2 $b: đọc HTTP $r, ghi HTTP $w (token cần Object Read & Write cho bucket này)"; fi
    done
  fi

  if [ -n "${CF_API_TOKEN:-}" ] && [ -n "${UPLOAD_QUEUE_ID:-}" ] && [ -n "${R2_ACCOUNT_ID:-}" ]; then
    body=$(curl -s --max-time 10 -H "Authorization: Bearer $CF_API_TOKEN" \
      "https://api.cloudflare.com/client/v4/accounts/${R2_ACCOUNT_ID}/queues/${UPLOAD_QUEUE_ID}" 2>/dev/null)
    if echo "$body" | grep -q '"success":[[:space:]]*true'; then
      ok "Queue $(echo "$body" | grep -o '"queue_name":[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4): CF_API_TOKEN truy cập được"
    else
      fail "CF_API_TOKEN không đọc được queue ${UPLOAD_QUEUE_ID} (cần quyền Queues: Edit, đúng account)"
    fi
  fi
}

test_services() {
  title "Typesense (máy này)"
  c=$(http_code "http://localhost:8108/health")
  if [ "$c" = "200" ]; then ok "http://localhost:8108/health"; else fail "Typesense không phản hồi (HTTP $c) – ./agent.sh logs typesense"; fi
  if [ -n "${TYPESENSE_API_KEY:-}" ] && [ "$c" = "200" ]; then
    body=$(curl -s --max-time 10 -H "X-TYPESENSE-API-KEY: $TYPESENSE_API_KEY" "http://localhost:8108/collections/${TYPESENSE_COLLECTION:-models}")
    n=$(echo "$body" | grep -o '"num_documents":[0-9]*' | cut -d: -f2)
    if [ -n "$n" ]; then ok "collection ${TYPESENSE_COLLECTION:-models}: $n mẫu"; else warn "chưa có collection ${TYPESENSE_COLLECTION:-models} – chạy ./agent.sh typesense-setup"; fi
  fi

  title "Cloudflare Tunnel"
  if compose ps --status running --services 2>/dev/null | grep -qx cloudflared; then
    conns=$(compose logs --tail 200 cloudflared 2>/dev/null | grep -c "Registered tunnel connection")
    if [ "$conns" -gt 0 ]; then ok "cloudflared đã kết nối ($conns kết nối)"; else fail "cloudflared chạy nhưng chưa kết nối – kiểm tra TUNNEL_TOKEN: ./agent.sh logs cloudflared"; fi
  else
    fail "container cloudflared không chạy"
  fi

  if [ -n "${TUNNEL_HOSTNAME:-}" ]; then
    url="https://${TUNNEL_HOSTNAME}/health"
    if [ -n "${CF_ACCESS_CLIENT_ID:-}" ] && [ -n "${CF_ACCESS_CLIENT_SECRET:-}" ]; then
      c=$(TIMEOUT=15 http_code -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" "$url")
      if [ "$c" = "200" ]; then ok "$url qua tunnel + Access service token"; else fail "$url trả HTTP $c (502/530: tunnel chưa nối tới typesense:8108; 403: service token sai)"; fi
    else
      c=$(TIMEOUT=15 http_code "$url")
      case "$c" in
        302 | 401 | 403) ok "$url có Access chặn khách lạ (HTTP $c). Đặt CF_ACCESS_CLIENT_ID/SECRET trong $ENV_FILE để test xuyên qua" ;;
        200) warn "$url mở công khai không có Cloudflare Access – nên bật Access (Service Auth)" ;;
        *) fail "$url trả HTTP $c (530/1033: tunnel chưa kết nối; 502: Public hostname phải trỏ http://typesense:8108)" ;;
      esac
    fi
  fi
}

summary() {
  echo
  if [ "$FAILS" -gt 0 ]; then
    printf "${R}%s lỗi${N}, %s cảnh báo\n" "$FAILS" "$WARNS"
    return 1
  fi
  printf "${G}Ổn${N}%s\n" "$([ "$WARNS" -gt 0 ] && echo ", $WARNS cảnh báo")"
}

wait_typesense() {
  printf "Chờ Typesense"
  for _ in $(seq 1 60); do
    [ "$(TIMEOUT=2 http_code http://localhost:8108/health)" = "200" ] && { echo " ✓"; return 0; }
    printf "."
    sleep 2
  done
  echo " ${R}quá 2 phút${N}"
  return 1
}

cmd="${1:-help}"
[ $# -gt 0 ] && shift
case "$cmd" in
  check)
    load_env; check_env; check_online; summary ;;
  start)
    load_env; check_env; check_online
    summary || { echo "Sửa các lỗi trên rồi chạy lại (hoặc FORCE=1 ./agent.sh start)."; [ "${FORCE:-}" = "1" ] || exit 1; }
    title "Khởi động"
    compose up -d --build || exit 1
    wait_typesense
    sleep 3
    test_services; summary ;;
  stop)
    compose down ;;
  restart)
    load_env
    if [ $# -gt 0 ]; then compose restart "$@"; else compose down && compose up -d --build; fi
    wait_typesense; sleep 3; test_services; summary ;;
  status)
    load_env; compose ps; test_services; summary ;;
  logs)
    compose logs -f --tail 100 "$@" ;;
  test)
    load_env; test_services; summary ;;
  scan)
    load_env; compose run --rm agent node dist/scan.js "$@" ;;
  typesense-setup)
    load_env; compose run --rm -e TYPESENSE_LOCAL_URL=http://typesense:8108 agent node dist/typesense-setup.js "$@" ;;
  update)
    compose pull typesense cloudflared && compose build --pull agent && compose up -d ;;
  help | -h | --help)
    sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//' ;;
  *)
    echo "Lệnh không hợp lệ: $cmd"; sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
