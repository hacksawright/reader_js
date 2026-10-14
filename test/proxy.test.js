import assert from 'node:assert';
import test from 'node:test';
import { describeProxy, parseProxy } from '../src/proxy.js';

test('parse rỗng trả về null', () => {
  assert.strictEqual(parseProxy(''), null);
  assert.strictEqual(parseProxy(null), null);
});

test('parse proxy http đầy đủ', () => {
  const p = parseProxy('http://user:pass@127.0.0.1:3128');
  assert.strictEqual(p.server, 'http://127.0.0.1:3128');
  assert.strictEqual(p.username, 'user');
  assert.strictEqual(p.password, 'pass');
});

test('tự thêm http:// nếu thiếu scheme', () => {
  const p = parseProxy('127.0.0.1:8080');
  assert.strictEqual(p.server, 'http://127.0.0.1:8080');
});

test('SOCKS có user/pass phải ném lỗi', () => {
  assert.throws(() => {
    parseProxy('socks5://user:pass@127.0.0.1:1080');
  }, /Chromium không gửi được user\/pass cho SOCKS5/);
});

test('describeProxy giấu mật khẩu', () => {
  const p = parseProxy('http://admin:secret123@1.2.3.4:8080');
  const desc = describeProxy(p);
  assert.ok(desc.includes('admin@http://1.2.3.4:8080'));
  assert.ok(!desc.includes('secret123'));
});
