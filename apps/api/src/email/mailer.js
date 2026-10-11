import nodemailer from 'nodemailer';

export class EmailDeliveryError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'EmailDeliveryError';
  }
}

function readSmtpConfiguration() {
  const host = process.env.MAIL_HOST?.trim();
  const port = Number(process.env.MAIL_PORT);
  const user = process.env.MAIL_USER?.trim();
  const password = process.env.MAIL_PASS;
  const from = process.env.MAIL_FROM?.trim() || user;
  if (
    !host ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !from ||
    Boolean(user) !== Boolean(password)
  ) {
    return null;
  }
  return { host, port, user, password, from };
}

export function isEmailConfigured() {
  return readSmtpConfiguration() !== null;
}

export async function sendEmail({ to, subject, text }) {
  const configuration = readSmtpConfiguration();
  if (!configuration) {
    return { sent: false, reason: 'not_configured' };
  }
  const transporter = nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.port === 465,
    ...(configuration.user
      ? { auth: { user: configuration.user, pass: configuration.password } }
      : {}),
  });
  try {
    await transporter.sendMail({
      from: configuration.from,
      to,
      subject,
      text,
    });
  } catch (error) {
    throw new EmailDeliveryError('The email provider could not deliver the message.', { cause: error });
  }
  return { sent: true };
}
