import assert from 'node:assert';
import test from 'node:test';
import { BadWebhook, checkWebhook } from '../src/webhook.js';

test('checkWebhook nhận url http và https', () => {
  assert.strictEqual(checkWebhook('https://example.com/hook'), 'https://example.com/hook');
  assert.strictEqual(checkWebhook('http://127.0.0.1:8080/hook'), 'http://127.0.0.1:8080/hook');
  assert.strictEqual(checkWebhook(''), '');
});

test('checkWebhook từ chối scheme lạ hoặc file', () => {
  assert.throws(() => {
    checkWebhook('file:///etc/passwd');
  }, BadWebhook);
  assert.throws(() => {
    checkWebhook('ftp://example.com');
  }, BadWebhook);
  assert.throws(() => {
    checkWebhook('not-a-url');
  }, BadWebhook);
});
