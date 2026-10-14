/**
 * Đăng nhập Outlook bằng email và mật khẩu dán vào giao diện.
 * Giữ nguyên 100% logic của reader/mail_login.py.
 */

import { firstVisible, firstVisibleByRole } from './dom.js';
import { inInbox, isErrorPage, shortUrl } from './outlook.js';

export const TRUSTED_HOSTS = [
  'login.live.com',
  'login.microsoftonline.com',
  'login.microsoft.com',
  'outlook.live.com',
  'outlook.office.com',
  'account.live.com',
  'signup.live.com',
];

export const EMAIL_INPUTS = ["input[name='loginfmt']", "input[type='email']"];
export const PASSWORD_INPUTS = ["input[name='passwd']", "input[type='password']"];
export const SUBMIT_BUTTONS = [
  '#idSIButton9',
  "input[type='submit']",
  "button[type='submit']",
  "button[data-testid='primaryButton']",
];

export const LOGIN_URL = 'https://login.live.com/login.srf';
export const OUTLOOK_URL = 'https://outlook.live.com/owa/?nlp=1';
export const ACCOUNT_HOME_HOSTS = ['account.microsoft.com', 'account.live.com/proofs'];
export const MAX_ACCOUNT_HOME_HOPS = 3;
export const LOGOUT_URL = 'https://login.live.com/logout.srf';

export const USE_PASSWORD_SELECTORS = [
  '#idA_PWD_SwitchToPassword',
  "a[data-testid='usePasswordLink']",
  "[data-testid='signInWithPassword']",
];

export const USE_PASSWORD_TEXTS = [
  'Use your password',
  'Use password',
  'Sign in with your password',
  'Dùng mật khẩu của bạn',
  'Dùng mật khẩu',
];

export const MAX_USE_PASSWORD_CLICKS = 3;
export const STEP_WAIT_MS = 800;
export const MAX_PASSWORD_TRIES = 2;
export const MAX_ERROR_PAGE_TRIES = 3;

export const FILLABLE = [
  'input:not([type])',
  "input[type='text']",
  "input[type='email']",
  "input[type='password']",
  "input[type='tel']",
  "input[type='number']",
  "input[type='search']",
  'textarea',
  'select',
];

export const SAFE_CONTINUE = [
  'Next', 'OK', 'Okay', 'Got it', 'Continue', 'Done', 'Finish', 'Close',
  'Skip', 'Skip for now', 'Not now', 'Maybe later', 'Ask me later',
  'Dismiss', 'Accept', 'Accept and continue', 'Agree', 'I agree',
  'Tiếp theo', 'Tiếp tục', 'Xong', 'Đồng ý', 'Đã hiểu', 'Để sau',
  'Bỏ qua', 'Đóng',
];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const SAFE_CONTINUE_PATTERNS = SAFE_CONTINUE.map(
  (name) => new RegExp(`^\\s*${escapeRegex(name)}\\s*$`, 'i')
);
export const MAX_NOTICE_CLICKS = 8;

export const SIGNIN_LINKS = [
  "a[data-task='signin']",
  "a[href*='login.live.com']",
  '#signinbutton',
];

export const BLOCKERS = {
  'xác thực hai bước': [
    'approve sign in request', 'enter the code displayed', 'authenticator app',
    'verify your identity', 'we need to verify', 'enter the code we sent',
    'two-step verification', 'get a code', 'text a code', 'security code',
    'xác minh danh tính',
  ],
  CAPTCHA: ['solve the puzzle', "prove you're human", 'press and hold', 'captcha'],
  'xác minh qua email phụ': [
    'to verify this is your email',
    'enter your full email address to verify',
  ],
  'sai mật khẩu': [
    'your account or password is incorrect',
    "that microsoft account doesn't exist",
    'password is incorrect',
    "we couldn't find an account",
    'mật khẩu của bạn không chính xác',
    'mật khẩu không chính xác',
    'tài khoản microsoft đó không tồn tại',
  ],
  'tài khoản bị khoá': [
    'your account has been locked', 'account has been suspended',
    'help us secure your account', 'unusual sign-in activity',
  ],
  'đổi mật khẩu': ['update your password', 'your password has expired'],
};

export const PASSWORD_SIGNIN_UNAVAILABLE_TEXTS = [
  'password sign-in isn',
  'đăng nhập bằng mật khẩu không khả dụng',
];

export const ROTATE_HINT = 'cần đổi IP sạch rồi thử lại';

export const PASSWORD_SIGNIN_UNAVAILABLE_MSG =
  "Microsoft chặn đăng nhập bằng mật khẩu trên IP này (password sign-in isn't available) - IP proxy có thể bẩn, " +
  ROTATE_HINT;

export const TRANSIENT_MS_ERROR_TEXTS = [
  'there was an issue looking up your account',
  'issue looking up your account',
  'có sự cố khi tra cứu tài khoản',
];

export const TRANSIENT_MS_ERROR_MSG =
  'Microsoft báo lỗi tạm thời khi tra cứu tài khoản - IP proxy chập chờn, ' + ROTATE_HINT;

export class MailLoginBlocked extends Error {
  constructor(message) {
    super(message);
    this.name = 'MailLoginBlocked';
  }
}

export function isTrusted(page) {
  const url = (page.url() || '').toLowerCase();
  return TRUSTED_HOSTS.some((host) => url.includes(host));
}

async function _pageText(page) {
  try {
    return ((await page.innerText('body', { timeout: 2000 })) || '').toLowerCase();
  } catch {
    return '';
  }
}

export function blockerIn(text) {
  if (!text) {
    return null;
  }
  for (const [name, needles] of Object.entries(BLOCKERS)) {
    if (needles.some((needle) => text.includes(needle))) {
      return name;
    }
  }
  return null;
}

export async function findBlocker(page) {
  const text = await _pageText(page);
  return blockerIn(text);
}

export async function passwordSigninUnavailable(page) {
  const text = await _pageText(page);
  return PASSWORD_SIGNIN_UNAVAILABLE_TEXTS.some((t) => text.includes(t));
}

export async function transientMsError(page) {
  const text = await _pageText(page);
  return TRANSIENT_MS_ERROR_TEXTS.some((t) => text.includes(t));
}

async function _click(locator) {
  await locator.click({ timeout: 15000 });
}

async function _type(locator, value) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await locator.click({ timeout: 15000 });
    await locator.fill('', { timeout: 15000 });
    await locator.pressSequentially(value, { delay: 45 });
    let typed = '';
    try {
      typed = await locator.inputValue({ timeout: 5000 });
    } catch {
      return;
    }
    if (typed === value) {
      return;
    }
    console.warn(
      `ô nhập lệch sau khi gõ (dài ${typed.length}, cần ${value.length}) - gõ lại lần ${attempt + 2}`
    );
  }
  throw new MailLoginBlocked(
    'gõ mãi mà ô nhập vẫn không khớp giá trị cần gõ - form có thể đang chặn; xem ảnh chụp màn hình'
  );
}

function _onAccountHome(page) {
  const url = (page.url() || '').toLowerCase();
  return ACCOUNT_HOME_HOSTS.some((host) => url.includes(host));
}

export async function loggedIn(page) {
  return await inInbox(page);
}

async function _usePasswordLink(page) {
  const link = await firstVisible(page, USE_PASSWORD_SELECTORS);
  if (link !== null) {
    return link;
  }
  for (const text of USE_PASSWORD_TEXTS) {
    for (const role of ['link', 'button']) {
      const items = page.getByRole(role, { name: text });
      let count = 0;
      try {
        count = Math.min(await items.count(), 5);
      } catch {
        continue;
      }
      for (let i = 0; i < count; i++) {
        const item = items.nth(i);
        try {
          if (await item.isVisible()) {
            return item;
          }
        } catch {
          continue;
        }
      }
    }
  }
  return null;
}

async function _framesWithText(page) {
  const frames = [page.mainFrame(), ...page.frames().filter((f) => f !== page.mainFrame())];
  const list = [];
  for (const frame of frames) {
    try {
      const text = ((await frame.innerText('body', { timeout: 1000 })) || '').toLowerCase();
      if (text) {
        list.push({ frame, text });
      }
    } catch {
      continue;
    }
  }
  return list;
}

export async function noticeButton(page) {
  if (!isTrusted(page)) {
    return null;
  }
  const frames = await _framesWithText(page);
  for (const { frame, text } of frames) {
    const blocked = blockerIn(text);
    if (blocked) {
      continue;
    }
    if ((await firstVisible(frame, FILLABLE)) !== null) {
      continue;
    }
    const button = await firstVisibleByRole(frame, SAFE_CONTINUE_PATTERNS);
    if (button !== null) {
      return button;
    }
  }
  return null;
}

async function _signinLink(page) {
  return await firstVisible(page, SIGNIN_LINKS);
}

export class LoginSession {
  constructor(page, email, password) {
    this.page = page;
    this.email = email;
    this.password = password;
    this.typedEmail = false;
    this.typedPassword = false;
    this.emailDone = false;
    this.passwordDone = false;
    this.passwordTries = 0;
    this.openedPortal = false;
    this.switchClicks = 0;
    this.noticeClicks = 0;
  }

  async answerStaySignedIn() {
    if (await staySignedIn(this.page)) {
      await this.page.waitForTimeout(STEP_WAIT_MS);
      return true;
    }
    return false;
  }

  async dismissNotice() {
    if (this.noticeClicks >= MAX_NOTICE_CLICKS) {
      return false;
    }
    const button = await noticeButton(this.page);
    if (!button) {
      return false;
    }
    this.noticeClicks++;
    console.log(`hộp thư ${this.email}: bấm qua một màn hình thông báo`);
    await _click(button);
    await this.page.waitForTimeout(STEP_WAIT_MS);
    return true;
  }

  async switchToPassword() {
    if (this.switchClicks >= MAX_USE_PASSWORD_CLICKS) {
      return false;
    }
    const link = await _usePasswordLink(this.page);
    if (!link) {
      return false;
    }
    this.switchClicks++;
    console.log(`hộp thư ${this.email}: chuyển sang đăng nhập bằng mật khẩu`);
    await _click(link);
    await this.page.waitForTimeout(STEP_WAIT_MS);
    return true;
  }

  async findInput() {
    const hasEmail = (await firstVisible(this.page, EMAIL_INPUTS)) !== null;
    const hasPassword = (await firstVisible(this.page, PASSWORD_INPUTS)) !== null;
    if (hasEmail || hasPassword) {
      return false;
    }

    if (!isTrusted(this.page) || !this.openedPortal) {
      this.openedPortal = true;
      console.log('mở cổng đăng nhập Microsoft');
      try {
        await this.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (err) {
        // bỏ qua lỗi tải
      }
      await this.page.waitForTimeout(STEP_WAIT_MS);
      return true;
    }

    const link = await _signinLink(this.page);
    if (link !== null) {
      await _click(link);
      await this.page.waitForTimeout(STEP_WAIT_MS);
    } else {
      await this.page.waitForTimeout(1000);
    }
    return true;
  }

  async _emailInput() {
    if (this.passwordDone) {
      return null;
    }
    const loginFmt = await firstVisible(this.page, ["input[name='loginfmt']"]);
    if (loginFmt !== null) {
      return loginFmt;
    }
    return this.emailDone ? null : await firstVisible(this.page, EMAIL_INPUTS);
  }

  async typeAndSubmit() {
    if (!isTrusted(this.page)) {
      throw new MailLoginBlocked(
        `trang đăng nhập nằm ở tên miền lạ (${(this.page.url() || '').slice(0, 80)}) - không gõ mật khẩu vào đó`
      );
    }

    const oMatKhau = await firstVisible(this.page, PASSWORD_INPUTS);
    if (oMatKhau !== null) {
      if (this.typedPassword) {
        await this.page.waitForTimeout(1500);
        this.typedPassword = false;
        return true;
      }
      if (this.passwordTries >= MAX_PASSWORD_TRIES) {
        throw new MailLoginBlocked(
          `đã nhập mật khẩu ${this.passwordTries} lần mà Microsoft vẫn ở màn hình mật khẩu ` +
          `(không báo sai mật khẩu) - gần như chắc chắn IP bị chặn, ${ROTATE_HINT}`
        );
      }
      await _type(oMatKhau, this.password);
      this.passwordTries++;
      this.typedPassword = true;
      this.passwordDone = true;
      console.log(`hộp thư ${this.email}: đã nhập mật khẩu`);
    } else {
      const oDiaChi = await this._emailInput();
      if (!oDiaChi) {
        await this.page.waitForTimeout(1000);
        return true;
      }
      if (this.typedEmail) {
        await this.page.waitForTimeout(1500);
        this.typedEmail = false;
        return true;
      }
      await _type(oDiaChi, this.email);
      this.typedEmail = true;
      this.emailDone = true;
      console.log(`hộp thư ${this.email}: đã nhập địa chỉ`);
    }

    const nut = await firstVisible(this.page, SUBMIT_BUTTONS);
    if (nut !== null) {
      await _click(nut);
    } else {
      await this.page.keyboard.press('Enter');
    }
    await this.page.waitForTimeout(STEP_WAIT_MS);
    return true;
  }
}

export async function staySignedIn(page) {
  const text = await _pageText(page);
  if (!text.includes('stay signed in') && !text.includes('duy trì đăng nhập')) {
    return false;
  }

  let button = await firstVisible(page, ['#idSIButton9', "input[type='submit']"]);
  if (!button) {
    button = await firstVisibleByRole(page, ['Yes', 'Có', 'No', 'Không']);
  }
  if (!button) {
    console.warn("thấy 'Stay signed in?' nhưng không tìm ra nút nào");
    return false;
  }

  console.log("hộp thư: trả lời 'Stay signed in?'");
  await _click(button);
  return true;
}

export async function login(page, email, password, timeoutSeconds = 90, shouldStop = null) {
  if (!password) {
    throw new MailLoginBlocked(
      `chưa có mật khẩu hộp thư cho ${email} - dán dạng '${email}|matkhau'`
    );
  }

  const session = new LoginSession(page, email, password);
  const deadline = Date.now() + timeoutSeconds * 1000;
  let errorStreak = 0;
  let accountHops = 0;

  while (Date.now() < deadline) {
    if (shouldStop && shouldStop()) {
      throw new MailLoginBlocked('thôi đăng nhập: bạn đã dừng');
    }

    if (await loggedIn(page)) {
      console.log(`hộp thư ${email}: đã vào được (${shortUrl(page)})`);
      return;
    }

    if (isErrorPage(page)) {
      errorStreak++;
      if (errorStreak >= MAX_ERROR_PAGE_TRIES) {
        throw new MailLoginBlocked(
          `không mở được cổng đăng nhập Microsoft (trang lỗi '${shortUrl(page)}') - ` +
          `proxy có thể đang chặn login.live.com; ${ROTATE_HINT}`
        );
      }
      console.log(`hộp thư ${email}: trang lỗi (${shortUrl(page)}), mở lại cổng đăng nhập`);
      try {
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch {
        // bỏ qua lỗi
      }
      await page.waitForTimeout(1500);
      continue;
    }
    errorStreak = 0;

    if (_onAccountHome(page)) {
      accountHops++;
      if (accountHops > MAX_ACCOUNT_HOME_HOPS) {
        throw new MailLoginBlocked(
          'đã đăng nhập tài khoản Microsoft nhưng Outlook không mở - xem ảnh chụp màn hình'
        );
      }
      console.log(`hộp thư ${email}: đang ở trang tài khoản (${shortUrl(page)}), sang Outlook`);
      try {
        await page.goto(OUTLOOK_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch {
        // bỏ qua
      }
      await page.waitForTimeout(STEP_WAIT_MS);
      continue;
    }

    if (await session.answerStaySignedIn()) {
      continue;
    }
    if (await session.dismissNotice()) {
      continue;
    }
    if (await session.switchToPassword()) {
      continue;
    }

    if (await passwordSigninUnavailable(page)) {
      throw new MailLoginBlocked(PASSWORD_SIGNIN_UNAVAILABLE_MSG);
    }

    if (await transientMsError(page)) {
      throw new MailLoginBlocked(TRANSIENT_MS_ERROR_MSG);
    }

    const rateLimited = await findBlocker(page);
    if (rateLimited) {
      throw new MailLoginBlocked(
        `Outlook đang hỏi ${rateLimited} - việc này dành cho bạn, agent không tự xử lý`
      );
    }

    if (await session.findInput()) {
      continue;
    }
    await session.typeAndSubmit();
  }

  throw new MailLoginBlocked(
    `hết ${timeoutSeconds}s mà hộp thư ${email} vẫn chưa mở - ${ROTATE_HINT}`
  );
}

export async function signOut(page) {
  try {
    await page.goto(LOGOUT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
  } catch (err) {
    console.warn(`đăng xuất hộp thư không xong: ${err}`);
  }
  try {
    await page.context().clearCookies();
  } catch (err) {
    console.warn(`không dọn được cookie hộp thư: ${err}`);
  }
  console.log('đã đăng xuất hộp thư');
  return 'đã đăng xuất hộp thư';
}
