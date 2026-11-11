import { UPGRADES, MAX_LEVEL, upgradeCost, totalUpgradeLevels } from './upgrades.js';
import { WEAPONS, weaponCost } from './weapons.js';

const REPAIR_COST = 60;

const DIFFICULTY_HINTS = {
  easy: 'زامبی‌ها کندتر و کم‌آسیب‌ترند؛ برای گرم‌کردن و لذت بردن.',
  normal: 'زامبی‌ها سریع می‌رسند؛ سرعتت سلاح توست.',
  hard: 'موج‌های بی‌رحم، آسیب زیاد و زامبی‌های پیگیر. فقط برای حرفه‌ای‌ها.',
};

function el(id) {
  return document.getElementById(id);
}

function num(n) {
  return String(n);
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
    wave: el('hud-wave'),
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
    weaponsBar: el('hud-weapons'),
    start: el('start'),
    startBest: el('start-best'),
    startKills: el('start-kills'),
    diffHint: el('diff-hint'),
    garage: el('garage'),
    garageList: el('garage-list'),
    garagePoints: el('garage-points'),
    garageLevels: el('garage-levels'),
    btnRepair: el('btn-repair'),
    repairCost: el('repair-cost'),
    btnCloseGarage: el('btn-close-garage'),
    pause: el('pause'),
    gameover: el('gameover'),
    goScore: el('go-score'),
    goKills: el('go-kills'),
    goBest: el('go-best'),
    goWave: el('go-wave'),
    btnMute: el('btn-mute'),
    btnMenuSound: el('btn-menu-sound'),
    touch: el('touch'),
    boostHint: el('hud-boost'),
    qualityNote: el('quality-note'),
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
  const chips = new Map();

  el('btn-start')?.addEventListener('click', () => handlers.onStart?.());
  el('btn-close-garage')?.addEventListener('click', () => handlers.onCloseGarage?.());
  el('btn-repair')?.addEventListener('click', () => handlers.onRepair?.());
  el('btn-resume')?.addEventListener('click', () => handlers.onResume?.());
  el('btn-pause-garage')?.addEventListener('click', () => handlers.onGarage?.());
  el('btn-pause-restart')?.addEventListener('click', () => handlers.onRestart?.());
  el('btn-quit')?.addEventListener('click', () => handlers.onMenu?.());
  el('btn-restart')?.addEventListener('click', () => handlers.onRestart?.());
  el('btn-go-garage')?.addEventListener('click', () => handlers.onGarage?.());
  el('btn-go-menu')?.addEventListener('click', () => handlers.onMenu?.());
  el('btn-menu-garage')?.addEventListener('click', () => handlers.onGarage?.());
  el('btn-garage')?.addEventListener('click', () => handlers.onGarage?.());
  el('btn-weapon')?.addEventListener('click', () => handlers.onSwitchWeapon?.());
  dom.btnMute?.addEventListener('click', () => handlers.onMute?.());
  dom.btnMenuSound?.addEventListener('click', () => handlers.onMute?.());
  el('btn-pause')?.addEventListener('click', () => handlers.onPause?.());

  document.querySelectorAll('#difficulty .diff-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const diff = btn.getAttribute('data-diff');
      if (diff) handlers.onDifficulty?.(diff);
    });
  });

  document.querySelectorAll('#quality .diff-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-q');
      if (mode) handlers.onQuality?.(mode);
    });
  });

  document.querySelectorAll('#touch [data-touch]').forEach((btn) => {
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

  function updateWeaponChips(state) {
    if (!state) return;
    for (const [key, chip] of chips) {
      const active = key === state.key;
      chip.root.classList.toggle('active', active);
      chip.root.classList.toggle('overheat', key === state.key && state.overheat);
      if (key === state.key) {
        chip.bar.style.width = Math.round(Math.max(0, Math.min(1, state.ratio)) * 100) + '%';
        chip.note.textContent = state.note;
      }
    }
  }

  return {
    update(s) {
      setText(dom.score, num(s.points));
      setText(dom.kills, num(s.kills));
      setText(dom.best, num(s.best));
      setText(dom.speed, num(Math.round(s.speedKmh)));
      setText(dom.healthText, num(Math.round(s.health)));
      setText(dom.wave, 'موج ' + num(s.wave || 1));

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

      dom.combo?.classList.toggle('on', s.combo > 1);
      if (s.combo > 1) {
        setText(dom.comboMult, '×' + num(s.combo));
        if (dom.comboBar) dom.comboBar.style.width = Math.round(s.comboTime * 100) + '%';
      }

      dom.rampage?.classList.toggle('hidden', !s.rampage);
      dom.rampageTint?.classList.toggle('on', !!s.rampage);
      dom.lines.style.opacity = String(Math.min(0.55, s.speedLines));
      setText(dom.boostHint, s.boosting ? 'فعال' : 'Shift');
      if (s.weapon) updateWeaponChips(s.weapon);
    },

    popCombo() {
      if (!dom.combo) return;
      dom.combo.classList.remove('pop');
      requestAnimationFrame(() => dom.combo && dom.combo.classList.add('pop'));
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

    refreshMenu(progress) {
      setText(dom.startBest, num(progress.best));
      setText(dom.startKills, num(progress.kills));
    },

    setDifficulty(diff) {
      document.querySelectorAll('#difficulty .diff-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-diff') === diff);
      });
      if (dom.diffHint) dom.diffHint.textContent = DIFFICULTY_HINTS[diff] || DIFFICULTY_HINTS.normal;
    },

    setWeapons(levels, selected) {
      if (!dom.weaponsBar) return;
      dom.weaponsBar.innerHTML = '';
      chips.clear();
      WEAPONS.forEach((w, i) => {
        const level = (levels && levels[w.key]) || 0;
        const root = document.createElement('button');
        root.className = 'weapon-chip' + (level > 0 ? '' : ' locked') + (selected === w.key ? ' active' : '');
        root.type = 'button';
        root.disabled = level === 0;
        root.innerHTML =
          '<span class="w-icon">' + w.icon + '</span>' +
          '<span class="w-meta"><span class="w-name">' + w.name + '</span>' +
          '<span class="w-bar"><i></i></span></span>' +
          '<span class="weapon-key">' + (i + 1) + '</span>';
        const note = document.createElement('span');
        note.className = 'w-note';
        note.textContent = level > 0 ? w.tag : 'قفل';
        root.querySelector('.w-meta').appendChild(note);
        root.addEventListener('click', () => handlers.onSelectWeapon?.(w.key));
        dom.weaponsBar.appendChild(root);
        chips.set(w.key, { root, bar: root.querySelector('.w-bar i'), note });
        if (level === 0) root.querySelector('.w-bar').style.display = 'none';
      });
    },

    setWeaponState(state) {
      updateWeaponChips(state);
    },

    showGameOver(data) {
      setText(dom.goScore, num(data.points));
      setText(dom.goKills, num(data.kills));
      setText(dom.goBest, num(data.best));
      setText(dom.goWave, num(data.wave || 1));
      dom.gameover?.classList.remove('hidden');
    },

    hideGameOver() {
      dom.gameover?.classList.add('hidden');
    },

    showGarage(progress, health, maxHealth, backLabel = 'بازگشت', selectedWeapon) {
      if (dom.garagePoints) dom.garagePoints.textContent = num(progress.points);
      if (dom.garageLevels) {
        const total =
          totalUpgradeLevels(progress.upgrades) +
          Object.values(progress.weapons || {}).reduce((a, b) => a + b, 0);
        dom.garageLevels.textContent = num(total) + '/' + num(UPGRADES.length * MAX_LEVEL + WEAPONS.length * 3);
      }
      if (dom.btnCloseGarage) dom.btnCloseGarage.textContent = backLabel;
      this.renderGarage(progress, health, maxHealth, selectedWeapon);
      dom.garage?.classList.remove('hidden');
    },

    hideGarage() {
      dom.garage?.classList.add('hidden');
    },

    renderGarage(progress, health, maxHealth, selectedWeapon) {
      if (!dom.garageList) return;
      dom.garageList.innerHTML = '';

      const upHead = document.createElement('h3');
      upHead.className = 'garage-sub';
      upHead.textContent = 'ارتقای ماشین';
      dom.garageList.appendChild(upHead);

      for (const up of UPGRADES) {
        const level = progress.upgrades[up.key] || 0;
        const maxed = level >= MAX_LEVEL;
        const cost = upgradeCost(up, level);
        const affordable = !maxed && progress.points >= cost;

        const row = document.createElement('div');
        row.className = 'up-row';

        const info = document.createElement('div');
        const h3 = document.createElement('h3');
        h3.textContent = up.name + ' · سطح ' + num(level);
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
        btn.textContent = maxed ? 'حداکثر' : 'ارتقا · ' + num(cost);
        btn.disabled = maxed || !affordable;
        btn.addEventListener('click', () => handlers.onBuy?.(up.key));

        row.append(info, btn);
        dom.garageList.appendChild(row);
      }

      const wHead = document.createElement('h3');
      wHead.className = 'garage-sub';
      wHead.textContent = 'تسلیحات سوارشده';
      dom.garageList.appendChild(wHead);

      for (const w of WEAPONS) {
        const level = (progress.weapons && progress.weapons[w.key]) || 0;
        const maxed = level >= 3;
        const cost = weaponCost(w, level);
        const affordable = !maxed && progress.points >= cost;

        const row = document.createElement('div');
        row.className = 'up-row weapon-row';

        const info = document.createElement('div');
        const h3 = document.createElement('h3');
        h3.textContent = w.icon + ' ' + w.name + ' · سطح ' + num(level);
        const p = document.createElement('p');
        p.textContent = w.desc;
        const pips = document.createElement('div');
        pips.className = 'pips';
        for (let i = 0; i < 3; i++) {
          const pip = document.createElement('i');
          if (i < level) pip.className = 'on';
          pips.appendChild(pip);
        }
        info.append(h3, p, pips);

        const actions = document.createElement('div');
        actions.className = 'w-actions';

        const buy = document.createElement('button');
        buy.className = 'up-buy' + (maxed ? ' max' : '');
        buy.textContent = maxed ? 'حداکثر' : level === 0 ? 'سوار کن · ' + num(cost) : 'ارتقا · ' + num(cost);
        buy.disabled = maxed || !affordable;
        buy.addEventListener('click', () => handlers.onBuyWeapon?.(w.key));

        const equip = document.createElement('button');
        equip.className = 'up-buy equip' + (selectedWeapon === w.key ? ' on' : '');
        equip.textContent = selectedWeapon === w.key ? 'نصب‌شده' : 'انتخاب';
        equip.disabled = level === 0;
        equip.addEventListener('click', () => handlers.onSelectWeapon?.(w.key));

        actions.append(buy, equip);
        row.append(info, actions);
        dom.garageList.appendChild(row);
      }

      const full = health >= maxHealth;
      if (dom.btnRepair) dom.btnRepair.disabled = full || progress.points < REPAIR_COST;
      if (dom.repairCost) dom.repairCost.textContent = num(REPAIR_COST);
    },

    showTouch(show) {
      dom.touch?.classList.toggle('hidden', !show);
    },

    setQuality(mode, level, fps) {
      document.querySelectorAll('#quality .diff-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-q') === mode);
      });
      if (dom.qualityNote) {
        const names = { high: 'بالا', medium: 'متوسط', low: 'کم' };
        dom.qualityNote.textContent =
          mode === 'auto'
            ? 'خودکار · اکنون ' + (names[level] || 'بالا') + ' · ' + Math.round(fps) + ' FPS'
            : 'دستی · ' + (names[level] || 'بالا') + ' · ' + Math.round(fps) + ' FPS';
      }
    },

    setMuted(muted) {
      dom.btnMute?.classList.toggle('off', muted);
      if (dom.btnMute) dom.btnMute.textContent = muted ? '🔇' : '🔊';
      if (dom.btnMenuSound) dom.btnMenuSound.textContent = muted ? 'صدا: خاموش' : 'صدا: روشن';
    },

    repairCost: REPAIR_COST,
  };
}
