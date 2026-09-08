/**
 * CarFox Quick Search sheet.
 * Bottom sheet on mobile, centered modal on desktop. Opened by any element with
 * [data-quick-search] (the bottom nav "Search" tab, desktop header links) or via
 * CarfoxQuickSearch.open(). "Show Results" navigates to /cars.html with the chosen params;
 * "Advanced Filters" carries the same params to /search.html.
 */
(function (global) {
  'use strict';

  var GOVERNORATES = [
    'Cairo', 'Giza', 'Alexandria', 'Qalyubia', 'Sharqia', 'Dakahlia', 'Gharbia', 'Monufia',
    'Beheira', 'Kafr El Sheikh', 'Damietta', 'Port Said', 'Ismailia', 'Suez', 'Faiyum',
    'Beni Suef', 'Minya', 'Asyut', 'Sohag', 'Qena', 'Luxor', 'Aswan', 'Red Sea',
    'New Valley', 'Matrouh', 'North Sinai', 'South Sinai'
  ];

  var state = emptyState();
  var mounted = false;
  var isOpen = false;
  var makesLoaded = false;
  var countTimer = null;
  var els = {};

  function emptyState() {
    return { city: [], make: '', model: '', min_price: null, max_price: null, min_mileage: null, max_mileage: null };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(n) {
    return Number(n).toLocaleString('en-US');
  }

  function parseNum(raw) {
    var v = String(raw || '').replace(/[^0-9]/g, '');
    if (!v) return null;
    var n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  }

  // ---- state <-> URL ----
  function readStateFromUrl() {
    var path = location.pathname;
    if (!/\/cars\.html$|\/search\.html$/.test(path)) return;
    var p = new URLSearchParams(location.search);
    var s = emptyState();
    if (p.has('city')) s.city = p.get('city').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (p.has('make')) {
      var makes = p.get('make').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (makes.length === 1) s.make = makes[0];
    }
    if (s.make && p.has('model')) s.model = p.get('model').trim();
    ['min_price', 'max_price', 'min_mileage', 'max_mileage'].forEach(function (k) {
      if (p.has(k)) s[k] = parseNum(p.get(k));
    });
    state = s;
  }

  function buildParams() {
    var p = new URLSearchParams();
    if (state.city.length) p.set('city', state.city.join(','));
    if (state.make) p.set('make', state.make);
    if (state.make && state.model) p.set('model', state.model);
    if (state.min_price != null) p.set('min_price', String(state.min_price));
    if (state.max_price != null) p.set('max_price', String(state.max_price));
    if (state.min_mileage != null) p.set('min_mileage', String(state.min_mileage));
    if (state.max_mileage != null) p.set('max_mileage', String(state.max_mileage));
    return p;
  }

  // ---- markup ----
  var CSS =
    '#cfqsOverlay{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:200;opacity:0;transition:opacity .2s;}' +
    '#cfqsOverlay.cfqs-show{opacity:1;}' +
    '#cfqsPanel{position:fixed;left:0;right:0;bottom:0;z-index:201;background:#fff;border-radius:20px 20px 0 0;max-height:88vh;display:flex;flex-direction:column;transform:translateY(100%);transition:transform .25s ease;box-shadow:0 -8px 30px rgba(0,0,0,.15);}' +
    '#cfqsPanel.cfqs-show{transform:translateY(0);}' +
    '@media (min-width:768px){#cfqsPanel{left:50%;right:auto;bottom:auto;top:50%;width:520px;max-height:85vh;border-radius:20px;transform:translate(-50%,-50%) scale(.96);opacity:0;}#cfqsPanel.cfqs-show{transform:translate(-50%,-50%) scale(1);opacity:1;}}' +
    '.cfqs-row{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;text-align:left;border-top:1px solid #f1f5f9;background:#fff;}' +
    '.cfqs-row:first-child{border-top:0;}' +
    '.cfqs-row .cfqs-chev{transition:transform .2s;color:#94a3b8;}' +
    '.cfqs-row[aria-expanded="true"] .cfqs-chev{transform:rotate(180deg);color:#1d4ed8;}' +
    '.cfqs-body{display:none;padding:0 20px 16px 20px;background:#f8fafc;border-top:1px solid #f1f5f9;}' +
    '.cfqs-body.cfqs-open{display:block;}' +
    '.cfqs-chip{display:inline-flex;align-items:center;border:1px solid #e2e8f0;background:#fff;border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600;color:#334155;}' +
    '.cfqs-chip[aria-pressed="true"]{background:#1d4ed8;border-color:#1d4ed8;color:#fff;}' +
    '.cfqs-input{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:14px;background:#fff;}' +
    '.cfqs-input:focus{outline:2px solid #93c5fd;border-color:#3b82f6;}';

  function rowHtml(key, title, subId) {
    return (
      '<button type="button" class="cfqs-row" data-row="' + key + '" aria-expanded="false">' +
      '<span><span class="block text-sm font-semibold text-gray-900">' + title + '</span>' +
      '<span id="' + subId + '" class="block text-xs text-gray-500 mt-0.5">—</span></span>' +
      '<svg class="cfqs-chev h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>' +
      '</button>'
    );
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.id = 'cfqsOverlay';
    overlay.hidden = true;
    overlay.addEventListener('click', close);
    document.body.appendChild(overlay);

    var panel = document.createElement('div');
    panel.id = 'cfqsPanel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Quick search');
    panel.innerHTML =
      '<div class="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">' +
      '<button type="button" id="cfqsClear" class="text-sm font-semibold text-blue-700">Clear all</button>' +
      '<h2 class="text-base font-bold text-gray-900">Quick Search</h2>' +
      '<button type="button" id="cfqsClose" class="h-8 w-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Close">' +
      '<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>' +
      '</div>' +
      '<div class="overflow-y-auto flex-1">' +
      rowHtml('region', 'Region', 'cfqsSubRegion') +
      '<div class="cfqs-body" data-body="region"><div id="cfqsRegionChips" class="flex flex-wrap gap-2 pt-3"></div></div>' +
      rowHtml('make', 'Make &amp; Model', 'cfqsSubMake') +
      '<div class="cfqs-body" data-body="make"><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">' +
      '<label class="block"><span class="block text-xs font-semibold text-gray-600 mb-1">Make</span><select id="cfqsMake" class="cfqs-input"><option value="">Any make</option></select></label>' +
      '<label class="block"><span class="block text-xs font-semibold text-gray-600 mb-1">Model</span><select id="cfqsModel" class="cfqs-input" disabled><option value="">Any model</option></select></label>' +
      '</div></div>' +
      rowHtml('price', 'Price', 'cfqsSubPrice') +
      '<div class="cfqs-body" data-body="price"><div class="grid grid-cols-2 gap-3 pt-3">' +
      '<label class="block"><span class="block text-xs font-semibold text-gray-600 mb-1">Min (EGP)</span><input id="cfqsMinPrice" class="cfqs-input" inputmode="numeric" placeholder="No min" /></label>' +
      '<label class="block"><span class="block text-xs font-semibold text-gray-600 mb-1">Max (EGP)</span><input id="cfqsMaxPrice" class="cfqs-input" inputmode="numeric" placeholder="No max" /></label>' +
      '</div></div>' +
      rowHtml('mileage', 'Mileage', 'cfqsSubMileage') +
      '<div class="cfqs-body" data-body="mileage"><div class="grid grid-cols-2 gap-3 pt-3">' +
      '<label class="block"><span class="block text-xs font-semibold text-gray-600 mb-1">Min (km)</span><input id="cfqsMinMileage" class="cfqs-input" inputmode="numeric" placeholder="No min" /></label>' +
      '<label class="block"><span class="block text-xs font-semibold text-gray-600 mb-1">Max (km)</span><input id="cfqsMaxMileage" class="cfqs-input" inputmode="numeric" placeholder="No max" /></label>' +
      '</div></div>' +
      '</div>' +
      '<div class="px-5 pt-3 pb-4 border-t border-gray-100" style="padding-bottom:calc(1rem + env(safe-area-inset-bottom))">' +
      '<button type="button" id="cfqsShow" class="w-full rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-base font-bold py-3.5">Show Results</button>' +
      '<a id="cfqsAdvanced" href="/search.html" class="block text-center text-sm font-semibold text-blue-700 mt-3">Advanced Filters</a>' +
      '</div>';
    document.body.appendChild(panel);

    els = {
      overlay: overlay,
      panel: panel,
      regionChips: panel.querySelector('#cfqsRegionChips'),
      make: panel.querySelector('#cfqsMake'),
      model: panel.querySelector('#cfqsModel'),
      minPrice: panel.querySelector('#cfqsMinPrice'),
      maxPrice: panel.querySelector('#cfqsMaxPrice'),
      minMileage: panel.querySelector('#cfqsMinMileage'),
      maxMileage: panel.querySelector('#cfqsMaxMileage'),
      show: panel.querySelector('#cfqsShow'),
      advanced: panel.querySelector('#cfqsAdvanced'),
      subRegion: panel.querySelector('#cfqsSubRegion'),
      subMake: panel.querySelector('#cfqsSubMake'),
      subPrice: panel.querySelector('#cfqsSubPrice'),
      subMileage: panel.querySelector('#cfqsSubMileage')
    };

    // Region chips
    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'cfqs-chip';
    all.textContent = 'All regions';
    all.setAttribute('data-region-all', '1');
    all.addEventListener('click', function () { state.city = []; renderRegion(); afterChange(); });
    els.regionChips.appendChild(all);
    GOVERNORATES.forEach(function (g) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cfqs-chip';
      b.textContent = g;
      b.setAttribute('data-region', g);
      b.addEventListener('click', function () {
        var i = state.city.indexOf(g);
        if (i === -1) state.city.push(g); else state.city.splice(i, 1);
        renderRegion();
        afterChange();
      });
      els.regionChips.appendChild(b);
    });

    // Accordion rows
    panel.querySelectorAll('.cfqs-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var key = row.getAttribute('data-row');
        var open = row.getAttribute('aria-expanded') === 'true';
        panel.querySelectorAll('.cfqs-row').forEach(function (r) { r.setAttribute('aria-expanded', 'false'); });
        panel.querySelectorAll('.cfqs-body').forEach(function (b) { b.classList.remove('cfqs-open'); });
        if (!open) {
          row.setAttribute('aria-expanded', 'true');
          panel.querySelector('.cfqs-body[data-body="' + key + '"]').classList.add('cfqs-open');
        }
      });
    });

    els.make.addEventListener('change', function () {
      state.make = els.make.value;
      state.model = '';
      loadModels(state.make);
      afterChange();
    });
    els.model.addEventListener('change', function () { state.model = els.model.value; afterChange(); });
    [['minPrice', 'min_price'], ['maxPrice', 'max_price'], ['minMileage', 'min_mileage'], ['maxMileage', 'max_mileage']].forEach(function (pair) {
      var el = els[pair[0]];
      el.addEventListener('input', function () {
        var digits = el.value.replace(/[^0-9]/g, '');
        if (el.value !== digits) el.value = digits;
        state[pair[1]] = parseNum(digits);
        afterChange();
      });
      el.addEventListener('blur', function () { if (state[pair[1]] != null) el.value = fmt(state[pair[1]]); });
      el.addEventListener('focus', function () { el.value = el.value.replace(/,/g, ''); });
    });

    panel.querySelector('#cfqsClear').addEventListener('click', function () {
      state = emptyState();
      syncInputs();
      loadModels('');
      afterChange();
    });
    panel.querySelector('#cfqsClose').addEventListener('click', close);
    els.show.addEventListener('click', function () {
      var qs = buildParams().toString();
      location.href = '/cars.html' + (qs ? '?' + qs : '');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) close(); });
  }

  function renderRegion() {
    els.regionChips.querySelectorAll('[data-region]').forEach(function (b) {
      b.setAttribute('aria-pressed', state.city.indexOf(b.getAttribute('data-region')) !== -1 ? 'true' : 'false');
    });
    els.regionChips.querySelector('[data-region-all]').setAttribute('aria-pressed', state.city.length ? 'false' : 'true');
  }

  function syncInputs() {
    renderRegion();
    els.make.value = state.make || '';
    els.minPrice.value = state.min_price != null ? fmt(state.min_price) : '';
    els.maxPrice.value = state.max_price != null ? fmt(state.max_price) : '';
    els.minMileage.value = state.min_mileage != null ? fmt(state.min_mileage) : '';
    els.maxMileage.value = state.max_mileage != null ? fmt(state.max_mileage) : '';
  }

  function updateSubtitles() {
    els.subRegion.textContent = state.city.length
      ? (state.city.length <= 2 ? state.city.join(', ') : state.city.length + ' regions')
      : 'All regions';
    els.subMake.textContent = state.make ? state.make + (state.model ? ' ' + state.model : ' · any model') : 'Any make or model';
    els.subPrice.textContent = (state.min_price != null ? fmt(state.min_price) : 'No min') + ' – ' + (state.max_price != null ? fmt(state.max_price) : 'no max') + (state.min_price != null || state.max_price != null ? ' EGP' : '');
    els.subMileage.textContent = (state.min_mileage != null ? fmt(state.min_mileage) : 'No min') + ' – ' + (state.max_mileage != null ? fmt(state.max_mileage) : 'no max') + (state.min_mileage != null || state.max_mileage != null ? ' km' : '');
    var qs = buildParams().toString();
    els.advanced.href = '/search.html' + (qs ? '?' + qs : '');
  }

  function updateCount() {
    clearTimeout(countTimer);
    countTimer = setTimeout(function () {
      var qs = buildParams().toString();
      fetch('/api/cars/count' + (qs ? '?' + qs : ''))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || typeof d.total !== 'number') return;
          els.show.textContent = 'Show ' + fmt(d.total) + ' Result' + (d.total === 1 ? '' : 's');
        })
        .catch(function () {});
    }, 250);
  }

  function afterChange() {
    updateSubtitles();
    updateCount();
  }

  function loadMakes() {
    if (makesLoaded) return Promise.resolve();
    return fetch('/api/car-data/makes')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        (d.makes || []).forEach(function (m) {
          var o = document.createElement('option');
          o.value = m;
          o.textContent = m;
          els.make.appendChild(o);
        });
        makesLoaded = true;
        els.make.value = state.make || '';
      })
      .catch(function () {});
  }

  function loadModels(make) {
    els.model.innerHTML = '<option value="">Any model</option>';
    els.model.disabled = !make;
    if (!make) return;
    fetch('/api/car-data/models?make=' + encodeURIComponent(make))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        (d.models || []).forEach(function (m) {
          var o = document.createElement('option');
          o.value = m;
          o.textContent = m;
          els.model.appendChild(o);
        });
        els.model.value = state.model || '';
      })
      .catch(function () {});
  }

  function open() {
    mount();
    readStateFromUrl();
    syncInputs();
    loadMakes().then(function () { syncInputs(); loadModels(state.make); });
    afterChange();
    els.overlay.hidden = false;
    els.panel.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () {
      els.overlay.classList.add('cfqs-show');
      els.panel.classList.add('cfqs-show');
    });
    isOpen = true;
  }

  function close() {
    if (!mounted || !isOpen) return;
    els.overlay.classList.remove('cfqs-show');
    els.panel.classList.remove('cfqs-show');
    document.body.style.overflow = '';
    isOpen = false;
    setTimeout(function () {
      if (!isOpen) { els.overlay.hidden = true; els.panel.hidden = true; }
    }, 260);
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest ? e.target.closest('[data-quick-search]') : null;
    if (!trigger) return;
    e.preventDefault();
    open();
  });

  global.CarfoxQuickSearch = { open: open, close: close, GOVERNORATES: GOVERNORATES };
})(typeof window !== 'undefined' ? window : this);
