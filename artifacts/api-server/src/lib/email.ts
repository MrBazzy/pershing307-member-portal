import nodemailer from "nodemailer";
import { getConfig } from "./config";
import { logger } from "./logger";

export interface SmtpDiagnostics {
  smtpPassConfigured: boolean;
  host: string | null;
  port: number;
  username: string | null;
  fromAddress: string | null;
  secure: boolean;
}

export interface SmtpSendResult {
  success: boolean;
  diagnostics: SmtpDiagnostics;
  errorCode?: string;
  errorMessage?: string;
  errorCategory?: string;
  smtpResponse?: string;
  smtpCommand?: string;
}

function categorizeError(err: unknown): Pick<
  SmtpSendResult,
  "errorCode" | "errorMessage" | "errorCategory" | "smtpResponse" | "smtpCommand"
> {
  const e = err as Record<string, unknown>;
  const code = String(e?.code ?? "");
  const message = String(e?.message ?? "Unknown error");
  const responseCode = Number(e?.responseCode ?? 0);
  const smtpResponse = e?.response ? String(e.response) : undefined;
  const smtpCommand = e?.command ? String(e.command) : undefined;

  let errorCategory = "unknown";
  if (
    code === "EAUTH" ||
    responseCode === 535 ||
    /auth|credentials|login/i.test(message)
  ) {
    errorCategory = "authentication";
  } else if (code === "ECONNREFUSED") {
    errorCategory = "connection_refused";
  } else if (
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND"
  ) {
    errorCategory = "connection_timeout";
  } else if (/ssl|tls|cert/i.test(code) || /ssl|tls|cert/i.test(message)) {
    errorCategory = "tls";
  } else if (responseCode >= 550 && responseCode < 560) {
    errorCategory = "sender_rejected";
  } else if (responseCode >= 500) {
    errorCategory = "smtp_error";
  }

  return {
    errorCode: code || (responseCode ? String(responseCode) : "UNKNOWN"),
    errorMessage: message,
    errorCategory,
    smtpResponse,
    smtpCommand,
  };
}

async function buildConfig(): Promise<{
  transporter: ReturnType<typeof nodemailer.createTransport> | null;
  from: string;
  diagnostics: SmtpDiagnostics;
}> {
  // Environment variables take priority over database config; SMTP_PASS is env-only.
  const host = process.env.SMTP_HOST ?? (await getConfig("smtp_host")) ?? null;
  const port = parseInt(
    process.env.SMTP_PORT ?? (await getConfig("smtp_port")) ?? "587",
    10
  );
  const user =
    process.env.SMTP_USER ?? (await getConfig("smtp_user")) ?? null;
  const pass = process.env.SMTP_PASS ?? null;
  const fromEmail =
    process.env.SMTP_FROM ??
    (await getConfig("smtp_from_email")) ??
    "noreply@localhost";
  const fromName =
    process.env.SMTP_FROM_NAME ??
    (await getConfig("smtp_from_name")) ??
    "Portal";
  const secure = port === 465;

  const diagnostics: SmtpDiagnostics = {
    smtpPassConfigured: !!pass,
    host,
    port,
    username: user,
    fromAddress: fromEmail,
    secure,
  };

  if (!host) {
    return { transporter: null, from: `"${fromName}" <${fromEmail}>`, diagnostics };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  return { transporter, from: `"${fromName}" <${fromEmail}>`, diagnostics };
}

/**
 * Send an email and return a detailed result including SMTP diagnostics.
 * Errors are never thrown — they are returned in the result object.
 */
export async function sendEmailDetailed(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SmtpSendResult> {
  const { transporter, from, diagnostics } = await buildConfig();

  if (!transporter) {
    logger.warn({ to: opts.to }, "Email not sent — SMTP host not configured");
    return { success: false, diagnostics };
  }

  try {
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return { success: true, diagnostics };
  } catch (err) {
    logger.error({ err, to: opts.to }, "Failed to send email");
    return { success: false, diagnostics, ...categorizeError(err) };
  }
}

/**
 * Send an email and return a simple boolean.
 * Use sendEmailDetailed when you need error context.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const result = await sendEmailDetailed(opts);
  return result.success;
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
