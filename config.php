<?php
/**
 * FoodMap GIS — Konfigurasi aplikasi
 * Dikembangkan oleh King Faisal
 *
 * CARA ISI:
 * 1. Sesuaikan DB_HOST / DB_NAME / DB_USER / DB_PASS dengan MySQL kamu.
 *    (XAMPP/Laragon: user "root", password kosong. InfinityFree: lihat panel.)
 * 2. Isi GOOGLE_MAPS_API_KEY dengan API key dari Google Cloud Console.
 *    Lihat README.md bagian "Mendapatkan Google Maps API Key".
 *    Tanpa key yang valid, peta menampilkan kartu petunjuk (aplikasi
 *    tetap jalan, daftar penyedia tetap tampil dari database).
 * 3. Ganti ADMIN_PASSWORD untuk halaman admin (admin.php).
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'foodmap_gis');
define('DB_USER', 'root');
define('DB_PASS', '');

// ---- Google Maps API Key (WAJIB diisi agar peta tampil) ----
define('GOOGLE_MAPS_API_KEY', 'ISI_API_KEY_GOOGLE_MAPS_DI_SINI');

// ---- Admin (halaman admin.php) ----
define('ADMIN_PASSWORD', 'admin123');

// ---- Aplikasi ----
define('APP_NAME', 'FoodMap GIS');
define('APP_CITY', 'Bandung');
// Pusat peta awal (Alun-alun Bandung)
define('DEFAULT_LAT', -6.9218);
define('DEFAULT_LNG', 107.6077);

/**
 * Koneksi PDO ke MySQL (singleton).
 * @return PDO
 * @throws PDOException bila koneksi gagal
 */
function getDB()
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

/** Apakah API key Google Maps sudah diisi (bukan placeholder)? */
function mapsKeyReady()
{
    return defined('GOOGLE_MAPS_API_KEY')
        && GOOGLE_MAPS_API_KEY !== ''
        && GOOGLE_MAPS_API_KEY !== 'ISI_API_KEY_GOOGLE_MAPS_DI_SINI';
}

/** Format rupiah, contoh: 18000 -> "Rp18.000" */
function rupiah($angka)
{
    return 'Rp' . number_format((float) $angka, 0, ',', '.');
}

/** Format jam TIME "08:00:00" -> "08.00" */
function jamSingkat($time)
{
    if (!$time) return '-';
    return substr($time, 0, 5);
}
