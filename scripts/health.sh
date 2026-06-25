#!/usr/bin/env bash
# health.sh — Pershing307 TDA server health check
# Alleen lezen, geen wijzigingen, geen secrets.
# Gebruik: bash scripts/health.sh

set -euo pipefail

OK="[ OK ]"
FAIL="[FAIL]"

check() {
  local label="$1"
  local result="$2"
  if [ "$result" = "ok" ]; then
    echo "$OK  $label"
  else
    echo "$FAIL $label"
  fi
}

echo "======================================="
echo " Pershing307 Health Check"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "======================================="

# --- PostgreSQL service ---
if systemctl is-active --quiet postgresql 2>/dev/null; then
  check "PostgreSQL service" "ok"
else
  check "PostgreSQL service" "fail"
fi

# --- PostgreSQL cluster ---
if pg_lsclusters 2>/dev/null | grep -q "online"; then
  check "PostgreSQL cluster (online)" "ok"
else
  check "PostgreSQL cluster (online)" "fail"
fi

# --- PM2 process pershing307-api ---
if su -s /bin/bash barry -c "pm2 list 2>/dev/null" 2>/dev/null \
     | grep -q "pershing307-api"; then
  check "PM2 proces pershing307-api" "ok"
else
  check "PM2 proces pershing307-api" "fail"
fi

# --- API endpoint /api/bootstrap/status ---
if curl -sf --max-time 5 http://127.0.0.1:3000/api/bootstrap/status \
     -o /dev/null 2>/dev/null; then
  check "API /api/bootstrap/status" "ok"
else
  check "API /api/bootstrap/status" "fail"
fi

# --- Frontend via Nginx (poort 80) ---
if curl -sf --max-time 5 http://127.0.0.1 \
     -o /dev/null 2>/dev/null; then
  check "Frontend http://127.0.0.1" "ok"
else
  check "Frontend http://127.0.0.1" "fail"
fi

# --- Nginx service ---
if systemctl is-active --quiet nginx 2>/dev/null; then
  check "Nginx service" "ok"
else
  check "Nginx service" "fail"
fi

# --- UFW status ---
if ufw status 2>/dev/null | grep -q "Status: active"; then
  check "UFW firewall (actief)" "ok"
else
  check "UFW firewall (actief)" "fail"
fi

# --- Disk usage (/ mag niet meer dan 90% vol zijn) ---
DISK_PCT=$(df / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
if [ "${DISK_PCT:-100}" -lt 90 ]; then
  check "Schijfruimte / (${DISK_PCT}% gebruikt)" "ok"
else
  check "Schijfruimte / (${DISK_PCT}% gebruikt — bijna vol)" "fail"
fi

# --- Memory (minder dan 95% in gebruik) ---
MEM_PCT=$(free | awk '/^Mem:/ {printf "%d", $3/$2*100}')
if [ "${MEM_PCT:-100}" -lt 95 ]; then
  check "Geheugen (${MEM_PCT}% in gebruik)" "ok"
else
  check "Geheugen (${MEM_PCT}% in gebruik — hoog)" "fail"
fi

# --- QEMU Guest Agent ---
if systemctl is-active --quiet qemu-guest-agent 2>/dev/null; then
  check "QEMU Guest Agent" "ok"
else
  check "QEMU Guest Agent" "fail"
fi

echo "======================================="
