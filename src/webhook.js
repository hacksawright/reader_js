/**
 * Bắn mã về URL Webhook do người dùng khai.
 * Giữ nguyên logic của reader/webhook.py.
 */

export const ALLOWED_SCHEMES = ['http:', 'https:'];
export const TIMEOUT_MS = 10000;

export class BadWebhook extends Error {
  constructor(message) {
    super(message);
    this.name = 'BadWebhook';
  }
}

export function checkWebhook(rawUrl) {
  const url = (rawUrl || '').trim();
  if (!url) {
    return '';
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadWebhook(`webhook phải là http(s)://..., không nhận ${url.slice(0, 60)}`);
  }
  if (!ALLOWED_SCHEMES.includes(parsed.protocol) || !parsed.hostname) {
    throw new BadWebhook(`webhook phải là http(s)://..., không nhận ${url.slice(0, 60)}`);
  }
  return url;
}

function _shortUrl(url) {
  try {
    const p = new URL(url);
    return `${p.protocol}//${p.host}${p.pathname}`;
  } catch {
    return url;
  }
}

export async function sendWebhook(url, payload, secret = '') {
  if (!url) {
    return false;
  }
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (secret) {
    headers['X-Reader-Secret'] = secret;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const ok = res.status >= 200 && res.status < 300;
    if (ok) {
      console.log(`đã gửi mã về webhook ${_shortUrl(url)}`);
    } else {
      console.warn(`webhook ${_shortUrl(url)} trả ${res.status}`);
    }
    return ok;
  } catch (err) {
    clearTimeout(timer);
    console.warn(`không gửi được webhook ${_shortUrl(url)}: ${err.message}`);
    return false;
  }
}
