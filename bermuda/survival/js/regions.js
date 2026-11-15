/* BERMUDA SURVIVAL — REGION PROFILES
   The map hands a POI (type + name) to the scene; each profile retunes the
   slice: how much jungle, whether the camp or the crash site exists, the
   colour grade and which aliens are in the pool. */
window.REGIONS = (function () {
  'use strict';

  var DEFAULT = {
    kind: 'jungle', name: 'جنگل جزیره', sub: 'پوشش انبوه',
    jungle: 1.25, palms: 1, camp: false, crash: false,
    shoreShift: 0, tint: null, aliens: ['runner', 'brute']
  };

  var BY_TYPE = {
    harbor: { kind: 'harbor', sub: 'اسکله و انبارها', jungle: 0.45, palms: 1.5, camp: false,
      shoreShift: 30, tint: 'rgba(18,44,72,.12)', aliens: ['runner', 'neural'] },
    dock: { kind: 'dock', sub: 'لنگرگاه', jungle: 0.5, palms: 1.6, camp: false,
      shoreShift: 24, tint: 'rgba(18,44,72,.10)', aliens: ['runner', 'jelly'] },
    town: { kind: 'town', sub: 'شهرک اشغال‌شده', jungle: 0.6, palms: 0.9, camp: true,
      tint: 'rgba(64,42,20,.10)', aliens: ['warrior', 'brute'] },
    village: { kind: 'village', sub: 'روستای ساحلی', jungle: 0.8, palms: 1.2, camp: true,
      tint: 'rgba(60,44,24,.08)', aliens: ['warrior', 'runner'] },
    outpost: { kind: 'outpost', sub: 'پادگان فضایی', jungle: 0.85, palms: 0.8, camp: true,
      tint: 'rgba(90,54,30,.10)', aliens: ['warrior', 'bomber', 'runner'] },
    fuel_depot: { kind: 'depot', sub: 'مخازن سوخت', jungle: 0.7, palms: 0.7, camp: true,
      tint: 'rgba(96,58,28,.10)', aliens: ['brute', 'warrior'] },
    radio_tower: { kind: 'tower', sub: 'برج رادیویی', jungle: 0.9, palms: 0.7, camp: true,
      tint: 'rgba(40,50,70,.10)', aliens: ['neural', 'warrior'] },
    radar: { kind: 'radar', sub: 'رادار', jungle: 0.9, palms: 0.7, camp: true,
      tint: 'rgba(40,50,70,.10)', aliens: ['neural', 'runner'] },
    lookout: { kind: 'lookout', sub: 'دیده‌بانی', jungle: 1.0, palms: 0.8, camp: true,
      tint: 'rgba(60,60,40,.06)', aliens: ['runner', 'winged'] },
    alien_camp: { kind: 'alien', sub: 'لانهٔ بیگانه', jungle: 0.9, palms: 0.5, camp: false,
      crash: true, tint: 'rgba(66,20,88,.18)', aliens: ['mage', 'brute', 'warrior'] },
    alien_spire: { kind: 'spire', sub: 'منارهٔ فضایی', jungle: 0.85, palms: 0.5, camp: false,
      crash: true, tint: 'rgba(74,22,96,.20)', aliens: ['mage', 'warlock', 'brute'] },
    alien_crash: { kind: 'crash', sub: 'دهانهٔ سقوط', jungle: 0.95, palms: 0.6, camp: false,
      crash: true, tint: 'rgba(60,18,80,.16)', aliens: ['jelly', 'mutant', 'mage'] },
    ruins: { kind: 'ruins', sub: 'ویرانه‌های معبد', jungle: 1.1, palms: 0.9, camp: false,
      tint: 'rgba(78,68,38,.12)', aliens: ['neural', 'warlock'] },
    airstrip: { kind: 'airstrip', sub: 'باند فرود', jungle: 0.3, palms: 0.6, camp: true,
      tint: 'rgba(40,50,60,.08)', aliens: ['brute', 'warrior', 'bomber'] },
    bridge: { kind: 'bridge', sub: 'پل', jungle: 1.0, palms: 1.0, camp: false,
      tint: 'rgba(20,50,60,.08)', aliens: ['runner', 'jelly'] },
    cave: { kind: 'cave', sub: 'غار', jungle: 1.15, palms: 0.6, camp: false,
      tint: 'rgba(20,16,30,.22)', aliens: ['jelly', 'runner'] },
    mine: { kind: 'mine', sub: 'معدن متروکه', jungle: 0.95, palms: 0.5, camp: false,
      tint: 'rgba(60,48,30,.18)', aliens: ['brute', 'bomber'] },
    waterfall: { kind: 'falls', sub: 'آبشار', jungle: 1.2, palms: 0.9, camp: false,
      tint: 'rgba(20,60,70,.10)', aliens: ['runner', 'jelly'] },
    shipwreck: { kind: 'wreck', sub: 'لاشهٔ کشتی', jungle: 0.6, palms: 1.3, camp: false,
      shoreShift: 20, tint: 'rgba(24,44,56,.12)', aliens: ['jelly', 'winged'] },
    cache: { kind: 'cache', sub: 'مخفیگاه', jungle: 1.05, palms: 1, camp: false,
      tint: 'rgba(40,44,30,.08)', aliens: ['runner', 'winged'] },
    beach_landing: { kind: 'beach', sub: 'ساحل پیاده‌سازی', jungle: 0.7, palms: 1.6, camp: true,
      shoreShift: 10, tint: null, aliens: ['runner', 'jelly'] },
    lighthouse: { kind: 'lighthouse', sub: 'فانوس دریایی', jungle: 0.6, palms: 1.4, camp: false,
      shoreShift: 18, tint: 'rgba(24,48,64,.10)', aliens: ['winged', 'jelly'] }
  };

  // the map uses its own type names; fold them onto the scene profiles
  var ALIAS = {
    alien: 'alien_camp',
    danger: 'alien_crash',
    side: 'outpost',
    main: 'outpost',
    safehouse: 'town',
    shop: 'town',
    workbench: 'town',
    radio: 'radio_tower',
    airport: 'airstrip',
    vehicle: 'lookout',
    locked: 'ruins'
  };

  function copy(o) {
    var out = {}, k;
    for (k in DEFAULT) out[k] = DEFAULT[k];
    for (k in o) out[k] = o[k];
    return out;
  }

  return {
    forType: function (type, name) {
      var key = BY_TYPE[type] ? type : (ALIAS[type] || type);
      var p = copy(BY_TYPE[key] || {});
      p.type = type || 'jungle';
      if (name) p.name = name;
      return p;
    },
    default: function () { return copy({}); }
  };
})();
