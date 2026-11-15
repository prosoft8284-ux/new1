/* BERMUDA SURVIVAL — PREVIEW WORLD
   One hand-detailed slice of the island: beach, jungle, crash site.
   The terrain is baked once into a pixel-art canvas. */
window.SCENE = (function () {
  'use strict';

  var S = 1.6;                            // world scale — a much larger slice of the island
  var W = Math.round(1600 * S), H = Math.round(1000 * S);
  var bg = null;
  var props = [];       // sorted by y, with collision radii
  var shorePoints = [];
  var rnd = mulberry(20261115);

  // region profile (set by configure() before bake)
  var P = {
    name: '', jungle: 1, palms: 1, camp: true, crash: true,
    shoreShift: 0, tint: null
  };

  function configure(profile) {
    if (!profile) return P;
    P = {
      name: profile.name || '',
      jungle: profile.jungle == null ? 1 : profile.jungle,
      palms: profile.palms == null ? 1 : profile.palms,
      camp: !!profile.camp,
      crash: !!profile.crash,
      shoreShift: profile.shoreShift || 0,
      tint: profile.tint || null
    };
    return P;
  }

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(x, y) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function n2(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  function fbm(x, y, o) {
    var s = 0, a = 0.5, f = 1, n = 0, i;
    for (i = 0; i < o; i++) { s += a * n2(x * f, y * f); n += a; f *= 2.07; a *= 0.5; }
    return s / n;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function shoreY(x) {
    var d = x / S;
    return (772 + P.shoreShift + Math.sin(d * 0.0052) * 20 + Math.sin(d * 0.0131 + 1.7) * 9 +
      (fbm(d * 0.01, 3.2, 3) - 0.5) * 26) * S;
  }

  /* ---------------- terrain bake ---------------- */
  function bake() {
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var x, y;

    // sea
    var sg = c.createLinearGradient(0, 700 * S, 0, H);
    sg.addColorStop(0, '#6fdcd2');
    sg.addColorStop(0.22, '#31b8c4');
    sg.addColorStop(0.55, '#0e7fa4');
    sg.addColorStop(1, '#08476c');
    c.fillStyle = sg; c.fillRect(0, 0, W, H);

    // sea texture: ripple bands + reef patches
    for (y = 700 * S; y < H; y += 3) {
      for (x = 0; x < W; x += 3) {
        var sy0 = shoreY(x);
        if (y < sy0) continue;
        var d = (y - sy0) / (H - sy0);
        var rip = Math.sin(y / S * 0.22 + Math.sin(x / S * 0.01) * 2.4) * 0.5 + 0.5;
        var reef = fbm(x / S * 0.006, y / S * 0.006, 3);
        if (d < 0.30 && reef > 0.62) {
          c.fillStyle = 'rgba(120,226,198,' + (0.20 * (1 - d / 0.30)).toFixed(3) + ')';
          c.fillRect(x, y, 3, 3);
        }
        if (rip > 0.72) {
          c.fillStyle = 'rgba(190,255,250,' + (0.06 * (1 - d)).toFixed(3) + ')';
          c.fillRect(x, y, 3, 1);
        }
      }
    }

    // land base
    var land = c.createLinearGradient(0, 0, 0, 780 * S);
    land.addColorStop(0, '#2c6134');
    land.addColorStop(0.6, '#35743c');
    land.addColorStop(1, '#4d8a48');
    c.beginPath();
    c.moveTo(0, 0); c.lineTo(W, 0);
    for (x = W; x >= 0; x -= 4) c.lineTo(x, shoreY(x));
    c.closePath();
    c.fillStyle = land; c.fill();

    // ground texture (grass / dirt mottling), pixel grid of 4
    for (y = 0; y < 790 * S; y += 4) {
      for (x = 0; x < W; x += 4) {
        var sy = shoreY(x);
        if (y > sy - 2) continue;
        var inland = (sy - y) / S;
        var nn = fbm(x / S * 0.012, y / S * 0.012, 4);
        var fine = fbm(x / S * 0.09, y / S * 0.09, 2);
        c.fillStyle = 'rgba(24,60,30,' + (0.06 + nn * 0.16).toFixed(3) + ')';
        c.fillRect(x, y, 4, 4);
        if (fine > 0.66) { c.fillStyle = 'rgba(126,176,86,.12)'; c.fillRect(x, y, 4, 3); }
        // sand strip
        if (inland < 30 + fine * 12) {
          c.fillStyle = inland < 9 ? 'rgba(198,182,132,.95)' : 'rgba(236,222,170,.97)';
          c.fillRect(x, y, 4, 4);
        }
      }
    }

    // path
    var path = PATH.map(function (q) { return [q[0] * S, q[1] * S]; });
    drawPath(c, path, 19 * S);
    drawPath(c, [[300 * S, 690 * S], [318 * S, 776 * S]], 15 * S);
    // second trail: camp → northern ridge lookout
    drawPath(c, [[430 * S, 640 * S], [620 * S, 520 * S], [800 * S, 430 * S], [900 * S, 300 * S]], 12 * S);

    if (P.crash) {
    // crash crater
    var cx = 1205 * S, cy = 425 * S;
    var g = c.createRadialGradient(cx, cy, 10, cx, cy, 150 * S);
    g.addColorStop(0, 'rgba(38,12,52,.95)');
    g.addColorStop(0.55, 'rgba(30,16,40,.55)');
    g.addColorStop(1, 'rgba(30,20,30,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(cx, cy, 152 * S, 116 * S, 0.2, 0, 6.2832); c.fill();
    c.strokeStyle = 'rgba(20,8,28,.55)'; c.lineWidth = 3;
    for (var i = 0; i < 14; i++) {
      var a = (i / 14) * 6.2832 + 0.15;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * 34 * S, cy + Math.sin(a) * 26 * S);
      c.lineTo(cx + Math.cos(a) * (110 + (i % 3) * 16) * S, cy + Math.sin(a) * (84 + (i % 3) * 12) * S);
      c.stroke();
    }
    // scorch + alien mould
    for (i = 0; i < 220; i++) {
      var ra = rnd() * 6.2832, rr = (26 + rnd() * 110) * S;
      var px = cx + Math.cos(ra) * rr * 1.25, py = cy + Math.sin(ra) * rr * 0.9;
      c.fillStyle = rnd() < 0.5 ? 'rgba(96,40,140,.22)' : 'rgba(18,10,22,.35)';
      c.fillRect(px | 0, py | 0, 4, 4);
    }

    }
    // camp clearing
    var cg = c.createRadialGradient(300 * S, 690 * S, 8, 300 * S, 690 * S, 110 * S);
    cg.addColorStop(0, 'rgba(120,102,72,.85)');
    cg.addColorStop(1, 'rgba(120,102,72,0)');
    c.fillStyle = cg;
    c.beginPath(); c.ellipse(300 * S, 690 * S, 118 * S, 76 * S, 0, 0, 6.2832); c.fill();

    // grass tufts & pebbles
    for (i = 0; i < 2600 * S * S; i++) {
      var gx = rnd() * W, gy = rnd() * 800 * S;
      if (gy > shoreY(gx) - 24) continue;
      var shade = rnd();
      c.fillStyle = shade < 0.4 ? 'rgba(60,112,52,.75)' : shade < 0.8 ? 'rgba(122,166,74,.7)' : 'rgba(166,198,104,.55)';
      c.fillRect(gx | 0, gy | 0, 2, rnd() < 0.5 ? 2 : 3);
    }
    for (i = 0; i < 340 * S * S; i++) {
      var px2 = rnd() * W, py2 = rnd() * 790 * S;
      if (py2 > shoreY(px2) - 18) continue;
      c.fillStyle = rnd() < 0.5 ? 'rgba(132,128,106,.75)' : 'rgba(96,92,78,.7)';
      c.fillRect(px2 | 0, py2 | 0, 3, 2);
    }
    // dappled canopy shade + warm light pools for depth
    for (i = 0; i < 200 * S * S; i++) {
      var dx = rnd() * W, dy = rnd() * 740 * S;
      if (dy > shoreY(dx) - 50) continue;
      var rr = 34 + rnd() * 86;
      var dg = c.createRadialGradient(dx, dy, rr * 0.15, dx, dy, rr);
      if (rnd() < 0.62) {
        dg.addColorStop(0, 'rgba(10,34,18,.30)');
        dg.addColorStop(1, 'rgba(10,34,18,0)');
      } else {
        dg.addColorStop(0, 'rgba(226,240,150,.14)');
        dg.addColorStop(1, 'rgba(226,240,150,0)');
      }
      c.fillStyle = dg;
      c.beginPath(); c.ellipse(dx, dy, rr * 1.3, rr * 0.8, 0, 0, 6.2832); c.fill();
    }

    // foam line
    c.strokeStyle = 'rgba(232,255,252,.85)';
    c.lineWidth = 3;
    c.beginPath();
    for (x = 0; x <= W; x += 4) { if (x === 0) c.moveTo(x, shoreY(x)); else c.lineTo(x, shoreY(x)); }
    c.stroke();

    if (P.tint) { c.fillStyle = P.tint; c.fillRect(0, 0, W, H); }
    bg = cv;
    buildProps();
    return cv;
  }

  function drawPath(c, pts, w) {
    var i;
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = 'rgba(88,78,50,.55)';
    c.lineWidth = w + 6;
    stroke(c, pts);
    c.strokeStyle = '#9c8659';
    c.lineWidth = w;
    stroke(c, pts);
    c.strokeStyle = 'rgba(186,168,124,.45)';
    c.lineWidth = w * 0.4;
    stroke(c, pts);
    // stones along the edge
    for (i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.floor(len / 26);
      for (var s = 0; s < steps; s++) {
        var t = s / steps;
        var px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
        var nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
        if (rnd() < 0.5) c.fillStyle = 'rgba(150,138,106,.6)';
        else c.fillStyle = 'rgba(108,98,74,.6)';
        var off = (w / 2 + 3) * (rnd() < 0.5 ? 1 : -1);
        c.fillRect((px + nx * off) | 0, (py + ny * off) | 0, 3, 2);
      }
    }
  }
  function stroke(c, pts) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.stroke();
  }

  /* ---------------- props ---------------- */
  function addProp(o) { props.push(o); }

  function buildProps() {
    var i, x, y, r;
    var campX = 300 * S, campY = 690 * S, nestX = 1205 * S, nestY = 425 * S;

    // palms along the shore
    for (i = 0; i < 34 * S * S * P.palms; i++) {
      x = 60 + rnd() * (W - 120);
      y = shoreY(x) - (20 + rnd() * 60) * S;
      if (Math.hypot(x - campX, y - campY) < 130 * S) continue;
      addProp({ kind: 'palm', x: x, y: y, s: 0.85 + rnd() * 0.5, r: 12, lean: (rnd() - 0.5) * 0.5 });
    }
    // jungle trees
    for (i = 0; i < 210 * S * S * P.jungle; i++) {
      x = 30 + rnd() * (W - 60);
      y = (40 + rnd() * 600) * S;
      if (y > shoreY(x) - 90 * S) continue;
      if (Math.hypot(x - nestX, y - nestY) < 210 * S) continue;
      if (Math.hypot(x - campX, y - campY) < 120 * S) continue;
      if (distToPath(x, y) < 42 * S) continue;
      addProp({ kind: 'tree', x: x, y: y, s: 0.9 + rnd() * 0.7, r: 15, v: (rnd() * 3) | 0 });
    }
    // bushes & rocks
    for (i = 0; i < 90 * S * S; i++) {
      x = 20 + rnd() * (W - 40);
      y = (30 + rnd() * 740) * S;
      if (y > shoreY(x) - 25 * S) continue;
      if (distToPath(x, y) < 30) continue;
      if (rnd() < 0.55) addProp({ kind: 'bush', x: x, y: y, s: 0.7 + rnd() * 0.7, r: 10 });
      else addProp({ kind: 'rock', x: x, y: y, s: 0.7 + rnd() * 0.9, r: 11 });
    }
    // driftwood & reef rocks on the beach
    for (i = 0; i < 26; i++) {
      x = rnd() * W;
      y = shoreY(x) - (12 + rnd() * 90) * S;
      addProp({ kind: rnd() < 0.5 ? 'rock' : 'bush', x: x, y: y, s: 0.5 + rnd() * 0.5, r: 10 });
    }

    if (P.camp) {
    // main camp
    addProp({ kind: 'tent', x: campX, y: campY - 18, r: 26 });
    addProp({ kind: 'fire', x: campX + 52, y: campY + 22, r: 9 });
    addProp({ kind: 'crate', x: campX - 60, y: campY + 30, r: 10 });
    addProp({ kind: 'crate', x: campX - 42, y: campY + 42, r: 10 });
    addProp({ kind: 'sandbag', x: campX + 52, y: campY - 14, r: 12 });
    addProp({ kind: 'sandbag', x: campX + 66, y: campY + 2, r: 12 });
    addProp({ kind: 'antenna', x: campX + 80, y: campY - 50, r: 8 });

    }
    // second camp: ranger post on the eastern shore
    addProp({ kind: 'tent', x: W - 210, y: shoreY(W - 210) - 60, r: 26 });
    addProp({ kind: 'crate', x: W - 270, y: shoreY(W - 270) - 40, r: 10 });
    addProp({ kind: 'sandbag', x: W - 160, y: shoreY(W - 160) - 40, r: 12 });
    addProp({ kind: 'antenna', x: W - 120, y: shoreY(W - 120) - 80, r: 8 });

    // western lagoon rocks
    for (i = 0; i < 14; i++) {
      var la = rnd() * 6.2832, lr = rnd() * 90;
      addProp({ kind: 'rock', x: 190 + Math.cos(la) * lr, y: 300 * S * 0.55 + Math.sin(la) * lr * 0.6, s: 0.8 + rnd(), r: 12 });
    }

    if (P.crash) {
    // alien crash site
    addProp({ kind: 'wreck', x: 1150 * S, y: 470 * S, r: 34, rot: 0.6, s: 1.1 });
    addProp({ kind: 'wreck', x: 1268 * S, y: 372 * S, r: 26, rot: -1.2, s: 0.8 });
    addProp({ kind: 'wreck', x: 1090 * S, y: 330 * S, r: 20, rot: 2.1, s: 0.55 });
    for (i = 0; i < 9 * S; i++) {
      var a = rnd() * 6.2832, rr = (60 + rnd() * 120) * S;
      addProp({
        kind: 'crystal', x: nestX + Math.cos(a) * rr * 1.15,
        y: nestY + Math.sin(a) * rr * 0.85, s: 0.7 + rnd() * 0.8, r: 9,
        seed: rnd() * 6
      });
    }
    for (i = 0; i < 5; i++) {
      var a2 = (i / 5) * 6.2832 + 0.3;
      addProp({ kind: 'spire', x: nestX + Math.cos(a2) * 66 * S, y: nestY + Math.sin(a2) * 52 * S, s: 0.8 + rnd() * 0.5, r: 8 });
    }
    addProp({ kind: 'nest', x: nestX, y: nestY + 15, r: 40 });

    }
    props.sort(function (a, b) { return a.y - b.y; });
  }

  var PATH = [[180, 700], [280, 690], [420, 655], [560, 640], [700, 610],
    [860, 560], [1010, 500], [1120, 462], [1200, 432]].map(function (q) { return [q[0] * S, q[1] * S]; });
  function distToPath(x, y) {
    var best = 1e9, i;
    for (i = 0; i < PATH.length - 1; i++) {
      var a = PATH[i], b = PATH[i + 1];
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
      var px = a[0] + dx * t, py = a[1] + dy * t;
      best = Math.min(best, Math.hypot(x - px, y - py));
    }
    return best;
  }

  // is this point blocked by scenery?
  function blocked(x, y) {
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (p.kind === 'fire' || p.kind === 'crystal') continue;
      if (Math.hypot(x - p.x, y - p.y) < (p.r || 10) * 0.8) return true;
    }
    return false;
  }

  return {
    configure: configure, profile: function () { return P; },
    W: W, H: H, S: S, props: props, bake: bake, shoreY: shoreY, blocked: blocked,
    distToPath: distToPath, propsList: props,
    pt: function (x, y) { return { x: x * S, y: y * S }; },
    get bg() { return bg; }
  };
})();
