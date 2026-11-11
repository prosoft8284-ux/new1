import { UPGRADES, MAX_LEVEL, upgradeCost, totalUpgradeLevels } from './upgrades.js';

const REPAIR_COST = 45;

function el(id) {
  return document.getElementById(id);
}

function fa(n) {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

export function createUI(handlers) {
  const dom = {
    hud: el('hud'),
    score: el('hud-score'),
    kills: el('hud-kills'),
    best: el('hud-best'),
    combo: el('hud-combo'),
    comboMult: el('hud-combo-mult'),
    comboBar: el('hud-combo-bar'),
    speed: el('hud-speed'),
    healthFill: el('hud-health-fill'),
    healthBar: el('hud-health-fill')?.parentElement,
    healthText: el('hud-health-text'),
    nitroFill: el('hud-nitro-fill'),
    nitroBar: el('hud-nitro-fill')?.parentElement,
    rampage: el('hud-rampage'),
    rampageTint: el('rampage-tint'),
    msg: el('msg'),
    flash: el('flash'),
    lines: el('speedlines'),
    start: el('start'),
    garage: el('garage'),
    garageList: el('garage-list'),
    garagePoints: el('garage-points'),
    garageLevels: el('garage-levels'),
    btnRepair: el('btn-repair'),
    repairCost: el('repair-cost'),
    pause: el('pause'),
    gameover: el('gameover'),
    goScore: el('go-score'),
    goKills: el('go-kills'),
    goBest: el('go-best'),
    btnMute: el('btn-mute'),
    touch: el('touch'),
    boostHint: el('hud-boost'),
  };

  const last = new Map();
  function setText(node, value) {
    if (!node) return;
    if (last.get(node) === value) return;
    last.set(node, value);
    node.textContent = value;
  }

  let msgTimer = 0;
  let flashTimer = 0;

  // ---- buttons ----
  el('btn-start')?.addEventListener('click', () => handlers.onStart?.());
  el('btn-close-garage')?.addEventListener('click', () => handlers.onCloseGarage?.());
  el('btn-repair')?.addEventListener('click', () => handlers.onRepair?.());
  el('btn-resume')?.addEventListener('click', () => handlers.onResume?.());
  el('btn-pause-garage')?.addEventListener('click', () => handlers.onGarage?.());
  el('btn-restart')?.addEventListener('click', () => handlers.onRestart?.());
  el('btn-go-garage')?.addEventListener('click', () => handlers.onGarage?.());
  dom.btnMute?.addEventListener('click', () => handlers.onMute?.());

  const touchButtons = document.querySelectorAll('#touch [data-touch]');
  touchButtons.forEach((btn) => {
    const move = btn.getAttribute('data-touch');
    const down = (e) => {
      e.preventDefault();
      btn.classList.add('pressed');
      handlers.onTouch?.(move, true);
    };
    const up = (e) => {
      e.preventDefault();
      btn.classList.remove('pressed');
      handlers.onTouch?.(move, false);
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  });

  return {
    update(s) {
      setText(dom.score, fa(s.points));
      setText(dom.kills, fa(s.kills));
      setText(dom.best, fa(s.best));
      setText(dom.speed, fa(Math.round(s.speedKmh)));
      setText(dom.healthText, fa(Math.round(s.health)));

      if (dom.healthFill) {
        const pct = Math.max(0, Math.min(100, (s.health / s.maxHealth) * 100));
        dom.healthFill.style.width = pct + '%';
        dom.healthBar?.classList.toggle('low', pct < 30);
      }
      if (dom.nitroFill) {
        const pct = Math.max(0, Math.min(100, s.nitro * 100));
        dom.nitroFill.style.width = pct + '%';
        dom.nitroBar?.classList.toggle('ready', pct > 25);
      }

      const comboOn = s.combo > 1;
      dom.combo?.classList.toggle('on', comboOn);
      if (comboOn) {
        setText(dom.comboMult, '×' + fa(s.combo));
        if (dom.comboBar) dom.comboBar.style.width = Math.round(s.comboTime * 100) + '%';
      }

      dom.rampage?.classList.toggle('hidden', !s.rampage);
      dom.rampageTint?.classList.toggle('on', !!s.rampage);
      dom.lines.style.opacity = String(Math.min(0.85, s.speedLines));
      setText(dom.boostHint, s.boosting ? 'فعال' : 'Shift');
    },

    popCombo() {
      if (!dom.combo) return;
      dom.combo.classList.remove('pop');
      void dom.combo.offsetWidth;
      dom.combo.classList.add('pop');
    },

    message(text, kind = '') {
      if (!dom.msg) return;
      dom.msg.textContent = text;
      dom.msg.className = 'msg on ' + kind;
      msgTimer = kind === 'kill' ? 0.9 : 1.4;
    },

    flashDamage(strength = 1) {
      if (!dom.flash) return;
      dom.flash.style.transition = 'opacity 0.05s';
      dom.flash.style.opacity = String(Math.min(0.95, 0.35 + strength * 0.5));
      flashTimer = 0.12;
    },

    tick(dt) {
      if (msgTimer > 0) {
        msgTimer -= dt;
        if (msgTimer <= 0 && dom.msg) dom.msg.className = 'msg';
      }
      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0 && dom.flash) {
          dom.flash.style.transition = 'opacity 0.35s ease-out';
          dom.flash.style.opacity = '0';
        }
      }
    },

    showHud(show) {
      dom.hud?.classList.toggle('hidden', !show);
    },

    showStart(show) {
      dom.start?.classList.toggle('hidden', !show);
    },

    showPause(show) {
      dom.pause?.classList.toggle('hidden', !show);
    },

    showGameOver(data) {
      setText(dom.goScore, fa(data.points));
      setText(dom.goKills, fa(data.kills));
      setText(dom.goBest, fa(data.best));
      dom.gameover?.classList.remove('hidden');
    },

    hideGameOver() {
      dom.gameover?.classList.add('hidden');
    },

    showGarage(progress, health, maxHealth) {
      if (dom.garagePoints) dom.garagePoints.textContent = fa(progress.points);
      if (dom.garageLevels) dom.garageLevels.textContent = fa(totalUpgradeLevels(progress.upgrades)) + '/' + fa(UPGRADES.length * MAX_LEVEL);
      this.renderGarage(progress, health, maxHealth);
      dom.garage?.classList.remove('hidden');
    },

    hideGarage() {
      dom.garage?.classList.add('hidden');
    },

    renderGarage(progress, health, maxHealth) {
      if (!dom.garageList) return;
      dom.garageList.innerHTML = '';
      for (const up of UPGRADES) {
        const level = progress.upgrades[up.key] || 0;
        const maxed = level >= MAX_LEVEL;
        const cost = upgradeCost(up, level);
        const affordable = !maxed && progress.points >= cost;

        const row = document.createElement('div');
        row.className = 'up-row';

        const info = document.createElement('div');
        const h3 = document.createElement('h3');
        h3.textContent = up.name + ' · سطح ' + fa(level);
        const p = document.createElement('p');
        p.textContent = up.desc;
        const pips = document.createElement('div');
        pips.className = 'pips';
        for (let i = 0; i < MAX_LEVEL; i++) {
          const pip = document.createElement('i');
          if (i < level) pip.className = 'on';
          pips.appendChild(pip);
        }
        info.append(h3, p, pips);

        const btn = document.createElement('button');
        btn.className = 'up-buy' + (maxed ? ' max' : '');
        btn.textContent = maxed ? 'حداکثر' : 'ارتقا · ' + fa(cost);
        btn.disabled = maxed || !affordable;
        btn.addEventListener('click', () => handlers.onBuy?.(up.key));

        row.append(info, btn);
        dom.garageList.appendChild(row);
      }

      const full = health >= maxHealth;
      if (dom.btnRepair) dom.btnRepair.disabled = full || progress.points < REPAIR_COST;
      if (dom.repairCost) dom.repairCost.textContent = fa(REPAIR_COST);
    },

    showTouch(show) {
      dom.touch?.classList.toggle('hidden', !show);
    },

    setMuted(muted) {
      dom.btnMute?.classList.toggle('off', muted);
      if (dom.btnMute) dom.btnMute.textContent = muted ? '🔇' : '🔊';
    },

    repairCost: REPAIR_COST,
  };
}
