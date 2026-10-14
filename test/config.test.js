import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadEnvFile, Settings } from '../src/config.js';

test('loadEnvFile đọc đúng key=value, unquote và loại chú thích', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-test-'));
  const envPath = path.join(tmpDir, '.env');
  fs.writeFileSync(
    envPath,
    '# chú thích\n' +
    '\n' +
    'READER_TOKEN=abc_123\n' +
    'export READER_PORT=8080\n' +
    "READER_SMTP_PASSWORD='p@ss $khong noi suy'\n" +
    'READER_PROXY="http://u:p@h:3128"\n' +
    'READER_BROWSER_CHANNEL=         # rỗng = Chromium\n' +
    'READER_WEBHOOK_SECRET=pass#123  # chú thích\n' +
    'READER_HOST=   # chỉ có chú thích\n' +
    'dong hong khong co dau bang\n'
  );

  delete process.env.READER_TOKEN;
  delete process.env.READER_PORT;
  delete process.env.READER_SMTP_PASSWORD;
  delete process.env.READER_PROXY;
  delete process.env.READER_BROWSER_CHANNEL;
  delete process.env.READER_WEBHOOK_SECRET;
  delete process.env.READER_HOST;

  const ok = loadEnvFile(envPath);
  assert.strictEqual(ok, true);
  const s = Settings.fromEnv();
  assert.strictEqual(s.token, 'abc_123');
  assert.strictEqual(s.port, 8080);
  assert.strictEqual(s.smtpPassword, 'p@ss $khong noi suy');
  assert.strictEqual(s.proxyUrl, 'http://u:p@h:3128');
  assert.strictEqual(s.browserChannel, '');
  assert.strictEqual(s.webhookSecret, 'pass#123');
  assert.strictEqual(s.host, '127.0.0.1'); // rỗng thì về mặc định

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('biến môi trường sẵn có thắng file .env', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-test-'));
  const envPath = path.join(tmpDir, '.env');
  fs.writeFileSync(envPath, 'READER_PORT=8080\n');

  process.env.READER_PORT = '9000';
  loadEnvFile(envPath);
  assert.strictEqual(Settings.fromEnv().port, 9000);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('file .env không tồn tại trả về false', () => {
  assert.strictEqual(loadEnvFile('/duong/dan/khong/ton/tai/.env'), false);
});
