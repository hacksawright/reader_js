import assert from 'node:assert';
import test from 'node:test';
import { Cancelled, Result, snapshot } from '../src/fetch.js';
import { shortUrl } from '../src/outlook.js';

test('Result và Cancelled khởi tạo đúng', () => {
  const r1 = new Result('123456', null);
  assert.strictEqual(r1.hit, '123456');
  assert.strictEqual(r1.error, null);

  const r2 = new Result(null, 'Lỗi kết nối');
  assert.strictEqual(r2.hit, null);
  assert.strictEqual(r2.error, 'Lỗi kết nối');

  const c = new Cancelled('Người dùng huỷ');
  assert.strictEqual(c.name, 'Cancelled');
  assert.strictEqual(c.message, 'Người dùng huỷ');
});

test('shortUrl trích xuất domain và pathname hợp lệ', () => {
  const fakePage = {
    url: () => 'https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=15',
  };
  assert.strictEqual(shortUrl(fakePage), 'login.live.com/login.srf');

  const emptyPage = {
    url: () => '',
  };
  assert.strictEqual(shortUrl(emptyPage), '(trống)');
});

test('snapshot gọi callback với buffer và url', async () => {
  let capturedBuf = null;
  let capturedUrl = '';
  const fakePage = {
    screenshot: async () => Buffer.from('fake-screenshot'),
    url: () => 'https://outlook.live.com/mail/0/',
  };
  await snapshot(fakePage, (buf, url) => {
    capturedBuf = buf;
    capturedUrl = url;
  });
  assert.strictEqual(capturedBuf.toString(), 'fake-screenshot');
  assert.strictEqual(capturedUrl, 'https://outlook.live.com/mail/0/');
});
