#!/usr/bin/env node
/**
 * Điểm khởi chạy của Reader: `npm start` hoặc `node src/index.js`
 * Giữ nguyên 100% tham số dòng lệnh và luồng khởi động của reader/__main__.py.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchPersistent } from './browser.js';
import { ENV_FILE, hasDisplay, loadEnvFile, Settings } from './config.js';
import { clearStaleLock } from './profile.js';
import { describeProxy, parseProxy } from './proxy.js';
import { createApp } from './server.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    host: null,
    port: null,
    token: null,
    check: false,
    headless: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--host') {
      parsed.host = args[++i];
    } else if (arg.startsWith('--host=')) {
      parsed.host = arg.slice(7);
    } else if (arg === '--port') {
      parsed.port = parseInt(args[++i], 10);
    } else if (arg.startsWith('--port=')) {
      parsed.port = parseInt(arg.slice(7), 10);
    } else if (arg === '--token') {
      parsed.token = args[++i];
    } else if (arg.startsWith('--token=')) {
      parsed.token = arg.slice(8);
    } else if (arg === '--check') {
      parsed.check = true;
    } else if (arg === '--headless') {
      parsed.headless = true;
    } else if (arg === '--verbose' || arg === '-v') {
      parsed.verbose = true;
    }
  }
  return parsed;
}

async function checkBrowser(settings) {
  const kenh = settings.browserChannel || '(Chromium của Playwright)';
  let proxy = null;
  try {
    proxy = parseProxy(settings.proxyUrl);
  } catch (exc) {
    console.error(`READER_PROXY sai: ${exc.message}`);
    return false;
  }

  console.log(`kênh trình duyệt: ${kenh}\nheadless: ${settings.headless}\n${describeProxy(proxy)}`);

  const profile = path.join(settings.profilesDir, '.thu-trinh-duyet');
  fs.mkdirSync(profile, { recursive: true });
  clearStaleLock(profile);

  try {
    const context = await launchPersistent(
      { chromium },
      {
        userDataDir: profile,
        channel: settings.browserChannel || null,
        headless: settings.headless,
        proxy,
      }
    );
    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    await page.goto(settings.inboxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log(`mở được, đang ở: ${(page.url() || '').slice(0, 90)}`);
    await context.close();
    return true;
  } catch (exc) {
    const loi = String(exc.message || exc);
    console.error(`KHÔNG mở được trình duyệt:\n${loi.slice(0, 600)}`);
    const thap = loi.toLowerCase();
    if (
      thap.includes('channel') ||
      thap.includes('not found') ||
      thap.includes('executable doesn') ||
      thap.includes('install')
    ) {
      console.log(
        '\n-> Thiếu trình duyệt. Server thường không có Google Chrome:\n' +
        '   chạy với READER_BROWSER_CHANNEL= (để trống) để dùng Chromium\n' +
        '   của Playwright, và cài nó bằng:\n' +
        '   npx playwright install --with-deps chromium'
      );
    } else if (
      thap.includes('shared librar') ||
      thap.includes('error while loading') ||
      thap.includes('libn')
    ) {
      console.log(
        '\n-> Thiếu thư viện hệ thống cho Chromium:\n' +
        '   npx playwright install --with-deps chromium'
      );
    } else if (thap.includes('err_proxy') || thap.includes('err_tunnel')) {
      console.log(
        '\n-> Trình duyệt mở được nhưng không đi qua được proxy:\n' +
        '   kiểm tra READER_PROXY trong .env'
      );
    } else if (!settings.headless) {
      console.log(
        '\n-> Máy không có màn hình thì phải chạy headless:\n' +
        '   thêm --headless, hoặc READER_HEADLESS=true'
      );
    }
    return false;
  }
}

async function main() {
  const loadedEnv = loadEnvFile();
  let settings = Settings.fromEnv();
  const cliArgs = parseArgs();

  const host = cliArgs.host || settings.host;
  const port = cliArgs.port || settings.port;

  if (cliArgs.headless) {
    settings = new Settings({ ...settings, headless: true });
  }
  if (cliArgs.token !== null) {
    settings = new Settings({ ...settings, token: cliArgs.token.trim() });
  }

  if (loadedEnv) {
    console.log(`đọc cấu hình từ ${ENV_FILE}`);
  }

  console.log(
    `nhịp chạy: poll ${settings.pollSeconds}s, tải lại ${settings.refreshSeconds}s, ` +
    `hạn mỗi lượt ${settings.timeoutSeconds}s, hạn đăng nhập ${settings.loginTimeoutSeconds}s; ` +
    `headless=${settings.headless}`
  );

  if (settings.proxyRotateCmd && settings.proxyUrl) {
    console.log(`IP proxy chết thì tự đổi bằng: ${settings.proxyRotateCmd}`);
  } else if (settings.proxyRotateCmd) {
    console.warn('có READER_PROXY_ROTATE mà không có READER_PROXY - không đổi IP được');
  }

  if (settings.headless && !hasDisplay()) {
    console.log(
      'máy không có màn hình nên chạy headless - gặp 2FA hay CAPTCHA là tắc, không có cửa sổ nào cho người xử lý'
    );
  }

  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !settings.token) {
    console.warn(
      `đang nghe trên ${host} mà KHÔNG có READER_TOKEN: ai dò trúng cổng cũng dán được tài khoản và đọc được mã. ` +
      'Đặt READER_TOKEN=... rồi mở trang bằng ?token=...'
    );
  }

  if (cliArgs.check) {
    const ok = await checkBrowser(settings);
    process.exit(ok ? 0 : 1);
  }

  let diachi = `http://${host}:${port}/`;
  if (settings.token) {
    diachi += `?token=${settings.token}`;
  }
  console.log(`Mở ${diachi}`);

  const app = createApp(settings);
  app.listen(port, host, () => {
    // Sẵn sàng nhận kết nối
  });
}

main().catch((err) => {
  console.error('Lỗi khởi động:', err);
  process.exit(1);
});
