/* BERMUDA SURVIVAL — extra scenery for the region kits.
   Buildings, cars, fences, lamps, fuel tanks and temple columns.
   Everything is drawn from its base line so the y-sort stays honest. */
window.PROPS2 = (function () {
  'use strict';

  function rr(c, x, y, w, h, col, alpha) {
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.fillStyle = col; c.fillRect(x, y, w, h);
    c.globalAlpha = 1;
  }

  /* deterministic per-prop noise so a building always looks the same */
  function hash(a, b, c) {
    var t = Math.sin(a * 127.1 + b * 311.7 + (c || 0) * 74.7) * 43758.5453;
    return t - Math.floor(t);
  }

  /* ---------------- war-torn city block (top-down, real roof) ---------------- */
  function bldg(c, p) {
    var s = p.s || 1, x = p.x, y = p.y;
    var w = (p.w || 74) * s, h = (p.h || 58) * s, tall = (p.tall || 1);
    var lift = (7 + tall * 7) * s;
    var rx = x - w / 2, ry = y - h - lift;
    var wall = p.wall || '#55565b', roof = p.roof || '#6b6d73';
    var dark = p.wallDark || '#33343a';

    // soft cast shadow to the south-east (stacked offsets instead of one slab)
    c.fillStyle = '#07080a';
    var shOff = [[0.35, 0.28], [0.72, 0.6], [1.15, 0.95], [1.6, 1.35]];
    for (var shi = 0; shi < shOff.length; shi++) {
      c.globalAlpha = [0.16, 0.11, 0.07, 0.05][shi];
      c.fillRect(rx + lift * shOff[shi][0], ry + lift * shOff[shi][1], w, h);
    }
    c.globalAlpha = 1;

    // front wall (the strip you see under the roof)
    c.fillStyle = dark; c.fillRect(rx, y - lift, w, lift);
    c.fillStyle = wall; c.fillRect(rx, y - lift, w, lift * 0.55);
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(rx, y - lift * 0.25, w, lift * 0.25);
    // ground-floor doors and boarded shopfronts along that strip
    var bays = Math.max(2, Math.round(w / (30 * s)));
    for (var bi = 0; bi < bays; bi++) {
      var bx = rx + (bi + 0.5) * (w / bays) - 9 * s;
      var lit = hash(p.x, p.y, bi) < 0.3;
      c.fillStyle = lit ? 'rgba(255,205,120,.35)' : 'rgba(12,13,16,.75)';
      c.fillRect(bx, y - lift * 0.8, 18 * s, lift * 0.6);
      c.fillStyle = 'rgba(120,124,130,.5)';
      c.fillRect(bx - 1, y - lift * 0.82, 20 * s, 1.5 * s);
    }

    // roof plane
    c.fillStyle = roof; c.fillRect(rx, ry, w, h);
    // tar seams
    c.strokeStyle = 'rgba(28,29,33,.35)'; c.lineWidth = Math.max(0.7, 1.1 * s);
    for (var sy = ry + 12; sy < ry + h - 4; sy += 16 * s) {
      c.beginPath(); c.moveTo(rx + 2, sy); c.lineTo(rx + w - 2, sy); c.stroke();
    }
    // gravel + stain patches
    for (var gi = 0; gi < Math.round(w * h / 900) + 6; gi++) {
      var gx = rx + hash(p.x, p.y, gi) * w, gy = ry + hash(p.y, gi, p.x) * h;
      c.fillStyle = hash(gi, p.x, 3) < 0.5 ? 'rgba(88,90,96,.55)' : 'rgba(52,54,59,.5)';
      c.fillRect(gx, gy, 2 * s, 2 * s);
    }
    for (var si = 0; si < 3; si++) {
      var sx2 = rx + hash(p.x, si, 7) * (w * 0.7), sy2 = ry + hash(si, p.y, 2) * (h * 0.7);
      var sg = c.createRadialGradient(sx2, sy2, 1, sx2, sy2, 26 * s);
      sg.addColorStop(0, 'rgba(26,27,30,.16)');
      sg.addColorStop(1, 'rgba(26,27,30,0)');
      c.fillStyle = sg;
      c.beginPath(); c.arc(sx2, sy2, 26 * s, 0, 6.2832); c.fill();
    }
    // parapet: lit top/left edge, dark inner lip
    c.strokeStyle = 'rgba(168,170,176,.55)'; c.lineWidth = 2 * s;
    c.beginPath(); c.moveTo(rx, ry + h); c.lineTo(rx, ry); c.lineTo(rx + w, ry); c.stroke();
    c.strokeStyle = 'rgba(14,15,18,.55)';
    c.beginPath(); c.moveTo(rx + w, ry); c.lineTo(rx + w, ry + h); c.lineTo(rx, ry + h); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = 1 * s;
    c.strokeRect(rx + 4 * s, ry + 4 * s, w - 8 * s, h - 8 * s);

    // rooftop clutter: AC units, vents, skylight, stair hut
    var units = 1 + Math.round(hash(p.x, p.y, 11) * 3);
    for (var ui = 0; ui < units; ui++) {
      var ux = rx + 10 * s + hash(p.x, ui, 5) * Math.max(4, w - 34 * s);
      var uy = ry + 10 * s + hash(ui, p.y, 9) * Math.max(4, h - 30 * s);
      var uw = (10 + hash(ui, 2, p.x) * 8) * s;
      c.fillStyle = 'rgba(18,19,22,.45)'; c.fillRect(ux + 3 * s, uy + 3 * s, uw, uw * 0.7);
      c.fillStyle = '#8b8f96'; c.fillRect(ux, uy, uw, uw * 0.7);
      c.fillStyle = '#5d6168'; c.fillRect(ux + 2 * s, uy + 2 * s, uw - 4 * s, uw * 0.35);
      c.strokeStyle = 'rgba(240,244,248,.35)'; c.lineWidth = 1;
      c.strokeRect(ux + 0.5, uy + 0.5, uw - 1, uw * 0.7 - 1);
    }
    var hut = hash(p.y, p.x, 13) < 0.6;
    if (hut) {
      var hw = Math.min(30 * s, w * 0.42), hh = Math.min(24 * s, h * 0.4);
      var hx = rx + w * 0.5 + (hash(p.x, 8, 1) - 0.5) * (w - hw - 12 * s);
      var hy = ry + h * 0.5 + (hash(8, p.y, 1) - 0.5) * (h - hh - 12 * s);
      c.fillStyle = 'rgba(16,17,20,.45)'; c.fillRect(hx + 4 * s, hy + 4 * s, hw, hh);
      c.fillStyle = '#7d8188'; c.fillRect(hx, hy, hw, hh);
      c.fillStyle = '#9aa0a8'; c.fillRect(hx + 2 * s, hy + 2 * s, hw - 4 * s, hh * 0.4);
      c.strokeStyle = 'rgba(20,21,24,.6)'; c.lineWidth = 1; c.strokeRect(hx + 0.5, hy + 0.5, hw, hh);
    }
    if (hash(p.x, p.y, 17) < 0.5) {
      var sky = 12 * s;
      c.fillStyle = '#7fb0c6';
      c.fillRect(rx + w * 0.22, ry + h * 0.22, sky, sky * 0.8);
      c.fillStyle = 'rgba(230,245,255,.55)';
      c.fillRect(rx + w * 0.22, ry + h * 0.22, sky, sky * 0.22);
    }
    if (p.antenna) {
      c.strokeStyle = '#9ba0a6'; c.lineWidth = 1.4 * s;
      c.beginPath(); c.moveTo(rx + w * 0.72, ry + h * 0.3); c.lineTo(rx + w * 0.72, ry + h * 0.3 - 20 * s); c.stroke();
      c.beginPath(); c.moveTo(rx + w * 0.72 - 7 * s, ry + h * 0.3 - 14 * s); c.lineTo(rx + w * 0.72 + 7 * s, ry + h * 0.3 - 14 * s); c.stroke();
    }

    // war damage: holes through the roof + exposed beams + rubble at the base
    if (p.ruined) {
      var holes = 1 + Math.round(hash(p.x, 3, p.y) * 2);
      for (var hi = 0; hi < holes; hi++) {
        var hcx = rx + w * (0.25 + hash(hi, p.x, 4) * 0.5);
        var hcy = ry + h * (0.25 + hash(p.y, hi, 6) * 0.5);
        var hr = (10 + hash(hi, hi, 1) * 14) * s;
        c.fillStyle = '#16171a';
        c.beginPath();
        for (var a2 = 0; a2 < 9; a2++) {
          var ang = a2 / 9 * 6.2832, rad = hr * (0.65 + hash(hi, a2, 3) * 0.6);
          var px2 = hcx + Math.cos(ang) * rad, py2 = hcy + Math.sin(ang) * rad * 0.8;
          if (a2 === 0) c.moveTo(px2, py2); else c.lineTo(px2, py2);
        }
        c.closePath(); c.fill();
        // scorched rim + a few bent beams poking out of the hole
        c.strokeStyle = 'rgba(38,36,34,.75)'; c.lineWidth = 3 * s; c.stroke();
        c.strokeStyle = 'rgba(152,146,134,.7)'; c.lineWidth = 1.6 * s;
        for (var bi2 = 0; bi2 < 3; bi2++) {
          var ba = hash(hi, bi2, 9) * 6.2832;
          c.beginPath();
          c.moveTo(hcx + Math.cos(ba) * hr * 0.3, hcy + Math.sin(ba) * hr * 0.3);
          c.lineTo(hcx + Math.cos(ba) * hr * 1.35, hcy + Math.sin(ba) * hr * 1.2);
          c.stroke();
        }
      }
      c.fillStyle = 'rgba(178,172,158,.75)';
      for (var di = 0; di < 8; di++) {
        var dx = rx + hash(p.x, di, 21) * w, dy = y - hash(di, p.y, 22) * 12 * s;
        c.fillRect(dx, dy, (3 + hash(di, 1, 1) * 7) * s, (2 + hash(di, 2, 2) * 5) * s);
      }
    }

    // crisp silhouette
    c.strokeStyle = 'rgba(9,10,13,.85)'; c.lineWidth = 1.5 * s;
    c.strokeRect(rx, ry, w, h);
  }

  /* ---------------- top-down car / burnt wreck ---------------- */
  function car(c, p) {
    var s = p.s || 1, x = p.x, y = p.y, rot = p.rot || 0;
    c.save(); c.translate(x, y); c.rotate(rot);
    // shadow
    c.globalAlpha = 0.32; c.fillStyle = '#07080a';
    c.beginPath(); c.ellipse(3 * s, 4 * s, 21 * s, 10 * s, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    var body = p.burnt ? '#2f2a26' : (p.color || '#7c8f96');
    var bodyDark = p.burnt ? '#211d1a' : '#4e5f66';
    // wheels
    c.fillStyle = '#141518';
    [[-12, -9], [-12, 9], [12, -9], [12, 9]].forEach(function (o) {
      c.beginPath(); c.ellipse(o[0] * s, o[1] * s, 4.6 * s, 3.1 * s, 0, 0, 6.2832); c.fill();
    });
    // chassis
    c.fillStyle = bodyDark;
    c.beginPath();
    c.moveTo(-21 * s, -8.5 * s); c.quadraticCurveTo(-21 * s, -10.5 * s, -17 * s, -10.5 * s);
    c.lineTo(15 * s, -10.5 * s); c.quadraticCurveTo(21 * s, -10.5 * s, 21 * s, -6 * s);
    c.lineTo(21 * s, 6 * s); c.quadraticCurveTo(21 * s, 10.5 * s, 15 * s, 10.5 * s);
    c.lineTo(-17 * s, 10.5 * s); c.quadraticCurveTo(-21 * s, 10.5 * s, -21 * s, 8.5 * s);
    c.closePath(); c.fill();
    // bonnet + boot highlights
    c.fillStyle = body;
    c.beginPath(); c.roundRect ? c.roundRect(-20 * s, -9 * s, 40 * s, 18 * s, 5 * s) : c.rect(-20 * s, -9 * s, 40 * s, 18 * s); c.fill();
    c.fillStyle = 'rgba(255,255,255,.14)';
    c.beginPath(); c.moveTo(-18 * s, -8 * s); c.lineTo(14 * s, -8 * s); c.lineTo(11 * s, -4 * s); c.lineTo(-18 * s, -4 * s); c.closePath(); c.fill();
    // windscreen + rear glass
    c.fillStyle = p.burnt ? '#141518' : 'rgba(150,200,220,.72)';
    c.beginPath(); c.moveTo(7 * s, -7.5 * s); c.lineTo(13 * s, -5 * s); c.lineTo(13 * s, 5 * s); c.lineTo(7 * s, 7.5 * s); c.closePath(); c.fill();
    c.fillStyle = p.burnt ? '#141518' : 'rgba(120,170,192,.55)';
    c.beginPath(); c.moveTo(-11 * s, -7 * s); c.lineTo(-6 * s, -5 * s); c.lineTo(-6 * s, 5 * s); c.lineTo(-11 * s, 7 * s); c.closePath(); c.fill();
    // roof
    c.fillStyle = p.burnt ? '#37302b' : 'rgba(255,255,255,.12)';
    c.fillRect(-6 * s, -7 * s, 12 * s, 14 * s);
    // lights
    c.fillStyle = p.burnt ? '#3a3530' : 'rgba(255,240,210,.9)';
    c.fillRect(19 * s, -7 * s, 2.4 * s, 4 * s); c.fillRect(19 * s, 3 * s, 2.4 * s, 4 * s);
    c.fillStyle = p.burnt ? '#3a2620' : 'rgba(220,80,60,.8)';
    c.fillRect(-21 * s, -7 * s, 2.2 * s, 4 * s); c.fillRect(-21 * s, 3 * s, 2.2 * s, 4 * s);
    // rust blooms / missing panels
    if (p.burnt) {
      c.fillStyle = 'rgba(120,66,38,.5)';
      c.beginPath(); c.ellipse(2 * s, 1 * s, 9 * s, 5 * s, 0.4, 0, 6.2832); c.fill();
      c.fillStyle = '#191513';
      c.beginPath(); c.ellipse(-15 * s, -3 * s, 4 * s, 3 * s, 0.2, 0, 6.2832); c.fill();
    }
    c.strokeStyle = 'rgba(8,9,11,.8)'; c.lineWidth = 1.1 * s;
    c.beginPath(); c.roundRect ? c.roundRect(-20 * s, -9 * s, 40 * s, 18 * s, 5 * s) : c.rect(-20 * s, -9 * s, 40 * s, 18 * s); c.stroke();
    c.restore();
  }

  /* ---------------- razor-wire fence, seen from above ---------------- */
  function fence(c, p) {
    var s = p.s || 1, x = p.x, y = p.y, len = (p.len || 96) * s;
    // shadow band and the two rails
    c.fillStyle = 'rgba(6,15,18,.30)';
    c.fillRect(x - len / 2 + 5 * s, y - 2 * s, len, 6 * s);
    c.strokeStyle = 'rgba(148,154,158,.85)'; c.lineWidth = 1.6 * s;
    c.beginPath(); c.moveTo(x - len / 2, y - 3 * s); c.lineTo(x + len / 2, y - 3 * s); c.stroke();
    c.beginPath(); c.moveTo(x - len / 2, y + 3 * s); c.lineTo(x + len / 2, y + 3 * s); c.stroke();
    // mesh diamonds
    c.strokeStyle = 'rgba(178,184,188,.42)'; c.lineWidth = 0.9 * s;
    for (var d = 0; d < len; d += 7 * s) {
      c.beginPath();
      c.moveTo(x - len / 2 + d, y - 3 * s);
      c.lineTo(x - len / 2 + d + 3.5 * s, y + 3 * s);
      c.stroke();
    }
    // concrete posts
    c.fillStyle = '#9aa0a4';
    for (var q = 0; q <= len; q += len / 4) {
      c.fillRect(x - len / 2 + q - 2 * s, y - 5 * s, 4 * s, 10 * s);
    }
    c.fillStyle = 'rgba(20,24,26,.5)';
    for (var q2 = 0; q2 <= len; q2 += len / 4) {
      c.fillRect(x - len / 2 + q2 + 2 * s, y - 4 * s, 2.4 * s, 9 * s);
    }
    // razor coils along the top rail
    c.strokeStyle = 'rgba(210,216,220,.55)'; c.lineWidth = 1 * s;
    c.beginPath();
    for (var r2 = 0; r2 <= len; r2 += 6 * s) {
      c.lineTo(x - len / 2 + r2, y - 6 * s + Math.sin(r2 * 0.5) * 2.4 * s);
    }
    c.stroke();
  }

  /* ---------------- street / flood lamp ---------------- */
  function lamp(c, p) {
    var s = p.s || 1, x = p.x, y = p.y;
    c.strokeStyle = '#3a3d42'; c.lineWidth = 3 * s;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 52 * s); c.stroke();
    c.beginPath(); c.moveTo(x, y - 52 * s); c.lineTo(x + 10 * s, y - 52 * s); c.stroke();
    if (!p.dead) {
      var g = c.createRadialGradient(x + 10 * s, y - 50 * s, 2, x + 10 * s, y - 50 * s, 46 * s);
      g.addColorStop(0, 'rgba(255,232,170,.32)');
      g.addColorStop(1, 'rgba(255,220,140,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x + 10 * s, y - 50 * s, 46 * s, 0, 6.2832); c.fill();
      c.fillStyle = '#ffe9b0';
    } else c.fillStyle = '#4a4a4a';
    c.fillRect(x + 7 * s, y - 53 * s, 7 * s, 4 * s);
  }

  /* ---------------- fuel / water tank ---------------- */
  function tank(c, p) {
    var s = p.s || 1, x = p.x, y = p.y, r = (p.r2 || 24) * s, h = 34 * s;
    c.globalAlpha = 0.3; c.fillStyle = '#0a0b0d';
    c.beginPath(); c.ellipse(x + 5 * s, y + 3, r * 1.1, r * 0.4, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = p.tankCol || '#8a8f93';
    c.fillRect(x - r, y - h, r * 2, h);
    c.fillStyle = 'rgba(255,255,255,.16)';
    c.fillRect(x - r, y - h, r * 0.35, h);
    c.fillStyle = '#6d7276';
    c.beginPath(); c.ellipse(x, y - h, r, r * 0.32, 0, 0, 6.2832); c.fill();
    c.strokeStyle = 'rgba(20,22,24,.7)'; c.lineWidth = 1.4;
    c.strokeRect(x - r, y - h, r * 2, h);
    c.beginPath(); c.moveTo(x - r, y - h * 0.45); c.lineTo(x + r, y - h * 0.45); c.stroke();
  }

  /* ---------------- temple column ---------------- */
  function column(c, p) {
    var s = p.s || 1, x = p.x, y = p.y, h = (p.h2 || 54) * s, w = 9 * s;
    var broken = p.broken;
    c.globalAlpha = 0.28; c.fillStyle = '#0d120e';
    c.beginPath(); c.ellipse(x + 4, y + 3, w * 1.5, w * 0.5, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = p.col || '#b9ae95';
    var top = y - (broken ? h * 0.45 : h);
    c.fillRect(x - w / 2, top, w, y - top);
    c.fillStyle = 'rgba(255,255,255,.18)';
    c.fillRect(x - w / 2, top, w * 0.3, y - top);
    c.fillStyle = 'rgba(60,58,48,.35)';
    for (var i = 0; i < 4; i++) c.fillRect(x - w / 2, top + (i + 1) * (y - top) / 5, w, 1.5);
    if (!broken) {
      c.fillStyle = p.col || '#b9ae95';
      c.fillRect(x - w * 0.8, top - 5 * s, w * 1.6, 5 * s);
      c.fillRect(x - w * 0.8, y - 4 * s, w * 1.6, 4 * s);
    }
    c.strokeStyle = 'rgba(40,40,34,.55)'; c.lineWidth = 1; c.strokeRect(x - w / 2, top, w, y - top);
  }

  function rubble(c, p) {
    var s = p.s || 1, x = p.x, y = p.y;
    var cols = ['#565a5e', '#46494d', '#6a6e72', '#3a3d40'];
    for (var i = 0; i < 7; i++) {
      var a = i * 2.4, r = (4 + (i % 3) * 3) * s;
      c.fillStyle = cols[i % cols.length];
      c.beginPath();
      c.moveTo(x + Math.cos(a) * r * 2, y + Math.sin(a) * r * 0.8);
      c.lineTo(x + Math.cos(a + 1) * r * 2, y + Math.sin(a + 1) * r * 0.8 - r);
      c.lineTo(x + Math.cos(a + 2) * r * 2, y + Math.sin(a + 2) * r * 0.8);
      c.closePath(); c.fill();
    }
  }

  return {
    bldg: bldg, car: car, fence: fence, lamp: lamp, tank: tank, column: column, rubble: rubble
  };
})();
