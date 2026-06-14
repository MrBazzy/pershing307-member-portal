import nodemailer from "nodemailer";
import { getConfig } from "./config";
import { logger } from "./logger";

async function createTransport() {
  // Environment variables take priority over database config; SMTP_PASS is env-only.
  const host = process.env.SMTP_HOST ?? await getConfig("smtp_host");
  const port = parseInt(process.env.SMTP_PORT ?? (await getConfig("smtp_port")) ?? "587", 10);
  const user = process.env.SMTP_USER ?? await getConfig("smtp_user");
  const pass = process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM ?? (await getConfig("smtp_from_email")) ?? "noreply@localhost";
  const fromName = process.env.SMTP_FROM_NAME ?? (await getConfig("smtp_from_name")) ?? "Portal";

  if (!host) {
    return null;
  }

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    }),
    from: `"${fromName}" <${fromEmail}>`,
  };
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const transport = await createTransport();
  if (!transport) {
    logger.warn({ to: opts.to, subject: opts.subject }, "Email not sent — SMTP not configured");
    return false;
  }

  try {
    await transport.transporter.sendMail({
      from: transport.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return true;
  } catch (err) {
    logger.error({ err, to: opts.to }, "Failed to send email");
    return false;
  }
}

export function invitationEmailHtml(opts: {
  firstName: string;
  lodgeName: string;
  inviteUrl: string;
  expiryDays: number;
}): string {
  return `
    <p>Dear ${opts.firstName},</p>
    <p>You have been invited to join the ${opts.lodgeName} Member Portal.</p>
    <p>Please click the link below to accept your invitation and create your account:</p>
    <p><a href="${opts.inviteUrl}">${opts.inviteUrl}</a></p>
    <p>This invitation expires in ${opts.expiryDays} days.</p>
    <p>If you did not expect this invitation, please disregard this email.</p>
  `;
}

export function passwordResetEmailHtml(opts: {
  firstName: string;
  lodgeName: string;
  resetUrl: string;
}): string {
  return `
    <p>Dear ${opts.firstName},</p>
    <p>A password reset was requested for your ${opts.lodgeName} Member Portal account.</p>
    <p>Click the link below to set a new password:</p>
    <p><a href="${opts.resetUrl}">${opts.resetUrl}</a></p>
    <p>This link expires in 1 hour.</p>
    <p>If you did not request a password reset, please contact your administrator.</p>
  `;
}
