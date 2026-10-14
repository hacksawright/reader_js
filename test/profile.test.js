import assert from 'node:assert';
import path from 'node:path';
import test from 'node:test';
import { explainLaunchError, profileFor } from '../src/profile.js';

test('profileFor chuẩn hoá email thành tên thư mục hợp lệ', () => {
  const p = profileFor('/tmp/profiles', 'User.Name+Tag@Example.Com');
  assert.strictEqual(path.basename(p), 'user.name_tag_example.com');
});

test('profileFor rỗng trả về mac-dinh', () => {
  const p = profileFor('/tmp/profiles', '');
  assert.strictEqual(path.basename(p), 'mac-dinh');
});

test('explainLaunchError giải thích lỗi ProcessSingleton', () => {
  const err = new Error('ProcessSingleton: SingletonLock exists');
  const msg = explainLaunchError(err, '/tmp/profiles/test_user');
  assert.ok(msg.includes('profile test_user còn khoá cũ'));
});
