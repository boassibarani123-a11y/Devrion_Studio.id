# PROJECT_CONTEXT — Resto POS (Cafe & Resto multi-tenant) · by Devrion

## 1. Fungsi aplikasi
Web App POS untuk banyak Cafe & Resto dalam 1 server (multi-tenant).
- **Founder**: daftar/ubah/aktif-nonaktif resto + buat akun admin resto. Tidak bisa melihat penghasilan resto.
- **Admin**: dashboard laporan (pendapatan, pengeluaran, laba, grafik, menu terlaris, metode bayar), POS, pesanan, dapur, menu + kategori + foto, meja + QR/NFC link, staf (kasir/dapur per outlet) & outlet, pengeluaran, pengaturan (logo, nama, QRIS on/off + foto, rekening bank).
- **Kasir** (1 outlet): POS, terima pesanan dari meja real-time, kirim ke dapur, konfirmasi pembayaran / cek bukti bayar.
- **Dapur** (1 outlet): papan kanban drag & drop Baru → Dimasak → Siap → Disajikan (pindah 1 tahap).
- **Pelanggan** (tanpa login): tap NFC / scan QR meja → halaman menu di browser `/api/m/{kode_meja}` → pesan → animasi sukses + nota → bayar di kasir, atau QRIS/transfer + upload bukti bayar → status pesanan terpantau.

## 2. Teknologi
- Frontend: Expo SDK 58 + React Native Web + expo-router (file routing), TanStack Query, Reanimated 4, Gesture Handler 3, expo-image, expo-image-picker, @react-native-vector-icons/ionicons. Font: Space Grotesk & Geist (`frontend/assets/fonts`).
- Web App: hasil `expo export -p web` (folder `backend/web_dist`) disajikan oleh backend di **`/api/app`**.
- Backend: FastAPI (Python 3.11), Motor (MongoDB async), PyJWT + bcrypt, qrcode[pil], requests.
- Database: MongoDB.
- Realtime: WebSocket `/api/ws?token=` (hub di dalam proses) + polling 10 detik sebagai cadangan.

## 3. Struktur proyek
```
backend/
  server.py            # semua API (/api/*), seed, websocket, static web app
  storage.py           # helper object storage (key dari .env)
  customer_page.html   # halaman menu pelanggan (HTML+JS murni) -> /api/m/{code}
  web_dist/            # hasil build Web App (disajikan di /api/app)
  requirements.txt
  .env.example
  tests/               # pytest (28 tes: API, isolasi tenant, perbaikan iterasi 2)
frontend/
  app/                 # layar: _layout, index, login, founder, dashboard, pos, orders,
                       #        kitchen, menu, tables, staff, expenses, settings
  src/                 # api.ts, auth.tsx, shell.tsx, ui.tsx, live.tsx, orders.tsx,
                       # pick-image.tsx, theme.ts, utils/(storage, upload), query-client.ts
  assets/              # fonts, images (devrion-logo.png hanya di login)
  scripts/build-web.sh # build ulang Web App ke backend/web_dist
  app.json, app.config.js, package.json, yarn.lock, tsconfig.json, metro.config.js
  .env.example
design_guidelines.json # token warna/spacing (tema gelap oranye)
memory/PRD.md          # dokumen kebutuhan & backlog
```

## 4. API utama (prefix `/api`)
- Auth: `POST /auth/login`, `GET /auth/me`
- Founder: `GET/POST /founder/restaurants`, `PATCH /founder/restaurants/{id}`
- Admin: `/outlets`, `/staff`, `/categories`, `/menu`, `/tables` (+`/regenerate`), `/expenses`, `/settings`, `/reports/summary?days=`, `POST /upload` (multipart kind=menu|logo|qris)
- Pesanan: `POST /orders` (POS), `GET /orders?scope=active|kitchen|today|all`, `PATCH /orders/{id}/status`, `PATCH /orders/{id}/payment`
- Publik: `GET /public/menu/{code}`, `POST /public/orders`, `GET /public/orders/{id}?t=`, `POST /public/orders/{id}/proof`
- Lain: `GET /files/{path}`, `GET /qr/{code}.png`, `GET /m/{code}` (halaman pelanggan), `GET /app/*` (Web App), `WS /ws`, `GET /health` (tanpa prefix)

## 5. Integrasi
- **Object storage** (foto menu, logo, QRIS, bukti bayar) via `backend/storage.py`. Butuh `DEVRION_STORAGE_KEY` + URL proxy storage. Kunci yang dipakai di workspace lama adalah kunci layanan platform Emergent; di server baru perlu diganti ke penyimpanan lain (mis. S3/Cloudflare R2) dengan mengubah `put_object`/`get_object` di `storage.py` saja.
- Tidak ada payment gateway: QRIS = gambar statis milik resto, transfer = rekening manual, konfirmasi oleh kasir.
- NFC: tulis URL `https://<domain>/api/m/<kode_meja>` ke tag NFC (mis. app NFC Tools). Link ada di menu **Meja & QR**.

## 6. Database (MongoDB) — untuk pemulihan
Database name dari `DB_NAME`. Koleksi & indeks dibuat otomatis saat startup (`ensure_indexes`):
| Koleksi | Isi | Indeks |
|---|---|---|
| users | akun semua role (password bcrypt) | email (unique), id (unique), restaurant_id |
| restaurants | data resto, logo_path, qris_*, bank_accounts | id (unique) |
| outlets | outlet per resto | id, restaurant_id |
| categories | kategori menu | id, (restaurant_id, sort) |
| menu_items | menu (price int Rupiah, image_path/image_url) | id, restaurant_id |
| tables | meja + `code` acak untuk link NFC/QR | id, code (unique), restaurant_id |
| orders | pesanan (items, total, status, payment_status, public_token) | id, (restaurant_id, created_at), (restaurant_id, status) |
| expenses | pengeluaran | id, (restaurant_id, date) |
| files | metadata file storage (path, public, restaurant_id) | path (unique) |
| counters | nomor nota harian | — |
| login_attempts | penguncian brute-force (TTL) | key (unique), expires_at (TTL) |

Semua id adalah UUID string (field `id`), `_id` Mongo tidak pernah dikirim ke klien. Waktu disimpan ISO UTC; laporan dihitung zona WIB.
**Backup data** (jalankan dari mesin yang punya akses DB, tidak mengubah data):
`mongodump --uri="<MONGO_URL>" --db=<DB_NAME> --out=./dump` → pulihkan: `mongorestore --uri="<MONGO_URL_BARU>" ./dump`.
File gambar ada di object storage (bukan di MongoDB) — perlu dimigrasi terpisah jika pindah penyedia storage.

## 7. Deployment
- **Kondisi saat ini**: proyek berjalan di preview Emergent; tidak ada file konfigurasi Railway di dalam proyek ini (belum pernah dibuat). Tidak ada data/URL produksi yang diketahui dari workspace.
- **Rencana Railway (belum diuji)**:
  1. Service backend: root `backend/`, start command `uvicorn server:app --host 0.0.0.0 --port $PORT --workers 1`.
     `--workers 1` wajib selama realtime memakai hub di dalam proses (lihat backlog Redis).
  2. Tambah plugin MongoDB Railway (atau MongoDB Atlas) → isi `MONGO_URL` & `DB_NAME` di Variables.
  3. Isi Variables lain sesuai `backend/.env.example` (JWT_SECRET baru, FOUNDER_*, storage, SEED_DEMO=false).
  4. Healthcheck path: `/health`.
  5. Web App: jalankan `frontend/scripts/build-web.sh` sebelum deploy (hasil di `backend/web_dist`), lalu buka `https://<domain>/api/app`.
- Load balancing / banyak instance: perlu Redis pub/sub untuk WebSocket hub (belum dibuat).

## 8. Status pekerjaan
- Selesai & lolos 2 iterasi testing (28 tes backend, alur UI mobile & desktop).
- Perubahan terakhir: diubah menjadi Web App (`/api/app`), animasi "mantul" (spring) diganti transisi halus.
- Akun demo (hanya jika SEED_DEMO=true): admin@kopisenja.id, kasir@kopisenja.id, dapur@kopisenja.id — password demo ada di `seed()` pada `server.py`. Ganti/nonaktifkan di produksi.

## 9. Melanjutkan di workspace baru
1. Ekstrak `project-backup.zip`.
2. Backend: `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
   (jika `emergentintegrations` gagal terpasang, hapus baris itu — tidak dipakai kode).
   Salin `.env.example` → `.env`, isi nilainya. Jalankan `uvicorn server:app --host 0.0.0.0 --port 8001 --reload`.
3. Frontend: `cd frontend && yarn install` → salin `.env.example` → `.env` (EXPO_PUBLIC_BACKEND_URL = URL backend) → `yarn web` untuk dev.
4. Build Web App produksi: `bash frontend/scripts/build-web.sh` → buka `<backend>/api/app`.
5. Tes: `cd backend && REACT_APP_BACKEND_URL=<url> pytest tests -q`.

## 10. Backlog
P1: lembar cetak QR semua meja, struk printer thermal, aturan transisi status untuk kasir/admin.
P2: Redis pub/sub untuk multi-instance, promo/banner, varian menu (ukuran/topping), hapus/arsip resto.
