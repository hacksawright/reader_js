/**
 * Giao diện Web & REST API của Reader (Express).
 * Giữ nguyên 100% đường dẫn API, mã phản hồi, định dạng JSON và logic bảo mật token của reader/server.py.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { Settings } from './config.js';
import { Jobs } from './jobs.js';
import { BadWebhook, checkWebhook } from './webhook.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const COOKIE = 'reader_token';
export const WEB_PAGE = path.join(__dirname, 'web.html');

/**
 * Tách `email|matkhau` -> [email, matkhau]. Cắt ở dấu `|` đầu tiên.
 */
export function splitAccount(email = '', password = '') {
  email = (email || '').trim();
  password = password || '';
  if (!password && email.includes('|')) {
    const idx = email.indexOf('|');
    password = email.slice(idx + 1).trim();
    email = email.slice(0, idx);
  }
  return [email.trim().toLowerCase(), password];
}

function _startJob(jobs, body) {
  const [email, password] = splitAccount(body.email, body.password);
  if (!email || !email.includes('@')) {
    const err = new Error('không thấy địa chỉ email hợp lệ - dán dạng email|matkhau');
    err.status = 400;
    throw err;
  }
  let webhook = '';
  try {
    webhook = checkWebhook(body.webhook || '');
  } catch (exc) {
    if (exc instanceof BadWebhook) {
      const err = new Error(exc.message);
      err.status = 400;
      throw err;
    }
    throw exc;
  }
  return jobs.start(
    email,
    password,
    Boolean(body.sign_out_after),
    webhook,
    (body.mail_to || '').trim()
  );
}

function _tokenFrom(req) {
  return (
    req.headers['x-reader-token'] ||
    (req.cookies && req.cookies[COOKIE]) ||
    req.query.token ||
    ''
  );
}

function safeCompare(a, b) {
  if (!a || !b) {
    return false;
  }
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createApp(settings = null) {
  settings = settings || Settings.fromEnv();
  const jobs = new Jobs(settings);
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // Lưu state vào app để test hoặc các module khác truy cập
  app.locals.settings = settings;
  app.locals.jobs = jobs;

  // Middleware bảo vệ token
  const guard = (req, res, next) => {
    if (!settings.token) {
      return next();
    }
    const token = _tokenFrom(req);
    if (!safeCompare(token, settings.token)) {
      return res.status(401).json({ detail: 'thiếu hoặc sai token' });
    }
    next();
  };

  // Trang chủ: dán tài khoản và lấy mã
  app.get('/', guard, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (settings.token && req.query.token) {
      res.cookie(COOKIE, settings.token, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 3600 * 1000,
      });
    }

    const htmlPath = fs.existsSync(WEB_PAGE)
      ? WEB_PAGE
      : path.join(__dirname, '..', 'reader', 'web.html');
    res.sendFile(htmlPath);
  });

  // Bắt đầu một lượt lấy mã (bất đồng bộ)
  app.post('/api/otp', guard, (req, res) => {
    try {
      const job = _startJob(jobs, req.body || {});
      return res.json(job.asDict());
    } catch (err) {
      return res.status(err.status || 500).json({ detail: err.message });
    }
  });

  // Lấy mã đồng bộ trong MỘT lần gọi (chờ sẵn rồi trả mã)
  app.post('/api/code', guard, async (req, res) => {
    let job;
    try {
      job = _startJob(jobs, req.body || {});
    } catch (err) {
      return res.status(err.status || 500).json({ detail: err.message });
    }

    const han = settings.timeoutSeconds + 15;
    const waitTime = req.body && req.body.wait ? Math.min(req.body.wait, han) : han;
    await jobs.wait(job.id, waitTime);

    const data = job.asDict();
    data.ok = Boolean(job.code);

    let status = 200;
    if (job.code) {
      status = 200;
    } else if (!job.done) {
      status = 408;
      data.error = data.error || `chờ quá ${waitTime}s mà chưa xong`;
    } else {
      status = job.blocked ? 409 : 408;
    }

    return res.status(status).json(data);
  });

  // Kiểm tra trạng thái lượt lấy mã
  app.get('/api/otp/:jobId', guard, (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ detail: 'không có lượt nào mang id đó' });
    }
    return res.json(job.asDict());
  });

  // Ảnh màn hình mới nhất của trình duyệt
  app.get('/api/otp/:jobId/screenshot', guard, (req, res) => {
    const shot = jobs.screenshot(req.params.jobId);
    if (!shot) {
      return res.status(404).json({ detail: 'chưa có ảnh nào' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type('image/jpeg').send(shot);
  });

  // Dừng lượt lấy mã
  app.post('/api/otp/:jobId/stop', guard, (req, res) => {
    if (!jobs.stop(req.params.jobId)) {
      return res.status(404).json({ detail: 'lượt đó không còn chạy' });
    }
    return res.json({ ok: true });
  });

  // Danh sách các lượt trong bộ nhớ
  app.get('/api/jobs', guard, (req, res) => {
    return res.json({ jobs: jobs.listing() });
  });

  return app;
}
