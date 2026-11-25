/* ============================================================
   BERMUDA SURVIVAL — CORE WORLD
   Island field generation + all hand-authored world content.
   Everything here is deterministic: same island on every load.
   ============================================================ */
window.BS = window.BS || {};
(function (BS) {
  'use strict';

  /* ---------------- constants ---------------- */
  var W = 4096, H = 2304;                 // world units (≈ metres)
  var GW = 1024, GH = 576, CS = W / GW;   // sampling grid (4 units / cell)
  var METERS_PER_UNIT = 1.25;             // world → "metres" for the scale bar
  var WORLD_KM = (W * METERS_PER_UNIT) / 1000;

  /* ---------------- math helpers ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) { var t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- value noise ---------------- */
  function hash2(x, y, seed) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function noise2(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    var c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  function fbm(x, y, oct, seed) {
    var s = 0, amp = 0.5, f = 1, norm = 0, i;
    for (i = 0; i < oct; i++) {
      s += amp * noise2(x * f, y * f, seed + i * 131);
      norm += amp; f *= 2.03; amp *= 0.5;
    }
    return s / norm;
  }
  function ridged(x, y, oct, seed) {
    var s = 0, amp = 0.5, f = 1, norm = 0, i;
    for (i = 0; i < oct; i++) {
      var n = 1 - Math.abs(noise2(x * f, y * f, seed + i * 71) * 2 - 1);
      s += amp * n * n; norm += amp; f *= 2.11; amp *= 0.5;
    }
    return s / norm;
  }

  /* ---------------- island definition ---------------- */
  // [x, y, radius] — union of soft blobs builds the landmass
  var LAND = [
    [560, 800, 165], [650, 930, 195], [770, 1030, 215],
    [900, 700, 235], [1010, 900, 245], [860, 1130, 230],
    [1350, 1010, 300], [1590, 1120, 285],
    [1830, 760, 300], [2080, 500, 290], [2330, 700, 300], [1750, 990, 285],
    [2570, 780, 300], [2860, 780, 285], [3120, 670, 250], [3330, 560, 205],
    [2180, 1170, 340], [2500, 1060, 320], [2800, 1160, 320],
    [3130, 1090, 320], [3400, 1000, 285], [3540, 1160, 230],
    [1030, 1400, 260], [1250, 1600, 275], [940, 1660, 200],
    [1590, 1650, 300], [1900, 1720, 290], [2200, 1680, 300],
    [2500, 1650, 290], [2800, 1620, 290],
    [3140, 1600, 290], [3410, 1520, 260], [3560, 1350, 200],
    [2690, 1670, 235],
    // offshore islets (Bermuda ring of small islands)
    [252, 972, 74], [178, 1082, 52], [330, 1520, 82], [452, 1622, 54],
    [1420, 2074, 76], [1660, 2122, 58], [2380, 2078, 88], [3010, 2014, 70],
    [3806, 762, 86], [3702, 1706, 62], [66, 606, 60], [2876, 2202, 66]
  ];
  // negative blobs carve bays / inlets / lagoons
  var BAYS = [
    [884, 1206, 152, 1.05], [806, 1320, 74, 0.62], [2380, 1345, 168, 1.05],
    [3320, 1290, 108, 0.85], [3520, 1330, 92, 0.7], [1500, 340, 92, 0.5],
    [1730, 292, 110, 0.62], [2650, 320, 100, 0.58], [1180, 476, 88, 0.5],
    [1520, 1900, 132, 0.72], [3002, 1852, 106, 0.58], [704, 1652, 88, 0.55],
    [3624, 1202, 98, 0.66], [2052, 1950, 78, 0.45]
  ];
  var PEAKS = [
    [2080, 470, 1.42, 150], [1790, 760, 0.34, 220], [2490, 690, 0.36, 230],
    [3200, 640, 0.32, 220], [3290, 1590, 0.55, 280], [3420, 1470, 0.40, 200],
    [1180, 1640, 0.30, 250], [760, 1010, 0.24, 210], [1310, 1180, 0.22, 200],
    [2680, 1300, 0.20, 190]
  ];
  var LAKES = [
    [1447, 1000, 150], [1372, 1058, 100], [1524, 1078, 92], [1400, 950, 80],
    [2760, 1700, 88], [2830, 1652, 66], [2650, 1710, 52]
  ];

  function blobSum(x, y, arr) {
    var v = 0, i, b, dx, dy, d2;
    for (i = 0; i < arr.length; i++) {
      b = arr[i]; dx = x - b[0]; dy = y - b[1];
      d2 = (dx * dx + dy * dy) / (b[2] * b[2]);
      if (d2 < 2.0) v += Math.pow(1 - d2 / 2.0, 1.6) * (b[3] || 1);
    }
    return v;
  }

  function maskAt(x, y) {
    // organic warp so the coastline never looks like circles
    var wx = x + (fbm(x * 0.0016, y * 0.0016, 4, 11) - 0.5) * 380;
    var wy = y + (fbm(x * 0.0016 + 41, y * 0.0016 - 27, 4, 23) - 0.5) * 320;
    var v = blobSum(wx, wy, LAND) - blobSum(wx, wy, BAYS);
    // mid + fine coast detail
    v += (fbm(x * 0.0062, y * 0.0062, 3, 5) - 0.5) * 0.24;
    v += (fbm(x * 0.021, y * 0.021, 2, 9) - 0.5) * 0.10;
    return v - 0.62;
  }
  function lakeAt(x, y) {
    var v = 0, i, b, dx, dy, d2;
    for (i = 0; i < LAKES.length; i++) {
      b = LAKES[i]; dx = x - b[0]; dy = y - b[1];
      d2 = (dx * dx + dy * dy) / (b[2] * b[2]);
      if (d2 < 2.0) v += Math.pow(1 - d2 / 2.0, 1.4);
    }
    var warp = (fbm(x * 0.012, y * 0.012, 3, 33) - 0.5) * 0.20;
    return v + warp - 0.42;
  }

  /* ---------------- field grids ---------------- */
  var maskArr = new Float32Array(GW * GH);
  var elevArr = new Float32Array(GW * GH);
  var moistArr = new Float32Array(GW * GH);
  var lakeArr = new Float32Array(GW * GH);

  function sampleGrid(arr, x, y) {
    var fx = x / CS - 0.5, fy = y / CS - 0.5;
    if (fx < 0) fx = 0; else if (fx > GW - 1.002) fx = GW - 1.002;
    if (fy < 0) fy = 0; else if (fy > GH - 1.002) fy = GH - 1.002;
    var x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    var i = y0 * GW + x0;
    var a = arr[i], b = arr[i + 1], c = arr[i + GW], d = arr[i + GW + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  function buildFields() {
    var gx, gy, i, x, y, m, l, e, hv, moist, coast;
    for (gy = 0; gy < GH; gy++) {
      y = (gy + 0.5) * CS;
      for (gx = 0; gx < GW; gx++) {
        x = (gx + 0.5) * CS;
        i = gy * GW + gx;
        m = maskAt(x, y);
        l = lakeAt(x, y);
        e = 0; hv = 0;
        if (m > -0.02) {
          var j, peakSum = 0;
          for (j = 0; j < PEAKS.length; j++) {
            var p = PEAKS[j], dx = x - p[0], dy = y - p[1];
            peakSum += p[2] * Math.exp(-(dx * dx + dy * dy) / (2 * p[3] * p[3]));
          }
          // rocky gullies only high on the slopes → readable ridges
          hv = peakSum;
          hv += 0.16 * ridged(x * 0.0130, y * 0.0130, 3, 77) * clamp01(peakSum * 1.7);
          hv += 0.18 * ridged(x * 0.0040, y * 0.0040, 4, 71);
          hv += 0.07 * fbm(x * 0.014, y * 0.014, 3, 91);
          // crater bowl at the alien core
          var cdx = x - 2062, cdy = y - 450, cdist = Math.hypot(cdx, cdy);
          if (cdist < 86) hv -= Math.pow(1 - cdist / 86, 1.7) * 0.62;
          coast = smoothstep(-0.02, 0.10, m);
          e = clamp01((0.05 + hv * 0.92) * Math.pow(coast, 0.85));
          if (l > 0.02) e *= clamp01(1 - (l - 0.02) * 2.2); // carve lake beds
        }
        maskArr[i] = m; lakeArr[i] = l; elevArr[i] = e;
        moist = clamp01(0.28 + 0.78 * fbm(x * 0.0018, y * 0.0018, 4, 131)
          - 0.32 * e + 0.14 * fbm(x * 0.0072, y * 0.0072, 3, 151));
        moistArr[i] = moist;
      }
    }
  }

  // public samplers
  BS.W = W; BS.H = H; BS.GW = GW; BS.GH = GH; BS.CS = CS;
  BS.METERS_PER_UNIT = METERS_PER_UNIT; BS.WORLD_KM = WORLD_KM;
  BS.mask = function (x, y) { return sampleGrid(maskArr, x, y); };
  BS.elev = function (x, y) { return sampleGrid(elevArr, x, y); };
  BS.moist = function (x, y) { return sampleGrid(moistArr, x, y); };
  BS.lake = function (x, y) { return sampleGrid(lakeArr, x, y); };
  BS.isLand = function (x, y) { return sampleGrid(maskArr, x, y) > 0.012 && sampleGrid(lakeArr, x, y) < 0.03; };
  BS.raw = { maskArr: maskArr, elevArr: elevArr, moistArr: moistArr, lakeArr: lakeArr };
  BS.noise = { noise2: noise2, fbm: fbm, ridged: ridged, hash2: hash2 };
  BS.util = { clamp: clamp, clamp01: clamp01, lerp: lerp, smoothstep: smoothstep, mulberry32: mulberry32 };

  /* ---------------- contour extraction (marching squares) ---------------- */
  var MS = {
    1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
    5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[3, 2]],
    9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[1, 2]], 12: [[3, 1]],
    13: [[0, 1]], 14: [[3, 0]]
  };

  function contour(field, level) {
    var pts = [], byKey = new Map(), segs = [], adj = new Map();
    function keyOf(x, y) { return Math.round(x * 4) + ':' + Math.round(y * 4); }
    function addP(x, y) {
      var k = keyOf(x, y), id = byKey.get(k);
      if (id === undefined) { id = pts.length; pts.push([x, y]); byKey.set(k, id); }
      return id;
    }
    function lookup(x0, y0, x1, y1, v0, v1) {
      var t = (level - v0) / (v1 - v0);
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
    var gx, gy, i, v0, v1, v2, v3, code, x0, y0, x1, y1, edges, p;
    for (gy = 0; gy < GH - 1; gy++) {
      y0 = gy * CS; y1 = y0 + CS;
      for (gx = 0; gx < GW - 1; gx++) {
        i = gy * GW + gx;
        v0 = field[i]; v1 = field[i + 1]; v2 = field[i + GW + 1]; v3 = field[i + GW];
        code = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0);
        if (code === 0 || code === 15) continue;
        x0 = gx * CS; x1 = x0 + CS;
        edges = MS[code];
        for (var s = 0; s < edges.length; s++) {
          var a = null, b = null;
          for (var k = 0; k < 2; k++) {
            var ei = edges[s][k], pt;
            if (ei === 0) pt = lookup(x0, y0, x1, y0, v0, v1);
            else if (ei === 1) pt = lookup(x1, y0, x1, y1, v1, v2);
            else if (ei === 2) pt = lookup(x0, y1, x1, y1, v3, v2);
            else pt = lookup(x0, y0, x0, y1, v0, v3);
            if (k === 0) a = pt; else b = pt;
          }
          var ia = addP(a[0], a[1]), ib = addP(b[0], b[1]);
          if (ia === ib) continue;
          segs.push([ia, ib]);
          if (!adj.has(ia)) adj.set(ia, []);
          if (!adj.has(ib)) adj.set(ib, []);
          adj.get(ia).push(ib); adj.get(ib).push(ia);
        }
      }
    }
    // stitch segments into polylines
    var used = new Set(), lines = [], id, line, prev, cur, nbs, nx, guard;
    function edgeKey(a, b) { return a < b ? a + '_' + b : b + '_' + a; }
    var starts = [];
    adj.forEach(function (list, node) { if (list.length !== 2) starts.push(node); });
    adj.forEach(function (list, node) { starts.push(node); });

    function walk(start) {
      var line = [], cur = start, prev = -1, guard = 0;
      while (cur !== undefined && guard++ < 200000) {
        line.push(pts[cur]);
        var list = adj.get(cur) || [], nxt = -1;
        for (var q = 0; q < list.length; q++) {
          var cand = list[q];
          if (cand === prev) continue;
          if (!used.has(edgeKey(cur, cand))) { nxt = cand; break; }
        }
        if (nxt < 0) break;
        used.add(edgeKey(cur, nxt));
        prev = cur; cur = nxt;
      }
      return line;
    }
    for (var si = 0; si < starts.length; si++) {
      id = starts[si];
      if (!adj.has(id)) continue;
      var list0 = adj.get(id), open = false;
      for (var q2 = 0; q2 < list0.length; q2++) {
        if (!used.has(edgeKey(id, list0[q2]))) { open = true; break; }
      }
      if (!open) continue;
      line = walk(id);
      if (line.length > 1) lines.push(line);
    }
    return lines;
  }
  BS.contour = contour;

  /* ---------------- spline ---------------- */
  function smoothPath(pts, seg) {
    if (pts.length < 3) return pts.slice();
    seg = seg || 10;
    var out = [], p = pts, i, j, t, t2, t3;
    var P = [p[0]].concat(p, [p[p.length - 1]]);
    for (i = 1; i < P.length - 2; i++) {
      var p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
      for (j = 0; j < seg; j++) {
        t = j / seg; t2 = t * t; t3 = t2 * t;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    out.push(p[p.length - 1]);
    return out;
  }

  /* ---------------- roads ---------------- */
  var ROAD_DEFS = [
    // coastal ring highway
    { kind: 'highway', w: 22, pts: [[545, 820], [600, 900], [700, 975], [790, 1035], [860, 1120], [905, 1230], [950, 1330], [1000, 1425], [1060, 1500], [1140, 1560], [1240, 1600], [1360, 1640], [1500, 1690], [1660, 1720], [1840, 1730], [2040, 1740], [2240, 1735], [2440, 1710], [2620, 1690], [2800, 1665], [2960, 1620], [3120, 1585], [3280, 1560], [3400, 1520], [3480, 1440], [3520, 1330], [3530, 1220], [3500, 1130]] },
    // city ↔ west
    { kind: 'highway', w: 19, pts: [[860, 1120], [1000, 1100], [1140, 1090], [1280, 1080], [1400, 1090], [1540, 1080], [1700, 1060], [1880, 1040], [2060, 1030], [2294, 1020]] },
    // city ↔ airport ↔ east
    { kind: 'highway', w: 19, pts: [[2294, 1020], [2480, 1010], [2680, 1000], [2880, 1005], [3080, 1040], [3260, 1090], [3410, 1130]] },
    // central spine north (to volcano)
    { kind: 'highway', w: 17, pts: [[2294, 1020], [2270, 900], [2240, 790], [2200, 690], [2150, 600], [2090, 545], [2062, 500]] },
    // east coast north (airport → alien base → research)
    { kind: 'road', w: 14, pts: [[3500, 1130], [3490, 1030], [3470, 930], [3465, 820], [3500, 720], [3522, 640]] },
    { kind: 'road', w: 13, pts: [[3465, 820], [3350, 780], [3200, 720], [3080, 640], [2990, 540], [2920, 440], [2883, 372]] },
    // north jungle spur
    { kind: 'dirt', w: 11, pts: [[700, 975], [745, 870], [800, 760], [855, 660], [905, 570], [928, 505]] },
    // military base access
    { kind: 'road', w: 14, pts: [[1000, 1425], [1010, 1480], [1010, 1520]] },
    // farm access + city south
    { kind: 'dirt', w: 10, pts: [[1840, 1730], [1850, 1660], [1862, 1580], [1870, 1500]] },
    { kind: 'road', w: 12, pts: [[2294, 1020], [2320, 1120], [2340, 1200], [2350, 1270]] },
    // mine access
    { kind: 'dirt', w: 10, pts: [[3280, 1560], [3330, 1570], [3372, 1543]] },
    // swamp boardwalk road
    { kind: 'dirt', w: 9, pts: [[2620, 1690], [2680, 1660], [2731, 1659], [2790, 1665], [2840, 1650]] },
    // paradise lake loop
    { kind: 'dirt', w: 9, pts: [[1280, 1080], [1300, 990], [1360, 920], [1450, 905], [1540, 930], [1580, 1000], [1560, 1080]] },
    // beach town promenade
    { kind: 'road', w: 11, pts: [[790, 1035], [820, 1085], [845, 1150], [870, 1200]] },
    // lighthouse minor
    { kind: 'dirt', w: 9, pts: [[600, 900], [560, 860], [533, 800]] }
  ];

  /* ---------------- POI + region data ---------------- */
  var POIS = [
    {
      id: 'alien-core', type: 'alien', name: 'هسته‌ی فضایی', x: 2062, y: 448, danger: 5, mission: 'main',
      sub: 'قلب اشغال · منطقه‌ی ممنوعه',
      desc: 'ستون نور بنفش از دهانه‌ی آتشفشان به آسمان می‌رود. هسته‌ی فرماندهی بیگانگان زیر همین قله است و کل جزیره از این‌جا کنترل می‌شود.',
      tags: ['مأموریت اصلی', 'دشمن سطح ۵', 'تجهیزات بیگانه']
    },
    {
      id: 'research-outpost', type: 'side', name: 'پایگاه تحقیقاتی', x: 2883, y: 372, danger: 3, mission: 'side',
      sub: 'آزمایشگاه متروکه‌ی دکتر آریان',
      desc: 'تیم علمی پیش از سقوط جزیره این‌جا روی DNA بیگانگان کار می‌کرد. داده‌های ناتمام هنوز روی سرورهاست.',
      tags: ['مأموریت فرعی', 'اسناد', 'ارتقای تجهیزات']
    },
    {
      id: 'alien-base', type: 'alien', name: 'پایگاه فضایی‌ها', x: 3522, y: 640, danger: 5, mission: null,
      sub: 'سکوی فرود و مولد سپر',
      desc: 'زره‌پوش‌های سنگین از این پایگاه محافظت می‌کنند. مولد سپر باید از کار بیفتد تا مسیر هسته باز شود.',
      tags: ['دشمن سطح ۵', 'مولد سپر', 'منطقه‌ی اشغالی']
    },
    {
      id: 'airport', type: 'airport', name: 'فرودگاه بین‌المللی', x: 3410, y: 1085, danger: 3, mission: null,
      sub: 'باند فرود · آشیانه‌ها',
      desc: 'تنها راه خروج از جزیره. باند سالم است اما برج مراقبت در اختیار گروه‌های مهاجم قرار دارد.',
      tags: ['خودرو', 'سوخت', 'مأموریت فرعی']
    },
    {
      id: 'central-city', type: 'safehouse', name: 'شهر مرکزی', x: 2294, y: 1010, danger: 2, mission: null,
      sub: 'پناهگاه امن · بازار · میز کار',
      desc: 'آخرین شهر سازمان‌یافته‌ی جزیره. بازار سیاه، میز ساخت سلاح و پناهگاه امن در بخش شرقی شهر.',
      tags: ['پناهگاه', 'فروشگاه', 'میز کار', 'خودرو']
    },
    {
      id: 'paradise-lake', type: 'side', name: 'دریاچه‌ی بهشت', x: 1447, y: 1000, danger: 1, mission: 'side',
      sub: 'آب شیرین · کمپ ماهیگیری',
      desc: 'آب شیرین و آرام‌ترین نقطه‌ی جزیره؛ اما آبشار شمالی محل تخم‌گذاری موجودات جهش‌یافته است.',
      tags: ['آب شیرین', 'ماهیگیری', 'مأموریت فرعی']
    },
    {
      id: 'beach-town', type: 'safehouse', name: 'شهر ساحلی', x: 819, y: 1085, danger: 2, mission: null,
      sub: 'اسکله · خانه‌ی امن شماره ۲',
      desc: 'خانه‌های چوبی روی ساحل و یک اسکله‌ی قدیمی. بهترین نقطه برای شروع شکار و جمع‌آوری منابع اولیه.',
      tags: ['پناهگاه', 'فروشگاه', 'قایق']
    },
    {
      id: 'lighthouse', type: 'radio', name: 'فانوس دریایی', x: 533, y: 760, danger: 1, mission: null,
      sub: 'برج رادیویی جزیره',
      desc: 'از این فانوس می‌توان شبکه‌ی ارتباطی را فعال کرد و نقاط ناشناخته‌ی نقشه را باز کرد.',
      tags: ['برج رادیو', 'باز کردن نقشه']
    },
    {
      id: 'north-jungle', type: 'side', name: 'جنگل شمالی', x: 928, y: 545, danger: 4, mission: 'side',
      sub: 'شکار · گیاهان دارویی',
      desc: 'جنگل انبوه با مسیرهای باریک؛ لانه‌ی «خاردار رانده» در دل درختان است.',
      tags: ['شکار', 'گیاه دارویی', 'دشمن سطح ۴']
    },
    {
      id: 'military-base', type: 'locked', name: 'پایگاه نظامی', x: 1010, y: 1510, danger: 4, mission: null,
      sub: 'منطقه‌ی قفل‌شده',
      desc: 'زرادخانه‌ی ارتش جزیره. برای ورود باید ژتون امنیتی از فرودگاه را به دست بیاوری.',
      tags: ['قفل‌شده', 'سلاح سنگین', 'زره']
    },
    {
      id: 'sugarcane-farm', type: 'side', name: 'مزرعه‌ی نیشکر', x: 1884, y: 1690, danger: 2, mission: 'side',
      sub: 'مزارع · آسیاب بادی',
      desc: 'مزارع وسیع نیشکر و سیلوهای متروکه؛ مخفیگاه خوبی برای کاروان‌های تدارکاتی.',
      tags: ['منابع', 'مأموریت فرعی', 'خودرو']
    },
    {
      id: 'mangrove-swamp', type: 'danger', name: 'باتلاق حرا', x: 2731, y: 1660, danger: 4, mission: null,
      sub: 'منطقه‌ی خطر · آب کم‌عمق',
      desc: 'مه و ریشه‌های درهم؛ موجودات «انگل‌تن» در آب کمین می‌کنند. دید در این منطقه بسیار کم است.',
      tags: ['خطر', 'دید کم', 'گیاه کمیاب']
    },
    {
      id: 'abandoned-mine', type: 'side', name: 'معدن متروکه', x: 3372, y: 1543, danger: 4, mission: 'side',
      sub: 'تونل‌ها · سنگ معدن',
      desc: 'تونل‌های قدیمی معدن به شبکه‌ی غارهای زیرزمینی وصل می‌شوند که بیگانگان از آن‌ها استفاده می‌کنند.',
      tags: ['سنگ معدن', 'غار', 'دشمن سطح ۴']
    },
    {
      id: 'danger-nw', type: 'danger', name: 'دشت سوخته', x: 1160, y: 430, danger: 5, mission: null,
      sub: 'منطقه‌ی خطر · تابش بالا',
      desc: 'نقطه‌ی سقوط اولین کپسول. تشعشع بنفش زمین را سوزانده و هر موجودی که وارد شود تغییر می‌کند.',
      tags: ['خطر', 'تابش', 'زره لازم']
    },
    {
      id: 'danger-se', type: 'danger', name: 'دهانه‌ی جنوبی', x: 3345, y: 1815, danger: 5, mission: null,
      sub: 'منطقه‌ی خطر · لانه‌ی بال‌دارها',
      desc: 'دهانه‌ای سنگی که هر شب از آن دسته‌های بال‌دار بیرون می‌آیند و به سمت شهرهای جزیره پرواز می‌کنند.',
      tags: ['خطر', 'شب', 'پرواز']
    },
    // ---- small markers ----
    { id: 'shop-city', type: 'shop', name: 'بازار شهر مرکزی', x: 2210, y: 1045, danger: 1, desc: 'خرید و فروش منابع، مهمات و نقشه‌های محلی.', tags: ['فروشگاه'], sub: 'فروشگاه' },
    { id: 'shop-beach', type: 'shop', name: 'بازار شهر ساحلی', x: 860, y: 1145, danger: 1, desc: 'مبادله‌ی غذا و قطعات تعمیر قایق.', tags: ['فروشگاه'], sub: 'فروشگاه' },
    { id: 'bench-city', type: 'workbench', name: 'میز کار مرکزی', x: 2380, y: 1060, danger: 1, desc: 'ساخت و ارتقای سلاح‌ها با قطعات بیگانه.', tags: ['میز کار'], sub: 'میز کار' },
    { id: 'bench-mil', type: 'workbench', name: 'میز کار نظامی', x: 1050, y: 1560, danger: 4, desc: 'ارتقای سلاح‌های سنگین؛ نیازمند ژتون امنیتی.', tags: ['میز کار'], sub: 'میز کار' },
    { id: 'safe-beach', type: 'safehouse', name: 'خانه‌ی امن ساحلی', x: 790, y: 1010, danger: 1, desc: 'ذخیره‌ی پیشرفت، خواب و بازسازی تجهیزات.', tags: ['پناهگاه'], sub: 'پناهگاه' },
    { id: 'safe-city', type: 'safehouse', name: 'خانه‌ی امن شرقی', x: 2450, y: 930, danger: 1, desc: 'پناهگاه دوم در شرق شهر؛ نزدیک به فرودگاه.', tags: ['پناهگاه'], sub: 'پناهگاه' },
    { id: 'safe-jungle', type: 'safehouse', name: 'کلبه‌ی جنگلی', x: 985, y: 640, danger: 3, desc: 'کلبه‌ای پنهان در جنگل شمالی؛ نقطه‌ی شروع نفوذ به قله.', tags: ['پناهگاه'], sub: 'پناهگاه' },
    { id: 'radio-1', type: 'radio', name: 'برج رادیو شمالی', x: 2530, y: 700, danger: 3, desc: 'فعال‌سازی این برج بخش شمالی نقشه را باز می‌کند.', tags: ['برج رادیو'], sub: 'برج رادیو' },
    { id: 'radio-2', type: 'radio', name: 'برج رادیو شرقی', x: 3600, y: 1250, danger: 3, desc: 'ارتباط با خارج جزیره؛ کلید مأموریت نهایی.', tags: ['برج رادیو'], sub: 'برج رادیو' },
    { id: 'radio-3', type: 'radio', name: 'برج رادیو جنوبی', x: 1420, y: 1880, danger: 2, desc: 'پوشش ارتباطی جنوب و غرب جزیره.', tags: ['برج رادیو'], sub: 'برج رادیو' },
    { id: 'veh-1', type: 'vehicle', name: 'خودروی رهاشده', x: 1800, y: 1120, danger: 1, desc: 'یک وانت سالم با باک نیمه‌پر.', tags: ['خودرو'], sub: 'خودرو' },
    { id: 'veh-2', type: 'vehicle', name: 'قایق تندرو', x: 900, y: 1275, danger: 1, desc: 'قایق تندرو در اسکله‌ی شهر ساحلی.', tags: ['قایق'], sub: 'خودرو' },
    { id: 'veh-3', type: 'vehicle', name: 'کامیون نظامی', x: 1120, y: 1470, danger: 3, desc: 'کامیون زره‌پوش با باک پر.', tags: ['خودرو'], sub: 'خودرو' },
    { id: 'veh-4', type: 'vehicle', name: 'هلیکوپتر فرودگاه', x: 3300, y: 1180, danger: 3, desc: 'هلیکوپتر ترابری؛ نیازمند سوخت.', tags: ['هلیکوپتر'], sub: 'خودرو' },
    { id: 'side-lake', type: 'side', name: 'کمپ ماهیگیری', x: 1360, y: 1120, danger: 1, desc: 'مأموریت فرعی: نجات ماهیگیر گرفتار در باتلاق.', tags: ['مأموریت فرعی'], sub: 'مأموریت فرعی' },
    { id: 'side-waterfall', type: 'side', name: 'آبشار شمالی', x: 1608, y: 792, danger: 3, desc: 'مأموریت فرعی: نمونه‌گیری از تخم‌های جهش‌یافته.', tags: ['مأموریت فرعی'], sub: 'مأموریت فرعی' }
  ];

  var REGIONS = [
    { x: 2062, y: 330, text: 'قله‌ی برمودا', size: 15, cls: 'peak' },
    { x: 928, y: 505, text: 'جنگل شمالی', size: 15, cls: 'land' },
    { x: 1447, y: 950, text: 'دریاچه‌ی بهشت', size: 14, cls: 'lake' },
    { x: 819, y: 1005, text: 'شهر ساحلی', size: 14, cls: 'land' },
    { x: 2294, y: 940, text: 'شهر مرکزی', size: 17, cls: 'city' },
    { x: 3410, y: 1005, text: 'فرودگاه بین‌المللی', size: 13, cls: 'land' },
    { x: 3522, y: 565, text: 'پایگاه فضایی‌ها', size: 13, cls: 'alien' },
    { x: 2883, y: 305, text: 'پایگاه تحقیقاتی', size: 13, cls: 'land' },
    { x: 1010, y: 1452, text: 'پایگاه نظامی', size: 14, cls: 'land' },
    { x: 1884, y: 1645, text: 'مزرعه‌ی نیشکر', size: 13, cls: 'land' },
    { x: 2731, y: 1596, text: 'باتلاق حرا', size: 13, cls: 'swamp' },
    { x: 3372, y: 1490, text: 'معدن متروکه', size: 13, cls: 'land' },
    { x: 533, y: 700, text: 'فانوس دریایی', size: 12, cls: 'land' },
    { x: 830, y: 250, text: 'اقیانوس اطلس', size: 16, cls: 'sea' },
    { x: 3330, y: 2130, text: 'مثلث برمودا', size: 18, cls: 'sea' }
  ];

  /* ---------------- generated structures ---------------- */
  var roads = [], rails = [], buildings = [], props = [], trees = [], wrecks = [], pads = [];

  function addRoad(def) {
    var pts = smoothPath(def.pts, 12);
    roads.push({ kind: def.kind, w: def.w, pts: pts });
    return pts;
  }

  // ---- city generator: rotated street grid, clipped to dry land ----
  function clipRun(pts, test) {
    // keep the longest contiguous run of points that pass the test
    var best = null, run = [], i, p;
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      var ok = test ? test(p[0], p[1]) : (BS.isLand(p[0], p[1]) && BS.elev(p[0], p[1]) < 0.55);
      if (ok) {
        run.push(p);
        if (!best || run.length > best.length) best = run.slice();
      } else run = [];
    }
    return best && best.length > 2 ? best : null;
  }

  function buildCity(cx, cy, cols, rows, rot, blockW, blockH, density, R) {
    var cos = Math.cos(rot), sin = Math.sin(rot);
    function toWorld(lx, ly) { return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos]; }
    var i, j, k, t, line, seg;
    var SW = cols * blockW, SH = rows * blockH;
    var urban = function (x, y) {
      return BS.isLand(x, y) && BS.elev(x, y) < 0.55 &&
        Math.hypot(x - cx, y - cy) < Math.max(SW, SH) * 0.60;
    };

    // vertical + horizontal streets, sampled then clipped to the built-up area
    for (i = 0; i <= cols; i++) {
      var lx = (i - cols / 2) * blockW + blockW / 2;
      line = [];
      for (t = -0.62; t <= 0.62001; t += 0.05) line.push(toWorld(lx, t * SH));
      seg = clipRun(line, urban);
      if (seg) roads.push({ kind: 'street', w: 8, pts: seg });
    }
    for (j = 0; j <= rows; j++) {
      var ly2 = (j - rows / 2) * blockH + blockH / 2;
      line = [];
      for (t = -0.62; t <= 0.62001; t += 0.05) line.push(toWorld(t * SW, ly2));
      seg = clipRun(line, urban);
      if (seg) roads.push({ kind: 'street', w: 8, pts: seg });
    }

    // city blocks
    for (i = 0; i < cols; i++) {
      for (j = 0; j < rows; j++) {
        var bx = (i - cols / 2 + 0.5) * blockW, by = (j - rows / 2 + 0.5) * blockH;
        var center = toWorld(bx, by);
        if (!BS.isLand(center[0], center[1])) continue;
        if (BS.elev(center[0], center[1]) > 0.55) continue;
        // paved ground under every block so the city reads as urban
        var lot = toWorld(bx, by);
        var isPark = R() < 0.10;
        props.push({
          kind: isPark ? 'parklot' : 'urbanlot', x: lot[0], y: lot[1],
          w: blockW * 0.90, h: blockH * 0.90, rot: rot, tone: R()
        });
        if (isPark) continue;
        var n = R() < density ? (R() < 0.55 ? 2 : 1) : 0;
        for (k = 0; k < n; k++) {
          var w = blockW * (0.30 + R() * 0.30);
          var h = blockH * (0.28 + R() * 0.30);
          var ox = (k === 0 ? -1 : 1) * blockW * (0.10 + R() * 0.14);
          var oy = (R() - 0.5) * blockH * 0.26;
          var p = toWorld(bx + ox, by + oy);
          if (!BS.isLand(p[0], p[1])) continue;
          var dist = Math.hypot(p[0] - cx, p[1] - cy);
          var floors = 1 + Math.round(Math.max(0, 1 - dist / (SW * 0.42)) * 5 * R() + R() * 1.6);
          buildings.push({
            x: p[0], y: p[1], w: w, h: h, rot: rot, floors: floors,
            tone: R(), kind: floors > 3 ? 'tower' : 'block'
          });
        }
      }
    }
    // central plaza
    var pl = toWorld(0, 0);
    props.push({ kind: 'plaza', x: pl[0], y: pl[1], w: blockW * 0.9, h: blockH * 0.9, rot: rot });
  }

  // ---- helpers ----
  function addBox(list, x, y, w, h, rot, floors, kind, tone) {
    list.push({ x: x, y: y, w: w, h: h, rot: rot, floors: floors || 1, kind: kind || 'block', tone: tone === undefined ? Math.random() : tone });
  }

  function buildStructures(R) {
    /* ============ CENTRAL CITY ============ */
    buildCity(2294, 1010, 9, 6, -0.14, 92, 70, 0.94, R);

    /* ============ BEACH TOWN ============ */
    (function () {
      var houses = 26, i;
      for (i = 0; i < houses; i++) {
        var ang = R() * Math.PI * 2, rad = 60 + R() * 185;
        var x = 845 + Math.cos(ang) * rad * 1.15, y = 1120 + Math.sin(ang) * rad * 0.8;
        if (!BS.isLand(x, y)) continue;
        addBox(buildings, x, y, 22 + R() * 16, 18 + R() * 12, -0.1 + R() * 0.5, 1 + (R() < 0.25 ? 1 : 0), 'house', R());
      }
      // resort complex on the point
      addBox(buildings, 760, 980, 74, 40, 0.18, 3, 'block', 0.75);
      addBox(buildings, 705, 1030, 34, 34, 0.18, 1, 'block', 0.4);
      // pier
      props.push({ kind: 'pier', x: 900, y: 1235, len: 190, rot: 1.15, w: 18 });
      props.push({ kind: 'pier', x: 870, y: 1265, len: 110, rot: 1.9, w: 11 });
    })();

    /* ============ AIRPORT ============ */
    (function () {
      var cx = 3400, cy = 1090, rot = -0.10;
      var cos = Math.cos(rot), sin = Math.sin(rot);
      function P(lx, ly) { return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos]; }
      // apron ground, then runway (long strip) + taxiway
      props.push({ kind: 'airfield', x: cx, y: cy, w: 980, h: 340, rot: rot, tone: 0.5 });
      props.push({ kind: 'runway', x: cx, y: cy, len: 900, w: 54, rot: rot });
      props.push({ kind: 'taxiway', x: cx - 20, y: cy + 92, len: 780, w: 20, rot: rot });
      props.push({ kind: 'taxiway', x: cx - 20, y: cy - 92, len: 640, w: 18, rot: rot });
      // terminal + tower + hangars + tanks
      var t = P(60, 175); addBox(buildings, t[0], t[1], 190, 62, rot, 2, 'block', 0.68);
      var tw = P(-160, 210); addBox(buildings, tw[0], tw[1], 22, 22, rot, 5, 'tower', 0.9);
      var hg, i;
      for (i = 0; i < 4; i++) {
        hg = P(-300 + i * 70, 190);
        addBox(buildings, hg[0], hg[1], 58, 44, rot, 1, 'hangar', 0.55 + i * 0.05);
      }
      for (i = 0; i < 3; i++) {
        var tk = P(220 + i * 34, 200);
        props.push({ kind: 'tank', x: tk[0], y: tk[1], r: 13, rot: rot });
      }
      var ap = P(-120, 120); props.push({ kind: 'apron', x: ap[0], y: ap[1], len: 240, w: 90, rot: rot });
      // parked planes
      var p1 = P(-60, 120), p2 = P(140, 118);
      props.push({ kind: 'plane', x: p1[0], y: p1[1], rot: rot + 0.1, s: 1 });
      props.push({ kind: 'plane', x: p2[0], y: p2[1], rot: rot + Math.PI + 0.08, s: 0.9 });
      // perimeter fence
      props.push({ kind: 'fence', x: cx, y: cy, len: 1000, w: 300, rot: rot });
    })();

    /* ============ MILITARY BASE ============ */
    (function () {
      var cx = 1010, cy = 1520, rot = 0.12, cos = Math.cos(rot), sin = Math.sin(rot);
      function P(lx, ly) { return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos]; }
      props.push({ kind: 'compound', x: cx, y: cy, w: 300, h: 210, rot: rot });
      var i, p;
      for (i = 0; i < 4; i++) {
        p = P(-90, -70 + i * 46);
        addBox(buildings, p[0], p[1], 60, 26, rot, 1, 'barrack', 0.3 + i * 0.08);
      }
      p = P(70, -50); addBox(buildings, p[0], p[1], 78, 52, rot, 2, 'block', 0.6);
      p = P(85, 55); addBox(buildings, p[0], p[1], 44, 34, rot, 1, 'hangar', 0.45);
      p = P(-40, 74); props.push({ kind: 'helipad', x: p[0], y: p[1], r: 34, rot: rot });
      for (i = 0; i < 4; i++) {
        p = P(-130 + i * 30, 80);
        props.push({ kind: 'container', x: p[0], y: p[1], rot: rot + (R() - 0.5) * 0.2, s: 1 });
      }
      var g1 = P(0, -95), g2 = P(-140, -20), g3 = P(135, -5);
      props.push({ kind: 'watchtower', x: g1[0], y: g1[1], rot: rot });
      props.push({ kind: 'watchtower', x: g2[0], y: g2[1], rot: rot });
      props.push({ kind: 'watchtower', x: g3[0], y: g3[1], rot: rot });
    })();

    /* ============ RESEARCH OUTPOST ============ */
    (function () {
      var cx = 2883, cy = 372;
      props.push({ kind: 'compound', x: cx, y: cy, w: 210, h: 150, rot: -0.2 });
      addBox(buildings, cx - 30, cy + 10, 62, 40, -0.2, 2, 'lab', 0.55);
      addBox(buildings, cx + 55, cy - 20, 40, 34, -0.2, 1, 'lab', 0.35);
      props.push({ kind: 'dome', x: cx + 20, y: cy + 55, r: 34 });
      props.push({ kind: 'dome', x: cx - 70, y: cy + 55, r: 24 });
      props.push({ kind: 'dish', x: cx - 85, y: cy - 30, r: 22 });
      props.push({ kind: 'solar', x: cx + 95, y: cy + 45, w: 70, h: 46, rot: -0.2 });
    })();

    /* ============ ALIEN BASE ============ */
    (function () {
      var cx = 3522, cy = 640, i;
      for (i = 0; i < 6; i++) {
        var ang = (i / 6) * Math.PI * 2 + 0.4;
        var rad = 60 + (i % 2) * 34;
        props.push({
          kind: 'spire', x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad * 0.8,
          h: 70 + (i % 3) * 30, r: 13 + (i % 2) * 4, rot: ang
        });
      }
      props.push({ kind: 'aliencrater', x: cx, y: cy, r: 88 });
      props.push({ kind: 'crystal', x: cx, y: cy, r: 26 });
    })();

    /* ============ ALIEN CORE (volcano summit) ============ */
    props.push({ kind: 'corebeam', x: 2062, y: 448, h: 260 });
    (function () {
      var i;
      for (i = 0; i < 5; i++) {
        var ang = (i / 5) * Math.PI * 2 + 0.2;
        props.push({ kind: 'spire', x: 2062 + Math.cos(ang) * 52, y: 448 + Math.sin(ang) * 44, h: 46 + (i % 2) * 22, r: 9, rot: ang });
      }
    })();

    /* ============ ABANDONED MINE ============ */
    (function () {
      var cx = 3372, cy = 1543, i;
      props.push({ kind: 'quarry', x: cx + 40, y: cy + 30, r: 110, rot: 0.5 });
      for (i = 0; i < 4; i++) {
        props.push({ kind: 'shaft', x: cx - 60 + i * 46, y: cy - 40 + (i % 2) * 26, r: 12 });
      }
      addBox(buildings, cx - 95, cy + 22, 54, 32, 0.4, 1, 'shed', 0.3);
      addBox(buildings, cx - 55, cy + 68, 34, 24, 0.4, 1, 'shed', 0.5);
      props.push({ kind: 'crane', x: cx + 10, y: cy + 60, h: 54, rot: -0.5 });
      props.push({ kind: 'rail', x: cx - 40, y: cy + 10, len: 260, rot: 2.3 });
      props.push({ kind: 'spoil', x: cx + 120, y: cy + 80, r: 70 });
    })();

    /* ============ SUGARCANE FARM ============ */
    (function () {
      var cx = 1884, cy = 1690, i, j;
      props.push({ kind: 'fields', x: cx, y: cy, w: 620, h: 330, rot: -0.16 });
      addBox(buildings, cx - 60, cy - 95, 70, 44, -0.16, 1, 'barn', 0.42);
      addBox(buildings, cx + 40, cy - 110, 40, 30, -0.16, 1, 'shed', 0.3);
      for (i = 0; i < 3; i++) props.push({ kind: 'silo', x: cx + 10 + i * 30, y: cy - 60, r: 13 });
      props.push({ kind: 'windmill', x: cx + 150, y: cy - 40, h: 56 });
      props.push({ kind: 'windmill', x: cx - 220, y: cy + 60, h: 46 });
      props.push({ kind: 'windmill', x: cx + 240, y: cy + 90, h: 42 });
    })();

    /* ============ LIGHTHOUSE ============ */
    props.push({ kind: 'lighthouse', x: 533, y: 762, h: 66 });
    addBox(buildings, 566, 786, 26, 20, 0.3, 1, 'house', 0.5);

    /* ============ RADIO TOWERS ============ */
    [[2530, 700], [3600, 1250], [1420, 1880]].forEach(function (p) {
      props.push({ kind: 'radiotower', x: p[0], y: p[1], h: 70 });
    });

    /* ============ HARBOUR / DOCKS (central city) ============ */
    props.push({ kind: 'pier', x: 2338, y: 1290, len: 210, rot: 1.35, w: 26 });
    props.push({ kind: 'pier', x: 2250, y: 1280, len: 150, rot: 1.1, w: 14 });
    props.push({ kind: 'pier', x: 2420, y: 1265, len: 130, rot: 1.6, w: 14 });
    props.push({ kind: 'warehouse', x: 2310, y: 1235, w: 90, h: 40, rot: 1.35 });
    props.push({ kind: 'warehouse', x: 2210, y: 1245, w: 70, h: 34, rot: 1.2 });
    props.push({ kind: 'craneport', x: 2382, y: 1272, h: 46, rot: 1.35 });

    /* ============ BRIDGES ============ */
    props.push({ kind: 'bridge', x: 915, y: 1218, len: 150, w: 30, rot: 1.25 });
    props.push({ kind: 'bridge', x: 1790, y: 1690, len: 90, w: 24, rot: 0.02 });

    /* ============ SHIPWRECKS ============ */
    wrecks.push({ x: 300, y: 1430, rot: 0.6, s: 1.2 });
    wrecks.push({ x: 1210, y: 280, rot: -0.3, s: 1.4 });
    wrecks.push({ x: 3230, y: 300, rot: 2.1, s: 1.15 });
    wrecks.push({ x: 3810, y: 1520, rot: 1.2, s: 0.95 });
    wrecks.push({ x: 1550, y: 2060, rot: -0.8, s: 1.05 });
    wrecks.push({ x: 620, y: 1960, rot: 0.2, s: 0.8 });

    /* ============ WATERFALLS ============ */
    props.push({ kind: 'waterfall', x: 1608, y: 792, w: 26, rot: 1.2 });
    props.push({ kind: 'waterfall', x: 1760, y: 880, w: 16, rot: 1.9 });
  }

  /* ---------------- vegetation ---------------- */
  var blockGrid = new Uint8Array(256 * 144);   // 16 units / cell
  function blockAt(x, y) {
    var gx = (x / 16) | 0, gy = (y / 16) | 0;
    if (gx < 0 || gy < 0 || gx >= 256 || gy >= 144) return 1;
    return blockGrid[gy * 256 + gx];
  }
  function markBlock(x, y, r) {
    var gx = (x / 16) | 0, gy = (y / 16) | 0;
    var rr = Math.max(1, Math.round(r / 16));
    for (var j = -rr; j <= rr; j++) for (var i = -rr; i <= rr; i++) {
      var px = gx + i, py = gy + j;
      if (px < 0 || py < 0 || px >= 256 || py >= 144) continue;
      blockGrid[py * 256 + px] = 1;
    }
  }

  function buildVegetation(R) {
    var r, i, j, x, y, m, l, e, mo, rnd, step = 17;
    // block roads
    for (i = 0; i < roads.length; i++) {
      var rd = roads[i], pts = rd.pts;
      for (j = 0; j < pts.length; j += 1) markBlock(pts[j][0], pts[j][1], rd.w * 0.9 + 6);
    }
    // block buildings & props
    for (i = 0; i < buildings.length; i++) markBlock(buildings[i].x, buildings[i].y, Math.max(buildings[i].w, buildings[i].h) * 0.8 + 6);
    for (i = 0; i < props.length; i++) markBlock(props[i].x, props[i].y, (props[i].r || props[i].h || 40) * 0.8 + 8);

    var count = 0;
    for (y = 40; y < H - 30; y += step) {
      for (x = 30; x < W - 30; x += step) {
        var jx = x + (R() - 0.5) * step * 1.3;
        var jy = y + (R() - 0.5) * step * 1.3;
        m = BS.mask(jx, jy);
        if (m < 0.05) continue;
        l = BS.lake(jx, jy);
        if (l > 0.02) continue;
        if (blockAt(jx, jy)) continue;
        e = BS.elev(jx, jy);
        mo = BS.moist(jx, jy);
        rnd = R();

        var dens = 0;
        var type = 'jungle';
        if (m < 0.14 && e < 0.20) { dens = 0.26; type = 'palm'; }          // beach fringe
        else if (mo > 0.56 && e < 0.55) { dens = 0.44; type = 'jungle'; }  // rainforest
        else if (e < 0.5) { dens = 0.16 + mo * 0.20; type = 'jungle'; }    // mixed
        else if (e < 0.64) { dens = 0.07; type = 'bush'; }                 // highland scrub
        else { dens = 0.022; type = 'rock'; }

        // swamp: mangroves are sparser and weirder
        if (mo > 0.72 && e < 0.18) { dens = 0.26; type = 'mangrove'; }
        if (rnd > dens) continue;

        trees.push({
          x: jx, y: jy,
          s: type === 'rock' ? 7 + R() * 8 : 13 + R() * 13,
          t: type,
          rot: R() * 6.28,
          v: (R() * 3) | 0
        });
        count++;
        if (count > 6000) return;
      }
    }
  }

  /* ---------------- rivers & lakes geometry ---------------- */
  var rivers = [
    { w: 9, pts: smoothPath([[1615, 700], [1590, 760], [1575, 830], [1552, 900], [1500, 960], [1465, 1000]], 8) },
    { w: 11, pts: smoothPath([[1465, 1010], [1560, 1060], [1680, 1105], [1810, 1150], [1960, 1200], [2120, 1245], [2280, 1280], [2350, 1300]], 10) },
    { w: 7, pts: smoothPath([[2150, 640], [2090, 720], [2030, 810], [1980, 900], [1920, 990], [1860, 1060], [1810, 1150]], 8) },
    { w: 8, pts: smoothPath([[2050, 420], [2100, 350], [2140, 270], [2160, 200]], 8) },
    { w: 6, pts: smoothPath([[1620, 699], [1640, 640], [1660, 600]], 6) }
  ];

  /* ---------------- build pipeline ---------------- */
  BS.build = function (onStep, done) {
    var steps = [
      ['ساخت میدان ارتفاع جزیره…', function () { buildFields(); }],
      ['استخراج خط ساحلی…', function () {
        BS.contours = {
          coast: contour(maskArr, 0.0),
          shallow: contour(maskArr, -0.035),
          shore: contour(maskArr, 0.055),
          lake: contour(lakeArr, 0.06),
          elev1: contour(elevArr, 0.22),
          elev2: contour(elevArr, 0.40),
          elev3: contour(elevArr, 0.60),
          elev4: contour(elevArr, 0.74),
          elev5: contour(elevArr, 0.86)
        };
      }],
      ['طراحی شبکه‌ی راه‌ها…', function () {
        var i;
        for (i = 0; i < ROAD_DEFS.length; i++) addRoad(ROAD_DEFS[i]);
      }],
      ['بافت شهری و ساختمان‌ها…', function () {
        buildStructures(mulberry32(9931));
      }],
      ['پوشش گیاهی جزیره…', function () {
        buildVegetation(mulberry32(4471));
      }],
      ['آماده‌سازی لایه‌های نقشه…', function () {
        // every marker must stand on dry land, never float in open water
        for (var pi = 0; pi < POIS.length; pi++) {
          var pp = POIS[pi], guard = 0;
          while (BS.mask(pp.x, pp.y) < 0.02 && guard++ < 300) {
            var ang = pi * 2.399 + guard * 0.9, rad = 20 + guard * 7;
            pp.x += Math.cos(ang) * rad * 0.16;
            pp.y += Math.sin(ang) * rad * 0.16;
            if (pp.x < 70) pp.x = 70; if (pp.y < 70) pp.y = 70;
            if (pp.x > W - 70) pp.x = W - 70; if (pp.y > H - 70) pp.y = H - 70;
          }
        }
        BS.world = {
          roads: roads, rivers: rivers, buildings: buildings, props: props,
          trees: trees, wrecks: wrecks, pois: POIS, regions: REGIONS
        };
      }]
    ];
    var idx = 0;
    function next() {
      if (idx >= steps.length) { done(); return; }
      var s = steps[idx++];
      onStep(s[0], idx / steps.length);
      setTimeout(function () {
        try { s[1](); } catch (err) { console.error('build step failed:', s[0], err); }
        next();
      }, 16);
    }
    next();
  };

  BS.WORLD_W = W; BS.WORLD_H = H;
})(window.BS);
