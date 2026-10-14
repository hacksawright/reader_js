import assert from 'node:assert';
import test from 'node:test';
import { chromium } from 'playwright';
import { noticeButton } from '../src/mailLogin.js';

const MAN_HINH = 'https://login.live.com/man-hinh';

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

async function createScreen(browser, body, url = MAN_HINH) {
  const page = await browser.newPage();
  await page.route('**://login.live.com/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><meta charset='utf-8'><body>${body}`,
    });
  });
  await page.route('**://ke-la.example/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><meta charset='utf-8'><body>${body}`,
    });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}

test('màn hình chỉ để thông báo thì bấm', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      "<h1>We're updating our terms</h1>" +
      '<p>We have updated the Microsoft Services Agreement.</p>' +
      '<button>Next</button>'
    );
    assert.ok((await noticeButton(page)) !== null);
    await page.close();
  });
});

test('màn hình chưa từng gặp bao giờ cũng bấm', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      '<h1>Welcome to the new Outlook</h1>' +
      '<p>Mọi thứ bạn cần, gọn trong một chỗ.</p>' +
      '<button>Got it</button>'
    );
    assert.ok((await noticeButton(page)) !== null);
    await page.close();
  });
});

test('có ô nhập thì không bấm', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      '<h1>Verify your email</h1>' +
      "<input name='proofconfirmation' type='email'>" +
      '<button>Next</button>'
    );
    assert.strictEqual(await noticeButton(page), null);
    await page.close();
  });
});

test('có danh sách chọn thì không bấm', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      '<h1>How would you like to sign in?</h1>' +
      '<select><option>Email</option><option>Phone</option></select>' +
      '<button>Next</button>'
    );
    assert.strictEqual(await noticeButton(page), null);
    await page.close();
  });
});

test('dính hai bước thì không bấm dù không có ô nhập', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      '<h1>Help us protect your account</h1>' +
      "<p>We'll text a code to your phone to verify it's you.</p>" +
      '<button>Next</button>'
    );
    assert.strictEqual(await noticeButton(page), null);
    await page.close();
  });
});

test('dính captcha thì không bấm', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      "<h1>Prove you're human</h1>" +
      '<p>Press and hold the button below.</p>' +
      '<button>Continue</button>'
    );
    assert.strictEqual(await noticeButton(page), null);
    await page.close();
  });
});

test('không bấm nút mở trang khác', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      "<h1>We're updating our terms</h1>" +
      "<a href='#'>Learn more about these updates</a>"
    );
    assert.strictEqual(await noticeButton(page), null);
    await page.close();
  });
});

test('không bấm nút gửi mã đi', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      '<h1>Thông báo</h1><p>Chỉ là một lời nhắn.</p><button>Send code</button>'
    );
    assert.strictEqual(await noticeButton(page), null);
    await page.close();
  });
});

test('không bấm nút đăng xuất hay xoá', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      '<h1>Thông báo</h1><p>Chỉ là một lời nhắn.</p>' +
      '<button>Sign out</button><button>Delete account</button>'
    );
    assert.strictEqual(await noticeButton(page), null);
    await page.close();
  });
});

test('khớp cả tên nút chứ không khớp một phần', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      '<h1>Thông báo</h1><p>Chỉ là một lời nhắn.</p><button>Book now</button>'
    );
    assert.strictEqual(await noticeButton(page), null);
    await page.close();
  });
});

test('hoa thường và khoảng trắng thừa không làm lỡ', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      '<h1>Thông báo</h1><p>Chỉ là một lời nhắn.</p><button>  next  </button>'
    );
    assert.ok((await noticeButton(page)) !== null);
    await page.close();
  });
});

test('tên miền lạ thì không bấm gì cả', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      '<h1>Thông báo</h1><p>Chỉ là một lời nhắn.</p><button>OK</button>',
      'https://ke-la.example/trang'
    );
    assert.strictEqual(await noticeButton(page), null);
    await page.close();
  });
});

test('nút nằm trong iframe vẫn tìm ra', async () => {
  await withBrowser(async (browser) => {
    const page = await createScreen(
      browser,
      "<div id='c'></div><script>" +
      "const f=document.createElement('iframe');" +
      'f.srcdoc=`<h1>A quick note about your Microsoft account</h1>' +
      '<p>Your important things are right here.</p>' +
      '<button>OK</button>`;' +
      "document.getElementById('c').append(f);</script>"
    );
    await page.waitForTimeout(300);
    assert.ok((await noticeButton(page)) !== null);
    await page.close();
  });
});
