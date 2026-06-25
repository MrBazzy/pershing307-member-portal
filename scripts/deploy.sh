#!/usr/bin/env bash
# deploy.sh — Pershing307 TDA safe deployment script
# Werkt op een bestaande installatie. Voert geen database resets uit.
# Gebruik: bash scripts/deploy.sh
#
# Vereiste passwordless sudo-rechten op de server (zie docs/operations/):
#   barry ALL=(ALL) NOPASSWD: /usr/bin/rsync
#   barry ALL=(ALL) NOPASSWD: /usr/bin/chown
#   barry ALL=(ALL) NOPASSWD: /usr/sbin/nginx
#   barry ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx

set -euo pipefail

# ---------------------------------------------------------------------------
# Kleurcodes
# ---------------------------------------------------------------------------
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && tput colors >/dev/null 2>&1; then
  GREEN=$(tput setaf 2); RED=$(tput setaf 1); YELLOW=$(tput setaf 3)
  BOLD=$(tput bold); RESET=$(tput sgr0)
else
  GREEN="" RED="" YELLOW="" BOLD="" RESET=""
fi

# ---------------------------------------------------------------------------
# Constanten
# ---------------------------------------------------------------------------
PROJECT_DIR="/home/barry/apps/pershing307"
WEBROOT="/var/www/pershing307"
PM2_PROCESS="pershing307-api"
STEP=0
_DEPLOY_START=$(date +%s)
_STEP_START=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
step() {
  # Sluit vorige stap af met timing
  if [ "$_STEP_START" -gt 0 ]; then
    _STEP_END=$(date +%s)
    _DUR=$(( _STEP_END - _STEP_START ))
    echo "  Finished: $(date '+%H:%M:%S')  |  Duration: ${_DUR} sec"
  fi
  STEP=$(( STEP + 1 ))
  _STEP_START=$(date +%s)
  echo
  echo "${BOLD}[Stap ${STEP}] $1${RESET}"
  echo "  Started : $(date '+%H:%M:%S')"
}

finish_last_step() {
  if [ "$_STEP_START" -gt 0 ]; then
    _STEP_END=$(date +%s)
    _DUR=$(( _STEP_END - _STEP_START ))
    echo "  Finished: $(date '+%H:%M:%S')  |  Duration: ${_DUR} sec"
    _STEP_START=0
  fi
}

ok()   { echo "  ${GREEN}OK${RESET}  $1"; }
fail() {
  echo
  echo "${RED}${BOLD}==========================================${RESET}"
  echo "${RED}${BOLD} Deployment failed at step ${STEP}: $1${RESET}"
  echo "${RED}${BOLD}==========================================${RESET}"
  echo
  exit 1
}
info() { echo "  ${YELLOW}--${RESET}  $1"; }

# preflight_fail: stopt deployment met gebruikersgericht advies (vóór stap 1)
preflight_fail() {
  local check="$1"
  local advice="$2"
  echo
  echo "${RED}${BOLD}==========================================${RESET}"
  echo "${RED}${BOLD} Preflight check mislukt: ${check}${RESET}"
  echo "${RED}${BOLD}==========================================${RESET}"
  echo "  ${advice}"
  echo
  exit 1
}

# ---------------------------------------------------------------------------
# Koptekst
# ---------------------------------------------------------------------------
echo
echo "${BOLD}==========================================${RESET}"
echo "${BOLD} Pershing307 Deployment${RESET}"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "${BOLD}==========================================${RESET}"

# ---------------------------------------------------------------------------
# PREFLIGHT CHECKS — vóór deployment
# ---------------------------------------------------------------------------
echo
echo "${BOLD}=== Preflight ===${RESET}"

# 1. GitHub SSH bereikbaar
_SSH_OUT=$(ssh -T git@github.com \
  -o ConnectTimeout=10 \
  -o BatchMode=yes \
  -o StrictHostKeyChecking=accept-new \
  2>&1 || true)
if echo "$_SSH_OUT" | grep -q "successfully authenticated"; then
  ok "GitHub SSH bereikbaar"
else
  preflight_fail "GitHub SSH niet bereikbaar" \
    "Controleer of de SSH-sleutel van deze server is toegevoegd aan GitHub.\n  Voer uit: ssh-keygen -t ed25519 && cat ~/.ssh/id_ed25519.pub\n  Voeg de sleutel toe via: https://github.com/settings/keys"
fi
unset _SSH_OUT

# 2. Huidige branch is main
_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [ "$_BRANCH" = "main" ]; then
  ok "Huidige branch is main"
else
  preflight_fail "Verkeerde branch: ${_BRANCH}" \
    "Deployment vereist de main-branch.\n  Schakel over met: git checkout main"
fi
unset _BRANCH

# 3. Working tree is clean
_DIRTY=$(git status --porcelain 2>/dev/null)
if [ -z "$_DIRTY" ]; then
  ok "Working tree is schoon"
else
  echo "  Gewijzigde bestanden:"
  echo "$_DIRTY" | head -10 | sed 's/^/    /'
  preflight_fail "Uncommitted wijzigingen aanwezig" \
    "Commit of stash de wijzigingen eerst:\n  git stash   of   git commit -am 'beschrijving'"
fi
unset _DIRTY

# 4 & 5. Ahead / behind origin/main (haal eerst remote refs op)
git fetch origin main --quiet 2>/dev/null || true

_AHEAD=$(git rev-list origin/main..HEAD --count 2>/dev/null || echo "0")
_BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "0")

if [ "$_AHEAD" -gt 0 ]; then
  preflight_fail "Lokale branch is ${_AHEAD} commit(s) voor op origin/main" \
    "Er staan lokale commits die nog niet naar GitHub zijn gepusht.\n  Push eerst: git push origin main"
fi
ok "Lokale branch is niet ahead van origin/main"

if [ "$_BEHIND" -gt 0 ]; then
  preflight_fail "Lokale branch is ${_BEHIND} commit(s) achter op origin/main" \
    "De server heeft niet de laatste code. Dit zou git pull moeten oplossen.\n  Voer uit: git pull origin main"
fi
ok "Lokale branch is niet behind origin/main"

unset _AHEAD _BEHIND

echo "  ${GREEN}Preflight geslaagd — deployment start${RESET}"

# ---------------------------------------------------------------------------
# Stap 1 — Controleer working directory
# ---------------------------------------------------------------------------
step "Controleer working directory"

CURRENT_DIR=$(pwd)
if [ "$CURRENT_DIR" != "$PROJECT_DIR" ]; then
  fail "Script moet vanuit ${PROJECT_DIR} worden uitgevoerd (nu: ${CURRENT_DIR})"
fi
ok "Working directory correct  ($PROJECT_DIR)"

# Laad .env in de omgeving voor subprocessen (waarden worden nooit geprint)
if [ ! -f "${PROJECT_DIR}/.env" ]; then
  fail ".env bestand ontbreekt in ${PROJECT_DIR}"
fi
set -a
# shellcheck source=/dev/null
source "${PROJECT_DIR}/.env"
set +a
ok ".env geladen in omgeving"

# ---------------------------------------------------------------------------
# Stap 2 — Controleer git status (geen lokale wijzigingen)
# ---------------------------------------------------------------------------
step "Controleer git status"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  fail "Geen git repository gevonden in $PROJECT_DIR"
fi

DIRTY=$(git status --porcelain 2>/dev/null)
if [ -n "$DIRTY" ]; then
  echo "  Lokale wijzigingen gevonden:"
  git status --short 2>/dev/null | head -20 | sed 's/^/    /'
  fail "Er zijn uncommitted lokale wijzigingen — commit of stash eerst"
fi
ok "Working tree schoon"

# ---------------------------------------------------------------------------
# Stap 3 — git pull
# ---------------------------------------------------------------------------
step "git pull"

PULL_OUT=$(git pull 2>&1) || fail "git pull mislukt"
echo "$PULL_OUT" | sed 's/^/  /'
ok "Code bijgewerkt"

# ---------------------------------------------------------------------------
# Stap 4 — Environment validatie
# ---------------------------------------------------------------------------
step "Environment validatie (check-env.sh)"

if [ ! -x "${PROJECT_DIR}/scripts/check-env.sh" ]; then
  fail "scripts/check-env.sh niet gevonden of niet uitvoerbaar"
fi

ENV_OUT=$(bash "${PROJECT_DIR}/scripts/check-env.sh" 2>&1) || true
echo "$ENV_OUT"

if echo "$ENV_OUT" | grep -q "Environment NOT Ready"; then
  fail "Environment niet gereed — deployment gestopt"
fi
ok "Environment gereed"

# ---------------------------------------------------------------------------
# Stap 5 — Health check (voor deployment)
# ---------------------------------------------------------------------------
step "Health check voor deployment (health.sh)"

if [ ! -x "${PROJECT_DIR}/scripts/health.sh" ]; then
  fail "scripts/health.sh niet gevonden of niet uitvoerbaar"
fi

HEALTH_OUT=$(bash "${PROJECT_DIR}/scripts/health.sh" 2>&1) || true
echo "$HEALTH_OUT"

HEALTH_FAILS=$(echo "$HEALTH_OUT" | grep -c "^\[FAIL\]" || true)
if [ "$HEALTH_FAILS" -gt 0 ]; then
  fail "${HEALTH_FAILS} kritieke check(s) falen — deployment gestopt"
fi
ok "Server gezond voor deployment"

# ---------------------------------------------------------------------------
# Stap 6 — pnpm install
# ---------------------------------------------------------------------------
step "pnpm install"

pnpm install --frozen-lockfile 2>&1 | tail -5 | sed 's/^/  /' \
  || fail "pnpm install mislukt"
ok "Afhankelijkheden geïnstalleerd"

# ---------------------------------------------------------------------------
# Stap 7 — pnpm build
# ---------------------------------------------------------------------------
step "pnpm build"

pnpm build 2>&1 | tail -10 | sed 's/^/  /' \
  || fail "pnpm build mislukt"
ok "Build geslaagd"

# ---------------------------------------------------------------------------
# Stap 8 — Database schema update (drizzle push)
# ---------------------------------------------------------------------------
step "Database schema update"

if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL missing from environment. Controleer of DATABASE_URL aanwezig is in ${PROJECT_DIR}/.env"
fi
ok "DATABASE_URL aanwezig"

(cd lib/db && pnpm push 2>&1 | sed 's/^/  /') \
  || fail "Database schema update mislukt"
ok "Schema bijgewerkt"

# ---------------------------------------------------------------------------
# Stap 9 — Frontend kopiëren naar webroot
# ---------------------------------------------------------------------------
step "Frontend kopiëren naar webroot"

if [ ! -d "${PROJECT_DIR}/artifacts/portal/dist/public" ]; then
  fail "Build directory ontbreekt: artifacts/portal/dist/public"
fi

sudo -n rsync -av --delete \
  "${PROJECT_DIR}/artifacts/portal/dist/public/" \
  "${WEBROOT}/" 2>&1 | tail -5 | sed 's/^/  /' \
  || fail "rsync naar webroot mislukt (sudo rsync vereist passwordless sudo)"
ok "Frontend gekopieerd naar $WEBROOT"

# ---------------------------------------------------------------------------
# Stap 10 — Rechten webroot
# ---------------------------------------------------------------------------
step "Rechten instellen op webroot"

sudo -n chown -R www-data:www-data "${WEBROOT}" \
  || fail "chown webroot mislukt (sudo chown vereist passwordless sudo)"
ok "Rechten ingesteld  (www-data)"

# ---------------------------------------------------------------------------
# Stap 11 — API herstarten
# ---------------------------------------------------------------------------
step "API herstarten (PM2)"

pm2 restart "$PM2_PROCESS" 2>&1 | sed 's/^/  /' \
  || fail "pm2 restart $PM2_PROCESS mislukt"
ok "PM2 proces $PM2_PROCESS herstart"

# ---------------------------------------------------------------------------
# Stap 12 — Nginx configuratie testen
# ---------------------------------------------------------------------------
step "Nginx configuratie testen"

sudo -n nginx -t 2>&1 | sed 's/^/  /' \
  || fail "nginx -t mislukt — configuratiefout gevonden"
ok "Nginx configuratie geldig"

# ---------------------------------------------------------------------------
# Stap 13 — Nginx herladen
# ---------------------------------------------------------------------------
step "Nginx herladen"

sudo -n systemctl reload nginx 2>&1 | sed 's/^/  /' \
  || fail "nginx reload mislukt"
ok "Nginx herladen"

# ---------------------------------------------------------------------------
# Stap 14 — Health check na deployment
# ---------------------------------------------------------------------------
step "Health check na deployment (health.sh)"

HEALTH_OUT2=$(bash "${PROJECT_DIR}/scripts/health.sh" 2>&1) || true
echo "$HEALTH_OUT2"

POST_FAILS=$(echo "$HEALTH_OUT2" | grep -c "^\[FAIL\]" || true)
if [ "$POST_FAILS" -gt 0 ]; then
  fail "${POST_FAILS} check(s) falen na deployment — controleer de server"
fi
ok "Server gezond na deployment"

# ---------------------------------------------------------------------------
# Stap 15 — Afsluiting
# ---------------------------------------------------------------------------
finish_last_step
_TOTAL=$(( $(date +%s) - _DEPLOY_START ))

echo
echo "${GREEN}${BOLD}==========================================${RESET}"
echo "${GREEN}${BOLD} Deployment successful  (${STEP} stappen)${RESET}"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "${GREEN}${BOLD} Total deployment time: ${_TOTAL} sec${RESET}"
echo "${GREEN}${BOLD}==========================================${RESET}"
echo
