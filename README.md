# FoodMap GIS 🍜

**Sistem Informasi Geografis Pencarian Penyedia Makanan Berbasis Web**
Menggunakan **Google Maps API** dan **Database MySQL** — Tugas Proyek Mata Kuliah Sistem Informasi Geografis (GIS).

> Dikembangkan oleh **King Faisal** — https://github.com/KingFaisal25

Aplikasi web bergaya GoFood yang menampilkan lokasi penyedia makanan (restoran, rumah makan, warung makan, kafe, jajanan) di peta Google Maps lengkap dengan marker, detail menu & harga, pencarian, filter, dan petunjuk rute dari posisi pengguna.

![Stack](https://img.shields.io/badge/PHP-8.x-777BB4) ![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1) ![Google Maps](https://img.shields.io/badge/Google_Maps-JS_API-4285F4) ![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Fitur (sesuai ketentuan soal)

| # | Fitur wajib | Status |
|---|-------------|--------|
| 1 | Peta digital Google Maps + marker semua penyedia | ✅ |
| 2 | CRUD penyedia makanan (admin) | ✅ `admin.php` |
| 3 | Pencarian (nama/alamat/kategori) + filter kategori & rentang harga | ✅ |
| 4 | Detail penyedia: nama, alamat, menu, harga, jam operasional, foto | ✅ |
| 5 | Petunjuk rute Google Maps dari posisi pengguna | ✅ (Directions API + link `maps/dir`) |
| 6 | Deteksi lokasi pengguna (geolokasi browser) | ✅ |
| — | 20 penyedia makanan, masing-masing ≥ 3 menu | ✅ (20 penyedia, 61 menu) |
| — | Data diambil dari database MySQL (bukan statis di kode) | ✅ (`api.php`) |

Fitur tambahan: status **Buka/Tutup** otomatis dari jam operasional (termasuk yang tutup lewat tengah malam), jarak dari lokasimu, tema peta gelap, panel detail, dan pemilih koordinat lewat klik peta di halaman admin.

## 🗂️ Struktur proyek

```
foodmap-gis/
├── index.php                  # Aplikasi utama (peta + daftar + detail + rute)
├── admin.php                  # Panel admin: CRUD penyedia & menu (login)
├── api.php                    # API JSON (list / kategori / detail / search) — dari MySQL
├── config.php                 # Kredensial DB + Google Maps API Key + password admin
├── assets/
│   ├── css/style.css          # Desain modern dark-glass, responsif
│   └── js/app.js              # Peta, marker, filter, rute, geolokasi
├── database/
│   └── foodmap_gis.sql        # Skema + data awal (5 kategori, 20 penyedia, 61 menu)
└── README.md
```

## 🗄️ Struktur database (`foodmap_gis`)

```
kategori_makanan (1) ───< penyedia_makanan (N) ───< menu_makanan (N)
```

- **kategori_makanan** — `id_kategori` PK, `nama_kategori`, `deskripsi`, `warna`, `ikon`
- **penyedia_makanan** — `id_penyedia` PK, `nama_penyedia`, `kategori`, `id_kategori` FK → kategori_makanan, `alamat`, `latitude`, `longitude`, `jam_buka`, `jam_tutup`, `no_telepon`, `foto`
- **menu_makanan** — `id_menu` PK, `id_penyedia` FK → penyedia_makanan, `nama_menu`, `harga`

> Kolom `kategori` (VARCHAR) dipertahankan sesuai contoh soal, **ditambah** `id_kategori` (FK) agar ketiga tabel terintegrasi — sesuai perintah "mahasiswa harus mengembangkan relasi tabel kategori".

## 🚀 Cara menjalankan

### 1. Import database
```sql
mysql -u root -p < database/foodmap_gis.sql
```
atau import file `database/foodmap_gis.sql` lewat phpMyAdmin. Verifikasi:
```sql
SELECT COUNT(*) FROM penyedia_makanan;  -- 20
SELECT COUNT(*) FROM menu_makanan;      -- 61
SELECT COUNT(*) FROM kategori_makanan;  -- 5
```

### 2. Isi konfigurasi — `config.php`
```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'foodmap_gis');
define('DB_USER', 'root');   // sesuaikan
define('DB_PASS', '');       // sesuaikan
define('GOOGLE_MAPS_API_KEY', 'ISI_API_KEY_GOOGLE_MAPS_DI_SINI');
define('ADMIN_PASSWORD', 'admin123'); // ganti untuk demo
```

### 3. Jalankan
- **Lokal (XAMPP/Laragon):** letakkan folder di `htdocs`, buka `http://localhost/foodmap-gis`
- **PHP built-in server:** `php -S localhost:8000` lalu buka `http://localhost:8000`
- **Hosting gratis (demo kelas):** InfinityFree / 000webhost (PHP + MySQL) — upload file, import SQL di panel, isi `config.php`

## 🔑 Mendapatkan Google Maps API Key

API key **tidak bisa dibuat dari kode** — key terikat akun Google Cloud + penagihan. Buat sendiri (gratis untuk demo kelas, ada kredit gratis Google Cloud):

1. Buka https://console.cloud.google.com/google/maps-apis (login akun Google)
2. Buat / pilih project → **aktifkan** API berikut:
   - **Maps JavaScript API** (peta & marker)
   - **Directions API** (petunjuk rute)
3. Menu **Credentials → Create Credentials → API key** → salin key-nya
4. Tempel ke `config.php` → `GOOGLE_MAPS_API_KEY`
5. (Disarankan) batasi key: *Application restrictions → HTTP referrers* ke domain/hosting kamu, dan *API restrictions* hanya ke 2 API di atas.

> Tanpa key, aplikasi tetap berjalan: daftar penyedia, pencarian, filter, dan detail tetap tampil dari database — hanya petanya yang menampilkan kartu petunjuk.

## 🗺️ Mode peta: Google Maps (utama) + OpenStreetMap (cadangan otomatis)

Sesuai tugas, **Google Maps API adalah peta utama** (marker, detail, rute Directions). Bila Google Maps gagal dimuat — mis. API key belum diisi, **billing belum diaktifkan**, atau CDN Google terblokir — aplikasi **otomatis beralih ke OpenStreetMap + Leaflet** (gratis, tanpa key, tanpa billing), lengkap dengan marker, detail, geolokasi, dan garis rute. Ada penanda kecil "Peta: OpenStreetMap" di pojok peta saat mode cadangan aktif.

Begitu billing diaktifkan di project Google Cloud, Google Maps langsung jadi peta utama lagi tanpa perlu mengubah kode. Tombol "Buka di Google Maps" (link `google.com/maps/dir`) tetap berfungsi di semua mode karena tidak butuh API key.

## 🌐 Globe 3D + polish visual (Three.js)

- **Globe 3D interaktif** di sidebar (`assets/js/globe3d.js`, Three.js r128 via CDN): bola kawat + garis lintang + partikel, titik-titik penyedia diambil dari `api.php` (bukan statis). Karena semua penyedia ada di Bandung dengan rentang koordinat yang sangat kecil, posisinya dipetakan **secara skematis (diperlebar)** ke sepetak globe di sekitar Indonesia agar terlihat — ini widget visual, bukan peta ukur. Geser untuk memutar, klik titik untuk membuka kartu penyedia. Satu canvas, satu konteks WebGL; animasi berhenti saat tab tidak aktif / globe tidak terlihat / `prefers-reduced-motion`.
- **Statistik count-up** (penyedia / menu / kategori) dari `api.php` (`assets/js/polish.js`), animasi masuk kartu berurutan, tilt kartu saat hover (pointer halus saja), garis cahaya animasi di topbar.
- Fungsi GIS (peta, rute, filter, admin) tidak diubah.

## 👤 Admin

Buka `admin.php` → login dengan password di `config.php` (default `admin123`).
- Tambah / ubah / hapus penyedia (koordinat bisa diklik langsung di peta mini)
- Kelola menu per penyedia (tambah / hapus)
- Menghapus penyedia otomatis menghapus menunya (FK `ON DELETE CASCADE`)

## 📍 Data contoh

20 penyedia makanan di kota **Bandung** (Batagor Kingsley, Mie Kocok Persib, Warung Nasi Ampera, Sate Anggrek, Kupat Tahu Gempol, dan lainnya) dengan foto dari Unsplash. **Koordinat adalah perkiraan di area jalan yang tercantum** untuk keperluan demo tugas — sesuaikan ke koordinat persis bila dipakai produksi.

## 📝 Jawaban analisis GIS (untuk laporan)

1. **Data spasial vs nonspasial** — *Spasial* adalah data posisi: `latitude`, `longitude`, lokasi di peta, rute, dan jarak. *Nonspasial* (atribut) adalah data penjelas: nama, kategori, alamat, menu, harga, jam operasional, telepon, dan foto. Keduanya terhubung lewat `id_penyedia` sebagai kunci.
2. *(Lengkapi sesuai pertanyaan laporan di soal — poin 2 dst.)*

## 📄 Lisensi

MIT — bebas dipakai untuk tugas kuliah. Kredit "Dikembangkan oleh King Faisal" dipertahankan di footer aplikasi.
