/**
 * Có mã thì gửi email thông báo về hộp thư của bạn qua SMTP.
 * Giữ nguyên logic của reader/mailer.py.
 */

import nodemailer from 'nodemailer';

export function buildMail(box, code, email, subject = '', to = '') {
  const recipient = to || box.to;
  const lines = [`Mã: ${code}`, `Hộp thư: ${email}`];
  if (subject) {
    lines.push(`Mail: ${subject}`);
  }
  lines.push('', 'Gửi tự động bởi reader.');

  return {
    from: box.fromAddr,
    to: recipient,
    subject: `${code} - mã OTP của ${email}`,
    text: lines.join('\n'),
  };
}

export async function sendMail(box, code, email, subject = '', to = '') {
  if (!box || !box.ready) {
    return false;
  }
  const mailOptions = buildMail(box, code, email, subject, to);
  try {
    const transporter = nodemailer.createTransport({
      host: box.host,
      port: box.port,
      secure: box.ssl, // true cho port 465, false cho 587 (STARTTLS)
      auth: box.user ? { user: box.user, pass: box.password } : undefined,
      connectionTimeout: 20000,
    });
    await transporter.sendMail(mailOptions);
    console.log(`đã gửi mã về ${mailOptions.to}`);
    return true;
  } catch (err) {
    console.warn(`không gửi được mail báo mã tới ${mailOptions.to}: ${err.message}`);
    return false;
  }
}
