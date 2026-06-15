const ENV_NAME = (import.meta.env.VITE_ENV_NAME ?? "").toUpperCase().trim();
const ENV_LABEL_OVERRIDE = (import.meta.env.VITE_ENV_LABEL ?? "").trim();

const MIDNIGHT_BLUE = "#0B1F3A";
const MASONIC_GOLD = "#D4AF37";

const DEFAULT_LABELS: Record<string, string> = {
  TDA: "Test & Acceptance",
  DEV: "Development",
  UAT: "User Acceptance Testing",
  STG: "Staging",
  QA: "Quality Assurance",
};

function deriveLabel(name: string): string {
  return ENV_LABEL_OVERRIDE || DEFAULT_LABELS[name] || name;
}

export function EnvBannerSidebar() {
  if (!ENV_NAME || ENV_NAME === "PRD") return null;
  const label = deriveLabel(ENV_NAME);
  return (
    <div
      className="mx-3 mt-2.5 rounded-sm px-2.5 py-1.5 text-center"
      style={{ backgroundColor: MASONIC_GOLD }}
      data-testid="env-banner-sidebar"
      aria-label={`${ENV_NAME} environment — ${label}`}
    >
      <p
        className="text-[10px] font-bold tracking-widest uppercase leading-tight"
        style={{ color: MIDNIGHT_BLUE }}
      >
        {ENV_NAME} Environment
      </p>
      <p
        className="text-[9px] leading-tight mt-0.5"
        style={{ color: MIDNIGHT_BLUE, opacity: 0.75 }}
      >
        {label}
      </p>
    </div>
  );
}

export function EnvBannerAuth() {
  if (!ENV_NAME || ENV_NAME === "PRD") return null;
  const label = deriveLabel(ENV_NAME);
  return (
    <div className="mt-2 flex justify-center" data-testid="env-banner-auth">
      <span
        className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] font-semibold"
        style={{ backgroundColor: MASONIC_GOLD, color: MIDNIGHT_BLUE }}
        aria-label={`${ENV_NAME} environment — ${label}`}
      >
        <span className="font-bold tracking-wider uppercase">{ENV_NAME} Environment</span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span className="font-normal">{label}</span>
      </span>
    </div>
  );
}

export function EnvBannerMobilePill() {
  if (!ENV_NAME || ENV_NAME === "PRD") return null;
  return (
    <span
      className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase leading-tight"
      style={{ backgroundColor: MASONIC_GOLD, color: MIDNIGHT_BLUE }}
      data-testid="env-banner-mobile"
      aria-label={`${ENV_NAME} environment`}
    >
      {ENV_NAME}
    </span>
  );
}
