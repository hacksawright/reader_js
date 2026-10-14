/**
 * Quản lý thư mục profile và dọn dẹp SingletonLock của Chromium.
 * Giữ nguyên logic của reader/profile.py.
 */

import fs from 'node:fs';
import path from 'node:path';

export const LOCK_NAMES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

/**
 * Thư mục profile riêng cho một hộp thư.
 * Ký tự không thuộc [a-z0-9._-] đổi thành _.
 */
export function profileFor(base, email) {
  const safe = (email || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_');
  return path.join(base, safe || 'mac-dinh');
}

function _ownerPid(lockPath) {
  try {
    const target = fs.readlinkSync(lockPath);
    const lastDash = target.lastIndexOf('-');
    if (lastDash === -1) {
      return null;
    }
    const pidStr = target.slice(lastDash + 1);
    const pid = parseInt(pidStr, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function _alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') {
      return false; // Tiến trình không tồn tại
    }
    if (err.code === 'EPERM') {
      return true; // Tồn tại nhưng không có quyền gửi signal
    }
    return true;
  }
}

/**
 * Pid đang giữ profile, hoặc null nếu rảnh / khoá là rác.
 */
export function lockedBy(profileDir) {
  const lock = path.join(profileDir, 'SingletonLock');
  try {
    const stat = fs.lstatSync(lock);
    if (!stat.isSymbolicLink() && !fs.existsSync(lock)) {
      return null;
    }
  } catch {
    return null;
  }
  const pid = _ownerPid(lock);
  return pid && _alive(pid) ? pid : null;
}

/**
 * Xoá khoá của tiến trình đã chết. True nếu có dọn gì đó.
 */
export function clearStaleLock(profileDir) {
  if (!fs.existsSync(profileDir)) {
    return false;
  }
  if (lockedBy(profileDir) !== null) {
    return false;
  }

  let cleaned = false;
  for (const name of LOCK_NAMES) {
    const itemPath = path.join(profileDir, name);
    try {
      const stat = fs.lstatSync(itemPath);
      if (stat.isSymbolicLink() || fs.existsSync(itemPath)) {
        fs.unlinkSync(itemPath);
        cleaned = true;
      }
    } catch {
      // Bỏ qua lỗi nếu không có file
    }
  }
  return cleaned;
}

/**
 * Biến lỗi khởi động khó hiểu thành câu người đọc được.
 */
export function explainLaunchError(err, profileDir) {
  const text = String(err?.message || err);
  const dirName = path.basename(profileDir);
  if (text.includes('ProcessSingleton') || text.includes('SingletonLock')) {
    const pid = lockedBy(profileDir);
    if (pid) {
      return (
        `profile ${dirName} đang được một Chromium khác dùng ` +
        `(pid ${pid}). Đóng cửa sổ đó rồi thử lại.`
      );
    }
    return (
      `profile ${dirName} còn khoá cũ. Thử lại là tự dọn, ` +
      `hoặc xoá tay: rm -f ${path.join(profileDir, 'Singleton*')}`
    );
  }
  return text;
}
