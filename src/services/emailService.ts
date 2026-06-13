import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = env.SMTP_USER
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  if (!transporter) {
    console.log(`[Email stub] To: ${to}, Subject: ${subject}`);
    return;
  }

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
  });
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  await sendEmail(
    to,
    'Your ExpenseFlow Login Code',
    `<p>Your OTP code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`
  );
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/verify-email?token=${token}`;
  await sendEmail(
    to,
    'Verify your ExpenseFlow account',
    `<p>Click <a href="${link}">here</a> to verify your email address.</p>`
  );
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/reset-password?token=${token}`;
  await sendEmail(
    to,
    'Reset your ExpenseFlow password',
    `<p>Click <a href="${link}">here</a> to reset your password. Link expires in 1 hour.</p>`
  );
}
