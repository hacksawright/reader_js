/**
 * Mở trình duyệt với persistent context, quản lý sandbox và proxy.
 * Giữ nguyên logic của reader/browser.py.
 */

import { describeProxy } from './proxy.js';

export async function launchPersistent(pw, {
  userDataDir,
  channel = null,
  headless = false,
  args = [],
  proxy = null,
  ...extra
} = {}) {
  const common = {
    headless,
    args: [...args],
    ...extra,
  };

  if (channel) {
    common.channel = channel;
  }
  if (proxy) {
    common.proxy = proxy;
    console.log(`trình duyệt ${describeProxy(proxy)}`);
  }

  try {
    return await pw.chromium.launchPersistentContext(userDataDir, {
      chromiumSandbox: true,
      ...common,
    });
  } catch (err) {
    const msg = String(err?.message || err).split('\n')[0].slice(0, 120);
    console.warn(`không dựng được sandbox của trình duyệt, chạy không sandbox: ${msg}`);
    return await pw.chromium.launchPersistentContext(userDataDir, {
      chromiumSandbox: false,
      ...common,
    });
  }
}
