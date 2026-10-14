/**
 * Quản lý các lượt lấy mã đang chạy (Jobs).
 * Giữ nguyên logic điều phối, cơ chế chờ, gọi webhook và gửi mail của reader/jobs.py.
 */

import crypto from 'node:crypto';
import { run } from './fetch.js';
import { sendMail } from './mailer.js';
import { proxyDead, Rotator, shouldRotate } from './rotate.js';
import { sendWebhook } from './webhook.js';

export const KEEP_SECONDS = 30 * 60;

export class Job {
  constructor({ id, email, webhook = '', mailTo = '' }) {
    this.id = id;
    this.email = email;
    this.status = 'đang chờ';
    this.detail = '';
    this.code = null;
    this.why = '';
    this.where = '';
    this.subject = '';
    this.error = null;
    this.blocked = '';
    this.webhook = webhook;
    this.mailTo = mailTo;
    this.shot = null;
    this.shotAt = null;
    this.pageUrl = '';
    this.startedAt = Date.now() / 1000;
    this.finishedAt = null;

    this._stop = false;
    this._doneResolvers = [];
  }

  get done() {
    return this.finishedAt !== null;
  }

  requestStop() {
    this._stop = true;
  }

  isStopped() {
    return this._stop;
  }

  markDone() {
    for (const resolve of this._doneResolvers) {
      resolve(this);
    }
    this._doneResolvers = [];
  }

  async waitDone(timeoutSec) {
    if (this.done) {
      return this;
    }
    return new Promise((resolve) => {
      let timer = null;
      const onDone = () => {
        if (timer) clearTimeout(timer);
        resolve(this);
      };
      if (timeoutSec > 0) {
        timer = setTimeout(() => {
          const idx = this._doneResolvers.indexOf(onDone);
          if (idx !== -1) {
            this._doneResolvers.splice(idx, 1);
          }
          resolve(this);
        }, timeoutSec * 1000);
      }
      this._doneResolvers.push(onDone);
    });
  }

  asDict() {
    const nowSec = Date.now() / 1000;
    const elapsed = Math.round((this.finishedAt || nowSec) - this.startedAt);
    return {
      id: this.id,
      email: this.email,
      status: this.status,
      detail: this.detail,
      code: this.code,
      why: this.why,
      where: this.where,
      subject: this.subject,
      error: this.error,
      blocked: this.blocked,
      done: this.done,
      shot_at: this.shotAt,
      page_url: this.pageUrl,
      elapsed,
    };
  }
}

export class Jobs {
  constructor(settings) {
    this.settings = settings;
    this.rotator = new Rotator(settings.proxyRotateCmd, settings.proxyUrl);
    this._jobs = new Map();
  }

  start(email, password, signOutAfter = false, webhook = '', mailTo = '') {
    this._sweep();
    for (const job of this._jobs.values()) {
      if (job.email === email && !job.done) {
        return job;
      }
    }

    const id = crypto.randomBytes(6).toString('hex');
    const job = new Job({
      id,
      email,
      webhook: webhook || this.settings.webhookUrl,
      mailTo: mailTo || this.settings.mailTo,
    });
    this._jobs.set(id, job);

    // Chạy bất đồng bộ trong background
    this._work(job, password, signOutAfter);

    return job;
  }

  async wait(jobId, timeoutSec) {
    const job = this.get(jobId);
    if (!job) {
      return null;
    }
    return await job.waitDone(timeoutSec);
  }

  get(jobId) {
    return this._jobs.get(jobId) || null;
  }

  stop(jobId) {
    const job = this.get(jobId);
    if (!job || job.done) {
      return false;
    }
    job.requestStop();
    return true;
  }

  screenshot(jobId) {
    const job = this.get(jobId);
    return job ? job.shot : null;
  }

  listing() {
    const jobs = Array.from(this._jobs.values()).sort(
      (a, b) => b.startedAt - a.startedAt
    );
    return jobs.map((j) => j.asDict());
  }

  async _work(job, password, signOutAfter) {
    const t0 = Date.now();
    let stage = { name: null, since: t0 };

    const report = (status, detail = '') => {
      const now = Date.now();
      job.status = status;
      job.detail = detail;
      if (status === 'cần bạn đăng nhập') {
        job.blocked = detail || status;
      }
      let prev = '';
      if (stage.name !== null && status !== stage.name) {
        prev = ` | chặng '${stage.name}' ${((now - stage.since) / 1000).toFixed(1)}s`;
      }
      if (status !== stage.name) {
        stage.name = status;
        stage.since = now;
      }
      console.log(
        `[${job.email}] ${status} ${detail} | +${((now - t0) / 1000).toFixed(1)}s${prev}`
      );
    };

    const snap = (anh, url) => {
      job.shot = anh;
      job.shotAt = Date.now() / 1000;
      job.pageUrl = url;
    };

    const attempt = async () => {
      try {
        return await run({
          email: job.email,
          password,
          settings: this.settings,
          report,
          shouldStop: () => job.isStopped(),
          signOutAfter,
          snap,
        });
      } catch (exc) {
        console.error(`lượt ${job.id} đổ:`, exc);
        return { hit: null, error: `lỗi: ${exc.message || exc}` };
      }
    };

    let result = await attempt();

    if (
      shouldRotate(result.error) &&
      this.rotator.enabled &&
      !job.isStopped()
    ) {
      const failedAt = Date.now();
      const lyDo = proxyDead(result.error)
        ? 'IP dân cư cũ đã offline'
        : 'IP lỗi/bị chặn khi đăng nhập';
      report('đang đổi IP proxy', lyDo);
      const ip = await this.rotator.rotate(failedAt);
      if (ip === null) {
        result.error = `${result.error}\n-> đã thử đổi IP proxy nhưng không được, xem log của reader`;
      } else {
        report('đã đổi IP proxy', ip ? `đi ra bằng ${ip}` : '');
        result = await attempt();
      }
    }

    this._finish(job, result);
  }

  _finish(job, result) {
    this._writeResult(job, result);

    const elapsed = ((job.finishedAt || Date.now() / 1000) - job.startedAt).toFixed(1);
    if (job.code) {
      console.log(`[${job.email}] XONG sau ${elapsed}s: có mã (${job.where || '?'})`);
    } else {
      console.warn(`[${job.email}] XONG sau ${elapsed}s: ${job.status} - ${job.error || ''}`);
    }

    job.markDone();
    this._callWebhook(job);
    this._sendMail(job);
  }

  _writeResult(job, result) {
    job.finishedAt = Date.now() / 1000;
    if (result.hit) {
      job.code = result.hit.code;
      job.why = result.hit.why;
      job.where = result.hit.where;
      job.subject = result.hit.preview;
      job.status = 'đã có mã';
      job.detail = '';
    } else if (result.error) {
      job.status = 'không lấy được';
      job.error = result.error;
      job.detail = result.error;
    } else if (job.blocked) {
      job.status = 'cần bạn đăng nhập';
      job.error = job.blocked;
      job.detail = job.blocked;
    } else {
      job.status = 'không lấy được';
      job.error = `hết ${this.settings.timeoutSeconds}s mà không thấy mã nào trong hộp thư`;
      job.detail = job.error;
    }
  }

  async _callWebhook(job) {
    if (!job.webhook || !job.code) {
      return;
    }
    await sendWebhook(
      job.webhook,
      {
        ok: true,
        code: job.code,
        email: job.email,
        subject: job.subject,
        where: job.where,
        why: job.why,
        job_id: job.id,
        at: job.finishedAt,
      },
      this.settings.webhookSecret
    );
  }

  async _sendMail(job) {
    if (!job.code || !job.mailTo) {
      return;
    }
    const box = this.settings.mailbox;
    if (!box.ready) {
      return;
    }
    await sendMail(box, job.code, job.email, job.subject, job.mailTo);
  }

  _sweep() {
    const cutoff = Date.now() / 1000 - KEEP_SECONDS;
    for (const [id, job] of this._jobs.entries()) {
      if (job.finishedAt !== null && job.finishedAt < cutoff) {
        this._jobs.delete(id);
      }
    }
  }
}
