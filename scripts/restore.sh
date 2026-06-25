#!/usr/bin/env bash
# restore.sh — Pershing307 TDA server restore vanuit backup
# Gebruik: bash scripts/restore.sh
#
# Herstelt een eerder gemaakte backup (gemaakt door backup.sh):
#   - .env bestand
#   - private/ map (indien aanwezig in backup)
#   - PostgreSQL database (pg_restore)
#
# WAARSCHUWING: Dit script overschrijft bestaande data.
# Expliciete bevestiging (typ: RESTORE) is vereist.
# Secrets worden nooit op het scherm getoond.

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
BACKUP_ROOT="${PROJECT_DIR}/backups"
PM2_PROCESS="pershing307-api"
RESTORE_TMP=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
ok()      { echo "  ${GREEN}OK${RESET}  $1"; }
fail()    {
  echo
  echo "${RED}${BOLD}==========================================${RESET}"
  echo "${RED}${BOLD} Restore failed: $1${RESET}"
  echo "${RED}${BOLD}==========================================${RESET}"
  echo
  exit 1
}
warn()    { echo "  ${YELLOW}!!${RESET}  $1"; }
info()    { echo "  --  $1"; }
section() { echo; echo "${BOLD}=== $1 ===${RESET}"; echo; }

# Ruim tijdelijke extractiemap op bij elk exit (normaal of bij fout)
_cleanup() {
  [ -n "${RESTORE_TMP:-}" ] && rm -rf "$RESTORE_TMP" 2>/dev/null || true
}
trap _cleanup EXIT

# ---------------------------------------------------------------------------
# Koptekst
# ---------------------------------------------------------------------------
echo
echo "${BOLD}==========================================${RESET}"
echo "${BOLD} Pershing307 Restore${RESET}"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "${BOLD}==========================================${RESET}"
echo
echo "${RED}${BOLD}  WAARSCHUWING${RESET}"
echo "${RED}  Dit script overschrijft de bestaande database,"
echo "  .env en private/ map met de geselecteerde backup.${RESET}"
echo

# ---------------------------------------------------------------------------
# Working directory
# ---------------------------------------------------------------------------
CURRENT_DIR=$(pwd)
if [ "$CURRENT_DIR" != "$PROJECT_DIR" ]; then
  fail "Script moet vanuit ${PROJECT_DIR} worden uitgevoerd (nu: ${CURRENT_DIR})"
fi

# ---------------------------------------------------------------------------
# Stap 1 — Beschikbare backups tonen
# ---------------------------------------------------------------------------
section "Stap 1 — Beschikbare backups"

# Verzamel .tar.gz bestanden, nieuwste eerst
BACKUPS=()
while IFS= read -r f; do
  BACKUPS+=("$f")
done < <(ls -t "${BACKUP_ROOT}"/*.tar.gz 2>/dev/null || true)

if [ "${#BACKUPS[@]}" -eq 0 ]; then
  fail "Geen backups gevonden in ${BACKUP_ROOT}/  (maak eerst een backup met scripts/backup.sh)"
fi

for i in "${!BACKUPS[@]}"; do
  BNAME=$(basename "${BACKUPS[$i]}")
  BSIZE=$(du -sh "${BACKUPS[$i]}" 2>/dev/null | cut -f1 || echo "?")
  printf "    [%d] %s  (%s)\n" "$((i + 1))" "$BNAME" "$BSIZE"
done
echo

# ---------------------------------------------------------------------------
# Stap 2 — Backup kiezen
# ---------------------------------------------------------------------------
CHOSEN_IDX=""
while true; do
  printf "  Kies een backup [1-%d]: " "${#BACKUPS[@]}"
  read -r CHOSEN_IDX
  if [[ "${CHOSEN_IDX}" =~ ^[0-9]+$ ]] &&
     [ "${CHOSEN_IDX}" -ge 1 ] &&
     [ "${CHOSEN_IDX}" -le "${#BACKUPS[@]}" ]; then
    break
  fi
  echo "  Ongeldige keuze — vul een getal in tussen 1 en ${#BACKUPS[@]}."
done

SELECTED_ARCHIVE="${BACKUPS[$((CHOSEN_IDX - 1))]}"
SELECTED_NAME=$(basename "$SELECTED_ARCHIVE" .tar.gz)
ok "Geselecteerd: $(basename "${SELECTED_ARCHIVE}")"

# ---------------------------------------------------------------------------
# Stap 3 — Backup uitpakken en inspecteren
# ---------------------------------------------------------------------------
section "Stap 3 — Backup inspecteren"

RESTORE_TMP=$(mktemp -d "${PROJECT_DIR}/.restore-tmp-XXXXXX")
tar -xzf "${SELECTED_ARCHIVE}" -C "${RESTORE_TMP}" \
  || fail "Archief kan niet worden uitgepakt: $(basename "${SELECTED_ARCHIVE}")"

RESTORE_DIR="${RESTORE_TMP}/${SELECTED_NAME}"
if [ ! -d "${RESTORE_DIR}" ]; then
  fail "Verwachte map ontbreekt in archief: ${SELECTED_NAME}/"
fi

BACKUP_TS=$(cat  "${RESTORE_DIR}/timestamp.txt"   2>/dev/null || echo "onbekend")
BACKUP_GIT=$(cat "${RESTORE_DIR}/git-commit.txt"  2>/dev/null || echo "onbekend")
HAS_ENV=$(    [ -f "${RESTORE_DIR}/.env"            ] && echo "ja" || echo "nee")
HAS_DB=$(     [ -f "${RESTORE_DIR}/database.dump"   ] && echo "ja" || echo "nee")
HAS_PRIVATE=$([ -d "${RESTORE_DIR}/private"         ] && echo "ja" || echo "nee")

echo "  Backup-datum     : ${BACKUP_TS}"
echo "  Git commit       : ${BACKUP_GIT}"
echo
echo "  Te herstellen:"
printf "    %-22s %s\n" "database.dump"  "${HAS_DB}"
printf "    %-22s %s\n" ".env"           "${HAS_ENV}"
printf "    %-22s %s\n" "private/"       "${HAS_PRIVATE}"
echo

[ "${HAS_DB}"  = "ja" ] || fail "Backup onvolledig: database.dump ontbreekt"
[ "${HAS_ENV}" = "ja" ] || fail "Backup onvolledig: .env ontbreekt"

ok "Backup is compleet en leesbaar"

# ---------------------------------------------------------------------------
# Stap 4 — Expliciete bevestiging
# ---------------------------------------------------------------------------
section "Stap 4 — Bevestiging"

echo "  ${RED}${BOLD}Alle bestaande data (database + .env + private/) wordt overschreven.${RESET}"
echo "  ${RED}${BOLD}Deze actie kan NIET ongedaan worden gemaakt.${RESET}"
echo
printf "  Type exact  RESTORE  om door te gaan (of Ctrl+C om af te breken): "
read -r CONFIRMATION

if [ "${CONFIRMATION}" != "RESTORE" ]; then
  echo
  echo "  Restore geannuleerd."
  echo
  exit 0
fi
ok "Bevestiging ontvangen"

# ---------------------------------------------------------------------------
# Stap 5 — Safety backup van huidige situatie
# ---------------------------------------------------------------------------
section "Stap 5 — Safety backup (huidige situatie)"

info "Maakt backup van de huidige situatie voor aanvang restore..."
SAFETY_OUT=$(bash "${PROJECT_DIR}/scripts/backup.sh" 2>&1) || SAFETY_RC=$?
SAFETY_FILE=$(echo "${SAFETY_OUT}" | grep "^Backup file:" | head -1 || true)

if echo "${SAFETY_OUT}" | grep -q "^Backup successful"; then
  ok "Safety backup gemaakt  (${SAFETY_FILE#Backup file: })"
else
  warn "Safety backup mislukt"
  printf "  Toch doorgaan zonder safety backup? (ja/nee): "
  read -r PROCEED
  if [ "${PROCEED}" != "ja" ]; then
    echo "  Restore geannuleerd."
    echo
    exit 1
  fi
fi

# Laad .env uit de BACKUP voor DATABASE_URL (secrets worden nooit geprint)
set -a
# shellcheck source=/dev/null
source "${RESTORE_DIR}/.env"
set +a

[ -z "${DATABASE_URL:-}" ] && fail "DATABASE_URL ontbreekt in backup .env"

# ---------------------------------------------------------------------------
# Stap 6 — PM2 stoppen
# ---------------------------------------------------------------------------
section "Stap 6 — PM2 stoppen"

pm2 stop "${PM2_PROCESS}" 2>&1 | grep -v "^[[:space:]]*$" | sed 's/^/  /' || \
  warn "${PM2_PROCESS} kon niet worden gestopt (mogelijk al gestopt)"
ok "PM2 gestopt"

# ---------------------------------------------------------------------------
# Stap 7 — .env herstellen
# ---------------------------------------------------------------------------
section "Stap 7 — .env herstellen"

cp "${RESTORE_DIR}/.env" "${PROJECT_DIR}/.env" \
  || fail ".env herstellen mislukt"
ok ".env hersteld"

# ---------------------------------------------------------------------------
# Stap 8 — private/ herstellen
# ---------------------------------------------------------------------------
section "Stap 8 — private/ herstellen"

if [ "${HAS_PRIVATE}" = "ja" ]; then
  rm -rf "${PROJECT_DIR}/private"
  cp -r "${RESTORE_DIR}/private" "${PROJECT_DIR}/private" \
    || fail "private/ herstellen mislukt"
  ok "private/ hersteld"
else
  info "private/ niet aanwezig in backup — stap overgeslagen"
fi

# ---------------------------------------------------------------------------
# Stap 9 — PostgreSQL database herstellen
# ---------------------------------------------------------------------------
section "Stap 9 — Database herstellen (pg_restore)"

pg_restore \
  --clean \
  --if-exists \
  --no-password \
  --no-owner \
  -d "${DATABASE_URL}" \
  "${RESTORE_DIR}/database.dump" 2>&1 | sed 's/^/  /' \
  || fail "pg_restore mislukt — controleer DATABASE_URL en postgres-verbinding"
ok "Database hersteld"

# ---------------------------------------------------------------------------
# Stap 10 — PM2 herstarten
# ---------------------------------------------------------------------------
section "Stap 10 — API herstarten (PM2)"

pm2 restart "${PM2_PROCESS}" 2>&1 | grep -v "^[[:space:]]*$" | sed 's/^/  /' \
  || fail "pm2 restart ${PM2_PROCESS} mislukt"
ok "PM2 herstart"

# ---------------------------------------------------------------------------
# Stap 11 — Nginx herladen
# ---------------------------------------------------------------------------
section "Stap 11 — Nginx herladen"

sudo -n systemctl reload nginx 2>&1 | sed 's/^/  /' \
  || fail "nginx reload mislukt  (sudo systemctl reload nginx vereist passwordless sudo)"
ok "Nginx herladen"

# ---------------------------------------------------------------------------
# Stap 12 — check-env.sh
# ---------------------------------------------------------------------------
section "Stap 12 — Environment validatie (check-env.sh)"

ENV_OUT=$(bash "${PROJECT_DIR}/scripts/check-env.sh" 2>&1) || true
echo "${ENV_OUT}"
if echo "${ENV_OUT}" | grep -q "Environment NOT Ready"; then
  warn "Environment NOT Ready na restore — controleer .env"
else
  ok "Environment gereed"
fi

# ---------------------------------------------------------------------------
# Stap 13 — health.sh
# ---------------------------------------------------------------------------
section "Stap 13 — Health check (health.sh)"

HEALTH_OUT=$(bash "${PROJECT_DIR}/scripts/health.sh" 2>&1) || true
echo "${HEALTH_OUT}"
HEALTH_FAILS=$(echo "${HEALTH_OUT}" | grep -c "^\[FAIL\]" || true)
if [ "${HEALTH_FAILS}" -gt 0 ]; then
  warn "${HEALTH_FAILS} check(s) falen na restore — controleer de server"
else
  ok "Server gezond na restore"
fi

# ---------------------------------------------------------------------------
# Klaar
# ---------------------------------------------------------------------------
echo
echo "${GREEN}${BOLD}==========================================${RESET}"
echo "${GREEN}${BOLD} Restore successful${RESET}"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo " Hersteld van: $(basename "${SELECTED_ARCHIVE}")"
echo "${GREEN}${BOLD}==========================================${RESET}"
echo
