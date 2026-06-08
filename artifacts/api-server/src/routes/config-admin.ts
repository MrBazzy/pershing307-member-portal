import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { configurationTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { getLodgeId, setConfig } from "../lib/config";
import { writeAuditLog, getClientIp } from "../lib/audit";
import { sendEmail } from "../lib/email";

const router = Router();

const SITE_ADMIN_LEVEL = 80;

const READ_ONLY_KEYS = new Set([
  "lodge_name",
  "lodge_number",
  "lodge_timezone",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_from_email",
  "smtp_from_name",
]);

const CONFIG_METADATA: Record<string, { description: string; isReadOnly: boolean }> = {
  lodge_name: { description: "Name of the lodge", isReadOnly: true },
  lodge_number: { description: "Lodge number", isReadOnly: true },
  lodge_timezone: { description: "Lodge timezone", isReadOnly: true },
  smtp_host: { description: "SMTP server hostname (SMTP_PASS must be set as an environment secret)", isReadOnly: true },
  smtp_port: { description: "SMTP server port", isReadOnly: true },
  smtp_user: { description: "SMTP login username", isReadOnly: true },
  smtp_from_email: { description: "From email address for outgoing mail", isReadOnly: true },
  smtp_from_name: { description: "Display name for outgoing mail", isReadOnly: true },
  session_timeout_min: { description: "Session idle timeout in minutes (default: 480)", isReadOnly: false },
  lockout_max_attempts: { description: "Failed login attempts before account lockout (default: 5)", isReadOnly: false },
  lockout_duration_min: { description: "Account lockout duration in minutes (default: 15)", isReadOnly: false },
  invite_expiry_days: { description: "Days before an invitation link expires (default: 7)", isReadOnly: false },
  reset_expiry_hours: { description: "Hours before a password reset link expires (default: 1)", isReadOnly: false },
  require_2fa_roles: { description: "Comma-separated role slugs that must have 2FA enabled (e.g. site-administrator,pm-super-administrator)", isReadOnly: false },
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

  res.json({ config });
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

  const smtpOk = !!(process.env.SMTP_PASS && process.env.SMTP_HOST);
  if (!smtpOk) {
    res.status(503).json({ error: "SMTP is not configured. Set SMTP_HOST and SMTP_PASS environment secrets." });
    return;
  }

  let success = false;
  let message = "";

  try {
    await sendEmail({
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
    success = true;
    message = `Test email sent successfully to ${to}.`;
  } catch (err: any) {
    success = false;
    message = err?.message ?? "Unknown error";
  }

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

  if (READ_ONLY_KEYS.has(key)) {
    res.status(403).json({ error: "This configuration key is read-only and cannot be modified here" });
    return;
  }

  const result = updateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
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
