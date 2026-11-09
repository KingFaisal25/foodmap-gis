/* ============================================================
   FoodMap GIS — Logika frontend
   Dikembangkan oleh King Faisal
   Data: api.php (MySQL) — pencarian & filter di sisi klien
   atas data yang sudah diambil dari database.
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.FOODMAP || {};
  var API = CFG.apiBase || 'api.php';
  var DEFAULT_POS = { lat: CFG.defaultLat || -6.9218, lng: CFG.defaultLng || 107.6077 };

  var semuaPenyedia = [];
  var kategoriList = [];
  var markers = {};
  var map = null;
  // Mesin peta aktif: 'google' (utama, sesuai tugas) atau 'osm' (cadangan otomatis)
  var engine = null;
  var osmMap = null;
  var osmMarkers = {};
  var osmUserMarker = null;
  var osmRouteLine = null;
  var fallbackTimer = null;
  var directionsService = null;
  var directionsRenderer = null;
  var userMarker = null;
  var userLoc = null;
  var aktifId = null;
  var filter = { q: '', kategori: 'Semua', maxHarga: '', radiusKm: '', halalSaja: false, bukaSaja: false, fasilitas: [], pembayaran: [], favoritSaja: false, sort: 'nama' };
  // Favorit: daftar id penyedia (tersimpan di localStorage)
  var favList = [];
  try {
    favList = JSON.parse(localStorage.getItem('foodmap_fav') || '[]') || [];
  } catch (e) { favList = []; }
  // Tur kuliner: daftar id penyedia (tersimpan di localStorage)
  var turStops = [];
  try {
    turStops = JSON.parse(localStorage.getItem('foodmap_tur') || '[]') || [];
  } catch (e) { turStops = []; }
  // Heatmap kepadatan kuliner
  var heatmapLayer = null;
  var heatmapAktif = false;
  // Street View di panel detail
  var streetPano = null;
  var streetUntukId = null;

  // ---------- Util ----------
  function $(id) { return document.getElementById(id); }
  /** Beri tahu pengguna: toast (polish.js) bila ada, alert() bila tidak. */
  function beriTahu(pesan) {
    if (window.__foodmapToast) { window.__foodmapToast(pesan); return; }
    alert(pesan);
  }
  function rupiah(n) {
    if (n === null || n === undefined) return '-';
    return 'Rp' + Number(n).toLocaleString('id-ID');
  }
  function jamPendek(t) { return t ? String(t).slice(0, 5).replace(':', '.') : '-'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function haversineKm(a, b) {
    var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function jarakText(p) {
    if (!userLoc) return '';
    var km = haversineKm(userLoc, { lat: p.latitude, lng: p.longitude });
    return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km';
  }
  /** Status buka/tutup sekarang (menangani jam tutup lewat tengah malam). */
  function statusBuka(p) {
    if (!p.jam_buka || !p.jam_tutup) return { buka: null, teks: 'Jam tidak tercantum' };
    var now = new Date();
    var menit = now.getHours() * 60 + now.getMinutes();
    var buka = parseInt(p.jam_buka.slice(0, 2), 10) * 60 + parseInt(p.jam_buka.slice(3, 5), 10);
    var tutup = parseInt(p.jam_tutup.slice(0, 2), 10) * 60 + parseInt(p.jam_tutup.slice(3, 5), 10);
    var isBuka = tutup > buka ? (menit >= buka && menit < tutup) : (menit >= buka || menit < tutup);
    return {
      buka: isBuka,
      teks: (isBuka ? 'Buka sekarang' : 'Tutup') + ' · ' + jamPendek(p.jam_buka) + '–' + jamPendek(p.jam_tutup)
    };
  }
  function warnaKategori(p) { return p.warna || '#00b4d8'; }
  /** Jarak (km) dari lokasi pengguna ke penyedia; null bila lokasi belum ada. */
  function jarakKm(p) {
    if (!userLoc) return null;
    return haversineKm(userLoc, { lat: p.latitude, lng: p.longitude });
  }
  /** Bintang rating: ★★★★☆ + angka, atau '-' bila belum ada ulasan. */
  function bintangHtml(avg, count) {
    if (!count || avg === null || avg === undefined) return '<span class="rating-kosong">Belum ada rating</span>';
    var penuh = Math.round(avg);
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= penuh ? '★' : '☆';
    return '<span class="rating-bintang">' + s + '</span> <b>' + Number(avg).toFixed(1).replace('.', ',') + '</b> (' + count + ')';
  }
  /** Daftar tag (fasilitas/pembayaran) dari string koma. */
  function tagList(str) {
    return (str || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean);
  }
  var LABEL_FASILITAS = { wifi: 'WiFi', parkir: 'Parkir', mushola: 'Mushola', outdoor: 'Outdoor', anak: 'Ramah anak' };
  var IKON_FASILITAS = { wifi: 'fa-wifi', parkir: 'fa-square-parking', mushola: 'fa-mosque', outdoor: 'fa-tree', anak: 'fa-child' };
  var LABEL_BAYAR = { qris: 'QRIS', tunai: 'Tunai', ewallet: 'E-wallet' };
  function fasilitasHtml(p) {
    var tags = tagList(p.fasilitas);
    if (!tags.length) return '';
    return '<span class="card-fasilitas">' + tags.map(function (t) {
      return '<span title="' + (LABEL_FASILITAS[t] || t) + '"><i class="fa-solid ' + (IKON_FASILITAS[t] || 'fa-circle-check') + '"></i> ' + (LABEL_FASILITAS[t] || t) + '</span>';
    }).join('') + '</span>';
  }
  function halalBadgeHtml(p) {
    if (p.halal === 'halal') return '<span class="badge-halal badge-halal-mini">✓ Halal</span>';
    return '';
  }
  // ---------- Favorit ----------
  function simpanFav() {
    try { localStorage.setItem('foodmap_fav', JSON.stringify(favList)); } catch (e) { /* abaikan */ }
  }
  function toggleFav(id) {
    var i = favList.indexOf(id);
    if (i === -1) { favList.push(id); beriTahu(namaPenyedia(id) + ' disimpan ke favorit.'); }
    else favList.splice(i, 1);
    simpanFav();
    terapkanFilter();
    if (aktifId === id) { /* segarkan tombol di panel detail */ var p = cariPenyedia(id); if (p) tampilkanDetail(p); }
  }

  // ---------- Ambil data ----------
  function ambilJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function muatAwal() {
    Promise.all([
      ambilJSON(API + '?action=list').catch(function (e) { return { ok: false, error: String(e) }; }),
      ambilJSON(API + '?action=kategori').catch(function () { return { ok: false, data: [] }; })
    ]).then(function (hasil) {
      var list = hasil[0], kat = hasil[1];
      if (!list.ok) {
        $('daftarPenyedia').innerHTML =
          '<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>' +
          'Tidak bisa mengambil data dari database.<br><span style="font-size:12.5px">' + esc(list.error || 'Periksa config.php dan import database/foodmap_gis.sql') + '</span></div>';
        $('jumlahHasil').textContent = 'Database belum terhubung';
        return;
      }
      semuaPenyedia = list.data || [];
      kategoriList = (kat.ok && kat.data) ? kat.data : [];
      bangunChips();
      terapkanFilter();
    });
  }

  // ---------- Filter ----------
  function bangunChips() {
    var wrap = $('chipsKategori');
    var html = '<button class="chip active" data-kategori="Semua">Semua <span class="n">' + semuaPenyedia.length + '</span></button>';
    var sumber = kategoriList.length ? kategoriList : [];
    // Bila kategori API kosong, turunkan dari data penyedia.
    if (!sumber.length) {
      var unik = {};
      semuaPenyedia.forEach(function (p) { unik[p.kategori] = (unik[p.kategori] || 0) + 1; });
      Object.keys(unik).sort().forEach(function (nama) {
        sumber.push({ nama_kategori: nama, jumlah: unik[nama], warna: '#00b4d8' });
      });
    }
    sumber.forEach(function (k) {
      html += '<button class="chip" data-kategori="' + esc(k.nama_kategori) + '">' +
        esc(k.nama_kategori) + ' <span class="n">' + (k.jumlah != null ? k.jumlah : '') + '</span></button>';
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll('.chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        wrap.querySelectorAll('.chip').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        filter.kategori = btn.getAttribute('data-kategori');
        terapkanFilter();
      });
    });
  }

  function cocokFilter(p) {
    if (filter.kategori !== 'Semua' && p.kategori !== filter.kategori) return false;
    if (filter.maxHarga !== '' && p.harga_termurah !== null && p.harga_termurah > Number(filter.maxHarga)) return false;
    if (filter.radiusKm !== '') {
      var km = jarakKm(p);
      if (km === null || km > Number(filter.radiusKm)) return false;
    }
    if (filter.halalSaja && p.halal !== 'halal') return false;
    if (filter.bukaSaja && statusBuka(p).buka !== true) return false;
    if (filter.fasilitas.length) {
      var tagsF = tagList(p.fasilitas);
      for (var i = 0; i < filter.fasilitas.length; i++) if (tagsF.indexOf(filter.fasilitas[i]) === -1) return false;
    }
    if (filter.pembayaran.length) {
      var tagsB = tagList(p.pembayaran);
      for (var j = 0; j < filter.pembayaran.length; j++) if (tagsB.indexOf(filter.pembayaran[j]) === -1) return false;
    }
    if (filter.favoritSaja && favList.indexOf(p.id_penyedia) === -1) return false;
    if (filter.q) {
      var q = filter.q.toLowerCase();
      var hay = (p.nama_penyedia + ' ' + (p.alamat || '') + ' ' + p.kategori).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function terapkanFilter() {
    var hasil = semuaPenyedia.filter(cocokFilter);
    // Urutan tampil
    if (filter.sort === 'termurah') {
      hasil.sort(function (a, b) { return (a.harga_termurah === null ? Infinity : a.harga_termurah) - (b.harga_termurah === null ? Infinity : b.harga_termurah); });
    } else if (filter.sort === 'rating') {
      hasil.sort(function (a, b) { return (b.rating_avg === null ? -1 : b.rating_avg) - (a.rating_avg === null ? -1 : a.rating_avg); });
    } else if (filter.sort === 'dekat' && userLoc) {
      hasil.sort(function (a, b) { return jarakKm(a) - jarakKm(b); });
    } else if (filter.radiusKm !== '' && userLoc) {
      // Filter jarak aktif tanpa urutan lain: urutkan dari yang terdekat.
      hasil.sort(function (a, b) { return jarakKm(a) - jarakKm(b); });
    } else {
      hasil.sort(function (a, b) { return a.nama_penyedia.localeCompare(b.nama_penyedia, 'id'); });
    }
    renderDaftar(hasil);
    renderMarker(hasil);
    $('jumlahHasil').innerHTML = '<b>' + hasil.length + '</b> dari ' + semuaPenyedia.length + ' penyedia makanan';
  }

  // ---------- Daftar ----------
  function renderDaftar(hasil) {
    var box = $('daftarPenyedia');
    if (!hasil.length) {
      box.innerHTML = '<div class="empty"><i class="fa-solid fa-magnifying-glass"></i>Tidak ada penyedia yang cocok.<br>Coba kata kunci atau filter lain.</div>';
      return;
    }
    box.innerHTML = hasil.map(function (p) {
      var st = statusBuka(p);
      var j = jarakText(p);
      var diTur = turStops.indexOf(p.id_penyedia) !== -1;
      var diFav = favList.indexOf(p.id_penyedia) !== -1;
      return '<div class="card' + (p.id_penyedia === aktifId ? ' active' : '') + '" data-id="' + p.id_penyedia + '" role="button" tabindex="0">' +
        '<button class="fav-btn' + (diFav ? ' in-fav' : '') + '" data-id="' + p.id_penyedia + '" title="' + (diFav ? 'Hapus dari favorit' : 'Simpan ke favorit') + '">' + (diFav ? '♥' : '♡') + '</button>' +
        '<button class="tur-add' + (diTur ? ' in-tur' : '') + '" data-id="' + p.id_penyedia + '" title="' + (diTur ? 'Sudah di tur — klik untuk hapus' : 'Tambah ke tur kuliner') + '">' + (diTur ? '✓ Tur' : '+ Tur') + '</button>' +
        '<img src="' + esc(p.foto || '') + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="card-info">' +
          '<h3>' + esc(p.nama_penyedia) + '</h3>' +
          '<span class="card-cat" style="background:' + warnaKategori(p) + '">' + esc(p.kategori) + '</span>' + halalBadgeHtml(p) + '<br>' +
          '<span class="card-alamat"><i class="fa-solid fa-location-dot"></i> ' + esc(p.alamat || '') + '</span>' +
          fasilitasHtml(p) +
          '<span class="card-meta">' +
            '<span>Mulai <b>' + rupiah(p.harga_termurah) + '</b></span>' +
            '<span><i class="fa-solid fa-bowl-food"></i> ' + p.jumlah_menu + ' menu</span>' +
            (j ? '<span><i class="fa-solid fa-road"></i> ' + j + '</span>' : '') +
            (st.buka === null ? '' : '<span class="' + (st.buka ? 'buka' : 'tutup') + '">' + (st.buka ? '● Buka' : '● Tutup') + '</span>') +
          '</span>' +
          '<span class="card-rating">' + bintangHtml(p.rating_avg, p.ulasan_count) + '</span>' +
        '</span></div>';
    }).join('');
    box.querySelectorAll('.card').forEach(function (el) {
      el.addEventListener('click', function () { pilihPenyedia(Number(el.getAttribute('data-id'))); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pilihPenyedia(Number(el.getAttribute('data-id'))); }
      });
    });
    box.querySelectorAll('.tur-add').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleTur(Number(btn.getAttribute('data-id')));
      });
    });
    box.querySelectorAll('.fav-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleFav(Number(btn.getAttribute('data-id')));
      });
    });
  }

  // ---------- Peta ----------
  function ikonMarker(warna) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">' +
      '<circle cx="18" cy="18" r="15" fill="' + warna + '" stroke="#fff" stroke-width="2.5"/>' +
      '<circle cx="18" cy="18" r="5" fill="#fff"/></svg>';
    return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(36, 36), anchor: new google.maps.Point(18, 18) };
  }

  var GAYA_GELAP = [
    { elementType: 'geometry', stylers: [{ color: '#1a2438' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1220' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2b3a55' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e2a3f' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#16223c' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#12291f' }] }
  ];

  window.initMap = function () {
    if (engine === 'osm') return; // fallback OSM sudah jalan duluan
    engine = 'google';
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    map = new google.maps.Map($('peta'), {
      center: DEFAULT_POS, zoom: 13,
      styles: GAYA_GELAP,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: true
    });
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({ map: map, suppressMarkers: false, polylineOptions: { strokeColor: '#00b4d8', strokeWeight: 5 } });
    renderMarker(semuaPenyedia.filter(cocokFilter));
    mintaLokasi(false);
    // Google menampilkan .gm-err-container bila API gagal (mis. billing belum aktif)
    setTimeout(function () {
      if (engine === 'google' && document.querySelector('.gm-err-container')) initFallbackMap();
    }, 5000);
  };

  // Bila Google menolak API key (key salah / belum diaktifkan)
  window.gm_authFailure = function () { initFallbackMap(); };
  // Bila script Google Maps gagal dimuat sama sekali
  window.mapLoadFailed = function () { initFallbackMap(); };

  /** Fallback: OpenStreetMap + Leaflet (gratis, tanpa key/billing). */
  function initFallbackMap() {
    if (engine === 'osm') return;
    if (typeof L === 'undefined') { $('mapNotice').hidden = false; return; }
    engine = 'osm';
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    $('peta').innerHTML = '';
    $('mapNotice').hidden = true;
    $('pillOsm').hidden = false;
    osmMap = L.map('peta').setView([DEFAULT_POS.lat, DEFAULT_POS.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(osmMap);
    renderMarkerOsm(semuaPenyedia.filter(cocokFilter));
    if (userLoc) tandaiLokasiOsm();
    mintaLokasi(false);
  }

  function renderMarkerOsm(hasil) {
    if (!osmMap) return;
    Object.keys(osmMarkers).forEach(function (id) { osmMap.removeLayer(osmMarkers[id]); });
    osmMarkers = {};
    hasil.forEach(function (p) {
      var ikon = L.divIcon({
        className: 'osm-marker',
        html: '<span style="background:' + warnaKategori(p) + '"></span>',
        iconSize: [30, 30], iconAnchor: [15, 15]
      });
      var m = L.marker([p.latitude, p.longitude], { icon: ikon, title: p.nama_penyedia }).addTo(osmMap);
      m.on('click', function () { pilihPenyedia(p.id_penyedia); });
      osmMarkers[p.id_penyedia] = m;
    });
  }

  function tandaiLokasiOsm() {
    if (!osmMap || !userLoc) return;
    if (!osmUserMarker) {
      osmUserMarker = L.circleMarker([userLoc.lat, userLoc.lng], {
        radius: 9, color: '#fff', weight: 3, fillColor: '#38bdf8', fillOpacity: 1
      }).addTo(osmMap);
    } else osmUserMarker.setLatLng([userLoc.lat, userLoc.lng]);
  }

  function renderMarker(hasil) {
    if (engine === 'osm') return renderMarkerOsm(hasil);
    if (!map || !window.google) return;
    var tampil = {};
    hasil.forEach(function (p) {
      tampil[p.id_penyedia] = true;
      if (markers[p.id_penyedia]) { markers[p.id_penyedia].setMap(map); return; }
      var m = new google.maps.Marker({
        position: { lat: p.latitude, lng: p.longitude },
        map: map, title: p.nama_penyedia, icon: ikonMarker(warnaKategori(p))
      });
      m.addListener('click', function () { pilihPenyedia(p.id_penyedia); });
      markers[p.id_penyedia] = m;
    });
    Object.keys(markers).forEach(function (id) {
      if (!tampil[id]) markers[id].setMap(null);
    });
  }

  // ---------- Detail ----------
  function pilihPenyedia(id) {
    aktifId = id;
    document.querySelectorAll('.card').forEach(function (el) {
      el.classList.toggle('active', Number(el.getAttribute('data-id')) === id);
    });
    var p = null;
    for (var i = 0; i < semuaPenyedia.length; i++) if (semuaPenyedia[i].id_penyedia === id) { p = semuaPenyedia[i]; break; }
    if (!p) return;
    if (engine === 'osm' && osmMap) osmMap.setView([p.latitude, p.longitude], 15);
    else if (map) map.panTo({ lat: p.latitude, lng: p.longitude });
    ambilJSON(API + '?action=detail&id=' + id).then(function (res) {
      if (res.ok) tampilkanDetail(res.data);
    }).catch(function () { tampilkanDetail(p); });
  }

  function tampilkanDetail(p) {
    var st = statusBuka(p);
    $('detailFoto').src = p.foto || '';
    $('detailNama').textContent = p.nama_penyedia;
    var badge = $('detailKategori');
    badge.textContent = p.kategori;
    badge.style.background = warnaKategori(p);
    var halalEl = $('detailHalal');
    if (halalEl) halalEl.hidden = p.halal !== 'halal';
    var fasEl = $('detailFasilitas');
    if (fasEl) {
      var tagsF = tagList(p.fasilitas);
      if (tagsF.length) {
        fasEl.hidden = false;
        fasEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Fasilitas: ' + tagsF.map(function (t) { return LABEL_FASILITAS[t] || t; }).join(' · ');
      } else fasEl.hidden = true;
    }
    var byrEl = $('detailPembayaran');
    if (byrEl) {
      var tagsB = tagList(p.pembayaran);
      if (tagsB.length) {
        byrEl.hidden = false;
        byrEl.innerHTML = '<i class="fa-solid fa-qrcode"></i> Pembayaran: ' + tagsB.map(function (t) { return LABEL_BAYAR[t] || t; }).join(' · ');
      } else byrEl.hidden = true;
    }
    $('detailStatusDot').className = 'dot-buka ' + (st.buka ? 'buka' : 'tutup');
    $('detailStatus').textContent = st.teks;
    $('detailAlamat').textContent = p.alamat || '-';
    $('detailJam').textContent = jamPendek(p.jam_buka) + '–' + jamPendek(p.jam_tutup) + ' WIB';
    var tel = p.no_telepon || '';
    $('detailTelepon').href = tel ? 'tel:' + tel.replace(/[^0-9+]/g, '') : '#';
    $('detailTeleponText').textContent = tel || '-';
    var menu = p.menu || [];
    $('detailMenu').innerHTML = menu.length
      ? menu.map(function (m) { return '<li><span>' + esc(m.nama_menu) + '</span><b>' + rupiah(m.harga) + '</b></li>'; }).join('')
      : '<li><span style="color:var(--muted)">Menu belum tersedia.</span><b></b></li>';
    var dest = p.latitude + ',' + p.longitude;
    var orig = userLoc ? (userLoc.lat + ',' + userLoc.lng) : '';
    $('btnGmaps').href = 'https://www.google.com/maps/dir/?api=1' + (orig ? '&origin=' + orig : '') + '&destination=' + dest;
    $('btnRute').onclick = function () { buatRute(p); };
    // Rating + ulasan
    $('ulasanRata').innerHTML = bintangHtml(p.rating_avg, p.ulasan_count);
    muatUlasan(p.id_penyedia);
    var formU = $('formUlasan');
    if (formU) {
      formU.dataset.id = p.id_penyedia;
      var stEl = $('ulasanStatus');
      if (stEl) stEl.hidden = true;
    }
    // Street View: reset tiap ganti penyedia
    var streetBox = $('detailStreet');
    if (streetBox) streetBox.hidden = true;
    var streetBtn = $('btnStreet');
    if (streetBtn) streetBtn.innerHTML = '<i class="fa-solid fa-eye"></i> Lihat Jalan di Depan Tempat Ini';
    if (streetBtn) streetBtn.onclick = function () { toggleStreet(p); };
    // Tombol + Tur
    var btnTur = $('btnTambahTur');
    if (btnTur) {
      var diTur = turStops.indexOf(p.id_penyedia) !== -1;
      btnTur.innerHTML = diTur ? '<i class="fa-solid fa-check"></i> Di Tur' : '<i class="fa-solid fa-plus"></i> Tur';
      btnTur.onclick = function () { toggleTur(p.id_penyedia); };
    }
    // Tombol favorit + bagikan WhatsApp
    var btnFav = $('btnFav');
    if (btnFav) {
      var diFav = favList.indexOf(p.id_penyedia) !== -1;
      btnFav.innerHTML = diFav ? '<i class="fa-solid fa-heart"></i> Favorit ✓' : '<i class="fa-regular fa-heart"></i> Favorit';
      btnFav.onclick = function () { toggleFav(p.id_penyedia); };
    }
    var btnWa = $('btnShareWa');
    if (btnWa) {
      var teks = 'Yuk makan di ' + p.nama_penyedia + ' (' + p.kategori + ') — ' + (p.alamat || 'Bandung') +
        ', mulai ' + rupiah(p.harga_termurah) + '. Lokasi: https://www.google.com/maps/dir/?api=1&destination=' + p.latitude + ',' + p.longitude;
      btnWa.href = 'https://wa.me/?text=' + encodeURIComponent(teks);
    }
    $('panelDetail').hidden = false;
  }

  // ---------- Rute ----------
  function buatRute(p) {
    var dest = { lat: p.latitude, lng: p.longitude };
    var gmapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + p.latitude + ',' + p.longitude;
    if (userLoc) gmapsUrl += '&origin=' + userLoc.lat + ',' + userLoc.lng;
    $('routeGmaps').href = gmapsUrl;
    // Mode OSM (tanpa Directions API): garis lurus + jarak, navigasi lewat link Google Maps.
    if (engine === 'osm' && osmMap) {
      var origin = userLoc || DEFAULT_POS;
      if (osmRouteLine) osmMap.removeLayer(osmRouteLine);
      osmRouteLine = L.polyline([[origin.lat, origin.lng], [p.latitude, p.longitude]], {
        color: '#00b4d8', weight: 4, dashArray: '8, 8'
      }).addTo(osmMap);
      osmMap.fitBounds(osmRouteLine.getBounds().pad(0.35));
      var km = haversineKm(origin, dest);
      $('routeBar').hidden = false;
      $('routeInfo').textContent = 'Ke ' + p.nama_penyedia + ': ±' + (km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1).replace('.', ',') + ' km') + ' garis lurus dari ' + (userLoc ? 'lokasimu' : 'pusat kota') + ' — navigasi jalan lewat Google Maps.';
      return;
    }
    if (!map || !directionsService) {
      // Peta belum aktif (tanpa API key): tetap buka Google Maps.
      window.open(gmapsUrl, '_blank');
      return;
    }
    var origin = userLoc || DEFAULT_POS;
    $('routeBar').hidden = false;
    $('routeInfo').textContent = 'Menghitung rute ke ' + p.nama_penyedia + '...';
    directionsService.route({
      origin: origin, destination: dest, travelMode: google.maps.TravelMode.DRIVING
    }, function (res, status) {
      if (status === 'OK' && res.routes.length) {
        directionsRenderer.setDirections(res);
        var leg = res.routes[0].legs[0];
        $('routeInfo').textContent = 'Rute ke ' + p.nama_penyedia + ': ' + leg.distance.text + ' · ' + leg.duration.text + (userLoc ? ' dari lokasimu' : ' dari pusat kota');
      } else {
        $('routeInfo').textContent = 'Rute tidak dapat dihitung di sini — buka di Google Maps.';
      }
    });
  }

  // ---------- Tur kuliner (multi-tujuan) ----------
  function simpanTur() {
    try { localStorage.setItem('foodmap_tur', JSON.stringify(turStops)); } catch (e) { /* abaikan */ }
  }
  function namaPenyedia(id) {
    for (var i = 0; i < semuaPenyedia.length; i++) if (semuaPenyedia[i].id_penyedia === id) return semuaPenyedia[i].nama_penyedia;
    return 'Penyedia #' + id;
  }
  function cariPenyedia(id) {
    for (var i = 0; i < semuaPenyedia.length; i++) if (semuaPenyedia[i].id_penyedia === id) return semuaPenyedia[i];
    return null;
  }
  function renderTurBar() {
    var bar = $('turBar');
    if (!bar) return;
    if (!turStops.length) { bar.hidden = true; return; }
    bar.hidden = false;
    $('turInfo').textContent = 'Tur Kuliner (' + turStops.length + '): ' +
      turStops.map(namaPenyedia).join(' → ');
    $('btnBuatRute').disabled = turStops.length < 1;
  }
  function toggleTur(id) {
    var i = turStops.indexOf(id);
    if (i === -1) {
      if (turStops.length >= 8) { beriTahu('Tur maksimal 8 tempat.'); return; }
      turStops.push(id);
      beriTahu(namaPenyedia(id) + ' masuk ke tur kuliner.');
    } else {
      turStops.splice(i, 1);
    }
    simpanTur();
    renderTurBar();
    terapkanFilter(); // segarkan tombol + Tur di kartu
  }
  /** Urutan kunjungan terbaik (nearest-neighbor dari titik awal) — untuk mode OSM. */
  function urutanTerbaik(stops, awal) {
    var sisa = stops.slice(), urutan = [], pos = awal;
    while (sisa.length) {
      var terbaik = 0, jarakTerbaik = Infinity;
      sisa.forEach(function (id, idx) {
        var p = cariPenyedia(id);
        if (!p) return;
        var d = haversineKm(pos, { lat: p.latitude, lng: p.longitude });
        if (d < jarakTerbaik) { jarakTerbaik = d; terbaik = idx; }
      });
      var id = sisa.splice(terbaik, 1)[0];
      var p = cariPenyedia(id);
      if (p) { urutan.push(p); pos = { lat: p.latitude, lng: p.longitude }; }
    }
    return urutan;
  }
  function buatRuteTur() {
    if (!turStops.length) return;
    var awal = userLoc || DEFAULT_POS;
    var gmapsUrl = 'https://www.google.com/maps/dir/?api=1' +
      '&origin=' + awal.lat + ',' + awal.lng +
      '&destination=' + (function () { var p = cariPenyedia(turStops[turStops.length - 1]); return p ? p.latitude + ',' + p.longitude : ''; })() +
      (turStops.length > 1 ? '&waypoints=' + turStops.slice(0, -1).map(function (id) { var p = cariPenyedia(id); return p ? p.latitude + ',' + p.longitude : ''; }).filter(Boolean).join('|') : '');
    $('routeGmaps').href = gmapsUrl;
    // Mode OSM: garis lurus antar pemberhentian (urutan terbaik) + total jarak.
    if (engine === 'osm' && osmMap) {
      var urutan = urutanTerbaik(turStops, awal);
      if (osmRouteLine) osmMap.removeLayer(osmRouteLine);
      var titik = [[awal.lat, awal.lng]].concat(urutan.map(function (p) { return [p.latitude, p.longitude]; }));
      osmRouteLine = L.polyline(titik, { color: '#8b5cf6', weight: 4, dashArray: '8, 8' }).addTo(osmMap);
      osmMap.fitBounds(osmRouteLine.getBounds().pad(0.35));
      var total = 0;
      for (var i = 1; i < titik.length; i++) total += haversineKm({ lat: titik[i - 1][0], lng: titik[i - 1][1] }, { lat: titik[i][0], lng: titik[i][1] });
      $('routeBar').hidden = false;
      $('routeInfo').textContent = 'Tur kuliner: ' + urutan.length + ' tempat · ±' +
        (total < 1 ? Math.round(total * 1000) + ' m' : total.toFixed(1).replace('.', ',') + ' km') +
        ' garis lurus — navigasi jalan lewat Google Maps.';
      return;
    }
    if (!map || !directionsService) { window.open(gmapsUrl, '_blank'); return; }
    var tujuan = urutanTerbaik(turStops, awal);
    if (!tujuan.length) return;
    var dest = tujuan[tujuan.length - 1];
    var waypoints = tujuan.slice(0, -1).map(function (p) {
      return { location: { lat: p.latitude, lng: p.longitude }, stopover: true };
    });
    $('routeBar').hidden = false;
    $('routeInfo').textContent = 'Menghitung rute tur kuliner (' + tujuan.length + ' tempat)...';
    directionsService.route({
      origin: awal,
      destination: { lat: dest.latitude, lng: dest.longitude },
      waypoints: waypoints,
      optimizeWaypoints: true, // Google urutkan pemberhentian paling efisien
      travelMode: google.maps.TravelMode.DRIVING
    }, function (res, status) {
      if (status === 'OK' && res.routes.length) {
        directionsRenderer.setDirections(res);
        var totalJarak = 0, totalWaktu = 0, urutanNama = [];
        res.routes[0].legs.forEach(function (leg) {
          totalJarak += leg.distance.value;
          totalWaktu += leg.duration.value;
          urutanNama.push(leg.end_address.split(',')[0]);
        });
        var km = (totalJarak / 1000).toFixed(1).replace('.', ',');
        var mnt = Math.round(totalWaktu / 60);
        $('routeInfo').textContent = 'Tur kuliner: ' + tujuan.length + ' tempat · ' + km + ' km · ±' + mnt + ' mnt · ' + urutanNama.join(' → ');
      } else {
        $('routeInfo').textContent = 'Rute tur tidak dapat dihitung di sini — buka di Google Maps.';
      }
    });
  }

  // ---------- Heatmap kepadatan kuliner ----------
  function toggleHeatmap() {
    if (engine === 'osm' || !map || !window.google || !google.maps.visualization) {
      beriTahu('Heatmap hanya tersedia di mode Google Maps.');
      return;
    }
    heatmapAktif = !heatmapAktif;
    $('btnHeatmap').classList.toggle('active', heatmapAktif);
    if (heatmapAktif) {
      var titik = semuaPenyedia.map(function (p) {
        return new google.maps.LatLng(p.latitude, p.longitude);
      });
      heatmapLayer = new google.maps.visualization.HeatmapLayer({
        data: titik, map: map, radius: 42, opacity: 0.75
      });
    } else if (heatmapLayer) {
      heatmapLayer.setMap(null);
      heatmapLayer = null;
    }
  }

  // ---------- Ulasan ----------
  function muatUlasan(id) {
    var box = $('ulasanList');
    if (!box) return;
    box.innerHTML = '<p class="ulasan-kosong">Memuat ulasan...</p>';
    ambilJSON(API + '?action=ulasan&id=' + id).then(function (res) {
      if (!res.ok || !res.data || !res.data.length) {
        box.innerHTML = '<p class="ulasan-kosong">Belum ada ulasan — jadilah yang pertama!</p>';
        return;
      }
      box.innerHTML = res.data.map(function (u) {
        var s = '';
        for (var i = 1; i <= 5; i++) s += i <= u.rating ? '★' : '☆';
        return '<div class="ulasan-item"><div class="ulasan-head"><strong>' + esc(u.nama) + '</strong>' +
          '<span class="rating-bintang">' + s + '</span></div>' +
          '<p>' + esc(u.komentar) + '</p>' +
          '<small>' + esc(String(u.created_at || '').slice(0, 10)) + '</small></div>';
      }).join('');
    }).catch(function () {
      box.innerHTML = '<p class="ulasan-kosong">Ulasan tidak dapat dimuat.</p>';
    });
  }

  // ---------- Street View ----------
  function toggleStreet(p) {
    var box = $('detailStreet');
    var btn = $('btnStreet');
    if (!box || !btn) return;
    if (engine !== 'google' || !window.google) {
      beriTahu('Street View hanya tersedia di mode Google Maps.');
      return;
    }
    if (!box.hidden) { box.hidden = true; btn.innerHTML = '<i class="fa-solid fa-eye"></i> Lihat Jalan di Depan Tempat Ini'; return; }
    box.hidden = false;
    btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Sembunyikan Street View';
    if (!streetPano || streetUntukId !== p.id_penyedia) {
      streetPano = new google.maps.StreetViewPanorama(box, {
        position: { lat: p.latitude, lng: p.longitude },
        pov: { heading: 0, pitch: 0 },
        zoom: 1, addressControl: false, fullscreenControl: false
      });
      streetUntukId = p.id_penyedia;
    }
  }

  // ---------- Geolokasi ----------
  function mintaLokasi(manual) {
    if (!navigator.geolocation) {
      if (manual) beriTahu('Browser ini tidak mendukung geolokasi.');
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      // Lokasi diketahui: aktifkan filter jarak.
      var selRadius = $('selectRadius');
      if (selRadius) { selRadius.disabled = false; selRadius.title = ''; }
      if (engine === 'osm') {
        tandaiLokasiOsm();
        if (osmMap) osmMap.setView([userLoc.lat, userLoc.lng], 14);
      } else if (map && window.google) {
        if (!userMarker) {
          userMarker = new google.maps.Marker({
            position: userLoc, map: map, title: 'Lokasi kamu',
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#38bdf8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 }
          });
        } else userMarker.setPosition(userLoc);
        map.panTo(userLoc);
      }
      terapkanFilter();
    }, function () {
      if (manual) beriTahu('Izin lokasi ditolak atau tidak tersedia. Rute dihitung dari pusat kota Bandung.');
    }, { timeout: 8000 });
  }

  // ---------- Event ----------
  var tCari = null;
  $('inputCari').addEventListener('input', function (e) {
    $('btnBersihkan').hidden = e.target.value === '';
    clearTimeout(tCari);
    tCari = setTimeout(function () { filter.q = e.target.value.trim(); terapkanFilter(); }, 200);
  });
  $('btnBersihkan').addEventListener('click', function () {
    $('inputCari').value = '';
    $('btnBersihkan').hidden = true;
    filter.q = '';
    terapkanFilter();
    $('inputCari').focus();
  });
  $('selectHarga').addEventListener('change', function (e) {
    filter.maxHarga = e.target.value;
    terapkanFilter();
  });
  $('selectRadius').addEventListener('change', function (e) {
    filter.radiusKm = e.target.value;
    terapkanFilter();
    if (e.target.value !== '' && !userLoc) beriTahu('Aktifkan "Lokasi Saya" dulu untuk filter jarak.');
  });
  $('selectUrut').addEventListener('change', function (e) {
    filter.sort = e.target.value;
    if (e.target.value === 'dekat' && !userLoc) beriTahu('Aktifkan "Lokasi Saya" dulu untuk urutan terdekat.');
    terapkanFilter();
  });
  $('chkHalal').addEventListener('change', function (e) {
    filter.halalSaja = e.target.checked;
    terapkanFilter();
  });
  $('chkBuka').addEventListener('change', function (e) {
    filter.bukaSaja = e.target.checked;
    terapkanFilter();
  });
  $('chipFavorit').addEventListener('click', function () {
    filter.favoritSaja = !filter.favoritSaja;
    this.classList.toggle('active', filter.favoritSaja);
    terapkanFilter();
  });
  function pasangChips(boxId, kunci) {
    var box = $(boxId);
    if (!box) return;
    box.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var tag = chip.getAttribute('data-tag');
        var arr = filter[kunci];
        var i = arr.indexOf(tag);
        if (i === -1) arr.push(tag); else arr.splice(i, 1);
        chip.classList.toggle('active', i === -1);
        terapkanFilter();
      });
    });
  }
  pasangChips('chipFasilitas', 'fasilitas');
  pasangChips('chipPembayaran', 'pembayaran');
  // ---------- Pencarian suara (Web Speech API, Chrome) ----------
  (function pasangSuara() {
    var btn = $('btnSuara');
    if (!btn) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { btn.style.display = 'none'; return; }
    btn.addEventListener('click', function () {
      var rec;
      try { rec = new SR(); } catch (e) { beriTahu('Pencarian suara tidak didukung browser ini.'); return; }
      rec.lang = 'id-ID';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      btn.classList.add('listening');
      btn.title = 'Mendengarkan...';
      rec.onresult = function (ev) {
        var teks = ev.results[0][0].transcript || '';
        $('inputCari').value = teks;
        filter.q = teks.trim();
        terapkanFilter();
      };
      rec.onerror = function () { beriTahu('Suara tidak terdengar — coba lagi.'); };
      rec.onend = function () { btn.classList.remove('listening'); btn.title = 'Cari dengan suara'; };
      try { rec.start(); } catch (e) { btn.classList.remove('listening'); }
    });
  })();
  $('btnHeatmap').addEventListener('click', function () { toggleHeatmap(); });
  $('btnBuatRute').addEventListener('click', function () { buatRuteTur(); });
  $('btnHapusTur').addEventListener('click', function () {
    turStops = [];
    simpanTur();
    renderTurBar();
    terapkanFilter();
    $('routeBar').hidden = true;
    if (directionsRenderer) directionsRenderer.setDirections({ routes: [] });
    if (osmRouteLine && osmMap) { osmMap.removeLayer(osmRouteLine); osmRouteLine = null; }
  });
  $('formUlasan').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = Number(this.dataset.id || 0);
    if (!id) return;
    var nama = $('ulasanNama').value.trim();
    var rating = $('ulasanRating').value;
    var komentar = $('ulasanKomentar').value.trim();
    var stEl = $('ulasanStatus');
    var data = new URLSearchParams();
    data.append('id_penyedia', id);
    data.append('nama', nama);
    data.append('rating', rating);
    data.append('komentar', komentar);
    fetch(API + '?action=tambah_ulasan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: data.toString()
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (stEl) { stEl.hidden = false; stEl.textContent = res.ok ? 'Terima kasih! Ulasanmu sudah tersimpan.' : ('Gagal: ' + (res.error || 'coba lagi')); }
      if (res.ok) {
        $('ulasanNama').value = '';
        $('ulasanKomentar').value = '';
        muatUlasan(id);
        // Segarkan rata-rata di kartu + panel detail
        ambilJSON(API + '?action=detail&id=' + id).then(function (d) {
          if (d.ok) {
            $('ulasanRata').innerHTML = bintangHtml(d.data.rating_avg, d.data.ulasan_count);
            var p = cariPenyedia(id);
            if (p) { p.rating_avg = d.data.rating_avg; p.ulasan_count = d.data.ulasan_count; }
            terapkanFilter();
          }
        }).catch(function () { /* abaikan */ });
      }
    }).catch(function () {
      if (stEl) { stEl.hidden = false; stEl.textContent = 'Gagal mengirim ulasan — periksa koneksi.'; }
    });
  });
  $('btnLokasiSaya').addEventListener('click', function () { mintaLokasi(true); });
  $('btnLokasiFab').addEventListener('click', function () { mintaLokasi(true); });
  $('btnTutupDetail').addEventListener('click', function () {
    $('panelDetail').hidden = true;
    aktifId = null;
    document.querySelectorAll('.card').forEach(function (el) { el.classList.remove('active'); });
  });
  $('routeTutup').addEventListener('click', function () {
    $('routeBar').hidden = true;
    if (directionsRenderer) directionsRenderer.setDirections({ routes: [] });
    if (osmRouteLine && osmMap) { osmMap.removeLayer(osmRouteLine); osmRouteLine = null; }
  });

  // Tanpa key Google Maps: langsung pakai OpenStreetMap (gratis, tanpa billing).
  // Dengan key: coba Google Maps dulu; kalau gagal (mis. billing belum aktif),
  // otomatis beralih ke OpenStreetMap setelah terdeteksi error / 8 detik tanpa respons.
  if (!CFG.mapsKeyReady) {
    initFallbackMap();
  } else {
    fallbackTimer = setTimeout(function () { if (!engine) initFallbackMap(); }, 8000);
  }

  muatAwal();
  renderTurBar();
})();
