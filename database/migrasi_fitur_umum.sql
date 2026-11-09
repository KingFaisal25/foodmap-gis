-- FoodMap GIS — Migrasi: kolom halal, fasilitas & pembayaran
-- Jalankan SEKALI, setelah migrasi_ulasan.sql.
-- Di InfinityFree: phpMyAdmin > pilih database > tab Impor > pilih file ini > Go.
-- Nilai awal: halal='belum' (belum terverifikasi — JANGAN ditebak),
-- fasilitas & pembayaran kosong sampai diisi lewat panel admin.
ALTER TABLE penyedia_makanan
  ADD COLUMN halal VARCHAR(12) NOT NULL DEFAULT 'belum',
  ADD COLUMN fasilitas VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN pembayaran VARCHAR(255) NOT NULL DEFAULT '';
