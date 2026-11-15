(() => {
  "use strict";

  const STORAGE = {
    meta: "rd_meta_v1",
    settings: "rd_settings_v1",
    best: "rd_best_v1",
    run: "rd_run_v1",
  };

  const SPEED_STEPS = [1, 1.5, 2, 3, 5];
  const SHAKE_LEVELS = ["off", "low", "med", "high"];
  const SHAKE_MUL = { off: 0, low: 0.28, med: 0.6, high: 1 };
  const MAX_PARTICLES = 180;

  const DIFFICULTIES = {
    normal: { id: "normal", name: "Normal", hpMul: 1, speedMul: 1, countMul: 1, intervalMul: 1, rewardMul: 1, chipMul: 1, unlock: null },
    hard: { id: "hard", name: "Hard", hpMul: 1.45, speedMul: 1.12, countMul: 1.2, intervalMul: 0.88, rewardMul: 1.35, chipMul: 1.5, unlock: { kind: "wave", difficulty: "normal", wave: 12 } },
    nightmare: { id: "nightmare", name: "Nightmare", hpMul: 2.1, speedMul: 1.28, countMul: 1.4, intervalMul: 0.75, rewardMul: 1.75, chipMul: 2.25, unlock: { kind: "wave", difficulty: "hard", wave: 15 } },
  };

  const BASE_TOWER = {
    turret: {
      name: "Turret", cost: 55, damage: 30, range: 82, fireRate: 0.40, sell: 28, color: "#e8883a",
      hitsAir: true, hitsGround: true, splash: 0,
      blurb: "High DPS · short range · hits air & ground",
    },
    mortar: {
      name: "Mortar", cost: 85, damage: 44, range: 128, fireRate: 1.28, splash: 52, sell: 42, color: "#6fbf8a",
      hitsAir: false, hitsGround: true,
      blurb: "AoE splash · slow · cannot hit flying",
    },
    coil: {
      name: "Coil", cost: 70, damage: 15, range: 108, fireRate: 0.55, sell: 35, color: "#4db8c4",
      hitsAir: true, hitsGround: true, airBonus: 1.55, armorPenalty: 0.55, slow: 0.55, slowDur: 1.45,
      blurb: "Slows · anti-air · weak vs armor",
    },
  };

  const ELEMENTS = {
    fire: { id: "fire", name: "Fire", color: "#e85d4c", cost: 25 },
    water: { id: "water", name: "Water", color: "#4db8c4", cost: 25 },
    earth: { id: "earth", name: "Earth", color: "#c4a35a", cost: 25 },
    wind: { id: "wind", name: "Wind", color: "#7ec9a0", cost: 25 },
  };
  const ELEMENT_SECOND_COST = 40;
  const MAX_ELEMENTS = 2;

  const UPGRADE_TREES = {
    turret: [
      { id: "t_dmg1", name: "Hot Rounds I", desc: "+28% damage", cost: 28, req: null, effect: { damage: 1.28 } },
      { id: "t_dmg2", name: "Hot Rounds II", desc: "+30% damage", cost: 48, req: "t_dmg1", effect: { damage: 1.3 } },
      { id: "t_dmg3", name: "AP Core", desc: "+35% damage", cost: 80, req: "t_dmg2", effect: { damage: 1.35 } },
      { id: "t_rng1", name: "Long Barrel", desc: "+18% range", cost: 32, req: null, effect: { range: 1.18 } },
      { id: "t_rng2", name: "Spotter Link", desc: "+22% range", cost: 65, req: "t_rng1", effect: { range: 1.22 } },
      { id: "t_spd1", name: "Servo Drive", desc: "+22% fire rate", cost: 35, req: null, effect: { fireRate: 0.82 } },
      { id: "t_spd2", name: "Burst Mag", desc: "+25% fire rate", cost: 70, req: "t_spd1", effect: { fireRate: 0.8 } },
      { id: "t_crit", name: "Crit Optics", desc: "22% chance ×2 damage", cost: 90, req: "t_dmg2", effect: { crit: 0.22 } },
    ],
    mortar: [
      { id: "m_dmg1", name: "HE Shells I", desc: "+28% damage", cost: 30, req: null, effect: { damage: 1.28 } },
      { id: "m_dmg2", name: "HE Shells II", desc: "+30% damage", cost: 55, req: "m_dmg1", effect: { damage: 1.3 } },
      { id: "m_splash1", name: "Wider Blast", desc: "+28% splash", cost: 40, req: null, effect: { splash: 1.28 } },
      { id: "m_splash2", name: "Cluster Cap", desc: "+35% splash", cost: 72, req: "m_splash1", effect: { splash: 1.35 } },
      { id: "m_rng1", name: "Arc Sight", desc: "+15% range", cost: 34, req: null, effect: { range: 1.15 } },
      { id: "m_spd1", name: "Fast Loader", desc: "+18% fire rate", cost: 42, req: null, effect: { fireRate: 0.85 } },
      { id: "m_burn", name: "Incendiary Base", desc: "Mild burn without Fire socket", cost: 95, req: "m_dmg1", effect: { burn: 6 } },
    ],
    coil: [
      { id: "c_dmg1", name: "Amp Coil I", desc: "+30% damage", cost: 28, req: null, effect: { damage: 1.3 } },
      { id: "c_dmg2", name: "Amp Coil II", desc: "+35% damage", cost: 52, req: "c_dmg1", effect: { damage: 1.35 } },
      { id: "c_slow1", name: "Deep Freeze", desc: "Stronger base slow", cost: 36, req: null, effect: { slow: 0.4 } },
      { id: "c_slow2", name: "Cryo Hold", desc: "Longer slow", cost: 60, req: "c_slow1", effect: { slowDur: 1.5 } },
      { id: "c_rng1", name: "Field Expand", desc: "+18% range", cost: 34, req: null, effect: { range: 1.18 } },
      { id: "c_spd1", name: "Pulse Sync", desc: "+24% fire rate", cost: 40, req: null, effect: { fireRate: 0.8 } },
      { id: "c_chain", name: "Arc Jump", desc: "Chain to 2nd target", cost: 88, req: "c_dmg1", effect: { chain: 1 } },
    ],
  };

  // resist: <1 resists that element, >1 is weak. Applied per socketed element on hit.
  const ENEMY = {
    drone: {
      hp: 34, speed: 70, reward: 11, r: 11, color: "#4db8c4", shape: "tri",
      tags: ["flying", "fast"], label: "Drone",
      resist: { fire: 0.9, water: 1.2, earth: 0.5, wind: 1.45 },
    },
    crawler: {
      hp: 88, speed: 40, reward: 18, r: 13, color: "#e8883a", shape: "sq",
      tags: ["ground"], label: "Crawler",
      resist: { fire: 1.2, water: 1.0, earth: 1.1, wind: 0.8 },
    },
    armor: {
      hp: 220, speed: 26, reward: 38, r: 15, color: "#a89a8c", shape: "hex",
      tags: ["ground", "armored"], label: "Armor",
      resist: { fire: 0.55, water: 0.8, earth: 1.5, wind: 0.5 },
    },
    swarm: {
      hp: 18, speed: 84, reward: 7, r: 8, color: "#6fbf8a", shape: "dot",
      tags: ["ground", "swarm"], label: "Swarm",
      resist: { fire: 1.55, water: 0.65, earth: 0.9, wind: 0.85 },
    },
    boss: {
      hp: 920, speed: 20, reward: 120, r: 24, color: "#e85d4c", shape: "boss",
      tags: ["ground", "armored", "boss"], label: "Boss",
      resist: { fire: 0.65, water: 0.7, earth: 1.25, wind: 0.55 },
    },
  };

  function enemyResist(enemy) {
    if (enemy && enemy.resist) return enemy.resist;
    const def = ENEMY[enemy && enemy.type] || null;
    return (def && def.resist) || {};
  }
  function elementResistMul(enemy, elsArr) {
    if (!elsArr || !elsArr.length) return 1;
    const r = enemyResist(enemy);
    let m = 1;
    for (const el of elsArr) {
      if (r[el] != null) m *= r[el];
    }
    // Soften dual-socket extremes so mixed sockets stay readable.
    if (elsArr.length > 1) m = Math.pow(m, 0.78);
    return m;
  }
  function formatResistLine(resist) {
    const weak = [], tank = [];
    for (const el of ["fire", "water", "earth", "wind"]) {
      const v = resist[el];
      if (v == null) continue;
      const name = ELEMENTS[el].name;
      if (v >= 1.15) weak.push(name);
      else if (v <= 0.85) tank.push(name);
    }
    const parts = [];
    if (tank.length) parts.push(`Resists ${tank.join("/")}`);
    if (weak.length) parts.push(`Weak to ${weak.join("/")}`);
    return parts.join(" · ") || "No strong elemental bias";
  }

  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function newRunSeed() {
    return `ew-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return structuredClone(fallback);
      return { ...structuredClone(fallback), ...JSON.parse(raw) };
    } catch { return structuredClone(fallback); }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
  }

  const defaultMeta = () => ({
    chips: 0, owned: {}, unlockedDifficulties: { normal: true }, selectedDifficulty: "normal",
    bestByDifficulty: { normal: { wave: 0, score: 0 }, hard: { wave: 0, score: 0 }, nightmare: { wave: 0, score: 0 } },
  });
  const defaultSettings = () => ({
    muted: false, gameSpeed: 1, tutorialDone: false, coachStep: 0,
    shake: "low", particles: true, hitFlash: true, screenFlash: true, combatFx: true,
  });
  const defaultBest = () => ({ wave: 0, score: 0 });

  let meta = loadJSON(STORAGE.meta, defaultMeta());
  if (!meta.unlockedDifficulties) meta.unlockedDifficulties = { normal: true };
  if (!meta.bestByDifficulty) meta.bestByDifficulty = defaultMeta().bestByDifficulty;
  if (!meta.selectedDifficulty) meta.selectedDifficulty = "normal";
  let settings = loadJSON(STORAGE.settings, defaultSettings());
  if (!SPEED_STEPS.includes(settings.gameSpeed)) settings.gameSpeed = 1;
  if (settings.coachStep == null) settings.coachStep = 0;
  if (!SHAKE_LEVELS.includes(settings.shake)) settings.shake = "low";
  if (typeof settings.particles !== "boolean") settings.particles = true;
  if (typeof settings.hitFlash !== "boolean") settings.hitFlash = true;
  if (typeof settings.screenFlash !== "boolean") settings.screenFlash = true;
  if (typeof settings.combatFx !== "boolean") settings.combatFx = true;
  let best = loadJSON(STORAGE.best, defaultBest());

  function isDifficultyUnlocked(id) {
    if (id === "normal") return true;
    if (meta.unlockedDifficulties && meta.unlockedDifficulties[id]) return true;
    const def = DIFFICULTIES[id];
    if (!def || !def.unlock) return false;
    const u = def.unlock;
    const rec = (meta.bestByDifficulty && meta.bestByDifficulty[u.difficulty]) || { wave: 0, score: 0 };
    return u.kind === "wave" ? rec.wave >= u.wave : rec.score >= (u.score || 0);
  }
  function syncDifficultyUnlocks() {
    let changed = false;
    for (const id of Object.keys(DIFFICULTIES)) {
      if (isDifficultyUnlocked(id) && !meta.unlockedDifficulties[id]) {
        meta.unlockedDifficulties[id] = true; changed = true;
      }
    }
    if (changed) saveJSON(STORAGE.meta, meta);
  }
  function currentDiff() { return DIFFICULTIES[meta.selectedDifficulty] || DIFFICULTIES.normal; }
  function unlockHint(id) {
    const def = DIFFICULTIES[id];
    if (!def.unlock) return "Always available";
    if (isDifficultyUnlocked(id)) return "Unlocked";
    const u = def.unlock;
    return `Reach wave ${u.wave} on ${DIFFICULTIES[u.difficulty].name}`;
  }

  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const els = {
    hp: $("hp"), scrap: $("scrap"), wave: $("wave"), score: $("score"),
    banner: $("banner"), toast: $("toast"),
    hub: $("screen-hub"), upgrades: $("screen-upgrades"), pause: $("screen-pause"),
    over: $("screen-over"), codex: $("screen-codex"), settings: $("screen-settings"),
    bestWave: $("best-wave"), bestScore: $("best-score"), chips: $("chips"), chipsUp: $("chips-up"),
    btnContinue: $("btn-continue"), upgradeList: $("upgrade-list"),
    overSummary: $("over-summary"), overChips: $("over-chips"),
    btnMute: $("btn-mute"), btnPause: $("btn-pause"), btnSpeed: $("btn-speed"),
    speedLabel: $("speed-label"),
    btnSell: $("btn-sell"), btnUpgrade: $("btn-upgrade"),
    inspect: $("inspect"), inspectText: $("inspect-text"),
    coach: $("coach"), coachText: $("coach-text"),
  };

  /* ---- audio-ready hooks (silent when muted) ---- */
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }
  function beep(freq, dur, type = "square", gain = 0.03) {
    if (settings.muted) return;
    try {
      const ac = ensureAudio();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = gain;
      o.connect(g); g.connect(ac.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.stop(ac.currentTime + dur);
    } catch { /* ignore */ }
  }
  const sfx = {
    place: () => beep(700, 0.07, "triangle", 0.045),
    upgrade: () => { beep(520, 0.05, "triangle", 0.03); setTimeout(() => beep(780, 0.08, "triangle", 0.04), 40); },
    socket: () => beep(640, 0.06, "sine", 0.035),
    shoot: (kind) => beep(kind === "mortar" ? 140 : kind === "coil" ? 980 : 880, 0.028, "square", 0.018),
    hit: () => beep(260 + Math.random() * 60, 0.025, "square", 0.015),
    kill: () => beep(320 + Math.random() * 80, 0.045, "square", 0.025),
    leak: () => beep(110, 0.16, "sawtooth", 0.05),
    wave: () => beep(520, 0.1, "square", 0.035),
    start: () => beep(440, 0.08, "triangle", 0.04),
    over: () => beep(180, 0.2, "sawtooth", 0.04),
    buy: () => beep(660, 0.07, "triangle", 0.04),
    ui: () => beep(400, 0.03, "triangle", 0.02),
    speed: () => beep(500 + settings.gameSpeed * 120, 0.05, "triangle", 0.03),
  };

  function towerStats(type) {
    const base = { ...BASE_TOWER[type] };
    const owned = meta.owned || {};
    for (const u of UPGRADE_TREES[type]) {
      if (!owned[u.id]) continue;
      const e = u.effect;
      if (e.damage) base.damage *= e.damage;
      if (e.range) base.range *= e.range;
      if (e.fireRate) base.fireRate *= e.fireRate;
      if (e.splash) base.splash = (base.splash || 40) * e.splash;
      if (e.slow != null) base.slow = e.slow;
      if (e.slowDur) base.slowDur = (base.slowDur || 1.2) * e.slowDur;
      if (e.crit) base.crit = e.crit;
      if (e.burn) base.burn = e.burn;
      if (e.chain) base.chain = e.chain;
    }
    return base;
  }

  function comboKey(elements) {
    return [...elements].sort().join("+");
  }
  function describeCombo(elements) {
    if (!elements.length) return "No elements";
    if (elements.length === 1) {
      return ({
        fire: "Fire: burn DoT",
        water: "Water: chill slow",
        earth: "Earth: vs armor + shred",
        wind: "Wind: vs flying + shove",
      })[elements[0]];
    }
    return ({
      "fire+water": "Steam burst (AoE)",
      "earth+fire": "Magma (explode on kill)",
      "fire+wind": "Wildfire (spread burn)",
      "earth+water": "Mud (heavy slow)",
      "water+wind": "Storm (shatter chill)",
      "earth+wind": "Tempest (full vs air & armor)",
    })[comboKey(elements)] || elements.join("+");
  }

  function generatePath(seed, w, h) {
    const rng = mulberry32(hashSeed(seed + ":path"));
    const padX = w * 0.14, padY = h * 0.09;
    const points = [];
    let y = padY;
    let x = padX + rng() * (w - padX * 2);
    points.push({ x, y });
    const lanes = 5 + Math.floor(rng() * 3);
    let goingRight = rng() > 0.5;
    for (let i = 1; i <= lanes; i++) {
      const targetY = padY + ((h - padY * 2) * i) / (lanes + 1);
      points.push({ x, y: targetY });
      const margin = padX + rng() * w * 0.05;
      const targetX = goingRight ? w - margin : margin;
      const mid = (x + targetX) / 2 + (rng() - 0.5) * w * 0.08;
      points.push({ x: mid, y: targetY + (rng() - 0.5) * 12 });
      x = targetX;
      points.push({ x, y: targetY });
      goingRight = !goingRight;
    }
    points.push({ x, y: h - padY });
    const dense = densify(points, 18);
    const lengths = [0];
    let total = 0;
    for (let i = 1; i < dense.length; i++) {
      total += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y);
      lengths.push(total);
    }
    return { points: dense, lengths, total };
  }
  function densify(pts, step) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.ceil(d / step));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  }
  function posOnPath(path, dist) {
    const d = Math.max(0, Math.min(path.total, dist));
    let i = 1;
    while (i < path.lengths.length && path.lengths[i] < d) i++;
    const a = path.points[i - 1], b = path.points[i] || a;
    const seg0 = path.lengths[i - 1];
    const seg1 = path.lengths[i] || seg0 + 1;
    const t = (d - seg0) / Math.max(1e-6, seg1 - seg0);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  function distToPath(path, x, y) {
    let bestD = Infinity;
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1], b = path.points[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      bestD = Math.min(bestD, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)));
    }
    return bestD;
  }

  function bossCountForWave(wave, rng) {
    // Decade waves always bring bosses; count scales with endless depth (cap 5).
    if (wave > 0 && wave % 10 === 0) {
      let n = 1 + Math.floor((wave - 10) / 10); // 10→1, 20→2, 30→3…
      if (wave >= 50) n += Math.floor((wave - 50) / 25);
      return Math.min(5, Math.max(1, n));
    }
    // Late endless: occasional mid-cycle boss so packs can overlap across waves.
    if (wave >= 28 && wave % 5 === 0 && rng() < 0.5) return 1;
    if (wave >= 42 && rng() < 0.1) return 1;
    return 0;
  }

  function wavePlan(seed, wave, diffId) {
    const diff = DIFFICULTIES[diffId] || DIFFICULTIES.normal;
    const rng = mulberry32(hashSeed(seed + ":wave:" + wave + ":" + diff.id));
    // Gentler early-mid HP curve; steeper after wave 20 so endless stays fair.
    const early = Math.min(wave, 10);
    const mid = Math.max(0, Math.min(wave, 20) - 10);
    const late = Math.max(0, wave - 20);
    const difficulty = (1 + (early - 1) * 0.11 + mid * 0.16 + late * 0.24) * diff.hpMul;
    const bossN = bossCountForWave(wave, rng);
    const isBoss = bossN > 0;
    const count = Math.min(52, Math.floor((6 + Math.floor(wave * 1.35 + rng() * 3)) * diff.countMul));
    const interval = Math.max(0.2, (0.92 - wave * 0.028 + (rng() - 0.5) * 0.12) * diff.intervalMul);
    const mix = [];
    // Shared HP budget across multi-boss packs keeps them fair and readable.
    const bossHpShare = bossN <= 1 ? 1 : (0.7 + 0.3 / bossN);
    for (let i = 0; i < bossN; i++) {
      mix.push({
        type: "boss", n: 1, bossIndex: i, bossTotal: bossN, bossHpShare,
      });
    }
    const weights = {
      drone: 0.4 + rng() * 0.15,
      crawler: 0.28,
      armor: Math.min(0.4, 0.08 + wave * 0.02 + (diff.id === "nightmare" ? 0.08 : 0)),
      swarm: wave >= 3 ? 0.22 + rng() * 0.12 : 0,
    };
    let left = Math.max(0, count - bossN);
    const fodder = [];
    while (left > 0) {
      const r = rng();
      let type = "drone";
      const sum = weights.drone + weights.crawler + weights.armor + weights.swarm;
      let acc = weights.drone / sum;
      if (r > acc) { acc += weights.crawler / sum; type = r <= acc ? "crawler" : type; }
      if (r > acc) { acc += weights.armor / sum; type = r <= acc ? "armor" : type; }
      if (r > acc) type = "swarm";
      const n = type === "swarm" ? Math.min(left, 3 + Math.floor(rng() * 4)) : Math.min(left, 1 + Math.floor(rng() * 3));
      fodder.push({ type, n });
      left -= n;
    }
    for (let i = fodder.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [fodder[i], fodder[j]] = [fodder[j], fodder[i]];
    }
    // Keep bosses from stacking: fodder first half, then spaced bosses, then rest.
    if (bossN > 0 && fodder.length) {
      const split = Math.ceil(fodder.length * 0.45);
      mix.length = 0;
      for (let i = 0; i < split; i++) mix.push(fodder[i]);
      for (let i = 0; i < bossN; i++) {
        mix.push({ type: "boss", n: 1, bossIndex: i, bossTotal: bossN, bossHpShare });
      }
      for (let i = split; i < fodder.length; i++) mix.push(fodder[i]);
    } else {
      for (const f of fodder) mix.push(f);
    }
    return {
      count, interval, mix, difficulty, isBoss, bossN,
      speedMul: diff.speedMul, rewardMul: diff.rewardMul,
    };
  }

  function livingBossCount() {
    let n = 0;
    for (const e of state.enemies) if (e.alive && e.type === "boss") n++;
    return n;
  }
  function canAdvanceWave() {
    const living = state.enemies.filter((e) => e.alive);
    if (!living.length) return true;
    // Late endless: allow the next wave while a boss is still on the rift (overlap).
    if (state.wave < 25) return false;
    if (living.some((e) => e.type !== "boss")) return false;
    const bosses = living.length;
    if (state.wave >= 40) return bosses <= 2;
    return bosses <= 1;
  }

  const state = {
    mode: "hub", seed: null, difficulty: "normal", path: null,
    w: 390, h: 620, hp: 20, scrap: 155, score: 0, wave: 0,
    selectedTower: null, selectedBuilt: null,
    towers: [], enemies: [], projectiles: [], fx: [], particles: [],
    spawnQueue: [], spawnTimer: 0, betweenWaves: 0, time: 0, frame: 0,
    shake: 0, flash: 0, ghost: null,
  };

  function normalizeSpeed(v) {
    const n = Number(v);
    if (SPEED_STEPS.includes(n)) return n;
    return 1;
  }
  function formatSpeed(v) {
    const n = normalizeSpeed(v);
    return (Number.isInteger(n) ? String(n) : n.toFixed(1)) + "×";
  }
  function cycleSpeed() {
    const cur = normalizeSpeed(settings.gameSpeed);
    const idx = SPEED_STEPS.indexOf(cur);
    settings.gameSpeed = SPEED_STEPS[(idx + 1) % SPEED_STEPS.length];
    saveJSON(STORAGE.settings, settings);
    syncSpeedUI();
    sfx.speed();
    toast("Speed " + formatSpeed(settings.gameSpeed));
  }
  function syncSpeedUI() {
    const label = formatSpeed(settings.gameSpeed);
    if (els.speedLabel) els.speedLabel.textContent = label;
    if (els.btnSpeed) els.btnSpeed.setAttribute("aria-label", "Game speed " + label);
  }

  /* ---- juice helpers ---- */
  function shakeMul() {
    return SHAKE_MUL[settings.shake] ?? SHAKE_MUL.low;
  }
  function addShake(amount) {
    const mul = shakeMul();
    if (mul <= 0 || amount <= 0) return;
    state.shake = Math.min(3.2, state.shake + amount * mul);
  }
  function spawnParticles(x, y, color, n, speed = 60) {
    if (settings.particles === false) return;
    const budget = MAX_PARTICLES - state.particles.length;
    const count = Math.min(n, Math.max(0, budget));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random() * 0.9);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 20,
        life: 0.25 + Math.random() * 0.45,
        max: 0.7,
        r: 1.2 + Math.random() * 2.4,
        color,
      });
    }
  }
  function pushCombatFx(fx) {
    if (settings.combatFx === false) return;
    state.fx.push(fx);
  }
  function triggerScreenFlash(amount) {
    if (settings.screenFlash === false) return;
    state.flash = Math.max(state.flash, amount);
  }
  function burstPlace(x, y, color) {
    pushCombatFx({ kind: "place", x, y, t: 0.5, color });
    pushCombatFx({ kind: "ring", x, y, t: 0.4, r0: 8, r1: 42, color });
    spawnParticles(x, y, color, 14, 90);
  }
  function burstUpgrade(x, y, color) {
    pushCombatFx({ kind: "place", x, y, t: 0.55, color });
    pushCombatFx({ kind: "ring", x, y, t: 0.5, r0: 10, r1: 56, color: "#ffb34a" });
    spawnParticles(x, y, color, 20, 110);
    spawnParticles(x, y, "#ffb34a", 10, 70);
    addShake(0.55);
  }

  const COACH_STEPS = [
    "Tap Turret below, then tap stone beside the glowing rift.",
    "Great — tap your tower, then socket an element (Fire / Water / Earth / Wind).",
    "Use the speed button (1×→1.5×→2×→3×→5×) when waves feel slow. Survive!",
  ];
  function showCoach(step) {
    if (settings.tutorialDone || !els.coach) return;
    if (step >= COACH_STEPS.length) {
      hideCoach(true);
      return;
    }
    settings.coachStep = step;
    saveJSON(STORAGE.settings, settings);
    els.coachText.textContent = COACH_STEPS[step];
    els.coach.classList.remove("hidden");
  }
  function hideCoach(done) {
    if (!els.coach) return;
    els.coach.classList.add("hidden");
    if (done) {
      settings.tutorialDone = true;
      settings.coachStep = COACH_STEPS.length;
      saveJSON(STORAGE.settings, settings);
    }
  }
  function advanceCoach(fromStep) {
    if (settings.tutorialDone) return;
    if (settings.coachStep === fromStep) showCoach(fromStep + 1);
  }

  function resize() {
    const wrap = $("stage-wrap");
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.max(260, Math.floor(rect.width));
    const cssH = Math.max(320, Math.floor(rect.height));
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.w = cssW; state.h = cssH;
    if (state.seed) {
      state.path = generatePath(state.seed, state.w, state.h);
      for (const t of state.towers) {
        if (t.nx != null) { t.x = t.nx * state.w; t.y = t.ny * state.h; }
      }
    }
  }

  function serializeRun() {
    return {
      seed: state.seed, difficulty: state.difficulty || "normal",
      hp: state.hp, scrap: state.scrap, score: state.score, wave: state.wave,
      betweenWaves: state.betweenWaves, spawnTimer: state.spawnTimer, spawnQueue: state.spawnQueue,
      towers: state.towers.map((t) => ({
        type: t.type, nx: t.x / state.w, ny: t.y / state.h,
        level: t.level, cooldown: t.cooldown, elements: t.elements || [],
      })),
      enemies: state.enemies.map((e) => ({
        type: e.type, dist: e.dist, hp: e.hp, maxHp: e.maxHp, speed: e.speed,
        slow: e.slow, slowT: e.slowT, burn: e.burn, burnT: e.burnT,
        chillT: e.chillT, shred: e.shred, knockCd: e.knockCd || 0, reward: e.reward, tags: e.tags,
        resist: e.resist, bossIndex: e.bossIndex, bossTotal: e.bossTotal, color: e.color, r: e.r,
      })),
      paused: state.mode === "paused", savedAt: Date.now(),
    };
  }
  function saveRun() {
    if (!state.seed || state.mode === "hub" || state.mode === "over") {
      localStorage.removeItem(STORAGE.run); return;
    }
    saveJSON(STORAGE.run, serializeRun());
  }
  function clearRun() { localStorage.removeItem(STORAGE.run); }
  function hasSavedRun() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE.run) || "null");
      return !!(data && data.seed);
    } catch { return false; }
  }
  function hydrateTower(t) {
    const stats = towerStats(t.type);
    const level = t.level || 1;
    return {
      type: t.type, x: t.nx * state.w, y: t.ny * state.h, nx: t.nx, ny: t.ny,
      level, cooldown: t.cooldown || 0, elements: [...(t.elements || [])],
      ...stats,
      damage: stats.damage * (1 + (level - 1) * 0.35),
      range: stats.range * (1 + (level - 1) * 0.1),
      fireRate: stats.fireRate * Math.max(0.5, 1 - (level - 1) * 0.05),
      splash: stats.splash ? stats.splash * (1 + (level - 1) * 0.12) : 0,
      aim: typeof t.aim === "number" ? t.aim : -Math.PI / 2,
      recoil: 0,
    };
  }
  function loadRun() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE.run) || "null");
      if (!data || !data.seed) return false;
      state.seed = data.seed;
      state.difficulty = data.difficulty || "normal";
      meta.selectedDifficulty = state.difficulty;
      state.path = generatePath(state.seed, state.w, state.h);
      state.hp = data.hp; state.scrap = data.scrap; state.score = data.score; state.wave = data.wave;
      state.betweenWaves = data.betweenWaves || 0;
      state.spawnTimer = data.spawnTimer || 0;
      state.spawnQueue = data.spawnQueue || [];
      state.towers = (data.towers || []).map(hydrateTower);
      state.enemies = (data.enemies || []).map((e) => {
        const def = ENEMY[e.type] || ENEMY.drone;
        return {
          ...def, type: e.type, dist: e.dist, hp: e.hp, maxHp: e.maxHp,
          speed: e.speed || def.speed, tags: e.tags || def.tags,
          color: e.color || def.color, r: e.r || def.r,
          resist: e.resist || { ...(def.resist || {}) },
          bossIndex: e.bossIndex || 0, bossTotal: e.bossTotal || 1,
          slow: e.slow || 1, slowT: e.slowT || 0, burn: e.burn || 0, burnT: e.burnT || 0,
          chillT: e.chillT || 0, shred: e.shred || 0, knockCd: e.knockCd || 0, reward: e.reward, alive: true, hitFlash: 0,
        };
      });
      state.projectiles = []; state.fx = []; state.particles = [];
      state.selectedBuilt = null; state.selectedTower = null;
      state.mode = "paused";
      return true;
    } catch { return false; }
  }

  function startNewRun() {
    syncDifficultyUnlocks();
    if (!isDifficultyUnlocked(meta.selectedDifficulty)) meta.selectedDifficulty = "normal";
    state.difficulty = meta.selectedDifficulty || "normal";
    state.seed = newRunSeed();
    state.path = generatePath(state.seed, state.w, state.h);
    const diff = currentDiff();
    state.hp = diff.id === "nightmare" ? 15 : diff.id === "hard" ? 18 : 20;
    state.scrap = diff.id === "nightmare" ? 100 : 120;
    state.score = 0; state.wave = 0;
    state.towers = []; state.enemies = []; state.projectiles = []; state.fx = []; state.particles = [];
    state.spawnQueue = []; state.spawnTimer = 0; state.betweenWaves = 1.2;
    state.selectedBuilt = null; state.selectedTower = null;
    state.shake = 0; state.flash = 0;
    state.mode = "playing";
    showScreen(null);
    showBanner(diff.name.toUpperCase() + " RUN");
    sfx.start();
    saveJSON(STORAGE.meta, meta);
    saveRun(); updateHUD();
    if (!settings.tutorialDone) showCoach(0);
  }
  function continueRun() {
    resize();
    if (!loadRun()) { toast("No saved run"); return; }
    showScreen("pause"); updateHUD();
  }
  function endRun(abandoned) {
    const wave = state.wave, score = state.score;
    const diff = DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal;
    const chips = Math.floor((abandoned ? wave * 3 + score / 60 : wave * 6 + score / 28) * diff.chipMul);
    meta.chips += Math.max(0, chips);
    if (!meta.bestByDifficulty[diff.id]) meta.bestByDifficulty[diff.id] = { wave: 0, score: 0 };
    const rec = meta.bestByDifficulty[diff.id];
    if (wave > rec.wave) rec.wave = wave;
    if (score > rec.score) rec.score = score;
    const newly = [];
    for (const id of Object.keys(DIFFICULTIES)) {
      if (!meta.unlockedDifficulties[id] && isDifficultyUnlocked(id)) {
        meta.unlockedDifficulties[id] = true;
        newly.push(DIFFICULTIES[id].name);
      }
    }
    saveJSON(STORAGE.meta, meta);
    if (wave > best.wave) best.wave = wave;
    if (score > best.score) best.score = score;
    saveJSON(STORAGE.best, best);
    clearRun();
    state.mode = "over";
    hideCoach(false);
    els.overSummary.textContent = `${diff.name} · Wave ${wave} · Score ${score}` + (abandoned ? " (abandoned)" : "");
    els.overChips.textContent = `+${Math.max(0, chips)} chips` + (newly.length ? ` · Unlocked ${newly.join(", ")}!` : "");
    showScreen("over"); refreshHub();
    sfx.over();
    addShake(1.1);
  }

  function showScreen(name) {
    els.hub.classList.toggle("hidden", name !== "hub");
    els.upgrades.classList.toggle("hidden", name !== "upgrades");
    els.pause.classList.toggle("hidden", name !== "pause");
    els.over.classList.toggle("hidden", name !== "over");
    els.codex.classList.toggle("hidden", name !== "codex");
    if (els.settings) els.settings.classList.toggle("hidden", name !== "settings");
  }

  function refreshHub() {
    meta = loadJSON(STORAGE.meta, defaultMeta());
    if (!meta.unlockedDifficulties) meta.unlockedDifficulties = { normal: true };
    if (!meta.bestByDifficulty) meta.bestByDifficulty = defaultMeta().bestByDifficulty;
    syncDifficultyUnlocks();
    best = loadJSON(STORAGE.best, defaultBest());
    const diffId = meta.selectedDifficulty || "normal";
    const rec = meta.bestByDifficulty[diffId] || { wave: 0, score: 0 };
    els.bestWave.textContent = String(rec.wave || best.wave || 0);
    els.bestScore.textContent = String(rec.score || best.score || 0);
    els.chips.textContent = String(meta.chips);
    els.btnContinue.classList.toggle("hidden", !hasSavedRun());
    syncMuteUI();
    syncSpeedUI();
    renderDifficultyPicks();
  }
  function syncMuteUI() {
    if (!els.btnMute) return;
    els.btnMute.setAttribute("aria-label", settings.muted ? "Unmute" : "Mute");
    els.btnMute.title = settings.muted ? "Unmute" : "Mute";
    els.btnMute.style.opacity = settings.muted ? "0.55" : "1";
  }

  function saveSettings() {
    saveJSON(STORAGE.settings, settings);
  }

  function renderSettings() {
    const wrap = $("shake-picks");
    if (wrap) {
      wrap.innerHTML = "";
      const labels = { off: "Off", low: "Low", med: "Med", high: "High" };
      for (const id of SHAKE_LEVELS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "shake-btn" + (settings.shake === id ? " active" : "");
        btn.textContent = labels[id];
        btn.setAttribute("aria-pressed", settings.shake === id ? "true" : "false");
        btn.addEventListener("click", () => {
          settings.shake = id;
          if (id === "off") state.shake = 0;
          saveSettings();
          renderSettings();
          sfx.ui();
          toast("Shake " + labels[id]);
        });
        wrap.appendChild(btn);
      }
    }
    const bindToggle = (id, key) => {
      const el = $(id);
      if (!el) return;
      el.checked = settings[key] !== false;
      el.onchange = () => {
        settings[key] = !!el.checked;
        if (key === "particles" && !settings.particles) state.particles = [];
        if (key === "combatFx" && !settings.combatFx) {
          state.fx = state.fx.filter((f) => f.kind === "beam" || f.kind === "text");
        }
        if (key === "screenFlash" && !settings.screenFlash) state.flash = 0;
        if (key === "hitFlash" && !settings.hitFlash) {
          for (const e of state.enemies) e.hitFlash = 0;
        }
        saveSettings();
        sfx.ui();
      };
    };
    bindToggle("opt-particles", "particles");
    bindToggle("opt-hitflash", "hitFlash");
    bindToggle("opt-screenflash", "screenFlash");
    bindToggle("opt-combatfx", "combatFx");
  }

  let settingsReturnScreen = "hub";
  function openSettings(from) {
    settingsReturnScreen = from || "hub";
    if (state.mode === "playing") {
      state.mode = "paused";
      saveRun();
      settingsReturnScreen = "pause";
    }
    renderSettings();
    showScreen("settings");
  }
  function closeSettings() {
    if (settingsReturnScreen === "pause" && state.seed) {
      state.mode = "paused";
      showScreen("pause");
    } else {
      state.mode = "hub";
      showScreen("hub");
      refreshHub();
    }
  }
  function renderDifficultyPicks() {
    const wrap = $("diff-picks");
    const hint = $("diff-hint");
    if (!wrap) return;
    wrap.innerHTML = "";
    for (const id of ["normal", "hard", "nightmare"]) {
      const def = DIFFICULTIES[id];
      const unlocked = isDifficultyUnlocked(id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "diff-btn" + (meta.selectedDifficulty === id ? " active" : "") + (!unlocked ? " locked" : "");
      btn.innerHTML = unlocked ? def.name : `${def.name}<span class="lock">Locked</span>`;
      btn.addEventListener("click", () => {
        if (!unlocked) { hint.textContent = unlockHint(id); toast(unlockHint(id)); return; }
        meta.selectedDifficulty = id; saveJSON(STORAGE.meta, meta); refreshHub();
      });
      wrap.appendChild(btn);
    }
    const sel = DIFFICULTIES[meta.selectedDifficulty] || DIFFICULTIES.normal;
    hint.textContent = isDifficultyUnlocked(meta.selectedDifficulty)
      ? `${sel.name}: ×${sel.hpMul.toFixed(2)} HP · ×${sel.speedMul.toFixed(2)} spd · ×${sel.chipMul} chips`
      : unlockHint(meta.selectedDifficulty);
  }

  function updateHUD() {
    els.hp.textContent = String(Math.max(0, state.hp));
    els.scrap.textContent = String(Math.floor(state.scrap));
    const dShort = ({ normal: "N", hard: "H", nightmare: "NM" })[state.difficulty] || "N";
    els.wave.textContent = `${dShort} · Wave ${Math.max(1, state.wave)}`;
    els.score.textContent = String(Math.floor(state.score));
    refreshTowerButtons();
    updateInspect();
  }
  function refreshTowerButtons() {
    document.querySelectorAll(".tower-btn").forEach((btn) => {
      const type = btn.dataset.tower;
      const cost = towerStats(type).cost;
      btn.querySelector(".tb-cost").textContent = String(cost);
      btn.classList.toggle("unaffordable", state.scrap < cost);
      btn.setAttribute("aria-pressed", state.selectedTower === type ? "true" : "false");
    });
  }
  function upgradeCost(t) {
    return Math.floor(BASE_TOWER[t.type].cost * (0.5 + t.level * 0.42));
  }
  function elementCost(t) {
    return (t.elements && t.elements.length) ? ELEMENT_SECOND_COST : ELEMENTS.fire.cost;
  }

  function updateInspect() {
    const sel = state.selectedBuilt != null ? state.towers[state.selectedBuilt] : null;
    if (!sel || state.mode !== "playing") {
      els.inspect.classList.add("hidden");
      return;
    }
    els.inspect.classList.remove("hidden");
    const elsList = sel.elements || [];
    const matchTip = elsList.length
      ? `<span class="match-tip">Sockets deal × resist on each foe — check Codex matchups.</span><br>`
      : `<span class="match-tip">Socket elements: enemies resist / weaken specific ones.</span><br>`;
    els.inspectText.innerHTML =
      `<strong>${BASE_TOWER[sel.type].name}</strong> Lv${sel.level} · ${BASE_TOWER[sel.type].blurb}<br>` +
      matchTip +
      `${describeCombo(elsList)} · socket ${elsList.length}/${MAX_ELEMENTS}` +
      (elsList.length < MAX_ELEMENTS ? ` · next ${elementCost(sel)} scrap` : "");
    els.btnSell.disabled = false;
    els.btnUpgrade.disabled = state.scrap < upgradeCost(sel);
    els.btnUpgrade.textContent = `Up ${upgradeCost(sel)}`;
    document.querySelectorAll(".el-btn").forEach((btn) => {
      const el = btn.dataset.el;
      const owned = elsList.includes(el);
      const full = elsList.length >= MAX_ELEMENTS;
      btn.classList.toggle("active", owned);
      btn.disabled = owned || (full && !owned) || state.scrap < elementCost(sel);
      btn.textContent = owned ? el[0].toUpperCase() + el.slice(1) + " ✓" : el[0].toUpperCase() + el.slice(1);
    });
  }

  function showBanner(text) {
    const b = els.banner;
    b.textContent = text;
    b.classList.remove("hidden");
    requestAnimationFrame(() => b.classList.add("show"));
    clearTimeout(showBanner._t);
    showBanner._t = setTimeout(() => {
      b.classList.remove("show");
      setTimeout(() => b.classList.add("hidden"), 280);
    }, 1200);
  }
  function toast(text) {
    const t = els.toast;
    t.textContent = text;
    t.classList.remove("hidden");
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.classList.add("hidden"), 200);
    }, 1400);
  }

  let upgradeTab = "turret";
  function renderUpgrades() {
    meta = loadJSON(STORAGE.meta, defaultMeta());
    els.chipsUp.textContent = `${meta.chips} chips`;
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === upgradeTab));
    const list = els.upgradeList;
    list.innerHTML = "";
    for (const u of UPGRADE_TREES[upgradeTab]) {
      const owned = !!meta.owned[u.id];
      const reqOk = !u.req || !!meta.owned[u.req];
      const row = document.createElement("div");
      row.className = "up-row" + (owned ? " owned" : "") + (!reqOk && !owned ? " locked" : "");
      row.innerHTML = `<div><h3>${u.name}</h3><p>${u.desc}${u.req && !reqOk ? " · needs prior node" : ""}</p></div>`;
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "buy-btn";
      if (owned) { btn.textContent = "Owned"; btn.disabled = true; }
      else {
        btn.textContent = `${u.cost}`;
        btn.disabled = !reqOk || meta.chips < u.cost;
        btn.addEventListener("click", () => {
          if (meta.owned[u.id] || meta.chips < u.cost || (u.req && !meta.owned[u.req])) return;
          meta.chips -= u.cost; meta.owned[u.id] = true;
          saveJSON(STORAGE.meta, meta); sfx.buy();
          renderUpgrades(); refreshHub();
        });
      }
      row.appendChild(btn); list.appendChild(row);
    }
  }

  function beginWave() {
    state.wave += 1;
    const plan = wavePlan(state.seed, state.wave, state.difficulty);
    state.spawnQueue = [];
    for (const pack of plan.mix) {
      for (let i = 0; i < pack.n; i++) {
        state.spawnQueue.push({
          type: pack.type, difficulty: plan.difficulty,
          speedMul: plan.speedMul, rewardMul: plan.rewardMul,
          bossIndex: pack.bossIndex, bossTotal: pack.bossTotal, bossHpShare: pack.bossHpShare,
        });
      }
    }
    state.spawnTimer = 0.35; state.betweenWaves = 0;
    const diffName = (DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal).name;
    let banner = `${diffName.toUpperCase()} ${state.wave}`;
    if (plan.bossN > 1) banner = `BOSSES ×${plan.bossN} · ${state.wave}`;
    else if (plan.isBoss) banner = `BOSS ${state.wave}`;
    if (livingBossCount() > 0 && plan.isBoss) banner = `OVERLAP · ${banner}`;
    showBanner(banner);
    sfx.wave();
    saveRun();
  }
  const BOSS_TINTS = ["#e85d4c", "#e8883a", "#c44a2a", "#ffb34a", "#a84838"];
  function spawnEnemy(type, difficulty, speedMul = 1, rewardMul = 1, meta = {}) {
    const def = ENEMY[type] || ENEMY.drone;
    const bossTotal = meta.bossTotal || 1;
    const bossIndex = meta.bossIndex || 0;
    const hpShare = type === "boss" ? (meta.bossHpShare || (bossTotal <= 1 ? 1 : 0.7 + 0.3 / bossTotal)) : 1;
    const bossScale = type === "boss" ? (1 + state.wave * 0.04) * hpShare : 1;
    const hp = Math.floor(def.hp * difficulty * bossScale);
    const jitter = 0.95 + (hashSeed(state.seed + type + state.enemies.length) % 100) / 500;
    // Multi-boss packs move a touch slower so they stay readable on the rift.
    const packSlow = type === "boss" && bossTotal > 1 ? Math.max(0.78, 1 - (bossTotal - 1) * 0.07) : 1;
    const color = type === "boss" ? BOSS_TINTS[bossIndex % BOSS_TINTS.length] : def.color;
    const r = type === "boss" && bossTotal > 1 ? def.r * (0.9 + (bossIndex % 3) * 0.04) : def.r;
    state.enemies.push({
      type, dist: 0, hp, maxHp: hp,
      speed: def.speed * jitter * speedMul * packSlow,
      reward: Math.floor(def.reward * (0.9 + difficulty * 0.05) * rewardMul * (type === "boss" && bossTotal > 1 ? 0.85 : 1)),
      r, color, shape: def.shape, tags: [...def.tags],
      resist: { ...(def.resist || {}) },
      bossIndex, bossTotal,
      slow: 1, slowT: 0, burn: 0, burnT: 0, chillT: 0, shred: 0, knockCd: 0, alive: true, hitFlash: 0,
    });
  }

  function placeTower(x, y) {
    const type = state.selectedTower;
    if (!type || !state.path) return;
    const stats = towerStats(type);
    if (state.scrap < stats.cost) { toast("Not enough scrap"); return; }
    if (distToPath(state.path, x, y) < 28) { toast("Too close to the rift"); return; }
    if (x < 16 || y < 16 || x > state.w - 16 || y > state.h - 16) return;
    for (const t of state.towers) {
      if (Math.hypot(t.x - x, t.y - y) < 36) { toast("Too close to another tower"); return; }
    }
    state.scrap -= stats.cost;
    state.towers.push({
      type, x, y, nx: x / state.w, ny: y / state.h,
      level: 1, cooldown: 0, elements: [], ...stats,
      aim: -Math.PI / 2, recoil: 0,
    });
    burstPlace(x, y, stats.color);
    sfx.place();
    state.selectedTower = null;
    updateHUD(); saveRun();
    advanceCoach(0);
  }

  function canTarget(tower, enemy) {
    const flying = enemy.tags.includes("flying");
    if (flying && !tower.hitsAir) return false;
    if (!flying && !tower.hitsGround) return false;
    return true;
  }

  function findTarget(tower, enemies) {
    let bestE = null;
    for (const e of enemies) {
      if (!e.alive || !canTarget(tower, e)) continue;
      const p = posOnPath(state.path, e.dist);
      const d = Math.hypot(p.x - tower.x, p.y - tower.y);
      if (d <= tower.range && e.dist > (bestE ? bestE.dist : -1)) bestE = e;
    }
    return bestE;
  }

  function damageMultiplier(tower, enemy) {
    const elsArr = tower.elements || [];
    const has = (e) => elsArr.includes(e);
    const key = comboKey(elsArr);
    let mul = 1;
    const flying = enemy.tags.includes("flying");
    const armored = enemy.tags.includes("armored");
    const swarm = enemy.tags.includes("swarm");

    if (tower.airBonus && flying) mul *= tower.airBonus;
    if (tower.armorPenalty && armored) mul *= tower.armorPenalty;

    if (key === "earth+wind") {
      if (tower.armorPenalty && armored) mul /= tower.armorPenalty;
      if (flying) mul *= 1.25;
      if (armored) mul *= 1.25;
    } else {
      if (has("earth") && armored) mul *= 1.45;
      if (has("earth") && flying) mul *= 0.55;
      if (has("wind") && flying) mul *= 1.5;
      if (has("wind") && armored) mul *= 0.7;
      if (has("fire") && swarm) mul *= 1.25;
      if (has("fire") && armored) mul *= 0.85;
    }

    // Per-enemy elemental resists / weaknesses (matchups).
    mul *= elementResistMul(enemy, elsArr);

    if (enemy.shred > 0) mul *= 1 + Math.min(0.5, enemy.shred);
    if (key === "water+wind" && enemy.chillT > 0) mul *= 1.75;
    return mul;
  }

  function applyOnHitEffects(tower, enemy, dealt) {
    const elsArr = tower.elements || [];
    const has = (e) => elsArr.includes(e);
    const key = comboKey(elsArr);
    const p = posOnPath(state.path, enemy.dist);
    const r = enemyResist(enemy);
    const resistFactor = (el) => {
      const v = r[el] == null ? 1 : r[el];
      // Map resist curve into status potency (resists weaken, weaknesses strengthen).
      return Math.max(0.25, Math.min(1.6, v));
    };

    if (has("fire") || tower.burn) {
      const rf = resistFactor("fire");
      const burn = ((has("fire") ? 8 : 0) + (tower.burn || 0)) * rf;
      enemy.burn = Math.max(enemy.burn, burn);
      enemy.burnT = Math.max(enemy.burnT, (key === "fire+wind" ? 3.2 : 2.2) * Math.min(1.25, rf));
    }
    if (has("water")) {
      const rf = resistFactor("water");
      const heavy = key === "earth+water";
      const baseSlow = heavy ? 0.35 : 0.55;
      // Higher resist → slower effect closer to 1 (less slow).
      const slowAmt = 1 - (1 - baseSlow) * rf;
      enemy.slow = Math.min(enemy.slow, Math.min(0.92, Math.max(0.25, slowAmt)));
      enemy.slowT = Math.max(enemy.slowT, (heavy ? 2.2 : 1.5) * Math.min(1.25, rf));
      enemy.chillT = Math.max(enemy.chillT, (heavy ? 2.2 : 1.5) * Math.min(1.25, rf));
    } else if (tower.slow) {
      enemy.slow = Math.min(enemy.slow, tower.slow);
      enemy.slowT = Math.max(enemy.slowT, tower.slowDur || 1.2);
    }
    if (has("earth") && key !== "earth+wind") {
      const rf = resistFactor("earth");
      enemy.shred = Math.min(0.5, (enemy.shred || 0) + 0.12 * rf);
    }
    if (has("wind")) {
      // Soft knockback with per-enemy ICD so multi-hit towers can't stunlock.
      const kbCd = enemy.knockCd || 0;
      const rf = resistFactor("wind");
      if (kbCd <= 0 && rf > 0.35) {
        const push = (key === "earth+wind" ? 7 : 4) * rf;
        enemy.dist = Math.max(0, enemy.dist - push);
        enemy.knockCd = key === "earth+wind" ? 0.85 : 1.1;
      }
    }

    if (key === "fire+water") {
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = posOnPath(state.path, e.dist);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 42) {
          e.hp -= dealt * 0.35;
          e.slow = Math.min(e.slow, 0.7);
          e.slowT = Math.max(e.slowT, 0.6);
          if (e.hp <= 0) killEnemy(e);
        }
      }
      pushCombatFx({ kind: "blast", x: p.x, y: p.y, t: 0.3, r: 42, color: "#9ad0e8" });
      spawnParticles(p.x, p.y, "#9ad0e8", 8, 70);
    }
    if (key === "fire+wind" && enemy.burnT > 0) {
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = posOnPath(state.path, e.dist);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 55) {
          e.burn = Math.max(e.burn, 6);
          e.burnT = Math.max(e.burnT, 1.8);
        }
      }
    }
  }

  function killEnemy(e, opts = {}) {
    if (!e.alive) return;
    e.alive = false;
    const p = posOnPath(state.path, e.dist);
    state.scrap += e.reward;
    state.score += e.reward * 2 + Math.floor(state.wave);
    pushCombatFx({ kind: "pop", x: p.x, y: p.y, t: 0.4, color: e.color });
    spawnParticles(p.x, p.y, e.color, e.type === "boss" ? 28 : 12, e.type === "boss" ? 140 : 90);
    if (e.type === "boss") addShake(1.15);
    else addShake(0.22);
    sfx.kill();

    if (opts.magma) {
      for (const o of state.enemies) {
        if (!o.alive) continue;
        const q = posOnPath(state.path, o.dist);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 50) {
          o.hp -= opts.magma;
          o.burn = Math.max(o.burn, 5);
          o.burnT = Math.max(o.burnT, 1.5);
          if (o.hp <= 0) killEnemy(o);
        }
      }
      pushCombatFx({ kind: "blast", x: p.x, y: p.y, t: 0.4, r: 50, color: "#e85d4c" });
      spawnParticles(p.x, p.y, "#e85d4c", 16, 100);
    }
  }

  function damageEnemy(e, amount, tower, opts = {}) {
    if (!e.alive) return 0;
    let dmg = amount * damageMultiplier(tower, e);
    if (opts.critChance && Math.random() < opts.critChance) {
      dmg *= 2;
      const p = posOnPath(state.path, e.dist);
      state.fx.push({ kind: "text", x: p.x, y: p.y - 14, t: 0.5, text: "CRIT", color: "#ffb34a" });
      addShake(0.4);
    }
    if (comboKey(tower.elements || []) === "water+wind" && e.chillT > 0) {
      const p = posOnPath(state.path, e.dist);
      state.fx.push({ kind: "text", x: p.x, y: p.y - 18, t: 0.45, text: "SHATTER", color: "#4db8c4" });
    }
    e.hp -= dmg;
    if (settings.hitFlash !== false) e.hitFlash = 0.12;
    applyOnHitEffects(tower, e, dmg);
    const p = posOnPath(state.path, e.dist);
    pushCombatFx({ kind: "spark", x: p.x, y: p.y, t: 0.28, color: opts.color || tower.color });
    spawnParticles(p.x, p.y, opts.color || tower.color, 4, 55);
    sfx.hit();
    if (e.hp <= 0) {
      const magma = comboKey(tower.elements || []) === "earth+fire" ? dmg * 0.9 : 0;
      killEnemy(e, { magma });
    }
    return dmg;
  }

  function fireTower(tower, target) {
    const p = posOnPath(state.path, target.dist);
    const elsArr = tower.elements || [];
    const tint = elsArr.length ? ELEMENTS[elsArr[0]].color : tower.color;
    tower.aim = Math.atan2(p.y - tower.y, p.x - tower.x);
    tower.recoil = 1;

    if (tower.type === "mortar") {
      state.projectiles.push({
        kind: "shell", x: tower.x, y: tower.y, tx: p.x, ty: p.y,
        t: 0, dur: 0.45, damage: tower.damage, splash: tower.splash || 42,
        tower, color: tint,
      });
    } else if (tower.type === "coil") {
      damageEnemy(target, tower.damage, tower, { color: tint });
      state.fx.push({ kind: "beam", x: tower.x, y: tower.y, x2: p.x, y2: p.y, t: 0.12, color: tint });
      if (tower.chain) {
        let second = null, bestD = Infinity;
        for (const e of state.enemies) {
          if (!e.alive || e === target || !canTarget(tower, e)) continue;
          const q = posOnPath(state.path, e.dist);
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < 70 && d < bestD) { bestD = d; second = e; }
        }
        if (second) {
          const q = posOnPath(state.path, second.dist);
          damageEnemy(second, tower.damage * 0.7, tower, { color: tint });
          state.fx.push({ kind: "beam", x: p.x, y: p.y, x2: q.x, y2: q.y, t: 0.1, color: tint });
        }
      }
    } else {
      state.projectiles.push({
        kind: "bolt", x: tower.x, y: tower.y, tx: p.x, ty: p.y,
        t: 0, dur: 0.12, target, damage: tower.damage,
        critChance: tower.crit || 0, tower, color: tint,
      });
    }
    sfx.shoot(tower.type);
  }

  function update(dt) {
    if (state.mode !== "playing" || !state.path) {
      if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 18);
      if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
      return;
    }
    const speed = normalizeSpeed(settings.gameSpeed);
    const step = dt * speed;
    state.time += step; state.frame++;

    if (state.betweenWaves > 0) {
      state.betweenWaves -= step;
      if (state.betweenWaves <= 0) beginWave();
    }

    if (state.spawnQueue.length) {
      state.spawnTimer -= step;
      const plan = wavePlan(state.seed, Math.max(1, state.wave), state.difficulty);
      if (state.spawnTimer <= 0) {
        const next = state.spawnQueue.shift();
        spawnEnemy(next.type, next.difficulty, next.speedMul || 1, next.rewardMul || 1, next);
        if (next.type === "boss") {
          // Space bosses along the path so packs don't stack into one blob.
          state.spawnTimer = plan.interval * (3.2 + (next.bossIndex || 0) * 0.75);
        } else {
          state.spawnTimer = plan.interval * (next.type === "swarm" ? 0.35 : 1);
        }
      }
    } else if (state.betweenWaves <= 0 && canAdvanceWave() && state.wave > 0) {
      // Keep living bosses when overlapping; drop only corpses.
      state.enemies = state.enemies.filter((e) => e.alive);
      state.betweenWaves = livingBossCount() > 0 ? 1.4 : 2.2;
      state.scrap += 28 + state.wave * 4;
      saveRun();
    }

    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (e.hitFlash > 0) e.hitFlash -= step;
      if (e.knockCd > 0) e.knockCd -= step;
      if (e.slowT > 0) { e.slowT -= step; if (e.slowT <= 0) e.slow = 1; }
      if (e.chillT > 0) e.chillT -= step;
      if (e.burnT > 0) {
        e.burnT -= step;
        e.hp -= e.burn * step;
        if (Math.random() < step * 8) {
          const p = posOnPath(state.path, e.dist);
          spawnParticles(p.x, p.y, "#e85d4c", 1, 30);
        }
        if (e.hp <= 0) killEnemy(e);
      }
      e.dist += e.speed * e.slow * step;
      if (e.dist >= state.path.total) {
        e.alive = false;
        state.hp -= e.type === "boss" ? 5 : 1;
        pushCombatFx({ kind: "leak", t: 0.5 });
        triggerScreenFlash(0.18);
        addShake(0.95);
        sfx.leak();
        if (state.hp <= 0) { state.hp = 0; updateHUD(); endRun(false); return; }
      }
    }

    for (const tower of state.towers) {
      if (tower.recoil > 0) tower.recoil = Math.max(0, tower.recoil - step * 4.5);
      const track = findTarget(tower, state.enemies);
      if (track) {
        const tp = posOnPath(state.path, track.dist);
        const want = Math.atan2(tp.y - tower.y, tp.x - tower.x);
        let dAim = want - (tower.aim || 0);
        while (dAim > Math.PI) dAim -= Math.PI * 2;
        while (dAim < -Math.PI) dAim += Math.PI * 2;
        tower.aim = (tower.aim || 0) + dAim * Math.min(1, step * 10);
      }
      tower.cooldown -= step;
      if (tower.cooldown > 0) continue;
      const target = findTarget(tower, state.enemies);
      if (target) { fireTower(tower, target); tower.cooldown = tower.fireRate; }
    }

    for (const p of state.projectiles) {
      p.t += step;
      const u = Math.min(1, p.t / p.dur);
      if (p.kind === "bolt") {
        if (u >= 1) {
          if (p.target && p.target.alive) {
            damageEnemy(p.target, p.damage, p.tower, { critChance: p.critChance, color: p.color });
          }
          p.dead = true;
        }
      } else if (p.kind === "shell") {
        if (u >= 1) {
          for (const e of state.enemies) {
            if (!e.alive || !canTarget(p.tower, e)) continue;
            const q = posOnPath(state.path, e.dist);
            if (Math.hypot(q.x - p.tx, q.y - p.ty) <= p.splash) {
              damageEnemy(e, p.damage, p.tower, { color: p.color });
            }
          }
          pushCombatFx({ kind: "blast", x: p.tx, y: p.ty, t: 0.35, r: p.splash, color: p.color });
          spawnParticles(p.tx, p.ty, p.color, 18, 120);
          addShake(0.5);
          p.dead = true;
        }
      }
    }
    state.projectiles = state.projectiles.filter((p) => !p.dead);

    for (const f of state.fx) f.t -= step;
    state.fx = state.fx.filter((f) => f.t > 0);

    for (const p of state.particles) {
      p.life -= step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vy += 90 * step;
    }
    state.particles = state.particles.filter((p) => p.life > 0);

    if (state.shake > 0) state.shake = Math.max(0, state.shake - step * 16);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - step);

    if (state.frame % 45 === 0) saveRun();
    if (state.frame % 10 === 0) updateHUD();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawField() {
    const w = state.w, h = state.h;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1c1612");
    g.addColorStop(0.4, "#141812");
    g.addColorStop(1, "#0e100c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // moss / stone texture dots
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 97 + 13) % 100) / 100 * w;
      const sy = ((i * 53 + 29) % 100) / 100 * h;
      ctx.fillStyle = i % 3 === 0 ? "#6fbf8a" : "#2a241c";
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5 + (i % 4) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // heat shimmer lines
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#e85a2a";
    for (let i = 0; i < 6; i++) {
      const y = ((i * 97 + state.time * 18) % (h + 40)) - 20;
      ctx.fillRect(0, y, w, 1.5);
    }
    ctx.globalAlpha = 1;
  }

  function drawRiftPath() {
    if (!state.path) return;
    const pts = state.path.points;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // cooled stone banks
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 38;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();

    ctx.strokeStyle = "#2a241c";
    ctx.lineWidth = 32;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();

    // molten channel
    const glow = ctx.createLinearGradient(0, 0, 0, state.h);
    glow.addColorStop(0, "#ffb34a");
    glow.addColorStop(0.5, "#e85a2a");
    glow.addColorStop(1, "#7a2210");
    ctx.strokeStyle = glow;
    ctx.lineWidth = 14;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.globalAlpha = 1;

    // bright core
    ctx.strokeStyle = "rgba(255, 220, 140, 0.85)";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();

    // ember dashes
    ctx.save();
    ctx.setLineDash([6, 14]);
    ctx.lineDashOffset = -state.time * 28;
    ctx.strokeStyle = "rgba(255, 179, 74, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();

    const start = pts[0], end = pts[pts.length - 1];
    // spawn vent
    ctx.fillStyle = "rgba(77, 184, 196, 0.35)";
    ctx.beginPath(); ctx.arc(start.x, start.y, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(77, 184, 196, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(start.x, start.y, 13 + Math.sin(state.time * 3) * 2, 0, Math.PI * 2); ctx.stroke();

    // wellheart
    const threatened = state.hp <= 5;
    ctx.fillStyle = threatened ? "#e85d4c" : "#e8883a";
    roundRect(end.x - 18, end.y - 14, 36, 28, 8); ctx.fill();
    ctx.fillStyle = "#1a1008";
    ctx.beginPath(); ctx.arc(end.x, end.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = threatened ? "#ffb4ab" : "#ffb34a";
    ctx.beginPath(); ctx.arc(end.x, end.y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a1008";
    ctx.font = "bold 9px Avenir Next, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("WELL", end.x, end.y + 22);
  }

  function drawGhostPlacement() {
    if (!state.ghost || !state.selectedTower || !state.path) return;
    const { x, y, ok } = state.ghost;
    const stats = towerStats(state.selectedTower);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(x, y, stats.range, 0, Math.PI * 2);
    ctx.strokeStyle = ok ? "rgba(255,179,74,0.5)" : "rgba(232,93,76,0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = ok ? stats.color : "#e85d4c";
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function pulseSafe(e) {
    return Math.sin(state.time * 3 + (e.dist || 0) * 0.05) * 2;
  }

  function drawTower(t, selected) {
    ctx.save();
    ctx.translate(t.x, t.y);
    const aim = typeof t.aim === "number" ? t.aim : -Math.PI / 2;
    const recoil = t.recoil || 0;
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 4 + t.x * 0.05);

    if (selected) {
      ctx.strokeStyle = "rgba(255,179,74,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 22 + Math.sin(state.time * 5) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ground pad shadow + basalt ring
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(0, 12, 16, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const pad = ctx.createRadialGradient(0, 4, 2, 0, 6, 16);
    pad.addColorStop(0, "#3a2e24");
    pad.addColorStop(0.7, "#1c1612");
    pad.addColorStop(1, "rgba(14,12,10,0)");
    ctx.fillStyle = pad;
    ctx.beginPath();
    ctx.ellipse(0, 8, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    if (t.type === "turret") {
      const body = ctx.createLinearGradient(-12, -10, 12, 12);
      body.addColorStop(0, "#5a3a22");
      body.addColorStop(0.45, "#2a1a12");
      body.addColorStop(1, "#8a4a22");
      ctx.fillStyle = body;
      roundRect(-12, -6, 24, 16, 5); ctx.fill();
      ctx.strokeStyle = "rgba(255,179,74,0.25)";
      ctx.lineWidth = 1;
      roundRect(-12, -6, 24, 16, 5); ctx.stroke();

      ctx.fillStyle = "#c4a35a";
      [[-9, 2], [9, 2], [-9, 8], [9, 8]].forEach(([rx, ry]) => {
        ctx.beginPath(); ctx.arc(rx, ry, 1.4, 0, Math.PI * 2); ctx.fill();
      });

      ctx.save();
      ctx.rotate(aim);
      ctx.translate(-recoil * 3.5, 0);

      const house = ctx.createLinearGradient(0, -8, 0, 8);
      house.addColorStop(0, "#e8a050");
      house.addColorStop(0.5, "#a85828");
      house.addColorStop(1, "#4a2410");
      ctx.fillStyle = house;
      roundRect(-8, -7, 14, 14, 3); ctx.fill();

      const lens = ctx.createRadialGradient(-2, -1, 0.5, -2, 0, 4);
      lens.addColorStop(0, "#fff2c8");
      lens.addColorStop(0.4, "#ffb34a");
      lens.addColorStop(1, "#5a2010");
      ctx.fillStyle = lens;
      ctx.beginPath(); ctx.arc(-2, 0, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(26,16,8,0.55)";
      ctx.lineWidth = 1; ctx.stroke();

      const barrel = ctx.createLinearGradient(4, -5, 22, 5);
      barrel.addColorStop(0, "#ffb34a");
      barrel.addColorStop(0.5, "#e8883a");
      barrel.addColorStop(1, "#6a3010");
      ctx.fillStyle = barrel;
      roundRect(4, -5.5, 16, 4, 1.5); ctx.fill();
      roundRect(4, 1.5, 16, 4, 1.5); ctx.fill();
      ctx.fillStyle = "#1a1008";
      ctx.fillRect(19, -4.5, 2.5, 2);
      ctx.fillRect(19, 2.5, 2.5, 2);
      if (recoil > 0.15) {
        ctx.globalAlpha = recoil;
        ctx.fillStyle = "#ffe08a";
        ctx.beginPath(); ctx.arc(22, 0, 3 + recoil * 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      ctx.strokeStyle = `rgba(232,93,76,${0.25 + pulse * 0.35})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-6, 10); ctx.lineTo(-6, 14);
      ctx.moveTo(0, 10); ctx.lineTo(0, 15);
      ctx.moveTo(6, 10); ctx.lineTo(6, 14);
      ctx.stroke();

    } else if (t.type === "mortar") {
      ctx.strokeStyle = "#3a4a38";
      ctx.lineWidth = 3.5;
      ctx.lineCap = "round";
      [[-12, 14], [12, 14], [0, 16]].forEach(([lx, ly], i) => {
        ctx.beginPath();
        ctx.moveTo(i === 2 ? 0 : (i ? 6 : -6), 6);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.fillStyle = "#6fbf8a";
        ctx.beginPath(); ctx.arc(lx, ly, 2.2, 0, Math.PI * 2); ctx.fill();
      });

      const plate = ctx.createRadialGradient(-2, 2, 1, 0, 4, 13);
      plate.addColorStop(0, "#5a7a58");
      plate.addColorStop(0.55, "#2a3a28");
      plate.addColorStop(1, "#141c14");
      ctx.fillStyle = plate;
      ctx.beginPath(); ctx.arc(0, 4, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(111,191,138,0.45)";
      ctx.lineWidth = 1.5; ctx.stroke();

      const bob = Math.sin(state.time * 2.2) * 0.04;
      ctx.save();
      ctx.rotate(aim * 0.15 - 0.65 + bob - recoil * 0.2);
      const tube = ctx.createLinearGradient(-6, 0, 6, 0);
      tube.addColorStop(0, "#1a2418");
      tube.addColorStop(0.35, "#6fbf8a");
      tube.addColorStop(0.55, "#c8f0d0");
      tube.addColorStop(1, "#2a4a30");
      ctx.fillStyle = tube;
      roundRect(-5, -20, 10, 26, 4); ctx.fill();
      ctx.fillStyle = "rgba(26,16,8,0.45)";
      ctx.fillRect(-5, -12, 10, 2);
      ctx.fillRect(-5, -2, 10, 2);
      const muzzle = ctx.createRadialGradient(0, -20, 0, 0, -20, 5);
      muzzle.addColorStop(0, "#0a120a");
      muzzle.addColorStop(0.6, "#2a3a28");
      muzzle.addColorStop(1, "#6fbf8a");
      ctx.fillStyle = muzzle;
      ctx.beginPath(); ctx.arc(0, -20, 4.5, 0, Math.PI * 2); ctx.fill();
      if (recoil > 0.2) {
        ctx.globalAlpha = recoil * 0.8;
        ctx.fillStyle = "#b8f5c8";
        ctx.beginPath(); ctx.arc(0, -24, 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      ctx.fillStyle = "#243024";
      roundRect(-4, 6, 8, 7, 2); ctx.fill();
      ctx.fillStyle = `rgba(111,191,138,${0.4 + pulse * 0.4})`;
      ctx.fillRect(-2, 8, 4, 3);

    } else {
      const spin = state.time * 2.8;
      ctx.save();
      const chassis = ctx.createLinearGradient(-14, -14, 14, 14);
      chassis.addColorStop(0, "#2a4850");
      chassis.addColorStop(0.5, "#0e1c22");
      chassis.addColorStop(1, "#4db8c4");
      ctx.fillStyle = chassis;
      ctx.beginPath();
      ctx.moveTo(0, -15); ctx.lineTo(14, 0); ctx.lineTo(0, 15); ctx.lineTo(-14, 0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(168,238,245,0.55)";
      ctx.lineWidth = 1.5; ctx.stroke();

      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(9, 0); ctx.lineTo(0, 9); ctx.lineTo(-9, 0);
      ctx.closePath(); ctx.fill();

      for (let i = 0; i < 3; i++) {
        const r = 5 + i * 3.2;
        ctx.save();
        ctx.rotate(spin * (i % 2 ? 1 : -1) + i);
        ctx.strokeStyle = `rgba(77,184,196,${0.75 - i * 0.18})`;
        ctx.lineWidth = 1.6 - i * 0.3;
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const core = ctx.createRadialGradient(-1, -1, 0, 0, 0, 5);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.35, "#a8eef5");
      core.addColorStop(1, "#1a6080");
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, 0, 3.5 + pulse * 0.8, 0, Math.PI * 2); ctx.fill();

      ctx.save();
      ctx.rotate(aim);
      ctx.fillStyle = "rgba(168,238,245,0.85)";
      ctx.beginPath();
      ctx.moveTo(8, -2.5); ctx.lineTo(16 - recoil * 2, 0); ctx.lineTo(8, 2.5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.restore();
    }

    const elsArr = t.elements || [];
    elsArr.forEach((el, i) => {
      const ex = -9 + i * 18;
      const ey = -20;
      const eg = ctx.createRadialGradient(ex - 1, ey - 1, 0.5, ex, ey, 5.5);
      eg.addColorStop(0, "#fff8e8");
      eg.addColorStop(0.35, ELEMENTS[el].color);
      eg.addColorStop(1, "#1a1008");
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.moveTo(ex, ey - 5);
      ctx.lineTo(ex + 4.5, ey);
      ctx.lineTo(ex, ey + 5);
      ctx.lineTo(ex - 4.5, ey);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1; ctx.stroke();
    });
    if (t.level > 1) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      roundRect(-7, 18, 14, 11, 3); ctx.fill();
      ctx.fillStyle = "#f3ebe2";
      ctx.font = "bold 9px Avenir Next, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("L" + t.level, 0, 23.5);
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
  }

  function drawEnemy(e, x, y) {
    ctx.save();
    ctx.translate(x, y);
    const flash = e.hitFlash > 0;
    const bob = Math.sin(state.time * (e.tags.includes("flying") ? 7 : 5) + e.dist * 0.08);
    const crawl = e.dist * 0.35;

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, e.r * 0.85, e.r * 0.9, e.r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    if (e.tags.includes("flying")) {
      ctx.strokeStyle = "rgba(126,201,160,0.4)";
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -state.time * 20;
      ctx.beginPath(); ctx.arc(0, 0, e.r + 8, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (e.slow < 1 || e.chillT > 0) {
      ctx.strokeStyle = "rgba(77,184,196,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, e.r + 5.5, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a = state.time * 3 + i * 2.1;
        ctx.fillStyle = "rgba(168,238,245,0.55)";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (e.r + 4), Math.sin(a) * (e.r + 4), 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (e.burnT > 0) {
      const bg = ctx.createRadialGradient(0, 0, e.r * 0.2, 0, 0, e.r + 6);
      bg.addColorStop(0, "rgba(255,179,74,0.35)");
      bg.addColorStop(1, "rgba(232,93,76,0)");
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(0, 0, e.r + 6, 0, Math.PI * 2); ctx.fill();
    }

    if (e.shape === "tri") {
      const flap = Math.sin(state.time * 14 + e.dist) * 0.35;
      ctx.save();
      ctx.translate(0, bob * 1.5);
      [-1, 1].forEach((side) => {
        ctx.save();
        ctx.translate(side * (e.r * 0.2), 2);
        ctx.rotate(side * (0.35 + flap));
        const wing = ctx.createLinearGradient(0, 0, side * 14, 0);
        wing.addColorStop(0, flash ? "#ffffff" : "#2a6070");
        wing.addColorStop(1, flash ? "#ffffff" : e.color);
        ctx.fillStyle = wing;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(side * 10, -6, side * 14, -1);
        ctx.quadraticCurveTo(side * 8, 4, 0, 3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      });
      const body = ctx.createLinearGradient(0, -e.r, 0, e.r);
      body.addColorStop(0, flash ? "#ffffff" : "#d8f6fa");
      body.addColorStop(0.4, flash ? "#ffffff" : e.color);
      body.addColorStop(1, flash ? "#ffffff" : "#1a3840");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(0, -e.r);
      ctx.lineTo(e.r * 0.85, e.r * 0.55);
      ctx.quadraticCurveTo(0, e.r * 0.95, -e.r * 0.85, e.r * 0.55);
      ctx.closePath(); ctx.fill();
      if (!flash) {
        const canopy = ctx.createRadialGradient(-1, -3, 0.5, 0, -2, 4);
        canopy.addColorStop(0, "#fff8c8");
        canopy.addColorStop(0.5, "#4db8c4");
        canopy.addColorStop(1, "#0a1820");
        ctx.fillStyle = canopy;
        ctx.beginPath(); ctx.ellipse(0, -2.5, 3.5, 2.8, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = `rgba(255,179,74,${0.45 + 0.35 * Math.sin(state.time * 12)})`;
      ctx.beginPath(); ctx.ellipse(0, e.r * 0.7, 3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

    } else if (e.shape === "sq") {
      ctx.save();
      ctx.translate(0, Math.abs(bob) * 0.6);
      ctx.strokeStyle = flash ? "#ffffff" : "#5a3018";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const phase = crawl + i * 1.1;
        const swing = Math.sin(phase) * 4;
        const ly = -4 + i * 5;
        ctx.beginPath();
        ctx.moveTo(-e.r * 0.7, ly);
        ctx.lineTo(-e.r - 5, ly + 4 + swing);
        ctx.moveTo(e.r * 0.7, ly);
        ctx.lineTo(e.r + 5, ly + 4 - swing);
        ctx.stroke();
      }
      const car = ctx.createLinearGradient(-e.r, -e.r, e.r, e.r);
      car.addColorStop(0, flash ? "#ffffff" : "#ffb34a");
      car.addColorStop(0.45, flash ? "#ffffff" : e.color);
      car.addColorStop(1, flash ? "#ffffff" : "#3a1808");
      ctx.fillStyle = car;
      roundRect(-e.r, -e.r * 0.7, e.r * 2, e.r * 1.45, 5); ctx.fill();
      if (!flash) {
        ctx.fillStyle = "rgba(26,16,8,0.35)";
        roundRect(-e.r * 0.25, -e.r * 0.55, e.r * 0.5, e.r * 1.15, 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,179,74,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-e.r * 0.6, -2); ctx.lineTo(e.r * 0.6, -2);
        ctx.moveTo(-e.r * 0.5, 4); ctx.lineTo(e.r * 0.5, 4);
        ctx.stroke();
        ctx.fillStyle = "#1a1008";
        ctx.beginPath(); ctx.arc(-3.5, -e.r * 0.35, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(3.5, -e.r * 0.35, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffb34a";
        ctx.beginPath(); ctx.arc(-3.5, -e.r * 0.35, 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(3.5, -e.r * 0.35, 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = flash ? "#ffffff" : "#8a4020";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-4, -e.r * 0.7); ctx.quadraticCurveTo(-8, -e.r - 2, -2, -e.r - 1);
      ctx.moveTo(4, -e.r * 0.7); ctx.quadraticCurveTo(8, -e.r - 2, 2, -e.r - 1);
      ctx.stroke();
      ctx.restore();

    } else if (e.shape === "hex") {
      ctx.save();
      ctx.translate(0, bob * 0.4);
      const drawHex = (r, fill) => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      drawHex(e.r + 1.5, flash ? "#ffffff" : "#5a5248");
      const plate = ctx.createLinearGradient(-e.r, -e.r, e.r, e.r);
      plate.addColorStop(0, flash ? "#ffffff" : "#d8d0c4");
      plate.addColorStop(0.5, flash ? "#ffffff" : e.color);
      plate.addColorStop(1, flash ? "#ffffff" : "#3a3830");
      drawHex(e.r, plate);
      if (!flash) {
        drawHex(e.r * 0.55, "#2a2824");
        const gem = ctx.createRadialGradient(-1, -1, 0, 0, 0, e.r * 0.35);
        gem.addColorStop(0, "#fff0c0");
        gem.addColorStop(0.4, "#e8883a");
        gem.addColorStop(1, "#3a1808");
        drawHex(e.r * 0.35, gem);
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
          ctx.stroke();
        }
        ctx.fillStyle = "#c4a35a";
        [-1, 1].forEach((s) => {
          ctx.beginPath();
          ctx.moveTo(s * e.r * 0.7, -e.r * 0.2);
          ctx.lineTo(s * (e.r + 5), -e.r * 0.55);
          ctx.lineTo(s * e.r * 0.55, e.r * 0.1);
          ctx.closePath(); ctx.fill();
        });
      }
      ctx.restore();

    } else if (e.shape === "boss") {
      ctx.save();
      ctx.translate(0, bob * 0.5);
      const aura = ctx.createRadialGradient(0, 0, e.r * 0.3, 0, 0, e.r + 10);
      aura.addColorStop(0, "rgba(232,93,76,0.35)");
      aura.addColorStop(1, "rgba(232,93,76,0)");
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(0, 0, e.r + 10 + pulseSafe(e), 0, Math.PI * 2); ctx.fill();

      if (!flash) {
        ctx.fillStyle = "#3a1008";
        [-1, 1].forEach((s) => {
          ctx.beginPath();
          ctx.moveTo(s * e.r * 0.55, -e.r * 0.5);
          ctx.lineTo(s * e.r * 0.9, -e.r - 8);
          ctx.lineTo(s * e.r * 0.25, -e.r * 0.55);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#e85d4c";
          ctx.beginPath();
          ctx.moveTo(s * e.r * 0.7, -e.r * 0.7);
          ctx.lineTo(s * e.r * 0.85, -e.r - 6);
          ctx.lineTo(s * e.r * 0.45, -e.r * 0.75);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#3a1008";
        });
      }

      const hide = ctx.createLinearGradient(-e.r, -e.r, e.r, e.r);
      hide.addColorStop(0, flash ? "#ffffff" : "#ff8a70");
      hide.addColorStop(0.4, flash ? "#ffffff" : e.color);
      hide.addColorStop(1, flash ? "#ffffff" : "#2a0808");
      ctx.fillStyle = hide;
      roundRect(-e.r, -e.r * 0.6, e.r * 2, e.r * 1.35, 8); ctx.fill();

      if (!flash) {
        ctx.fillStyle = "rgba(26,8,8,0.45)";
        ctx.fillRect(-e.r + 2, -e.r * 0.15, e.r * 2 - 4, 5);
        ctx.fillRect(-e.r + 4, e.r * 0.25, e.r * 2 - 8, 4);
        const maw = ctx.createRadialGradient(0, 2, 1, 0, 2, e.r * 0.45);
        maw.addColorStop(0, "#ffe08a");
        maw.addColorStop(0.4, "#e85d4c");
        maw.addColorStop(1, "#1a0808");
        ctx.fillStyle = maw;
        roundRect(-e.r * 0.4, -4, e.r * 0.8, 12, 3); ctx.fill();
        ctx.fillStyle = "#ffb34a";
        ctx.fillRect(-e.r * 0.55, -e.r * 0.35, 6, 2.5);
        ctx.fillRect(e.r * 0.55 - 6, -e.r * 0.35, 6, 2.5);
        ctx.fillStyle = "#8a3020";
        roundRect(-e.r - 2, -e.r * 0.35, 8, 14, 2); ctx.fill();
        roundRect(e.r - 6, -e.r * 0.35, 8, 14, 2); ctx.fill();
      }
      ctx.restore();

    } else {
      ctx.save();
      const n = 4;
      for (let i = 0; i < n; i++) {
        const a = state.time * 5 + i * (Math.PI * 2 / n) + e.dist * 0.1;
        const rr = e.r * (0.55 + 0.2 * Math.sin(state.time * 3 + i));
        const mx = Math.cos(a) * rr;
        const my = Math.sin(a) * rr * 0.7 + bob;
        const mg = ctx.createRadialGradient(mx - 1, my - 1, 0, mx, my, e.r * 0.55);
        mg.addColorStop(0, flash ? "#ffffff" : "#e8ffe8");
        mg.addColorStop(0.5, flash ? "#ffffff" : e.color);
        mg.addColorStop(1, flash ? "#ffffff" : "rgba(20,40,20,0.2)");
        ctx.fillStyle = mg;
        ctx.beginPath(); ctx.arc(mx, my, e.r * 0.55, 0, Math.PI * 2); ctx.fill();
      }
      const nuc = ctx.createRadialGradient(-1, -1, 0, 0, 0, e.r * 0.7);
      nuc.addColorStop(0, flash ? "#ffffff" : "#ffffff");
      nuc.addColorStop(0.4, flash ? "#ffffff" : e.color);
      nuc.addColorStop(1, flash ? "#ffffff" : "#1a2a18");
      ctx.fillStyle = nuc;
      ctx.beginPath(); ctx.arc(0, bob * 0.3, e.r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    const pct = Math.max(0, e.hp / e.maxHp);
    const barW = Math.max(18, e.r * 1.6);
    const barY = -e.r - 11;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(-barW / 2, barY, barW, 4, 1.5); ctx.fill();
    const hg = ctx.createLinearGradient(-barW / 2, 0, barW / 2, 0);
    hg.addColorStop(0, pct < 0.3 ? "#e85d4c" : "#4a9a60");
    hg.addColorStop(1, pct < 0.3 ? "#ffb4ab" : "#6fbf8a");
    ctx.fillStyle = hg;
    roundRect(-barW / 2, barY, barW * pct, 4, 1.5); ctx.fill();

    // Element resist pips (filled = resists, hollow-ish bright = weak)
    const resist = enemyResist(e);
    const pipEls = ["fire", "water", "earth", "wind"].filter((el) => {
      const v = resist[el];
      return v != null && (v <= 0.85 || v >= 1.15);
    });
    if (pipEls.length) {
      const pipW = pipEls.length * 7;
      pipEls.forEach((el, i) => {
        const px = -pipW / 2 + i * 7 + 3;
        const py = barY - 6;
        const v = resist[el];
        ctx.fillStyle = ELEMENTS[el].color;
        ctx.globalAlpha = v <= 0.85 ? 0.95 : 0.55;
        ctx.beginPath();
        if (v <= 0.85) {
          ctx.rect(px - 2.2, py - 2.2, 4.4, 4.4);
        } else {
          ctx.moveTo(px, py - 3);
          ctx.lineTo(px + 2.6, py + 2.2);
          ctx.lineTo(px - 2.6, py + 2.2);
          ctx.closePath();
        }
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }

    if (e.type === "boss" && (e.bossTotal || 1) > 1) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      roundRect(-8, e.r + 2, 16, 10, 3); ctx.fill();
      ctx.fillStyle = "#ffb34a";
      ctx.font = "bold 8px Avenir Next, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${(e.bossIndex || 0) + 1}/${e.bossTotal}`, 0, e.r + 7);
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
  }

  function draw() {
    const w = state.w, h = state.h;
    let ox = 0, oy = 0;
    if (state.shake > 0) {
      ox = (Math.random() - 0.5) * state.shake * 2;
      oy = (Math.random() - 0.5) * state.shake * 2;
    }
    ctx.save();
    ctx.translate(ox, oy);

    drawField();
    drawRiftPath();
    drawGhostPlacement();

    for (let i = 0; i < state.towers.length; i++) {
      const t = state.towers[i];
      if (state.selectedBuilt === i) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(243,235,226,0.16)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      drawTower(t, state.selectedBuilt === i);
    }
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const p = posOnPath(state.path, e.dist);
      drawEnemy(e, p.x, p.y);
    }
    for (const p of state.projectiles) {
      const u = Math.min(1, p.t / p.dur);
      const x = p.x + (p.tx - p.x) * u;
      const y = p.y + (p.ty - p.y) * u;
      if (p.kind === "shell") {
        const arc = Math.sin(u * Math.PI) * 36;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(x, y - arc, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath(); ctx.arc(x - 1, y - arc - 1, 2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x, y); ctx.stroke();
      }
    }

    for (const p of state.particles) {
      const a = Math.max(0, p.life / (p.max || 0.7));
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const f of state.fx) {
      const a = Math.max(0, f.t);
      if (f.kind === "spark") {
        ctx.globalAlpha = Math.min(1, a * 4); ctx.fillStyle = f.color;
        for (let i = 0; i < 5; i++) {
          const ang = i * 1.3 + a * 8;
          ctx.fillRect(f.x + Math.cos(ang) * (10 - a * 20), f.y + Math.sin(ang) * (10 - a * 20), 2, 2);
        }
        ctx.globalAlpha = 1;
      } else if (f.kind === "pop") {
        ctx.globalAlpha = a * 2; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, (1 - a) * 22, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === "blast" || f.kind === "ring") {
        const r0 = f.r0 || 0;
        const r1 = f.r1 || f.r || 40;
        const rr = r0 + (r1 - r0) * (1 - Math.min(1, a / (f.kind === "ring" ? 0.5 : 0.35)));
        ctx.globalAlpha = Math.min(1, a * 2.2);
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === "beam") {
        ctx.globalAlpha = Math.min(1, a * 8);
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === "place") {
        ctx.globalAlpha = a * 2; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, 18 + (0.5 - a) * 40, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === "text") {
        ctx.globalAlpha = Math.min(1, a * 3); ctx.fillStyle = f.color;
        ctx.font = "bold 11px Avenir Next, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(f.text, f.x, f.y - (0.5 - a) * 20); ctx.globalAlpha = 1;
      } else if (f.kind === "leak") {
        ctx.globalAlpha = a; ctx.fillStyle = "rgba(232,93,76,0.28)";
        ctx.fillRect(-ox, -oy, w + 20, h + 20); ctx.globalAlpha = 1;
      }
    }

    if (state.flash > 0 && settings.screenFlash !== false) {
      ctx.globalAlpha = Math.min(0.22, state.flash);
      ctx.fillStyle = "#e85d4c";
      ctx.fillRect(-ox, -oy, w + 20, h + 20);
      ctx.globalAlpha = 1;
    }

    if (state.seed && state.mode !== "hub") {
      ctx.globalAlpha = 0.3; ctx.fillStyle = "#f3ebe2";
      ctx.font = "9px Avenir Next, sans-serif"; ctx.textAlign = "left";
      ctx.fillText(state.seed.slice(0, 18), 8, h - 8); ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function canvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const t = evt.touches ? evt.touches[0] || evt.changedTouches[0] : evt;
    return {
      x: ((t.clientX - rect.left) / rect.width) * state.w,
      y: ((t.clientY - rect.top) / rect.height) * state.h,
    };
  }
  function placementOk(x, y) {
    if (!state.path) return false;
    if (distToPath(state.path, x, y) < 28) return false;
    if (x < 16 || y < 16 || x > state.w - 16 || y > state.h - 16) return false;
    for (const t of state.towers) {
      if (Math.hypot(t.x - x, t.y - y) < 36) return false;
    }
    return true;
  }
  function onCanvasTap(evt) {
    if (state.mode !== "playing") return;
    evt.preventDefault();
    ensureAudio();
    const { x, y } = canvasPos(evt);
    for (let i = state.towers.length - 1; i >= 0; i--) {
      const t = state.towers[i];
      if (Math.hypot(t.x - x, t.y - y) < 22) {
        state.selectedBuilt = i; state.selectedTower = null; state.ghost = null;
        updateHUD();
        if (!settings.tutorialDone && settings.coachStep === 1) {
          /* waiting for socket */
        }
        return;
      }
    }
    if (state.selectedTower) { placeTower(x, y); state.ghost = null; return; }
    state.selectedBuilt = null; updateHUD();
  }
  function onCanvasMove(evt) {
    if (state.mode !== "playing" || !state.selectedTower) { state.ghost = null; return; }
    const { x, y } = canvasPos(evt);
    state.ghost = { x, y, ok: placementOk(x, y) };
  }
  canvas.addEventListener("pointerdown", onCanvasTap, { passive: false });
  canvas.addEventListener("pointermove", onCanvasMove, { passive: true });

  document.querySelectorAll(".tower-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.mode !== "playing") return;
      ensureAudio();
      const type = btn.dataset.tower;
      state.selectedTower = state.selectedTower === type ? null : type;
      state.selectedBuilt = null;
      if (!state.selectedTower) state.ghost = null;
      updateHUD();
      sfx.ui();
    });
  });

  document.querySelectorAll(".el-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.selectedBuilt == null || state.mode !== "playing") return;
      const t = state.towers[state.selectedBuilt];
      const el = btn.dataset.el;
      if (!t.elements) t.elements = [];
      if (t.elements.includes(el)) return;
      if (t.elements.length >= MAX_ELEMENTS) { toast("Max 2 elements"); return; }
      const cost = elementCost(t);
      if (state.scrap < cost) { toast("Need more scrap"); return; }
      state.scrap -= cost;
      t.elements.push(el);
      burstPlace(t.x, t.y, ELEMENTS[el].color);
      toast(describeCombo(t.elements));
      sfx.socket();
      updateHUD(); saveRun();
      advanceCoach(1);
    });
  });

  els.btnSell.addEventListener("click", () => {
    if (state.selectedBuilt == null) return;
    const t = state.towers[state.selectedBuilt];
    const elBonus = (t.elements || []).length * 15;
    state.scrap += Math.floor((t.sell || 30) * (0.7 + t.level * 0.15) + elBonus * 0.5);
    spawnParticles(t.x, t.y, t.color, 10, 70);
    state.towers.splice(state.selectedBuilt, 1);
    state.selectedBuilt = null; updateHUD(); saveRun();
    sfx.ui();
  });
  els.btnUpgrade.addEventListener("click", () => {
    if (state.selectedBuilt == null) return;
    const t = state.towers[state.selectedBuilt];
    const cost = upgradeCost(t);
    if (state.scrap < cost) { toast("Need more scrap"); return; }
    state.scrap -= cost; t.level += 1;
    const base = towerStats(t.type);
    t.damage = base.damage * (1 + (t.level - 1) * 0.35);
    t.range = base.range * (1 + (t.level - 1) * 0.1);
    t.fireRate = base.fireRate * Math.max(0.5, 1 - (t.level - 1) * 0.05);
    if (base.splash) t.splash = base.splash * (1 + (t.level - 1) * 0.12);
    Object.assign(t, {
      hitsAir: base.hitsAir, hitsGround: base.hitsGround,
      airBonus: base.airBonus, armorPenalty: base.armorPenalty,
      slow: base.slow, slowDur: base.slowDur, crit: base.crit, burn: base.burn, chain: base.chain,
    });
    burstUpgrade(t.x, t.y, t.color);
    sfx.upgrade();
    updateHUD(); saveRun();
  });

  els.btnPause.addEventListener("click", () => {
    if (state.mode === "playing") { state.mode = "paused"; saveRun(); showScreen("pause"); }
    else if (state.mode === "paused") { state.mode = "playing"; showScreen(null); }
  });
  $("btn-resume").addEventListener("click", () => {
    if (!state.seed) loadRun();
    state.mode = "playing"; showScreen(null); saveRun();
  });
  els.btnMute.addEventListener("click", () => {
    settings.muted = !settings.muted; saveJSON(STORAGE.settings, settings);
    syncMuteUI();
    if (!settings.muted) sfx.ui();
  });
  if (els.btnSpeed) {
    els.btnSpeed.addEventListener("click", () => {
      ensureAudio();
      cycleSpeed();
      if (!settings.tutorialDone && settings.coachStep === 2) advanceCoach(2);
    });
  }
  if ($("btn-coach-skip")) {
    $("btn-coach-skip").addEventListener("click", () => hideCoach(true));
  }

  $("btn-play").addEventListener("click", () => { clearRun(); resize(); startNewRun(); });
  $("btn-continue").addEventListener("click", continueRun);
  $("btn-upgrades").addEventListener("click", () => { showScreen("upgrades"); renderUpgrades(); });
  $("btn-upgrades-back").addEventListener("click", () => { showScreen("hub"); refreshHub(); });
  if ($("btn-settings")) $("btn-settings").addEventListener("click", () => openSettings("hub"));
  if ($("btn-pause-settings")) $("btn-pause-settings").addEventListener("click", () => openSettings("pause"));
  if ($("btn-settings-back")) $("btn-settings-back").addEventListener("click", () => closeSettings());
  $("btn-to-hub").addEventListener("click", () => { saveRun(); state.mode = "hub"; showScreen("hub"); refreshHub(); hideCoach(false); });
  $("btn-abandon").addEventListener("click", () => endRun(true));
  $("btn-again").addEventListener("click", () => { clearRun(); resize(); startNewRun(); });
  $("btn-over-hub").addEventListener("click", () => { state.mode = "hub"; showScreen("hub"); refreshHub(); });
  $("btn-codex").addEventListener("click", () => {
    if (state.mode === "playing") { state.mode = "paused"; saveRun(); }
    showScreen("codex");
  });
  $("btn-codex-back").addEventListener("click", () => {
    if (els.settings && !els.settings.classList.contains("hidden")) return closeSettings();
    if (state.seed && hasSavedRun() && state.mode === "paused") showScreen("pause");
    else if (state.mode === "hub" || !state.seed) { state.mode = "hub"; showScreen("hub"); }
    else showScreen("pause");
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => { upgradeTab = tab.dataset.tab; renderUpgrades(); });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "playing") {
      state.mode = "paused"; saveRun(); showScreen("pause");
    }
  });
  window.addEventListener("resize", () => {
    resize();
    if (state.mode === "playing" || state.mode === "paused") updateHUD();
  });

  let last = performance.now();
  let acc = 0;
  const FIXED = 1 / 60;
  function frame(now) {
    let frameDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += frameDt;
    // fixed step for buttery sim; draw every raf
    let steps = 0;
    while (acc >= FIXED && steps < 4) {
      update(FIXED);
      acc -= FIXED;
      steps++;
    }
    if (steps === 0) {
      // still decay shake when paused via tiny update
      if (state.mode !== "playing") update(frameDt);
    }
    draw();
    requestAnimationFrame(frame);
  }

  resize();
  refreshHub();
  showScreen("hub");
  syncMuteUI();
  syncSpeedUI();
  requestAnimationFrame(frame);
  window.__RD = { state, startNewRun, saveRun, loadRun, generatePath, wavePlan, ELEMENTS, settings, sfx };
})();
