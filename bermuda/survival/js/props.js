/* BERMUDA SURVIVAL — scenery drawing (pixel friendly shapes) */
window.PROPS = (function () {
  'use strict';
  function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); }

  function palmBase(c, p, t) {
    var s = p.s, x = p.x, y = p.y;
    var sway = Math.sin(t * 0.0016 + x) * 2.4 * s;
    c.globalAlpha = 0.22; c.fillStyle = '#08180c';
    c.beginPath(); c.ellipse(x + 6 * s, y + 2, 20 * s, 6 * s, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = '#6b4d2c'; c.lineWidth = 4.5 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + p.lean * 18 * s, y - 28 * s, x + p.lean * 26 * s + sway, y - 52 * s); c.stroke();
    c.strokeStyle = 'rgba(150,112,66,.7)'; c.lineWidth = 1.6 * s; c.stroke();
  }

  // the fronds live on their own layer so the player can walk beneath them
  function palmCrown(c, p, t) {
    var s = p.s, x = p.x, y = p.y;
    var sway = Math.sin(t * 0.0016 + x) * 2.4 * s;
    var tx = x + p.lean * 26 * s + sway, ty = y - 52 * s;
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * 6.2832 + 0.4;
      var len = 22 * s + (i % 2) * 6 * s;
      c.strokeStyle = i % 2 ? '#2f6b34' : '#3f8a41';
      c.lineWidth = 3.4 * s;
      c.beginPath(); c.moveTo(tx, ty);
      c.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - 5,
        tx + Math.cos(a) * len, ty + Math.sin(a) * len * 0.8);
      c.stroke();
    }
    circ(c, tx, ty, 3 * s, '#28522b');
  }

  function palm(c, p, t) { palmBase(c, p, t); palmCrown(c, p, t); }

  function treeBase(c, p) {
    var s = p.s, x = p.x, y = p.y;
    c.globalAlpha = 0.25; c.fillStyle = '#06130a';
    c.beginPath(); c.ellipse(x + 5 * s, y + 3, 26 * s, 9 * s, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = '#3b2a1c'; c.fillRect(x - 4 * s, y - 20 * s, 8 * s, 22 * s);
    c.fillStyle = '#4d3826'; c.fillRect(x - 4 * s, y - 20 * s, 3 * s, 22 * s);
  }

  function treeCrown(c, p, t) {
    var s = p.s, x = p.x, y = p.y;
    var sway = Math.sin(t * 0.0012 + x * 0.1) * 1.6;
    circ(c, x + sway, y - 40 * s, 26 * s, '#1b4527');
    circ(c, x - 15 * s + sway, y - 31 * s, 19 * s, '#215430');
    circ(c, x + 16 * s + sway, y - 33 * s, 18 * s, '#194122');
    circ(c, x - 4 * s + sway, y - 50 * s, 19 * s, '#2b6b3b');
    circ(c, x + 8 * s + sway, y - 55 * s, 12 * s, '#3a8247');
    circ(c, x - 12 * s + sway, y - 46 * s, 10 * s, '#316c39');
    circ(c, x + 2 * s + sway, y - 62 * s, 7 * s, '#4a9552');
  }

  function bushBase(c, p) {
    var s = p.s;
    c.globalAlpha = 0.2; c.fillStyle = '#06130a';
    c.beginPath(); c.ellipse(p.x + 3 * s, p.y + 2, 13 * s, 5 * s, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
  }

  function bushCrown(c, p) {
    var s = p.s;
    circ(c, p.x, p.y - 6 * s, 12 * s, '#24552e');
    circ(c, p.x - 9 * s, p.y - 2 * s, 9 * s, '#1f4a26');
    circ(c, p.x + 9 * s, p.y - 3 * s, 9 * s, '#2c6034');
    circ(c, p.x - 2 * s, p.y - 11 * s, 8 * s, '#3e8043');
    circ(c, p.x + 4 * s, p.y - 8 * s, 4 * s, '#4e9a50');
  }

  function tree(c, p, t) { treeBase(c, p, t); treeCrown(c, p, t); }
  function bush(c, p) { bushBase(c, p); bushCrown(c, p); }

  function rock(c, p) {
    var s = p.s, x = p.x, y = p.y;
    c.globalAlpha = 0.25; c.fillStyle = '#06130a';
    c.beginPath(); c.ellipse(x + 4, y + 2, 13 * s, 4 * s, 0, 0, 6.2832); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = '#8c8578';
    c.beginPath();
    c.moveTo(x - 11 * s, y); c.lineTo(x - 6 * s, y - 12 * s); c.lineTo(x + 4 * s, y - 15 * s);
    c.lineTo(x + 12 * s, y - 5 * s); c.lineTo(x + 9 * s, y + 2 * s); c.closePath(); c.fill();
    c.fillStyle = '#b3ab9b';
    c.beginPath();
    c.moveTo(x - 6 * s, y - 12 * s); c.lineTo(x + 4 * s, y - 15 * s); c.lineTo(x + 1 * s, y - 8 * s);
    c.closePath(); c.fill();
    c.fillStyle = '#615b50';
    c.beginPath();
    c.moveTo(x + 4 * s, y - 15 * s); c.lineTo(x + 12 * s, y - 5 * s); c.lineTo(x + 9 * s, y + 2 * s);
    c.lineTo(x + 2 * s, y - 3 * s); c.closePath(); c.fill();
  }

  function tent(c, p) {
    var x = p.x, y = p.y;
    c.globalAlpha = 0.25; c.fillStyle = '#06130a';
    c.beginPath(); c.ellipse(x + 8, y + 2, 34, 9, 0, 0, 6.2832); c.fill(); c.globalAlpha = 1;
    c.fillStyle = '#39566b';
    c.beginPath(); c.moveTo(x - 32, y); c.lineTo(x - 6, y - 34); c.lineTo(x + 24, y); c.closePath(); c.fill();
    c.fillStyle = '#2b445a';
    c.beginPath(); c.moveTo(x - 6, y - 34); c.lineTo(x + 24, y); c.lineTo(x + 6, y); c.closePath(); c.fill();
    c.fillStyle = '#101a20';
    c.beginPath(); c.moveTo(x - 22, y); c.lineTo(x - 6, y - 20); c.lineTo(x + 6, y); c.closePath(); c.fill();
    c.strokeStyle = '#9fc4d6'; c.lineWidth = 1; c.globalAlpha = .5;
    c.beginPath(); c.moveTo(x - 6, y - 34); c.lineTo(x - 6, y); c.stroke(); c.globalAlpha = 1;
  }

  function fire(c, p, t) {
    var f = Math.sin(t * 0.008) * 0.5 + 0.5;
    c.save(); c.translate(p.x, p.y); c.scale(1, 0.62); c.translate(-p.x, -p.y);
    var g = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, 52);
    g.addColorStop(0, 'rgba(255,170,60,' + (0.26 + f * 0.08) + ')');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, 52, 0, 6.2832); c.fill();
    c.fillStyle = '#3b2a1a';
    for (var i = 0; i < 4; i++) {
      var a = i * 1.57;
      c.fillRect(p.x + Math.cos(a) * 12 - 3, p.y + Math.sin(a) * 8 - 2, 7, 4);
    }
    c.fillStyle = '#ff7a1a';
    c.beginPath();
    c.moveTo(p.x - 6, p.y - 2); c.quadraticCurveTo(p.x, p.y - 18 - f * 6, p.x + 6, p.y - 2);
    c.closePath(); c.fill();
    c.fillStyle = '#ffd166';
    c.beginPath();
    c.moveTo(p.x - 3, p.y - 3); c.quadraticCurveTo(p.x, p.y - 11 - f * 5, p.x + 3, p.y - 3);
    c.closePath(); c.fill();
    c.restore();
  }

  function crate(c, p) {
    c.fillStyle = 'rgba(6,19,10,.25)';
    c.fillRect(p.x - 9, p.y - 2, 22, 8);
    c.fillStyle = '#7d6135'; c.fillRect(p.x - 10, p.y - 16, 20, 18);
    c.fillStyle = '#9b7a45'; c.fillRect(p.x - 10, p.y - 16, 20, 5);
    c.strokeStyle = '#4c3a1f'; c.lineWidth = 1.4;
    c.strokeRect(p.x - 10, p.y - 16, 20, 18);
    c.beginPath(); c.moveTo(p.x - 10, p.y - 11); c.lineTo(p.x + 10, p.y + 2);
    c.moveTo(p.x + 10, p.y - 11); c.lineTo(p.x - 10, p.y + 2); c.stroke();
  }

  function sandbag(c, p) {
    c.fillStyle = '#8c8259';
    c.beginPath(); c.ellipse(p.x, p.y - 4, 15, 8, 0, 0, 6.2832); c.fill();
    c.fillStyle = '#a89a6c';
    c.beginPath(); c.ellipse(p.x - 2, p.y - 8, 12, 6, 0, 0, 6.2832); c.fill();
    c.strokeStyle = 'rgba(70,62,38,.6)'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(p.x - 2, p.y - 8, 12, 6, 0, 0, 6.2832); c.stroke();
  }

  function antenna(c, p) {
    c.strokeStyle = '#b9c6c8'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y - 62); c.stroke();
    c.beginPath(); c.moveTo(p.x - 9, p.y - 50); c.lineTo(p.x + 9, p.y - 46); c.stroke();
    c.fillStyle = '#ff6a6a'; c.beginPath(); c.arc(p.x, p.y - 62, 2.2, 0, 6.2832); c.fill();
  }

  function wreck(c, p) {
    c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(p.s, p.s);
    c.globalAlpha = 0.3; c.fillStyle = '#07140c';
    c.beginPath(); c.ellipse(5, 6, 42, 16, 0, 0, 6.2832); c.fill(); c.globalAlpha = 1;
    c.fillStyle = '#3b2450';
    c.beginPath();
    c.moveTo(-40, 4); c.quadraticCurveTo(-14, -16, 22, -12);
    c.quadraticCurveTo(44, -6, 40, 6); c.quadraticCurveTo(10, 16, -40, 4);
    c.closePath(); c.fill();
    c.strokeStyle = '#9b6bd6'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#241536';
    c.beginPath(); c.moveTo(-12, -10); c.lineTo(2, -24); c.lineTo(16, -9); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(200,139,255,.8)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-26, 0); c.lineTo(-10, 4); c.moveTo(4, 2); c.lineTo(18, 5); c.stroke();
    c.restore();
  }

  function crystal(c, p, t) {
    var pulse = 0.55 + 0.45 * Math.sin(t * 0.003 + p.seed);
    var g = c.createRadialGradient(p.x, p.y - 10, 2, p.x, p.y - 10, 46 * p.s);
    g.addColorStop(0, 'rgba(200,139,255,' + (0.35 * pulse) + ')');
    g.addColorStop(1, 'rgba(150,80,220,0)');
    c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y - 10, 46 * p.s, 0, 6.2832); c.fill();
    c.fillStyle = '#4a2470';
    c.beginPath();
    c.moveTo(p.x, p.y - 30 * p.s);
    c.lineTo(p.x + 8 * p.s, p.y - 8 * p.s);
    c.lineTo(p.x + 3 * p.s, p.y);
    c.lineTo(p.x - 6 * p.s, p.y - 2 * p.s);
    c.lineTo(p.x - 8 * p.s, p.y - 12 * p.s);
    c.closePath(); c.fill();
    c.fillStyle = '#c48bff';
    c.beginPath();
    c.moveTo(p.x, p.y - 28 * p.s);
    c.lineTo(p.x + 4 * p.s, p.y - 10 * p.s);
    c.lineTo(p.x - 4 * p.s, p.y - 12 * p.s);
    c.closePath(); c.fill();
  }

  function spire(c, p, t) {
    var pulse = 0.5 + 0.5 * Math.sin(t * 0.002 + p.x * 0.01);
    c.fillStyle = 'rgba(6,12,10,.28)';
    c.beginPath(); c.ellipse(p.x + 3, p.y, 10 * p.s, 4 * p.s, 0, 0, 6.2832); c.fill();
    var h = 46 * p.s;
    c.fillStyle = '#2c1642';
    c.beginPath();
    c.moveTo(p.x, p.y - h);
    c.lineTo(p.x + 9 * p.s, p.y);
    c.lineTo(p.x - 9 * p.s, p.y);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(200,139,255,' + (0.5 + pulse * 0.4) + ')'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(p.x, p.y - h); c.lineTo(p.x, p.y); c.stroke();
    c.fillStyle = 'rgba(226,180,255,' + (0.6 + pulse * 0.4) + ')'; c.fillRect(p.x - 1, p.y - h - 3, 2, 4);
  }

  function nest(c, p, t) {
    c.fillStyle = '#2a1030';
    c.beginPath(); c.ellipse(p.x, p.y, 52, 30, 0, 0, 6.2832); c.fill();
    c.fillStyle = '#3d1a44';
    c.beginPath(); c.ellipse(p.x - 6, p.y - 4, 40, 22, 0, 0, 6.2832); c.fill();
    for (var i = 0; i < 9; i++) {
      var a = (i / 9) * 6.2832 + t * 0.0004;
      c.strokeStyle = 'rgba(196,110,230,.35)'; c.lineWidth = 2;
      c.beginPath();
      c.moveTo(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 9);
      c.lineTo(p.x + Math.cos(a) * 44, p.y + Math.sin(a) * 26);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,70,110,' + (0.35 + 0.25 * Math.sin(t * 0.004)) + ')';
    c.beginPath(); c.ellipse(p.x, p.y, 14, 8, 0, 0, 6.2832); c.fill();
  }

  return {
    palm: palm, tree: tree, bush: bush, rock: rock, circ: circ, tent: tent, fire: fire,
    palmBase: palmBase, palmCrown: palmCrown,
    treeBase: treeBase, treeCrown: treeCrown,
    bushBase: bushBase, bushCrown: bushCrown,
    crownKinds: { tree: 'treeCrown', palm: 'palmCrown', bush: 'bushCrown' },
    crate: crate, sandbag: sandbag, antenna: antenna, wreck: wreck, crystal: crystal,
    spire: spire, nest: nest
  };
})();
