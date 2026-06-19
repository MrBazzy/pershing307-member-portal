import app from "./app";
import { logger } from "./lib/logger";
import { seedSmtpFromEnv } from "./lib/smtp-seed";
import { getLodgeId } from "./lib/config";
import { seedFolderAccessMatrix } from "./lib/matrixPermissions";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Seed SMTP database config from environment variables if any are present.
  // This keeps the admin UI in sync with env-var-based deployments.
  seedSmtpFromEnv().catch((e) =>
    logger.warn({ err: e }, "SMTP env seed skipped — lodge may not be bootstrapped yet")
  );

  // Seed the folder access matrix once at startup so all routes see
  // correct defaults without requiring a prior GET /document-folders call.
  getLodgeId()
    .then((lodgeId) => {
      if (lodgeId) return seedFolderAccessMatrix(lodgeId);
    })
    .catch((e) =>
      logger.warn({ err: e }, "Access matrix seed skipped — lodge may not be bootstrapped yet")
    );
});
