#!/usr/bin/env bash
# maintenance.sh — Pershing307 maintenance mode management
#
# Usage:
#   bash scripts/maintenance.sh on       — enable maintenance mode
#   bash scripts/maintenance.sh off      — disable maintenance mode
#   bash scripts/maintenance.sh status   — show current status
#
# What it does:
#   on  — asks for title/reason/duration, writes maintenance.json to the
#          webroot, copies the maintenance page as index.html so visitors
#          see the maintenance screen instead of the portal.
#   off — restores the original index.html, marks maintenance.json as
#          disabled, appends a line to maintenance-history.log.
#
# Requires (already in sudoers via deploy.sh):
#   sudo -n rsync
#   sudo -n chown
#   sudo -n systemctl reload nginx
#
# No secrets are printed. No database changes. No application logic changes.

set -euo pipefail

# ---------------------------------------------------------------------------
# Colour codes
# ---------------------------------------------------------------------------
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && tput colors >/dev/null 2>&1; then
  GREEN=$(tput setaf 2); RED=$(tput setaf 1); YELLOW=$(tput setaf 3)
  BOLD=$(tput bold); RESET=$(tput sgr0)
else
  GREEN="" RED="" YELLOW="" BOLD="" RESET=""
fi

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PROJECT_DIR="/home/barry/apps/pershing307"
WEBROOT="/var/www/pershing307"
LODGE_NAME="Pershing No. 307"

MAINT_HTML_SRC="${PROJECT_DIR}/deployment/maintenance/index.html"

# Runtime state (in PROJECT_DIR — readable by barry without sudo)
STATE_FILE="${PROJECT_DIR}/maintenance.json"
PORTAL_BACKUP="${PROJECT_DIR}/_portal-index.bak"
HISTORY_FILE="${PROJECT_DIR}/maintenance-history.log"

# Webroot targets (require sudo rsync to write)
WEBROOT_JSON="${WEBROOT}/maintenance.json"
WEBROOT_HTML="${WEBROOT}/maintenance.html"
WEBROOT_INDEX="${WEBROOT}/index.html"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
ok()      { echo "  ${GREEN}OK${RESET}  $1"; }
fail()    {
  echo
  echo "${RED}${BOLD}==========================================${RESET}"
  echo "${RED}${BOLD} Failed: $1${RESET}"
  echo "${RED}${BOLD}==========================================${RESET}"
  echo
  exit 1
}
warn()    { echo "  ${YELLOW}!!${RESET}  $1"; }
info()    { echo "  --  $1"; }
section() { echo; echo "${BOLD}=== $1 ===${RESET}"; echo; }

# Write JSON to a tmp file, then sudo rsync it to the webroot.
# Also keep a copy in PROJECT_DIR as STATE_FILE for status reads.
_write_json_to_webroot() {
  local json="$1"
  local tmp
  tmp=$(mktemp /tmp/pershing307_maint_XXXXXX.json)
  printf '%s\n' "${json}" > "${tmp}"
  cp "${tmp}" "${STATE_FILE}"
  sudo -n rsync "${tmp}" "${WEBROOT_JSON}" \
    || { rm -f "${tmp}"; fail "sudo rsync maintenance.json → webroot mislukt"; }
  rm -f "${tmp}"
}

# sudo rsync a file to the webroot
_rsync_to_webroot() {
  local src="$1" dst="$2"
  sudo -n rsync "${src}" "${dst}" \
    || fail "sudo rsync ${src} → ${dst} mislukt"
}

# fix ownership of webroot files
_fix_ownership() {
  sudo -n chown www-data:www-data \
    "${WEBROOT_JSON}" "${WEBROOT_HTML}" "${WEBROOT_INDEX}" \
    2>/dev/null || true
}

# Read a key from STATE_FILE using node (avoids dependency on jq/python)
_json_get() {
  local key="$1"
  node -e "
try {
  const d = JSON.parse(require('fs').readFileSync('${STATE_FILE}', 'utf8'));
  const v = d['${key}'];
  process.stdout.write(v !== undefined && v !== null ? String(v) : '');
} catch(e) { process.stdout.write(''); }
" 2>/dev/null || true
}

# Check whether maintenance is currently enabled
_is_enabled() {
  [ -f "${STATE_FILE}" ] || return 1
  local val
  val=$(_json_get "enabled")
  [ "${val}" = "true" ]
}

# Append a line to the history log
_log_history() {
  local event="$1" detail="$2"
  printf '%s | %-4s | %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${event}" "${detail}" \
    >> "${HISTORY_FILE}" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# _maintenance_on
# ---------------------------------------------------------------------------
_maintenance_on() {
  section "Enable Maintenance Mode"

  # Already active?
  if _is_enabled; then
    warn "Maintenance mode is already enabled."
    printf "  Override with new settings? (yes/no): "
    read -r OVERRIDE
    [ "${OVERRIDE}" = "yes" ] || { echo "  Cancelled."; echo; exit 0; }
  fi

  # Verify source HTML exists
  [ -f "${MAINT_HTML_SRC}" ] \
    || fail "Maintenance page not found: ${MAINT_HTML_SRC}"

  # ── Interactive prompts ──────────────────────────────────────────────────
  echo
  printf "  Maintenance title [Scheduled Maintenance]: "
  read -r MAINT_TITLE
  MAINT_TITLE="${MAINT_TITLE:-Scheduled Maintenance}"

  printf "  Reason (required): "
  read -r MAINT_REASON
  [ -n "${MAINT_REASON}" ] || fail "Reason is required."

  printf "  Expected duration in minutes: "
  read -r MAINT_DURATION
  [[ "${MAINT_DURATION}" =~ ^[0-9]+$ ]] || fail "Duration must be a whole number."
  [ "${MAINT_DURATION}" -gt 0 ]         || fail "Duration must be greater than 0."

  printf "  Description (optional, Enter to skip): "
  read -r MAINT_DESC

  # ── Calculate times ──────────────────────────────────────────────────────
  START_TS=$(date +%s)
  END_TS=$(( START_TS + MAINT_DURATION * 60 ))
  START_ISO=$(date -d "@${START_TS}" '+%Y-%m-%dT%H:%M:%S%z')
  END_ISO=$(date   -d "@${END_TS}"   '+%Y-%m-%dT%H:%M:%S%z')
  START_HUMAN=$(date -d "@${START_TS}" '+%Y-%m-%d %H:%M:%S')
  END_HUMAN=$(date   -d "@${END_TS}"   '+%Y-%m-%d %H:%M:%S')

  # ── Summary ──────────────────────────────────────────────────────────────
  echo
  echo "  Summary:"
  printf "    %-22s %s\n" "Title"       "${MAINT_TITLE}"
  printf "    %-22s %s\n" "Reason"      "${MAINT_REASON}"
  [ -n "${MAINT_DESC}" ] && \
    printf "    %-22s %s\n" "Description" "${MAINT_DESC}"
  printf "    %-22s %s\n" "Start time"  "${START_HUMAN}"
  printf "    %-22s %s min  (until %s)\n" "Duration" "${MAINT_DURATION}" "${END_HUMAN}"
  echo

  printf "  Proceed? (yes/no): "
  read -r CONFIRM
  [ "${CONFIRM}" = "yes" ] || { echo "  Cancelled."; echo; exit 0; }

  # ── Build JSON via node (handles special characters correctly) ───────────
  MAINT_JSON=$(MAINT_TITLE="${MAINT_TITLE}" \
               MAINT_REASON="${MAINT_REASON}" \
               MAINT_DESC="${MAINT_DESC}" \
               START_ISO="${START_ISO}" \
               END_ISO="${END_ISO}" \
               MAINT_DURATION="${MAINT_DURATION}" \
               LODGE_NAME="${LODGE_NAME}" \
    node -e "
process.stdout.write(JSON.stringify({
  enabled:          true,
  lodgeName:        process.env.LODGE_NAME,
  title:            process.env.MAINT_TITLE,
  reason:           process.env.MAINT_REASON,
  description:      process.env.MAINT_DESC || '',
  startTime:        process.env.START_ISO,
  expectedEndTime:  process.env.END_ISO,
  durationMinutes:  parseInt(process.env.MAINT_DURATION, 10)
}, null, 2));
" 2>/dev/null) || fail "JSON generation failed (node required)"

  # ── Write state files ────────────────────────────────────────────────────
  section "Activating"

  # 1. Write maintenance.json (local copy + webroot)
  info "Writing maintenance.json..."
  _write_json_to_webroot "${MAINT_JSON}"
  ok "maintenance.json written"

  # 2. Copy maintenance HTML to webroot as maintenance.html
  info "Copying maintenance page to webroot..."
  _rsync_to_webroot "${MAINT_HTML_SRC}" "${WEBROOT_HTML}"
  ok "maintenance.html deployed"

  # 3. Back up the current index.html (skip if already a maintenance page)
  if [ -f "${WEBROOT_INDEX}" ]; then
    if ! grep -q 'maintenance.json' "${WEBROOT_INDEX}" 2>/dev/null; then
      cp "${WEBROOT_INDEX}" "${PORTAL_BACKUP}" \
        || warn "Could not back up index.html — continuing without backup"
      ok "index.html backed up"
    else
      info "index.html is already the maintenance page — skipping backup"
    fi
  fi

  # 4. Replace index.html with maintenance page
  info "Activating maintenance page as index.html..."
  _rsync_to_webroot "${MAINT_HTML_SRC}" "${WEBROOT_INDEX}"
  ok "index.html replaced with maintenance page"

  # 5. Fix ownership
  _fix_ownership
  ok "File ownership set (www-data)"

  # 6. Log to history
  _log_history "ON" "title=${MAINT_TITLE}  reason=${MAINT_REASON}  duration=${MAINT_DURATION}min  end=${END_HUMAN}"

  # ── Result ───────────────────────────────────────────────────────────────
  echo
  echo "${GREEN}${BOLD}==========================================${RESET}"
  echo "${GREEN}${BOLD} Maintenance mode ENABLED${RESET}"
  echo " Title    : ${MAINT_TITLE}"
  echo " Reason   : ${MAINT_REASON}"
  echo " Start    : ${START_HUMAN}"
  echo " End      : ${END_HUMAN}  (${MAINT_DURATION} min)"
  echo "${GREEN}${BOLD}==========================================${RESET}"
  echo
  echo "  To disable: bash scripts/maintenance.sh off"
  echo
}

# ---------------------------------------------------------------------------
# _maintenance_off
# ---------------------------------------------------------------------------
_maintenance_off() {
  section "Disable Maintenance Mode"

  # Check if active
  if ! _is_enabled; then
    warn "Maintenance mode is not currently enabled."
    [ -f "${STATE_FILE}" ] || { echo "  No state file found."; echo; exit 0; }
    printf "  Proceed anyway? (yes/no): "
    read -r PROCEED
    [ "${PROCEED}" = "yes" ] || { echo "  Cancelled."; echo; exit 0; }
  fi

  # Read metadata for history log
  MAINT_TITLE=$(_json_get "title" || echo "unknown")
  START_TIME=$(_json_get "startTime" || echo "unknown")

  # ── Restore index.html ───────────────────────────────────────────────────
  if [ -f "${PORTAL_BACKUP}" ]; then
    info "Restoring original index.html from backup..."
    _rsync_to_webroot "${PORTAL_BACKUP}" "${WEBROOT_INDEX}"
    ok "index.html restored"
  else
    warn "No portal backup found (${PORTAL_BACKUP})"
    warn "index.html was NOT restored — run 'bash scripts/deploy.sh' to redeploy"
  fi

  # ── Mark maintenance.json as disabled (keep it — do not delete) ──────────
  info "Marking maintenance.json as disabled..."
  ENDED_ISO=$(date '+%Y-%m-%dT%H:%M:%S%z')
  ENDED_HUMAN=$(date '+%Y-%m-%d %H:%M:%S')

  DISABLED_JSON=$(MAINT_TITLE="${MAINT_TITLE}" \
                  START_TIME="${START_TIME}" \
                  ENDED_ISO="${ENDED_ISO}" \
                  LODGE_NAME="${LODGE_NAME}" \
    node -e "
try {
  const fs   = require('fs');
  const orig = JSON.parse(fs.readFileSync('${STATE_FILE}', 'utf8'));
  orig.enabled  = false;
  orig.actualEndTime = process.env.ENDED_ISO;
  process.stdout.write(JSON.stringify(orig, null, 2));
} catch(e) {
  process.stdout.write(JSON.stringify({
    enabled: false,
    lodgeName: process.env.LODGE_NAME,
    title: process.env.MAINT_TITLE,
    startTime: process.env.START_TIME,
    actualEndTime: process.env.ENDED_ISO
  }, null, 2));
}
" 2>/dev/null) || fail "JSON update failed (node required)"

  _write_json_to_webroot "${DISABLED_JSON}"
  ok "maintenance.json marked disabled"

  # ── Fix ownership ────────────────────────────────────────────────────────
  _fix_ownership
  ok "File ownership set (www-data)"

  # ── Log to history ───────────────────────────────────────────────────────
  _log_history "OFF" "title=${MAINT_TITLE}  started=${START_TIME}  ended=${ENDED_HUMAN}"

  # ── Result ───────────────────────────────────────────────────────────────
  echo
  echo "${GREEN}${BOLD}==========================================${RESET}"
  echo "${GREEN}${BOLD} Maintenance mode DISABLED${RESET}"
  echo " Ended at : ${ENDED_HUMAN}"
  echo "${GREEN}${BOLD}==========================================${RESET}"
  echo
  echo "  Note: if index.html was NOT restored, run: bash scripts/deploy.sh"
  echo "  History : ${HISTORY_FILE}"
  echo
}

# ---------------------------------------------------------------------------
# _maintenance_status
# ---------------------------------------------------------------------------
_maintenance_status() {
  section "Maintenance Mode Status"

  if [ ! -f "${STATE_FILE}" ]; then
    echo "  ${YELLOW}DISABLED${RESET}  (no state file found)"
    echo
    exit 0
  fi

  ENABLED=$(_json_get "enabled")
  TITLE=$(_json_get "title")
  REASON=$(_json_get "reason")
  START=$(_json_get "startTime")
  END=$(_json_get "expectedEndTime")
  DURATION=$(_json_get "durationMinutes")
  ACTUAL_END=$(_json_get "actualEndTime")

  if [ "${ENABLED}" = "true" ]; then
    echo "  ${RED}${BOLD}ENABLED${RESET}"
  else
    echo "  ${GREEN}DISABLED${RESET}"
  fi
  echo

  [ -n "${TITLE}"    ] && printf "  %-22s %s\n" "Title"            "${TITLE}"
  [ -n "${REASON}"   ] && printf "  %-22s %s\n" "Reason"           "${REASON}"
  [ -n "${START}"    ] && printf "  %-22s %s\n" "Started at"       "${START}"
  [ -n "${DURATION}" ] && printf "  %-22s %s minutes\n" "Expected duration" "${DURATION}"
  [ -n "${END}"      ] && printf "  %-22s %s\n" "Expected end"     "${END}"
  [ -n "${ACTUAL_END}" ] && printf "  %-22s %s\n" "Actual end"     "${ACTUAL_END}"

  # Remaining time
  if [ "${ENABLED}" = "true" ] && [ -n "${END}" ]; then
    NOW_TS=$(date +%s)
    END_TS=$(node -e "
try {
  const d = new Date('${END}');
  process.stdout.write(isNaN(d) ? '0' : String(Math.floor(d.getTime()/1000)));
} catch(e) { process.stdout.write('0'); }
" 2>/dev/null || echo "0")
    REMAINING=$(( END_TS - NOW_TS ))
    echo
    if [ "${REMAINING}" -gt 0 ]; then
      REM_MIN=$(( REMAINING / 60 ))
      REM_SEC=$(( REMAINING % 60 ))
      printf "  %-22s %d min %d sec\n" "Remaining" "${REM_MIN}" "${REM_SEC}"
    else
      echo "  ${YELLOW}!! Expected end time has passed — maintenance is taking longer than expected.${RESET}"
    fi
  fi

  echo
}

# ---------------------------------------------------------------------------
# Working directory check
# ---------------------------------------------------------------------------
CURRENT_DIR=$(pwd)
if [ "${CURRENT_DIR}" != "${PROJECT_DIR}" ]; then
  fail "Script must be run from ${PROJECT_DIR}  (current: ${CURRENT_DIR})"
fi

# ---------------------------------------------------------------------------
# Command dispatch
# ---------------------------------------------------------------------------
COMMAND="${1:-}"

case "${COMMAND}" in
  on)     _maintenance_on     ;;
  off)    _maintenance_off    ;;
  status) _maintenance_status ;;
  *)
    echo
    echo "Usage: bash scripts/maintenance.sh <command>"
    echo
    echo "  on       Enable maintenance mode (interactive)"
    echo "  off      Disable maintenance mode"
    echo "  status   Show current maintenance status"
    echo
    exit 1
    ;;
esac
