<?php
/**
 * FoodMap GIS — Halaman utama
 * Dikembangkan oleh King Faisal
 * Data penyedia diambil dari MySQL lewat api.php (bukan statis).
 */
require_once __DIR__ . '/config.php';
$keyReady = mapsKeyReady();
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FoodMap GIS — Cari Makanan di <?= htmlspecialchars(APP_CITY) ?> | King Faisal</title>
<meta name="description" content="FoodMap GIS — Sistem Informasi Geografis pencarian penyedia makanan di <?= htmlspecialchars(APP_CITY) ?> dengan peta Google Maps, rute perjalanan, dan menu lengkap. Dikembangkan oleh King Faisal.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="assets/css/style.css">
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
<header class="topbar">
  <a class="brand" href="index.php">
    <span class="brand-logo"><i class="fa-solid fa-utensils"></i></span>
    <span class="brand-text">
      <strong>FoodMap <span>GIS</span></strong>
      <small><i class="fa-solid fa-location-dot"></i> <?= htmlspecialchars(APP_CITY) ?> &middot; Cari &middot; Lihat &middot; Berangkat</small>
    </span>
  </a>

  <div class="search-box">
    <i class="fa-solid fa-magnifying-glass"></i>
    <input type="search" id="inputCari" placeholder="Cari makanan, warung, kafe..." autocomplete="off">
    <kbd class="search-kbd" title="Tekan / untuk fokus ke pencarian">/</kbd>
    <button id="btnBersihkan" title="Bersihkan pencarian" hidden><i class="fa-solid fa-xmark"></i></button>
  </div>

  <div class="top-actions">
    <button id="btnLokasiSaya" class="btn btn-ghost" title="Tampilkan lokasiku di peta">
      <i class="fa-solid fa-location-crosshairs"></i><span>Lokasi Saya</span>
    </button>
    <a class="btn btn-ghost" href="admin.php" title="Kelola data penyedia (admin)">
      <i class="fa-solid fa-gear"></i><span>Admin</span>
    </a>
  </div>
</header>

<main class="layout">
  <!-- ============ SIDEBAR: filter + daftar ============ -->
  <aside class="sidebar" id="sidebar">
    <!-- Globe 3D sebagai background di belakang daftar makanan -->
    <div class="globe-bg" id="globeBg"><canvas id="globe3d" aria-label="Peta 3D penyedia makanan di Bandung"></canvas></div>

    <div class="filter-bar">
      <div class="chips" id="chipsKategori">
        <button class="chip active" data-kategori="Semua">Semua</button>
      </div>
      <div class="filter-row">
        <label for="selectHarga"><i class="fa-solid fa-tag"></i> Harga termurah</label>
        <select id="selectHarga">
          <option value="">Semua harga</option>
          <option value="15000">s.d. Rp15.000</option>
          <option value="20000">s.d. Rp20.000</option>
          <option value="30000">s.d. Rp30.000</option>
        </select>
      </div>
    </div>

    <p class="hasil-info"><span id="jumlahHasil">Memuat...</span></p>

    <!-- Statistik + hint globe -->
    <div class="stats-strip" id="statsStrip">
      <div class="stat"><b id="statPenyedia">0</b><span>Penyedia</span></div>
      <div class="stat"><b id="statMenu">0</b><span>Menu</span></div>
      <div class="stat"><b id="statKategori">0</b><span>Kategori</span></div>
    </div>
    <p class="globe-hint"><i class="fa-solid fa-earth-asia"></i> Peta 3D berputar di belakang daftar</p>

    <div class="list" id="daftarPenyedia">
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    </div>

    <p class="credit">Dikembangkan oleh <strong>King Faisal</strong><br>
    <small>Tugas Proyek Sistem Informasi Geografis (GIS)</small></p>
  </aside>

  <!-- ============ PETA ============ -->
  <section class="map-wrap">
    <div id="peta"></div>

    <!-- Kartu petunjuk bila SEMUA peta gagal dimuat (Google Maps + OpenStreetMap) -->
    <div class="map-notice" id="mapNotice" <?= $keyReady ? 'hidden' : '' ?>>
      <div class="map-notice-card">
        <i class="fa-solid fa-map-location-dot"></i>
        <h2>Peta tidak dapat dimuat</h2>
        <p>Google Maps butuh API key + billing aktif, dan peta cadangan (OpenStreetMap) juga gagal dimuat — kemungkinan koneksi internet terputus. Coba muat ulang halaman. Daftar penyedia di samping tetap tampil karena datanya dari database.</p>
        <ol>
          <li>Buka <a href="https://console.cloud.google.com/google/maps-apis" target="_blank" rel="noopener">Google Cloud Console &rarr; Maps API</a></li>
          <li>Aktifkan <strong>Maps JavaScript API</strong> dan <strong>Directions API</strong></li>
          <li>Buat API key, lalu tempel ke <code>config.php</code>, dan aktifkan billing</li>
        </ol>
        <p class="map-notice-small">Panduan lengkap ada di <code>README.md</code>.</p>
      </div>
    </div>

    <!-- Penanda mode peta cadangan -->
    <div class="osm-pill" id="pillOsm" hidden><i class="fa-solid fa-map"></i> Peta: OpenStreetMap — Google Maps aktif otomatis setelah billing diaktifkan</div>

    <!-- Info rute -->
    <div class="route-bar" id="routeBar" hidden>
      <i class="fa-solid fa-route"></i>
      <span id="routeInfo">Menghitung rute...</span>
      <a id="routeGmaps" href="#" target="_blank" rel="noopener">Buka di Google Maps <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
      <button id="routeTutup" title="Tutup rute"><i class="fa-solid fa-xmark"></i></button>
    </div>

    <!-- Panel detail penyedia -->
    <article class="detail" id="panelDetail" hidden>
      <button class="detail-tutup" id="btnTutupDetail" title="Tutup"><i class="fa-solid fa-xmark"></i></button>
      <img id="detailFoto" src="" alt="Foto penyedia makanan">
      <div class="detail-body">
        <div class="detail-head">
          <h2 id="detailNama">-</h2>
          <span class="badge" id="detailKategori">-</span>
        </div>
        <p class="detail-status"><span class="dot-buka" id="detailStatusDot"></span><span id="detailStatus">-</span></p>
        <p class="detail-alamat"><i class="fa-solid fa-location-dot"></i> <span id="detailAlamat">-</span></p>
        <p class="detail-meta">
          <span><i class="fa-regular fa-clock"></i> <span id="detailJam">-</span></span>
          <a id="detailTelepon" href="#"><i class="fa-solid fa-phone"></i> <span id="detailTeleponText">-</span></a>
        </p>
        <h3><i class="fa-solid fa-bowl-food"></i> Menu &amp; Harga</h3>
        <ul class="menu-list" id="detailMenu"></ul>
        <div class="detail-actions">
          <button class="btn btn-primary" id="btnRute"><i class="fa-solid fa-route"></i> Rute ke Sini</button>
          <a class="btn btn-ghost" id="btnGmaps" href="#" target="_blank" rel="noopener"><i class="fa-solid fa-map-location-dot"></i> Google Maps</a>
        </div>
      </div>
    </article>

    <button class="map-fab" id="btnLokasiFab" title="Pusatkan ke lokasiku"><i class="fa-solid fa-location-crosshairs"></i></button>
  </section>
</main>

<!-- Toggle tampilan Peta / Daftar (hanya tampil di layar kecil) -->
<div class="view-toggle" id="viewToggle" role="tablist" aria-label="Tampilan">
  <button class="active" data-view="map" role="tab" aria-selected="true"><i class="fa-solid fa-map"></i> Peta</button>
  <button data-view="list" role="tab" aria-selected="false"><i class="fa-solid fa-list"></i> Daftar</button>
</div>

<!-- Toast pengganti alert() -->
<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script>
  // Konfigurasi dari server untuk app.js
  window.FOODMAP = {
    mapsKeyReady: <?= $keyReady ? 'true' : 'false' ?>,
    defaultLat: <?= json_encode(DEFAULT_LAT) ?>,
    defaultLng: <?= json_encode(DEFAULT_LNG) ?>,
    apiBase: 'api.php'
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="assets/js/app.js"></script>
<script defer src="assets/js/globe3d.js"></script>
<script defer src="assets/js/polish.js"></script>
<?php if ($keyReady): ?>
<script async defer onerror="mapLoadFailed()" src="https://maps.googleapis.com/maps/api/js?key=<?= urlencode(GOOGLE_MAPS_API_KEY) ?>&libraries=geometry&callback=initMap"></script>
<?php endif; ?>
</body>
</html>
