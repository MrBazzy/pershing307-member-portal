import { getLodgeId, setConfig } from "./config";
import { logger } from "./logger";

const ENV_TO_DB: { env: string; key: string }[] = [
  { env: "SMTP_HOST", key: "smtp_host" },
  { env: "SMTP_PORT", key: "smtp_port" },
  { env: "SMTP_USER", key: "smtp_user" },
  { env: "SMTP_FROM", key: "smtp_from_email" },
  { env: "SMTP_FROM_NAME", key: "smtp_from_name" },
];

/**
 * On startup: if any SMTP environment variables are set, write them into the
 * database configuration table so the admin UI reflects the live values.
 * SMTP_PASS is intentionally excluded — it is never stored in the database.
 */
export async function seedSmtpFromEnv(): Promise<void> {
  const lodgeId = await getLodgeId();
  if (!lodgeId) {
    // Lodge has not been bootstrapped yet — nothing to seed.
    return;
  }

  const seeded: string[] = [];
  for (const { env, key } of ENV_TO_DB) {
    const val = process.env[env];
    if (val) {
      await setConfig(key, val);
      seeded.push(env);
    }
  }

  if (seeded.length > 0) {
    logger.info({ vars: seeded }, "SMTP configuration seeded from environment variables");
  }
}
