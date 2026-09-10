/**
 * CarFox Quick Search entry point.
 *
 * The quick search is a full page (/quick-search.html) with one URL per step so the browser
 * back button walks back through the flow. Any element with [data-quick-search] (the bottom
 * nav "Search" tab, desktop header links) opens it, carrying the current listing filters over
 * when the user is already on the results or advanced-filters page.
 *
 * Also exports the canonical governorate order used by the region list and search.html.
 */
(function (global) {
  'use strict';

  var GOVERNORATES = [
    'Cairo', 'Giza', 'Alexandria', 'Qalyubia', 'Sharqia', 'Dakahlia', 'Gharbia', 'Monufia',
    'Beheira', 'Kafr El Sheikh', 'Damietta', 'Port Said', 'Ismailia', 'Suez', 'Faiyum',
    'Beni Suef', 'Minya', 'Asyut', 'Sohag', 'Qena', 'Luxor', 'Aswan', 'Red Sea',
    'New Valley', 'Matrouh', 'North Sinai', 'South Sinai'
  ];
  var CARRY = ['city', 'make', 'model', 'min_price', 'max_price', 'min_mileage', 'max_mileage'];

  function entryUrl() {
    var url = '/quick-search.html';
    if (/\/(cars|search)\.html$/.test(location.pathname)) {
      var p = new URLSearchParams(location.search);
      var out = new URLSearchParams();
      CARRY.forEach(function (k) { if (p.has(k) && p.get(k) !== '') out.set(k, p.get(k)); });
      var qs = out.toString();
      if (qs) url += '?' + qs;
    }
    return url;
  }

  function open() {
    location.href = entryUrl();
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest ? e.target.closest('[data-quick-search]') : null;
    if (!trigger) return;
    if (/\/quick-search\.html$/.test(location.pathname)) { e.preventDefault(); return; }
    e.preventDefault();
    open();
  });

  global.CarfoxQuickSearch = { open: open, entryUrl: entryUrl, GOVERNORATES: GOVERNORATES };
})(typeof window !== 'undefined' ? window : this);
