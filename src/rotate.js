/**
 * Đổi IP proxy khi IP dân cư đứng sau nó chết hoặc bị Microsoft chặn theo rủi ro.
 * Giữ nguyên logic của reader/rotate.py.
 */

import { execSync } from 'node:child_process';

export const DEAD_MARKERS = [
  'err_tunnel_connection_failed',
  'err_socks_connection_failed',
];

export const ROTATE_TRIES = 3;
export const CHECK_URL = 'https://api.ipify.org';
export const RISK_BLOCK_MARKERS = ['password sign-in isn', 'cần đổi ip sạch rồi thử lại'];

export function proxyDead(error) {
  const text = (error || '').toLowerCase();
  return DEAD_MARKERS.some((marker) => text.includes(marker));
}

export function riskBlocked(error) {
  const text = (error || '').toLowerCase();
  return RISK_BLOCK_MARKERS.some((marker) => text.includes(marker));
}

export function shouldRotate(error) {
  return proxyDead(error) || riskBlocked(error);
}

/**
 * Kiểm tra IP đầu ra qua proxy bằng curl hoặc HTTP.
 */
export function exitIp(proxyUrl, timeoutSec = 15) {
  if (!proxyUrl) {
    return null;
  }
  const cleanProxy = proxyUrl.toLowerCase();
  if (!cleanProxy.startsWith('http://') && !cleanProxy.startsWith('https://') && cleanProxy.includes('://')) {
    // SOCKS proxy không kiểm tra được trực tiếp bằng urllib/curl chuẩn -> trả về ""
    return '';
  }
  try {
    const cmd = `curl -s -m ${timeoutSec} -x "${proxyUrl}" "${CHECK_URL}"`;
    const res = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: (timeoutSec + 2) * 1000 });
    const ip = (res || '').trim();
    return ip || null;
  } catch (err) {
    return null;
  }
}

export class Rotator {
  constructor(command, proxyUrl) {
    this.command = (command || '').trim();
    this.proxyUrl = (proxyUrl || '').trim();
    this._rotatedAt = 0;
  }

  get enabled() {
    return Boolean(this.command && this.proxyUrl);
  }

  async rotate(failedAt) {
    if (!this.enabled) {
      return null;
    }
    if (this._rotatedAt > failedAt) {
      console.log('proxy: lượt khác vừa đổi IP, dùng luôn');
      return '';
    }

    for (let lan = 1; lan <= ROTATE_TRIES; lan++) {
      if (!this._runCommand()) {
        continue;
      }
      const ip = exitIp(this.proxyUrl);
      if (ip !== null) {
        this._rotatedAt = Date.now();
        console.log(`proxy: đã đổi IP (lần ${lan}) - đi ra bằng ${ip || '(không kiểm được với SOCKS)'}`);
        return ip;
      }
      console.warn(`proxy: đổi IP lần ${lan} xong nhưng vẫn không ra được Internet`);
    }

    console.error(`proxy: thử đổi IP ${ROTATE_TRIES} lần đều không được`);
    return null;
  }

  _runCommand() {
    console.log(`proxy: IP chết, chạy: ${this.command}`);
    try {
      execSync(this.command, {
        stdio: 'ignore',
        timeout: 90000,
      });
      return true;
    } catch (err) {
      console.error(`proxy: không chạy được lệnh đổi IP: ${err.message}`);
      return false;
    }
  }
}
