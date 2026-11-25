# Catatan versi Kantor AI

## 1.5.5
- Menu "Keahlian" di halaman agent disembunyikan.

## 1.5.4
- Menu "Keahlian" di sidebar disembunyikan.

## 1.5.3
- Menu "Konektor" di sidebar disembunyikan.

## 1.5.2
- Perbaikan: menu Telegram tidak lagi error "Organization not found".

## 1.5.1
- Menu Telegram dipisah: sekarang menu sendiri "Telegram" di bawah "Model AI".
- Model per agent: di menu Model AI tiap agent bisa pilih model sendiri dari daftar 9Router / endpoint Model AI (dites dulu sebelum dipasang). Pilihan tetap bertahan saat update.
- Kantor 3D: pilihan "Choose model" di chat sekarang berisi model asli dari 9Router (bukan Gemini Flash tetap), ganti model langsung berlaku untuk agent itu (chat & tugas).

## 1.5.0
- Hemat token: kalau endpoint mendukung format Anthropic (/v1/messages, mis. 9Router + model claude), agent otomatis pakai prompt caching. Tes di VPS: biaya input turun ±40%.
- Lebih cepat & tidak muter: batas langkah CEO 30 / staf 45, lanjut otomatis maks 3x (sebelumnya 8x). Aturan "Hemat & cepat" untuk Arga & semua staf: tugas simpel dikerjakan langsung, delegasi ke 1 agent saja, tanpa riset tambahan kalau tidak diminta.
- Jadikan tugas: pilih "Langsung ke <agent>" atau "Lewat Arga".
- Menu Model AI: bagian baru "Koneksi Telegram Hermes" — sambungkan bot Telegram ke Hermes utama dari web (token + ID pemilik, cari ID otomatis, putuskan).
- Tool baru `metaads` (baca akun, campaign, insights Meta Ads lewat Graph API).

## 1.4.4
- Model AI: satu model saja, tanpa model cadangan (respon lebih cepat). Tombol "+ cadangan" & kolom cadangan dihapus; cadangan lama otomatis dibersihkan saat simpan/reapply.

## 1.4.3
- Chat/tugas: pilihan "Choose model (Hermes CLI)" sekarang menampilkan semua model dari endpoint Model AI (atau 9Router lokal) — bisa ganti model per chat.

## 1.4.2 — Perbaikan kecil hasil tes install
- Tulisan "KANTOR AI SIAP" sekarang ikut masuk log install (prompt install memantau log ini).
- Profil agent ditulis dengan versi config Hermes yang benar (hilangkan peringatan "config predates version 12").
- File baru `pasang-9router.sh`: pasang 9Router permanen + penjaga otomatis + `reset-password.sh`.

## 1.4.1 — Agent lebih efektif: tugas jalan, rekrut jalan, riset iklan tanpa approval
- Perbaikan besar: tugas agent tidak lagi gagal "No Anthropic credentials" kalau nama model 9Router diawali `claude-...`
  (Paperclip salah menebak penyedia). Semua agent memakai provider "auto" (ikut profil Hermes). Agent lama ikut diperbaiki saat update.
  Ini juga penyebab tugas "muter-muter" (tiap run gagal lalu diulang).
- Rekrut `pc hire` jalan normal (agent baru juga provider "auto").
- Alat riset baru `adlib`: baca Meta Ad Library tanpa login lewat browser headless → pengiklan teratas, teks iklan, tanggal,
  varian, harga, domain landing. Browser dipasang otomatis saat install/update (~110 MB).
- Aturan kerja baru: riset/analisa/draf TIDAK perlu approval, "anti muter" (jalan dengan asumsi wajar, mentok = lapor sekali + blocked),
  laporan wajib berisi hasil nyata. Arga: brief delegasi wajib lengkap & boleh kerjakan tugas kecil sendiri.
  Instruksi staf lama ikut diperbarui saat update.

## 1.4.0 — Menu Model AI (pakai endpoint & API key sendiri)
- Menu baru **Model AI** di sidebar: isi endpoint OpenAI-compatible (OpenRouter, OpenAI, Anthropic, 9Router lain, dll.)
  + API key + model utama & cadangan (boleh lebih dari satu, pisahkan koma) → **Tes API** → **Simpan & terapkan ke semua agent**.
- "Ambil daftar model" langsung menampilkan daftar model yang bisa diklik (+ tombol tambah ke cadangan).
- Tes API sungguhan: model harus membalas teks (balasan error di dalam stream ikut terdeteksi).
- Setelah diterapkan semua agent (Arga, staf, bot Telegram kantor, opsional Hermes utama) pindah ke model itu, bukan 9Router.
  Batas waktu jawaban dinaikkan ke 10 menit (jawaban panjang tidak putus di 30 detik).
- Agent baru hasil `pc hire` otomatis ikut model dari menu Model AI.
- `install.sh --update` mempertahankan setting Model AI (cek 9Router dilewati kalau Model AI aktif).
- Kolom API key tidak lagi diisi otomatis oleh browser dengan password login.

## 1.3.2 — Install Paperclip lebih tahan banting
- Pakai cache npm sendiri (`/opt/data/.npm-kantor-cache`). Dulu install gagal di VPS yang cache npm-nya
  berisi file milik root (biasanya karena pernah install sesuatu lewat terminal root) — error EACCES.
- Kalau install Paperclip gagal: sisa install dibersihkan lalu diulang otomatis dalam mode hemat RAM
  (VPS 4 GB yang RAM-nya sedang banyak terpakai sempat gagal karena npm dimatikan sistem/OOM).
- Kalau tetap gagal, pesan error npm & sisa RAM langsung ditampilkan (tidak cuma "lihat log").

## 1.3.1 — Agent bisa menyelesaikan kerjaan besar (bikin aplikasi/tools)
- Dulu: tugas besar berhenti di tengah ("Hermes exited with code 1") karena batas langkah per run habis,
  lalu tugas jadi "blocked". Sekarang kalau batas langkah habis, kerjaan otomatis dilanjutkan (sampai 8x).
- Batas langkah dinaikkan: staf 60 langkah / 30 menit per run, Arga 40 langkah / 20 menit.
- Agent lama ikut diperbarui saat "update kantor".
- Aturan kerja baru untuk agent: kerja bertahap + lapor progres, tandai selesai hanya kalau aplikasinya sudah dites.

## 1.3.0 — Kantor 3D lebih rapi & realistis
- Pintu ruang Bos & CEO setinggi orang (dulu cuma ~1 m).
- Agent tidak lagi menembus sandaran kursi orang lain saat lewat.
- Tidak ada lagi dua agent di satu meja/kursi.
- Pantry: meja setinggi meja kerja + kursi pas menghadap meja (kaki tidak menembus meja).
- Lounge: sofa & meja kopi ditata ulang (dulu tumpang tindih, agent "santai" berdiri di dalam sofa).
- Titik santai yang nyasar (ke dalam meja tim Tech / ruang rapat) dibetulkan.
- Agent bernama perempuan (Maya, Sora, dll.) otomatis pakai karakter perempuan.
- Monitor agent (Monitor View) tampil sesuai divisinya: Ads Manager, Studio Konten, Page Builder, Papan Kendali CEO,
  Spreadsheet Keuangan, WhatsApp CS, Riset, Ruang Kerja — isinya tugas nyata agent. Metrik yang belum tersambung ditulis "—".
- Panel daftar Ruangan dihapus; tombol "Semua ke ruang rapat" & "Mulai rapat AI" jadi tombol kecil di kiri atas.
- Pindah Dashboard ↔ Kantor 3D tanpa loading (Kantor 3D dimuat sekali dan tetap hidup di belakang layar).
- Tombol "Layar penuh" untuk Kantor 3D (Esc untuk keluar).

## 1.2.x
- Rekrut agent 1 langkah (`pc hire`) + persetujuan di Inbox; instruksi Arga ikut ter-update.
- Perbaikan install di VPS baru (RAM minimal 4 GB, 9Router diuji sungguhan, watchdog otomatis).
