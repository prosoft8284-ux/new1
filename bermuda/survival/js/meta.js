/* BERMUDA SURVIVAL — META PROGRESSION
   Salvage, permanent weapon unlocks, workbench upgrades, cache claims and the
   small set of flags shared by the map page and the game. Everything rides on
   the existing SAVE store so a single localStorage key holds the profile. */
window.META = (function () {
  'use strict';

  function S() { return window.SAVE; }
  function get(k, d) { return S() ? S().get(k, d) : d; }
  function set(k, v) { return S() ? S().set(k, v) : v; }

  var WEAPON_COST = { rifle: 0, shotgun: 140, plasma: 300 };
  var WEAPON_LABEL = { rifle: 'تفنگ تهاجمی', shotgun: 'شاتگان ساحلی', plasma: 'تفنگ پلاسما' };
  var UPGRADES = {
    dmg: { name: 'قدرت آتش', max: 5, base: 90, step: 0.08, desc: 'هر سطح ۸٪ آسیب بیشتر' },
    hp: { name: 'زره بدنی', max: 5, base: 80, step: 12, desc: 'هر سطح ۱۲ جان بیشتر' },
    spd: { name: 'چابکی', max: 5, base: 70, step: 0.04, desc: 'هر سطح ۴٪ سرعت بیشتر' }
  };

  function salvage() { return get('salvage', 0) | 0; }
  function addSalvage(n) {
    var v = Math.max(0, salvage() + Math.round(n));
    set('salvage', v);
    return v;
  }
  function spend(n) {
    if (salvage() < n) return false;
    set('salvage', salvage() - n);
    return true;
  }

  function weapons() {
    var w = get('wpn', null) || {};
    if (!w.rifle) w.rifle = true;              // the rifle is the starter kit
    return w;
  }
  function isUnlocked(key) { return !!weapons()[key]; }
  function unlockWeapon(key) {
    if (isUnlocked(key)) return true;
    var cost = WEAPON_COST[key];
    if (cost == null) return false;
    if (!spend(cost)) return false;
    var w = weapons(); w[key] = true; set('wpn', w);
    return true;
  }
  function weaponList() {
    return Object.keys(WEAPON_COST).map(function (k) {
      return { key: k, name: WEAPON_LABEL[k], cost: WEAPON_COST[k], owned: isUnlocked(k) };
    });
  }

  function upgrades() {
    var u = get('upg', null) || {};
    return { dmg: u.dmg | 0, hp: u.hp | 0, spd: u.spd | 0 };
  }
  function upgradeLevel(stat) { return upgrades()[stat] || 0; }
  function upgradeCost(stat) {
    var d = UPGRADES[stat];
    return d.base * (upgradeLevel(stat) + 1);
  }
  function buyUpgrade(stat) {
    var d = UPGRADES[stat];
    if (!d) return false;
    var lvl = upgradeLevel(stat);
    if (lvl >= d.max) return false;
    if (!spend(upgradeCost(stat))) return false;
    var u = upgrades(); u[stat] = lvl + 1; set('upg', u);
    return true;
  }
  function upgradeBonus() {
    var u = upgrades();
    return {
      dmg: 1 + u.dmg * UPGRADES.dmg.step,
      hp: u.hp * UPGRADES.hp.step,
      spd: 1 + u.spd * UPGRADES.spd.step
    };
  }

  /* one-time supply caches: a region pays out once */
  function claimed(id) { return !!get('cache:' + id, false); }
  function claimCache(id) {
    if (claimed(id)) return 0;
    set('cache:' + id, true);
    var gain = 45;
    addSalvage(gain);
    return gain;
  }

  function liberatedCount() { return get('liberatedCount', 0) | 0; }
  function poiTotal() { return get('poiTotal', 0) | 0; }
  function setPoiTotal(n) { if (n > 0) set('poiTotal', n); }
  function allLiberated() {
    var t = poiTotal();
    return t > 0 && liberatedCount() >= t;
  }

  /* the run the player was last inside, so the start screen can offer a resume */
  function lastRegion() { return get('lastRegion', null); }
  function setLastRegion(o) { if (o) set('lastRegion', o); }

  function flag(k) { return !!get('flag:' + k, false); }
  function setFlag(k, v) { set('flag:' + k, v !== false); }

  function quality() { return get('quality', 'high'); }
  function setQuality(q) { set('quality', q === 'low' ? 'low' : 'high'); }

  return {
    WEAPON_COST: WEAPON_COST, UPGRADES: UPGRADES,
    salvage: salvage, addSalvage: addSalvage, spend: spend,
    weapons: weapons, isUnlocked: isUnlocked, unlockWeapon: unlockWeapon, weaponList: weaponList,
    upgrades: upgrades, upgradeLevel: upgradeLevel, upgradeCost: upgradeCost,
    buyUpgrade: buyUpgrade, upgradeBonus: upgradeBonus,
    claimed: claimed, claimCache: claimCache,
    liberatedCount: liberatedCount, poiTotal: poiTotal, setPoiTotal: setPoiTotal,
    allLiberated: allLiberated,
    lastRegion: lastRegion, setLastRegion: setLastRegion,
    flag: flag, setFlag: setFlag,
    quality: quality, setQuality: setQuality
  };
})();
