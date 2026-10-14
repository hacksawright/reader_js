/**
 * Cấu hình: đọc từ biến môi trường và .env ở gốc dự án.
 * Giữ nguyên 100% logic và quy tắc của reader/config.py.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, '..');
export const ENV_FILE = path.join(ROOT, '.env');

/**
 * Nạp `KEY=value` từ file vào `process.env`.
 * Trả về false nếu không tìm thấy file.
 * Biến đã có trong môi trường thì giữ nguyên.
 * Nhận cả `export KEY=...`, giá trị bọc trong dấu ngoặc kép/đơn,
 * và chú thích cuối dòng (` # ...`) khi giá trị không nằm trong ngoặc.
 */
export function loadEnvFile(envPath = ENV_FILE) {
  try {
    const text = fs.readFileSync(envPath, 'utf-8');
    for (let line of text.split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      if (line.startsWith('export ')) {
        line = line.slice(7).trim();
      }
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) {
        continue;
      }
      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1).trim();

      if (
        value.length >= 2 &&
        (value.startsWith('"') && value.endsWith('"') ||
         value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      } else {
        // `KEY=gia-tri   # chú thích`: dấu # chỉ mở chú thích khi đứng sau khoảng trắng
        const match = value.match(/\s+#/);
        if (match && !value.startsWith('#')) {
          value = value.slice(0, match.index).trim();
        } else if (value.startsWith('#')) {
          value = '';
        }
      }

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

export function hasDisplay() {
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
    return true;
  }
  if (process.platform === 'win32' && !process.env.CI) {
    return true;
  }
  return false;
}

function _flag(name, defaultVal) {
  const raw = process.env[name];
  if (raw === undefined || raw === null) {
    return defaultVal;
  }
  return ['1', 'true', 'yes', 'có', 'co'].includes(raw.trim().toLowerCase());
}

function _int(name, defaultVal) {
  const raw = (process.env[name] || '').trim();
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

export class Settings {
  constructor(options = {}) {
    this.profilesDir = options.profilesDir || path.join(ROOT, '.profiles');
    this.inboxUrl = options.inboxUrl || 'https://outlook.live.com/mail/0/';
    this.headless = options.headless !== undefined ? options.headless : !hasDisplay();
    this.token = options.token || '';
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 5678;
    this.browserChannel = options.browserChannel !== undefined
      ? options.browserChannel
      : (hasDisplay() ? 'chrome' : '');
    this.proxyUrl = options.proxyUrl || '';
    this.proxyRotateCmd = options.proxyRotateCmd || '';
    this.webhookUrl = options.webhookUrl || '';
    this.webhookSecret = options.webhookSecret || '';
    this.smtpHost = options.smtpHost || '';
    this.smtpPort = options.smtpPort || 587;
    this.smtpUser = options.smtpUser || '';
    this.smtpPassword = options.smtpPassword || '';
    this.mailFrom = options.mailFrom || '';
    this.mailTo = options.mailTo || '';
    this.pollSeconds = options.pollSeconds || 5;
    this.refreshSeconds = options.refreshSeconds || 120;
    this.timeoutSeconds = options.timeoutSeconds || 180;
    this.loginTimeoutSeconds = options.loginTimeoutSeconds || 90;
  }

  get mailbox() {
    const sender = this.mailFrom || this.smtpUser;
    return {
      host: this.smtpHost,
      port: this.smtpPort,
      user: this.smtpUser,
      password: this.smtpPassword,
      sender,
      to: this.mailTo,
      ssl: this.smtpPort === 465,
      ready: Boolean(this.smtpHost && this.mailTo && (this.mailFrom || this.smtpUser)),
      fromAddr: sender,
    };
  }

  static fromEnv() {
    return new Settings({
      profilesDir: process.env.READER_PROFILES
        ? path.resolve(process.env.READER_PROFILES)
        : path.join(ROOT, '.profiles'),
      inboxUrl: process.env.READER_INBOX_URL || 'https://outlook.live.com/mail/0/',
      headless: _flag('READER_HEADLESS', !hasDisplay()),
      token: (process.env.READER_TOKEN || '').trim(),
      host: (process.env.READER_HOST || '').trim() || '127.0.0.1',
      port: _int('READER_PORT', 5678),
      proxyUrl: (process.env.READER_PROXY || '').trim(),
      proxyRotateCmd: (process.env.READER_PROXY_ROTATE || '').trim(),
      webhookUrl: (process.env.READER_WEBHOOK || '').trim(),
      webhookSecret: (process.env.READER_WEBHOOK_SECRET || '').trim(),
      smtpHost: (process.env.READER_SMTP_HOST || '').trim(),
      smtpPort: _int('READER_SMTP_PORT', 587),
      smtpUser: (process.env.READER_SMTP_USER || '').trim(),
      smtpPassword: process.env.READER_SMTP_PASSWORD || '',
      mailFrom: (process.env.READER_MAIL_FROM || '').trim(),
      mailTo: (process.env.READER_MAIL_TO || '').trim(),
      browserChannel: process.env.READER_BROWSER_CHANNEL !== undefined
        ? process.env.READER_BROWSER_CHANNEL.trim()
        : (hasDisplay() ? 'chrome' : ''),
      pollSeconds: _int('READER_POLL_SECONDS', 5),
      refreshSeconds: _int('READER_REFRESH_SECONDS', 120),
      timeoutSeconds: _int('READER_TIMEOUT_SECONDS', 180),
      loginTimeoutSeconds: _int('READER_LOGIN_TIMEOUT_SECONDS', 90),
    });
  }
}
