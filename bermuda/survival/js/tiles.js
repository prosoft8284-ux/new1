/* ============================================================
   BERMUDA SURVIVAL — STATIC TERRAIN BAKE
   The whole island is baked ONCE into a big offscreen canvas:
   bathymetry, biomes, hillshade, coast foam, contours, rivers.
   Rendered once → every frame is a single drawImage.
   ============================================================ */
(function (BS) {
  'use strict';

  var W = BS.W, H = BS.H;
  var BASE_SCALE = 1;          // bake resolution factor (1 = 4096px wide)
  var clamp01 = BS.util.clamp01;

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  var C = {
    deep: [5, 56, 94],
    mid: [11, 104, 146],
    shal: [27, 166, 190],
    turq: [74, 224, 214],
    lagoon: [152, 240, 226],
    reef: [46, 196, 162],
    sandWet: [214, 195, 143],
    sand: [243, 228, 176],
    sandHi: [252, 243, 205],
    grass: [154, 184, 100],
    grassDry: [182, 190, 118],
    jungle: [70, 138, 72],
    jungleD: [38, 94, 52],
    rock: [176, 166, 148],
    rockD: [116, 108, 96],
    peak: [96, 86, 82],
    lake: [30, 150, 158],
    lakeD: [16, 100, 122],
    alien: [96, 44, 140]
  };

  function lerpColorStops(stops, t) {
    t = clamp01(t);
    for (var i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        var a = stops[i - 1], b = stops[i];
        var k = (t - a[0]) / (b[0] - a[0] || 1);
        return mix(a[1], b[1], k);
      }
    }
    return stops[stops.length - 1][1];
  }

  function terrainColor(x, y, m, e, mo, l, slope) {
    var col;
    var n1 = BS.noise.noise2(x * 0.020, y * 0.020, 301);
    var n2 = BS.noise.noise2(x * 0.055, y * 0.055, 307);
    if (m < 0) {
      /* ------- ocean: wide Bermuda shelf, calm deep water ------- */
      var raw = -m;
      var d = raw < 0.36 ? raw : 0.36 + (raw - 0.36) * 0.22;
      col = lerpColorStops([
        [0.00, C.lagoon], [0.07, C.turq], [0.17, C.shal],
        [0.29, C.mid], [0.42, C.deep]
      ], d);
      if (d < 0.24) {
        var reef = BS.noise.fbm(x * 0.011, y * 0.011, 3, 811);
        if (reef > 0.55) col = mix(col, C.reef, (reef - 0.55) * 1.7 * (1 - d / 0.24));
        var ripple = 0.5 + 0.5 * Math.sin((x * 0.028 + y * 0.019) + n1 * 9);
        col = mix(col, [col[0] * 1.14, col[1] * 1.12, col[2] * 1.06], (1 - d / 0.24) * 0.22 * ripple);
      } else {
        col = mix(col, [8, 74, 114], (n2 - 0.5) * 0.05 + 0.02);
      }
      return col;
    }
    /* ------- lakes ------- */
    if (l > 0.05) {
      var deep = clamp01((l - 0.05) * 1.4);
      col = mix([68, 190, 186], C.lakeD, deep);
      col = mix(col, C.lagoon, (1 - deep) * 0.30 * n2);
      return col;
    }
    /* ------- beach ------- */
    if (m < 0.095 + n2 * 0.02) {
      col = mix(C.sandWet, C.sandHi, smoothNoise(n1, n2));
      return col;
    }
    /* ------- vegetation zones ------- */
    var veg = clamp01((mo - 0.28) * 2.2);
    var base;
    if (e < 0.09) base = mix(C.grassDry, C.grass, veg);
    else base = mix(C.grass, C.jungle, clamp01(veg * 1.35));
    // canopy clumps: two scales of light & shadow for a painted jungle feel
    var canopy = BS.noise.fbm(x * 0.030, y * 0.030, 3, 421);
    var broad = BS.noise.fbm(x * 0.010, y * 0.010, 2, 433);
    var leaf = BS.noise.fbm(x * 0.075, y * 0.075, 2, 437);
    var dark = clamp01((canopy * 0.62 + broad * 0.38 - 0.44) * 2.0);
    base = mix(base, C.jungleD, dark * 0.62);
    var sunlit = clamp01((0.56 - canopy) * 1.4);
    base = mix(base, [186, 214, 126], sunlit * 0.22);
    base = mix(base, [base[0] * 1.08, base[1] * 1.08, base[2] * 1.03], (leaf - 0.5) * 0.5 + 0.25);
    // bare rock on ridges & cliffs
    var rockT = clamp01((e - 0.64) * 3.0) + clamp01((slope - 0.95) * 1.4) * 0.7;
    rockT = clamp01(rockT);
    if (rockT > 0) {
      var ridge = BS.noise.ridged(x * 0.020, y * 0.020, 3, 451);
      var rc = mix(C.rock, C.rockD, clamp01((e - 0.52) * 2.2 + ridge * 0.35));
      base = mix(base, rc, rockT);
    }
    if (e > 0.72) base = mix(base, C.peak, clamp01((e - 0.72) * 3.4));
    // alien contamination around the summit / crash site
    var ad = Math.hypot(x - 2062, y - 448) / 130;
    if (ad < 1) {
      var at = Math.pow(1 - ad, 1.8) * 0.55;
      var ali = mix(C.alien, [156, 80, 208], BS.noise.noise2(x * 0.04, y * 0.04, 601));
      base = mix(base, ali, at * clamp01((e - 0.45) * 2.2));
    }
    return base;
  }
  function smoothNoise(a, b) { return 0.5 + (a - 0.5) * 0.6 + (b - 0.5) * 0.2; }

  BS.buildBase = function (onStep) {
    var BW = Math.round(W * BASE_SCALE), BH = Math.round(H * BASE_SCALE);
    var off = document.createElement('canvas');
    off.width = BW; off.height = BH;
    var octx = off.getContext('2d');
    var img = octx.createImageData(BW, BH);
    var data = img.data;
    var i, px, py, x, y;
    var stepX = W / BW, stepY = H / BH;

    for (py = 0; py < BH; py++) {
      y = py * stepY;
      for (px = 0; px < BW; px++) {
        x = px * stepX;
        var m = BS.mask(x, y);
        var l = BS.lake(x, y);
        var e = BS.elev(x, y);
        var mo = BS.moist(x, y);
        var gx = (BS.elev(x + 9, y) - BS.elev(x - 9, y)) / 18;
        var gy = (BS.elev(x, y + 9) - BS.elev(x, y - 9)) / 18;
        var slope = Math.hypot(gx, gy) * 300;

        var col = terrainColor(x, y, m, e, mo, l, slope);

        // lambert relief, sun in the north-west
        if (m > 0.02 && l < 0.05) {
          var nx = -gx * 300, ny = -gy * 300;
          var nlen = Math.sqrt(nx * nx + ny * ny + 1);
          var shade = (nx * -0.52 + ny * -0.52 + 0.68) / (nlen * 1.0);
          var sh = shade * 1.46;
          sh = Math.max(0.56, Math.min(1.46, sh));
          col = [col[0] * sh, col[1] * sh, col[2] * sh];
        }
        var k = (py * BW + px) * 4;
        data[k] = col[0] < 0 ? 0 : col[0] > 255 ? 255 : col[0];
        data[k + 1] = col[1] < 0 ? 0 : col[1] > 255 ? 255 : col[1];
        data[k + 2] = col[2] < 0 ? 0 : col[2] > 255 ? 255 : col[2];
        data[k + 3] = 255;
      }
      if ((py & 127) === 0 && onStep) onStep(py / BH);
    }
    octx.putImageData(img, 0, 0);

    /* ---------------- final bake canvas ---------------- */
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, BW, BH, 0, 0, W, H);

    /* --- water caustics / grain overlay for close-up richness --- */
    var grain = makeGrain();
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    /* --- soft shelf haze --- */
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.055;
    ctx.strokeStyle = '#5fe3ff';
    ctx.lineWidth = 40;
    strokeLines(ctx, BS.contours.shallow, 0.6);
    ctx.restore();

    /* --- coastline --- */
    // dark water edge (wet sand / shadow)
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(9,42,58,0.42)';
    ctx.lineWidth = 8;
    strokeLines(ctx, BS.contours.coast, 1);
    // crisp sand rim
    ctx.strokeStyle = 'rgba(238,222,166,0.92)';
    ctx.lineWidth = 3.4;
    strokeLines(ctx, BS.contours.coast, 1);
    // wet sand outer
    ctx.strokeStyle = 'rgba(204,204,160,0.40)';
    ctx.lineWidth = 3;
    strokeLines(ctx, BS.contours.shore, 1);

    // foam rings
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(206,255,252,0.42)';
    ctx.lineWidth = 2.2;
    strokeLines(ctx, BS.contours.shallow, 1);
    ctx.strokeStyle = 'rgba(226,255,255,0.26)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([26, 30]);
    strokeLines(ctx, BS.contours.shallow, 1);
    ctx.restore();

    // beach inner edge
    ctx.strokeStyle = 'rgba(96,128,66,0.30)';
    ctx.lineWidth = 3;
    strokeLines(ctx, BS.contours.shore, 1);

    /* --- lake shores --- */
    ctx.strokeStyle = 'rgba(232,232,182,0.9)';
    ctx.lineWidth = 4.5;
    strokeLines(ctx, BS.contours.lake, 1);
    ctx.strokeStyle = 'rgba(120,225,225,0.30)';
    ctx.lineWidth = 9;
    ctx.globalCompositeOperation = 'lighter';
    strokeLines(ctx, BS.contours.lake, 1);
    ctx.globalCompositeOperation = 'source-over';

    /* --- elevation contour hatching --- */
    ctx.strokeStyle = 'rgba(28,48,30,0.26)';
    ctx.lineWidth = 1.3;
    strokeLines(ctx, BS.contours.elev1, 1);
    ctx.strokeStyle = 'rgba(26,38,28,0.32)';
    ctx.lineWidth = 1.5;
    strokeLines(ctx, BS.contours.elev2, 1);
    ctx.strokeStyle = 'rgba(52,44,36,0.40)';
    ctx.lineWidth = 1.8;
    strokeLines(ctx, BS.contours.elev3, 1);
    ctx.strokeStyle = 'rgba(54,42,38,0.46)';
    ctx.lineWidth = 2.0;
    strokeLines(ctx, BS.contours.elev4, 1);
    ctx.strokeStyle = 'rgba(64,48,44,0.52)';
    ctx.lineWidth = 2.3;
    strokeLines(ctx, BS.contours.elev5, 1);

    /* --- rivers --- */
    var rivers = BS.world.rivers;
    var ri, r, pts, j;
    for (ri = 0; ri < rivers.length; ri++) {
      r = rivers[ri]; pts = r.pts;
      // damp banks
      ctx.strokeStyle = 'rgba(46,72,52,0.32)';
      ctx.lineWidth = r.w + 7;
      polyline(ctx, pts, false);
      // water
      ctx.strokeStyle = '#2c8fa2';
      ctx.lineWidth = r.w;
      polyline(ctx, pts, false);
      // shallow tint
      ctx.strokeStyle = 'rgba(120,206,210,0.38)';
      ctx.lineWidth = Math.max(1.2, r.w * 0.36);
      polyline(ctx, pts, false);
    }

    BS.baseCanvas = cv;
    BS.baseCtx = ctx;
  };

  function polyline(ctx, pts, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length - 1; i++) {
      var midX = (pts[i][0] + pts[i + 1][0]) / 2;
      var midY = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
    }
    var last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
    if (close) ctx.closePath();
    ctx.stroke();
  }

  var linesCache = new WeakMap();
  function strokeLines(ctx, lines, alpha) {
    for (var i = 0; i < lines.length; i++) {
      var pts = lines[i];
      if (pts.length < 2) continue;
      polyline(ctx, pts, false);
    }
  }

  function makeGrain() {
    var size = 256;
    var cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(size, size);
    var d = img.data;
    var n = BS.noise, rnd = BS.util.mulberry32(777);
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var v = n.noise2(x * 0.55, y * 0.55, 91) * 0.55 + n.noise2(x * 1.8, y * 1.8, 93) * 0.3 + rnd() * 0.15;
        var g = 128 + (v - 0.5) * 150;
        var i = (y * size + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return ctx.createPattern(cv, 'repeat');
  }
})(window.BS);
