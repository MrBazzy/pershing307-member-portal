#!/usr/bin/env bash
# backup.sh — Pershing307 TDA server backup
# Gebruik: bash scripts/backup.sh
#
# Maakt een .tar.gz backup van:
#   - PostgreSQL dump (pg_dump)
#   - .env bestand
#   - private/ map (indien aanwezig)
#   - git commit hash en timestamp
#   - README in de backupmap
#
# Backup locatie: backups/pershing307-backup-YYYYMMDD-HHMMSS.tar.gz
# Secrets worden nooit op het scherm getoond.

set -euo pipefail

# ---------------------------------------------------------------------------
# Kleurcodes
# ---------------------------------------------------------------------------
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && tput colors >/dev/null 2>&1; then
  GREEN=$(tput setaf 2); RED=$(tput setaf 1); BOLD=$(tput bold); RESET=$(tput sgr0)
else
  GREEN="" RED="" BOLD="" RESET=""
fi

# ---------------------------------------------------------------------------
# Constanten
# ---------------------------------------------------------------------------
PROJECT_DIR="/home/barry/apps/pershing307"
BACKUP_ROOT="${PROJECT_DIR}/backups"
TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
BACKUP_NAME="pershing307-backup-${TIMESTAMP}"
BACKUP_STAGE="${BACKUP_ROOT}/${BACKUP_NAME}"
ARCHIVE="${BACKUP_ROOT}/${BACKUP_NAME}.tar.gz"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
fail() {
  echo
  echo "${RED}${BOLD}==========================================${RESET}"
  echo "${RED}${BOLD} Backup failed: $1${RESET}"
  echo "${RED}${BOLD}==========================================${RESET}"
  echo
  rm -rf "${BACKUP_STAGE}" 2>/dev/null || true
  exit 1
}

# ---------------------------------------------------------------------------
# Working directory
# ---------------------------------------------------------------------------
CURRENT_DIR=$(pwd)
if [ "$CURRENT_DIR" != "$PROJECT_DIR" ]; then
  fail "Script moet vanuit ${PROJECT_DIR} worden uitgevoerd (nu: ${CURRENT_DIR})"
fi

# ---------------------------------------------------------------------------
# Laad .env — DATABASE_URL en andere variabelen worden nooit geprint
# ---------------------------------------------------------------------------
if [ ! -f "${PROJECT_DIR}/.env" ]; then
  fail ".env bestand ontbreekt in ${PROJECT_DIR}"
fi
set -a
# shellcheck source=/dev/null
source "${PROJECT_DIR}/.env"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  fail "DATABASE_URL ontbreekt in .env — kan geen database-backup maken"
fi

# ---------------------------------------------------------------------------
# Zorg dat backups/ in .gitignore staat
# ---------------------------------------------------------------------------
if ! grep -qF "backups/" "${PROJECT_DIR}/.gitignore" 2>/dev/null; then
  echo "backups/" >> "${PROJECT_DIR}/.gitignore"
fi

# ---------------------------------------------------------------------------
# Maak staging-map
# ---------------------------------------------------------------------------
mkdir -p "${BACKUP_STAGE}"

# ---------------------------------------------------------------------------
# 1. PostgreSQL dump
# ---------------------------------------------------------------------------
pg_dump "${DATABASE_URL}" \
  --no-password \
  --format=custom \
  --file="${BACKUP_STAGE}/database.dump" \
  2>/dev/null \
  || fail "pg_dump mislukt — controleer DATABASE_URL en postgres-verbinding"

# ---------------------------------------------------------------------------
# 2. .env bestand
# ---------------------------------------------------------------------------
cp "${PROJECT_DIR}/.env" "${BACKUP_STAGE}/.env"

# ---------------------------------------------------------------------------
# 3. private/ directory (optioneel)
# ---------------------------------------------------------------------------
if [ -d "${PROJECT_DIR}/private" ]; then
  cp -r "${PROJECT_DIR}/private" "${BACKUP_STAGE}/private"
fi

# ---------------------------------------------------------------------------
# 4. Git commit hash
# ---------------------------------------------------------------------------
GIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
echo "${GIT_HASH}" > "${BACKUP_STAGE}/git-commit.txt"

# ---------------------------------------------------------------------------
# 5. Timestamp
# ---------------------------------------------------------------------------
date '+%Y-%m-%d %H:%M:%S' > "${BACKUP_STAGE}/timestamp.txt"

# ---------------------------------------------------------------------------
# 6. README
# ---------------------------------------------------------------------------
cat > "${BACKUP_STAGE}/README.txt" << READMEEOF
Pershing307 TDA — Server Backup
================================
Datum      : $(date '+%Y-%m-%d %H:%M:%S')
Git commit : ${GIT_HASH}

Inhoud
------
  database.dump   PostgreSQL dump (custom-formaat)
  .env            Omgevingsvariabelen (vertrouwelijk)
  private/        Private bestanden (indien aanwezig)
  git-commit.txt  Git commit hash ten tijde van backup
  timestamp.txt   Tijdstip van backup
  README.txt      Dit bestand

Database herstellen
-------------------
  pg_restore --clean --if-exists -d <DATABASENAAM> database.dump

WAARSCHUWING: Deze backup bevat gevoelige gegevens (.env, database-inhoud).
Bewaar veilig en deel niet.
READMEEOF

# ---------------------------------------------------------------------------
# Maak .tar.gz archief en verwijder staging-map
# ---------------------------------------------------------------------------
tar -czf "${ARCHIVE}" -C "${BACKUP_ROOT}" "${BACKUP_NAME}" \
  || fail "tar archivering mislukt"

rm -rf "${BACKUP_STAGE}"

# ---------------------------------------------------------------------------
# Klaar
# ---------------------------------------------------------------------------
echo
echo "${GREEN}${BOLD}Backup successful${RESET}"
echo "Backup file: backups/${BACKUP_NAME}.tar.gz"
echo
