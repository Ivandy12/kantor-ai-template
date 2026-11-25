# Kantor AI — Template by DIGITALSTRATEGI

Kantor virtual berisi agent AI untuk VPS **Hermes (Sumopod)**: tampilan Paperclip versi Indonesia (tema ungu), Kantor 3D, Rapat & debat antar agent, dan **Arga** sebagai CEO.

## Isi
| Komponen | Port | Keterangan |
|---|---|---|
| Paperclip 2026.1005.0 | 3101 | mesin tugas, agent, approval (versi dikunci) |
| Pintu depan (proxy) | 3100 | menyajikan tampilan Kantor AI + Kantor 3D di satu link |
| Kantor 3D | 3300 | Hermes3D yang sudah di-build (`/kantor3d`) |
| Adapter rapat & chat | 18790 | rapat, chat langsung ke agent, jadikan tugas |
| Bot Telegram Arga | – | opsional, chat ke Arga / `@Nama` ke agent |

## Syarat VPS
- Container Hermes Sumopod (ada `/opt/hermes`, s6, folder `/opt/data`)
- 9Router sudah jalan di `127.0.0.1:20128` (kunci API diambil & diuji otomatis dari Hermes; atau `--router-key`)
- **Port 3100 dibuka** di dashboard Sumopod
- **Paket RAM minimal 4 GB** (Hermes ~1,5 GB + kantor ~1,5 GB; paket 2 GB pasti gagal karena kehabisan RAM)
- Disk kosong ≥ 3 GB

## Install
Lihat `PROMPT-INSTALL.md` (member cukup menempel prompt itu ke Hermes).

Manual:
```bash
bash install.sh --brand "PT Maju Jaya" --owner "Budi" --sapaan Pak \
  --email budi@email.com --password 'RahasiaKuat123' \
  --url https://hermes-xxxx-3100.jkt1.sumopod.my.id \
  --telegram-token 123:ABC --telegram-user 123456789
```

## Perintah lain
- `bash install.sh --cek` — cek semua komponen
- `bash install.sh --update` — pasang versi terbaru (data, agent, tugas aman)

## Lokasi penting di VPS
- Konfigurasi: `/opt/data/kantor/kantor.conf`
- Log install: `/opt/data/logs/kantor-install.log`
- Data Paperclip: `/opt/data/home/.paperclip`
