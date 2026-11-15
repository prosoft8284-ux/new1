/* ============================================================
   BERMUDA SURVIVAL — APP
   Camera, input (pan / pinch / wheel / tap), HUD, render loop.
   ============================================================ */
(function (BS) {
  'use strict';

  var map = document.getElementById('map');
  var fx = document.getElementById('fx');
  var ctx = map.getContext('2d', { alpha: false });
  var fxc = fx.getContext('2d');

  var vw = 0, vh = 0, dpr = 1;
  var cam = { x: BS.W * 0.5, y: BS.H * 0.47, z: 0.4, w: 0, h: 0 };
  var minZoom = 0.05, maxZoom = 1.7;
  var dirty = true;
  var opts = { markers: true, labels: true, grid: false, fast: false };
  var selected = null;
  var waypoint = null;
  var markersOnScreen = [];
  var ready = false;

  var clamp = BS.util.clamp;

  /* ---------------- sizing ---------------- */
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    vw = window.innerWidth;
    vh = window.innerHeight;
    map.width = Math.round(vw * dpr);
    map.height = Math.round(vh * dpr);
    fx.width = Math.round(vw * dpr);
    fx.height = Math.round(vh * dpr);
    cam.w = vw; cam.h = vh;
    minZoom = Math.min(vw / BS.W, vh / BS.H) * 0.94;
    maxZoom = 1.7;
    if (cam.z < minZoom) cam.z = minZoom;
    clampCam();
    dirty = true;
  }

  // remember where the player was looking on the island map
  var camSaved = null;
  function restoreCam() {
    if (!window.SAVE) return;
    var c = SAVE.get('cam', null);
    if (!c) return;
    cam.x = Number(c.x) || cam.x;
    cam.y = Number(c.y) || cam.y;
    cam.z = Number(c.z) || cam.z;
    camSaved = { x: cam.x, y: cam.y, z: cam.z };
    clampCam();
  }
  function persistCam() {
    if (!window.SAVE) return;
    var c = { x: Math.round(cam.x), y: Math.round(cam.y), z: Math.round(cam.z * 100) / 100 };
    if (camSaved && camSaved.x === c.x && camSaved.y === c.y && camSaved.z === c.z) return;
    camSaved = c;
    SAVE.set('cam', c);
  }
  setInterval(persistCam, 2500);
  window.addEventListener('pagehide', persistCam);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 250); });

  function clampCam() {
    var halfW = vw / (2 * cam.z), halfH = vh / (2 * cam.z);
    if (halfW * 2 >= BS.W) cam.x = BS.W / 2;
    else cam.x = clamp(cam.x, halfW, BS.W - halfW);
    if (halfH * 2 >= BS.H) cam.y = BS.H / 2;
    else cam.y = clamp(cam.y, halfH, BS.H - halfH);
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - vw / 2) / cam.z + cam.x,
      y: (sy - vh / 2) / cam.z + cam.y
    };
  }
  function worldToScreen(wx, wy) {
    return {
      x: (wx - cam.x) * cam.z + vw / 2,
      y: (wy - cam.y) * cam.z + vh / 2
    };
  }

  function zoomAt(sx, sy, factor) {
    var before = screenToWorld(sx, sy);
    cam.z = clamp(cam.z * factor, minZoom, maxZoom);
    cam.x = before.x - (sx - vw / 2) / cam.z;
    cam.y = before.y - (sy - vh / 2) / cam.z;
    clampCam();
    dirty = true;
  }

  /* ---------------- input ---------------- */
  var pointers = new Map();
  var dragging = false, moved = 0, lastMid = null, lastDist = 0, downPos = null;

  function ptCount() { return pointers.size; }
  function midOf() {
    var arr = [];
    pointers.forEach(function (p) { arr.push(p); });
    return { x: (arr[0].x + arr[1].x) / 2, y: (arr[0].y + arr[1].y) / 2 };
  }
  function distOf() {
    var arr = [];
    pointers.forEach(function (p) { arr.push(p); });
    return Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
  }

  map.addEventListener('pointerdown', function (e) {
    map.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptCount() === 1) {
      dragging = true; moved = 0;
      downPos = { x: e.clientX, y: e.clientY };
      opts.fast = true;
    } else if (ptCount() === 2) {
      lastDist = distOf(); lastMid = midOf();
    }
  });

  map.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) {
      // hover feedback
      return;
    }
    var prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (ptCount() === 1 && dragging) {
      var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      cam.x -= dx / cam.z;
      cam.y -= dy / cam.z;
      clampCam();
      dirty = true;
    } else if (ptCount() >= 2) {
      var d = distOf(), mid = midOf();
      if (lastDist > 0 && d > 0) {
        var before = screenToWorld(mid.x, mid.y);
        cam.z = clamp(cam.z * (d / lastDist), minZoom, maxZoom);
        cam.x = before.x - (mid.x - vw / 2) / cam.z;
        cam.y = before.y - (mid.y - vh / 2) / cam.z;
        clampCam();
      }
      if (lastMid && d > 0 && Math.abs(d - lastDist) < 2) {
        cam.x -= (mid.x - lastMid.x) / cam.z;
        cam.y -= (mid.y - lastMid.y) / cam.z;
        clampCam();
      }
      lastDist = d; lastMid = mid;
      moved += 6;
      dirty = true;
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (ptCount() === 0) {
      dragging = false;
      opts.fast = false;
      if (moved < 9 && downPos) handleTap(downPos.x, downPos.y);
      dirty = true;
      lastMid = null; lastDist = 0;
    } else if (ptCount() === 1) {
      lastMid = null; lastDist = 0;
    }
  }
  map.addEventListener('pointerup', endPointer);
  map.addEventListener('pointercancel', endPointer);
  map.addEventListener('pointerleave', function (e) {
    if (ptCount() === 1 && !dragging) endPointer(e);
  });

  map.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.14 : 0.88);
  }, { passive: false });

  // double tap to zoom
  var lastTap = 0, lastTapPos = null;
  function handleTap(sx, sy) {
    var now = Date.now();
    var hit = null;
    for (var i = 0; i < markersOnScreen.length; i++) {
      var m = markersOnScreen[i];
      if (Math.hypot(m.x - sx, m.y - sy) < 20) { hit = m; break; }
    }
    if (hit) { selectPoi(hit.poi); return; }

    if (now - lastTap < 320 && lastTapPos && Math.hypot(sx - lastTapPos.x, sy - lastTapPos.y) < 30) {
      zoomAt(sx, sy, 1.9);
      lastTap = 0;
      return;
    }
    lastTap = now; lastTapPos = { x: sx, y: sy };
    closeCard();
  }

  /* ---------------- POI card ---------------- */
  var card = document.getElementById('card');
  var cardIcon = document.getElementById('cardIcon');
  var cardTitle = document.getElementById('cardTitle');
  var cardSub = document.getElementById('cardSub');
  var cardDesc = document.getElementById('cardDesc');
  var cardRows = document.getElementById('cardRows');
  var cardRisk = document.getElementById('cardRisk');

  var DANGER_TXT = ['', 'امن', 'کم‌خطر', 'متوسط', 'پرخطر', 'مرگبار'];

  function selectPoi(poi) {
    selected = poi;
    var def = BS.ICONS[poi.type] || BS.ICONS.region;
    cardIcon.innerHTML = svgIcon(poi.type);
    cardTitle.textContent = poi.name;
    cardSub.textContent = poi.sub || '';
    cardDesc.textContent = poi.desc || '';
    cardRows.innerHTML = (poi.tags || []).map(function (t, i) {
      return '<span class="chip' + (i === 0 && poi.danger >= 4 ? ' warn' : '') + '">' + t + '</span>';
    }).join('');
    var d = poi.danger || 1;
    var pct = Math.round(d / 5 * 100);
    cardRisk.innerHTML = 'سطح خطر: <b style="color:' + (d >= 4 ? '#ff7b8b' : d >= 3 ? '#ffd479' : '#8ce6b4') + '">' + DANGER_TXT[d] + ' ' + pct + '%</b>';
    var enter = document.getElementById('cardEnter');
    if (!enter) {
      enter = document.createElement('a');
      enter.id = 'cardEnter';
      enter.className = 'go';
      enter.style.cssText = 'display:block;margin-top:10px;text-align:center;text-decoration:none';
      card.appendChild(enter);
    }
    enter.textContent = 'ورود به این منطقه';
    enter.href = 'preview.html?poi=' + encodeURIComponent(poi.id || '') +
      '&type=' + encodeURIComponent(poi.type || '') +
      '&name=' + encodeURIComponent(poi.name || '');
    card.classList.remove('hidden');
    dirty = true;
  }
  function closeCard() {
    selected = null;
    card.classList.add('hidden');
    dirty = true;
  }
  document.getElementById('cardX').addEventListener('click', closeCard);
  document.getElementById('cardGo').addEventListener('click', function () {
    if (!selected) return;
    waypoint = selected;
    cam.x = selected.x; cam.y = selected.y;
    if (cam.z < 0.55) cam.z = 0.62;
    clampCam(); dirty = true;
    toast('مسیر به «' + selected.name + '» فعال شد');
  });

  function svgIcon(type) {
    var d = BS.ICONS[type] || BS.ICONS.region;
    var stroke = d.m === 'stroke' ? 'fill="none" stroke="' + d.c + '" stroke-width="2"' : 'fill="' + d.c + '"';
    return '<svg viewBox="0 0 24 24"><path d="' + d.d + '" ' + stroke + '/></svg>';
  }

  /* ---------------- toast ---------------- */
  var toastEl = document.getElementById('toast'), toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }

  /* ---------------- legend ---------------- */
  var LEGEND = [
    ['player', 'شخصیت بازیکن', 'موقعیت فعلی'],
    ['main', 'مأموریت اصلی', 'نجات زمین'],
    ['side', 'مأموریت فرعی', 'داستان‌های جزیره'],
    ['safehouse', 'پناهگاه امن', 'ذخیره و استراحت'],
    ['shop', 'فروشگاه', 'منابع و مهمات'],
    ['workbench', 'میز کار', 'ساخت و ارتقا'],
    ['vehicle', 'خودرو / قایق', 'حمل‌ونقل'],
    ['radio', 'برج رادیو', 'باز کردن نقشه'],
    ['alien', 'تأسیسات فضایی', 'هسته و پایگاه'],
    ['locked', 'منطقه‌ی قفل‌شده', 'نیازمند دسترسی'],
    ['danger', 'منطقه‌ی خطر', 'خطر بالا']
  ];
  function buildLegend() {
    var box = document.getElementById('legendBody');
    box.innerHTML = LEGEND.map(function (it, i) {
      var sep = i === 4 || i === 8 ? '<div class="lg-sep"></div>' : '';
      return sep + '<div class="lg-item"><div class="lg-ico">' + svgIcon(it[0]) +
        '</div><div class="lg-txt">' + it[1] + '<small>' + it[2] + '</small></div></div>';
    }).join('');
  }
  document.getElementById('legendToggle').addEventListener('click', function () {
    document.getElementById('legend').classList.toggle('collapsed');
  });

  /* ---------------- toggles ---------------- */
  Array.prototype.forEach.call(document.querySelectorAll('.tg'), function (btn) {
    btn.addEventListener('click', function () {
      var k = btn.getAttribute('data-tg');
      opts[k] = !opts[k];
      btn.classList.toggle('on', opts[k]);
      dirty = true;
    });
  });

  document.getElementById('zin').addEventListener('click', function () { zoomAt(vw / 2, vh / 2, 1.35); });
  document.getElementById('zout').addEventListener('click', function () { zoomAt(vw / 2, vh / 2, 0.74); });
  document.getElementById('zfit').addEventListener('click', function () {
    cam.z = minZoom * 1.06;
    cam.x = BS.W * 0.5; cam.y = BS.H * 0.47;
    clampCam(); dirty = true;
  });

  /* ---------------- render ---------------- */
  function renderWorld() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04203a';
    ctx.fillRect(0, 0, vw, vh);

    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z,
      dpr * (vw / 2 - cam.x * cam.z),
      dpr * (vh / 2 - cam.y * cam.z));
    BS.Painter.drawWorld(ctx, cam, opts);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    BS.Painter.resetLabels();

    markersOnScreen.length = 0;

    // POI markers
    var pois = BS.world.pois;
    if (opts.markers) {
      for (var i = 0; i < pois.length; i++) {
        var p = pois[i];
        var s = worldToScreen(p.x, p.y);
        if (s.x < -60 || s.y < -60 || s.x > vw + 60 || s.y > vh + 60) continue;
        var major = p.type !== 'shop' && p.type !== 'workbench' && p.type !== 'vehicle' && p.type !== 'radio';
        if (!major && cam.z < 0.26) continue;
        BS.Painter.drawMarker(ctx, p, s.x, s.y, selected === p);
        markersOnScreen.push({ x: s.x, y: s.y, poi: p });
        if (opts.labels && (cam.z > (major ? 0.44 : 0.64))) {
          BS.Painter.drawMarkerLabel(ctx, p.name, s.x, s.y, cam.z);
        }
      }
    }

    // region names
    if (opts.labels) {
      var regs = BS.world.regions;
      for (var r = 0; r < regs.length; r++) {
        var g = regs[r];
        var sp = worldToScreen(g.x, g.y);
        if (sp.x < -100 || sp.y < -40 || sp.x > vw + 100 || sp.y > vh + 40) continue;
        BS.Painter.drawRegionLabel(ctx, g, sp.x, sp.y, cam.z, g.cls === 'sea' ? 0.75 : 0.95);
      }
    }

    // waypoint line
    if (waypoint) {
      var wp = worldToScreen(waypoint.x, waypoint.y);
      var cx = vw / 2, cy = vh / 2;
      ctx.save();
      ctx.setLineDash([9, 9]);
      ctx.lineDashOffset = -(Date.now() / 34) % 18;
      ctx.strokeStyle = 'rgba(255,209,102,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(wp.x, wp.y);
      ctx.stroke();
      ctx.restore();
    }

    // vignette + edge fade
    BS.Painter.fadeEdges(ctx, cam, vw, vh);

    // coordinate readout
    updateScale();
  }

  function updateScale() {
    var km = (vw * 0.22) * BS.METERS_PER_UNIT / cam.z / 1000;
    var nice = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 3, 5];
    var p = nice[0];
    for (var i = 0; i < nice.length; i++) if (nice[i] <= km) p = nice[i];
    var px = p * 1000 * cam.z / BS.METERS_PER_UNIT;
    var bar = document.querySelector('.scale-bar i');
    bar.style.width = px.toFixed(0) + 'px';
    document.getElementById('scaleTxt').textContent =
      (p < 1 ? (p * 1000).toFixed(0) + ' متر' : p + ' کیلومتر');
  }

  var lastMouse = { x: 0, y: 0 };
  document.getElementById('map').addEventListener('pointermove', function (e) {
    lastMouse.x = e.clientX; lastMouse.y = e.clientY;
    var w = screenToWorld(e.clientX, e.clientY);
    document.getElementById('coords').textContent =
      'X ' + Math.round(w.x * BS.METERS_PER_UNIT) + 'm   Y ' + Math.round(w.y * BS.METERS_PER_UNIT) + 'm   Z ' + cam.z.toFixed(2) + '×';
  });

  /* ---------------- fx overlay ---------------- */
  function drawFx() {
    fxc.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxc.clearRect(0, 0, vw, vh);
    if (!ready || !opts.markers) return;
    var t = Date.now() / 1000;
    var pulseTargets = [];
    if (selected) pulseTargets.push(selected);
    var main = BS.world.pois.filter(function (p) { return p.mission === 'main'; })[0];
    if (main && main !== selected) pulseTargets.push(main);
    for (var i = 0; i < pulseTargets.length; i++) {
      var p = pulseTargets[i], s = worldToScreen(p.x, p.y);
      if (s.x < -80 || s.y < -80 || s.x > vw + 80 || s.y > vh + 80) continue;
      for (var k = 0; k < 2; k++) {
        var ph = (t * 0.55 + k * 0.5 + i * 0.2) % 1;
        var r = 13 + ph * 34;
        fxc.beginPath();
        fxc.arc(s.x, s.y, r, 0, 6.2832);
        fxc.strokeStyle = (p.type === 'alien' ? 'rgba(200,139,255,' : 'rgba(255,209,102,') + (0.42 * (1 - ph)) + ')';
        fxc.lineWidth = 2;
        fxc.stroke();
      }
    }
  }

  function loop() {
    if (dirty) { renderWorld(); dirty = false; }
    drawFx();
    requestAnimationFrame(loop);
  }

  /* ---------------- boot ---------------- */
  var loadFill = document.getElementById('loadFill');
  var loadTxt = document.getElementById('loadTxt');

  function setLoad(txt, p) {
    loadTxt.textContent = txt;
    loadFill.style.width = Math.max(4, Math.min(100, p * 100)) + '%';
  }

  function boot() {
    resize();
    buildLegend();
    BS.Painter.buildSprites();
    BS.build(function (txt, p) { setLoad(txt, p * 0.82); }, function () {
      setLoad('پخت لایه‌های نقشه…', 0.88);
      setTimeout(function () {
        BS.buildBase();
        setLoad('آماده‌سازی رابط…', 0.99);
        setTimeout(function () {
          ready = true;
          restoreCam();
          cam.x = BS.W * 0.5; cam.y = BS.H * 0.47;
          cam.z = minZoom * 1.01;
          // deep-link into the map: ?x=2294&y=1010&z=1.1
          var q = new URLSearchParams(location.search);
          if (q.get('x')) cam.x = parseFloat(q.get('x'));
          if (q.get('y')) cam.y = parseFloat(q.get('y'));
          if (q.get('z')) cam.z = parseFloat(q.get('z'));
          cam.z = clamp(cam.z, minZoom, maxZoom);
          clampCam();
          dirty = true;
          setLoad('آماده', 1);
          var ld = document.getElementById('loading');
          ld.classList.add('done');
          setTimeout(function () { ld.style.display = 'none'; }, 800);
          toast('برای حرکت بکشید · برای بزرگ‌نمایی دوبار ضربه بزنید');
          setTimeout(function () { toastEl.classList.remove('show'); }, 3600);
          loop();
        }, 60);
      }, 40);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.BS);
