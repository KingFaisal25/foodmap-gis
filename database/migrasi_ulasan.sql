-- FoodMap GIS — Migrasi: tabel ulasan (rating & komentar)
-- Jalankan SETELAH import database/foodmap_gis.sql.
-- Di InfinityFree: buka phpMyAdmin > pilih database > tab SQL > tempel isi file ini > Go.
-- Aman diulang: CREATE TABLE IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS ulasan (
  id_ulasan INT AUTO_INCREMENT PRIMARY KEY,
  id_penyedia INT NOT NULL,
  nama VARCHAR(60) NOT NULL,
  rating TINYINT NOT NULL,
  komentar VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_penyedia) REFERENCES penyedia_makanan (id_penyedia) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
