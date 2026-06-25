#!/usr/bin/env bash
# check-env.sh — Pershing307 TDA environment validator
# Alleen controleren, geen wijzigingen, geen secrets tonen.
# Gebruik: bash scripts/check-env.sh

# ---------------------------------------------------------------------------
# Kleurcodes (alleen als terminal dit ondersteunt)
# ---------------------------------------------------------------------------
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && tput colors >/dev/null 2>&1; then
  GREEN=$(tput setaf 2)
  RED=$(tput setaf 1)
  YELLOW=$(tput setaf 3)
  BOLD=$(tput bold)
  RESET=$(tput sgr0)
else
  GREEN="" RED="" YELLOW="" BOLD="" RESET=""
fi

PASS="${GREEN}✓${RESET}"
FAIL="${RED}✗${RESET}"
WARN="${YELLOW}!${RESET}"

# ---------------------------------------------------------------------------
# Vaste paden (aanpassen aan serverinrichting)
# ---------------------------------------------------------------------------
PROJECT_DIR="/home/barry/apps/pershing307"
ENV_FILE="${PROJECT_DIR}/.env"
WEBROOT="/var/www/pershing307"

# ---------------------------------------------------------------------------
# Bijhouden van fouten
# ---------------------------------------------------------------------------
ERRORS=0

ok()   { echo "  ${PASS}  $1"; }
fail() { echo "  ${FAIL}  $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo "  ${WARN}  $1"; }

section() { echo; echo "${BOLD}=== $1 ===${RESET}"; }

# ---------------------------------------------------------------------------
# Helper: controleer of een sleutel aanwezig is in .env (waarde NIET tonen)
# ---------------------------------------------------------------------------
env_key_present() {
  local key="$1"
  if [ ! -f "$ENV_FILE" ]; then
    return 1
  fi
  # Zoek naar KEY= of KEY =  (met of zonder spatie rond =)
  grep -qE "^[[:space:]]*${key}[[:space:]]*=" "$ENV_FILE" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Koptekst
# ---------------------------------------------------------------------------
echo
echo "${BOLD}=========================================${RESET}"
echo "${BOLD} Pershing307 Environment Validation${RESET}"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "${BOLD}=========================================${RESET}"

# ---------------------------------------------------------------------------
# PROJECT
# ---------------------------------------------------------------------------
section "Project"

if [ -d "$PROJECT_DIR" ]; then
  ok "Project directory aanwezig  ($PROJECT_DIR)"
else
  fail "Project directory ontbreekt  ($PROJECT_DIR)"
fi

if [ -d "${PROJECT_DIR}/.git" ]; then
  ok "Git repository aanwezig"
else
  fail "Git repository ontbreekt"
fi

if [ -f "$ENV_FILE" ]; then
  ok ".env bestand aanwezig"
else
  fail ".env bestand ontbreekt  ($ENV_FILE)"
fi

# ---------------------------------------------------------------------------
# RUNTIME
# ---------------------------------------------------------------------------
section "Runtime"

if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node --version 2>/dev/null || echo "?")
  ok "Node.js geïnstalleerd  ($NODE_VER)"
else
  fail "Node.js niet gevonden"
fi

if command -v pnpm >/dev/null 2>&1; then
  PNPM_VER=$(pnpm --version 2>/dev/null || echo "?")
  ok "pnpm geïnstalleerd  ($PNPM_VER)"
else
  fail "pnpm niet gevonden"
fi

if command -v pm2 >/dev/null 2>&1; then
  PM2_VER=$(pm2 --version 2>/dev/null || echo "?")
  ok "PM2 geïnstalleerd  ($PM2_VER)"
else
  fail "PM2 niet gevonden"
fi

# ---------------------------------------------------------------------------
# ENVIRONMENT VARIABLES (waarden worden NOOIT getoond)
# ---------------------------------------------------------------------------
section "Environment"

if [ ! -f "$ENV_FILE" ]; then
  warn "Sla Environment-checks over — .env ontbreekt"
else
  for KEY in DATABASE_URL SESSION_SECRET; do
    if env_key_present "$KEY"; then
      ok "$KEY aanwezig"
    else
      fail "$KEY MISSING"
    fi
  done

  # SMTP-sleutels zijn optioneel: WARN in plaats van FAIL
  SMTP_FOUND=0
  for KEY in SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS; do
    if env_key_present "$KEY"; then
      ok "$KEY aanwezig"
      SMTP_FOUND=$((SMTP_FOUND + 1))
    else
      warn "$KEY MISSING  (optioneel)"
    fi
  done

  if [ "$SMTP_FOUND" -eq 0 ]; then
    warn "Geen SMTP-sleutels geconfigureerd — e-mail uitgeschakeld"
  fi
fi

# ---------------------------------------------------------------------------
# DATABASE
# ---------------------------------------------------------------------------
section "Database"

if systemctl is-active --quiet postgresql 2>/dev/null; then
  ok "PostgreSQL service actief"
else
  fail "PostgreSQL service niet actief"
fi

# pg_isready controleert of de server verbindingen accepteert
if pg_isready -q 2>/dev/null; then
  ok "Database bereikbaar  (pg_isready)"
else
  fail "Database niet bereikbaar"
fi

# ---------------------------------------------------------------------------
# WEB
# ---------------------------------------------------------------------------
section "Web"

if systemctl is-active --quiet nginx 2>/dev/null; then
  ok "Nginx actief"
else
  fail "Nginx niet actief"
fi

if [ -d "$WEBROOT" ]; then
  ok "Webroot aanwezig  ($WEBROOT)"
else
  fail "Webroot ontbreekt  ($WEBROOT)"
fi

# ---------------------------------------------------------------------------
# PERMISSIONS
# ---------------------------------------------------------------------------
section "Permissions"

if [ -d "$WEBROOT" ] && [ -r "$WEBROOT" ]; then
  ok "Webroot leesbaar"
else
  fail "Webroot niet leesbaar"
fi

# Privé document-opslag via PRIVATE_OBJECT_DIR in .env
_PRIV_DIR=""
if [ -f "$ENV_FILE" ]; then
  _PRIV_DIR=$(grep -E "^[[:space:]]*PRIVATE_OBJECT_DIR[[:space:]]*=" "$ENV_FILE" \
    | head -1 | sed 's/^[^=]*=[[:space:]]*//' | tr -d '"'"'"' ' 2>/dev/null || true)
fi

if [ -z "$_PRIV_DIR" ]; then
  warn "PRIVATE_OBJECT_DIR niet geconfigureerd — document storage niet ingesteld"
elif [ -d "$_PRIV_DIR" ]; then
  ok "Privé document directory aanwezig"
else
  fail "Privé document directory ontbreekt  (pad uit PRIVATE_OBJECT_DIR)"
fi
unset _PRIV_DIR

# Publieke object zoekpaden aanwezig (waarde niet getoond)
if [ -f "$ENV_FILE" ] && env_key_present "PUBLIC_OBJECT_SEARCH_PATHS"; then
  ok "PUBLIC_OBJECT_SEARCH_PATHS geconfigureerd"
else
  warn "PUBLIC_OBJECT_SEARCH_PATHS niet geconfigureerd  (optioneel)"
fi

# ---------------------------------------------------------------------------
# DEPLOYMENT PERMISSIONS
# ---------------------------------------------------------------------------
section "Deployment Permissions"

# Helper: slaagt als sudo -n het commando uitvoert (ook al faalt het commando zelf).
# Mislukt alleen als sudo zegt dat een wachtwoord vereist is of de actie niet is toegestaan.
_check_sudo_perm() {
  local label="$1"; shift
  local _out _rc=0
  _out=$(sudo -n "$@" 2>&1 </dev/null) || _rc=$?
  if echo "$_out" | grep -qiE \
       "password is required|a password|not allowed|not in sudoers|may not run|Sorry"; then
    fail "Deployment-permissie ontbreekt: sudo ${label}  (voeg toe aan /etc/sudoers.d/barry-deploy)"
  else
    ok "sudo ${label}"
  fi
}

_check_sudo_perm "rsync --version"           rsync --version
_check_sudo_perm "chown --version"           chown --version
_check_sudo_perm "nginx -t"                  nginx -t
_check_sudo_perm "systemctl reload nginx"    systemctl reload nginx
_check_sudo_perm "ufw status"                ufw status

unset -f _check_sudo_perm

# ---------------------------------------------------------------------------
# RESULTAAT
# ---------------------------------------------------------------------------
echo
echo "${BOLD}=========================================${RESET}"
if [ "$ERRORS" -eq 0 ]; then
  echo "${GREEN}${BOLD} Environment Ready${RESET}"
else
  echo "${RED}${BOLD} Environment NOT Ready  (${ERRORS} fout(en))${RESET}"
fi
echo "${BOLD}=========================================${RESET}"
echo

exit "$ERRORS"
