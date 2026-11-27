#!/usr/bin/env bash
# Kantor AI — watchdog. Dijalankan cron Hermes tiap 2 menit.
# Mode s6: kalau container restart, /run/service kosong lagi -> pulihkan dari /opt/data/services.
# Mode mandiri: nyalakan ulang penjaga kantor-svc yang mati.
SVC=/opt/data/services
RUN=/run/service
if [ -d "$RUN" ] && [ -w "$RUN" ] && [ -x /command/s6-svscanctl ]; then
  restored=""
  for s in paperclip kantor-proxy kantor-adapter kantor-web kantor-telegram; do
    [ -x "$SVC/$s/run" ] || continue
    if [ ! -x "$RUN/$s/run" ]; then
      mkdir -p "$RUN/$s" && cp "$SVC/$s/run" "$SVC/$s/finish" "$RUN/$s/" && restored="$restored $s"
    fi
  done
  if [ -n "$restored" ]; then
    /command/s6-svscanctl -an "$RUN" 2>/dev/null || true
    echo "[kantor-watchdog] dipulihkan:$restored"
  fi
else
  /opt/data/kantor/tools/kantor-svc start all
fi
# 9Router mati -> nyalakan (kalau VPS ini memakai start.sh di /opt/data/9router)
if ! curl -s -m 5 -o /dev/null http://127.0.0.1:20128/ && [ -x /opt/data/9router/start.sh ]; then
  setsid nohup /opt/data/9router/start.sh >/dev/null 2>&1 < /dev/null &
  echo "[kantor-watchdog] 9Router dinyalakan"
fi
# pintu depan mati -> matikan prosesnya supaya dinyalakan ulang
if ! curl -s -m 5 -o /dev/null http://127.0.0.1:3100/api/health; then
  for p in $(pgrep -f "node proxy.js"); do
    [ "$(readlink /proc/$p/cwd)" = "/opt/data/kantor3d/proxy" ] && kill -TERM "$p"
  done
  echo "[kantor-watchdog] proxy 3100 tidak merespon, direstart"
fi
exit 0
