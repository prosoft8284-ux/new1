/* BERMUDA SURVIVAL — pixel-art sprite factory */
window.PIX = (function () {
  'use strict';

  function Pix(w, h) {
    this.w = w; this.h = h;
    this.d = new Uint8Array(w * h);
    this.pal = [null];
  }
  Pix.prototype.ci = function (c) {
    var i = this.pal.indexOf(c);
    if (i < 0) { this.pal.push(c); i = this.pal.length - 1; }
    return i;
  };
  Pix.prototype.set = function (x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = this.ci(c);
  };
  Pix.prototype.rect = function (x, y, w, h, c) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c);
  };
  Pix.prototype.ellipse = function (cx, cy, rx, ry, c) {
    for (var y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (var x = Math.floor(cx - rx); x <= cx + rx; x++) {
        var nx = (x - cx) / rx, ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, c);
      }
    }
  };
  Pix.prototype.line = function (x0, y0, x1, y1, c, thick) {
    thick = thick || 1;
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy, n = 0;
    while (n++ < 500) {
      if (thick > 1) { this.rect(x0, y0, thick, thick, c); }
      else this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  };
  Pix.prototype.mirrorHalf = function () {
    // mirror the right half onto the left half (sprites face down/front)
    var w = this.w, h = this.h, hw = Math.floor(w / 2);
    for (var y = 0; y < h; y++) for (var x = 0; x < hw; x++) {
      this.d[y * w + (w - 1 - x)] = this.d[y * w + x];
    }
  };
  Pix.prototype.outline = function (c) {
    var w = this.w, h = this.h, copy = this.d.slice(), out = this.ci(c);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (copy[y * w + x]) continue;
      var n = 0;
      if (x > 0 && copy[y * w + x - 1]) n = 1;
      if (x < w - 1 && copy[y * w + x + 1]) n = 1;
      if (y > 0 && copy[(y - 1) * w + x]) n = 1;
      if (y < h - 1 && copy[(y + 1) * w + x]) n = 1;
      if (n) this.d[y * w + x] = out;
    }
  };
  Pix.prototype.canvas = function () {
    var cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(this.w, this.h);
    var d = img.data;
    for (var i = 0; i < this.d.length; i++) {
      var c = this.pal[this.d[i]];
      if (!c) continue;
      var rgb = hex(c);
      d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2];
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  };
  function hex(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function whiteOf(cv) {
    var c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    var x = c2.getContext('2d');
    x.drawImage(cv, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c2.width, c2.height);
    return c2;
  }
  function pack(cv) { return { img: cv, flash: whiteOf(cv) }; }

  /* ---------------- survivors ---------------- */
  function survivor(o) {
    var p = new Pix(26, 30);
    var cloak = o.cloak, cloakD = o.cloakD, trim = o.trim, skin = o.skin || '#c9a98a';
    var boot = '#15181f', bootHi = '#2b3140', dark = '#0b0d12';
    var cx = 13;
    var skinD = o.skin ? '#8f6f52' : '#a8876a';
    var steel = o.armor ? '#9aa6b8' : '#5a6373';

    /* ---- legs & boots ---- */
    p.rect(cx - 4, 22, 3, 5, cloakD);
    p.rect(cx + 2, 22, 3, 5, cloakD);
    p.rect(cx - 4, 22, 1, 5, '#00000033');
    p.rect(cx + 2, 22, 1, 5, '#00000033');
    p.rect(cx - 5, 27, 5, 3, boot);
    p.rect(cx + 1, 27, 5, 3, boot);
    p.rect(cx - 5, 27, 5, 1, bootHi);
    p.rect(cx + 1, 27, 5, 1, bootHi);
    p.rect(cx - 5, 29, 5, 1, '#0a0c10');
    p.rect(cx + 1, 29, 5, 1, '#0a0c10');

    /* ---- cloak skirt (under torso) ---- */
    p.ellipse(cx, 23, 8, 4, cloakD);
    p.rect(cx - 8, 20, 16, 3, cloakD);
    p.rect(cx - 8, 22, 16, 1, '#00000055');

    /* ---- torso ---- */
    p.ellipse(cx, 17, 7.5, 6.5, cloak);
    p.rect(cx - 7, 13, 14, 7, cloak);
    p.rect(cx - 7, 13, 2, 6, '#ffffff12');       // rim light
    p.rect(cx + 5, 14, 2, 6, '#00000033');       // side shade

    /* chest rig */
    if (o.armor) {
      p.rect(cx - 5, 13, 10, 7, steel);
      p.rect(cx - 5, 13, 10, 1, '#c6d1e0');
      p.rect(cx - 4, 15, 8, 1, '#5f6a7a');
      p.rect(cx - 4, 18, 8, 1, '#5f6a7a');
      p.ellipse(cx, 16.5, 2, 2, trim);
      p.rect(cx - 1, 16, 2, 1, o.glow);
    } else {
      p.rect(cx - 5, 14, 10, 6, cloakD);
      p.rect(cx - 5, 14, 10, 1, '#ffffff14');
      p.ellipse(cx, 16, 2.4, 2.6, trim);
      p.rect(cx - 1, 15, 2, 2, o.glow);
    }
    /* cross straps */
    p.line(cx - 6, 13.5, cx + 4, 20, trim, 1);
    p.line(cx + 6, 13.5, cx - 4, 20, trim, 1);

    /* belt + pouches */
    p.rect(cx - 7, 20, 14, 2, '#2b2118');
    p.rect(cx - 7, 20, 14, 1, '#4a3a28');
    p.rect(cx - 1, 20, 3, 2, o.glow);
    p.rect(cx - 6, 21, 3, 2, '#3a2f22');
    p.rect(cx + 4, 21, 3, 2, '#3a2f22');

    /* ---- arms ---- */
    p.rect(cx - 9, 14, 2.5, 8, cloakD);
    p.rect(cx + 7, 14, 2.5, 8, cloakD);
    p.rect(cx - 9, 14, 1, 7, '#ffffff10');
    p.rect(cx - 9, 21, 2.5, 2.4, skin);
    p.rect(cx + 7, 21, 2.5, 2.4, skin);
    p.rect(cx - 9, 23, 2.5, 1, skinD);
    p.rect(cx + 7, 23, 2.5, 1, skinD);

    /* shoulder pads */
    p.ellipse(cx - 7, 13.4, 2.6, 2.2, o.armor ? steel : cloak);
    p.ellipse(cx + 7, 13.4, 2.6, 2.2, o.armor ? steel : cloak);
    p.rect(cx - 8, 12, 3, 1, '#ffffff20');
    p.rect(cx + 6, 12, 3, 1, '#ffffff20');
    if (o.spikes) {
      p.line(cx - 8.5, 12, cx - 10.5, 8.5, o.glow, 1);
      p.line(cx + 8.5, 12, cx + 10.5, 8.5, o.glow, 1);
      p.rect(cx - 11, 8, 1, 1, '#ffffff');
      p.rect(cx + 10, 8, 1, 1, '#ffffff');
    }

    /* ---- backpack ---- */
    if (o.pack) {
      p.rect(cx - 10.5, 13, 3, 7, '#4a4233');
      p.rect(cx - 10.5, 13, 3, 1, '#6b5f47');
      p.rect(cx - 10.5, 16, 3, 1, '#2f2a1f');
      p.rect(cx - 7, 15, 1, 2, '#6b5f47');
    }

    /* ---- neck & head ---- */
    p.rect(cx - 2, 11, 4, 2, skinD);
    p.ellipse(cx, 8, 4.2, 4.4, skin);
    p.rect(cx - 4, 5, 2, 3, '#ffffff18');
    p.rect(cx + 2, 7.5, 2, 3, skinD);

    if (o.hood) {
      p.ellipse(cx, 7.6, 5.8, 5.8, cloakD);
      p.ellipse(cx, 8.6, 4.2, 4.2, dark);
      p.rect(cx - 4, 5.6, 8, 1.6, cloak);
      p.ellipse(cx, 3.4, 5, 2.6, cloak);
      p.rect(cx - 5, 2.6, 10, 1, '#ffffff18');
      p.rect(cx - 2.5, 8.6, 2, 1.4, o.glow);
      p.rect(cx + 0.5, 8.6, 2, 1.4, o.glow);
      p.rect(cx - 2.5, 10.4, 5, 1, '#00000066');
    } else if (o.helmet) {
      p.ellipse(cx, 7.6, 4.8, 4.6, '#31363f');
      p.ellipse(cx, 6.6, 4.2, 3.2, '#414954');
      p.rect(cx - 4, 4, 8, 1, '#5b6470');
      p.rect(cx - 4, 7.6, 8, 2.4, '#101318');
      p.rect(cx - 3.5, 8, 7, 1.4, o.glow);
      p.rect(cx - 4, 11, 8, 1, '#232830');
      p.rect(cx + 3, 3, 1, 3, '#8d97a6');
      p.rect(cx + 3, 2, 2, 1, o.glow);
    } else if (o.hair) {
      p.ellipse(cx, 6.4, 4.6, 3.4, o.hairC);
      p.rect(cx - 5, 6, 10, 1.6, o.hairC);
      p.rect(cx - 5, 7, 2, 2.4, o.hairC);
      p.rect(cx + 3, 7, 2, 2.4, o.hairC);
      p.rect(cx - 2, 3.4, 4, 1, o.hairC);
      p.rect(cx - 3, 8.4, 1.6, 1.2, '#20242c');   // eyes
      p.rect(cx + 1.6, 8.4, 1.6, 1.2, '#20242c');
      p.rect(cx - 2.4, 10.4, 5, 1, skinD);        // mouth/jaw shade
    }

    /* scar / war paint accents */
    if (o.paint) {
      p.rect(cx - 3, 7.4, 6, 1, o.paint);
      p.rect(cx - 4, 6, 1, 2, o.paint);
      p.rect(cx + 3, 6, 1, 2, o.paint);
    }

    /* scarf */
    if (o.scarf) {
      p.rect(cx - 5, 11, 10, 2, o.scarfC);
      p.rect(cx - 5, 11, 10, 1, '#ffffff30');
      p.rect(cx + 3, 12.6, 2.4, 5, o.scarfC);
      p.rect(cx + 5, 12.6, 1.6, 4, o.scarfD || o.scarfC);
    }

    p.outline('#0a0d12');
    return pack(p.canvas());
  }

  var SURVIVORS = {
    wanderer: survivor({ cloak: '#3b2a5c', cloakD: '#241736', trim: '#6b4aa8', glow: '#c69bff', hood: true }),
    warrior: survivor({ cloak: '#5d1f27', cloakD: '#3a1118', trim: '#a8323f', glow: '#ff5b6e', helmet: true, armor: true, spikes: true }),
    mutant: survivor({ cloak: '#2f6b3c', cloakD: '#1d4527', trim: '#6fdc7a', glow: '#a8ff9c', hair: true, hairC: '#dff3e0', skin: '#a9d493', paint: '#2b5a33' }),
    tech: survivor({ cloak: '#1f3348', cloakD: '#12202f', trim: '#3f7fa8', glow: '#64e0ff', hair: true, hairC: '#1c1f26' }),
    ronin: survivor({ cloak: '#3a1c2a', cloakD: '#22101a', trim: '#b8484f', glow: '#ffd479', hair: true, hairC: '#f2f2f2', scarf: true, scarfC: '#c02b3a', scarfD: '#8c1f2b' }),
    drifter: survivor({ cloak: '#4a3a26', cloakD: '#2d2317', trim: '#8a6d3f', glow: '#ffd479', hair: true, hairC: '#4a3524', skin: '#b98c68', pack: true })
  };

  /* ---------------- alien bestiary ---------------- */
  function alienRunner() {
    var p = new Pix(22, 20), car = '#6a3f9e', carD = '#40245f', glow = '#d79bff';
    // four legs
    p.rect(5, 14, 2, 5, carD); p.rect(8, 15, 2, 4, carD);
    p.rect(13, 15, 2, 4, carD); p.rect(16, 14, 2, 5, carD);
    // low body
    p.ellipse(11, 12, 7.5, 4.2, car);
    p.ellipse(11, 13.4, 6, 2.4, carD);
    // back spikes
    p.line(7, 9, 5, 4, glow); p.line(11, 8, 11, 3, glow); p.line(15, 9, 17, 4, glow);
    // head
    p.ellipse(17, 11, 3.4, 3, car);
    p.rect(18, 10, 1.8, 1.4, '#ff5b6e');
    p.rect(15, 10, 1.4, 1.2, glow);
    p.outline('#150e22');
    return pack(p.canvas());
  }

  function alienWarrior() {
    var p = new Pix(24, 24), plate = '#4b2a6d', plateD = '#2b1740', skin = '#7a4aa8', glow = '#ff3d68';
    p.rect(7, 18, 4, 5, plateD); p.rect(13, 18, 4, 5, plateD);
    // torso
    p.ellipse(12, 14, 7, 5.4, plate);
    p.ellipse(12, 12, 6, 3.2, skin);
    // spiked shoulders
    p.ellipse(4.5, 11, 3.4, 3.4, plate); p.ellipse(19.5, 11, 3.4, 3.4, plate);
    p.line(2, 9, 0.5, 4, glow); p.line(22, 9, 23.5, 4, glow);
    // arms + claws
    p.rect(2, 13, 3, 6, plateD); p.rect(19, 13, 3, 6, plateD);
    p.line(3, 19, 1, 22, '#e8d8ff'); p.line(21, 19, 23, 22, '#e8d8ff');
    // head with visor
    p.ellipse(12, 6.4, 4.2, 3.8, plate);
    p.rect(8.6, 5.4, 7, 2.2, '#150a20');
    p.rect(9.4, 6, 2, 1.2, glow); p.rect(12.6, 6, 2, 1.2, glow);
    // chest core
    p.ellipse(12, 13.4, 2, 2, glow);
    p.outline('#150e22');
    return pack(p.canvas());
  }

  function alienNeural() {
    var p = new Pix(24, 24), dome = '#7b3fbf', domeL = '#c48bff', core = '#ff8af0';
    p.ellipse(12, 9, 8, 7, dome);
    p.ellipse(10, 6.4, 5, 4, domeL);
    p.ellipse(12, 9, 3.2, 3.2, core);
    p.ellipse(12, 9, 1.6, 1.6, '#ffffff');
    // tentacles
    var xs = [5, 8, 11, 14, 17, 19];
    for (var i = 0; i < xs.length; i++) {
      var x = xs[i];
      p.line(x, 14, x + (i % 2 ? 2 : -2), 21, domeL);
      p.line(x + (i % 2 ? 2 : -2), 21, x + (i % 2 ? 4 : -3), 23, dome);
    }
    p.outline('#150e22');
    return pack(p.canvas());
  }

  function alienWinged() {
    var p = new Pix(26, 22), wing = '#5a2b7a', wingD = '#361a4c', body = '#3a1f52', glow = '#ff5b6e';
    // wings
    p.line(11, 9, 1, 3, wingD, 2); p.line(11, 10, 0.5, 14, wingD, 2);
    p.line(15, 9, 25, 3, wingD, 2); p.line(15, 10, 25.5, 14, wingD, 2);
    p.ellipse(6, 7, 4.6, 2.4, wing); p.ellipse(20, 7, 4.6, 2.4, wing);
    p.ellipse(6, 13, 4.4, 2, wing); p.ellipse(20, 13, 4.4, 2, wing);
    // body
    p.ellipse(13, 11, 3.4, 5.4, body);
    p.ellipse(13, 7.4, 3, 2.8, '#2a1438');
    p.rect(11.4, 7, 1.6, 1.4, glow); p.rect(14, 7, 1.6, 1.4, glow);
    p.line(13, 16, 13, 20, wingD);
    p.outline('#150e22');
    return pack(p.canvas());
  }

  function alienParasite() {
    var p = new Pix(18, 18), shell = '#3a1d4d', shellD = '#241031', core = '#ff2f5a';
    p.ellipse(9, 9, 6, 6, shell);
    p.ellipse(7, 7, 3, 2.6, '#54306b');
    p.ellipse(9, 9.4, 2.6, 2.6, core);
    p.ellipse(9, 9.4, 1.1, 1.1, '#ffd0d8');
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * Math.PI * 2;
      p.line(9 + Math.cos(a) * 4, 9 + Math.sin(a) * 4, 9 + Math.cos(a) * 8, 9 + Math.sin(a) * 8, shellD);
    }
    p.outline('#150e22');
    return pack(p.canvas());
  }

  function alienWarlock() {
    var p = new Pix(24, 26), robe = '#3c2060', robeD = '#241238', skin = '#8b5cc0', orb = '#d39bff';
    // robe
    p.ellipse(12, 20, 8, 6.4, robe);
    p.rect(5, 15, 14, 7, robe);
    p.ellipse(12, 15.4, 5.5, 3, robeD);
    // arms
    p.line(6, 15, 3, 11, robeD); p.line(18, 15, 21, 11, robeD);
    p.ellipse(2.6, 9.6, 2.2, 2.2, orb);
    p.ellipse(21.4, 9.6, 2.2, 2.2, orb);
    // head
    p.ellipse(12, 8, 3.6, 3.8, skin);
    p.rect(10.2, 7.4, 1.4, 1.2, '#ffe9a8'); p.rect(12.8, 7.4, 1.4, 1.2, '#ffe9a8');
    p.line(12, 11, 12, 14, robeD);
    p.outline('#150e22');
    return pack(p.canvas());
  }

  function alienMutant() {
    var p = new Pix(26, 24), flesh = '#4e7a3f', fleshD = '#2f4c28', glow = '#8bff6a';
    p.rect(6, 18, 5, 5, fleshD); p.rect(15, 18, 5, 5, fleshD);
    p.ellipse(13, 14, 9, 6, flesh);
    p.ellipse(13, 18, 7, 3, fleshD);
    // glowing pods on the back
    p.ellipse(6, 9.6, 3.2, 3, glow); p.ellipse(12, 7.6, 3.4, 3.2, glow); p.ellipse(18, 9.6, 3.2, 3, glow);
    p.ellipse(6, 9.2, 1.4, 1.3, '#d8ffc0'); p.ellipse(12, 7.2, 1.5, 1.4, '#d8ffc0'); p.ellipse(18, 9.2, 1.4, 1.3, '#d8ffc0');
    // head low & heavy
    p.ellipse(13, 10, 4.4, 3.4, flesh);
    p.rect(10.4, 9.4, 2, 1.6, '#ff5b6e'); p.rect(14, 9.4, 2, 1.6, '#ff5b6e');
    p.rect(11.6, 12.4, 3, 1.2, '#1c2a18');
    // arms
    p.line(4, 12, 1, 17, fleshD, 2); p.line(22, 12, 25, 17, fleshD, 2);
    p.outline('#101a0e');
    return pack(p.canvas());
  }

  function alienMother() {
    var p = new Pix(42, 40), car = '#4b2a6d', carD = '#2a1440', glow = '#ff2f5a', limb = '#3a1e56';
    // legs
    for (var i = 0; i < 6; i++) {
      var side = i < 3 ? -1 : 1, k = i % 3;
      p.line(21 + side * 8, 24 + k * 3, 21 + side * (16 + k * 2), 34 + k * 2, limb, 2);
    }
    // carapace
    p.ellipse(21, 22, 17, 13, car);
    p.ellipse(21, 25, 14, 9, carD);
    p.ellipse(21, 13, 10, 8, car);
    // glowing sacs
    p.ellipse(13, 17, 4.4, 4, glow); p.ellipse(29, 17, 4.4, 4, glow);
    p.ellipse(21, 20, 5.4, 4.6, '#ff6b8a');
    p.ellipse(21, 19, 2.2, 2, '#ffe0e6');
    // head / maw
    p.ellipse(21, 9, 7, 5.4, car);
    p.ellipse(21, 10.4, 4, 2.6, '#1a0a24');
    p.rect(16.6, 7.4, 2.4, 2, glow); p.rect(23, 7.4, 2.4, 2, glow);
    // horns
    p.line(13, 6, 8, 1, '#c88bff'); p.line(29, 6, 34, 1, '#c88bff');
    p.outline('#150e22');
    return pack(p.canvas());
  }

  function alienSkitter() {
    var p = new Pix(16, 14), car = '#7a3fb4', carD = '#4a2472', eye = '#ff5b6e';
    // six thin legs
    for (var i = 0; i < 3; i++) {
      p.line(4 + i * 4, 9, 2 + i * 5, 13, carD);
      p.line(5 + i * 4, 9, 7 + i * 4, 13, carD);
    }
    p.ellipse(8, 8, 6, 3.4, car);
    p.ellipse(8, 9, 4.6, 1.8, carD);
    p.ellipse(13, 7, 2.6, 2.4, car);
    p.rect(12.4, 6.2, 1.6, 1.4, eye);
    p.line(5, 6, 3, 3, '#d79bff'); p.line(8, 5, 8, 2, '#d79bff');
    p.outline('#150e22');
    return pack(p.canvas());
  }

  function alienBrute() {
    var p = new Pix(32, 30), plate = '#5a2f83', plateD = '#22122f', skin = '#8a52bd', horn = '#e2b6ff', core = '#ff3d68';
    // legs
    p.rect(7, 22, 6, 7, plateD); p.rect(19, 22, 6, 7, plateD);
    p.rect(9, 26, 8, 4, '#150c1f'); p.rect(17, 26, 8, 4, '#150c1f');
    // heavy torso
    p.ellipse(16, 17, 10, 8, plate);
    p.ellipse(16, 14, 8, 4.4, skin);
    // back plates
    p.ellipse(16, 10, 8, 4, plate);
    p.line(9, 8, 6, 1, horn, 2); p.line(23, 8, 26, 1, horn, 2);
    // giant fists
    p.ellipse(4, 18, 4.4, 5, plateD); p.ellipse(28, 18, 4.4, 5, plateD);
    p.rect(1, 20, 5, 3, skin); p.rect(26, 20, 5, 3, skin);
    // head sunk between shoulders
    p.ellipse(16, 7.6, 4.6, 3.6, plate);
    p.rect(13, 7, 6, 2, '#12081c');
    p.rect(13.6, 7.4, 1.8, 1.2, core); p.rect(16.6, 7.4, 1.8, 1.2, core);
    // chest core
    p.ellipse(16, 18, 2.6, 2.6, core);
    p.ellipse(16, 18, 1.2, 1.2, '#ffe0e6');
    p.outline('#150e22');
    return pack(p.canvas());
  }

  function alienBomber() {
    var p = new Pix(22, 22), sack = '#6b3a1f', sackL = '#a3653a', glow = '#ffb03a', limb = '#3d2213';
    // little legs
    p.rect(5, 17, 3, 4, limb); p.rect(10, 18, 3, 3, limb); p.rect(14, 17, 3, 4, limb);
    // bloated body
    p.ellipse(11, 11, 8.4, 7.4, sack);
    p.ellipse(9, 8.4, 5, 4, sackL);
    // glowing sacs
    p.ellipse(6.4, 12.4, 2.6, 2.6, glow);
    p.ellipse(15.4, 12.4, 2.6, 2.6, glow);
    p.ellipse(11, 14, 3.4, 3, '#ff8a2b');
    p.ellipse(11, 14, 1.4, 1.2, '#fff0c0');
    // tiny head + eyes
    p.ellipse(11, 5.4, 3.2, 2.6, sack);
    p.rect(9.2, 5, 1.2, 1.2, '#ffe9a8'); p.rect(11.6, 5, 1.2, 1.2, '#ffe9a8');
    p.outline('#150e22');
    return pack(p.canvas());
  }

  var ALIENS = {
    runner: { spr: alienRunner(), hp: 34, speed: 78, dmg: 8, r: 13, name: 'خاردار رانده', color: '#b487ff' },
    warrior: { spr: alienWarrior(), hp: 120, speed: 44, dmg: 18, r: 16, name: 'جنگجوی زره‌پوش', color: '#ff5b6e' },
    neural: { spr: alienNeural(), hp: 52, speed: 30, dmg: 12, r: 14, name: 'عصب‌زن', color: '#ff8af0', ranged: true },
    winged: { spr: alienWinged(), hp: 40, speed: 92, dmg: 10, r: 14, name: 'بال‌زن', color: '#c48bff', flying: true },
    parasite: { spr: alienParasite(), hp: 26, speed: 60, dmg: 6, r: 11, name: 'انگل‌تن', color: '#ff2f5a' },
    warlock: { spr: alienWarlock(), hp: 86, speed: 34, dmg: 16, r: 15, name: 'جادوگر بیگانه', color: '#d39bff', ranged: true },
    mutant: { spr: alienMutant(), hp: 170, speed: 38, dmg: 22, r: 18, name: 'جهش‌یافته', color: '#8bff6a' },
    skitter: { spr: alienSkitter(), hp: 16, speed: 134, dmg: 5, r: 9, name: 'خزنده‌ی ریز', color: '#b487ff', pack: 3 },
    brute: { spr: alienBrute(), hp: 250, speed: 34, dmg: 26, r: 20, name: 'گرزبان سنگین', color: '#ff5b6e', charger: true },
    bomber: { spr: alienBomber(), hp: 44, speed: 56, dmg: 26, r: 13, name: 'کیسه‌ی انفجاری', color: '#ffb03a', suicide: true },
    mother: { spr: alienMother(), hp: 900, speed: 22, dmg: 30, r: 30, name: 'موجود مادر', color: '#ff6b8a', boss: true }
  };

  return { Pix: Pix, SURVIVORS: SURVIVORS, ALIENS: ALIENS, whiteOf: whiteOf, pack: pack, hex: hex };
})();
