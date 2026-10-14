#!/usr/bin/env bash
# Cài đặt môi trường cho reader bản Node.js.
#
#   ./setup-node.sh             cài đặt đầy đủ, tạo .env nếu thiếu và kiểm tra trình duyệt
#   ./setup-node.sh --check     chỉ kiểm tra trình duyệt, không cài đặt gì
#
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
DIR="$(pwd)"

ENV_FILE="$DIR/.env"

echo "== [1/3] Kiểm tra Node.js và cài đặt thư viện =="
if ! command -v node >/dev/null 2>&1; then
    echo "LỖI: Máy chưa cài Node.js (cần Node >= 18). Hãy cài Node.js trước." >&2
    exit 1
fi
echo "Node.js: $(node -v), npm: $(npm -v)"

if [ "${1:-}" != "--check" ]; then
    npm install
    echo "Cài đặt trình duyệt Playwright Chromium..."
    npx playwright install --with-deps chromium || npx playwright install chromium
fi

echo "== [2/3] Kiểm tra file cấu hình .env =="
if [ ! -f "$ENV_FILE" ]; then
    TOKEN=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))" 2>/dev/null || openssl rand -hex 16 2>/dev/null || echo "reader_secret_token")
    cat <<EOF > "$ENV_FILE"
# Cấu hình reader (Node.js)
READER_HOST=0.0.0.0
READER_PORT=5678
READER_TOKEN=${TOKEN}
READER_HEADLESS=true
READER_BROWSER_CHANNEL=
EOF
    chmod 600 "$ENV_FILE" 2>/dev/null || true
    echo "Đã tự động tạo file .env với READER_TOKEN ngẫu nhiên (mode 600)."
else
    echo "File .env đã tồn tại, giữ nguyên."
fi

echo "== [3/3] Kiểm tra mở trình duyệt =="
npm run check || {
    echo "Cảnh báo: Kiểm tra trình duyệt chưa hoàn tất hoặc cần chạy headless."
}

echo
echo "Cài đặt thành công! Chạy ứng dụng bằng:"
echo "  ./run-node.sh          (chạy trực tiếp)"
echo "  ./run-node.sh --daemon (chạy nền)"
