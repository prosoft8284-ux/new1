/* BERMUDA SURVIVAL — persistent save (settings, records, camera).
   Small, synchronous, and safe when localStorage is unavailable. */
window.SAVE = (function () {
  'use strict';

  var KEY = 'bermuda.save.v1';
  var mem = null;

  function read() {
    if (mem) return mem;
    try {
      var raw = localStorage.getItem(KEY);
      mem = raw ? JSON.parse(raw) : {};
    } catch (e) {
      mem = {};
    }
    return mem;
  }

  function write(o) {
    mem = o;
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }

  return {
    get: function (k, d) {
      var o = read();
      return (k in o) ? o[k] : d;
    },
    set: function (k, v) {
      var o = read();
      o[k] = v;
      write(o);
      return v;
    },
    best: function () {
      return read().best || null;
    },
    recordRun: function (wave, kills) {
      var o = read();
      o.runs = (o.runs || 0) + 1;
      var b = o.best || { wave: 0, kills: 0 };
      if (wave > b.wave || (wave === b.wave && kills > b.kills)) b = { wave: wave, kills: kills };
      o.best = b;
      write(o);
      return b;
    },
    clear: function () {
      mem = {};
      try { localStorage.removeItem(KEY); } catch (e) {}
    }
  };
})();
