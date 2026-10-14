/**
 * Cấu hình proxy cho trình duyệt Playwright.
 * Giữ nguyên logic của reader/proxy.py.
 */

export function parseProxy(rawUrl) {
  const url = (rawUrl || '').trim();
  if (!url) {
    return null;
  }
  const fullUrl = url.includes('://') ? url : `http://${url}`;
  let parsed;
  try {
    parsed = new URL(fullUrl);
  } catch (err) {
    throw new Error(`không đọc được proxy: ${url.slice(0, 60)}`);
  }
  if (!parsed.hostname) {
    throw new Error(`không đọc được proxy: ${url.slice(0, 60)}`);
  }

  // Chromium không gửi username/password cho SOCKS
  if (parsed.protocol.startsWith('socks') && parsed.username) {
    throw new Error(
      'Chromium không gửi được user/pass cho SOCKS5 - dùng cổng HTTP của ' +
      'nhà cung cấp proxy (http://user:pass@host:port), hoặc SOCKS5 với ' +
      'whitelist IP và bỏ user/pass'
    );
  }

  const port = parsed.port || '8080';
  const proxy = {
    server: `${parsed.protocol}//${parsed.hostname}:${port}`,
  };
  if (parsed.username) {
    proxy.username = decodeURIComponent(parsed.username);
  }
  if (parsed.password) {
    proxy.password = decodeURIComponent(parsed.password);
  }
  return proxy;
}

export function describeProxy(proxy) {
  if (!proxy) {
    return 'không qua proxy';
  }
  const ai = proxy.username ? `${proxy.username}@` : '';
  return `qua proxy ${ai}${proxy.server}`;
}
