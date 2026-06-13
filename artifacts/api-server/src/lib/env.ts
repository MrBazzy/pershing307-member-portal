export function getAppEnv(): string {
  return (process.env.APP_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
}

export function isProductionEnv(): boolean {
  const env = getAppEnv();
  return env === "production" || env === "prod";
}

export function isTestResetEnabled(): boolean {
  if (isProductionEnv()) return false;
  const env = getAppEnv();
  return ["development", "dev", "test", "tda", "staging"].includes(env);
}
