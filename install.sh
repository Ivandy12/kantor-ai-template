#!/usr/bin/env bash
# =====================================================================
#  Kantor AI — installer untuk VPS Hermes (Sumopod)
#  Pasang: Paperclip + tampilan Kantor AI + Kantor 3D + Rapat + Arga (CEO)
#
#  Install baru:
#    bash install.sh --brand "PT Maju Jaya" --owner "Budi" --sapaan Pak \
#      --email budi@email.com --password 'RahasiaKuat123' \
#      --url https://hermes-xxxx-3200.jkt1.sumopod.my.id \  # Gunakan port 3200 untuk edisi JJK (penjual pakai 3100)
#      [--telegram-token 123:ABC --telegram-user 123456789] \
#      [--router-key KEY9ROUTER] [--model ag/gemini-3.8-flash-low]
#
#  Update (data aman):   bash install.sh --update
#  Cek kesehatan:        bash install.sh --cek
# =====================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TPL_VERSION="$(cat "$ROOT/VERSION" 2>/dev/null || echo dev)"
PC_VERSION="2026.1005.0"

DATA=/opt/data
KD=$DATA/kantor3d
KA=$DATA/kantor
NPMG=$DATA/.npm-global
PCHOME=$DATA/home/.paperclip
PROFILES=$DATA/profiles
CONF=$KA/kantor.conf
SVC=$DATA/services
RUNSVC=/run/service
HERMES_BIN=/opt/hermes/.venv/bin/hermes
S6CTL=/command/s6-svscanctl
S6SVC=/command/s6-svc
LOGF=$DATA/logs/kantor-install.log

mkdir -p "$DATA/logs"
log()  { echo "[kantor] $*" | tee -a "$LOGF"; }
ok()   { echo "[kantor] ✅ $*" | tee -a "$LOGF"; }
die()  { echo "[kantor] ❌ GAGAL: $*" | tee -a "$LOGF" >&2; exit 1; }
step() { echo; echo "[kantor] ── $* ──" | tee -a "$LOGF"; }

# ---------------------------------------------------------------- argumen
MODE=install
BRAND="" OWNER="" SAPAAN="" PUBLIC_URL="" OWNER_EMAIL="" OWNER_PASSWORD=""
TG_TOKEN="" TG_USER="" ROUTER_URL="" ROUTER_KEY="" MODEL="" COMPANY_ID=""
# nilai lama (untuk update / install ulang)
if [ -f "$CONF" ]; then . "$CONF"; fi
while [ $# -gt 0 ]; do
  case "$1" in
    --brand) BRAND="$2"; shift 2;;
    --owner) OWNER="$2"; shift 2;;
    --sapaan) SAPAAN="$2"; shift 2;;
    --url) PUBLIC_URL="$2"; shift 2;;
    --email) OWNER_EMAIL="$2"; shift 2;;
    --password) OWNER_PASSWORD="$2"; shift 2;;
    --telegram-token) TG_TOKEN="$2"; shift 2;;
    --telegram-user) TG_USER="$2"; shift 2;;
    --router-url) ROUTER_URL="$2"; shift 2;;
    --router-key) ROUTER_KEY="$2"; shift 2;;
    --model) MODEL="$2"; shift 2;;
    --update) MODE=update; shift;;
    --cek) MODE=cek; shift;;
    -h|--help) sed -n 2,16p "$0"; exit 0;;
    *) die "argumen tidak dikenal: $1 (lihat: bash install.sh --help)";;
  esac
done
SAPAAN="${SAPAAN:-Pak}"
# update tanpa --telegram-token: pakai token bot yang sudah terpasang
if [ -z "$TG_TOKEN" ] && [ -f "$PROFILES/kantortg/.env" ]; then
  TG_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$PROFILES/kantortg/.env" | cut -d= -f2- || true)
  [ -z "$TG_USER" ] && TG_USER=$(grep -E '^TELEGRAM_ALLOWED_USERS=' "$PROFILES/kantortg/.env" | cut -d= -f2- || true)
fi
ROUTER_URL="${ROUTER_URL:-http://127.0.0.1:20128}"; ROUTER_URL="${ROUTER_URL%/}"; ROUTER_URL="${ROUTER_URL%/v1}"
PUBLIC_URL="${PUBLIC_URL%/}"

# restart service: user hermes tidak boleh kontrol s6 langsung, jadi matikan prosesnya (s6 menyalakan lagi)
svc_pids() { # nama service -> pid proses utamanya
  case "$1" in
    paperclip)        pgrep -f "paperclipai/dist/index.js run" ;;
    kantor-proxy)     for p in $(pgrep -f "node proxy.js"); do c=$(readlink /proc/$p/cwd); c=${c% (deleted)}; [ "${c%.old}" = "$KD/proxy" ] && echo $p; done ;;
    kantor-adapter)   pgrep -f "node paperclip-gateway-adapter.js" ;;
    kantor-web)       for p in $(pgrep -f "node server/index.js"); do c=$(readlink /proc/$p/cwd); c=${c% (deleted)}; [ "${c%.old}" = "$KD/Hermes3D" ] && echo $p; done ;;
    kantor-telegram)  for p in $(pgrep -f "gateway run --replace"); do tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -qx "HERMES_HOME=$PROFILES/kantortg" && echo $p; done ;;
  esac
}
pg_port_now() { ps -eo args | grep -E "postgres -D $PCHOME/instances/default/db( |\$)" | grep -v grep | grep -oE '\-p [0-9]+' | awk '{print $2}' | head -1; }
restart_svc() { # matikan proses lama lalu TUNGGU sampai benar-benar mati (s6/kantor-svc menyalakan yang baru)
  local p i; p=$(svc_pids "$1" | sort -u); [ -n "$p" ] || return 0
  kill -TERM $p 2>/dev/null
  for i in $(seq 1 30); do kill -0 $p 2>/dev/null || return 0; sleep 1; done
  kill -KILL $p 2>/dev/null; return 0
}
wait_health() { # tunggu Paperclip sehat & stabil (3x berturut-turut sehat), maksimal ~3 menit
  local i okc=0
  for i in $(seq 1 90); do
    if curl -sf -m 3 -o /dev/null http://127.0.0.1:3101/api/health; then okc=$((okc+1)); [ $okc -ge 3 ] && return 0
    else okc=0; fi
    sleep 2
  done
  return 1
}

# ---------------------------------------------------------------- cek kesehatan
cek() {
  local bad=0
  for p in "3201/api/health:Paperclip" "3200/api/health:Pintu depan (proxy)" "3400/kantor3d:Kantor 3D"; do
    local u="${p%%:*}" n="${p#*:}"
    local c; c=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$u" || true)
    if [[ "$c" =~ ^(200|204|301|302|307|308)$ ]]; then ok "$n jalan ($c)"; else log "⚠️  $n belum jalan (kode $c)"; bad=1; fi
  done
  if (exec 3<>/dev/tcp/127.0.0.1/18792) 2>/dev/null; then ok "Adapter rapat/chat jalan"; else log "⚠️  Adapter rapat/chat belum jalan"; bad=1; fi
  if [ -f "$SVC/kantor-telegram/run" ]; then
    if pgrep -f "profiles/kantortg" >/dev/null || pgrep -f "kantortg" >/dev/null; then ok "Bot Telegram Arga jalan"; else log "⚠️  Bot Telegram Arga belum jalan"; bad=1; fi
  fi
  return $bad
}
if [ "$MODE" = cek ]; then cek && ok "Semua komponen sehat" || die "Ada komponen yang belum jalan. Log: $DATA/logs/"; exit 0; fi

# ---------------------------------------------------------------- validasi input
clean_name() { printf '%s' "$1" | tr -cd 'A-Za-z0-9 .&-' | sed 's/^ *//; s/ *$//'; }
BRAND="$(clean_name "$BRAND")"; OWNER="$(clean_name "$OWNER")"; SAPAAN="$(clean_name "$SAPAAN")"
[ -n "$BRAND" ] || die "--brand (nama perusahaan) wajib diisi"
[ -n "$OWNER" ] || die "--owner (nama pemilik) wajib diisi"
[ -n "$PUBLIC_URL" ] || die "--url (link Sumopod port 3200, contoh https://hermes-xxxx-3200.eu5.sumopod.my.id) wajib diisi"
[[ "$PUBLIC_URL" =~ ^https?:// ]] || PUBLIC_URL="https://$PUBLIC_URL"
PUBLIC_HOST="$(printf '%s' "$PUBLIC_URL" | sed -E 's#^https?://##; s#/.*##')"
if [ "$MODE" = install ] && [ ! -f "$KA/.board.key" ]; then
  [ -n "$OWNER_EMAIL" ] || die "--email (untuk login web kantor) wajib diisi"
  [ -n "$OWNER_PASSWORD" ] || die "--password (untuk login web kantor) wajib diisi"
  [ ${#OWNER_PASSWORD} -ge 8 ] || die "password minimal 8 karakter"
fi
if [ -n "$TG_TOKEN" ] && [ -z "$TG_USER" ]; then die "--telegram-user (ID Telegram pemilik) wajib kalau pakai --telegram-token, supaya bot tidak bisa dipakai orang lain"; fi


# ---------------------------------------------------------------- 1. prasyarat
step "1/9 Cek prasyarat VPS"
command -v node >/dev/null || die "node tidak ada"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "node minimal versi 20 (sekarang $(node -v))"
command -v npm >/dev/null || die "npm tidak ada"
for b in curl perl python3 tar; do command -v $b >/dev/null || die "$b tidak ada"; done
[ -x "$HERMES_BIN" ] || HERMES_BIN="$(command -v hermes || true)"
[ -n "$HERMES_BIN" ] && [ -x "$HERMES_BIN" ] || die "Hermes tidak ditemukan (template ini khusus VPS Hermes Sumopod)"
if [ -d "$RUNSVC" ] && [ -w "$RUNSVC" ] && [ -x "$S6CTL" ]; then
  USE_S6=1; ok "mode service: s6"
else
  USE_S6=0; ok "mode service: penjaga mandiri (kantor-svc), karena $RUNSVC tidak bisa ditulis"
fi
# RAM container (bukan RAM server): kantor butuh ~1,5 GB, Hermes sendiri ~1-1,5 GB
MEM_MAX=$(cat /sys/fs/cgroup/memory.max 2>/dev/null || echo max)
if [ "$MEM_MAX" != max ] && [ -n "$MEM_MAX" ]; then
  MEM_GB=$(( MEM_MAX / 1024 / 1024 / 1024 ))
  if [ "$MEM_MAX" -lt 3500000000 ]; then
    die "RAM VPS ini cuma ${MEM_GB} GB. Kantor AI butuh paket VPS minimal 4 GB RAM (Hermes ~1,5 GB + kantor ~1,5 GB). Upgrade paket di dashboard Sumopod (Upgrade & Renew), lalu jalankan ulang."
  fi
  ok "RAM VPS ${MEM_GB} GB"
fi
FREE_GB=$(df -BG --output=avail "$DATA" | tail -1 | tr -dc 0-9)
[ "${FREE_GB:-0}" -ge 3 ] || die "disk kosong minimal 3 GB (sisa ${FREE_GB} GB)"
ok "prasyarat lengkap (node $(node -v), disk kosong ${FREE_GB} GB)"

# ---------------------------------------------------------------- 2. 9Router
step "2/9 Sambungkan 9Router"
MAI_ON=$(python3 -c 'import json;d=json.load(open("/opt/data/kantor3d/state/model-ai.json"));print(1 if d.get("applied_at") and d.get("model") else 0)' 2>/dev/null || echo 0)
if [ "$MODE" = update ] && [ "$MAI_ON" = 1 ]; then
  ROUTER_KEY=$(grep -hE '^HERMES_CUSTOM_HTTP_127_0_0_1_20128_V1_API_KEY=' "$PROFILES/kantorceo/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)
  [ -n "$MODEL" ] || MODEL=$(grep -E '^MODEL=' "$CONF" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
  [ -n "$MODEL" ] || MODEL=ag/gemini-3.8-flash-low
  ok "Model AI aktif (menu Model AI) — cek 9Router dilewati, setting model dipertahankan"
else
# kandidat kunci: --router-key, lalu semua kunci 9Router yang sudah dipakai Hermes di VPS ini
KEYS=""
[ -n "$ROUTER_KEY" ] && KEYS="$ROUTER_KEY"
for f in "$DATA/.env" "$PROFILES"/*/.env; do
  [ -f "$f" ] || continue
  KEYS="$KEYS $(grep -E '^HERMES_CUSTOM_[A-Z0-9_]*20128[A-Z0-9_]*_API_KEY=' "$f" | cut -d= -f2- | tr -d '"'"'"' ' || true)"
done
KEYS="$KEYS $(grep -E '^\s*api_key:' "$DATA/config.yaml" 2>/dev/null | grep -v '#' | sed -E 's/.*api_key: *//; s/["'"'"']//g' | tr '\n' ' ' || true)"
curl -s -m 5 -o /dev/null "$ROUTER_URL/" || die "9Router tidak jalan di $ROUTER_URL. Nyalakan 9Router dulu, lalu ulangi."
pick_model() { python3 -c '
import sys, json
try: ids = [m.get("id") for m in json.load(sys.stdin).get("data", []) if m.get("id")]
except Exception: ids = []
pref = ["ag/gemini-3.8-flash-low", "ag/gemini-3.7-flash-low", "ag/gemini-3.6-flash-low", "ag/gemini-3.5-flash-low", "ag/gemini-3-flash"]
print(next((p for p in pref if p in ids), next((i for i in ids if "flash" in i), ids[0] if ids else "")))'; }
# uji sungguhan per kunci: daftar model + jawaban chat harus berhasil
WANT_MODEL="$MODEL"; ROUTER_KEY=""; LAST_ERR=""
for k in $KEYS; do
  [ -n "$k" ] || continue
  M="$WANT_MODEL"
  [ -n "$M" ] || M=$(curl -s -m 10 -H "Authorization: Bearer $k" "$ROUTER_URL/v1/models" | pick_model || true)
  [ -n "$M" ] || { LAST_ERR="daftar model kosong"; continue; }
  R=$(curl -s -m 60 "$ROUTER_URL/v1/chat/completions" -H "Authorization: Bearer $k" -H "Content-Type: application/json" \
      -d "{\"model\":\"$M\",\"messages\":[{\"role\":\"user\",\"content\":\"jawab: ok\"}],\"max_tokens\":5}" || true)
  if printf '%s' "$R" | grep -q '"choices"'; then ROUTER_KEY="$k"; MODEL="$M"; break; fi
  LAST_ERR=$(printf '%s' "$R" | head -c 200)
done
if [ -z "$ROUTER_KEY" ]; then
  die "9Router jalan, tapi tidak ada kunci API yang bisa dipakai (${LAST_ERR:-tidak ada kunci}). Buka dashboard 9Router: pastikan akun provider sudah login & buat API key, lalu ulangi dengan --router-key <kunci>."
fi
ok "9Router tersambung, model agent: $MODEL"
fi

# ---------------------------------------------------------------- 3. Paperclip
step "3/9 Pasang Paperclip $PC_VERSION"
NPMCACHE="$DATA/.npm-kantor-cache"   # cache sendiri: cache npm bawaan sering berisi file milik root (EACCES)
mkdir -p "$NPMCACHE"
export PATH="$NPMG/bin:$PATH"
CUR_PC=$(node -p "try{require('$NPMG/lib/node_modules/paperclipai/package.json').version}catch(e){''}" 2>/dev/null || true)
if [ "$CUR_PC" != "$PC_VERSION" ]; then
  log "memasang paperclipai@$PC_VERSION (bisa 2-5 menit)..."
  pc_install() {
    npm install -g --prefix "$NPMG" --cache "$NPMCACHE" "paperclipai@$PC_VERSION" --no-audit --no-fund "$@" >>"$LOGF" 2>&1
  }
  pc_clean() { rm -rf "$NPMG/lib/node_modules/paperclipai" "$NPMG"/lib/node_modules/.paperclipai-* 2>/dev/null || true; }
  pc_install --allow-scripts=@embedded-postgres/linux-x64,protobufjs \
  || { log "percobaan 1 gagal, ulang mode hemat RAM..."; pc_clean; sleep 5; NODE_OPTIONS=--max-old-space-size=1024 pc_install --maxsockets=2 --allow-scripts=@embedded-postgres/linux-x64,protobufjs; } \
  || { log "percobaan 2 gagal, ulang sekali lagi (hemat RAM)..."; pc_clean; sleep 10; NODE_OPTIONS=--max-old-space-size=1024 pc_install --maxsockets=1 --prefer-offline --allow-scripts=@embedded-postgres/linux-x64,protobufjs; } \
  || { echo "----- pesan error npm -----"; grep -aE "npm error|ERR!|Killed|ENOSPC|EACCES|ETIMEDOUT|ECONNRESET" "$LOGF" | tail -15;
       echo "RAM sekarang:"; free -m 2>/dev/null | head -2; die "install Paperclip gagal (pesan error di atas), lihat $LOGF"; }
fi
# npm baru memblokir script install: pulihkan symlink library PostgreSQL bawaan secara manual (aman diulang)
for EP in "$NPMG"/lib/node_modules/paperclipai/node_modules/@embedded-postgres/*/; do
  [ -f "$EP/scripts/hydrate-symlinks.js" ] && ( cd "$EP" && node scripts/hydrate-symlinks.js >>"$LOGF" 2>&1 || true )
done
ok "Paperclip $PC_VERSION terpasang"

PCCONF="$PCHOME/instances/default/config.json"
INVITE_TOKEN=""
PCDB="$PCHOME/instances/default/db"
if [ -f "$PCCONF" ] && [ ! -f "$PCDB/PG_VERSION" ]; then
  log "data Paperclip dari percobaan sebelumnya tidak lengkap, diulang dari awal"
  mv "$PCHOME/instances/default" "$PCHOME/instances/default.gagal-$(date +%s)"
fi
if [ ! -f "$PCCONF" ]; then
  log "inisialisasi Paperclip pertama kali..."
  mkdir -p "$DATA/home"
  OBLOG=$DATA/logs/paperclip-onboard.log
  ( cd "$DATA/home" && HOME=$DATA/home PAPERCLIP_TELEMETRY_DISABLED=1 timeout 300 "$NPMG/bin/paperclipai" onboard -y --bind lan --no-install-service >"$OBLOG" 2>&1 ) &
  OBPID=$!
  for i in $(seq 1 120); do
    grep -aq "pcp_bootstrap_" "$OBLOG" 2>/dev/null && break
    kill -0 $OBPID 2>/dev/null || break
    sleep 2
  done
  INVITE_TOKEN=$(grep -ao 'pcp_bootstrap_[0-9a-f]*' "$OBLOG" | head -1 || true)
  pkill -TERM -f "paperclipai onboard" 2>/dev/null || true
  sleep 5; pkill -KILL -f "paperclipai onboard" 2>/dev/null || true
  pkill -TERM -f "$PCHOME/instances/default/db" 2>/dev/null || true; sleep 2
  wait $OBPID 2>/dev/null || true
  [ -f "$PCCONF" ] && [ -f "$PCDB/PG_VERSION" ] || { tail -30 "$OBLOG" | tee -a "$LOGF"; die "inisialisasi Paperclip gagal, lihat $OBLOG"; }
  [ -n "$INVITE_TOKEN" ] || log "undangan bootstrap belum terbaca, dibuat ulang nanti"
fi
# atur port & hostname
python3 - "$PCCONF" "$PUBLIC_HOST" <<'PY'
import json, sys
f, host = sys.argv[1], sys.argv[2]
c = json.load(open(f))
s = c.setdefault("server", {})
s.update({"deploymentMode": "authenticated", "exposure": "private", "bind": "lan", "host": "0.0.0.0", "port": 3201, "serveUi": True})
hosts = s.get("allowedHostnames") or []
for h in [host, "127.0.0.1", "localhost"]:
    if h and h not in hosts:
        hosts.append(h)
s["allowedHostnames"] = hosts
c.setdefault("telemetry", {})["enabled"] = False
json.dump(c, open(f, "w"), indent=2)
PY
PG_PORT=$(python3 -c "import json;print(json.load(open('$PCCONF')).get('database',{}).get('embeddedPostgresPort',54330))")
ok "Paperclip dikonfigurasi (port 3201, database $PG_PORT, domain $PUBLIC_HOST)"

# ---------------------------------------------------------------- 4. file kantor
step "4/9 Salin tampilan Kantor AI, Kantor 3D & Rapat"
mkdir -p "$KD/state" "$KD/tasks" "$KA/tools" "$KA/ceo/workspace" "$KA/run-tokens" "$KA/staff"
for comp in proxy adapter paperclip-ui-dist Hermes3D; do
  src="$ROOT/files/kantor3d/$comp"; dst="$KD/$comp"
  rm -rf "$dst.new"; cp -a "$src" "$dst.new"
  # pakai ulang node_modules lama kalau package-lock sama (update lebih cepat)
  if [ -d "$dst/node_modules" ] && [ -f "$dst/package-lock.json" ] && cmp -s "$dst/package-lock.json" "$dst.new/package-lock.json"; then
    mv "$dst/node_modules" "$dst.new/node_modules"
  fi
  rm -rf "$dst.old"; [ -d "$dst" ] && mv "$dst" "$dst.old"; mv "$dst.new" "$dst"; rm -rf "$dst.old"
done
for comp in proxy adapter Hermes3D; do
  if [ ! -d "$KD/$comp/node_modules" ]; then
    log "npm install $comp (Kantor 3D paling lama, 3-10 menit)..."
    ( cd "$KD/$comp" && npm ci --cache "$NPMCACHE" --no-audit --no-fund >>"$LOGF" 2>&1 ) || ( cd "$KD/$comp" && npm install --cache "$NPMCACHE" --no-audit --no-fund >>"$LOGF" 2>&1 ) || die "npm install $comp gagal, lihat $LOGF"
  fi
done
find "$ROOT/files/kantor/tools" -maxdepth 1 -type f -exec cp {} "$KA/tools/" \;
chmod +x "$KA/tools/"* 2>/dev/null || true
cp "$ROOT/files/kantor/_shared_rules.md" "$KA/"
cp "$ROOT/files/kantor/ceo/AGENTS.md" "$ROOT/files/kantor/ceo/SOUL-telegram.md" "$KA/ceo/"
cp "$ROOT/files/kantor/tools/kantor-watchdog.sh" "$DATA/scripts/kantor_watchdog.sh" 2>/dev/null || { mkdir -p "$DATA/scripts"; cp "$ROOT/files/kantor/tools/kantor-watchdog.sh" "$DATA/scripts/kantor_watchdog.sh"; }
chmod +x "$DATA/scripts/kantor_watchdog.sh"
# adapter Hermes: run yang kehabisan batas langkah dilanjutkan otomatis (bukan jadi "blocked")
node "$KA/tools/patch-adapter.js" "$NPMG/lib/node_modules/paperclipai/node_modules/@paperclipai/hermes-paperclip-adapter/dist/server/execute.js" >>"$LOGF" 2>&1 || log "⚠️  patch adapter dilewati"
node "$KA/tools/patch-models.js" "$NPMG/lib/node_modules/paperclipai/node_modules/@paperclipai/server/dist/adapters/registry.js" >>"$LOGF" 2>&1 || log "⚠️  daftar model chat dilewati"
# adapter: port database & lokasi Paperclip mengikuti VPS ini
perl -pi -e 's/port: 54329,/port: parseInt(process.env.PAPERCLIP_PG_PORT || "54330", 10),/' "$KD/adapter/paperclip-gateway-adapter.js"
bash "$KA/tools/adlib-setup.sh" >>"$LOGF" 2>&1 && log "alat riset Ad Library siap" || log "⚠️  alat riset Ad Library belum siap (browser gagal diunduh), bisa diulang: bash $KA/tools/adlib-setup.sh"
ok "file kantor tersalin"

# ---------------------------------------------------------------- 5. nama & brand
step "5/9 Pasang nama perusahaan & pemilik"
export K_BRAND="$BRAND" K_OWNER="$OWNER" K_SAPAAN="$SAPAAN" K_BRAND_UP="$(printf '%s' "$BRAND" | tr '[:lower:]' '[:upper:]')"
brand_files() {
  find "$KA" -maxdepth 2 -name '*.md' -type f
  find "$KD/paperclip-ui-dist" "$KD/Hermes3D/.next" -type f \( -name '*.js' -o -name '*.html' -o -name '*.rsc' -o -name '*.body' \) ! -name '*.map'
  find "$KD/adapter" -maxdepth 1 -name '*.js' -type f
}
brand_files | while IFS= read -r f; do
  grep -qE 'Fauzy|DIGITALSTRATEGI|Digital Strategi|\{\{(BRAND|OWNER|SAPAAN)\}\}' "$f" 2>/dev/null || continue
  perl -pi -e 's/\{\{SAPAAN\}\}/$ENV{K_SAPAAN}/g; s/\{\{OWNER\}\}/$ENV{K_OWNER}/g; s/\{\{BRAND\}\}/$ENV{K_BRAND}/g; s/Pak Fauzy/$ENV{K_SAPAAN} $ENV{K_OWNER}/g; s/Fauzy/$ENV{K_OWNER}/g; s/DIGITALSTRATEGI/$ENV{K_BRAND_UP}/g; s/Digital Strategi/$ENV{K_BRAND}/g' "$f"
done
ok "brand: $BRAND, pemilik: $SAPAAN $OWNER"

# ---------------------------------------------------------------- 6. profil Hermes untuk agent
step "6/9 Siapkan profil Hermes untuk Arga & staf"
make_profile() { # nama, dengan_telegram(0/1)
  local P="$PROFILES/$1"; mkdir -p "$P"
  local CV; CV=$(grep -E '^_config_version:' "$DATA/config.yaml" 2>/dev/null | awk '{print $2}' | head -1)
  cat > "$P/config.yaml" <<YAML
_config_version: ${CV:-51}
model:
  default: $MODEL
  provider: custom:9router-vps-native
  base_url: $ROUTER_URL/v1
custom_providers:
  - name: 9Router VPS Native
    base_url: $ROUTER_URL/v1
    key_env: HERMES_CUSTOM_HTTP_127_0_0_1_20128_V1_API_KEY
    models_discovered: true
agent:
  reasoning_effort: low
terminal:
  client_env_passthrough: [PAPERCLIP_RUN_ID, PAPERCLIP_API_URL, PAPERCLIP_AGENT_ID, PAPERCLIP_COMPANY_ID, PAPERCLIP_TASK_ID, PAPERCLIP_WAKE_REASON, PAPERCLIP_WAKE_COMMENT_ID]
YAML
  if [ "$2" = 1 ]; then
    cat >> "$P/config.yaml" <<YAML
platforms:
  telegram:
    enabled: true
YAML
  fi
  umask 077
  {
    echo "HERMES_CUSTOM_HTTP_127_0_0_1_20128_V1_API_KEY=$ROUTER_KEY"
    if [ "$2" = 1 ]; then echo "TELEGRAM_BOT_TOKEN=$TG_TOKEN"; echo "TELEGRAM_ALLOWED_USERS=$TG_USER"; fi
  } > "$P/.env"
  umask 022
  printf 'description: Kantor AI agent profile (%s)\ndescription_auto: false\n' "$1" > "$P/profile.yaml"
}
make_profile kantorceo 0
make_profile kantorstaff 0
if [ -n "$TG_TOKEN" ]; then
  make_profile kantortg 1
  cp "$KA/ceo/SOUL-telegram.md" "$PROFILES/kantortg/SOUL.md"
fi
ok "profil siap (kantorceo, kantorstaff${TG_TOKEN:+, kantortg})"
# v1.4.0: setting menu Model AI (endpoint + API key sendiri) dipasang ulang supaya tidak tertimpa
if [ "$MAI_ON" = 1 ]; then
  /opt/hermes/.venv/bin/python "$KA/tools/model_ai.py" reapply >>"$LOGF" 2>&1 && ok "setting Model AI dipertahankan" || log "⚠️  pasang ulang Model AI gagal, buka menu Model AI lalu Simpan ulang"
fi

# ---------------------------------------------------------------- 7. service
step "7/9 Pasang service (jalan otomatis & hidup lagi kalau mati)"
write_service() { # nama, isi_run
  mkdir -p "$SVC/$1"
  printf '%s\n' "$2" > "$SVC/$1/run"
  printf '#!/bin/sh\nif [ "$1" = "78" ] || [ "$1" = "125" ]; then exit 125; fi\nexit 0\n' > "$SVC/$1/finish"
  chmod +x "$SVC/$1/run" "$SVC/$1/finish"
  if [ "$USE_S6" = 1 ]; then mkdir -p "$RUNSVC/$1"; cp "$SVC/$1/run" "$SVC/$1/finish" "$RUNSVC/$1/"; fi
}
SETUID='if [ "$(id -u)" = 0 ]; then exec /command/s6-setuidgid hermes "$@"; fi; exec "$@"'
write_service paperclip "#!/bin/sh
export HOME=$DATA/home
export PATH=\"/usr/local/bin:/usr/bin:/bin:$NPMG/bin:\$PATH\"
export PAPERCLIP_TELEMETRY_DISABLED=1
export PAPERCLIP_PUBLIC_URL=\"$PUBLIC_URL\"
export BETTER_AUTH_URL=\"$PUBLIC_URL\"
cd $PCHOME
# bersihkan PostgreSQL yatim (sisa server yang mati mendadak) supaya server baru bisa menyala
if ! pgrep -f \"paperclipai/dist/index.js run\" >/dev/null 2>&1 && pgrep -f \"postgres -D $PCHOME/instances/default/db\" >/dev/null 2>&1; then
  pkill -TERM -f \"postgres -D $PCHOME/instances/default/db\"; sleep 5
  pkill -KILL -f \"postgres -D $PCHOME/instances/default/db\" 2>/dev/null; sleep 1
  rm -f $PCHOME/instances/default/db/postmaster.pid
fi
set -- $(command -v node) $NPMG/lib/node_modules/paperclipai/dist/index.js run
exec >> $DATA/logs/paperclip.log 2>&1
$SETUID"
write_service kantor-proxy "#!/bin/sh
export HOME=$DATA/home PATH=\"/usr/local/bin:/usr/bin:/bin:\$PATH\"
export PROXY_PORT=3200 PAPERCLIP_TARGET=http://127.0.0.1:3201 KANTOR3D_TARGET=http://127.0.0.1:3400
cd $KD/proxy
set -- $(command -v node) proxy.js
exec >> $KD/proxy.log 2>&1
$SETUID"
write_service kantor-adapter "#!/bin/sh
export HOME=$DATA/home PATH=\"/usr/local/bin:/usr/bin:/bin:\$PATH\"
. $CONF
PGP=\$(ps -eo args | grep -E \"postgres -D $PCHOME/instances/default/db\" | grep -v grep | grep -oE '\\-p [0-9]+' | awk '{print \$2}' | head -1)
export PAPERCLIP_COMPANY_ID=\"\$COMPANY_ID\" PAPERCLIP_PG_PORT=\"\${PGP:-$PG_PORT}\" PAPERCLIP_URL=http://127.0.0.1:3201
cd $KD/adapter
set -- $(command -v node) paperclip-gateway-adapter.js
exec >> $KD/adapter.log 2>&1
$SETUID"
write_service kantor-web "#!/bin/sh
export HOME=$DATA/home PATH=\"/usr/local/bin:/usr/bin:/bin:\$PATH\"
export NEXT_PUBLIC_BRAND_NAME="$BRAND"
export NODE_ENV=production PORT=3400 HOST=127.0.0.1 NEXT_BASE_PATH=/kantor3d NEXT_TELEMETRY_DISABLED=1
export HERMES3D_GATEWAY_URL=ws://127.0.0.1:18792 KANTOR_ADAPTER_URL=ws://127.0.0.1:18792 UPSTREAM_ALLOWLIST=127.0.0.1,localhost
cd $KD/Hermes3D
set -- $(command -v node) server/index.js
exec >> $KD/web.log 2>&1
$SETUID"
if [ -n "$TG_TOKEN" ]; then
  write_service kantor-telegram "#!/bin/sh
export HOME=$DATA HERMES_HOME=$PROFILES/kantortg PATH=\"$KA/tools:/opt/hermes/.venv/bin:/usr/local/bin:/usr/bin:/bin:\$PATH\"
cd $KA/ceo/workspace
set -- $HERMES_BIN gateway run --replace
exec >> $DATA/logs/kantor-telegram.log 2>&1
$SETUID"
fi

# simpan konfigurasi (tanpa password & kunci)
umask 077
cat > "$CONF" <<CONFEOF
# Kantor AI — konfigurasi (dibuat installer v$TPL_VERSION)
TEMPLATE_VERSION="$TPL_VERSION"
BRAND="$BRAND"
OWNER="$OWNER"
SAPAAN="$SAPAAN"
PUBLIC_URL="$PUBLIC_URL"
OWNER_EMAIL="$OWNER_EMAIL"
ROUTER_URL="$ROUTER_URL"
MODEL="$MODEL"
TG_USER="$TG_USER"
COMPANY_ID="$COMPANY_ID"
CONFEOF
umask 022

# yang sudah jalan sebelumnya (update/ulang install) direstart supaya kode baru terpakai;
# yang baru dinyalakan tidak diganggu (mematikan Paperclip saat baru start bisa meninggalkan database yatim)
PRE_RUNNING=""
for s in paperclip kantor-proxy kantor-web; do [ -n "$(svc_pids $s)" ] && PRE_RUNNING="$PRE_RUNNING $s"; done
if [ "$USE_S6" = 1 ]; then "$S6CTL" -an "$RUNSVC" 2>/dev/null || true; else "$KA/tools/kantor-svc" start all; fi
for s in $PRE_RUNNING; do restart_svc $s; done
log "menunggu Paperclip menyala..."
wait_health || { tail -40 "$DATA/logs/paperclip.log" | tee -a "$LOGF"; die "Paperclip tidak stabil, lihat log di atas"; }
ok "service terpasang"

# ---------------------------------------------------------------- 8. akun, perusahaan, Arga
step "8/9 Bikin akun login, perusahaan & Arga"
if [ -z "$INVITE_TOKEN" ]; then
  # pakai port database yang BENAR-BENAR dipakai server (bisa beda dari config kalau port bentrok)
  PGP=$(pg_port_now); PGP=${PGP:-$PG_PORT}
  INVITE_TOKEN=$(cd /tmp && HOME=$DATA/home DATABASE_URL="postgres://paperclip:paperclip@127.0.0.1:$PGP/paperclip" \
    timeout 120 "$NPMG/bin/paperclipai" auth bootstrap-ceo -c "$PCCONF" 2>&1 | tee -a "$LOGF" | grep -ao 'pcp_bootstrap_[0-9a-f]*' | head -1 || true)
  [ -n "$INVITE_TOKEN" ] && log "undangan admin pertama dibuat" || log "admin sudah ada, undangan tidak diperlukan"
fi
PGX=$(pg_port_now); PGX=${PGX:-$PG_PORT}
SETUP_OUT=$(cd "$ROOT/lib" && PC_URL=http://127.0.0.1:3101 PUBLIC_URL="$PUBLIC_URL" KA="$KA" PAPERCLIP_HOME="$PCHOME" \
  OWNER_EMAIL="$OWNER_EMAIL" OWNER_PASSWORD="$OWNER_PASSWORD" OWNER_NAME="$OWNER" BRAND="$BRAND" \
  INVITE_TOKEN="$INVITE_TOKEN" MODEL="$MODEL" PG_PORT="$PGX" \
  PG_MODULE="$NPMG/lib/node_modules/paperclipai/node_modules/pg" node setup.js 2>>"$LOGF") || die "setup akun/Arga gagal, lihat $LOGF"
COMPANY_ID=$(printf '%s' "$SETUP_OUT" | python3 -c 'import sys,json;print(json.load(sys.stdin)["companyId"])')
perl -pi -e "s/^COMPANY_ID=.*/COMPANY_ID=\"$COMPANY_ID\"/" "$CONF"
[ "$USE_S6" = 1 ] || "$KA/tools/kantor-svc" start all
restart_svc kantor-adapter
[ -n "$TG_TOKEN" ] && restart_svc kantor-telegram
ok "akun owner, perusahaan $BRAND, dan Arga siap"

# ---------------------------------------------------------------- 9. cek akhir
step "9/9 Pasang penjaga otomatis & cek akhir"
# watchdog lewat jadwal Hermes (tetap ada walau container restart)
if HOME=$DATA timeout 60 "$HERMES_BIN" cron list 2>/dev/null | grep -q "kantor-watchdog"; then
  ok "penjaga otomatis sudah ada"
elif HOME=$DATA timeout 90 "$HERMES_BIN" cron create "every 2m" --name kantor-watchdog --script kantor_watchdog.sh \
      --no-agent --deliver local --catch-up off >>"$LOGF" 2>&1; then
  ok "penjaga otomatis dipasang (cek tiap 2 menit)"
else
  log "⚠️  penjaga otomatis gagal dipasang: minta Hermes buat cron job no_agent tiap 2 menit yang menjalankan kantor_watchdog.sh"
fi
sleep 8
for i in $(seq 1 30); do cek >/dev/null 2>&1 && break; sleep 3; done
cek || log "⚠️  ada komponen yang masih menyala, cek lagi 1-2 menit lagi: bash $ROOT/install.sh --cek"

{
echo
echo "=============================================================="
echo " 🎉 KANTOR AI SIAP"
echo "  Link kantor : $PUBLIC_URL"
echo "  Kantor 3D   : $PUBLIC_URL/kantor3d"
echo "  Login       : ${OWNER_EMAIL:-(email yang dipakai saat install)}"
echo "  CEO         : Arga (model $MODEL)"
[ -n "$TG_TOKEN" ] && echo "  Telegram    : chat bot kamu untuk ngobrol dengan Arga (@Nama untuk agent tertentu)"
echo "  Versi       : $TPL_VERSION"
echo "=============================================================="
} | tee -a "$LOGF"
