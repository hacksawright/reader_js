import assert from 'node:assert';
import test from 'node:test';
import { chromium } from 'playwright';
import { blockerIn, LoginSession, staySignedIn } from '../src/mailLogin.js';

const EMAIL = 'nguoidung@outlook.com';
const PASSWORD = 'MatKhau#2026';

async function withBrowser(fn) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
  } catch {
    browser = await chromium.launch({ headless: true });
  }
  try {
    await fn(browser);
  } finally {
    await browser.close();
  }
}

async function createScreen(browser, body) {
  const page = await browser.newPage();
  await page.route('**://login.live.com/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><meta charset='utf-8'><body>${body}`,
    });
  });
  await page.goto('https://login.live.com/login.srf', { waitUntil: 'domcontentloaded' });
  return page;
}

test('nhận ra sai mật khẩu trên trang tiếng Việt', () => {
  assert.strictEqual(
    blockerIn(
      'tài khoản hoặc mật khẩu của bạn không chính xác. nếu bạn không nhớ ' +
      'mật khẩu của mình, hãy đặt lại ngay bây giờ.'
    ),
    'sai mật khẩu'
  );
});

test('gõ địa chỉ vào ô đăng nhập', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      "<form name='f1' onsubmit='return false'>" +
      "<input name='loginfmt' type='email'>" +
      "<input id='idSIButton9' type='submit' onclick='return false'>" +
      '</form>'
    );
    const session = new LoginSession(page, EMAIL, PASSWORD);
    await session.typeAndSubmit();
    assert.strictEqual(await page.inputValue("input[name='loginfmt']"), EMAIL);
    await page.close();
  });
});

test('stay signed in bấm Yes không bấm nút đóng', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      '<p>Stay signed in?</p>' +
      "<button type='submit' id='close-button' aria-label='Close' " +
      "data-testid='dismissIcon' onclick=\"document.title='DONG'\">X</button>" +
      "<button type='submit' onclick=\"document.title='YES'\">Yes</button>" +
      "<button type='submit' onclick=\"document.title='NO'\">No</button>"
    );
    const result = await staySignedIn(page);
    assert.strictEqual(result, true);
    assert.strictEqual(await page.title(), 'YES');
    await page.close();
  });
});

test('gõ mật khẩu vào ô mật khẩu', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      "<form name='f1' onsubmit='return false'>" +
      "<input name='passwd' type='password'>" +
      "<input id='idSIButton9' type='submit' onclick='return false'>" +
      '</form>'
    );
    const session = new LoginSession(page, EMAIL, PASSWORD);
    await session.typeAndSubmit();
    assert.strictEqual(await page.inputValue("input[name='passwd']"), PASSWORD);
    await page.close();
  });
});

test('gõ mật khẩu xong thì không gõ địa chỉ vào ô xác minh', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      "<div id='pw'><form name='f1'><input name='passwd' type='password'>" +
      "<input id='idSIButton9' type='submit'></form></div>" +
      "<div id='verify' style='display:none'>" +
      '<p>Enter your full email address to verify</p>' +
      "<input name='proofconfirmation' type='email'>" +
      "<button id='send'>Send code</button></div>" +
      '<script>idSIButton9.onclick = () => {' +
      "  pw.style.display='none'; verify.style.display='block'; return false; };" +
      '</script>'
    );
    const session = new LoginSession(page, EMAIL, PASSWORD);
    await session.typeAndSubmit();
    await page.waitForTimeout(300);
    await session.typeAndSubmit();
    assert.strictEqual(await page.inputValue("input[name='proofconfirmation']"), '');
    await page.close();
  });
});

test('đã gõ địa chỉ rồi thì không gõ vào một ô email bất kỳ', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      "<div id='one'><form name='f1'><input name='loginfmt' type='email'>" +
      "<input id='idSIButton9' type='submit'></form></div>" +
      "<div id='two' style='display:none'>" +
      "<input name='proofconfirmation' type='email'></div>" +
      '<script>idSIButton9.onclick = () => {' +
      "  one.style.display='none'; two.style.display='block'; return false; };" +
      '</script>'
    );
    const session = new LoginSession(page, EMAIL, PASSWORD);
    await session.typeAndSubmit();
    await page.waitForTimeout(300);
    await session.typeAndSubmit();
    assert.strictEqual(await page.inputValue("input[name='proofconfirmation']"), '');
    await page.close();
  });
});
