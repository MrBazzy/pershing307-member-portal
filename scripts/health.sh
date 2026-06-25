#!/usr/bin/env bash
# health.sh — Pershing307 TDA server health check
# Alleen lezen, geen wijzigingen, geen secrets.
# Gebruik: bash scripts/health.sh

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

# --- PM2 process pershing307-api (list) ---
if pm2 list 2>/dev/null | grep -q "pershing307-api"; then
  check "PM2 proces pershing307-api" "ok"
else
  check "PM2 proces pershing307-api" "fail"
fi

# --- PM2 process pershing307-api (online status) ---
if pm2 describe pershing307-api 2>/dev/null | grep -q "online"; then
  check "PM2 status pershing307-api (online)" "ok"
else
  check "PM2 status pershing307-api (online)" "fail"
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

# --- UFW status (vereist sudo voor ufw status) ---
_UFW_OUT=$(sudo ufw status 2>/dev/null)
_UFW_ACTIVE=$(echo "$_UFW_OUT" | grep -c "Status: active" || true)
_UFW_SSH=$(echo "$_UFW_OUT" | grep -c "OpenSSH\|22/tcp" || true)
_UFW_HTTP=$(echo "$_UFW_OUT" | grep -c "80/tcp\|Nginx\|Apache" || true)
if [ "$_UFW_ACTIVE" -gt 0 ] && [ "$_UFW_SSH" -gt 0 ] && [ "$_UFW_HTTP" -gt 0 ]; then
  check "UFW firewall actief met SSH en HTTP" "ok"
else
  check "UFW firewall actief met SSH en HTTP" "fail"
fi
unset _UFW_OUT _UFW_ACTIVE _UFW_SSH _UFW_HTTP

# --- Disk usage (/ mag niet meer dan 90% vol zijn) ---
DISK_PCT=$(df / 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
if [ "${DISK_PCT:-100}" -lt 90 ]; then
  check "Schijfruimte / (${DISK_PCT}% gebruikt)" "ok"
else
  check "Schijfruimte / (${DISK_PCT}% gebruikt — bijna vol)" "fail"
fi

# --- Memory (minder dan 95% in gebruik) ---
MEM_PCT=$(free 2>/dev/null | awk '/^Mem:/ {printf "%d", $3/$2*100}')
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
