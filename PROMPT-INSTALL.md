# Kantor AI — Panduan & Prompt Install VPS (Hermes / Telegram)

Panduan ini digunakan untuk memasang **Kantor AI (3D Virtual Office + Paperclip + Agent)** di VPS (misalnya SumoPod) secara otomatis menggunakan perintah prompt ke Hermes / Bot Telegram.

---

## A. Opsi Provider AI (Pilih Salah Satu Sesuai Kebutuhan)

### Opsi 1: API Key Claude dari Teman / Pihak Ketiga ($500 / 30 Hari) + LiteLLM
* Sangat direkomendasikan jika Anda membeli key dari pihak ketiga (saldo $500, masa aktif 30 hari).
* LiteLLM bertindak sebagai proxy lokal di VPS Anda (`http://127.0.0.1:4000/v1`).
* Jika Anda memiliki lebih dari 1 key, LiteLLM otomatis melakukan **Round-Robin** dan **Failover** (jika key 1 limit/mati, otomatis beralih ke key 2).

### Opsi 2: 9Router Native
* Menggunakan 9Router bawaan VPS di port 20128.

### Opsi 3: Direct API Claude / OpenRouter
* Langsung menggunakan endpoint resmi atau custom endpoint tanpa perantara.

---

## B. Prompt Install untuk Telegram / Hermes di VPS

Salin dan tempel teks berikut ke chat **Hermes di VPS** atau **Bot Telegram**:

```text
Tolong pasang Kantor AI di VPS ini. Ikuti persis, jangan improvisasi.

1. Tanyakan ke saya satu per satu (tunggu tiap jawaban):
   a. Nama perusahaan/brand
   b. Nama saya + sapaan (Pak/Bu)
   c. Email untuk login web kantor
   d. Password login (minimal 8 karakter)
   e. Link VPS ini untuk port 3100 (pola https://hermes-xxxx-3100.<region>.sumopod.my.id)
   f. Token bot Telegram khusus kantor dari @BotFather (boleh jawab "lewati")
   g. API Key AI yang Anda miliki (contoh: API Key Claude dari teman, OpenRouter, atau 9Router)
   h. Endpoint URL (jawab "standar" jika pakai 9Router/LiteLLM, atau masukkan URL jika memakai custom base URL dari pihak ketiga)
   ID Telegram saya ambil sendiri dari chat ini, jangan ditanyakan.

2. Download template:
   cd /opt/data && rm -rf kantor-ai-template && git clone <URL_REPO_GITHUB_ANDA> kantor-ai-template

3. Jika memilih menggunakan LiteLLM (untuk rotasi/fallback banyak key Claude):
   bash /opt/data/kantor-ai-template/pasang-litellm.sh

4. Jalankan installer kantor di background:
   bash /opt/data/kantor-ai-template/install.sh \
     --brand "<a>" \
     --owner "<nama b>" \
     --sapaan <Pak/Bu> \
     --email "<c>" \
     --password '<d>' \
     --url "<e>" \
     --telegram-token "<f>" \
     --telegram-user <ID_TELEGRAM_SAYA> \
     --router-key "<g>" \
     --model "claude-3-5-sonnet"

   Pantau /opt/data/logs/kantor-install.log sampai muncul "KANTOR AI SIAP" atau "GAGAL" (10-20 menit).

5. Kalau GAGAL: jangan perbaiki sendiri. Kirim pesan error + 40 baris terakhir log install ke saya.
6. Kalau SIAP: laporkan link kantor, email login, dan hasil: bash /opt/data/kantor-ai-template/install.sh --cek
7. Jangan pernah menampilkan ulang password saya maupun token di laporan.
```

---

## C. Cara Memantau & Mengganti Key Bulanan (Jika Masa 30 Hari Habis)

Jika masa aktif 30 hari dari teman Anda habis dan Anda membeli API key baru:
1. Buka file konfigurasi di VPS:
   ```bash
   nano /opt/data/litellm/config.yaml
   ```
2. Ganti nilai `api_key: "KEY_BARU_ANDA"`
3. Restart service LiteLLM:
   ```bash
   pkill -f "litellm --config" && nohup /opt/data/litellm/start.sh &
   ```
Kantor 3D Anda akan langsung aktif kembali menggunakan key baru tanpa perlu install ulang!
