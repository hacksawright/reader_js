/**
 * Lấy mã OTP từ nội dung một email.
 * Chấm điểm từng dãy số theo ngữ cảnh trước/sau, loại bỏ số đơn hàng, ngày tháng, link, tiền.
 * Giữ nguyên 100% quy tắc và trọng số của reader/otp_extract.py.
 */

export const STRONG_BEFORE = [
  'verification code', 'verify code', 'security code', 'one-time password',
  'one time password', 'otp code', 'passcode', 'confirmation code',
  'access code', 'login code', 'sign-in code', 'authentication code',
  'mã xác minh', 'mã xác thực', 'mã otp', 'mã bảo mật', 'mã đăng nhập',
];

export const STRONG_AFTER = [
  'is your verification code', 'is your security code', 'is your code',
  'is your otp', 'is your login code', 'là mã xác minh', 'là mã xác thực',
];

export const WEAK = ['code', 'mã', 'pin'];

export const NEGATIVE = [
  'order', 'invoice', 'receipt', 'reference', 'tracking', 'shipment',
  'transaction', 'account number', 'card ending', 'phone', 'telephone',
  'mobile', 'hotline', 'zip', 'amount', 'total', 'price', 'usd', 'vnd',
  'đơn hàng', 'hoá đơn', 'hóa đơn', 'số điện thoại', 'tổng tiền',
  'copyright', 'unsubscribe', 'version',
];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const _STRONG_BEFORE_RE = new RegExp(STRONG_BEFORE.map(escapeRegex).join('|'), 'i');
const _STRONG_AFTER_RE = new RegExp(STRONG_AFTER.map(escapeRegex).join('|'), 'i');
// Hỗ trợ cả ký tự tiếng Việt với Unicode boundary
const _WEAK_RE = new RegExp(`(?<![\\p{L}\\p{N}_])(${WEAK.map(escapeRegex).join('|')})(?![\\p{L}\\p{N}_])`, 'iu');
const _NEGATIVE_RE = new RegExp(NEGATIVE.map(escapeRegex).join('|'), 'i');

const _MASK_RES = [
  /https?:\/\/\S+|www\.\S+/gi,
  /\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|co|vn|me|app|link)\/\S*/gi,
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi,
  /\b\d{4}-\d{2}-\d{2}[T ]?\d{0,2}:?\d{0,2}:?\d{0,2}\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/gi,
  /[$€£¥]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:usd|eur|vnd|đ)\b/gi,
];

const _TOKEN_CHARS = new Set('0123456789+-/:.,()');
const _SENTENCE = /[\n.;!?]/;
const CONTEXT = 40;
const NEAR = 14;

export class Candidate {
  constructor(code, confidence, why) {
    this.code = code;
    this.confidence = confidence;
    this.why = why;
  }
}

function _mask(text) {
  let res = text;
  for (const pattern of _MASK_RES) {
    res = res.replace(pattern, (match) => '\x00'.repeat(match.length));
  }
  return res;
}

function _partOfBiggerNumber(text, start, end) {
  let left = start;
  let right = end;
  while (left > 0 && _TOKEN_CHARS.has(text[left - 1])) {
    left--;
  }
  while (right < text.length && _TOKEN_CHARS.has(text[right])) {
    right++;
  }
  let digits = 0;
  for (let i = left; i < right; i++) {
    const c = text[i];
    if (c >= '0' && c <= '9') {
      digits++;
    }
  }
  return digits > (end - start);
}

/**
 * Trích xuất mã OTP từ văn bản nếu đạt độ tự tin >= minConfidence.
 */
export function extractCode(text, minLen = 4, maxLen = 8, minConfidence = 0.6) {
  if (!text) {
    return null;
  }

  const masked = _mask(text);
  const digitsRegex = new RegExp(`\\d{${minLen},${maxLen}}`, 'g');
  const found = [];
  let match;

  while ((match = digitsRegex.exec(masked)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;

    if (_partOfBiggerNumber(masked, start, end)) {
      continue;
    }

    const windowBefore = masked.slice(Math.max(0, start - CONTEXT), start);
    const beforeParts = windowBefore.split(_SENTENCE);
    const before = beforeParts[beforeParts.length - 1];

    const windowAfter = masked.slice(end, end + CONTEXT);
    const after = windowAfter.split(_SENTENCE)[0];

    // Từ khoá phủ định chỉ loại khi nằm CÙNG CÂU với dãy số
    if (_NEGATIVE_RE.test(before) || _NEGATIVE_RE.test(after.slice(0, NEAR))) {
      continue;
    }

    if (_STRONG_BEFORE_RE.test(before)) {
      found.push(new Candidate(match[0], 0.97, 'ngữ cảnh trước'));
    } else if (_STRONG_AFTER_RE.test(after)) {
      found.push(new Candidate(match[0], 0.95, 'ngữ cảnh sau'));
    } else if (_WEAK_RE.test(before) || _WEAK_RE.test(after.slice(0, NEAR))) {
      found.push(new Candidate(match[0], 0.80, 'ngữ cảnh yếu'));
    } else {
      found.push(new Candidate(match[0], 0.55, 'không ngữ cảnh'));
    }
  }

  if (found.length === 0) {
    return null;
  }

  found.sort((a, b) => b.confidence - a.confidence);
  let best = found[0];

  // Hai ứng viên mạnh ngang nhau nhưng khác số: không đoán bừa
  const rivals = found.slice(1).filter(
    (c) => c.code !== best.code && best.confidence - c.confidence < 0.05
  );
  if (rivals.length > 0) {
    best = new Candidate(best.code, Math.round((best.confidence - 0.3) * 100) / 100, 'mơ hồ');
  }

  return best.confidence >= minConfidence ? best : null;
}
