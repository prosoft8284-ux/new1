export const MAX_LEVEL = 5;

export const UPGRADES = [
  {
    key: 'engine',
    name: 'موتور',
    desc: 'سرعت نهایی و شتاب بیشتر؛ برای جاده‌های طولانی و شکارهای سریع.',
    cost: (level) => 70 + level * 65,
  },
  {
    key: 'chassis',
    name: 'شاسی',
    desc: 'جان بیشتر ماشین و آسیب کمتر از برخورد زامبی.',
    cost: (level) => 60 + level * 60,
  },
  {
    key: 'ram',
    name: 'سپر کوبنده',
    desc: 'در سرعت کمتر هم زامبی را می‌کشی؛ آستانه کشتن پایین می‌آید.',
    cost: (level) => 90 + level * 75,
  },
  {
    key: 'spikes',
    name: 'میخ‌ها',
    desc: 'شعاع کشتن بزرگ‌تر و امتیاز بیشتر برای هر زامبی.',
    cost: (level) => 100 + level * 80,
  },
  {
    key: 'tires',
    name: 'لاستیک',
    desc: 'فرمان‌پذیری و چسبندگی بهتر؛ دریفت کنترل‌شده‌تر.',
    cost: (level) => 50 + level * 50,
  },
];

const SAVE_KEY = 'baghdad2000.save.v1';

export function emptyProgress() {
  return {
    points: 0,
    kills: 0,
    best: 0,
    upgrades: { engine: 0, chassis: 0, ram: 0, spikes: 0, tires: 0 },
    weapons: { mg: 0, flame: 0, harpoon: 0 },
    weapon: 'mg',
    weaponReset: true,
    difficulty: 'normal',
    quality: 'auto',
  };
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw);
    const base = emptyProgress();
    const weapons = { ...base.weapons, ...(parsed.weapons || {}) };
    let points = Number(parsed.points) || 0;
    // saves from before weapons became upgrades started with a free roof gun
    if (!parsed.weaponReset && Number(weapons.mg) === 1 && !weapons.flame && !weapons.harpoon) {
      weapons.mg = 0;
      points += 150;
    }
    return {
      weaponReset: true,
      points,
      kills: Number(parsed.kills) || 0,
      best: Number(parsed.best) || 0,
      upgrades: { ...base.upgrades, ...(parsed.upgrades || {}) },
      weapons,
      weapon: parsed.weapon || base.weapon,
      difficulty: parsed.difficulty || base.difficulty,
      quality: parsed.quality || base.quality,
    };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    /* storage may be unavailable; the run still works */
  }
}

export function upgradeCost(upgrade, level) {
  return upgrade.cost(level);
}

export function totalUpgradeLevels(upgrades) {
  return Object.values(upgrades).reduce((a, b) => a + b, 0);
}
