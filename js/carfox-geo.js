/**
 * Approximate centre points for Egypt's governorates (capital city), used to default a
 * dealer's map pin before they drag it, and to centre the public profile map when no pin
 * has been saved yet.
 */
(function (global) {
  'use strict';

  var GOVERNORATE_CENTROIDS = {
    'Cairo': [30.0444, 31.2357],
    'Giza': [30.0131, 31.2089],
    'Alexandria': [31.2001, 29.9187],
    'Qalyubia': [30.4098, 31.2143],
    'Sharqia': [30.5877, 31.5020],
    'Dakahlia': [31.0409, 31.3785],
    'Gharbia': [30.7865, 31.0004],
    'Monufia': [30.5586, 30.9876],
    'Beheira': [31.0341, 30.4682],
    'Kafr El Sheikh': [31.1107, 30.9388],
    'Damietta': [31.4165, 31.8133],
    'Port Said': [31.2653, 32.3019],
    'Ismailia': [30.5965, 32.2715],
    'Suez': [29.9668, 32.5498],
    'Faiyum': [29.3084, 30.8428],
    'Beni Suef': [29.0661, 31.0994],
    'Minya': [28.1099, 30.7503],
    'Asyut': [27.1783, 31.1859],
    'Sohag': [26.5591, 31.6957],
    'Qena': [26.1551, 32.7160],
    'Luxor': [25.6872, 32.6396],
    'Aswan': [24.0889, 32.8998],
    'Red Sea': [27.2579, 33.8116],
    'New Valley': [25.4390, 30.5586],
    'Matrouh': [31.3543, 27.2373],
    'North Sinai': [31.1313, 33.8003],
    'South Sinai': [28.2397, 33.6220]
  };
  var EGYPT_CENTER = [26.8, 30.8];

  function centroidFor(governorate) {
    if (!governorate) return null;
    var key = String(governorate).trim();
    if (GOVERNORATE_CENTROIDS[key]) return GOVERNORATE_CENTROIDS[key].slice();
    var lower = key.toLowerCase();
    for (var name in GOVERNORATE_CENTROIDS) {
      if (name.toLowerCase() === lower) return GOVERNORATE_CENTROIDS[name].slice();
    }
    return null;
  }

  function isInEgypt(lat, lng) {
    return isFinite(lat) && isFinite(lng) && lat >= 21 && lat <= 32.5 && lng >= 24 && lng <= 37;
  }

  global.CarfoxGeo = {
    GOVERNORATE_CENTROIDS: GOVERNORATE_CENTROIDS,
    EGYPT_CENTER: EGYPT_CENTER,
    centroidFor: centroidFor,
    isInEgypt: isInEgypt
  };
})(typeof window !== 'undefined' ? window : this);
