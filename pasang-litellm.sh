#!/bin/bash
# =====================================================================
#  Kantor AI — Pasang LiteLLM Proxy Permanen (Round-Robin & Multi-Key)
#  Lokasi: /opt/data/kantor-ai-template/pasang-litellm.sh
#
#  Fungsi:
#  - Mengelola 1 atau banyak API key Claude / OpenAI / Reseller Pihak Ketiga
#  - Otomatis Round-Robin & Fallback jika satu key limit atau habis saldo
#  - Menjalankan proxy lokal di http://127.0.0.1:4000/v1
# =====================================================================
set -e

DATA=/opt/data
LLM_DIR=$DATA/litellm
LOGS=$DATA/logs
PIP_BIN="/opt/hermes/.venv/bin/pip"
PYTHON_BIN="/opt/hermes/.venv/bin/python"

if [ ! -x "$PIP_BIN" ]; then
  PIP_BIN=$(command -v pip3 || command -v pip)
fi

mkdir -p "$LLM_DIR" "$LOGS"

echo "[litellm] Memasang LiteLLM Proxy..."
"$PIP_BIN" install "litellm[proxy]" > "$LOGS/litellm-install.log" 2>&1 || {
  echo "[litellm] Percobaan 1 gagal, mencoba instalasi litellm core..."
  "$PIP_BIN" install litellm >> "$LOGS/litellm-install.log" 2>&1 || {
    tail -20 "$LOGS/litellm-install.log"
    echo "[litellm] ❌ GAGAL memasang LiteLLM"
    exit 1
  }
}

# Buat konfigurasi default jika belum ada
if [ ! -f "$LLM_DIR/config.yaml" ]; then
cat > "$LLM_DIR/config.yaml" <<'EOF'
model_list:
  - model_name: claude-3-5-sonnet
    litellm_params:
      model: anthropic/claude-3-5-sonnet-20241022
      api_key: "GANTI_DENGAN_API_KEY_ANDA"
      # Jika membeli dari teman/reseller yang memakai custom URL, aktifkan baris di bawah:
      # api_base: "https://api.domain-teman.com/v1"

router_settings:
  routing_strategy: round-robin
  num_retries: 3
  timeout: 60
  allowed_fails: 2
  cooldown_time: 30

general_settings:
  master_key: "sk-kantor-local-master"
EOF
fi

# Skrip start service
cat > "$LLM_DIR/start.sh" <<EOF
#!/bin/sh
export HOME=/opt/data
exec $PYTHON_BIN -m litellm --config $LLM_DIR/config.yaml --port 4000 --host 127.0.0.1
EOF
chmod +x "$LLM_DIR/start.sh"

# Skrip keepalive otomatis
cat > "$DATA/scripts/litellm_keepalive.sh" <<'EOF'
#!/bin/bash
if curl -s -m 5 -o /dev/null http://127.0.0.1:4000/health; then exit 0; fi
pkill -f "litellm --config" 2>/dev/null || true
sleep 1
nohup /opt/data/litellm/start.sh >> /opt/data/logs/litellm.log 2>&1 &
echo "$(date '+%F %T') LiteLLM dinyalakan ulang" >> /opt/data/logs/litellm-keepalive.log
EOF
chmod +x "$DATA/scripts/litellm_keepalive.sh"

# Jalankan service
nohup "$LLM_DIR/start.sh" >> "$LOGS/litellm.log" 2>&1 &
sleep 5

if curl -s -m 5 -o /dev/null http://127.0.0.1:4000/health || curl -s -m 5 -o /dev/null http://127.0.0.1:4000/; then
  echo "✅ LiteLLM BERHASIL AKTIF di http://127.0.0.1:4000/v1"
  echo "Endpoint: http://127.0.0.1:4000/v1"
  echo "Master Key: sk-kantor-local-master"
  echo "Edit daftar key Anda di: /opt/data/litellm/config.yaml"
else
  echo "⚠️ LiteLLM sedang memuat. Cek log: tail -n 20 /opt/data/logs/litellm.log"
fi
