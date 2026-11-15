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

  /* ---------------- war-torn city block ---------------- */
  function bldg(c, p) {
    var s = p.s || 1, x = p.x, y = p.y;
    var w = (p.w || 74) * s, h = (p.h || 58) * s, tall = (p.tall || 1);
    var wall = p.wall || '#4a4a4e', wallDark = p.wallDark || '#333336';
    // ground shadow
    c.globalAlpha = 0.34; c.fillStyle = '#0a0b0d';
    c.beginPath(); c.ellipse(x + 8 * s, y + 4, w * 0.55, h * 0.20, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    // facade
    rr(c, x - w / 2, y - h * tall, w, h * tall, wallDark);
    rr(c, x - w / 2, y - h * tall, w * 0.42, h * tall, wall);
    // roof slab with a jagged war-damaged edge
    var ry = y - h * tall;
    rr(c, x - w / 2 - 3 * s, ry - 6 * s, w + 6 * s, 7 * s, '#2e2f33');
    if (p.ruined) {
      c.fillStyle = '#1b1c1f';
      for (var i = 0; i < 3; i++) {
        var bx = x - w / 2 + w * (0.15 + i * 0.3);
        c.beginPath();
        c.moveTo(bx, ry - 5 * s);
        c.lineTo(bx + w * 0.14, ry - 5 * s);
        c.lineTo(bx + w * 0.08, ry + 9 * s);
        c.closePath(); c.fill();
      }
    }
    // windows
    var cols = Math.max(2, Math.round(w / (17 * s)));
    var rows = Math.max(2, Math.round((h * tall) / (20 * s)));
    for (var r2 = 0; r2 < rows; r2++) {
      for (var c2 = 0; c2 < cols; c2++) {
        var wx = x - w / 2 + 7 * s + c2 * (w - 14 * s) / Math.max(1, cols - 1);
        var wy = ry + 9 * s + r2 * ((h * tall - 14 * s) / Math.max(1, rows));
        if (wx + 6 * s > x + w / 2 - 5 * s) continue;
        var broken = p.ruined && ((r2 * 7 + c2 * 3) % 5 === 0);
        c.globalAlpha = broken ? 0.9 : 0.85;
        c.fillStyle = broken ? '#0c0d10' : (p.glass || '#7d9fb5');
        c.fillRect(wx, wy, 6 * s, 8 * s);
        c.globalAlpha = 1;
      }
    }
    // grime streaks
    c.globalAlpha = 0.18; c.fillStyle = '#121316';
    for (var g2 = 0; g2 < 4; g2++) c.fillRect(x - w / 2 + (g2 + 0.5) * w / 5, ry + 4 * s, 2 * s, h * tall * 0.7);
    c.globalAlpha = 1;
    // outline
    c.strokeStyle = 'rgba(8,9,11,.75)'; c.lineWidth = 1.4;
    c.strokeRect(x - w / 2, ry, w, h * tall);
  }

  /* ---------------- burnt-out car ---------------- */
  function car(c, p) {
    var s = p.s || 1, x = p.x, y = p.y, rot = p.rot || 0;
    c.save(); c.translate(x, y); c.rotate(rot);
    c.globalAlpha = 0.3; c.fillStyle = '#0a0b0d';
    c.beginPath(); c.ellipse(3 * s, 3 * s, 20 * s, 9 * s, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = p.burnt ? '#2a2624' : '#5a6b71';
    c.beginPath();
    c.moveTo(-19 * s, 0); c.lineTo(-13 * s, -10 * s); c.lineTo(9 * s, -10 * s);
    c.lineTo(19 * s, -1 * s); c.lineTo(17 * s, 7 * s); c.lineTo(-17 * s, 7 * s);
    c.closePath(); c.fill();
    c.fillStyle = p.burnt ? '#3a332e' : '#3d4b52';
    c.fillRect(-9 * s, -8 * s, 15 * s, 6 * s);
    c.fillStyle = 'rgba(140,190,210,.55)';
    c.fillRect(-9 * s, -8 * s, 15 * s, 3 * s);
    c.strokeStyle = 'rgba(8,9,11,.8)'; c.lineWidth = 1.2; c.stroke();
    c.restore();
  }

  /* ---------------- razor wire fence segment ---------------- */
  function fence(c, p) {
    var s = p.s || 1, x = p.x, y = p.y, len = (p.len || 96) * s;
    var h = 34 * s;
    c.strokeStyle = '#5c5f63'; c.lineWidth = 2 * s;
    c.beginPath(); c.moveTo(x - len / 2, y); c.lineTo(x - len / 2, y - h * 0.7); c.stroke();
    c.beginPath(); c.moveTo(x + len / 2, y); c.lineTo(x + len / 2, y - h * 0.7); c.stroke();
    c.strokeStyle = 'rgba(150,155,160,.55)'; c.lineWidth = 1;
    for (var i = 0; i < 7; i++) {
      var yy = y - h * 0.7 + i * (h * 0.7 / 6);
      c.beginPath(); c.moveTo(x - len / 2, yy); c.lineTo(x + len / 2, yy); c.stroke();
    }
    c.strokeStyle = 'rgba(190,196,200,.8)';
    c.beginPath();
    for (var d = 0; d < len; d += 10 * s) {
      c.lineTo(x - len / 2 + d, y - h * 0.72 + Math.sin(d * 0.4) * 2 * s);
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
