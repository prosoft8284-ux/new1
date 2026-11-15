/* BERMUDA SURVIVAL — KIT METADATA
   Per-kit combat identity: where the relay stands, where waves enter, which
   aliens live here, what the weather looks like and how the minimap is tinted.
   Positions are fractions of the world so a kit never hardcodes a pixel. */
window.KITMETA = (function () {
  'use strict';

  var BEACH = {
    relay: { fx: 0.19, fy: 0.66 },
    spawns: [
      { fx: 0.06, fy: 0.18 }, { fx: 0.34, fy: 0.10 }, { fx: 0.62, fy: 0.12 },
      { fx: 0.88, fy: 0.26 }, { fx: 0.90, fy: 0.60 }, { fx: 0.52, fy: 0.52 },
      { fx: 0.24, fy: 0.44 }
    ],
    enemies: ['parasite', 'runner', 'skitter', 'winged', 'warrior'],
    weather: 'spray',
    minimap: { ground: '#2b6b3c', accent: '#c48bff', sea: '#0e6f8f' },
    cover: 'bush'
  };

  var M = {
    city: {
      relay: { fx: 0.58, fy: 0.62 },
      spawns: [
        { fx: 0.08, fy: 0.10 }, { fx: 0.30, fy: 0.06 }, { fx: 0.55, fy: 0.08 },
        { fx: 0.78, fy: 0.12 }, { fx: 0.90, fy: 0.34 }, { fx: 0.06, fy: 0.44 },
        { fx: 0.94, fy: 0.66 }, { fx: 0.40, fy: 0.90 }, { fx: 0.72, fy: 0.88 }
      ],
      enemies: ['runner', 'parasite', 'skitter', 'neural', 'bomber', 'brute'],
      weather: 'rain',
      minimap: { ground: '#35363a', accent: '#8a8f93', sea: null },
      cover: 'rubble'
    },
    military: {
      relay: { fx: 0.52, fy: 0.44 },
      spawns: [
        { fx: 0.06, fy: 0.12 }, { fx: 0.28, fy: 0.06 }, { fx: 0.70, fy: 0.06 },
        { fx: 0.92, fy: 0.18 }, { fx: 0.06, fy: 0.62 }, { fx: 0.94, fy: 0.58 },
        { fx: 0.36, fy: 0.92 }, { fx: 0.76, fy: 0.90 }
      ],
      enemies: ['warrior', 'brute', 'winged', 'neural', 'bomber'],
      weather: 'dust',
      minimap: { ground: '#6b5a41', accent: '#c9b183', sea: null },
      cover: 'sandbag'
    },
    alien: {
      relay: { fx: 0.70, fy: 0.28 },
      spawns: [
        { fx: 0.10, fy: 0.10 }, { fx: 0.36, fy: 0.08 }, { fx: 0.62, fy: 0.06 },
        { fx: 0.90, fy: 0.14 }, { fx: 0.08, fy: 0.52 }, { fx: 0.94, fy: 0.50 },
        { fx: 0.28, fy: 0.86 }, { fx: 0.66, fy: 0.90 }
      ],
      enemies: ['mutant', 'warlock', 'neural', 'winged', 'brute'],
      weather: 'ash',
      minimap: { ground: '#251533', accent: '#c48bff', sea: null },
      cover: 'spire'
    },
    airport: {
      relay: { fx: 0.34, fy: 0.54 },
      spawns: [
        { fx: 0.04, fy: 0.20 }, { fx: 0.24, fy: 0.10 }, { fx: 0.58, fy: 0.08 },
        { fx: 0.86, fy: 0.10 }, { fx: 0.96, fy: 0.44 }, { fx: 0.92, fy: 0.82 },
        { fx: 0.52, fy: 0.94 }, { fx: 0.18, fy: 0.86 }
      ],
      enemies: ['winged', 'runner', 'skitter', 'bomber', 'warrior'],
      weather: 'wind',
      minimap: { ground: '#5c6b4a', accent: '#cfd3cc', sea: null },
      cover: 'crate'
    },
    temple: {
      relay: { fx: 0.52, fy: 0.40 },
      spawns: [
        { fx: 0.08, fy: 0.12 }, { fx: 0.34, fy: 0.06 }, { fx: 0.70, fy: 0.08 },
        { fx: 0.92, fy: 0.20 }, { fx: 0.06, fy: 0.58 }, { fx: 0.94, fy: 0.62 },
        { fx: 0.32, fy: 0.92 }, { fx: 0.74, fy: 0.90 }
      ],
      enemies: ['warlock', 'mutant', 'warrior', 'parasite', 'neural'],
      weather: 'mist',
      minimap: { ground: '#7d8a5e', accent: '#c8bfa4', sea: null },
      cover: 'column'
    },
    jungle: {
      relay: { fx: 0.62, fy: 0.40 },
      spawns: [
        { fx: 0.06, fy: 0.10 }, { fx: 0.32, fy: 0.06 }, { fx: 0.64, fy: 0.06 },
        { fx: 0.92, fy: 0.14 }, { fx: 0.96, fy: 0.52 }, { fx: 0.04, fy: 0.56 },
        { fx: 0.36, fy: 0.94 }, { fx: 0.78, fy: 0.94 }
      ],
      enemies: ['parasite', 'skitter', 'runner', 'winged', 'mutant', 'bomber'],
      weather: 'spores',
      minimap: { ground: '#2c5f2f', accent: '#8ff0ff', sea: '#1c6b78' },
      cover: 'tree'
    }
  };

  function forKit(kit) { return M[kit] || (kit === 'beach' ? BEACH : null); }
  function forRegion(region) {
    if (!region) return BEACH;
    return forKit(region.kit || 'beach') || BEACH;
  }

  return { forKit: forKit, forRegion: forRegion, kits: Object.keys(M), beach: BEACH };
})();
