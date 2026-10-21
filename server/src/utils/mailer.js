import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// One transport for the whole process. Created lazily so importing this module never
// touches the network; without SMTP_HOST nothing is created at all.
let transporter;

function getTransporter() {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

// Test seam (same spirit as document.service.flushForTest): in the test environment
// messages are captured instead of sent, so suites can read the token out of the link.
export const outbox = [];

// Delivery is never allowed to break the request that triggered it: a failed email must
// not roll back a registration or leak anything through an error response.
export async function sendMail({ to, subject, text }) {
  if (env.NODE_ENV === 'test') {
    outbox.push({ to, subject, text });
    return;
  }

  const transport = getTransporter();
  if (!transport) {
    // Development convenience: no mail server needed - the link is printed to the console.
    logger.warn({ to, subject }, 'SMTP_HOST not set; printing email instead of sending');
    logger.warn(`\n--- email to ${to} (${subject}) ---\n${text}\n--- end email ---`);
    return;
  }

  try {
    await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send email');
  }
}
