/* ============================================================================
   Everything Zanzibar — client hydration (Phase 3)
   Loaded with `defer`, runs AFTER the pre-rendered HTML has painted. It does
   NOT re-render content (that stays static + crawlable) — it only enhances it:
     1) WhatsApp concierge string builders   (data-wa-text)
     2) Hub search + category filtering        (#ssg-search / [data-filter])
     3) Pax calculator on experience pages     ([data-booking])
   ============================================================================ */
(function () {
  'use strict';
  var WA = document.body.getAttribute('data-wa') || '255764317595';
  function openWA(text){ window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(text), '_blank', 'noopener'); }

  /* 1) WhatsApp builders — delegated so it also covers detail-page CTAs */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-wa-text]'); if (!b) return;
    e.preventDefault(); openWA(b.getAttribute('data-wa-text'));
  });

  /* 2) Hub search + category filter over the pre-rendered cards */
  var search = document.getElementById('ssg-search');
  var cards  = Array.prototype.slice.call(document.querySelectorAll('[data-card]'));
  var empty  = document.querySelector('.empty');
  var activeCat = '';
  function applyFilter() {
    var q = ((search && search.value) || '').trim().toLowerCase(), shown = 0;
    cards.forEach(function (c) {
      var name = c.getAttribute('data-name') || '', cat = c.getAttribute('data-cat') || '';
      var ok = (!q || name.indexOf(q) > -1) && (!activeCat || cat === activeCat);
      c.hidden = !ok; if (ok) shown++;
    });
    if (empty) empty.hidden = shown > 0;
  }
  if (search) search.addEventListener('input', applyFilter);
  Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (p) {
    p.addEventListener('click', function () {
      activeCat = p.getAttribute('data-filter') || '';
      document.querySelectorAll('[data-filter]').forEach(function (x) { x.classList.toggle('on', x === p); });
      applyFilter();
    });
  });

  /* 3) Pax calculator on experience detail pages (mirrors the main booking flow) */
  var mount = document.querySelector('[data-booking]');
  if (mount) {
    var prices = {}; try { prices = JSON.parse(mount.getAttribute('data-prices') || '{}'); } catch (e) {}
    var name = mount.getAttribute('data-booking'), pax = 1;
    mount.innerHTML =
      '<div class="pax"><label>Participants</label>' +
      '<button type="button" data-step="-1" aria-label="fewer">&minus;</button>' +
      '<span id="pax-n">1</span><button type="button" data-step="1" aria-label="more">+</button>' +
      '<strong id="pax-total"></strong></div>' +
      '<label>Lead traveller<input id="pax-name" type="text" placeholder="Full name"></label>' +
      '<label>Experience date<input id="pax-date" type="date"></label>' +
      '<label>Phone (country code)<input id="pax-phone" type="tel" inputmode="tel" placeholder="+255 7XX XXX XXX"></label>' +
      '<button type="button" id="pax-book" class="btn-primary">Book Experience &rarr;</button>';
    function rateFor(p) {
      var tier = p <= 1 ? 'single' : p === 2 ? 'double' : p === 3 ? 'triple' : 'group';
      var chain = { single:['single'], double:['double','single'], triple:['triple','double','single'], group:['group','triple','double','single'] };
      var seq = chain[tier]; for (var i = 0; i < seq.length; i++) { if (typeof prices[seq[i]] === 'number') return prices[seq[i]]; } return null;
    }
    function upd() {
      var r = rateFor(pax), tot = r === null ? null : r * pax;
      document.getElementById('pax-n').textContent = pax;
      document.getElementById('pax-total').textContent = tot === null ? 'On request' : '= $' + tot;
      return tot;
    }
    mount.addEventListener('click', function (e) {
      var s = e.target.closest('[data-step]'); if (!s) return;
      pax = Math.max(1, Math.min(40, pax + parseInt(s.getAttribute('data-step'), 10))); upd();
    });
    document.getElementById('pax-book').addEventListener('click', function () {
      var nm = (document.getElementById('pax-name').value || '').trim();
      var dt = document.getElementById('pax-date').value;
      var ph = (document.getElementById('pax-phone').value || '').trim();
      if (!nm || !dt || ph.replace(/[^0-9]/g, '').length < 8) { alert('Please add your name, an experience date and a valid phone number with country code.'); return; }
      var tot = upd();
      // Optional: if backend/ez-api.js is also loaded on this page, persist to the
      // private reservations table FIRST (same "save-before-WhatsApp" guarantee):
      try { if (window.EZ && window.EZ_READY && EZ.reservations) EZ.reservations.create({ name:nm, contact:ph, date:dt, activity:name, pax:pax, total:tot, assets:'Activity: '+name+' × '+pax+' pax', type:'Activity' }); } catch (e) {}
      openWA('*EVERYTHING ZANZIBAR — RESERVATION CONFIRMATION*\n*Experience:* ' + name +
        '\n*Guest:* ' + nm + '\n*Phone:* ' + ph + '\n*Date:* ' + dt + '\n*Participants:* ' + pax + ' pax\n' +
        (tot === null ? '*Total:* On request' : '*Total due:* $' + tot) +
        '\n\nPlease confirm this reservation and share payment details to lock it in.');
    });
    upd();
  }
})();
