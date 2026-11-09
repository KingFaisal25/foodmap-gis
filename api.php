<?php
/**
 * FoodMap GIS — API JSON (data SELALU dari MySQL, bukan statis)
 * Dikembangkan oleh King Faisal
 *
 * Endpoint (GET):
 *   api.php?action=list
 *       Semua penyedia + kategori + harga termurah + jumlah menu.
 *   api.php?action=kategori
 *       Daftar kategori makanan.
 *   api.php?action=detail&id=1
 *       Detail 1 penyedia + seluruh menunya.
 *   api.php?action=search&q=batagor&kategori=Jajanan&max_harga=20000
 *       Pencarian berdasarkan nama, kategori, dan/atau harga termurah.
 *   api.php?action=ulasan&id=1
 *       Daftar ulasan (rating & komentar) 1 penyedia, terbaru dulu.
 *   api.php?action=tambah_ulasan (POST: id_penyedia, nama, rating 1-5, komentar)
 *       Simpan ulasan baru. Mengembalikan ulasan yang baru disimpan.
 *
 * Kolom rating_avg & ulasan_count hanya dihitung bila tabel `ulasan`
 * sudah ada (lihat database/migrasi_ulasan.sql) — sebelum migrasi,
 * API tetap jalan tanpa kolom tersebut.
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function kirim($data, $kode = 200)
{
    http_response_code($kode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $db = getDB();
} catch (Throwable $e) {
    kirim([
        'ok' => false,
        'error' => 'Gagal terhubung ke database MySQL. Pastikan database "foodmap_gis" sudah di-import (database/foodmap_gis.sql) dan pengaturan di config.php benar.',
    ], 500);
}

$action = $_GET['action'] ?? 'list';

// Apakah tabel ulasan sudah dimigrasi? (bila belum, API tetap jalan)
$adaUlasan = false;
try {
    $adaUlasan = $db->query("SHOW TABLES LIKE 'ulasan'")->rowCount() > 0;
} catch (Throwable $e) {
    $adaUlasan = false;
}
// Fragmen SELECT untuk rating (kosong bila tabel belum ada)
$ratingSelect = $adaUlasan
    ? ", (SELECT ROUND(AVG(rating), 1) FROM ulasan u WHERE u.id_penyedia = p.id_penyedia) AS rating_avg,
       (SELECT COUNT(*) FROM ulasan u WHERE u.id_penyedia = p.id_penyedia) AS ulasan_count"
    : '';

try {
    // ---------- Daftar ulasan 1 penyedia ----------
    if ($action === 'ulasan') {
        $id = (int) ($_GET['id'] ?? 0);
        if ($id <= 0) kirim(['ok' => false, 'error' => 'Parameter id tidak valid.'], 400);
        if (!$adaUlasan) kirim(['ok' => true, 'data' => [], 'total' => 0]);
        $st = $db->prepare(
            'SELECT id_ulasan, nama, rating, komentar, created_at FROM ulasan
             WHERE id_penyedia = ? ORDER BY created_at DESC, id_ulasan DESC LIMIT 20'
        );
        $st->execute([$id]);
        $rows = $st->fetchAll();
        foreach ($rows as &$r) { $r['rating'] = (int) $r['rating']; }
        kirim(['ok' => true, 'data' => $rows, 'total' => count($rows)]);
    }

    // ---------- Simpan ulasan baru (POST) ----------
    if ($action === 'tambah_ulasan') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
            kirim(['ok' => false, 'error' => 'Gunakan metode POST.'], 405);
        }
        if (!$adaUlasan) kirim(['ok' => false, 'error' => 'Tabel ulasan belum ada — jalankan database/migrasi_ulasan.sql dulu.'], 500);
        $id = (int) ($_POST['id_penyedia'] ?? 0);
        $nama = trim((string) ($_POST['nama'] ?? ''));
        $rating = (int) ($_POST['rating'] ?? 0);
        $komentar = trim((string) ($_POST['komentar'] ?? ''));
        if ($id <= 0) kirim(['ok' => false, 'error' => 'Penyedia tidak valid.'], 400);
        if (strlen($nama) < 2 || strlen($nama) > 60) kirim(['ok' => false, 'error' => 'Nama 2–60 karakter.'], 400);
        if ($rating < 1 || $rating > 5) kirim(['ok' => false, 'error' => 'Rating 1–5.'], 400);
        if (strlen($komentar) < 3 || strlen($komentar) > 500) kirim(['ok' => false, 'error' => 'Komentar 3–500 karakter.'], 400);
        $st = $db->prepare('SELECT COUNT(*) FROM penyedia_makanan WHERE id_penyedia = ?');
        $st->execute([$id]);
        if (!$st->fetchColumn()) kirim(['ok' => false, 'error' => 'Penyedia tidak ditemukan.'], 404);
        $st = $db->prepare('INSERT INTO ulasan (id_penyedia, nama, rating, komentar) VALUES (?,?,?,?)');
        $st->execute([$id, $nama, $rating, $komentar]);
        kirim(['ok' => true, 'data' => [
            'id_ulasan' => (int) $db->lastInsertId(),
            'nama' => $nama, 'rating' => $rating, 'komentar' => $komentar,
        ]]);
    }

    // ---------- Daftar kategori ----------
    if ($action === 'kategori') {
        $rows = $db->query(
            'SELECT id_kategori, nama_kategori, deskripsi, warna, ikon,
                    (SELECT COUNT(*) FROM penyedia_makanan p WHERE p.id_kategori = k.id_kategori) AS jumlah
             FROM kategori_makanan k ORDER BY nama_kategori'
        )->fetchAll();
        kirim(['ok' => true, 'data' => $rows]);
    }

    // ---------- Detail 1 penyedia + menunya ----------
    if ($action === 'detail') {
        $id = (int) ($_GET['id'] ?? 0);
        if ($id <= 0) kirim(['ok' => false, 'error' => 'Parameter id tidak valid.'], 400);

        $st = $db->prepare(
            'SELECT p.*, k.nama_kategori AS nama_kategori_relasi, k.warna, k.ikon' . $ratingSelect . '
             FROM penyedia_makanan p
             LEFT JOIN kategori_makanan k ON k.id_kategori = p.id_kategori
             WHERE p.id_penyedia = ?'
        );
        $st->execute([$id]);
        $row = $st->fetch();
        if (!$row) kirim(['ok' => false, 'error' => 'Penyedia tidak ditemukan.'], 404);

        $st = $db->prepare(
            'SELECT id_menu, nama_menu, harga FROM menu_makanan
             WHERE id_penyedia = ? ORDER BY harga ASC'
        );
        $st->execute([$id]);
        $row['menu'] = $st->fetchAll();
        $row['latitude'] = (float) $row['latitude'];
        $row['longitude'] = (float) $row['longitude'];
        $row['rating_avg'] = isset($row['rating_avg']) && $row['rating_avg'] !== null ? (float) $row['rating_avg'] : null;
        $row['ulasan_count'] = isset($row['ulasan_count']) ? (int) $row['ulasan_count'] : 0;
        kirim(['ok' => true, 'data' => $row]);
    }

    // ---------- Pencarian / filter ----------
    if ($action === 'search') {
        $q = trim($_GET['q'] ?? '');
        $kategori = trim($_GET['kategori'] ?? '');
        $maxHarga = isset($_GET['max_harga']) && $_GET['max_harga'] !== '' ? (float) $_GET['max_harga'] : null;

        $sql = 'SELECT p.*, k.warna, k.ikon,
                       (SELECT MIN(harga) FROM menu_makanan m WHERE m.id_penyedia = p.id_penyedia) AS harga_termurah,
                       (SELECT COUNT(*) FROM menu_makanan m WHERE m.id_penyedia = p.id_penyedia) AS jumlah_menu' . $ratingSelect . '
                FROM penyedia_makanan p
                LEFT JOIN kategori_makanan k ON k.id_kategori = p.id_kategori
                WHERE 1 = 1';
        $params = [];

        if ($q !== '') {
            $sql .= ' AND (p.nama_penyedia LIKE ? OR p.alamat LIKE ? OR p.kategori LIKE ?)';
            $like = '%' . $q . '%';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }
        if ($kategori !== '' && $kategori !== 'Semua') {
            $sql .= ' AND p.kategori = ?';
            $params[] = $kategori;
        }
        if ($maxHarga !== null) {
            $sql .= ' AND (SELECT MIN(harga) FROM menu_makanan m WHERE m.id_penyedia = p.id_penyedia) <= ?';
            $params[] = $maxHarga;
        }
        $sql .= ' ORDER BY p.nama_penyedia ASC';

        $st = $db->prepare($sql);
        $st->execute($params);
        $rows = $st->fetchAll();
        foreach ($rows as &$r) {
            $r['latitude'] = (float) $r['latitude'];
            $r['longitude'] = (float) $r['longitude'];
            $r['harga_termurah'] = $r['harga_termurah'] !== null ? (float) $r['harga_termurah'] : null;
            $r['jumlah_menu'] = (int) $r['jumlah_menu'];
            $r['rating_avg'] = isset($r['rating_avg']) && $r['rating_avg'] !== null ? (float) $r['rating_avg'] : null;
            $r['ulasan_count'] = isset($r['ulasan_count']) ? (int) $r['ulasan_count'] : 0;
        }
        kirim(['ok' => true, 'data' => $rows, 'total' => count($rows)]);
    }

    // ---------- Daftar semua penyedia (default) ----------
    $rows = $db->query(
        'SELECT p.*, k.warna, k.ikon,
                (SELECT MIN(harga) FROM menu_makanan m WHERE m.id_penyedia = p.id_penyedia) AS harga_termurah,
                (SELECT COUNT(*) FROM menu_makanan m WHERE m.id_penyedia = p.id_penyedia) AS jumlah_menu' . $ratingSelect . '
         FROM penyedia_makanan p
         LEFT JOIN kategori_makanan k ON k.id_kategori = p.id_kategori
         ORDER BY p.nama_penyedia ASC'
    )->fetchAll();
    foreach ($rows as &$r) {
        $r['latitude'] = (float) $r['latitude'];
        $r['longitude'] = (float) $r['longitude'];
        $r['harga_termurah'] = $r['harga_termurah'] !== null ? (float) $r['harga_termurah'] : null;
        $r['jumlah_menu'] = (int) $r['jumlah_menu'];
        $r['rating_avg'] = isset($r['rating_avg']) && $r['rating_avg'] !== null ? (float) $r['rating_avg'] : null;
        $r['ulasan_count'] = isset($r['ulasan_count']) ? (int) $r['ulasan_count'] : 0;
    }
    kirim(['ok' => true, 'data' => $rows, 'total' => count($rows)]);
} catch (Throwable $e) {
    kirim(['ok' => false, 'error' => 'Terjadi kesalahan server: ' . $e->getMessage()], 500);
}
