import assert from 'node:assert';
import http from 'node:http';
import test from 'node:test';
import { Settings } from '../src/config.js';
import { createApp, splitAccount } from '../src/server.js';

test('splitAccount cắt đúng ở dấu | đầu tiên', () => {
  assert.deepStrictEqual(splitAccount('ten@outlook.com|MatKhau123'), [
    'ten@outlook.com',
    'MatKhau123',
  ]);
  assert.deepStrictEqual(splitAccount('ten@outlook.com|Pass|With|Pipes'), [
    'ten@outlook.com',
    'Pass|With|Pipes',
  ]);
  assert.deepStrictEqual(splitAccount('TEN@OUTLOOK.COM', 'pass'), [
    'ten@outlook.com',
    'pass',
  ]);
});

test('server endpoints và token bảo mật', async (t) => {
  const settings = new Settings({
    token: 'test-secret-token',
    port: 0,
    host: '127.0.0.1',
  });
  const app = createApp(settings);

  // Tạo fake run để không mở Chromium thật trong unit test
  const fakeJobRun = async () => {};
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  // 1. Gọi không có token -> 401
  const resNoToken = await fetch(`${baseUrl}/api/jobs`);
  assert.strictEqual(resNoToken.status, 401);

  // 2. Gọi có token sai -> 401
  const resBadToken = await fetch(`${baseUrl}/api/jobs`, {
    headers: { 'X-Reader-Token': 'wrong-token' },
  });
  assert.strictEqual(resBadToken.status, 401);

  // 3. Gọi có token đúng -> 200
  const resWithToken = await fetch(`${baseUrl}/api/jobs`, {
    headers: { 'X-Reader-Token': 'test-secret-token' },
  });
  assert.strictEqual(resWithToken.status, 200);
  const jobsData = await resWithToken.json();
  assert.ok(Array.isArray(jobsData.jobs));

  // 4. POST /api/otp dán email sai -> 400
  const resBadEmail = await fetch(`${baseUrl}/api/otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Reader-Token': 'test-secret-token',
    },
    body: JSON.stringify({ email: 'khong-phai-email' }),
  });
  assert.strictEqual(resBadEmail.status, 400);

  // 5. POST /api/otp hợp lệ -> tạo job và mật khẩu không bị lọt ra
  const resStart = await fetch(`${baseUrl}/api/otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Reader-Token': 'test-secret-token',
    },
    body: JSON.stringify({
      email: 'testuser@outlook.com',
      password: 'SuperSecretPassword123',
    }),
  });
  assert.strictEqual(resStart.status, 200);
  const startData = await resStart.json();
  assert.ok(startData.id);
  assert.strictEqual(startData.email, 'testuser@outlook.com');
  assert.strictEqual(startData.password, undefined);

  const resText = JSON.stringify(startData);
  assert.ok(!resText.includes('SuperSecretPassword123'));

  // 6. Cùng email trả lại job đang chạy
  const resDup = await fetch(`${baseUrl}/api/otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Reader-Token': 'test-secret-token',
    },
    body: JSON.stringify({
      email: 'testuser@outlook.com',
      password: 'SuperSecretPassword123',
    }),
  });
  const dupData = await resDup.json();
  assert.strictEqual(dupData.id, startData.id);

  // 7. GET /api/otp/:jobId
  const resGet = await fetch(`${baseUrl}/api/otp/${startData.id}`, {
    headers: { 'X-Reader-Token': 'test-secret-token' },
  });
  assert.strictEqual(resGet.status, 200);
  const getJob = await resGet.json();
  assert.strictEqual(getJob.id, startData.id);

  // 8. GET /api/otp/khong-ton-tai -> 404
  const res404 = await fetch(`${baseUrl}/api/otp/not-found-id`, {
    headers: { 'X-Reader-Token': 'test-secret-token' },
  });
  assert.strictEqual(res404.status, 404);

  // 9. POST /api/otp/:jobId/stop
  const resStop = await fetch(`${baseUrl}/api/otp/${startData.id}/stop`, {
    method: 'POST',
    headers: { 'X-Reader-Token': 'test-secret-token' },
  });
  assert.strictEqual(resStop.status, 200);

  // 10. GET / trang chủ mở được
  const resHome = await fetch(`${baseUrl}/?token=test-secret-token`);
  assert.strictEqual(resHome.status, 200);
  const html = await resHome.text();
  assert.ok(html.includes('Lấy mã OTP từ Outlook'));
});
