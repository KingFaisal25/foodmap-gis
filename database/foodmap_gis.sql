-- ============================================================
-- FoodMap GIS — Sistem Informasi Geografis Pencarian
-- Penyedia Makanan Berbasis Web (Google Maps API + MySQL)
-- Dikembangkan oleh King Faisal
-- ============================================================
-- Cara pakai:
--   mysql -u root -p < database/foodmap_gis.sql
--   (atau import lewat phpMyAdmin)
-- Database: foodmap_gis
-- Tabel   : kategori_makanan, penyedia_makanan, menu_makanan
-- Relasi  :
--   kategori_makanan (1) ──< penyedia_makanan (N)
--   penyedia_makanan (1) ──< menu_makanan (N)
-- Catatan : kolom `kategori` (VARCHAR) dipertahankan sesuai contoh
--   soal, DITAMBAH `id_kategori` (FK) agar ketiga tabel terintegrasi
--   sesuai perintah "kembangkan relasi tabel kategori".
-- Koordinat 20 penyedia adalah koordinat perkiraan di area jalan
--   yang tercantum (kota Bandung) untuk keperluan demo tugas.
-- ============================================================

CREATE DATABASE IF NOT EXISTS foodmap_gis
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE foodmap_gis;

-- ------------------------------------------------------------
-- Tabel 3 — kategori_makanan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kategori_makanan (
  id_kategori INT AUTO_INCREMENT PRIMARY KEY,
  nama_kategori VARCHAR(100) NOT NULL,
  deskripsi TEXT,
  warna VARCHAR(7) NOT NULL DEFAULT '#00b4d8',
  ikon VARCHAR(50) NOT NULL DEFAULT 'fa-utensils'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kategori_makanan (id_kategori, nama_kategori, deskripsi, warna, ikon) VALUES
(1, 'Restoran', 'Restoran dan rumah makan besar dengan tempat duduk nyaman dan menu lengkap.', '#f59e0b', 'fa-utensils'),
(2, 'Warung Makan', 'Warung makan harian khas Indonesia, harga ramah di kantong.', '#22c55e', 'fa-store'),
(3, 'Kafe', 'Kafe dan coffee shop, cocok untuk nongkrong dan kerja santai.', '#8b5cf6', 'fa-mug-hot'),
(4, 'Rumah Makan', 'Rumah makan keluarga dengan masakan daerah dan porsi besar.', '#ef4444', 'fa-house-chimney'),
(5, 'Jajanan', 'Jajanan dan street food khas Bandung, cocok untuk camilan.', '#ec4899', 'fa-ice-cream');

-- ------------------------------------------------------------
-- Tabel 1 — penyedia_makanan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS penyedia_makanan (
  id_penyedia INT AUTO_INCREMENT PRIMARY KEY,
  nama_penyedia VARCHAR(100) NOT NULL,
  kategori VARCHAR(50) NOT NULL,
  id_kategori INT NULL,
  alamat TEXT,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  jam_buka TIME,
  jam_tutup TIME,
  no_telepon VARCHAR(20),
  foto VARCHAR(255),
  FOREIGN KEY (id_kategori) REFERENCES kategori_makanan (id_kategori)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Tabel 2 — menu_makanan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_makanan (
  id_menu INT AUTO_INCREMENT PRIMARY KEY,
  id_penyedia INT NOT NULL,
  nama_menu VARCHAR(100) NOT NULL,
  harga DECIMAL(12,2) NOT NULL,
  FOREIGN KEY (id_penyedia) REFERENCES penyedia_makanan (id_penyedia)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- Data: 20 penyedia makanan (kota Bandung)
-- ------------------------------------------------------------
INSERT INTO penyedia_makanan
  (id_penyedia, nama_penyedia, kategori, id_kategori, alamat, latitude, longitude, jam_buka, jam_tutup, no_telepon, foto) VALUES
(1, 'Batagor Kingsley', 'Jajanan', 5, 'Jl. Veteran No. 25, Bandung', -6.91450000, 107.61050000, '08:00:00', '21:00:00', '022-4232432', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=60'),
(2, 'Mie Kocok Persib', 'Warung Makan', 2, 'Jl. Ahmad Yani No. 112, Bandung', -6.91580000, 107.62600000, '09:00:00', '21:30:00', '022-7203456', 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=60'),
(3, 'Warung Nasi Ampera', 'Warung Makan', 2, 'Jl. Soekarno-Hatta No. 340, Bandung', -6.93800000, 107.64300000, '07:00:00', '22:00:00', '0812-2233-4455', 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=60'),
(4, 'Sate Anggrek', 'Rumah Makan', 4, 'Jl. Anggrek No. 12, Bandung', -6.90550000, 107.61650000, '10:00:00', '22:00:00', '022-4237890', 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=60'),
(5, 'Kupat Tahu Gempol', 'Jajanan', 5, 'Jl. Gempol No. 8, Bandung', -6.89750000, 107.61750000, '07:30:00', '17:00:00', '0813-3344-5566', 'https://images.unsplash.com/photo-1540189549336-e6e99c6e0d72?auto=format&fit=crop&w=800&q=60'),
(6, 'Nasi Timbel Bawean', 'Rumah Makan', 4, 'Jl. Bawean No. 3, Bandung', -6.90880000, 107.60550000, '09:00:00', '21:00:00', '022-4201122', 'https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&w=800&q=60'),
(7, 'RM Sederhana Pasteur', 'Restoran', 1, 'Jl. Dr. Djunjunan (Pasteur) No. 88, Bandung', -6.89350000, 107.59450000, '08:00:00', '22:00:00', '022-2034455', 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=60'),
(8, 'Kafe Dago Pakar', 'Kafe', 3, 'Jl. Dago Pakar Raya No. 15, Bandung', -6.87350000, 107.62100000, '09:00:00', '23:00:00', '022-2506677', 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=60'),
(9, 'Warung Kopi Purnama', 'Kafe', 3, 'Jl. Alkateri No. 22 (Braga), Bandung', -6.91760000, 107.60920000, '07:00:00', '22:00:00', '022-4239087', 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=60'),
(10, 'Mie Ayam Cipaganti', 'Warung Makan', 2, 'Jl. Cipaganti No. 45, Bandung', -6.89450000, 107.60650000, '09:00:00', '21:00:00', '0812-5566-7788', 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=800&q=60'),
(11, 'Seblak Jeletet Murni', 'Jajanan', 5, 'Jl. Murni No. 7, Setiabudi, Bandung', -6.88550000, 107.61150000, '11:00:00', '22:00:00', '0813-6677-8899', 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=60'),
(12, 'Nasi Goreng Mafia', 'Warung Makan', 2, 'Jl. Dipatiukur No. 20, Bandung', -6.89600000, 107.61550000, '17:00:00', '02:00:00', '0812-9988-7766', 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=60'),
(13, 'Baso Tahu Tulen Cibadak', 'Jajanan', 5, 'Jl. Cibadak No. 60, Bandung', -6.92050000, 107.60050000, '08:00:00', '20:00:00', '022-4235566', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=60'),
(14, 'Lotek Mahmud', 'Warung Makan', 2, 'Jl. Mahmud No. 31, Bandung', -6.91100000, 107.59650000, '07:00:00', '16:00:00', '0813-2233-4455', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=60'),
(15, 'Two Hands Full', 'Kafe', 3, 'Jl. Siliwangi No. 9, Bandung', -6.88450000, 107.61600000, '08:00:00', '22:00:00', '022-2508899', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=60'),
(16, 'Roti Bakar 234', 'Jajanan', 5, 'Jl. Setiabudi No. 150, Bandung', -6.88050000, 107.60600000, '16:00:00', '23:00:00', '0812-3344-5566', 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=800&q=60'),
(17, 'Ayam Goreng Suharti', 'Restoran', 1, 'Jl. Diponegoro No. 52, Bandung', -6.90450000, 107.62150000, '09:00:00', '21:00:00', '022-7208899', 'https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=800&q=60'),
(18, 'Es Cendol Elizabeth', 'Jajanan', 5, 'Jl. Inhofftank No. 18, Bandung', -6.92500000, 107.60600000, '09:00:00', '18:00:00', '022-4231122', 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=800&q=60'),
(19, 'Warung Sate H. Barjo', 'Rumah Makan', 4, 'Jl. Buahbatu No. 210, Bandung', -6.94550000, 107.63100000, '10:00:00', '22:00:00', '0812-4455-6677', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=60'),
(20, 'Kopi Kulo Cihampelas', 'Kafe', 3, 'Jl. Cihampelas No. 120, Bandung', -6.89300000, 107.61100000, '08:00:00', '23:00:00', '0813-5566-7788', 'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=800&q=60');

-- ------------------------------------------------------------
-- Data: menu (minimal 3 menu per penyedia)
-- ------------------------------------------------------------
INSERT INTO menu_makanan (id_penyedia, nama_menu, harga) VALUES
(1, 'Batagor Kuah Spesial', 18000.00),
(1, 'Batagor Goreng', 15000.00),
(1, 'Siomay Bandung', 15000.00),
(1, 'Es Teh Manis', 5000.00),
(2, 'Mie Kocok Spesial', 22000.00),
(2, 'Mie Kocok Kikil', 25000.00),
(2, 'Es Jeruk Peras', 6000.00),
(3, 'Nasi + Ayam Goreng', 15000.00),
(3, 'Nasi + Ikan Bakar', 18000.00),
(3, 'Nasi + Sayur Asem', 12000.00),
(4, 'Sate Ayam (10 tusuk)', 25000.00),
(4, 'Sate Kambing (10 tusuk)', 35000.00),
(4, 'Lontong', 5000.00),
(5, 'Kupat Tahu Spesial', 13000.00),
(5, 'Kupat Tahu Telur', 15000.00),
(5, 'Es Teh Tawar', 3000.00),
(6, 'Nasi Timbel Komplit', 20000.00),
(6, 'Ayam Bakar Timbel', 18000.00),
(6, 'Es Teh Manis', 5000.00),
(7, 'Nasi Padang + Rendang', 18000.00),
(7, 'Nasi Padang + Ayam Pop', 17000.00),
(7, 'Teh Talua', 8000.00),
(8, 'Kopi Susu Dago', 25000.00),
(8, 'Kentang Goreng', 20000.00),
(8, 'Nasi Goreng Dago', 30000.00),
(9, 'Kopi Tubruk Purnama', 12000.00),
(9, 'Roti Bakar Coklat Keju', 15000.00),
(9, 'Indomie Telur Kornet', 18000.00),
(10, 'Mie Ayam Bakso', 15000.00),
(10, 'Mie Ayam Pangsit', 17000.00),
(10, 'Es Teh Manis', 5000.00),
(11, 'Seblak Ceker', 15000.00),
(11, 'Seblak Komplit', 20000.00),
(11, 'Es Teh Manis', 5000.00),
(12, 'Nasi Goreng Mafia', 20000.00),
(12, 'Nasi Goreng Spesial', 25000.00),
(12, 'Es Teh Manis', 5000.00),
(13, 'Baso Tahu', 15000.00),
(13, 'Siomay', 12000.00),
(13, 'Es Jeruk', 6000.00),
(14, 'Lotek Spesial', 12000.00),
(14, 'Lotek + Telur', 15000.00),
(14, 'Es Teh Manis', 4000.00),
(15, 'Kopi Susu Gula Aren', 28000.00),
(15, 'Croissant Butter', 22000.00),
(15, 'Pasta Aglio Olio', 35000.00),
(16, 'Roti Bakar Coklat', 12000.00),
(16, 'Roti Bakar Keju Susu', 15000.00),
(16, 'Susu Jahe', 10000.00),
(17, 'Ayam Goreng Suharti', 22000.00),
(17, 'Ayam Bakar', 25000.00),
(17, 'Es Teh Manis', 5000.00),
(18, 'Es Cendol', 10000.00),
(18, 'Es Cendol Durian', 18000.00),
(18, 'Es Kacang Merah', 12000.00),
(19, 'Sate Maranggi (10 tusuk)', 30000.00),
(19, 'Sate Ayam (10 tusuk)', 25000.00),
(19, 'Nasi Putih', 5000.00),
(20, 'Es Kopi Kulo', 18000.00),
(20, 'Kopi Susu Aren', 20000.00),
(20, 'Roti Bakar', 15000.00);

-- ============================================================
-- Verifikasi cepat setelah import:
--   SELECT COUNT(*) FROM penyedia_makanan;  -- harus 20
--   SELECT COUNT(*) FROM menu_makanan;      -- harus 61
--   SELECT COUNT(*) FROM kategori_makanan;  -- harus 5
-- ============================================================
