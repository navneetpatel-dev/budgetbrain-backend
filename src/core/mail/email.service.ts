import nodemailer from 'nodemailer';
import { env } from '@config/env';
import {
  renderEmailLayout,
  emailHeading,
  emailParagraph,
  emailButton,
  emailCodeBox,
  emailNote,
  emailLinkFallback,
  escapeHtml,
} from './emailTemplates';

const transporter = env.SMTP_USER
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: EmailAttachment[],
  text?: string
): Promise<void> {
  if (!transporter) {
    console.log(
      `[Email stub] To: ${to}, Subject: ${subject}${attachments?.length ? `, Attachments: ${attachments.map((a) => a.filename).join(', ')}` : ''}`
    );
    return;
  }

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
    attachments,
  });
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const bodyHtml = [
    emailHeading('Your login code'),
    emailParagraph('Enter this code to sign in to your BudgetBrain account:'),
    emailCodeBox(otp),
    emailNote('This code expires in <strong>10 minutes</strong>. If you didn’t request it, you can safely ignore this email.'),
  ].join('\n');

  await sendEmail(
    to,
    'Your BudgetBrain login code',
    renderEmailLayout({ preheader: `Your login code is ${otp}`, bodyHtml }),
    undefined,
    `Your BudgetBrain login code is: ${otp}\n\nThis code expires in 10 minutes. If you didn't request it, you can safely ignore this email.`
  );
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/verify-email?token=${token}`;
  const bodyHtml = [
    emailHeading('Verify your email address'),
    emailParagraph('Welcome to BudgetBrain! Confirm your email address to finish setting up your account.'),
    emailButton('Verify Email Address', link),
    emailLinkFallback(link),
    emailNote('This link expires in <strong>24 hours</strong>. If you didn’t create a BudgetBrain account, you can safely ignore this email.'),
  ].join('\n');

  await sendEmail(
    to,
    'Verify your BudgetBrain account',
    renderEmailLayout({ preheader: 'Confirm your email to finish setting up BudgetBrain', bodyHtml }),
    undefined,
    `Welcome to BudgetBrain! Verify your email address by opening this link:\n${link}\n\nThis link expires in 24 hours. If you didn't create a BudgetBrain account, you can safely ignore this email.`
  );
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/reset-password?token=${token}`;
  const bodyHtml = [
    emailHeading('Reset your password'),
    emailParagraph('We received a request to reset the password for your BudgetBrain account.'),
    emailButton('Reset Password', link),
    emailLinkFallback(link),
    emailNote('This link expires in <strong>1 hour</strong>. If you didn’t request a password reset, you can safely ignore this email — your password won’t be changed.'),
  ].join('\n');

  await sendEmail(
    to,
    'Reset your BudgetBrain password',
    renderEmailLayout({ preheader: 'Reset the password for your BudgetBrain account', bodyHtml }),
    undefined,
    `We received a request to reset your BudgetBrain password. Open this link to choose a new one:\n${link}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't be changed.`
  );
}

export async function sendFamilyInviteEmail(
  to: string,
  token: string,
  groupName: string,
  inviterName: string
): Promise<void> {
  const link = `${env.APP_URL}/family/accept-invite?token=${token}`;
  const safeGroupName = escapeHtml(groupName);
  const safeInviterName = escapeHtml(inviterName);
  const bodyHtml = [
    emailHeading('You’re invited to a family group'),
    emailParagraph(`<strong>${safeInviterName}</strong> has invited you to join their family group <strong>“${safeGroupName}”</strong> on BudgetBrain — track shared expenses and split bills together.`),
    emailButton('Accept Invite', link),
    emailLinkFallback(link),
    emailNote('This invite expires in <strong>7 days</strong>. If you weren’t expecting this, you can safely ignore this email.'),
  ].join('\n');

  await sendEmail(
    to,
    `${inviterName} invited you to join "${groupName}" on BudgetBrain`,
    renderEmailLayout({ preheader: `${inviterName} invited you to join "${groupName}" on BudgetBrain`, bodyHtml }),
    undefined,
    `${inviterName} has invited you to join their family group "${groupName}" on BudgetBrain.\n\nAccept the invite here:\n${link}\n\nThis invite expires in 7 days. If you weren't expecting this, you can safely ignore this email.`
  );
}

export async function sendMonthlyReportEmail(
  to: string,
  name: string | null,
  periodLabel: string,
  attachment: EmailAttachment
): Promise<void> {
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi there,';
  const bodyHtml = [
    emailHeading(`Your ${periodLabel} report is ready`),
    emailParagraph(`${greeting} attached is your BudgetBrain spending report for <strong>${escapeHtml(periodLabel)}</strong> — a full breakdown of income, expenses, and net savings for the month.`),
    emailNote('You’re receiving this because you opted in to monthly report emails. You can turn these off anytime from Settings → Notifications.'),
  ].join('\n');

  await sendEmail(
    to,
    `Your BudgetBrain report for ${periodLabel}`,
    renderEmailLayout({ preheader: `Your BudgetBrain spending report for ${periodLabel} is attached`, bodyHtml }),
    [attachment],
    `${name ? `Hi ${name},` : 'Hi there,'} attached is your BudgetBrain spending report for ${periodLabel}.\n\nYou're receiving this because you opted in to monthly report emails. You can turn these off anytime from Settings > Notifications.`
  );
}
