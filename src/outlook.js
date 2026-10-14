/**
 * Đọc trang Outlook web: nhận ra trạng thái trang và quét mã OTP trong hộp thư.
 * Giữ nguyên logic của reader/outlook.py.
 */

import { extractCode } from './otpExtract.js';

export const SIGNED_OUT_URLS = [
  'microsoft.com/en-us/microsoft-365',
  'microsoft.com/vi-vn/microsoft-365',
  'go.microsoft.com',
];

export const LOGIN_MARKERS = [
  "input[name='loginfmt']",
  "input[name='passwd']",
  '#idSIButton9',
  "form[name='f1']",
];

export const MAILBOX_MARKERS = [
  "div[role='listbox']",
  "div[aria-label*='essage list' i]",
  "[data-app-section='MessageList']",
  "div[aria-label*='hộp thư' i]",
  "[aria-label*='Inbox' i]",
];

export const MESSAGE_ROWS = [
  "div[role='listbox'] div[role='option']",
  "div[aria-label='Message list'] div[role='option']",
  'div[data-convid]',
];

export const READING_PANE = [
  "div[role='main'] div[aria-label*='essage body' i]",
  "div[role='document']",
  'div#ReadingPaneContainerId',
];

export const OTP_HINTS = [
  'verification', 'verify', 'code', 'passcode', 'otp', 'security',
  'xác minh', 'xác thực', 'mã', 'bảo mật',
];

export const MAX_ATTEMPTS = 3;

export const ERROR_URL_MARKERS = ['chrome-error', 'chromewebdata', 'about:blank'];

export class Hit {
  constructor(code, why, where, preview) {
    this.code = code;
    this.why = why;
    this.where = where;
    this.preview = preview;
  }
}

export function shortUrl(page) {
  const rawUrl = page.url() || '';
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.host}${parsed.pathname}`.slice(0, 120) || '(trống)';
  } catch {
    return rawUrl.slice(0, 120) || '(trống)';
  }
}

export async function isLoginPage(page) {
  const url = page.url() || '';
  if (url.includes('login.live.com') || url.includes('login.microsoftonline')) {
    return true;
  }
  for (const selector of LOGIN_MARKERS) {
    try {
      if (await page.locator(selector).first().isVisible({ timeout: 500 })) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

export function onSignedOutPage(page) {
  const url = (page.url() || '').toLowerCase();
  return SIGNED_OUT_URLS.some((part) => url.includes(part));
}

export function isErrorPage(page) {
  const url = (page.url() || '').trim().toLowerCase();
  if (!url) {
    return true;
  }
  return ERROR_URL_MARKERS.some((mark) => url.includes(mark));
}

export async function needsLogin(page) {
  return (await isLoginPage(page)) || onSignedOutPage(page);
}

export async function inInbox(page) {
  if (await needsLogin(page)) {
    return false;
  }
  for (const selector of MAILBOX_MARKERS) {
    try {
      if (await page.locator(selector).first().isVisible({ timeout: 500 })) {
        return true;
      }
    } catch {
      continue;
    }
  }
  const url = (page.url() || '').toLowerCase();
  return url.includes('/mail') && url.includes('outlook.');
}

export async function messageRows(page) {
  for (const selector of MESSAGE_ROWS) {
    try {
      const locator = page.locator(selector);
      const count = await locator.count();
      if (count > 0) {
        const rows = [];
        for (let i = 0; i < count; i++) {
          rows.push(locator.nth(i));
        }
        return rows;
      }
    } catch {
      continue;
    }
  }
  return [];
}

export async function readingPaneText(page) {
  for (const selector of READING_PANE) {
    try {
      const locator = page.locator(selector).first();
      const count = await locator.count();
      if (count && (await locator.isVisible({ timeout: 1000 }))) {
        const text = await locator.innerText({ timeout: 2000 });
        if (text) return text;
      }
    } catch {
      continue;
    }
  }
  try {
    return (await page.innerText('body', { timeout: 2000 })) || '';
  } catch {
    return '';
  }
}

export function looksLikeOtpMail(text) {
  const lowered = (text || '').toLowerCase();
  return OTP_HINTS.some((hint) => lowered.includes(hint));
}

export function firstLine(text) {
  for (const line of (text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed.slice(0, 120);
    }
  }
  return '';
}

export async function scanForCode(page, seen, maxRows = 8) {
  const rows = await messageRows(page);
  const scanned = Math.min(rows.length, maxRows);
  let candidates = 0;

  for (let index = 0; index < scanned; index++) {
    const row = rows[index];
    let preview = '';
    try {
      preview = ((await row.innerText({ timeout: 1000 })) || '').trim();
    } catch {
      continue;
    }
    if (!preview || (seen[preview] || 0) >= MAX_ATTEMPTS) {
      continue;
    }
    if (!looksLikeOtpMail(preview)) {
      seen[preview] = MAX_ATTEMPTS;
      continue;
    }
    candidates++;
    seen[preview] = (seen[preview] || 0) + 1;

    // Mã thường nằm trong dòng xem trước; thử trước khi mở mail
    const foundInPreview = extractCode(preview);
    if (foundInPreview) {
      seen[preview] = MAX_ATTEMPTS;
      console.log(`tìm thấy mã trong danh sách (${foundInPreview.why})`);
      return new Hit(foundInPreview.code, foundInPreview.why, 'dòng xem trước', firstLine(preview));
    }

    try {
      await row.click({ timeout: 3000 });
    } catch {
      continue;
    }

    const paneText = await readingPaneText(page);
    const foundInPane = extractCode(paneText);
    if (foundInPane) {
      seen[preview] = MAX_ATTEMPTS;
      console.log(`tìm thấy mã trong nội dung mail (${foundInPane.why})`);
      return new Hit(foundInPane.code, foundInPane.why, 'nội dung mail', firstLine(preview));
    }
  }

  return null;
}
