/* ============================================================
   FoodMap GIS — Polish visual (tanpa Three.js)
   Dikembangkan oleh King Faisal
   - Statistik count-up (data dari api.php, bukan statis)
   - Tilt kartu penyedia saat hover (pointer halus saja)
   Hormat prefers-reduced-motion: semua animasi dimatikan.
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;

  // ---------- Statistik count-up ----------
  function countUp(el, target) {
    if (!el) return;
    if (reduceMotion) { el.textContent = target; return; }
    var start = null, dur = 900;
    function step(ts) {
      if (!start) start = ts;
      var t = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function muatStatistik() {
    var elP = document.getElementById('statPenyedia');
    var elM = document.getElementById('statMenu');
    var elK = document.getElementById('statKategori');
    if (!elP && !elM && !elK) return;
    Promise.all([
      fetch('api.php?action=list').then(function (r) { return r.json(); }).catch(function () { return { ok: false, data: [] }; }),
      fetch('api.php?action=kategori').then(function (r) { return r.json(); }).catch(function () { return { ok: false, data: [] }; })
    ]).then(function (hasil) {
      var list = hasil[0], kat = hasil[1];
      var penyedia = (list.ok && list.data) ? list.data.length : 0;
      var menu = 0;
      if (list.ok && list.data) {
        list.data.forEach(function (p) { menu += Number(p.jumlah_menu) || 0; });
      }
      var kategori = (kat.ok && kat.data) ? kat.data.length : 0;
      countUp(elP, penyedia);
      countUp(elM, menu);
      countUp(elK, kategori);
    });
  }

  // ---------- Tilt kartu ----------
  function pasangTilt() {
    var list = document.getElementById('daftarPenyedia');
    if (!list || reduceMotion || !finePointer) return;
    list.addEventListener('pointermove', function (e) {
      var card = e.target.closest ? e.target.closest('.card') : null;
      if (!card) return;
      var r = card.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform =
        'translateY(-2px) perspective(600px) rotateX(' + (-py * 5).toFixed(2) + 'deg) rotateY(' + (px * 5).toFixed(2) + 'deg)';
    });
    list.addEventListener('pointerout', function (e) {
      var card = e.target.closest ? e.target.closest('.card') : null;
      if (card) card.style.transform = '';
    });
  }

  muatStatistik();
  pasangTilt();
})();
