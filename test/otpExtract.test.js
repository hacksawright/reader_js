import assert from 'node:assert';
import test from 'node:test';
import { extractCode } from '../src/otpExtract.js';

test('lấy mã có từ khoá đứng trước', () => {
  const found = extractCode('Your verification code is 483921. Do not share it.');
  assert.ok(found !== null);
  assert.strictEqual(found.code, '483921');
});

test('lấy mã có từ khoá đứng sau', () => {
  const found = extractCode('392014 is your verification code');
  assert.ok(found !== null);
  assert.strictEqual(found.code, '392014');
});

test('không trả số đơn hàng hay hóa đơn', () => {
  assert.strictEqual(extractCode('Your order number is 48392105'), null);
  assert.strictEqual(extractCode('Invoice 483921 has been paid'), null);
});

test('dãy số không có ngữ cảnh thì bỏ', () => {
  assert.strictEqual(extractCode('Chào bạn, 483921'), null);
});

test('từ khoá phủ định chỉ loại trong cùng câu', () => {
  const found = extractCode('Order shipped. Your code is 483921.');
  assert.ok(found !== null);
  assert.strictEqual(found.code, '483921');
});

test('số trong link không tính', () => {
  assert.strictEqual(extractCode('Mở https://example.com/t/483921 để xem'), null);
});

test('hai mã mạnh ngang nhau thì không đoán bừa', () => {
  assert.strictEqual(extractCode('code 111111 code 222222'), null);
});

test('hỗ trợ tiếng Việt', () => {
  const found = extractCode('Mã xác minh của bạn là 774921');
  assert.ok(found !== null);
  assert.strictEqual(found.code, '774921');
});
