# Deploy ke VPS (Docker)

Panduan ini untuk Ubuntu/Debian VPS. Service tidak membuka HTTP port; bot hanya membutuhkan koneksi keluar ke RPC BSC, Binance, GitHub, dan Telegram.

## 1. Siapkan server

Masuk sebagai user dengan akses `sudo`, lalu instal Docker, Git, dan firewall dasar.

```sh
sudo apt update
sudo apt install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
sudo ufw allow OpenSSH
sudo ufw enable
```

Tidak perlu membuka port web tambahan.

## 2. Ambil aplikasi dan buat konfigurasi

```sh
sudo mkdir -p /srv/runitup
sudo chown "$USER":"$USER" /srv/runitup
git clone https://github.com/anandaahmd13/bsc.git /srv/runitup
cd /srv/runitup
mkdir -p data
cp .env.example .env
chmod 600 .env
```

Edit `.env` dengan editor pilihan Anda.

```sh
nano .env
```

Nilai minimum yang perlu diisi:

```dotenv
HTTP_RPC_URLS=https://RPC_BSC_BERBAYAR_1,https://RPC_BSC_BERBAYAR_2
WS_RPC_URL=wss://WSS_BSC_BERBAYAR
DB_PATH=./data/runitup.sqlite
DRY_RUN=true
TELEGRAM_BOT_TOKEN=ISI_TOKEN_BOT
TELEGRAM_CHAT_IDS=ISI_CHAT_ID
TELEGRAM_ADMIN_USER_IDS=ISI_NUMERIC_TELEGRAM_USER_ID
```

Jangan memasukkan `.env` ke Git dan jangan membagikan token bot. Gunakan RPC BSC berbayar yang mendukung historical `eth_getLogs`; endpoint publik hanya cocok untuk uji coba.

## 3. Build dan jalankan observasi

```sh
docker build -t runitup-bsc:latest .
docker run -d \
  --name runitup-bsc \
  --restart unless-stopped \
  --env-file /srv/runitup/.env \
  -v /srv/runitup/data:/app/data \
  runitup-bsc:latest
docker logs -f runitup-bsc
```

Biarkan `DRY_RUN=true` selama beberapa jam atau satu hari. Periksa log untuk RPC error, lag, atau pesan duplikat. Database berada di `/srv/runitup/data` dan aman saat container direstart.

## 4. Aktifkan Telegram

Setelah observasi bersih, ubah `DRY_RUN=false`, lalu recreate container.

```sh
cd /srv/runitup
nano .env
docker rm -f runitup-bsc
docker run -d \
  --name runitup-bsc \
  --restart unless-stopped \
  --env-file /srv/runitup/.env \
  -v /srv/runitup/data:/app/data \
  runitup-bsc:latest
docker logs -f runitup-bsc
```

Gunakan `/status`, `/pause`, `/resume`, dan `/last` dari akun Telegram yang numeric ID-nya terdaftar pada `TELEGRAM_ADMIN_USER_IDS`.

## 5. Update aplikasi

```sh
cd /srv/runitup
git pull --ff-only origin main
docker build -t runitup-bsc:latest .
docker rm -f runitup-bsc
docker run -d \
  --name runitup-bsc \
  --restart unless-stopped \
  --env-file /srv/runitup/.env \
  -v /srv/runitup/data:/app/data \
  runitup-bsc:latest
docker ps
docker logs --tail 100 runitup-bsc
```

Restart tidak menggandakan alert: event dan outbox Telegram disimpan idempoten di SQLite.

## Operasional singkat

```sh
# Status dan log
docker ps
docker logs -f runitup-bsc

# Restart
docker restart runitup-bsc

# Backup database (jalankan dari /srv/runitup)
tar -czf runitup-backup-$(date +%F).tgz data
```

Simpan backup database di lokasi terpisah. Sebelum menambah factory atau komponen Runitup baru, verifikasi ABI/source dan perbarui registry terlebih dahulu.
