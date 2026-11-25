#!/bin/bash
# Kantor AI — pasang 9Router PERMANEN (jalankan di terminal ROOT Sumopod).
# Pakai: curl ... | PASS_9ROUTER=112233 bash
# - 9Router dipasang di /opt/data/9router (folder permanen), data di /opt/data/9router/data
# - jalan sebagai user hermes, dijaga cron Hermes "9router-keepalive" tiap 2 menit (nyala lagi kalau mati)
# - kalau sebelumnya pakai `npx 9router` (root), prosesnya dimatikan & datanya (provider, API key) dipindah
set -e
PASS_9ROUTER="${PASS_9ROUTER:-123456}"
NB=$(dirname "$(command -v node)")
mkdir -p /opt/data/9router/data /opt/data/logs /opt/data/scripts
echo "[9router] memasang 9Router (1-3 menit)..."
npm install --prefix /opt/data/9router 9router --no-audit --no-fund >/opt/data/logs/9router-install.log 2>&1 || { tail -20 /opt/data/logs/9router-install.log; echo "[9router] GAGAL install"; exit 1; }

cat > /opt/data/9router/start.sh <<EOF
#!/bin/sh
export HOME=/opt/data HOSTNAME=0.0.0.0 PORT=20128 DATA_DIR=/opt/data/9router/data
export INITIAL_PASSWORD="$PASS_9ROUTER"
export PATH="$NB:/usr/local/bin:/usr/bin:/bin:\$PATH"
cd /opt/data/9router
exec node node_modules/9router/app/server.js
EOF

cat > /opt/data/scripts/9router_keepalive.sh <<'EOF'
#!/bin/bash
if curl -s -m 8 -o /dev/null http://127.0.0.1:20128/; then echo ok; exit 0; fi
for p in $(pgrep -u "$(id -u)" -f "next-server|9router/app/server.js"); do
  [ "$(readlink /proc/$p/cwd 2>/dev/null)" = "/opt/data/9router/node_modules/9router/app" ] && kill "$p"
done
sleep 2
setsid nohup sh /opt/data/9router/start.sh >> /opt/data/logs/9router.log 2>&1 < /dev/null &
echo "$(date '+%F %T') 9router dinyalakan ulang" >> /opt/data/logs/9router-keepalive.log
echo started
EOF

cat > /opt/data/9router/reset-password.sh <<'EOF'
#!/bin/bash
# Reset password dashboard 9Router. Pakai: bash /opt/data/9router/reset-password.sh 112233
NEW="${1:?Pakai: bash /opt/data/9router/reset-password.sh PASSWORD_BARU}"
S=/opt/data/9router/start.sh
if grep -q '^export INITIAL_PASSWORD=' "$S"; then sed -i "s#^export INITIAL_PASSWORD=.*#export INITIAL_PASSWORD=\"$NEW\"#" "$S"
else sed -i "s#^cd /opt/data/9router#export INITIAL_PASSWORD=\"$NEW\"\ncd /opt/data/9router#" "$S"; fi
python3 -c "import sqlite3;c=sqlite3.connect('/opt/data/9router/data/db/data.sqlite');c.execute(\"update settings set data=json_remove(data,'\$.password') where json_extract(data,'\$.password') is not null\");c.commit()"
for p in $(pgrep -f "next-server|9router/app/server.js"); do
  [ "$(readlink /proc/$p/cwd 2>/dev/null)" = "/opt/data/9router/node_modules/9router/app" ] && kill "$p"
done
sleep 3
U=$(stat -c %U /opt/data/9router)
if [ "$(id -un)" = "$U" ]; then bash /opt/data/scripts/9router_keepalive.sh >/dev/null; else /command/s6-setuidgid "$U" bash /opt/data/scripts/9router_keepalive.sh >/dev/null; fi
sleep 10
echo "Password 9Router sekarang: $NEW (login di dashboard port 20128)"
EOF
chmod +x /opt/data/9router/start.sh /opt/data/scripts/9router_keepalive.sh /opt/data/9router/reset-password.sh

pkill -f "bin/9router" 2>/dev/null || true; sleep 3
[ -d /root/.9router ] && cp -a /root/.9router/. /opt/data/9router/data/ || true
chown -R hermes:hermes /opt/data/9router /opt/data/logs /opt/data/scripts

AS_H="/command/s6-setuidgid hermes"
$AS_H bash /opt/data/scripts/9router_keepalive.sh >/dev/null
$AS_H env HOME=/opt/data /opt/hermes/.venv/bin/hermes cron list 2>/dev/null | grep -q 9router-keepalive || \
  $AS_H env HOME=/opt/data /opt/hermes/.venv/bin/hermes cron create "every 2m" --name 9router-keepalive --script 9router_keepalive.sh --no-agent --deliver local --catch-up off >/dev/null

sleep 15
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:20128/ || true)
if [ "$CODE" = "307" ] || [ "$CODE" = "200" ]; then
  echo "[9router] ✅ 9Router JALAN permanen di port 20128 (password awal dashboard: $PASS_9ROUTER)"
  echo "[9router] Lanjut: buka port 20128 di Sumopod → login → sambungkan provider → buat API key."
  echo "[9router] Lupa password? jalankan: bash /opt/data/9router/reset-password.sh PASSWORD_BARU"
else
  echo "[9router] ⚠️ 9Router belum menjawab (kode $CODE). Tunggu 2 menit lalu cek: curl -I http://127.0.0.1:20128/"
fi
