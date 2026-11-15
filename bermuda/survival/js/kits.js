/* BERMUDA SURVIVAL — REGION KITS
   Each kit paints its own ground and lays out its own scenery, so a city block
   does not look like a beach with a filter. scene.js calls KITS.paint() and
   KITS.props() when the region has a kit. */
window.KITS = (function () {
  'use strict';

  function speckle(c, W, H, rnd, n, cols, size) {
    for (var i = 0; i < n; i++) {
      c.fillStyle = cols[(rnd() * cols.length) | 0];
      c.fillRect(rnd() * W | 0, rnd() * H | 0, size, size);
    }
  }

  function inClear(x, y, S) {
    var cl = [[1010 * S, 566 * S, 130], [300 * S, 655 * S, 110], [1205 * S, 425 * S, 120]];
    for (var i = 0; i < cl.length; i++) {
      if (Math.hypot(x - cl[i][0], y - cl[i][1]) < cl[i][2] * S) return true;
    }
    return false;
  }

  var P = {};

  /* ============================================================ CITY */
  P.city = {
    paint: function (c, W, H, S, rnd) {
      c.fillStyle = '#35363a'; c.fillRect(0, 0, W, H);
      // asphalt grain
      speckle(c, W, H, rnd, Math.round(W * H / 900), ['#3b3c40', '#2f3034', '#404144', '#2a2b2e'], 3);
      // two avenues
      var roadY = H * 0.34, roadH = 92 * S / 1.6, roadX = W * 0.52, roadW = 96 * S / 1.6;
      c.fillStyle = '#4b4c50'; c.fillRect(0, roadY, W, roadH);
      c.fillRect(roadX, 0, roadW, H);
      // sidewalks
      c.fillStyle = '#5c5d61';
      c.fillRect(0, roadY - 7, W, 7); c.fillRect(0, roadY + roadH, W, 7);
      c.fillRect(roadX - 7, 0, 7, H); c.fillRect(roadX + roadW, 0, 7, H);
      // lane markings, faded and broken
      c.fillStyle = 'rgba(226,220,190,.35)';
      for (var x = 0; x < W; x += 54) {
        if (rnd() < 0.22) continue;
        c.fillRect(x, roadY + roadH / 2 - 2, 26, 4);
      }
      for (var y = 0; y < H; y += 54) {
        if (rnd() < 0.22) continue;
        c.fillRect(roadX + roadW / 2 - 2, y, 4, 26);
      }
      // cracks
      c.strokeStyle = 'rgba(16,17,20,.5)'; c.lineWidth = 1.4;
      for (var k = 0; k < 40; k++) {
        var cx = rnd() * W, cy = rnd() * H;
        c.beginPath(); c.moveTo(cx, cy);
        for (var j = 0; j < 4; j++) {
          cx += (rnd() - 0.5) * 40; cy += (rnd() - 0.5) * 40;
          c.lineTo(cx, cy);
        }
        c.stroke();
      }
      // craters: scorched rings with debris
      for (var n = 0; n < 5; n++) {
        var px = (0.12 + rnd() * 0.76) * W, py = (0.12 + rnd() * 0.76) * H;
        var rr2 = (26 + rnd() * 40) * (S / 1.6);
        var g = c.createRadialGradient(px, py, 2, px, py, rr2);
        g.addColorStop(0, 'rgba(12,12,14,.92)');
        g.addColorStop(0.6, 'rgba(26,24,22,.55)');
        g.addColorStop(1, 'rgba(30,28,26,0)');
        c.fillStyle = g; c.beginPath(); c.arc(px, py, rr2, 0, 6.2832); c.fill();
        c.strokeStyle = 'rgba(18,16,15,.5)'; c.lineWidth = 2;
        c.beginPath(); c.arc(px, py, rr2 * 1.05, 0, 6.2832); c.stroke();
      }
      // rubble dust along the kerbs
      speckle(c, W, H, rnd, Math.round(W * H / 2600), ['rgba(120,116,108,.5)', 'rgba(86,82,76,.5)'], 2);
    },
    props: function (add, W, H, S, rnd) {
      var roadY = H * 0.34, roadH = 92 * S / 1.6, roadX = W * 0.52, roadW = 96 * S / 1.6;
      // blocks of buildings along both avenues
      for (var i = 0; i < 16; i++) {
        var bx = (0.06 + rnd() * 0.88) * W;
        var by = (0.06 + rnd() * 0.88) * H;
        if (Math.abs(by - roadY) < roadH * 1.4) by += Math.sign(by - roadY) * roadH * 1.5;
        if (Math.abs(bx - roadX) < roadW * 1.6) bx += Math.sign(bx - roadX) * roadW * 1.6;
        if (inClear(bx, by, S)) continue;
        var w = 52 + rnd() * 70, h = 44 + rnd() * 50;
        add({
          kind: 'bldg', x: bx, y: by, s: 0.9 + rnd() * 0.5, w: w, h: h,
          tall: 1.2 + rnd() * 1.1, ruined: rnd() < 0.55,
          wall: rnd() < 0.5 ? '#4f5054' : '#5d5348', wallDark: '#33343a', glass: '#7d9fb5',
          r: Math.max(w, h) * 0.36
        });
      }
      // burnt cars on the roads
      for (var c2 = 0; c2 < 9; c2++) {
        var onH = rnd() < 0.5;
        var cx = onH ? rnd() * W : roadX + rnd() * roadW;
        var cy = onH ? roadY + rnd() * roadH : rnd() * H;
        add({ kind: 'car', x: cx, y: cy, s: 0.9 + rnd() * 0.4, rot: onH ? 0 : 1.57, burnt: rnd() < 0.7, r: 16 });
      }
      // lamps, dead half the time
      for (var l = 0; l < 10; l++) {
        var lx = rnd() < 0.5 ? rnd() * W : (rnd() < 0.5 ? roadX - 14 : roadX + roadW + 14);
        var ly = rnd() < 0.5 ? roadY - 16 : rnd() * H;
        add({ kind: 'lamp', x: lx, y: ly, s: 0.9 + rnd() * 0.3, dead: rnd() < 0.45, r: 7 });
      }
      // rubble heaps + barricades
      for (var r2 = 0; r2 < 14; r2++) {
        var rx = rnd() * W, ry = rnd() * H;
        if (inClear(rx, ry, S)) continue;
        add({ kind: 'rubble', x: rx, y: ry, s: 0.8 + rnd() * 0.7, r: 12 });
      }
      for (var b = 0; b < 6; b++) {
        add({
          kind: 'sandbag', x: (0.15 + rnd() * 0.7) * W, y: (0.15 + rnd() * 0.7) * H,
          s: 1 + rnd() * 0.5, r: 13
        });
      }
    }
  };

  /* ======================================================== MILITARY */
  P.military = {
    paint: function (c, W, H, S, rnd) {
      c.fillStyle = '#6b5a41'; c.fillRect(0, 0, W, H);
      speckle(c, W, H, rnd, Math.round(W * H / 700), ['#746246', '#615139', '#7d6b4e', '#57482f'], 3);
      // concrete pad in the middle
      var px = W * 0.55, py = H * 0.45, pr = 260 * (S / 1.6);
      var g = c.createRadialGradient(px, py, pr * 0.2, px, py, pr);
      g.addColorStop(0, 'rgba(128,126,118,.85)');
      g.addColorStop(1, 'rgba(120,118,110,0)');
      c.fillStyle = g; c.beginPath(); c.arc(px, py, pr, 0, 6.2832); c.fill();
      // tyre tracks: two ruts running across the camp
      c.strokeStyle = 'rgba(74,62,44,.55)'; c.lineWidth = 6;
      for (var i = 0; i < 3; i++) {
        var yy = H * (0.2 + i * 0.28);
        c.beginPath(); c.moveTo(0, yy);
        c.bezierCurveTo(W * 0.3, yy - 30, W * 0.6, yy + 34, W, yy - 12);
        c.stroke();
      }
      // camo patches
      for (var k = 0; k < 26; k++) {
        var cx = rnd() * W, cy = rnd() * H, rr2 = 26 + rnd() * 60;
        c.fillStyle = rnd() < 0.5 ? 'rgba(84,92,58,.35)' : 'rgba(96,78,50,.30)';
        c.beginPath(); c.ellipse(cx, cy, rr2, rr2 * 0.6, rnd() * 3, 0, 6.2832); c.fill();
      }
      speckle(c, W, H, rnd, Math.round(W * H / 3000), ['rgba(160,150,130,.5)'], 2);
    },
    props: function (add, W, H, S, rnd) {
      add({ kind: 'tent', x: 520 * S, y: 470 * S, r: 26 });
      add({ kind: 'tent', x: 640 * S, y: 520 * S, r: 26 });
      add({ kind: 'fire', x: 560 * S, y: 560 * S, r: 9 });
      add({ kind: 'antenna', x: 470 * S, y: 420 * S, r: 8 });
      // razor wire runs
      for (var f = 0; f < 5; f++) {
        add({
          kind: 'fence', x: (0.1 + f * 0.2) * W, y: H * 0.86, s: 1, len: 150, r: 10
        });
      }
      add({ kind: 'fence', x: W * 0.12, y: H * 0.3, s: 1, len: 160, r: 10 });
      // watchtower: two legs and a cabin
      add({ kind: 'bldg', x: 860 * S, y: 380 * S, s: 0.9, w: 34, h: 40, tall: 2.3, ruined: false, wall: '#5e5340', wallDark: '#463d2e', r: 26 });
      // fuel tanks and supply crates
      add({ kind: 'tank', x: 300 * S, y: 300 * S, s: 1.1, r2: 26, tankCol: '#7d7f78', r: 28 });
      add({ kind: 'tank', x: 360 * S, y: 340 * S, s: 0.9, r2: 22, tankCol: '#6f7568', r: 24 });
      for (var b = 0; b < 8; b++) {
        add({ kind: 'crate', x: (0.15 + rnd() * 0.7) * W, y: (0.15 + rnd() * 0.7) * H, s: 1 + rnd() * 0.4, r: 10 });
      }
      for (var s2 = 0; s2 < 10; s2++) {
        add({ kind: 'sandbag', x: (0.1 + rnd() * 0.8) * W, y: (0.12 + rnd() * 0.75) * H, s: 1 + rnd() * 0.5, r: 13 });
      }
      for (var l = 0; l < 5; l++) {
        add({ kind: 'lamp', x: (0.12 + rnd() * 0.76) * W, y: (0.1 + rnd() * 0.7) * H, s: 1, dead: false, r: 7 });
      }
      for (var v = 0; v < 3; v++) {
        add({ kind: 'car', x: (0.2 + rnd() * 0.6) * W, y: (0.2 + rnd() * 0.6) * H, s: 1.25, rot: rnd() * 3, burnt: false, r: 18 });
      }
      for (var rk = 0; rk < 10; rk++) {
        add({ kind: 'rock', x: rnd() * W, y: rnd() * H * 0.9, s: 0.6 + rnd() * 0.7, r: 11 });
      }
    }
  };

  /* =========================================================== ALIEN */
  P.alien = {
    paint: function (c, W, H, S, rnd) {
      c.fillStyle = '#251533'; c.fillRect(0, 0, W, H);
      speckle(c, W, H, rnd, Math.round(W * H / 520), ['#2c1a3c', '#1f1029', '#33203f'], 3);
      // cracked ground with a faint glow in the seams
      for (var i = 0; i < 60; i++) {
        var x = rnd() * W, y = rnd() * H;
        c.strokeStyle = rnd() < 0.35 ? 'rgba(150,74,220,.45)' : 'rgba(12,6,18,.6)';
        c.lineWidth = rnd() < 0.3 ? 2 : 1;
        c.beginPath(); c.moveTo(x, y);
        for (var k = 0; k < 3; k++) {
          x += (rnd() - 0.5) * 70; y += (rnd() - 0.5) * 70;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      // organic growth blobs
      for (var b = 0; b < 22; b++) {
        var bx = rnd() * W, by = rnd() * H, br = 20 + rnd() * 46;
        var g = c.createRadialGradient(bx, by, 2, bx, by, br);
        g.addColorStop(0, 'rgba(96,40,130,.55)');
        g.addColorStop(1, 'rgba(60,20,90,0)');
        c.fillStyle = g;
        c.beginPath(); c.ellipse(bx, by, br, br * 0.7, rnd() * 3, 0, 6.2832); c.fill();
      }
      // ash
      speckle(c, W, H, rnd, Math.round(W * H / 2200), ['rgba(180,168,190,.35)', 'rgba(120,110,130,.3)'], 2);
    },
    props: function (add, W, H, S, rnd) {
      add({ kind: 'nest', x: 1205 * S, y: 425 * S, r: 42 });
      add({ kind: 'wreck', x: 1150 * S, y: 470 * S, r: 34, rot: 0.6, s: 1.1 });
      add({ kind: 'wreck', x: 1268 * S, y: 372 * S, r: 26, rot: -1.2, s: 0.8 });
      add({ kind: 'wreck', x: 1090 * S, y: 330 * S, r: 20, rot: 2.1, s: 0.55 });
      for (var i = 0; i < 18; i++) {
        var a = rnd() * 6.2832, rr2 = (50 + rnd() * 190) * S;
        add({ kind: 'crystal', x: 1205 * S + Math.cos(a) * rr2, y: 425 * S + Math.sin(a) * rr2 * 0.85, s: 0.7 + rnd() * 0.9, r: 9, seed: rnd() * 6 });
      }
      for (var s2 = 0; s2 < 7; s2++) {
        var a2 = s2 / 7 * 6.2832;
        add({ kind: 'spire', x: 1205 * S + Math.cos(a2) * 96 * S, y: 425 * S + Math.sin(a2) * 78 * S, s: 0.8 + rnd() * 0.6, r: 9 });
      }
      for (var r2 = 0; r2 < 14; r2++) {
        add({ kind: 'rock', x: rnd() * W, y: rnd() * H, s: 0.5 + rnd() * 0.8, r: 10 });
      }
      for (var t2 = 0; t2 < 8; t2++) {
        add({ kind: 'crystal', x: rnd() * W, y: rnd() * H, s: 0.4 + rnd() * 0.5, r: 8, seed: rnd() * 6 });
      }
    }
  };

  /* ========================================================= AIRPORT */
  P.airport = {
    paint: function (c, W, H, S, rnd) {
      c.fillStyle = '#5c6b4a'; c.fillRect(0, 0, W, H);      // grass margin
      speckle(c, W, H, rnd, Math.round(W * H / 900), ['#657552', '#52603f', '#6f805a'], 3);
      // apron
      c.fillStyle = '#6f7377'; c.fillRect(0, H * 0.10, W, H * 0.56);
      // runway
      var ry = H * 0.30, rh = H * 0.16;
      c.fillStyle = '#3f4245'; c.fillRect(0, ry, W, rh);
      c.fillStyle = 'rgba(240,238,230,.85)';
      for (var x = 20; x < W; x += 90) c.fillRect(x, ry + rh / 2 - 3, 46, 6);
      c.fillRect(20, ry + 6, W - 40, 4); c.fillRect(20, ry + rh - 10, W - 40, 4);
      // threshold bars
      for (var b = 0; b < 6; b++) {
        c.fillRect(16 + b * 12, ry + 14, 6, rh - 28);
        c.fillRect(W - 24 - b * 12, ry + 14, 6, rh - 28);
      }
      // taxiway + centre line
      c.fillStyle = '#55595c'; c.fillRect(W * 0.18, ry + rh, 90, H * 0.22);
      c.fillStyle = 'rgba(238,214,90,.8)';
      for (var y2 = ry + rh + 12; y2 < ry + rh + H * 0.2; y2 += 42) c.fillRect(W * 0.18 + 43, y2, 4, 22);
      // grass tufts on the margin
      speckle(c, W, H, rnd, Math.round(W * H / 2600), ['rgba(120,150,90,.5)', 'rgba(88,112,64,.5)'], 2);
    },
    props: function (add, W, H, S, rnd) {
      add({ kind: 'bldg', x: W * 0.30, y: H * 0.66, s: 1.3, w: 190, h: 76, tall: 1.0, ruined: rnd() < 0.4, wall: '#8b8f92', wallDark: '#5f6366', r: 74 });
      add({ kind: 'bldg', x: W * 0.62, y: H * 0.70, s: 1.1, w: 150, h: 70, tall: 0.95, ruined: rnd() < 0.4, wall: '#84888b', wallDark: '#585c5f', r: 60 });
      add({ kind: 'bldg', x: W * 0.80, y: H * 0.18, s: 1, w: 46, h: 46, tall: 2.4, ruined: false, wall: '#9aa0a4', wallDark: '#6a7074', glass: '#a9d4e2', r: 28 });
      add({ kind: 'tank', x: W * 0.45, y: H * 0.20, s: 1.1, r2: 28, tankCol: '#b0b3ac', r: 30 });
      add({ kind: 'tank', x: W * 0.50, y: H * 0.24, s: 1, r2: 24, tankCol: '#a7aaa3', r: 26 });
      for (var c2 = 0; c2 < 6; c2++) {
        add({ kind: 'car', x: W * (0.2 + rnd() * 0.5), y: H * (0.50 + rnd() * 0.2), s: 1.1, rot: rnd() < 0.5 ? 0 : 1.57, burnt: rnd() < 0.5, r: 16 });
      }
      // lamp row along the runway
      for (var l = 0; l < 12; l++) {
        add({ kind: 'lamp', x: (0.05 + l * 0.08) * W, y: H * 0.285, s: 1, dead: rnd() < 0.3, r: 7 });
      }
      for (var f = 0; f < 4; f++) {
        add({ kind: 'fence', x: (0.15 + f * 0.24) * W, y: H * 0.88, s: 1, len: 160, r: 10 });
      }
      for (var b2 = 0; b2 < 6; b2++) {
        add({ kind: 'crate', x: (0.2 + rnd() * 0.6) * W, y: (0.6 + rnd() * 0.2) * H, s: 1, r: 10 });
      }
    }
  };

  /* ========================================================== TEMPLE */
  P.temple = {
    paint: function (c, W, H, S, rnd) {
      c.fillStyle = '#7d8a5e'; c.fillRect(0, 0, W, H);
      speckle(c, W, H, rnd, Math.round(W * H / 800), ['#86935f', '#6f7d52', '#909c6a'], 3);
      // paved court
      var px = W * 0.52, py = H * 0.46, pw = W * 0.56, ph = H * 0.50;
      c.fillStyle = '#b4ac93';
      c.fillRect(px - pw / 2, py - ph / 2, pw, ph);
      // slab grid with moss in the joints
      c.strokeStyle = 'rgba(96,104,72,.55)'; c.lineWidth = 2;
      for (var gx = px - pw / 2; gx <= px + pw / 2; gx += 46) {
        c.beginPath(); c.moveTo(gx, py - ph / 2); c.lineTo(gx, py + ph / 2); c.stroke();
      }
      for (var gy = py - ph / 2; gy <= py + ph / 2; gy += 46) {
        c.beginPath(); c.moveTo(px - pw / 2, gy); c.lineTo(px + pw / 2, gy); c.stroke();
      }
      // worn slabs + moss
      for (var i = 0; i < 90; i++) {
        var sx = px - pw / 2 + rnd() * pw, sy = py - ph / 2 + rnd() * ph;
        c.fillStyle = rnd() < 0.5 ? 'rgba(140,146,104,.35)' : 'rgba(96,104,72,.30)';
        c.fillRect(sx, sy, 18 + rnd() * 24, 14 + rnd() * 20);
      }
      // steps up to the altar (south side)
      for (var s2 = 0; s2 < 5; s2++) {
        c.fillStyle = s2 % 2 ? '#a9a289' : '#bdb59b';
        c.fillRect(px - pw * 0.28, py + ph / 2 - 12 + s2 * 9, pw * 0.56, 8);
      }
      // scattered leaves
      speckle(c, W, H, rnd, 900, ['rgba(150,120,60,.5)', 'rgba(110,140,70,.5)'], 2);
    },
    props: function (add, W, H, S, rnd) {
      var px = W * 0.52, py = H * 0.46;
      // colonnade
      for (var i = 0; i < 7; i++) {
        add({ kind: 'column', x: px - 230 + i * 76, y: py - 120, s: 1, h2: 58, broken: rnd() < 0.45, col: '#c2b99e', r: 12 });
        add({ kind: 'column', x: px - 230 + i * 76, y: py + 130, s: 1, h2: 58, broken: rnd() < 0.45, col: '#bcb398', r: 12 });
      }
      // altar
      add({ kind: 'bldg', x: px, y: py + 40, s: 1, w: 74, h: 40, tall: 0.7, ruined: false, wall: '#c8bfa4', wallDark: '#a49b82', r: 34 });
      // fallen walls
      add({ kind: 'bldg', x: px - 250, y: py + 20, s: 1, w: 120, h: 26, tall: 0.6, ruined: true, wall: '#b0a78c', wallDark: '#8d8469', r: 44 });
      add({ kind: 'rubble', x: px + 210, y: py + 90, s: 1.1, r: 14 });
      for (var b = 0; b < 12; b++) {
        add({ kind: 'bush', x: rnd() * W, y: rnd() * H, s: 0.7 + rnd() * 0.7, r: 10 });
      }
      for (var r2 = 0; r2 < 10; r2++) {
        add({ kind: 'rock', x: rnd() * W, y: rnd() * H, s: 0.6 + rnd() * 0.7, r: 10 });
      }
      for (var t2 = 0; t2 < 8; t2++) {
        var tx = rnd() * W, ty = rnd() * H * 0.35;
        add({ kind: 'tree', x: tx, y: ty, s: 0.9 + rnd() * 0.6, r: 15, v: (rnd() * 3) | 0 });
      }
    }
  };

  /* ================================================= JUNGLE INTERIOR */
  P.jungle = {
    paint: function (c, W, H, S, rnd) {
      c.fillStyle = '#2c5f2f'; c.fillRect(0, 0, W, H);
      speckle(c, W, H, rnd, Math.round(W * H / 420), ['#316a34', '#27522a', '#38713a', '#20471f'], 3);
      // winding river with banks
      var yBase = H * 0.68;
      c.fillStyle = '#7c6a44';
      c.beginPath();
      c.moveTo(0, yBase - 46);
      for (var x = 0; x <= W; x += 12) c.lineTo(x, yBase - 46 + Math.sin(x * 0.0032) * 34);
      for (var x2 = W; x2 >= 0; x2 -= 12) c.lineTo(x2, yBase + 46 + Math.sin(x2 * 0.0032) * 34);
      c.closePath(); c.fill();
      c.fillStyle = '#1c6b78';
      c.beginPath();
      c.moveTo(0, yBase - 28);
      for (var x3 = 0; x3 <= W; x3 += 12) c.lineTo(x3, yBase - 28 + Math.sin(x3 * 0.0032) * 34);
      for (var x4 = W; x4 >= 0; x4 -= 12) c.lineTo(x4, yBase + 28 + Math.sin(x4 * 0.0032) * 34);
      c.closePath(); c.fill();
      // water highlights
      c.strokeStyle = 'rgba(160,240,240,.35)'; c.lineWidth = 2;
      for (var w2 = 0; w2 < 26; w2++) {
        var wx = rnd() * W, wy = yBase + Math.sin(wx * 0.0032) * 34 + (rnd() - 0.5) * 40;
        c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx + 16 + rnd() * 20, wy + 2); c.stroke();
      }
      // dirt trail
      c.strokeStyle = 'rgba(150,124,82,.65)'; c.lineWidth = 26;
      c.beginPath(); c.moveTo(W * 0.08, H * 0.2);
      c.bezierCurveTo(W * 0.35, H * 0.42, W * 0.5, H * 0.2, W * 0.92, H * 0.34);
      c.stroke();
      // fern and leaf litter
      speckle(c, W, H, rnd, Math.round(W * H / 700), ['rgba(60,110,54,.6)', 'rgba(120,150,70,.4)', 'rgba(24,60,30,.5)'], 2);
    },
    props: function (add, W, H, S, rnd) {
      for (var i = 0; i < 150; i++) {
        var x = rnd() * W, y = rnd() * H;
        if (inClear(x, y, S)) continue;
        if (Math.abs(y - (H * 0.68 + Math.sin(x * 0.0032) * 34)) < 60) continue;
        add({ kind: 'tree', x: x, y: y, s: 0.9 + rnd() * 0.8, r: 15, v: (rnd() * 3) | 0 });
      }
      for (var p = 0; p < 24; p++) {
        add({ kind: 'palm', x: rnd() * W, y: rnd() * H, s: 0.8 + rnd() * 0.5, r: 12, lean: (rnd() - 0.5) * 0.5 });
      }
      for (var b = 0; b < 40; b++) {
        add({ kind: 'bush', x: rnd() * W, y: rnd() * H, s: 0.7 + rnd() * 0.8, r: 10 });
      }
      for (var r2 = 0; r2 < 18; r2++) {
        add({ kind: 'rock', x: rnd() * W, y: rnd() * H, s: 0.6 + rnd() * 0.9, r: 11 });
      }
      // a crude bridge over the river
      add({ kind: 'crate', x: W * 0.42, y: H * 0.66, s: 1.4, r: 14 });
      add({ kind: 'crate', x: W * 0.44, y: H * 0.70, s: 1.4, r: 14 });
      add({ kind: 'tent', x: W * 0.22, y: H * 0.30, r: 26 });
    }
  };

  var ALIAS = { city: 'city', military: 'military', alien: 'alien', airport: 'airport', temple: 'temple', jungle: 'jungle' };

  return {
    has: function (kind) { return !!(kind && P[ALIAS[kind]] && P[kind]); },
    paint: function (c, kind, W, H, S, rnd) { P[kind].paint(c, W, H, S, rnd); },
    props: function (kind, add, W, H, S, rnd) { P[kind].props(add, W, H, S, rnd); },
    list: function () { return Object.keys(P); }
  };
})();
