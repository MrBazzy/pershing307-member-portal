import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { configurationTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { getLodgeId, setConfig, getConfig } from "../lib/config";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { sendEmail } from "../lib/email";

const router = Router();

const SITE_ADMIN_LEVEL = 80;

const CONFIG_METADATA: Record<string, { description: string; isReadOnly: boolean }> = {
  lodge_name: { description: "Public name of the lodge", isReadOnly: false },
  lodge_number: { description: "Lodge number (e.g. 307)", isReadOnly: false },
  lodge_timezone: { description: "Lodge timezone identifier (e.g. America/Chicago)", isReadOnly: false },
  smtp_host: { description: "SMTP server hostname (e.g. smtp.example.com)", isReadOnly: false },
  smtp_port: { description: "SMTP server port — 587 for STARTTLS, 465 for SSL/TLS, 25 for plain", isReadOnly: false },
  smtp_user: { description: "SMTP login username", isReadOnly: false },
  smtp_from_email: { description: "From address for outgoing mail (must be a valid email)", isReadOnly: false },
  smtp_from_name: { description: "Display name shown on outgoing mail", isReadOnly: false },
  smtp_reply_to: { description: "Reply-To address for outgoing mail — leave empty to use the From address", isReadOnly: false },
  session_timeout_min: { description: "Session idle timeout in minutes (default: 480). Applies to new sessions only.", isReadOnly: false },
  lockout_max_attempts: { description: "Failed login attempts before account lockout (default: 5)", isReadOnly: false },
  lockout_duration_min: { description: "Account lockout duration in minutes (default: 15)", isReadOnly: false },
  invite_expiry_days: { description: "Days before an invitation link expires (default: 7)", isReadOnly: false },
  reset_expiry_hours: { description: "Hours before a password reset link expires (default: 1)", isReadOnly: false },
  require_2fa_roles: { description: "Comma-separated role slugs that must have 2FA enabled (e.g. site-administrator,pm-super-administrator)", isReadOnly: false },
};

type KeyValidator = (v: string) => string | null;

const KEY_VALIDATORS: Record<string, KeyValidator> = {
  smtp_port: (v) => {
    const n = parseInt(v, 10);
    if (!v.trim() || isNaN(n) || n < 1 || n > 65535) return "Must be a port number between 1 and 65535";
    return null;
  },
  smtp_from_email: (v) => {
    if (v && !z.string().email().safeParse(v).success) return "Must be a valid email address";
    return null;
  },
  smtp_reply_to: (v) => {
    if (v && !z.string().email().safeParse(v).success) return "Must be a valid email address";
    return null;
  },
  session_timeout_min: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1) return "Must be a positive integer (minutes)";
    return null;
  },
  lockout_max_attempts: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1) return "Must be a positive integer";
    return null;
  },
  lockout_duration_min: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1) return "Must be a positive integer (minutes)";
    return null;
  },
  invite_expiry_days: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1) return "Must be a positive integer (days)";
    return null;
  },
  reset_expiry_hours: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1) return "Must be a positive integer (hours)";
    return null;
  },
};

const updateSchema = z.object({
  value: z.string(),
});

const testSmtpSchema = z.object({
  to: z.string().email(),
});

router.get("/", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    res.status(500).json({ error: "Lodge not configured" });
    return;
  }

  const rows = await db
    .select({ key: configurationTable.key, value: configurationTable.value })
    .from(configurationTable)
    .where(eq(configurationTable.lodgeId, lodgeId));

  const rowMap = new Map(rows.map((r) => [r.key, r.value]));

  const config = Object.entries(CONFIG_METADATA).map(([key, meta]) => ({
    key,
    value: rowMap.get(key) ?? null,
    description: meta.description,
    isReadOnly: meta.isReadOnly,
  }));

  res.json({ config, smtpPasswordConfigured: !!process.env.SMTP_PASS });
});

router.post("/test-smtp", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const result = testSmtpSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request — provide a valid 'to' email address" });
    return;
  }

  const { to } = result.data;
  const actorId = req.session!.userId!;
  const ip = getClientIp(req);
  const lodgeId = await getLodgeId();

  const host = await getConfig("smtp_host");
  if (!host) {
    res.status(503).json({ error: "SMTP is not configured. Set smtp_host in configuration and the SMTP_PASS environment secret." });
    return;
  }

  const sent = await sendEmail({
    to,
    subject: "Pershing307 Portal — SMTP Test",
    html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
          <h2 style="color:#1a1a2e">SMTP Test Successful</h2>
          <p>This is a test email from your Pershing307 Member Portal.</p>
          <p>If you received this message, your outgoing email configuration is working correctly.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
          <p style="color:#6b7280;font-size:12px">Sent at ${new Date().toISOString()} via portal SMTP test function.</p>
        </div>
      `,
  });

  const success = sent;
  const message = sent
    ? `Test email sent successfully to ${to}.`
    : "Failed to send test email. Verify SMTP credentials (SMTP_PASS) and server settings.";

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "SMTP_TEST",
    detail: { to, success, message },
    ipAddress: ip,
  });

  if (success) {
    res.json({ success: true, message });
  } else {
    res.status(502).json({ error: "SMTP test failed", details: message });
  }
});

router.put("/:key", requireAuth(), requireRole(SITE_ADMIN_LEVEL), async (req, res) => {
  const key = String(req.params.key);

  if (!CONFIG_METADATA[key]) {
    res.status(404).json({ error: "Unknown configuration key" });
    return;
  }

  if (CONFIG_METADATA[key].isReadOnly) {
    res.status(403).json({ error: "This configuration key is read-only and cannot be modified here" });
    return;
  }

  const result = updateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const validator = KEY_VALIDATORS[key];
  if (validator) {
    const validationError = validator(result.data.value);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
  }

  const actorId = req.session!.userId!;
  const lodgeId = await getLodgeId();

  await setConfig(key, result.data.value);

  await writeAuditLog({
    lodgeId,
    actorId,
    action: "CONFIG_CHANGED",
    detail: { key, value: result.data.value },
    ipAddress: getClientIp(req),
  });

  res.json({ success: true });
});

export default router;
