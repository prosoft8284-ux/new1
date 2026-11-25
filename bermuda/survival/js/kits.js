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
  /* A war-torn grid: three avenues each way, paved blocks with kerbs, real
     street furniture and enough buildings that the player always has cover. */
  P.city = {
    paint: function (c, W, H, S, rnd) {
      var i, x, y, R = function (a, b) { return a + rnd() * (b - a); };
      var VX = [0.20 * W, 0.50 * W, 0.80 * W];
      var HY = [0.24 * H, 0.52 * H, 0.80 * H];
      var ROAD = 92, WALK = 20;

      // asphalt base
      c.fillStyle = '#37383c'; c.fillRect(0, 0, W, H);
      for (i = 0; i < 220; i++) {
        c.fillStyle = rnd() < 0.5 ? 'rgba(58,59,64,.5)' : 'rgba(44,45,49,.55)';
        var bw = R(60, 320), bh = R(40, 200);
        c.fillRect(R(0, W), R(0, H), bw, bh);
      }
      speckle(c, W, H, rnd, Math.round(W * H / 700), ['#3d3e43', '#313236', '#434449', '#2b2c30'], 3);

      // sidewalks (paving) then lots inside them
      function blockRect(x0, y0, x1, y1) {
        c.fillStyle = '#63646a';
        c.fillRect(x0, y0, x1 - x0, y1 - y0);
        c.fillStyle = '#5a5b61';
        for (var ty = y0; ty < y1; ty += 26) {
          c.fillRect(x0, ty, x1 - x0, 1.5);
          for (var tx = x0 + (Math.floor(ty / 26) % 2 ? 13 : 0); tx < x1; tx += 26) c.fillRect(tx, ty, 1.5, 26);
        }
        // kerb highlight + shadow
        c.strokeStyle = 'rgba(140,142,148,.55)'; c.lineWidth = 2.5;
        c.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
        c.strokeStyle = 'rgba(16,17,20,.45)'; c.lineWidth = 3;
        c.strokeRect(x0 + 4, y0 + 4, x1 - x0 - 8, y1 - y0 - 8);
        // lot interior
        var lx0 = x0 + WALK, ly0 = y0 + WALK, lx1 = x1 - WALK, ly1 = y1 - WALK;
        if (lx1 <= lx0 || ly1 <= ly0) return;
        var kindLot = rnd();
        c.fillStyle = kindLot < 0.45 ? '#4a4b50' : (kindLot < 0.8 ? '#565144' : '#4d483c');
        c.fillRect(lx0, ly0, lx1 - lx0, ly1 - ly0);
        if (kindLot < 0.45) {
          // car park: painted bays + a couple of empty planters
          c.strokeStyle = 'rgba(226,222,206,.30)'; c.lineWidth = 2;
          for (var bx2 = lx0 + 26; bx2 < lx1 - 14; bx2 += 52) {
            c.beginPath(); c.moveTo(bx2, ly0 + 16); c.lineTo(bx2, ly1 - 16); c.stroke();
          }
          c.fillStyle = 'rgba(38,54,36,.55)';
          for (var pb = 0; pb < 3; pb++) c.fillRect(lx0 + R(20, lx1 - lx0 - 20), ly0 + R(14, ly1 - ly0 - 24), 26, 16);
        } else {
          // gravel yard with weeds and drag marks
          for (var wd = 0; wd < Math.round((lx1 - lx0) * (ly1 - ly0) / 2600); wd++) {
            c.fillStyle = rnd() < 0.5 ? 'rgba(78,92,54,.55)' : 'rgba(96,88,62,.5)';
            c.fillRect(R(lx0, lx1), R(ly0, ly1), R(3, 9), R(2, 6));
          }
          c.strokeStyle = 'rgba(30,29,26,.35)'; c.lineWidth = 3;
          for (var dr = 0; dr < 3; dr++) {
            var dx0 = R(lx0, lx1), dy0 = R(ly0, ly1);
            c.beginPath(); c.moveTo(dx0, dy0);
            c.quadraticCurveTo(dx0 + R(-60, 60), dy0 + R(-40, 40), dx0 + R(-90, 90), dy0 + R(-60, 60));
            c.stroke();
          }
        }
      }
      var xs = [0].concat(VX).concat([W]);
      var ys = [0].concat(HY).concat([H]);
      for (var bi = 0; bi < xs.length - 1; bi++) {
        for (var bj = 0; bj < ys.length - 1; bj++) {
          var x0 = xs[bi] + (bi ? ROAD / 2 : 40), x1 = xs[bi + 1] - (bi < xs.length - 2 ? ROAD / 2 : 40);
          var y0 = ys[bj] + (bj ? ROAD / 2 : 40), y1 = ys[bj + 1] - (bj < ys.length - 2 ? ROAD / 2 : 40);
          if (x1 > x0 && y1 > y0) blockRect(x0, y0, x1, y1);
        }
      }

      // roads on top of the block edges
      function road(x0, y0, x1, y1, vertical) {
        c.fillStyle = '#4a4b50';
        c.fillRect(x0, y0, x1 - x0, y1 - y0);
        c.fillStyle = 'rgba(30,31,35,.35)';
        if (vertical) c.fillRect(x0, y0, 6, y1 - y0); else c.fillRect(x0, y0, x1 - x0, 6);
        // faded centre line
        c.fillStyle = 'rgba(222,208,150,.42)';
        var p2;
        if (vertical) {
          for (p2 = y0; p2 < y1; p2 += 54) c.fillRect((x0 + x1) / 2 - 2, p2, 4, 26);
        } else {
          for (p2 = x0; p2 < x1; p2 += 54) c.fillRect(p2, (y0 + y1) / 2 - 2, 26, 4);
        }
      }
      VX.forEach(function (vx) { road(vx - ROAD / 2, 0, vx + ROAD / 2, H, true); });
      HY.forEach(function (hy) { road(0, hy - ROAD / 2, W, hy + ROAD / 2, false); });

      // crosswalks + manholes + tyre marks at every junction
      VX.forEach(function (vx) {
        HY.forEach(function (hy) {
          c.fillStyle = 'rgba(226,224,214,.5)';
          for (i = 0; i < 7; i++) {
            c.fillRect(vx - ROAD / 2 + 6 + i * 12, hy - ROAD / 2 - 26, 7, 20);
            c.fillRect(vx - ROAD / 2 + 6 + i * 12, hy + ROAD / 2 + 6, 7, 20);
            c.fillRect(vx - ROAD / 2 - 26, hy - ROAD / 2 + 6 + i * 12, 20, 7);
            c.fillRect(vx + ROAD / 2 + 6, hy - ROAD / 2 + 6 + i * 12, 20, 7);
          }
          c.fillStyle = 'rgba(24,25,28,.55)';
          c.beginPath(); c.arc(vx + R(-18, 18), hy + R(-18, 18), 9, 0, 6.2832); c.fill();
        });
      });

      // wear: cracks, potholes, oil, patches over both roads and lots
      for (i = 0; i < 260; i++) {
        var cx = R(0, W), cy = R(0, H);
        c.strokeStyle = 'rgba(14,15,18,' + R(0.25, 0.5).toFixed(2) + ')';
        c.lineWidth = R(0.8, 2);
        c.beginPath(); c.moveTo(cx, cy);
        for (var seg = 0; seg < 4; seg++) { cx += R(-32, 32); cy += R(-32, 32); c.lineTo(cx, cy); }
        c.stroke();
      }
      for (i = 0; i < 60; i++) {
        var ox = R(0, W), oy = R(0, H), orr = R(18, 52);
        var g2 = c.createRadialGradient(ox, oy, 2, ox, oy, orr);
        g2.addColorStop(0, 'rgba(12,12,14,.7)');
        g2.addColorStop(1, 'rgba(12,12,14,0)');
        c.fillStyle = g2;
        c.beginPath(); c.ellipse(ox, oy, orr, orr * R(0.4, 0.8), 0, 0, 6.2832); c.fill();
      }
      for (i = 0; i < 26; i++) {
        var px2 = R(0, W), py2 = R(0, H);
        c.fillStyle = 'rgba(96,86,66,' + R(0.25, 0.5).toFixed(2) + ')';
        c.beginPath(); c.ellipse(px2, py2, R(20, 60), R(10, 30), R(0, 3), 0, 6.2832); c.fill();
      }
      // puddles with a cold sheen
      for (i = 0; i < 14; i++) {
        var wx = R(0, W), wy = R(0, H), wr = R(24, 70);
        c.fillStyle = 'rgba(38,52,62,.55)';
        c.beginPath(); c.ellipse(wx, wy, wr, wr * 0.45, R(0, 3), 0, 6.2832); c.fill();
        c.strokeStyle = 'rgba(150,190,210,.25)'; c.lineWidth = 1.5;
        c.beginPath(); c.ellipse(wx, wy, wr * 0.8, wr * 0.32, 0, 0, 6.2832); c.stroke();
      }
      // rubble and litter
      speckle(c, W, H, rnd, Math.round(W * H / 1800), ['rgba(150,146,134,.45)', 'rgba(96,92,84,.5)', 'rgba(60,58,54,.5)'], 2);
      // war scorch near junctions
      for (i = 0; i < 7; i++) {
        var sx = VX[i % VX.length] + R(-120, 120), sy = HY[(i + 1) % HY.length] + R(-120, 120), sr = R(70, 130);
        var sg2 = c.createRadialGradient(sx, sy, 4, sx, sy, sr);
        sg2.addColorStop(0, 'rgba(10,10,12,.5)');
        sg2.addColorStop(1, 'rgba(10,10,12,0)');
        c.fillStyle = sg2;
        c.beginPath(); c.arc(sx, sy, sr, 0, 6.2832); c.fill();
      }
    },
    props: function (add, W, H, S, rnd) {
      var R = function (a, b) { return a + rnd() * (b - a); };
      var VX = [0.20 * W, 0.50 * W, 0.80 * W];
      var HY = [0.24 * H, 0.52 * H, 0.80 * H];
      var ROAD = 92, WALK = 20;
      var CARCOL = ['#8e9aa0', '#b4a184', '#7d3f3a', '#d3d6d0', '#3f5568', '#6e7c6a'];

      // buildings hugging every block edge, so cover is never far away
      function fillEdge(x0, y0, x1, y1, edge) {
        var len = edge === 'n' || edge === 's' ? (x1 - x0) : (y1 - y0);
        var pos = 0;
        while (pos < len - 40) {
          var wid = Math.min(len - pos, R(90, 190));
          var dep = R(54, 88);
          var bwx = edge === 'n' || edge === 's' ? wid : dep;
          var bwh = edge === 'n' || edge === 's' ? dep : wid;
          var bx, by;
          if (edge === 'n') { bx = x0 + pos + wid / 2; by = y0 + dep / 2; }
          else if (edge === 's') { bx = x0 + pos + wid / 2; by = y1 - dep / 2; }
          else if (edge === 'w') { bx = x0 + dep / 2; by = y0 + pos + wid / 2; }
          else { bx = x1 - dep / 2; by = y0 + pos + wid / 2; }
          add({
            kind: 'bldg', x: bx, y: by + bwh / 2, s: 1, w: bwx, h: bwh,
            tall: R(1.0, 2.4), ruined: rnd() < 0.5,
            wall: rnd() < 0.5 ? '#55565b' : '#5f5548',
            roof: ['#5b5d63', '#6a6357', '#525b5f', '#6d6455', '#5a5f57'][Math.floor(rnd() * 5)],
            wallDark: '#34353a', glass: rnd() < 0.3 ? '#9fc4d6' : '#6d8fa4',
            antenna: rnd() < 0.25, shop: rnd() < 0.35,
            r: Math.max(bwx, bwh) * 0.5
          });
          pos += wid + R(6, 26);
        }
      }
      var xs = [0].concat(VX).concat([W]);
      var ys = [0].concat(HY).concat([H]);
      for (var bi = 0; bi < xs.length - 1; bi++) {
        for (var bj = 0; bj < ys.length - 1; bj++) {
          var x0 = xs[bi] + (bi ? ROAD / 2 : 40) + WALK, x1 = xs[bi + 1] - (bi < xs.length - 2 ? ROAD / 2 : 40) - WALK;
          var y0 = ys[bj] + (bj ? ROAD / 2 : 40) + WALK, y1 = ys[bj + 1] - (bj < ys.length - 2 ? ROAD / 2 : 40) - WALK;
          if (x1 - x0 < 80 || y1 - y0 < 80) continue;
          fillEdge(x0, y0, x1, y1, 'n');
          fillEdge(x0, y0, x1, y1, 'w');
          if (rnd() < 0.7) fillEdge(x0, y0, x1, y1, 'e');
          if (rnd() < 0.55) fillEdge(x0, y0, x1, y1, 's');
          // yard clutter in the middle of the block
          var mcx = (x0 + x1) / 2, mcy = (y0 + y1) / 2;
          for (var q = 0; q < 4; q++) {
            add({ kind: 'rubble', x: mcx + R(-90, 90), y: mcy + R(-70, 70), s: R(0.7, 1.3), r: 12 });
          }
          if (rnd() < 0.8) add({ kind: 'car', x: mcx + R(-70, 70), y: mcy + R(-50, 50), s: R(0.9, 1.2), rot: R(0, 3.14), burnt: rnd() < 0.5, color: CARCOL[Math.floor(rnd() * CARCOL.length)], r: 16 });
          if (rnd() < 0.5) add({ kind: 'car', x: mcx + R(-80, 80), y: mcy + R(-60, 60), s: R(0.85, 1.1), rot: R(0, 3.14), burnt: true, r: 16 });
          if (rnd() < 0.5) add({ kind: 'fence', x: mcx, y: mcy + 60, s: 1, len: 120, r: 10 });
          if (rnd() < 0.55) add({ kind: 'tank', x: mcx + R(-80, 80), y: mcy + R(-55, 55), s: R(0.45, 0.75), r: 14 });
          add({ kind: 'sandbag', x: mcx + R(-90, 90), y: mcy + R(-60, 60), s: R(0.9, 1.3), r: 13 });
          for (var rq = 0; rq < 2; rq++) add({ kind: 'rubble', x: mcx + R(-95, 95), y: mcy + R(-65, 65), s: R(0.6, 1.1), r: 11 });
        }
      }

      // parked wrecks along every kerb
      VX.forEach(function (vx) {
        for (var y = 120; y < H - 120; y += R(150, 280)) {
          add({ kind: 'car', x: vx - ROAD / 2 + 16, y: y, s: R(0.9, 1.2), rot: 1.57, burnt: rnd() < 0.45, color: CARCOL[Math.floor(rnd() * CARCOL.length)], r: 16 });
          if (rnd() < 0.6) add({ kind: 'car', x: vx + ROAD / 2 - 16, y: y + R(40, 120), s: R(0.9, 1.2), rot: 1.57, burnt: rnd() < 0.45, color: CARCOL[Math.floor(rnd() * CARCOL.length)], r: 16 });
        }
      });
      HY.forEach(function (hy) {
        for (var x = 140; x < W - 140; x += R(170, 300)) {
          add({ kind: 'car', x: x, y: hy - ROAD / 2 + 16, s: R(0.9, 1.2), rot: 0, burnt: rnd() < 0.45, color: CARCOL[Math.floor(rnd() * CARCOL.length)], r: 16 });
        }
      });

      // lamps, barricades and sandbag checkpoints at junctions
      VX.forEach(function (vx) {
        HY.forEach(function (hy) {
          add({ kind: 'lamp', x: vx - ROAD / 2 - 14, y: hy - ROAD / 2 - 10, s: 1, dead: rnd() < 0.45, r: 7 });
          add({ kind: 'lamp', x: vx + ROAD / 2 + 14, y: hy + ROAD / 2 + 10, s: 1, dead: rnd() < 0.45, r: 7 });
          add({ kind: 'sandbag', x: vx + R(-26, 26), y: hy + ROAD / 2 + 26, s: R(1, 1.4), r: 13 });
          add({ kind: 'sandbag', x: vx + R(-26, 26), y: hy - ROAD / 2 - 26, s: R(1, 1.4), r: 13 });
          add({ kind: 'rubble', x: vx + R(-40, 40), y: hy + R(-30, 30), s: R(0.8, 1.2), r: 12 });
        });
      });
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
