/**
 * Một lượt lấy mã: mở trình duyệt, đăng nhập Outlook, đọc mã gần nhất.
 * Giữ nguyên 100% quy trình và thứ tự trong vòng lặp của reader/fetch.py.
 */

import fs from 'node:fs';
import { chromium } from 'playwright';
import { launchPersistent } from './browser.js';
import {
  login,
  MailLoginBlocked,
  MAX_NOTICE_CLICKS,
  noticeButton,
  signOut,
} from './mailLogin.js';
import { inInbox, needsLogin, scanForCode } from './outlook.js';
import { clearStaleLock, explainLaunchError, profileFor } from './profile.js';
import { parseProxy } from './proxy.js';
import { shouldRotate } from './rotate.js';

export class Result {
  constructor(hit = null, error = null) {
    this.hit = hit;
    this.error = error;
  }
}

export class Cancelled extends Error {
  constructor(message = 'Người dùng bấm Dừng') {
    super(message);
    this.name = 'Cancelled';
  }
}

function _closed(exc) {
  const text = String(exc?.message || exc).toLowerCase();
  return (
    text.includes('closed') ||
    text.includes('target page') ||
    text.includes('browser has been closed')
  );
}

export async function snapshot(page, snap) {
  if (!snap) {
    return;
  }
  try {
    const buf = await page.screenshot({ type: 'jpeg', quality: 60, timeout: 5000 });
    snap(buf, page.url() || '');
  } catch (exc) {
    if (_closed(exc)) {
      throw exc;
    }
  }
}

async function _sleep(ms, stop) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (stop()) {
      throw new Cancelled();
    }
    const remaining = deadline - Date.now();
    const chunk = Math.min(500, Math.max(0, remaining));
    await new Promise((resolve) => setTimeout(resolve, chunk));
  }
}

export async function run({
  email,
  password,
  settings,
  report,
  shouldStop = null,
  signOutAfter = false,
  snap = null,
}) {
  const stop = shouldStop || (() => false);
  const lastStatus = { v: 'đang mở trình duyệt' };
  const rawReport = report;
  report = (status, detail = '') => {
    lastStatus.v = status;
    rawReport(status, detail);
  };

  const profileDir = profileFor(settings.profilesDir, email);
  fs.mkdirSync(profileDir, { recursive: true });
  clearStaleLock(profileDir);

  report('đang mở trình duyệt');

  let context = null;
  try {
    context = await launchPersistent(
      { chromium },
      {
        userDataDir: profileDir,
        channel: settings.browserChannel || null,
        headless: settings.headless,
        proxy: parseProxy(settings.proxyUrl),
      }
    );
  } catch (exc) {
    return new Result(null, explainLaunchError(exc, profileDir));
  }

  try {
    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    await page.goto(settings.inboxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const hit = await _watch(page, email, password, settings, report, stop, snap);
    if (signOutAfter) {
      report('đang đăng xuất');
      await signOut(page);
    }
    return new Result(hit);
  } catch (exc) {
    if (exc instanceof Cancelled) {
      return new Result(null, 'bạn đã dừng');
    }
    if (exc instanceof MailLoginBlocked) {
      return new Result(null, exc.message);
    }
    if (_closed(exc)) {
      return new Result(null, 'cửa sổ trình duyệt đã bị đóng');
    }
    console.error(`lượt lấy mã của ${email} đổ ở chặng '${lastStatus.v}':`, exc);
    return new Result(null, `lỗi: ${exc.message || exc}`);
  } finally {
    if (context) {
      try {
        await context.close();
      } catch {
        // bỏ qua
      }
    }
  }
}

async function _watch(page, email, password, settings, report, stop, snap) {
  let seen = {};
  const deadline = Date.now() + settings.timeoutSeconds * 1000;
  let lastReload = Date.now();
  let loginFailed = false;
  let waitingForHuman = false;
  let noticeClicks = 0;
  let loops = 0;

  while (Date.now() < deadline) {
    loops++;
    if (stop()) {
      throw new Cancelled();
    }
    if (page.isClosed()) {
      throw new MailLoginBlocked('cửa sổ trình duyệt đã bị đóng');
    }
    await snapshot(page, snap);

    if (await needsLogin(page)) {
      if (loginFailed) {
        if (!waitingForHuman) {
          report(
            'cần bạn đăng nhập',
            'agent không tự xử lý được, hãy làm trong cửa sổ vừa mở'
          );
          waitingForHuman = true;
        }
        await _sleep(3000, stop);
        continue;
      }
      if (!password) {
        loginFailed = true;
        waitingForHuman = true;
        report(
          'cần bạn đăng nhập',
          'không có mật khẩu - hãy đăng nhập Outlook trong cửa sổ vừa mở'
        );
        await _sleep(3000, stop);
        continue;
      }

      console.log(`hộp thư ${email}: cần đăng nhập, trang đang ở ${shortUrl(page)}`);
      await snapshot(page, snap);
      report('đang đăng nhập Outlook');
      try {
        await login(page, email, password, settings.loginTimeoutSeconds, stop);
      } catch (exc) {
        if (stop()) {
          throw new Cancelled();
        }
        if (shouldRotate(exc.message)) {
          console.warn(`hộp thư ${email}: ${exc.message} -> để tầng job đổi IP, chạy lại`);
          await snapshot(page, snap);
          throw exc;
        }
        loginFailed = true;
        console.warn(`hộp thư ${email}: ${exc.message}`);
        report('cần bạn đăng nhập', exc.message);
        await snapshot(page, snap);
        continue;
      }

      await page.goto(settings.inboxUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      seen = {};
      waitingForHuman = false;
      continue;
    }

    if (!(await inInbox(page))) {
      if (noticeClicks < MAX_NOTICE_CLICKS) {
        const button = await noticeButton(page);
        if (button !== null) {
          noticeClicks++;
          report('đang bấm qua màn hình thông báo');
          try {
            await button.click({ timeout: 15000 });
            await page.waitForTimeout(2000);
          } catch (exc) {
            if (_closed(exc)) {
              throw exc;
            }
          }
          continue;
        }
      }
      report('đang vào hộp thư');
      await _sleep(settings.pollSeconds * 1000, stop);
      continue;
    }

    report('đang đọc hộp thư');
    let hit = null;
    try {
      hit = await scanForCode(page, seen);
    } catch (exc) {
      if (_closed(exc)) {
        throw exc;
      }
      console.warn(`quét hộp thư không xong: ${exc.message}`);
      hit = null;
    }
    if (hit !== null) {
      return hit;
    }

    await _sleep(settings.pollSeconds * 1000, stop);

    if (Date.now() - lastReload >= settings.refreshSeconds * 1000) {
      lastReload = Date.now();
      console.log(`hộp thư ${email}: tải lại trang (lưới an toàn)`);
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      } catch (exc) {
        if (_closed(exc)) {
          throw exc;
        }
      }
    }
  }

  return null;
}
