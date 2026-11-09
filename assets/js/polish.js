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

  // ---------- Toggle Peta / Daftar (layar kecil) ----------
  function pasangViewToggle() {
    var toggle = document.getElementById('viewToggle');
    var list = document.getElementById('daftarPenyedia');
    if (!toggle) return;
    var mqMobile = window.matchMedia('(max-width: 900px)');
    function setView(v) {
      document.body.setAttribute('data-mobile-view', v);
      toggle.querySelectorAll('button').forEach(function (b) {
        var aktif = b.getAttribute('data-view') === v;
        b.classList.toggle('active', aktif);
        b.setAttribute('aria-selected', aktif ? 'true' : 'false');
      });
    }
    toggle.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-view]') : null;
      if (btn) setView(btn.getAttribute('data-view'));
    });
    // Klik kartu di mode Daftar (HP): pindah ke mode Peta supaya panel detail terlihat.
    if (list) {
      list.addEventListener('click', function () {
        if (mqMobile.matches && document.body.getAttribute('data-mobile-view') === 'list') setView('map');
      });
    }
    setView('map');
  }

  // ---------- Toast (dipakai app.js sebagai pengganti alert) ----------
  function pasangToast() {
    var toastEl = document.getElementById('toast');
    if (!toastEl) return;
    var timer = null;
    window.__foodmapToast = function (pesan) {
      toastEl.textContent = pesan;
      toastEl.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
    };
  }

  // ---------- Shortcut keyboard: "/" fokus cari, Esc bersihkan ----------
  function pasangShortcut() {
    var input = document.getElementById('inputCari');
    if (!input) return;
    document.addEventListener('keydown', function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      var sedangMengetik = /^(INPUT|TEXTAREA|SELECT)$/.test(tag);
      if (e.key === '/' && !sedangMengetik) {
        e.preventDefault();
        input.focus();
      } else if (e.key === 'Escape' && document.activeElement === input) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.blur();
      }
    });
  }

  muatStatistik();
  pasangTilt();
  pasangViewToggle();
  pasangToast();
  pasangShortcut();
})();
