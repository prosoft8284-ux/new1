#!/usr/bin/env node
/* Boot preview.html's whole script chain in a stubbed DOM.
   Catches runtime errors that a syntax check cannot see (and that would show
   up as a black screen inside the WebView). */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', 'survival', 'js');
const errors = [];
process.on('uncaughtException', e => errors.push('uncaught: ' + (e && e.stack || e)));
process.on('unhandledRejection', e => errors.push('rejection: ' + e));

function makeCtx() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
      if (k === 'putImageData' || k === 'drawImage') return () => {};
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

function makeEl(id) {
  const el = {
    id: id || '', width: 300, height: 150, tagName: 'DIV',
    style: {}, dataset: {}, children: [], disabled: false, href: '', textContent: '',
    innerHTML: '', title: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    getContext: () => makeCtx(),
    appendChild(c) { el.children.push(c); return c; },
    querySelector() { return makeEl('child'); },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 300, bottom: 150, width: 300, height: 150 }),
    setPointerCapture() {},
    closest() { return null; }
  };
  return el;
}

const store = {};
const win = {
  location: {
    search: '?type=' + (process.argv[2] || 'town') + '&name=r&poi=' + (process.argv[3] || 'central-city'),
    href: 'file:///x/preview.html'
  },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  devicePixelRatio: 2, innerWidth: 900, innerHeight: 420,
  addEventListener() {}, removeEventListener() {},
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame() { return 0; },
  cancelAnimationFrame() {},
  performance: { now: () => Date.now() },
  navigator: { vibrate() {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  URLSearchParams, console, Math, Date, JSON
};
win.window = win;
win.document = {
  createElement: tag => makeEl(tag),
  getElementById: id => makeEl(id),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  readyState: 'complete',
  body: makeEl('body'),
  documentElement: makeEl('html')
};
vm.createContext(win);

const chain = ['pix.js', 'props.js', 'save.js', 'meta.js', 'regions.js', 'kitmeta.js',
  'props2.js', 'kits.js', 'scene.js', 'sfx.js', 'liberation.js', 'game.js'];

for (const file of chain) {
  try {
    vm.runInContext(fs.readFileSync(path.join(JS, file), 'utf8'), win, { filename: file });
  } catch (e) {
    errors.push(file + ': ' + (e && e.stack || e));
  }
}

// let the deferred terrain bake run
setTimeout(() => {
  const checks = [];
  const need = ['SCENE', 'SFX', 'LIB', 'SAVE', 'META', 'KITMETA', 'KITS', 'PROPS', 'PROPS2', 'REGIONS', 'PIX'];
  need.forEach(k => { if (!win[k]) checks.push('missing global ' + k); });
  if (win.SCENE && !win.SCENE.bg) checks.push('terrain never baked');
  if (typeof win.__onBack !== 'function') checks.push('back bridge missing');

  if (errors.length) {
    console.log('\nRUNTIME ERRORS');
    errors.forEach(e => console.log('\n' + e));
  }
  checks.forEach(c => console.log('CHECK FAIL ' + c));
  if (!errors.length && !checks.length) {
    console.log('smoke ok [' + (process.argv[2] || 'town') + ']: modules booted, terrain baked, back bridge installed');
    process.exit(0);
  }
  process.exit(1);
}, 600);
