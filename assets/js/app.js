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
  var filter = { q: '', kategori: 'Semua', maxHarga: '' };

  // ---------- Util ----------
  function $(id) { return document.getElementById(id); }
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
    if (filter.q) {
      var q = filter.q.toLowerCase();
      var hay = (p.nama_penyedia + ' ' + (p.alamat || '') + ' ' + p.kategori).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function terapkanFilter() {
    var hasil = semuaPenyedia.filter(cocokFilter);
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
      return '<button class="card' + (p.id_penyedia === aktifId ? ' active' : '') + '" data-id="' + p.id_penyedia + '">' +
        '<img src="' + esc(p.foto || '') + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="card-info">' +
          '<h3>' + esc(p.nama_penyedia) + '</h3>' +
          '<span class="card-cat" style="background:' + warnaKategori(p) + '">' + esc(p.kategori) + '</span><br>' +
          '<span class="card-alamat"><i class="fa-solid fa-location-dot"></i> ' + esc(p.alamat || '') + '</span>' +
          '<span class="card-meta">' +
            '<span>Mulai <b>' + rupiah(p.harga_termurah) + '</b></span>' +
            '<span><i class="fa-solid fa-bowl-food"></i> ' + p.jumlah_menu + ' menu</span>' +
            (j ? '<span><i class="fa-solid fa-road"></i> ' + j + '</span>' : '') +
            (st.buka === null ? '' : '<span class="' + (st.buka ? 'buka' : 'tutup') + '">' + (st.buka ? '● Buka' : '● Tutup') + '</span>') +
          '</span>' +
        '</span></button>';
    }).join('');
    box.querySelectorAll('.card').forEach(function (el) {
      el.addEventListener('click', function () { pilihPenyedia(Number(el.getAttribute('data-id'))); });
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

  // ---------- Geolokasi ----------
  function mintaLokasi(manual) {
    if (!navigator.geolocation) {
      if (manual) alert('Browser ini tidak mendukung geolokasi.');
      return;
    }
    navigator.geolocation.getCurrentPosition(function (pos) {
      userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
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
      if (manual) alert('Izin lokasi ditolak atau tidak tersedia. Rute dihitung dari pusat kota Bandung.');
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
})();
