<?php
/**
 * FoodMap GIS — Admin CRUD penyedia & menu
 * Dikembangkan oleh King Faisal
 * Login: password di config.php (ADMIN_PASSWORD, default: admin123)
 */
require_once __DIR__ . '/config.php';
session_start();

$keyReady = mapsKeyReady();
$db = null;
$dbError = null;
try {
    $db = getDB();
} catch (Throwable $e) {
    $dbError = $e->getMessage();
}

// ---------- Login / logout ----------
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: admin.php');
    exit;
}
if (isset($_POST['aksi']) && $_POST['aksi'] === 'login') {
    if (hash_equals(ADMIN_PASSWORD, (string) ($_POST['password'] ?? ''))) {
        $_SESSION['admin'] = true;
        header('Location: admin.php');
        exit;
    }
    $loginError = 'Password salah.';
}
$login = !empty($_SESSION['admin']);

$pesan = '';
// ---------- Aksi CRUD (hanya bila login & DB ok) ----------
if ($login && $db && isset($_POST['aksi'])) {
    $aksi = $_POST['aksi'];
    try {
        if ($aksi === 'simpan_penyedia') {
            $id = (int) ($_POST['id_penyedia'] ?? 0);
            $nama = trim($_POST['nama_penyedia'] ?? '');
            $kategori = trim($_POST['kategori'] ?? '');
            $idKat = (int) ($_POST['id_kategori'] ?? 0);
            $alamat = trim($_POST['alamat'] ?? '');
            $lat = (float) ($_POST['latitude'] ?? 0);
            $lng = (float) ($_POST['longitude'] ?? 0);
            $buka = !empty($_POST['jam_buka']) ? $_POST['jam_buka'] : null;
            $tutup = !empty($_POST['jam_tutup']) ? $_POST['jam_tutup'] : null;
            $telp = trim($_POST['no_telepon'] ?? '');
            $foto = trim($_POST['foto'] ?? '');
            if ($nama === '' || $kategori === '' || $lat === 0.0 || $lng === 0.0) {
                throw new Exception('Nama, kategori, latitude, dan longitude wajib diisi.');
            }
            if ($id > 0) {
                $st = $db->prepare('UPDATE penyedia_makanan SET nama_penyedia=?, kategori=?, id_kategori=?, alamat=?, latitude=?, longitude=?, jam_buka=?, jam_tutup=?, no_telepon=?, foto=? WHERE id_penyedia=?');
                $st->execute([$nama, $kategori, $idKat ?: null, $alamat, $lat, $lng, $buka, $tutup, $telp, $foto, $id]);
                $pesan = 'Penyedia berhasil diperbarui.';
            } else {
                $st = $db->prepare('INSERT INTO penyedia_makanan (nama_penyedia, kategori, id_kategori, alamat, latitude, longitude, jam_buka, jam_tutup, no_telepon, foto) VALUES (?,?,?,?,?,?,?,?,?,?)');
                $st->execute([$nama, $kategori, $idKat ?: null, $alamat, $lat, $lng, $buka, $tutup, $telp, $foto]);
                $pesan = 'Penyedia baru berhasil ditambahkan.';
            }
        } elseif ($aksi === 'hapus_penyedia') {
            $st = $db->prepare('DELETE FROM penyedia_makanan WHERE id_penyedia = ?');
            $st->execute([(int) ($_POST['id_penyedia'] ?? 0)]);
            $pesan = 'Penyedia (dan menunya) berhasil dihapus.';
        } elseif ($aksi === 'tambah_menu') {
            $idP = (int) ($_POST['id_penyedia'] ?? 0);
            $nama = trim($_POST['nama_menu'] ?? '');
            $harga = (float) ($_POST['harga'] ?? 0);
            if ($idP <= 0 || $nama === '' || $harga <= 0) throw new Exception('Nama menu dan harga wajib diisi.');
            $st = $db->prepare('INSERT INTO menu_makanan (id_penyedia, nama_menu, harga) VALUES (?,?,?)');
            $st->execute([$idP, $nama, $harga]);
            $pesan = 'Menu berhasil ditambahkan.';
        } elseif ($aksi === 'hapus_menu') {
            $st = $db->prepare('DELETE FROM menu_makanan WHERE id_menu = ?');
            $st->execute([(int) ($_POST['id_menu'] ?? 0)]);
            $pesan = 'Menu berhasil dihapus.';
        } elseif ($aksi === 'hapus_ulasan') {
            $st = $db->prepare('DELETE FROM ulasan WHERE id_ulasan = ?');
            $st->execute([(int) ($_POST['id_ulasan'] ?? 0)]);
            $pesan = 'Ulasan berhasil dihapus.';
        }
    } catch (Throwable $e) {
        $pesan = 'Gagal: ' . $e->getMessage();
    }
}

// ---------- Data untuk tampilan ----------
$kategoriList = [];
$penyediaList = [];
$edit = null;
$menuPenyedia = null;
$dash = ['penyedia' => 0, 'menu' => 0, 'ulasan' => 0, 'rating' => null, 'perKategori' => []];
if ($db) {
    $kategoriList = $db->query('SELECT * FROM kategori_makanan ORDER BY nama_kategori')->fetchAll();
    $penyediaList = $db->query(
        'SELECT p.*, (SELECT COUNT(*) FROM menu_makanan m WHERE m.id_penyedia = p.id_penyedia) AS jumlah_menu
         FROM penyedia_makanan p ORDER BY p.nama_penyedia'
    )->fetchAll();
    // Dashboard: ringkasan + grafik per kategori
    $dash['penyedia'] = count($penyediaList);
    $dash['menu'] = (int) $db->query('SELECT COUNT(*) FROM menu_makanan')->fetchColumn();
    $dash['perKategori'] = $db->query(
        'SELECT k.nama_kategori, k.warna, COUNT(p.id_penyedia) AS jumlah
         FROM kategori_makanan k LEFT JOIN penyedia_makanan p ON p.id_kategori = k.id_kategori
         GROUP BY k.id_kategori ORDER BY jumlah DESC'
    )->fetchAll();
    try {
        $dash['ulasan'] = (int) $db->query('SELECT COUNT(*) FROM ulasan')->fetchColumn();
        $dash['rating'] = $db->query('SELECT ROUND(AVG(rating), 1) FROM ulasan')->fetchColumn();
    } catch (Throwable $e) {
        // Tabel ulasan belum dimigrasi — dashboard tetap jalan tanpa angka ulasan.
    }
    if (isset($_GET['edit'])) {
        $st = $db->prepare('SELECT * FROM penyedia_makanan WHERE id_penyedia = ?');
        $st->execute([(int) $_GET['edit']]);
        $edit = $st->fetch();
    }
    if (isset($_GET['menu'])) {
        $idP = (int) $_GET['menu'];
        $st = $db->prepare('SELECT * FROM penyedia_makanan WHERE id_penyedia = ?');
        $st->execute([$idP]);
        $menuPenyedia = $st->fetch();
        if ($menuPenyedia) {
            $st = $db->prepare('SELECT * FROM menu_makanan WHERE id_penyedia = ? ORDER BY harga ASC');
            $st->execute([$idP]);
            $menuPenyedia['menu'] = $st->fetchAll();
            try {
                $st = $db->prepare('SELECT * FROM ulasan WHERE id_penyedia = ? ORDER BY created_at DESC, id_ulasan DESC');
                $st->execute([$idP]);
                $menuPenyedia['ulasan'] = $st->fetchAll();
            } catch (Throwable $e) {
                $menuPenyedia['ulasan'] = [];
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin — FoodMap GIS | King Faisal</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<link rel="stylesheet" href="assets/css/style.css">
<style>
  .admin-wrap{max-width:1080px;margin:0 auto;padding:28px 18px 60px}
  .admin-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;margin-bottom:20px}
  .admin-card h2{font-size:18px;margin-bottom:14px}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .form-grid .full{grid-column:1/-1}
  .form-grid label{display:block;font-size:13px;color:var(--muted);margin-bottom:5px}
  .form-grid input,.form-grid select,.form-grid textarea{width:100%;background:#0f1b31;border:1px solid var(--line);border-radius:10px;color:var(--text);padding:10px 12px;font:inherit;font-size:14px}
  .form-grid input:focus,.form-grid select:focus,.form-grid textarea:focus{outline:none;border-color:var(--accent)}
  table.admin-tbl{width:100%;border-collapse:collapse;font-size:14px}
  table.admin-tbl th,table.admin-tbl td{padding:10px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
  table.admin-tbl th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  .mini-map{height:260px;border-radius:12px;border:1px solid var(--line);margin-top:6px}
  .btn-danger{background:#3b1220;border:1px solid #7f1d2e;color:#fda4af}
  .btn-danger:hover{background:#4c1626}
  .login-box{max-width:380px;margin:80px auto 0}
  @media(max-width:640px){.form-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="index.php">
    <span class="brand-logo"><i class="fa-solid fa-utensils"></i></span>
    <span class="brand-text"><strong>FoodMap <span>GIS</span></strong><small>Panel Admin</small></span>
  </a>
  <div class="top-actions">
    <a class="btn btn-ghost" href="index.php"><i class="fa-solid fa-map"></i><span>Lihat Peta</span></a>
    <?php if ($login): ?><a class="btn btn-ghost" href="admin.php?logout=1"><i class="fa-solid fa-right-from-bracket"></i><span>Keluar</span></a><?php endif; ?>
  </div>
</header>

<div class="admin-wrap">
<?php if (!$login): ?>
  <div class="admin-card login-box">
    <h2><i class="fa-solid fa-lock"></i> Login Admin</h2>
    <?php if (!empty($loginError)): ?><p class="alert"><?= htmlspecialchars($loginError) ?></p><?php endif; ?>
    <form method="post" class="form-grid">
      <input type="hidden" name="aksi" value="login">
      <div class="full">
        <label>Password admin</label>
        <input type="password" name="password" placeholder="Default: admin123" required autofocus>
      </div>
      <div class="full"><button class="btn btn-primary" type="submit" style="width:100%">Masuk</button></div>
      <p class="full" style="color:var(--muted);font-size:13px">Password default <code>admin123</code> — ganti di <code>config.php</code> (ADMIN_PASSWORD).</p>
    </form>
  </div>
<?php elseif ($dbError): ?>
  <div class="admin-card"><p class="alert">Database belum terhubung: <?= htmlspecialchars($dbError) ?><br>Import dulu <code>database/foodmap_gis.sql</code> dan cek <code>config.php</code>.</p></div>
<?php else: ?>
  <?php if ($pesan): ?><p class="alert" style="background:#0e2a1e;border-color:#14532d;color:#86efac"><?= htmlspecialchars($pesan) ?></p><?php endif; ?>

  <!-- Dashboard ringkasan -->
  <div class="admin-card">
    <h2><i class="fa-solid fa-chart-simple"></i> Dashboard</h2>
    <div class="dash-grid">
      <div class="dash-stat"><b><?= (int) $dash['penyedia'] ?></b><span>Penyedia</span></div>
      <div class="dash-stat"><b><?= (int) $dash['menu'] ?></b><span>Menu</span></div>
      <div class="dash-stat"><b><?= count($kategoriList) ?></b><span>Kategori</span></div>
      <div class="dash-stat"><b><?= $dash['rating'] !== null ? htmlspecialchars(number_format((float) $dash['rating'], 1, ',', '.')) . ' ★' : '–' ?></b><span>Rating rata-rata (<?= (int) $dash['ulasan'] ?> ulasan)</span></div>
    </div>
    <div class="dash-chart"><canvas id="chartKategori" height="180"></canvas></div>
  </div>

  <!-- Form tambah / edit penyedia -->
  <div class="admin-card">
    <h2><i class="fa-solid fa-<?= $edit ? 'pen' : 'plus' ?>"></i> <?= $edit ? 'Ubah Penyedia' : 'Tambah Penyedia Baru' ?></h2>
    <form method="post" class="form-grid" id="formPenyedia">
      <input type="hidden" name="aksi" value="simpan_penyedia">
      <input type="hidden" name="id_penyedia" value="<?= $edit ? (int)$edit['id_penyedia'] : 0 ?>">
      <div><label>Nama penyedia *</label><input name="nama_penyedia" required value="<?= htmlspecialchars($edit['nama_penyedia'] ?? '') ?>" placeholder="cth: Batagor Kingsley"></div>
      <div><label>Kategori *</label>
        <select name="kategori" id="selectKategori" required>
          <option value="">— Pilih —</option>
          <?php foreach ($kategoriList as $k): ?>
          <option value="<?= htmlspecialchars($k['nama_kategori']) ?>" data-id="<?= (int)$k['id_kategori'] ?>" <?= ($edit && $edit['kategori'] === $k['nama_kategori']) ? 'selected' : '' ?>><?= htmlspecialchars($k['nama_kategori']) ?></option>
          <?php endforeach; ?>
        </select>
        <input type="hidden" name="id_kategori" id="inputIdKategori" value="<?= $edit ? (int)$edit['id_kategori'] : '' ?>">
      </div>
      <div class="full"><label>Alamat</label><textarea name="alamat" rows="2" placeholder="Jl. ..."><?= htmlspecialchars($edit['alamat'] ?? '') ?></textarea></div>
      <div><label>Latitude *</label><input name="latitude" id="inputLat" required value="<?= $edit ? htmlspecialchars($edit['latitude']) : '' ?>" placeholder="-6.9145"></div>
      <div><label>Longitude *</label><input name="longitude" id="inputLng" required value="<?= $edit ? htmlspecialchars($edit['longitude']) : '' ?>" placeholder="107.6105"></div>
      <div class="full">
        <label>Ambil koordinat dari peta <?= $keyReady ? '(klik peta)' : '(butuh API key Google Maps di config.php)' ?></label>
        <div class="mini-map" id="miniPeta"><?= $keyReady ? '' : '<p style="padding:20px;color:var(--muted)">Peta tidak aktif — isi latitude/longitude manual di atas.</p>' ?></div>
      </div>
      <div><label>Jam buka</label><input type="time" name="jam_buka" value="<?= $edit && $edit['jam_buka'] ? substr($edit['jam_buka'], 0, 5) : '' ?>"></div>
      <div><label>Jam tutup</label><input type="time" name="jam_tutup" value="<?= $edit && $edit['jam_tutup'] ? substr($edit['jam_tutup'], 0, 5) : '' ?>"></div>
      <div><label>No. telepon</label><input name="no_telepon" value="<?= htmlspecialchars($edit['no_telepon'] ?? '') ?>" placeholder="022-... / 08..."></div>
      <div><label>URL foto</label><input name="foto" value="<?= htmlspecialchars($edit['foto'] ?? '') ?>" placeholder="https://..."></div>
      <div class="full" style="display:flex;gap:10px">
        <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Simpan</button>
        <?php if ($edit): ?><a class="btn btn-ghost" href="admin.php">Batal</a><?php endif; ?>
      </div>
    </form>
  </div>

  <!-- Kelola menu 1 penyedia -->
  <?php if ($menuPenyedia): ?>
  <div class="admin-card">
    <h2><i class="fa-solid fa-bowl-food"></i> Menu — <?= htmlspecialchars($menuPenyedia['nama_penyedia']) ?></h2>
    <table class="admin-tbl">
      <tr><th>Menu</th><th>Harga</th><th></th></tr>
      <?php foreach ($menuPenyedia['menu'] as $m): ?>
      <tr>
        <td><?= htmlspecialchars($m['nama_menu']) ?></td>
        <td><?= rupiah($m['harga']) ?></td>
        <td><form method="post" onsubmit="return confirm('Hapus menu ini?')" style="display:inline">
          <input type="hidden" name="aksi" value="hapus_menu">
          <input type="hidden" name="id_menu" value="<?= (int)$m['id_menu'] ?>">
          <button class="btn btn-danger" type="submit"><i class="fa-solid fa-trash"></i></button>
        </form></td>
      </tr>
      <?php endforeach; ?>
      <?php if (empty($menuPenyedia['menu'])): ?><tr><td colspan="3" style="color:var(--muted)">Belum ada menu.</td></tr><?php endif; ?>
    </table>
    <form method="post" class="form-grid" style="margin-top:14px">
      <input type="hidden" name="aksi" value="tambah_menu">
      <input type="hidden" name="id_penyedia" value="<?= (int)$menuPenyedia['id_penyedia'] ?>">
      <div><label>Nama menu *</label><input name="nama_menu" required placeholder="cth: Batagor Kuah"></div>
      <div><label>Harga (Rp) *</label><input type="number" name="harga" min="500" step="500" required placeholder="18000"></div>
      <div class="full"><button class="btn btn-primary" type="submit"><i class="fa-solid fa-plus"></i> Tambah Menu</button>
      <a class="btn btn-ghost" href="admin.php">Selesai</a></div>
    </form>
  </div>

  <!-- Ulasan penyedia ini -->
  <div class="admin-card">
    <h2><i class="fa-solid fa-star"></i> Ulasan — <?= htmlspecialchars($menuPenyedia['nama_penyedia']) ?> (<?= count($menuPenyedia['ulasan'] ?? []) ?>)</h2>
    <?php if (empty($menuPenyedia['ulasan'])): ?>
      <p style="color:var(--muted);font-size:14px">Belum ada ulasan untuk penyedia ini.</p>
    <?php else: ?>
    <table class="admin-tbl">
      <tr><th>Nama</th><th>Rating</th><th>Komentar</th><th>Tanggal</th><th></th></tr>
      <?php foreach ($menuPenyedia['ulasan'] as $u): ?>
      <tr>
        <td><strong><?= htmlspecialchars($u['nama']) ?></strong></td>
        <td><?= str_repeat('★', (int) $u['rating']) . str_repeat('☆', 5 - (int) $u['rating']) ?></td>
        <td><?= htmlspecialchars($u['komentar']) ?></td>
        <td><?= htmlspecialchars(substr($u['created_at'], 0, 10)) ?></td>
        <td><form method="post" onsubmit="return confirm('Hapus ulasan ini?')" style="display:inline">
          <input type="hidden" name="aksi" value="hapus_ulasan">
          <input type="hidden" name="id_ulasan" value="<?= (int) $u['id_ulasan'] ?>">
          <button class="btn btn-danger" type="submit" title="Hapus ulasan"><i class="fa-solid fa-trash"></i></button>
        </form></td>
      </tr>
      <?php endforeach; ?>
    </table>
    <?php endif; ?>
  </div>
  <?php endif; ?>

  <!-- Daftar penyedia -->
  <div class="admin-card">
    <h2><i class="fa-solid fa-list"></i> Daftar Penyedia (<?= count($penyediaList) ?>)</h2>
    <div style="overflow-x:auto">
    <table class="admin-tbl">
      <tr><th>Nama</th><th>Kategori</th><th>Menu</th><th>Jam</th><th>Aksi</th></tr>
      <?php foreach ($penyediaList as $p): ?>
      <tr>
        <td><strong><?= htmlspecialchars($p['nama_penyedia']) ?></strong><br><small style="color:var(--muted)"><?= htmlspecialchars(mb_strimwidth($p['alamat'] ?? '', 0, 48, '...')) ?></small></td>
        <td><?= htmlspecialchars($p['kategori']) ?></td>
        <td><?= (int)$p['jumlah_menu'] ?> menu</td>
        <td><?= jamSingkat($p['jam_buka']) ?>–<?= jamSingkat($p['jam_tutup']) ?></td>
        <td style="white-space:nowrap">
          <a class="btn btn-ghost" href="admin.php?menu=<?= (int)$p['id_penyedia'] ?>" title="Kelola menu"><i class="fa-solid fa-bowl-food"></i></a>
          <a class="btn btn-ghost" href="admin.php?edit=<?= (int)$p['id_penyedia'] ?>" title="Ubah"><i class="fa-solid fa-pen"></i></a>
          <form method="post" onsubmit="return confirm('Hapus <?= htmlspecialchars(addslashes($p['nama_penyedia'])) ?> beserta semua menunya?')" style="display:inline">
            <input type="hidden" name="aksi" value="hapus_penyedia">
            <input type="hidden" name="id_penyedia" value="<?= (int)$p['id_penyedia'] ?>">
            <button class="btn btn-danger" type="submit" title="Hapus"><i class="fa-solid fa-trash"></i></button>
          </form>
        </td>
      </tr>
      <?php endforeach; ?>
    </table>
    </div>
    <p style="color:var(--muted);font-size:13px;margin-top:14px">Dikembangkan oleh <strong style="color:var(--text)">King Faisal</strong> &middot; FoodMap GIS &middot; Data tersimpan di MySQL (<code>foodmap_gis</code>).</p>
  </div>
<?php endif; ?>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script>
  // Grafik dashboard: penyedia per kategori
  (function () {
    var el = document.getElementById('chartKategori');
    if (!el || typeof Chart === 'undefined') return;
    var labels = <?= json_encode(array_column($dash['perKategori'], 'nama_kategori')) ?>;
    var values = <?= json_encode(array_map('intval', array_column($dash['perKategori'], 'jumlah'))) ?>;
    var colors = <?= json_encode(array_column($dash['perKategori'], 'warna')) ?>;
    new Chart(el, {
      type: 'bar',
      data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: '#94a3b8', precision: 0 }, grid: { color: 'rgba(148,163,184,.12)' } }
        }
      }
    });
  })();
</script>
<script>
  // Sinkronkan id_kategori dengan pilihan kategori
  var selKat = document.getElementById('selectKategori');
  var inIdKat = document.getElementById('inputIdKategori');
  if (selKat && inIdKat) {
    selKat.addEventListener('change', function () {
      var opt = selKat.options[selKat.selectedIndex];
      inIdKat.value = opt ? (opt.getAttribute('data-id') || '') : '';
    });
  }
</script>
<?php if ($login && $keyReady): ?>
<script>
  // Mini map picker: klik peta -> isi latitude/longitude
  function initAdminMap() {
    var lat0 = parseFloat(document.getElementById('inputLat').value) || <?= json_encode(DEFAULT_LAT) ?>;
    var lng0 = parseFloat(document.getElementById('inputLng').value) || <?= json_encode(DEFAULT_LNG) ?>;
    var map = new google.maps.Map(document.getElementById('miniPeta'), {
      center: { lat: lat0, lng: lng0 }, zoom: 14,
      mapTypeControl: false, streetViewControl: false
    });
    var marker = new google.maps.Marker({ position: { lat: lat0, lng: lng0 }, map: map, draggable: true });
    function setPos(p) {
      document.getElementById('inputLat').value = p.lat().toFixed(8);
      document.getElementById('inputLng').value = p.lng().toFixed(8);
      marker.setPosition(p);
    }
    map.addListener('click', function (e) { setPos(e.latLng); });
    marker.addListener('dragend', function () { setPos(marker.getPosition()); });
  }
</script>
<script async defer src="https://maps.googleapis.com/maps/api/js?key=<?= urlencode(GOOGLE_MAPS_API_KEY) ?>&callback=initAdminMap"></script>
<?php endif; ?>
</body>
</html>
