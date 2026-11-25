/* ============================================================
   BERMUDA SURVIVAL — SCENE PAINTER
   Vector layers drawn on top of the baked terrain:
   roads, props, buildings, vegetation, then screen-space
   markers / labels. All layers are view-culled.
   ============================================================ */
(function (BS) {
  'use strict';
  var P = {};
  BS.Painter = P;

  /* ---------------- icon library ---------------- */
  var ICONS = {
    player:    { c: '#7ef0ff', l: 'شخصیت بازیکن', d: 'M12 2 L20.5 21 L12 16.6 L3.5 21 Z', m: 'fill' },
    main:      { c: '#ffd166', l: 'مأموریت اصلی', d: 'M12 2 L22 12 L12 22 L2 12 Z', m: 'fill' },
    side:      { c: '#ffb347', l: 'مأموریت فرعی', d: 'M12 3a9 9 0 100 18 9 9 0 000-18z', m: 'stroke' },
    safehouse: { c: '#7ee787', l: 'پناهگاه امن', d: 'M3 11.2 L12 3.4 L21 11.2 V20.6 H14.4 V14.4 H9.6 V20.6 H3 Z', m: 'fill' },
    shop:      { c: '#ffd479', l: 'فروشگاه', d: 'M2.5 4.4h2.6l2.5 9.9h9.2l2.3-7.2H6.4 M9 20a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z M17.5 20a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2z', m: 'stroke' },
    workbench: { c: '#9ad2ff', l: 'میز کار', d: 'M2.6 18.4h18.8 M6 18.4V9h12v9.4 M9.2 9V4.6h5.6V9', m: 'stroke' },
    vehicle:   { c: '#8fe3ff', l: 'خودرو / قایق', d: 'M3.4 15.4h17.2l-2-5.6H5.4z M6.6 15.4a1.7 1.7 0 100 3.3 1.7 1.7 0 000-3.3z M17.4 15.4a1.7 1.7 0 100 3.3 1.7 1.7 0 000-3.3z M6 9.8h12', m: 'stroke' },
    radio:     { c: '#a7f3ff', l: 'برج رادیو', d: 'M12 3.4v17.2 M8.2 20.6h7.6 M12 8.4 L6.6 20.6 M12 8.4 L17.4 20.6 M12 3.4a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6z', m: 'stroke' },
    alien:     { c: '#c88bff', l: 'تأسیسات فضایی', d: 'M12 2 L19 7.2 V15.4 L12 22 L5 15.4 V7.2 Z M12 6.4 L15.4 9.2 V13.6 L12 17 L8.6 13.6 V9.2 Z', m: 'fill' },
    locked:    { c: '#ff8f7a', l: 'منطقه‌ی قفل‌شده', d: 'M7.4 10.6V7.8a4.6 4.6 0 019.2 0v2.8 M5.6 10.6h12.8v9.8H5.6z M12 14v3', m: 'stroke' },
    danger:    { c: '#ff5b6e', l: 'منطقه‌ی خطر', d: 'M12 2.4l9.6 17.2H2.4z', m: 'fill', eye: true },
    airport:   { c: '#8fe3ff', l: 'فرودگاه', d: 'M2 13.6 L21.6 8.2 L19 12.4 L12.8 13.9 L10.6 19.6 L8.6 18.4 L9.6 14.2 L5.6 15.6 Z', m: 'fill' },
    region:    { c: '#ffffff', l: 'منطقه', d: '', m: 'none' }
  };
  BS.ICONS = ICONS;

  var iconPathCache = {};
  function iconPath(type) {
    if (!iconPathCache[type]) iconPathCache[type] = new Path2D(ICONS[type].d);
    return iconPathCache[type];
  }
  BS.iconPath = iconPath;

  /* ---------------- sprite factory ---------------- */
  var sprites = {};
  function makeTreeSprite(type, v) {
    var S = 96, R = BS.util.mulberry32(1000 + v * 37 + type.length * 13);
    var cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    var c = cv.getContext('2d');
    var cx = S / 2, cy = S / 2;
    function blob(x, y, r, col, a) {
      var g = c.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.15, x, y, r);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = a === undefined ? 1 : a;
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
      c.globalAlpha = 1;
    }
    if (type === 'palm') {
      var base = 0.55 + R() * 0.2;
      for (var i = 0; i < 7; i++) {
        var a = (i / 7) * 6.2832 + R() * 0.4;
        var len = 26 + R() * 10;
        c.strokeStyle = 'rgba(28,72,34,' + base + ')';
        c.lineWidth = 5.5;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(cx, cy);
        c.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.5 - 4,
          cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        c.stroke();
        c.strokeStyle = 'rgba(74,126,52,' + (base * 0.9) + ')';
        c.lineWidth = 2.6;
        c.stroke();
      }
      c.fillStyle = 'rgba(38,84,40,.9)';
      c.beginPath(); c.arc(cx, cy, 4.2, 0, 6.2832); c.fill();
    } else if (type === 'rock') {
      blob(cx, cy, 30, '#6f6a5f', 0.95);
      c.fillStyle = 'rgba(120,116,104,.9)';
      c.beginPath();
      c.moveTo(cx - 20, cy + 8); c.lineTo(cx - 8, cy - 18); c.lineTo(cx + 14, cy - 12);
      c.lineTo(cx + 20, cy + 10); c.closePath(); c.fill();
      c.fillStyle = 'rgba(60,58,52,.45)';
      c.beginPath();
      c.moveTo(cx - 20, cy + 8); c.lineTo(cx + 20, cy + 10); c.lineTo(cx + 6, cy + 20);
      c.closePath(); c.fill();
    } else if (type === 'bush') {
      blob(cx, cy + 3, 24, '#4c7a3c', 0.9);
      blob(cx - 7, cy - 4, 15, '#5d8c44', 0.85);
      blob(cx + 9, cy - 2, 12, '#3f6b34', 0.8);
    } else if (type === 'mangrove') {
      c.strokeStyle = 'rgba(46,58,38,.85)';
      c.lineWidth = 2.4;
      for (var k = 0; k < 6; k++) {
        var aa = (k / 6) * 6.2832 + 0.3;
        c.beginPath(); c.moveTo(cx, cy + 12);
        c.quadraticCurveTo(cx + Math.cos(aa) * 10, cy + Math.sin(aa) * 8, cx + Math.cos(aa) * 20, cy + Math.sin(aa) * 14);
        c.stroke();
      }
      blob(cx, cy - 2, 22, '#3d6b3a', 0.92);
      blob(cx - 5, cy - 6, 13, '#527f42', 0.8);
    } else {
      var dark = ['#20492c', '#1c4128', '#26512f'][v % 3];
      var light = ['#3f7a3f', '#357038', '#478246'][v % 3];
      blob(cx, cy + 3, 34, dark, 0.95);
      blob(cx - 6, cy - 4, 25, light, 0.9);
      blob(cx + 8, cy - 6, 18, light, 0.55);
      blob(cx - 10, cy + 8, 16, '#173d24', 0.5);
    }
    return cv;
  }

  function buildSprites() {
    var types = ['jungle', 'palm', 'bush', 'rock', 'mangrove'];
    for (var t = 0; t < types.length; t++) {
      sprites[types[t]] = [];
      for (var v = 0; v < 3; v++) sprites[types[t]].push(makeTreeSprite(types[t], v));
    }
    P.sprites = sprites;
  }
  P.buildSprites = buildSprites;

  /* ---------------- helpers ---------------- */
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
  function rotRect(c, x, y, w, h, rot) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.beginPath(); c.rect(-w / 2, -h / 2, w, h);
    c.restore();
  }
  function inView(v, x, y, pad) {
    return x > v.x0 - pad && x < v.x1 + pad && y > v.y0 - pad && y < v.y1 + pad;
  }

  /* ---------------- roads ---------------- */
  function strokeRoad(c, pts, w) {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      c.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    c.stroke();
  }

  function drawRoads(c, v, z) {
    var roads = BS.world.roads, i, r, pts, j;
    c.lineJoin = 'round'; c.lineCap = 'round';
    var detail = z > 0.30;

    // 1) casing + surface, all roads
    for (i = 0; i < roads.length; i++) {
      r = roads[i]; pts = r.pts;
      if (pts[0][0] < v.x0 - 60 && pts[pts.length - 1][0] < v.x0 - 60) continue;
      if (pts[0][0] > v.x1 + 60 && pts[pts.length - 1][0] > v.x1 + 60) continue;
      c.strokeStyle = 'rgba(26,32,30,0.55)';
      c.lineWidth = r.w + 5.5;
      strokeRoad(c, pts, r.w);
      c.strokeStyle = r.kind === 'dirt' ? '#8b7f63' : r.kind === 'street' ? '#6e7679' : '#4d5457';
      c.lineWidth = r.w;
      strokeRoad(c, pts, r.w);
      if (r.kind === 'highway') {
        c.strokeStyle = 'rgba(126,132,136,0.85)';
        c.lineWidth = r.w * 0.62;
        strokeRoad(c, pts, r.w);
        if (detail) {
          c.strokeStyle = 'rgba(240,232,190,0.55)';
          c.lineWidth = Math.max(0.7, r.w * 0.055);
          c.setLineDash([r.w * 0.7, r.w * 0.8]);
          strokeRoad(c, pts, r.w);
          c.setLineDash([]);
        }
      } else if (r.kind === 'street') {
        c.strokeStyle = 'rgba(96,98,96,0.8)';
        c.lineWidth = r.w * 0.5;
        strokeRoad(c, pts, r.w);
      } else if (r.kind === 'road') {
        c.strokeStyle = 'rgba(112,112,104,0.7)';
        c.lineWidth = r.w * 0.45;
        strokeRoad(c, pts, r.w);
      } else {
        // dirt: wheel ruts
        c.strokeStyle = 'rgba(146,132,102,0.75)';
        c.lineWidth = Math.max(0.8, r.w * 0.12);
        strokeRoad(c, pts, r.w);
      }
    }
  }

  /* ---------------- props ---------------- */
  function drawProp(c, p, z) {
    var i, s, a;
    switch (p.kind) {
      case 'pier': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = 'rgba(6,20,26,0.35)';
        c.fillRect(-p.w / 2 + 5, -p.len / 2 + 5, p.w, p.len);
        c.fillStyle = '#8a6b46';
        c.fillRect(-p.w / 2, -p.len / 2, p.w, p.len);
        c.fillStyle = 'rgba(58,42,26,0.55)';
        for (i = -p.len / 2; i < p.len / 2; i += 9) c.fillRect(-p.w / 2, i, p.w, 1.6);
        c.strokeStyle = 'rgba(226,206,170,0.35)'; c.lineWidth = 1.2;
        c.strokeRect(-p.w / 2, -p.len / 2, p.w, p.len);
        c.restore();
        break;
      }
      case 'runway': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = 'rgba(4,14,20,0.35)'; c.fillRect(-p.len / 2 + 7, -p.w / 2 + 7, p.len, p.w);
        c.fillStyle = '#3c4144'; c.fillRect(-p.len / 2, -p.w / 2, p.len, p.w);
        c.strokeStyle = 'rgba(230,230,225,0.75)'; c.lineWidth = 2.2;
        c.strokeRect(-p.len / 2 + 4, -p.w / 2 + 4, p.len - 8, p.w - 8);
        c.fillStyle = 'rgba(236,236,230,0.85)';
        for (i = -p.len / 2 + 40; i < p.len / 2 - 30; i += 54) c.fillRect(i, -3, 30, 6);
        // threshold bars
        for (i = 0; i < 8; i++) {
          c.fillRect(-p.len / 2 + 12 + i * 6, -p.w / 2 + 8, 3, p.w - 16);
          c.fillRect(p.len / 2 - 42 + i * 6, -p.w / 2 + 8, 3, p.w - 16);
        }
        c.restore();
        break;
      }
      case 'taxiway': case 'apron': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = '#464b4e';
        c.fillRect(-p.len / 2, -p.w / 2, p.len, p.w);
        c.strokeStyle = 'rgba(220,220,210,0.35)'; c.lineWidth = 1.4;
        c.setLineDash([7, 9]);
        c.beginPath(); c.moveTo(-p.len / 2, 0); c.lineTo(p.len / 2, 0); c.stroke();
        c.setLineDash([]);
        c.restore();
        break;
      }
      case 'fence': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.strokeStyle = 'rgba(180,196,190,0.35)'; c.lineWidth = 1.6;
        c.setLineDash([6, 6]);
        c.strokeRect(-p.len / 2, -p.w / 2, p.len, p.w);
        c.setLineDash([]);
        c.restore();
        break;
      }
      case 'compound': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = 'rgba(72,68,58,0.55)';
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.strokeStyle = 'rgba(206,204,186,0.55)'; c.lineWidth = 3;
        c.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.fillStyle = 'rgba(206,204,186,0.28)';
        for (i = -p.w / 2 + 18; i < p.w / 2; i += 34) {
          c.fillRect(i, -p.h / 2 - 3, 18, 6);
          c.fillRect(i, p.h / 2 - 3, 18, 6);
        }
        c.restore();
        break;
      }
      case 'helipad': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = '#4a5052'; c.beginPath(); c.arc(0, 0, p.r, 0, 6.2832); c.fill();
        c.strokeStyle = 'rgba(240,236,220,0.85)'; c.lineWidth = 2.4;
        c.beginPath(); c.arc(0, 0, p.r * 0.86, 0, 6.2832); c.stroke();
        c.fillStyle = 'rgba(240,236,220,0.9)';
        c.fillRect(-9, -10, 5, 20); c.fillRect(4, -10, 5, 20); c.fillRect(-9, -2.5, 18, 5);
        c.restore();
        break;
      }
      case 'container': {
        var cols = ['#b5562f', '#2f6f8a', '#8a7d3a', '#4a7a52'];
        c.save(); c.translate(p.x + 3, p.y + 3); c.rotate(p.rot);
        c.fillStyle = 'rgba(4,12,16,0.35)'; c.fillRect(-11, -5, 22, 10);
        c.fillStyle = cols[(p.x | 0) % 4];
        c.fillRect(-11, -5, 22, 10);
        c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.8;
        for (i = -9; i < 10; i += 3) { c.beginPath(); c.moveTo(i, -5); c.lineTo(i, 5); c.stroke(); }
        c.restore();
        break;
      }
      case 'tank': {
        c.beginPath(); c.arc(p.x + 3, p.y + 3, p.r, 0, 6.2832);
        c.fillStyle = 'rgba(4,12,16,0.32)'; c.fill();
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.2832);
        c.fillStyle = '#c8c2ae'; c.fill();
        c.strokeStyle = 'rgba(70,66,58,0.65)'; c.lineWidth = 1.4; c.stroke();
        c.beginPath(); c.arc(p.x, p.y, p.r * 0.55, 0, 6.2832);
        c.strokeStyle = 'rgba(70,66,58,0.4)'; c.stroke();
        break;
      }
      case 'watchtower': {
        c.save(); c.translate(p.x + 6, p.y + 6); c.rotate(p.rot);
        c.fillStyle = 'rgba(4,12,16,0.35)'; c.fillRect(-9, -9, 18, 18);
        c.restore();
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.strokeStyle = '#5d6152'; c.lineWidth = 2;
        c.strokeRect(-8, -8, 16, 16);
        c.fillStyle = '#7c8171'; c.fillRect(-9, -9, 18, 18);
        c.fillStyle = '#5b6050'; c.fillRect(-5, -5, 10, 10);
        c.strokeStyle = 'rgba(220,220,200,0.5)'; c.lineWidth = 1; c.strokeRect(-9, -9, 18, 18);
        c.restore();
        break;
      }
      case 'dome': {
        c.beginPath(); c.arc(p.x + 3, p.y + 3, p.r, 0, 6.2832);
        c.fillStyle = 'rgba(4,12,16,0.3)'; c.fill();
        var g = c.createRadialGradient(p.x - p.r * .35, p.y - p.r * .4, p.r * .1, p.x, p.y, p.r);
        g.addColorStop(0, '#e9eef0'); g.addColorStop(1, '#9fb0b6');
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.2832); c.fillStyle = g; c.fill();
        c.strokeStyle = 'rgba(60,80,86,0.5)'; c.lineWidth = 1.2; c.stroke();
        break;
      }
      case 'dish': {
        c.save(); c.translate(p.x, p.y);
        c.fillStyle = 'rgba(4,12,16,0.3)';
        c.beginPath(); c.arc(3, 3, p.r, 0, 6.2832); c.fill();
        c.fillStyle = '#d8dcd9';
        c.beginPath(); c.ellipse(0, 0, p.r, p.r * 0.72, -0.6, 0, 6.2832); c.fill();
        c.strokeStyle = '#87908c'; c.lineWidth = 1.2; c.stroke();
        c.fillStyle = '#6f7773';
        c.beginPath(); c.arc(0, 0, p.r * 0.16, 0, 6.2832); c.fill();
        c.restore();
        break;
      }
      case 'solar': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = '#1e3350'; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.strokeStyle = 'rgba(140,190,230,0.5)'; c.lineWidth = 0.9;
        for (i = -p.w / 2; i < p.w / 2; i += 9) { c.beginPath(); c.moveTo(i, -p.h / 2); c.lineTo(i, p.h / 2); c.stroke(); }
        for (i = -p.h / 2; i < p.h / 2; i += 9) { c.beginPath(); c.moveTo(-p.w / 2, i); c.lineTo(p.w / 2, i); c.stroke(); }
        c.restore();
        break;
      }
      case 'spire': {
        c.save(); c.translate(p.x, p.y);
        c.fillStyle = 'rgba(4,12,16,0.35)';
        c.beginPath(); c.ellipse(6, 6, p.r, p.r * 0.5, 0, 0, 6.2832); c.fill();
        var g2 = c.createLinearGradient(0, -p.h, 0, 0);
        g2.addColorStop(0, 'rgba(200,139,255,0.95)');
        g2.addColorStop(0.55, 'rgba(96,44,140,0.95)');
        g2.addColorStop(1, 'rgba(30,16,44,0.95)');
        c.fillStyle = g2;
        c.beginPath();
        c.moveTo(0, -p.h);
        c.quadraticCurveTo(p.r * 0.9, -p.h * 0.5, p.r * 0.55, 0);
        c.lineTo(-p.r * 0.55, 0);
        c.quadraticCurveTo(-p.r * 0.9, -p.h * 0.5, 0, -p.h);
        c.fill();
        c.strokeStyle = 'rgba(190,120,255,0.55)'; c.lineWidth = 1; c.stroke();
        c.fillStyle = 'rgba(226,180,255,0.9)';
        c.beginPath(); c.arc(0, -p.h, 2.4, 0, 6.2832); c.fill();
        c.restore();
        break;
      }
      case 'aliencrater': {
        var g3 = c.createRadialGradient(p.x, p.y, p.r * 0.1, p.x, p.y, p.r);
        g3.addColorStop(0, 'rgba(150,80,220,0.55)');
        g3.addColorStop(0.55, 'rgba(96,40,150,0.3)');
        g3.addColorStop(1, 'rgba(60,24,96,0)');
        c.fillStyle = g3;
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.2832); c.fill();
        c.strokeStyle = 'rgba(186,120,255,0.45)'; c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y, p.r * 0.72, 0, 6.2832); c.stroke();
        break;
      }
      case 'crystal': {
        c.save(); c.translate(p.x, p.y);
        var g4 = c.createRadialGradient(0, -p.r * 0.4, 2, 0, 0, p.r * 2.2);
        g4.addColorStop(0, 'rgba(220,170,255,0.95)');
        g4.addColorStop(0.3, 'rgba(150,80,220,0.55)');
        g4.addColorStop(1, 'rgba(120,60,200,0)');
        c.fillStyle = g4;
        c.beginPath(); c.arc(0, 0, p.r * 2.2, 0, 6.2832); c.fill();
        c.fillStyle = 'rgba(232,196,255,0.95)';
        c.beginPath();
        c.moveTo(0, -p.r * 1.5); c.lineTo(p.r * 0.6, 0); c.lineTo(0, p.r * 0.9); c.lineTo(-p.r * 0.6, 0);
        c.closePath(); c.fill();
        c.restore();
        break;
      }
      case 'corebeam': {
        c.save(); c.translate(p.x, p.y);
        var bw = 16 + Math.sin(Date.now() / 900) * 3;
        var g5 = c.createLinearGradient(0, 0, 0, -p.h);
        g5.addColorStop(0, 'rgba(220,170,255,0.85)');
        g5.addColorStop(0.6, 'rgba(170,100,255,0.35)');
        g5.addColorStop(1, 'rgba(150,80,255,0)');
        c.fillStyle = g5;
        c.beginPath();
        c.moveTo(-bw / 2, 0); c.lineTo(-bw * 1.1, -p.h);
        c.lineTo(bw * 1.1, -p.h); c.lineTo(bw / 2, 0);
        c.closePath(); c.fill();
        c.fillStyle = 'rgba(240,220,255,0.55)';
        c.beginPath(); c.ellipse(0, 0, 26, 12, 0, 0, 6.2832); c.fill();
        c.restore();
        break;
      }
      case 'quarry': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = 'rgba(120,110,96,0.55)';
        c.beginPath(); c.ellipse(0, 0, p.r, p.r * 0.72, 0, 0, 6.2832); c.fill();
        for (i = 1; i <= 4; i++) {
          c.strokeStyle = 'rgba(74,66,56,' + (0.5 - i * 0.07) + ')';
          c.lineWidth = 6;
          c.beginPath(); c.ellipse(0, 0, p.r * (i / 4.4), p.r * 0.72 * (i / 4.4), 0, 0, 6.2832); c.stroke();
        }
        c.fillStyle = 'rgba(60,66,60,0.5)';
        c.beginPath(); c.ellipse(0, 0, p.r * 0.22, p.r * 0.16, 0, 0, 6.2832); c.fill();
        c.restore();
        break;
      }
      case 'shaft': {
        c.fillStyle = 'rgba(10,10,10,0.85)';
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.2832); c.fill();
        c.strokeStyle = 'rgba(150,140,120,0.6)'; c.lineWidth = 2;
        c.stroke();
        break;
      }
      case 'spoil': {
        c.fillStyle = 'rgba(132,120,100,0.5)';
        c.beginPath(); c.ellipse(p.x, p.y, p.r, p.r * 0.66, 0.3, 0, 6.2832); c.fill();
        c.fillStyle = 'rgba(96,88,74,0.45)';
        c.beginPath(); c.ellipse(p.x + 14, p.y + 8, p.r * 0.55, p.r * 0.34, 0.3, 0, 6.2832); c.fill();
        break;
      }
      case 'crane': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.strokeStyle = 'rgba(6,16,20,0.3)'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(4, 4); c.lineTo(4 + p.h * 0.7, 4); c.stroke();
        c.strokeStyle = '#8d7a4e'; c.lineWidth = 3.4;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -p.h); c.lineTo(p.h * 0.7, -p.h * 0.86); c.stroke();
        c.strokeStyle = '#6d5f3e'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, -p.h * 0.9); c.lineTo(p.h * 0.28, 0); c.stroke();
        c.fillStyle = '#b8a468'; c.fillRect(-5, -p.h - 4, 10, 7);
        c.restore();
        break;
      }
      case 'rail': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.strokeStyle = 'rgba(70,64,54,0.55)'; c.lineWidth = 7;
        c.beginPath(); c.moveTo(-p.len / 2, 0); c.lineTo(p.len / 2, 0); c.stroke();
        c.strokeStyle = 'rgba(168,164,150,0.85)'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-p.len / 2, -3); c.lineTo(p.len / 2, -3);
        c.moveTo(-p.len / 2, 3); c.lineTo(p.len / 2, 3); c.stroke();
        c.strokeStyle = 'rgba(96,86,66,0.7)'; c.lineWidth = 2;
        for (i = -p.len / 2; i < p.len / 2; i += 11) { c.beginPath(); c.moveTo(i, -5); c.lineTo(i, 5); c.stroke(); }
        c.restore();
        break;
      }
      case 'fields': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = 'rgba(104,120,64,0.85)';
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        var rowH = 12;
        for (i = -p.h / 2; i < p.h / 2; i += rowH) {
          c.fillStyle = (Math.round(i / rowH) % 2) ? 'rgba(140,168,74,0.85)' : 'rgba(94,124,58,0.85)';
          c.fillRect(-p.w / 2, i, p.w, rowH - 2);
          c.strokeStyle = 'rgba(58,80,40,0.35)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(-p.w / 2, i + rowH - 2); c.lineTo(p.w / 2, i + rowH - 2); c.stroke();
        }
        c.strokeStyle = 'rgba(60,48,34,0.7)'; c.lineWidth = 4;
        c.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h);
        // dirt track splitting the fields
        c.strokeStyle = 'rgba(146,126,92,0.85)'; c.lineWidth = 7;
        c.beginPath(); c.moveTo(-p.w / 2, 0); c.lineTo(p.w / 2, 0); c.stroke();
        c.restore();
        break;
      }
      case 'silo': {
        c.beginPath(); c.arc(p.x + 3, p.y + 3, p.r, 0, 6.2832);
        c.fillStyle = 'rgba(4,12,16,0.3)'; c.fill();
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.2832);
        c.fillStyle = '#c9c6b6'; c.fill();
        c.strokeStyle = 'rgba(80,78,66,0.55)'; c.lineWidth = 1.3; c.stroke();
        c.strokeStyle = 'rgba(120,118,104,0.5)'; c.lineWidth = 1;
        c.beginPath(); c.arc(p.x, p.y, p.r * 0.6, 0, 6.2832); c.stroke();
        break;
      }
      case 'windmill': {
        c.save(); c.translate(p.x, p.y);
        c.fillStyle = 'rgba(4,12,16,0.3)';
        c.beginPath(); c.ellipse(6, 6, 14, 6, 0, 0, 6.2832); c.fill();
        c.fillStyle = '#b9b6a6';
        c.beginPath(); c.arc(0, 0, 9, 0, 6.2832); c.fill();
        c.strokeStyle = 'rgba(64,62,52,0.5)'; c.lineWidth = 1; c.stroke();
        for (i = 0; i < 3; i++) {
          a = (i / 3) * 6.2832 + 0.5;
          c.strokeStyle = 'rgba(226,226,214,0.85)'; c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(0, 0);
          c.lineTo(Math.cos(a) * p.h * 0.55, Math.sin(a) * p.h * 0.55);
          c.stroke();
        }
        c.fillStyle = '#7d7a6c'; c.beginPath(); c.arc(0, 0, 3, 0, 6.2832); c.fill();
        c.restore();
        break;
      }
      case 'lighthouse': {
        c.save(); c.translate(p.x, p.y);
        c.fillStyle = 'rgba(4,12,16,0.32)';
        c.beginPath(); c.ellipse(5, 5, 15, 8, 0, 0, 6.2832); c.fill();
        c.fillStyle = '#e6e2d4';
        c.beginPath(); c.arc(0, 0, 11, 0, 6.2832); c.fill();
        c.fillStyle = '#c9453f';
        c.beginPath(); c.arc(0, 0, 11, 0.2, 1.4); c.lineTo(0, 0); c.fill();
        c.beginPath(); c.arc(0, 0, 11, 3.3, 4.5); c.lineTo(0, 0); c.fill();
        c.fillStyle = '#fff6c8';
        c.beginPath(); c.arc(0, 0, 4.4, 0, 6.2832); c.fill();
        c.strokeStyle = 'rgba(70,64,58,0.6)'; c.lineWidth = 1; c.stroke();
        c.restore();
        break;
      }
      case 'radiotower': {
        c.save(); c.translate(p.x, p.y);
        c.fillStyle = 'rgba(4,12,16,0.3)';
        c.beginPath(); c.ellipse(7, 7, 16, 7, 0, 0, 6.2832); c.fill();
        c.strokeStyle = '#b9c6c8'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-7, 0); c.lineTo(0, -9); c.lineTo(7, 0); c.stroke();
        c.beginPath(); c.moveTo(-4, 0); c.lineTo(0, -6); c.lineTo(4, 0); c.stroke();
        c.fillStyle = '#ff6a6a';
        c.beginPath(); c.arc(0, -9, 2.2, 0, 6.2832); c.fill();
        c.restore();
        break;
      }
      case 'warehouse': {
        c.save(); c.translate(p.x + 5, p.y + 5); c.rotate(p.rot);
        c.fillStyle = 'rgba(4,12,16,0.35)'; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.restore();
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        var wg = c.createLinearGradient(0, -p.h / 2, 0, p.h / 2);
        wg.addColorStop(0, '#8e9aa0'); wg.addColorStop(1, '#5c686e');
        c.fillStyle = wg; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.strokeStyle = 'rgba(20,30,34,0.5)'; c.lineWidth = 1;
        for (i = -p.w / 2 + 6; i < p.w / 2; i += 8) {
          c.beginPath(); c.moveTo(i, -p.h / 2); c.lineTo(i, p.h / 2); c.stroke();
        }
        c.restore();
        break;
      }
      case 'craneport': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.strokeStyle = '#e3a33c'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-16, 8); c.lineTo(-16, -p.h); c.lineTo(26, -p.h + 8); c.stroke();
        c.strokeStyle = '#9c7430'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-16, -p.h * 0.4); c.lineTo(10, -p.h + 2); c.stroke();
        c.restore();
        break;
      }
      case 'bridge': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = 'rgba(4,12,16,0.35)'; c.fillRect(-p.len / 2 + 4, -p.w / 2 + 4, p.len, p.w);
        c.fillStyle = '#78786e'; c.fillRect(-p.len / 2, -p.w / 2, p.len, p.w);
        c.strokeStyle = 'rgba(232,228,210,0.7)'; c.lineWidth = 1.6;
        c.strokeRect(-p.len / 2, -p.w / 2, p.len, p.w);
        c.restore();
        break;
      }
      case 'urbanlot': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = 'rgba(150,152,146,0.55)';
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.fillStyle = 'rgba(118,120,116,0.30)';
        c.fillRect(-p.w / 2 + 3, -p.h / 2 + 3, p.w - 6, p.h - 6);
        c.restore();
        break;
      }
      case 'parklot': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = 'rgba(88,138,74,0.75)';
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.fillStyle = 'rgba(146,186,104,0.35)';
        for (i = 0; i < 5; i++) {
          c.beginPath();
          c.arc(-p.w / 2 + p.w * (0.2 + 0.15 * i), -p.h / 2 + p.h * (0.3 + 0.4 * ((i * 7) % 10) / 10), 9, 0, 6.2832);
          c.fill();
        }
        c.restore();
        break;
      }
      case 'airfield': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = 'rgba(126,132,120,0.55)';
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.fillStyle = 'rgba(96,106,96,0.35)';
        c.fillRect(-p.w / 2 + 8, -p.h / 2 + 8, p.w - 16, p.h - 16);
        c.restore();
        break;
      }
      case 'plaza': {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = 'rgba(190,186,170,0.75)';
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.strokeStyle = 'rgba(120,116,102,0.5)'; c.lineWidth = 1;
        for (i = -p.w / 2; i < p.w / 2; i += 11) { c.beginPath(); c.moveTo(i, -p.h / 2); c.lineTo(i, p.h / 2); c.stroke(); }
        c.fillStyle = 'rgba(90,170,180,0.85)';
        c.beginPath(); c.arc(0, 0, Math.min(p.w, p.h) * 0.16, 0, 6.2832); c.fill();
        c.strokeStyle = 'rgba(236,232,214,0.8)'; c.lineWidth = 2; c.stroke();
        c.restore();
        break;
      }
      case 'waterfall': {
        c.save(); c.translate(p.x, p.y);
        var wf = c.createLinearGradient(0, 0, 0, p.w * 3);
        wf.addColorStop(0, 'rgba(226,255,255,0.0)');
        wf.addColorStop(0.5, 'rgba(226,255,255,0.85)');
        wf.addColorStop(1, 'rgba(200,245,245,0.15)');
        c.fillStyle = wf;
        c.fillRect(-p.w / 2, 0, p.w, p.w * 3);
        c.fillStyle = 'rgba(240,255,255,0.55)';
        c.beginPath(); c.ellipse(0, p.w * 3, p.w * 1.1, p.w * 0.7, 0, 0, 6.2832); c.fill();
        c.restore();
        break;
      }
      default: break;
    }
  }

  /* ---------------- buildings ---------------- */
  var ROOFS = [
    ['#c3ccd0', '#9aa7ad'], ['#d6c4a8', '#b09a7d'], ['#aebbc2', '#8798a0'],
    ['#cbbfa8', '#a79881'], ['#bfb49e', '#988d78'], ['#a9c3c6', '#83a3a7']
  ];
  function drawBuilding(c, b) {
    var h = 5 + b.floors * 10;
    var roof = ROOFS[Math.floor(b.tone * ROOFS.length) % ROOFS.length];
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.rot);
    // ground shadow to SE
    c.fillStyle = 'rgba(6,16,20,0.26)';
    rr(c, -b.w / 2 + h * 0.55, -b.h / 2 + h * 0.62, b.w, b.h, 2); c.fill();
    // walls (south-east faces)
    c.fillStyle = '#2f383c';
    rr(c, -b.w / 2, -b.h / 2, b.w, b.h, 2); c.fill();
    // roof lifted to NW
    var ox = -Math.min(7, h * 0.45), oy = -Math.min(7, h * 0.45);
    var g = c.createLinearGradient(-b.w / 2, -b.h / 2, b.w / 2, b.h / 2);
    g.addColorStop(0, roof[0]); g.addColorStop(1, roof[1]);
    c.fillStyle = g;
    rr(c, -b.w / 2 + ox, -b.h / 2 + oy, b.w, b.h, 2); c.fill();
    c.strokeStyle = 'rgba(16,24,28,0.55)'; c.lineWidth = 1;
    c.stroke();
    // sunlit north-west edge
    c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(-b.w / 2 + ox + 1, b.h / 2 + oy - 1);
    c.lineTo(-b.w / 2 + ox + 1, -b.h / 2 + oy + 1);
    c.lineTo(b.w / 2 + ox - 1, -b.h / 2 + oy + 1);
    c.stroke();
    // roof details
    if (b.kind === 'tower' || b.floors > 3) {
      c.fillStyle = 'rgba(226,238,240,0.28)';
      c.fillRect(-b.w / 2 + ox + 3, -b.h / 2 + oy + 3, b.w * 0.34, b.h * 0.34);
      c.fillStyle = 'rgba(40,52,56,0.6)';
      c.fillRect(b.w * 0.10 + ox, -b.h * 0.18 + oy, b.w * 0.20, b.h * 0.26);
      c.strokeStyle = 'rgba(60,72,78,0.45)'; c.lineWidth = 0.8;
      for (var f = 1; f < 3; f++) {
        c.beginPath();
        c.moveTo(-b.w / 2 + ox + (b.w / 3) * f, -b.h / 2 + oy);
        c.lineTo(-b.w / 2 + ox + (b.w / 3) * f, b.h / 2 + oy);
        c.stroke();
      }
    } else if (b.kind === 'hangar') {
      c.strokeStyle = 'rgba(30,40,44,0.5)'; c.lineWidth = 1.2;
      for (var i = 1; i < 4; i++) {
        c.beginPath();
        c.moveTo(-b.w / 2 + ox, -b.h / 2 + oy + (b.h / 4) * i);
        c.lineTo(b.w / 2 + ox, -b.h / 2 + oy + (b.h / 4) * i);
        c.stroke();
      }
    } else if (b.kind === 'house' || b.kind === 'barn') {
      c.fillStyle = 'rgba(150,72,58,0.55)';
      c.beginPath();
      c.moveTo(-b.w / 2 + ox, -b.h * 0.16 + oy);
      c.lineTo(0 + ox, -b.h / 2 + oy + 3);
      c.lineTo(b.w / 2 + ox, -b.h * 0.16 + oy);
      c.lineTo(b.w / 2 + ox, b.h / 2 + oy);
      c.lineTo(-b.w / 2 + ox, b.h / 2 + oy);
      c.closePath(); c.fill();
    }
    c.restore();
  }

  /* ---------------- trees ---------------- */
  function drawTrees(c, v, z, fast) {
    if (z < 0.18) return;          // baked canopy carries the far view
    var trees = BS.world.trees, i, t, sp, spr;
    var minPx = fast ? 8 : 4;
    for (i = 0; i < trees.length; i++) {
      t = trees[i];
      if (!inView(v, t.x, t.y, 40)) continue;
      var r = t.s * 1.55;
      if (r * z < minPx) continue;
      spr = sprites[t.t] || sprites.jungle;
      sp = spr[t.v % spr.length];
      var d = r * 2;
      c.drawImage(sp, t.x - d / 2, t.y - d / 2 - r * 0.25, d, d);
    }
  }

  /* ---------------- wrecks ---------------- */
  function drawWrecks(c) {
    var ws = BS.world.wrecks;
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i];
      c.save(); c.translate(w.x, w.y); c.rotate(w.rot); c.scale(w.s, w.s);
      c.fillStyle = 'rgba(4,20,26,0.30)';
      c.beginPath(); c.ellipse(6, 8, 62, 20, 0, 0, 6.2832); c.fill();
      c.fillStyle = '#6d7476';
      c.beginPath();
      c.moveTo(-58, 0); c.quadraticCurveTo(-30, -17, 32, -14);
      c.quadraticCurveTo(58, -10, 62, 0); c.quadraticCurveTo(40, 16, -20, 15);
      c.quadraticCurveTo(-46, 12, -58, 0); c.fill();
      c.strokeStyle = 'rgba(30,40,42,0.65)'; c.lineWidth = 1.4; c.stroke();
      c.strokeStyle = 'rgba(160,168,166,0.45)'; c.lineWidth = 1;
      for (var k = -40; k < 40; k += 12) {
        c.beginPath(); c.moveTo(k, -13); c.lineTo(k, 13); c.stroke();
      }
      c.fillStyle = 'rgba(48,56,58,0.85)';
      c.fillRect(-20, -24, 26, 14);
      c.restore();
    }
  }

  /* ---------------- world layer ---------------- */
  P.drawWorld = function (c, cam, opts) {
    var z = cam.z;
    var v = {
      x0: cam.x - cam.w / (2 * z) - 30,
      x1: cam.x + cam.w / (2 * z) + 30,
      y0: cam.y - cam.h / (2 * z) - 30,
      y1: cam.y + cam.h / (2 * z) + 30
    };
    // terrain
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(BS.baseCanvas, 0, 0, BS.W, BS.H);

    // reef / shelf soft glow is baked. props under the road layer:
    var props = BS.world.props, i, p;
    c.lineJoin = 'round';
    c.lineCap = 'round';

    for (i = 0; i < props.length; i++) {
      p = props[i];
      if (!inView(v, p.x, p.y, 420)) continue;
      if (p.kind === 'fields' || p.kind === 'quarry' || p.kind === 'spoil' ||
        p.kind === 'apron' || p.kind === 'runway' || p.kind === 'taxiway' ||
        p.kind === 'fence' || p.kind === 'compound' || p.kind === 'rail' ||
        p.kind === 'urbanlot' || p.kind === 'parklot' || p.kind === 'airfield' ||
        p.kind === 'plaza') {
        drawProp(c, p, z);
      }
    }

    drawRoads(c, v, z);

    // vegetation
    drawTrees(c, v, z, opts.fast);

    // building shadows & bodies
    var bs = BS.world.buildings;
    for (i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (!inView(v, b.x, b.y, 90)) continue;
      drawBuilding(c, b);
    }

    // remaining props (over ground)
    for (i = 0; i < props.length; i++) {
      p = props[i];
      if (!inView(v, p.x, p.y, 420)) continue;
      if (p.kind === 'fields' || p.kind === 'quarry' || p.kind === 'spoil' ||
        p.kind === 'apron' || p.kind === 'runway' || p.kind === 'taxiway' ||
        p.kind === 'fence' || p.kind === 'compound' || p.kind === 'rail' ||
        p.kind === 'urbanlot' || p.kind === 'parklot' || p.kind === 'airfield' ||
        p.kind === 'plaza') continue;
      drawProp(c, p, z);
    }

    drawWrecks(c);

    // grid
    if (opts.grid) {
      var gs = 256;
      c.strokeStyle = 'rgba(126,240,255,0.10)';
      c.lineWidth = 1 / z;
      var gx, gy;
      for (gx = Math.floor(v.x0 / gs) * gs; gx < v.x1; gx += gs) {
        c.beginPath(); c.moveTo(gx, Math.max(v.y0, 0)); c.lineTo(gx, Math.min(v.y1, BS.H)); c.stroke();
      }
      for (gy = Math.floor(v.y0 / gs) * gs; gy < v.y1; gy += gs) {
        c.beginPath(); c.moveTo(Math.max(v.x0, 0), gy); c.lineTo(Math.min(v.x1, BS.W), gy); c.stroke();
      }
    }
  };

  /* ---------------- screen-space labels ---------------- */
  var labelBoxes = [];
  function boxesOverlap(a, b) {
    return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
  }
  P.resetLabels = function () { labelBoxes.length = 0; };
  P.claimBox = function (box) {
    for (var i = 0; i < labelBoxes.length; i++) if (boxesOverlap(box, labelBoxes[i])) return false;
    labelBoxes.push(box);
    return true;
  };

  P.drawRegionLabel = function (c, reg, sx, sy, z, alpha) {
    var size = Math.max(9, reg.size * Math.min(1.9, 0.55 + z * 1.5));
    if (z < 0.145 && reg.size < 15) return;
    var font = '700 ' + size.toFixed(1) + 'px "Vazirmatn","IRANSans",Tahoma,system-ui,sans-serif';
    c.font = font;
    var w = c.measureText(reg.text).width;
    var box = { x1: sx - w / 2 - 6, x2: sx + w / 2 + 6, y1: sy - size, y2: sy + size * 0.7 };
    if (!P.claimBox(box)) return;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.globalAlpha = alpha;
    // glow / outline for legibility on any terrain
    c.lineWidth = size * 0.38;
    c.strokeStyle = reg.cls === 'sea' ? 'rgba(4,38,58,0.65)' :
      reg.cls === 'alien' ? 'rgba(30,6,46,0.8)' : 'rgba(6,20,14,0.72)';
    c.lineJoin = 'round';
    c.strokeText(reg.text, sx, sy);
    c.fillStyle = reg.cls === 'sea' ? 'rgba(178,236,255,0.92)' :
      reg.cls === 'alien' ? '#d8b0ff' :
        reg.cls === 'peak' ? '#e7f7ff' :
          reg.cls === 'city' ? '#fff3cf' : '#eef8e6';
    c.fillText(reg.text, sx, sy);
    c.globalAlpha = 1;
  };

  /* marker */
  P.drawMarker = function (c, poi, sx, sy, selected) {
    var def = ICONS[poi.type] || ICONS.region;
    var r = 13;
    var libState = window.SAVE ? SAVE.get('lib:' + (poi.id || poi.type), null) : null;
    var free = !!(libState && libState.liberated);
    // shadow
    c.beginPath(); c.arc(sx, sy + 2, r + 1, 0, 6.2832);
    c.fillStyle = 'rgba(0,8,14,0.45)'; c.fill();
    // token
    c.beginPath(); c.arc(sx, sy, r, 0, 6.2832);
    c.fillStyle = 'rgba(6,20,30,0.92)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = free ? '#7ee6a8' : def.c; c.stroke();
    if (free) {
      c.beginPath(); c.arc(sx, sy, r + 3.5, 0, 6.2832);
      c.strokeStyle = 'rgba(126,230,168,.45)';
      c.lineWidth = 1.2; c.stroke();
    }
    // glyph
    c.save();
    c.translate(sx - 11, sy - 11);
    c.scale(22 / 24, 22 / 24);
    var path = iconPath(poi.type);
    if (def.m === 'stroke') {
      c.lineWidth = 2.1; c.strokeStyle = def.c; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(path);
    } else {
      c.fillStyle = def.c; c.fill(path);
    }
    c.restore();
    if (poi.type === 'danger') {
      c.fillStyle = '#1a0a10';
      c.fillRect(sx - 4.4, sy - 3.6, 2.6, 3.2);
      c.fillRect(sx + 1.8, sy - 3.6, 2.6, 3.2);
      c.fillRect(sx - 1.2, sy + 3.2, 2.4, 2.2);
    }
    if (poi.type === 'main') {
      c.fillStyle = '#241a00';
      c.font = '800 12px system-ui';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('!', sx, sy + 1);
    }
    if (poi.mission === 'main') {
      c.beginPath(); c.arc(sx, sy, r + 6, 0, 6.2832);
      c.strokeStyle = 'rgba(255,209,102,' + (selected ? 0.85 : 0.5) + ')';
      c.lineWidth = 1.4; c.setLineDash([4, 4]); c.stroke(); c.setLineDash([]);
    }
    if (poi.type === 'alien' || poi.type === 'locked') {
      var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 620 + poi.x);
      c.beginPath(); c.arc(sx, sy, r + 5 + pulse * 4, 0, 6.2832);
      c.strokeStyle = (poi.type === 'alien' ? 'rgba(200,139,255,' : 'rgba(255,143,122,') + (0.26 * (1 - pulse)) + ')';
      c.lineWidth = 2; c.stroke();
    }
  };

  P.drawMarkerLabel = function (c, text, sx, sy, z) {
    var size = z > 0.7 ? 12 : 11;
    c.font = '600 ' + size + 'px "Vazirmatn","IRANSans",Tahoma,system-ui,sans-serif';
    var w = c.measureText(text).width;
    var padX = 7, h = size + 10;
    var x = sx + 20, y = sy - h / 2;
    var box = { x1: x - 3, x2: x + w + padX * 2, y1: y, y2: y + h };
    if (!P.claimBox({ x1: sx - 16, x2: sx + 16, y1: sy - 16, y2: sy + 16 })) return;
    if (!P.claimBox(box)) return;
    c.beginPath();
    var r = 7;
    c.moveTo(x + r, y); c.lineTo(x + w + padX * 2 - r, y);
    c.quadraticCurveTo(x + w + padX * 2, y, x + w + padX * 2, y + r);
    c.lineTo(x + w + padX * 2, y + h - r);
    c.quadraticCurveTo(x + w + padX * 2, y + h, x + w + padX * 2 - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
    c.fillStyle = 'rgba(6,18,28,0.78)';
    c.fill();
    c.strokeStyle = 'rgba(126,240,255,0.28)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#dff4ff';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(text, x + padX, y + h / 2 + 0.5);
  };

  P.fadeEdges = function (c, cam, w, h) {
    // subtle vignette to focus the island
    var g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
    g.addColorStop(0, 'rgba(2,10,18,0)');
    g.addColorStop(1, 'rgba(2,10,18,0.55)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  };
})(window.BS);
