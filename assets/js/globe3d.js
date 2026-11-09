/* ============================================================
   FoodMap GIS — Globe 3D (Three.js r128)
   Dikembangkan oleh King Faisal
   Satu canvas, satu konteks WebGL. Titik penyedia diambil dari
   api.php (bukan statis). Semua penyedia ada di Bandung dengan
   rentang koordinat yang sangat kecil, jadi posisinya dipetakan
   secara skematis (diperlebar) ke sepetak globe di sekitar
   Indonesia agar titik-titiknya terlihat — ini widget visual,
   bukan peta ukur. Klik titik = klik kartu penyedia di daftar.
   Gaya visual: bersih & rapi — bola gelap halus, garis lintang/
   bujur tipis, glow atmosfer, titik bercahaya, partikel redup.
   ============================================================ */
(function () {
  'use strict';

  var wrap = document.getElementById('globeWrap');
  var canvas = document.getElementById('globe3d');
  if (!wrap || !canvas) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Three.js gagal dimuat (CDN diblokir / offline): sembunyikan globe.
  if (typeof THREE === 'undefined') {
    wrap.classList.add('no-3d');
    wrap.querySelector('.globe-caption').textContent =
      'Mode 3D tidak tersedia — periksa koneksi internet, lalu muat ulang.';
    return;
  }

  var W = 0, H = 0;
  var renderer, scene, camera, globeGroup, dotsGroup, raycaster, pointer;
  var rotY = 0.6, rotX = 0.35, targetRotY = 0.6, targetRotX = 0.35;
  var dragging = false, lastX = 0, lastY = 0, moved = 0;
  var visible = true, running = false, rafId = null;
  var providers = [];
  var dotMeshes = [];
  var glowTex = null;

  function size() {
    W = wrap.clientWidth || 340;
    H = wrap.clientHeight || 220;
    if (renderer) {
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
    }
  }

  function latLngToVec(lat, lng, r, latMin, latMax, lngMin, lngMax) {
    // Petakan bbox Bandung ke sepetak globe ~55° di sekitar Indonesia.
    var tLat = (latMax > latMin) ? (lat - latMin) / (latMax - latMin) : 0.5;
    var tLng = (lngMax > lngMin) ? (lng - lngMin) / (lngMax - lngMin) : 0.5;
    var phi = ((-6.9 + (0.5 - tLat) * 55) * Math.PI) / 180; // lintang pusat -6.9
    var theta = ((107.6 + (tLng - 0.5) * 55) * Math.PI) / 180; // bujur pusat 107.6
    return new THREE.Vector3(
      -r * Math.cos(phi) * Math.cos(theta),
      r * Math.sin(phi),
      r * Math.cos(phi) * Math.sin(theta)
    );
  }

  /** Tekstur glow radial (putih) — diwarnai lewat warna material sprite. */
  function makeGlowTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  /** Lingkaran garis tipis (untuk garis lintang & bujur). */
  function circleLine(radius, color, opacity) {
    var pts = [];
    for (var i = 0; i <= 96; i++) {
      var a = (i / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
    }
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({
      color: color, transparent: true, opacity: opacity
    }));
  }

  function buildScene() {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.35, 3.6);
    camera.lookAt(0, 0, 0);
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    glowTex = makeGlowTexture();

    globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // Glow atmosfer di belakang globe
    var atmo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x00b4d8, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    atmo.scale.set(3.6, 3.6, 1);
    globeGroup.add(atmo);

    // Bola utama: gelap halus (tanpa wireframe padat — itu yang bikin ramai)
    var globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x0d1b33 })
    );
    globeGroup.add(globe);

    // Garis bujur: 8 meridian tipis, rapi
    for (var m = 0; m < 8; m++) {
      var meridian = circleLine(1.002, 0x00b4d8, 0.16);
      meridian.rotation.y = (m / 8) * Math.PI;
      globeGroup.add(meridian);
    }
    // Garis lintang: 5 garis tipis, khatulistiwa sedikit lebih terang
    [-0.6, -0.3, 0, 0.3, 0.6].forEach(function (y) {
      var r = Math.sqrt(1 - y * y);
      var lat = circleLine(r, 0x00b4d8, y === 0 ? 0.3 : 0.14);
      lat.rotation.x = Math.PI / 2;
      lat.position.y = y;
      globeGroup.add(lat);
    });

    // Partikel redup di sekitar globe (lebih sedikit & lebih halus)
    var pCount = 60, pos = new Float32Array(pCount * 3);
    for (var j = 0; j < pCount; j++) {
      var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      var rr = 1.6 + Math.random() * 0.8;
      pos[j * 3] = rr * Math.sin(ph) * Math.cos(th);
      pos[j * 3 + 1] = rr * Math.cos(ph);
      pos[j * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
    }
    var pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    globeGroup.add(new THREE.Points(pGeo, new THREE.PointsMaterial({
      color: 0x90e0ef, size: 0.02, transparent: true, opacity: 0.45
    })));

    dotsGroup = new THREE.Group();
    globeGroup.add(dotsGroup);

    globeGroup.rotation.set(rotX, rotY, 0);
    size();
  }

  function plotDots() {
    // Hapus titik lama
    while (dotsGroup.children.length) dotsGroup.remove(dotsGroup.children[0]);
    dotMeshes = [];
    if (!providers.length) return;
    var lats = providers.map(function (p) { return p.latitude; });
    var lngs = providers.map(function (p) { return p.longitude; });
    var latMin = Math.min.apply(null, lats), latMax = Math.max.apply(null, lats);
    var lngMin = Math.min.apply(null, lngs), lngMax = Math.max.apply(null, lngs);
    providers.forEach(function (p) {
      var warna = new THREE.Color(p.warna || '#00b4d8');
      var v = latLngToVec(p.latitude, p.longitude, 1.02, latMin, latMax, lngMin, lngMax);
      // Titik: bola kecil warna kategori + inti putih mungil
      var dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.038, 12, 12),
        new THREE.MeshBasicMaterial({ color: warna })
      );
      dot.position.copy(v);
      dot.userData.id = p.id_penyedia;
      dotsGroup.add(dot);
      dotMeshes.push(dot);
      // Glow lembut di sekeliling titik (sprite, bukan cincin — lebih rapi)
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: warna, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      glow.scale.set(0.22, 0.22, 1);
      glow.position.copy(v);
      dotsGroup.add(glow);
    });
  }

  function render() {
    if (!reduceMotion) {
      if (!dragging) targetRotY += 0.0016; // putar otomatis pelan
      rotY += (targetRotY - rotY) * 0.08;
      rotX += (targetRotX - rotX) * 0.08;
      globeGroup.rotation.set(rotX, rotY, 0);
    }
    renderer.render(scene, camera);
  }

  function loop() {
    if (!running) return;
    render();
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running || !visible) return;
    running = true;
    if (reduceMotion) { render(); running = false; return; }
    loop();
  }

  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ---------- Interaksi ----------
  function setPointer(e) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  canvas.addEventListener('pointerdown', function (e) {
    dragging = true; moved = 0;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = e.clientX; lastY = e.clientY;
    targetRotY += dx * 0.006;
    targetRotX = Math.max(-0.9, Math.min(0.9, targetRotX + dy * 0.004));
  });
  canvas.addEventListener('pointerup', function (e) {
    dragging = false;
    if (moved < 6) { // klik, bukan geser — cari titik yang diklik
      setPointer(e);
      raycaster.setFromCamera(pointer, camera);
      var hit = raycaster.intersectObjects(dotMeshes);
      if (hit.length) {
        var id = hit[0].object.userData.id;
        var card = document.querySelector('.card[data-id="' + id + '"]');
        if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); card.click(); }
      }
    }
  });

  // ---------- Siklus hidup: hemat baterai ----------
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }, { threshold: 0.1 }).observe(wrap);
  }
  window.addEventListener('resize', size);

  // ---------- Jalan ----------
  buildScene();
  fetch('api.php?action=list')
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res.ok && res.data) { providers = res.data; plotDots(); }
    })
    .catch(function () { /* globe tetap tampil tanpa titik */ });
  start();
})();
