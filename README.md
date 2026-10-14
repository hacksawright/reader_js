# Reader (Node.js) - Tự động đăng nhập Outlook & Lấy mã OTP

Dự án tự động hoá mở trình duyệt, đăng nhập vào hòm thư Microsoft Outlook (Hotmail / Live / Office) và trích xuất mã xác minh (OTP) gần nhất từ hộp thư đến bằng **Playwright** và **Express.js**.

---

## 🚀 Tính năng chính

- 🤖 **Tự động đăng nhập Outlook**: Tự điền tài khoản & mật khẩu (`email|password`), tự bấm qua các màn hình thông báo, tự bấm xác nhận *"Stay signed in?"* (Duy trì đăng nhập).
- 🔍 **Trích xuất mã OTP thông minh**: Sử dụng thuật toán tính điểm ngữ cảnh trước/sau dãy số, tự động loại bỏ mã đơn hàng, số điện thoại, giá tiền, liên kết, ngày giờ.
- 💾 **Profile riêng biệt (`.profiles/`)**: Mỗi email được lưu session/cookie trong một thư mục profile riêng. Lần lấy mã tiếp theo không cần đăng nhập lại từ đầu.
- 📸 **Live Screenshot & UI**: Cung cấp giao diện Web trực quan, cho phép theo dõi tiến trình và xem ảnh chụp màn hình trình duyệt theo thời gian thực (hỗ trợ can thiệp thủ công nếu dính CAPTCHA hoặc 2FA).
- 🔗 **Tích hợp Webhook & Email (SMTP)**: Tự động bắn mã OTP về URL Webhook của bạn hoặc gửi qua hòm thư cá nhân ngay khi tìm thấy.
- 🛡️ **Hỗ trợ Proxy & Tự động đổi IP**: Hỗ trợ HTTP/SOCKS Proxy; có khả năng kích hoạt lệnh đổi IP (`READER_PROXY_ROTATE`) khi gặp lỗi mạng hoặc bị Microsoft chặn IP rủi ro.
- ⚡ **REST API đầy đủ**: Cung cấp API bất đồng bộ (`/api/otp`) và đồng bộ (`/api/code`), đi kèm file Postman Collection (`reader.postman_collection.json`).

---

## 🛠️ Yêu cầu hệ thống

- **Node.js**: Phiên bản 18 trở lên (Khuyến nghị Node.js 20+).
- **Trình duyệt**: Google Chrome hoặc Chromium cài qua Playwright.
- **Hệ điều hành**: Windows, Linux (Ubuntu/Debian...), macOS hoặc Docker.

---

## 📦 Cài đặt

1. **Cài đặt thư viện dependencies:**
   ```bash
   npm install
   ```

2. **Cài đặt trình duyệt Playwright (Chromium):**
   ```bash
   npx playwright install chromium
   ```
   *(Trên Linux/Server không có giao diện, có thể cài thêm thư viện hệ thống: `npx playwright install --with-deps chromium`)*

3. **Cấu hình file môi trường (`.env`):**
   Sao chép từ file mẫu:
   ```bash
   cp .env.example .env
   ```
   Chỉnh sửa `.env` theo nhu cầu:
   ```env
   READER_HOST=127.0.0.1
   READER_PORT=5678
   READER_TOKEN=your_token_here       # Để trống nếu không cần token
   READER_HEADLESS=false              # false: hiện trình duyệt (khuyến nghị trên desktop để giải CAPTCHA nếu có)
   READER_BROWSER_CHANNEL=            # Để trống để dùng Chromium, hoặc 'chrome' nếu dùng Google Chrome
   ```

---

## ▶️ Cách chạy ứng dụng

### 1. Chạy trên Windows (PowerShell / CMD)

- **Chạy trực tiếp (Production):**
  ```bash
  npm start
  ```
- **Chạy chế độ phát triển (Tự reload khi sửa file):**
  ```bash
  npm run dev
  ```
- **Kiểm tra trình duyệt có mở được không:**
  ```bash
  npm run check
  ```
- **Chạy toàn bộ unit test:**
  ```bash
  npm test
  ```

---

### 2. Chạy trên Linux / macOS / Git Bash (bằng Shell Script)

Dự án cung cấp sẵn hai script hỗ trợ quản lý tiến trình:

- **Thiết lập tự động lần đầu:**
  ```bash
  chmod +x setup-node.sh run-node.sh
  ./setup-node.sh
  ```
- **Khởi chạy ứng dụng:**
  ```bash
  ./run-node.sh              # Chạy trực tiếp (Ctrl+C để dừng)
  ./run-node.sh --daemon     # Chạy nền ngầm
  ./run-node.sh --status     # Kiểm tra trạng thái đang chạy
  ./run-node.sh --log        # Xem log thời gian thực
  ./run-node.sh --stop       # Dừng tiến trình ngầm
  ```

---

### 3. Chạy bằng Docker / Docker Compose

Đã cấu hình sẵn Dockerfile và Docker Compose:

```bash
docker compose up -d --build
```
Dữ liệu phiên đăng nhập sẽ được lưu bền vững tại thư mục `./.profiles`.

---

## 🌐 Hướng dẫn sử dụng

### 1. Giao diện Web (Web UI)

Mở trình duyệt truy cập:
```
http://localhost:5678/
```
*(Nếu có cấu hình `READER_TOKEN`, truy cập kèm token: `http://localhost:5678/?token=your_token_here`)*

- Nhập tài khoản theo định dạng: `email@outlook.com|matkhau`
- Bấm **Lấy mã OTP**.
- Giao diện sẽ hiển thị trạng thái từng bước (đang mở trình duyệt -> đang đăng nhập -> đang đọc hộp thư -> đã có mã) kèm ảnh chụp màn hình trình duyệt.

---

### 2. Sử dụng qua REST API

Nếu có thiết lập `READER_TOKEN`, bạn phải truyền token qua header `X-Reader-Token` hoặc query parameter `?token=...`.

#### A. Lấy mã đồng bộ (Chờ sẵn rồi trả mã ngay trong 1 request)
**`POST /api/code`**
```bash
curl -X POST http://localhost:5678/api/code \
  -H "Content-Type: application/json" \
  -H "X-Reader-Token: your_token_here" \
  -d '{
    "email": "example@outlook.com|Password123",
    "wait": 60
  }'
```
*Phản hồi mẫu:*
```json
{
  "id": "e4a21f8a790b",
  "email": "example@outlook.com",
  "ok": true,
  "code": "849201",
  "why": "ngữ cảnh trước",
  "where": "dòng xem trước",
  "subject": "Microsoft: 849201 is your security code",
  "elapsed": 12
}
```

#### B. Bắt đầu lấy mã bất đồng bộ
**`POST /api/otp`**
```bash
curl -X POST http://localhost:5678/api/otp \
  -H "Content-Type: application/json" \
  -H "X-Reader-Token: your_token_here" \
  -d '{
    "email": "example@outlook.com",
    "password": "Password123",
    "webhook": "https://your-domain.com/api/webhook"
  }'
```

#### C. Kiểm tra trạng thái lượt lấy mã
**`GET /api/otp/:jobId`**
```bash
curl http://localhost:5678/api/otp/<jobId> -H "X-Reader-Token: your_token_here"
```

#### D. Lấy ảnh chụp màn hình mới nhất
**`GET /api/otp/:jobId/screenshot`**
```bash
curl http://localhost:5678/api/otp/<jobId>/screenshot -H "X-Reader-Token: your_token_here" --output screen.jpg
```

#### E. Dừng lượt lấy mã
**`POST /api/otp/:jobId/stop`**
```bash
curl -X POST http://localhost:5678/api/otp/<jobId>/stop -H "X-Reader-Token: your_token_here"
```

---

## 🐛 Báo cáo kiểm tra lỗi & Các bản sửa lỗi

### 1. Sửa lỗi `ReferenceError: shortUrl is not defined`
- **Hiện tượng**: Khi tiến trình lấy mã chuyển sang bước đăng nhập tài khoản (`needsLogin`), hệ thống bị văng lỗi:
  ```
  ReferenceError: shortUrl is not defined
      at _watch (file:///.../src/fetch.js:184:30)
  ```
- **Nguyên nhân**: Trong [src/fetch.js](file:///d:/Documents/AI/TH%E1%BB%B0C%20T%E1%BA%ACP/HongKong/reader_js/src/fetch.js) dòng 184 có gọi hàm `shortUrl(page)` để ghi log URL trang hiện tại, nhưng tại dòng 16 chỉ import `{ inInbox, needsLogin, scanForCode }` từ `./outlook.js` mà quên chưa import `shortUrl`.
- **Đã khắc phục**:
  - Cập nhật dòng 16 trong [src/fetch.js](file:///d:/Documents/AI/TH%E1%BB%B0C%20T%E1%BA%ACP/HongKong/reader_js/src/fetch.js):
    ```javascript
    import { inInbox, needsLogin, scanForCode, shortUrl } from './outlook.js';
    ```
  - Bổ sung unit test tại [test/fetch.test.js](file:///d:/Documents/AI/TH%E1%BB%B0C%20T%E1%BA%ACP/HongKong/reader_js/test/fetch.test.js). Toàn bộ 45 bài test trong hệ thống đã vượt qua (PASS 100%).

### 2. Sửa đường dẫn mount volume trong `docker-compose.yml`
- Sửa mapping volume từ `./profiles:/app/.profiles` thành `./.profiles:/app/.profiles` để đồng bộ đúng với thư mục `.profiles` mặc định được cấu hình trong source code và `.gitignore`.

---

## 💡 Lưu ý quan trọng khi chạy

1. **Xác thực 2 bước (2FA) và CAPTCHA**:
   - Nếu tài khoản Outlook yêu cầu mã 2FA gửi về số điện thoại hoặc giải đố CAPTCHA hình ảnh, hệ thống tự động nhận diện và dừng ở trạng thái `cần bạn đăng nhập`.
   - Để xử lý, hãy đặt `READER_HEADLESS=false` trên máy có màn hình để cửa sổ trình duyệt hiện ra, người dùng có thể thao tác giải quyết trực tiếp trên trình duyệt.
2. **Kẹt SingletonLock của Chromium**:
   - Nếu tiến trình bị tắt đột ngột do mất điện hay `kill -9`, file `SingletonLock` trong thư mục `.profiles/<email>` có thể còn tồn tại. Module `profile.js` đã có cơ chế tự động dọn stale lock này ở lần chạy kế tiếp.
