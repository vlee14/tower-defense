(() => {
  "use strict";

  const STORAGE = {
    meta: "rd_meta_v1",
    settings: "rd_settings_v1",
    best: "rd_best_v1",
    run: "rd_run_v1",
  };

  const DIFFICULTIES = {
    normal: { id: "normal", name: "Normal", hpMul: 1, speedMul: 1, countMul: 1, intervalMul: 1, rewardMul: 1, chipMul: 1, unlock: null },
    hard: { id: "hard", name: "Hard", hpMul: 1.45, speedMul: 1.12, countMul: 1.2, intervalMul: 0.88, rewardMul: 1.35, chipMul: 1.5, unlock: { kind: "wave", difficulty: "normal", wave: 12 } },
    nightmare: { id: "nightmare", name: "Nightmare", hpMul: 2.1, speedMul: 1.28, countMul: 1.4, intervalMul: 0.75, rewardMul: 1.75, chipMul: 2.25, unlock: { kind: "wave", difficulty: "hard", wave: 15 } },
  };

  /* Tower archetypes: real tradeoffs */
  const BASE_TOWER = {
    turret: {
      name: "Turret", cost: 60, damage: 22, range: 78, fireRate: 0.48, sell: 30, color: "#e8a838",
      hitsAir: true, hitsGround: true, splash: 0,
      blurb: "High DPS · short range · hits air & ground",
    },
    mortar: {
      name: "Mortar", cost: 90, damage: 34, range: 125, fireRate: 1.45, splash: 48, sell: 45, color: "#6fd3b0",
      hitsAir: false, hitsGround: true,
      blurb: "AoE splash · slow · cannot hit flying",
    },
    coil: {
      name: "Coil", cost: 75, damage: 9, range: 105, fireRate: 0.65, sell: 38, color: "#5ec8e8",
      hitsAir: true, hitsGround: true, airBonus: 1.55, armorPenalty: 0.55, slow: 0.6, slowDur: 1.3,
      blurb: "Slows · anti-air · weak vs armor",
    },
  };

  const ELEMENTS = {
    fire: { id: "fire", name: "Fire", color: "#e85d4c", cost: 25 },
    water: { id: "water", name: "Water", color: "#5ec8e8", cost: 25 },
    earth: { id: "earth", name: "Earth", color: "#c4a35a", cost: 25 },
    wind: { id: "wind", name: "Wind", color: "#9ad0b0", cost: 25 },
  };
  const ELEMENT_SECOND_COST = 40;
  const MAX_ELEMENTS = 2;

  const UPGRADE_TREES = {
    turret: [
      { id: "t_dmg1", name: "Hot Rounds I", desc: "+20% damage", cost: 40, req: null, effect: { damage: 1.2 } },
      { id: "t_dmg2", name: "Hot Rounds II", desc: "+25% damage", cost: 70, req: "t_dmg1", effect: { damage: 1.25 } },
      { id: "t_dmg3", name: "AP Core", desc: "+30% damage", cost: 110, req: "t_dmg2", effect: { damage: 1.3 } },
      { id: "t_rng1", name: "Long Barrel", desc: "+15% range", cost: 50, req: null, effect: { range: 1.15 } },
      { id: "t_rng2", name: "Spotter Link", desc: "+20% range", cost: 90, req: "t_rng1", effect: { range: 1.2 } },
      { id: "t_spd1", name: "Servo Drive", desc: "+18% fire rate", cost: 55, req: null, effect: { fireRate: 0.85 } },
      { id: "t_spd2", name: "Burst Mag", desc: "+22% fire rate", cost: 95, req: "t_spd1", effect: { fireRate: 0.82 } },
      { id: "t_crit", name: "Crit Optics", desc: "18% chance ×2 damage", cost: 120, req: "t_dmg2", effect: { crit: 0.18 } },
    ],
    mortar: [
      { id: "m_dmg1", name: "HE Shells I", desc: "+20% damage", cost: 45, req: null, effect: { damage: 1.2 } },
      { id: "m_dmg2", name: "HE Shells II", desc: "+25% damage", cost: 80, req: "m_dmg1", effect: { damage: 1.25 } },
      { id: "m_splash1", name: "Wider Blast", desc: "+25% splash", cost: 60, req: null, effect: { splash: 1.25 } },
      { id: "m_splash2", name: "Cluster Cap", desc: "+30% splash", cost: 100, req: "m_splash1", effect: { splash: 1.3 } },
      { id: "m_rng1", name: "Arc Sight", desc: "+12% range", cost: 50, req: null, effect: { range: 1.12 } },
      { id: "m_spd1", name: "Fast Loader", desc: "+15% fire rate", cost: 65, req: null, effect: { fireRate: 0.87 } },
      { id: "m_burn", name: "Incendiary Base", desc: "Mild burn without Fire socket", cost: 130, req: "m_dmg1", effect: { burn: 4 } },
    ],
    coil: [
      { id: "c_dmg1", name: "Amp Coil I", desc: "+25% damage", cost: 40, req: null, effect: { damage: 1.25 } },
      { id: "c_dmg2", name: "Amp Coil II", desc: "+30% damage", cost: 75, req: "c_dmg1", effect: { damage: 1.3 } },
      { id: "c_slow1", name: "Deep Freeze", desc: "Stronger base slow", cost: 55, req: null, effect: { slow: 0.45 } },
      { id: "c_slow2", name: "Cryo Hold", desc: "Longer slow", cost: 85, req: "c_slow1", effect: { slowDur: 1.35 } },
      { id: "c_rng1", name: "Field Expand", desc: "+15% range", cost: 50, req: null, effect: { range: 1.15 } },
      { id: "c_spd1", name: "Pulse Sync", desc: "+20% fire rate", cost: 60, req: null, effect: { fireRate: 0.83 } },
      { id: "c_chain", name: "Arc Jump", desc: "Chain to 2nd target", cost: 120, req: "c_dmg1", effect: { chain: 1 } },
    ],
  };

  /* Enemy archetypes with tags */
  const ENEMY = {
    drone: { hp: 36, speed: 70, reward: 8, r: 9, color: "#5ec8e8", shape: "tri", tags: ["flying", "fast"], label: "Drone" },
    crawler: { hp: 95, speed: 40, reward: 14, r: 11, color: "#e8a838", shape: "sq", tags: ["ground"], label: "Crawler" },
    armor: { hp: 240, speed: 26, reward: 30, r: 13, color: "#9aa4ad", shape: "hex", tags: ["ground", "armored"], label: "Armor" },
    swarm: { hp: 20, speed: 82, reward: 5, r: 7, color: "#6fd3b0", shape: "dot", tags: ["ground", "swarm"], label: "Swarm" },
    boss: { hp: 980, speed: 20, reward: 90, r: 20, color: "#e85d4c", shape: "boss", tags: ["ground", "armored", "boss"], label: "Boss" },
  };

  // ---------- seeded RNG ----------
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
    return `rd-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  // ---------- storage ----------
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
  const defaultSettings = () => ({ muted: false });
  const defaultBest = () => ({ wave: 0, score: 0 });

  let meta = loadJSON(STORAGE.meta, defaultMeta());
  if (!meta.unlockedDifficulties) meta.unlockedDifficulties = { normal: true };
  if (!meta.bestByDifficulty) meta.bestByDifficulty = defaultMeta().bestByDifficulty;
  if (!meta.selectedDifficulty) meta.selectedDifficulty = "normal";
  let settings = loadJSON(STORAGE.settings, defaultSettings());
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

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const els = {
    hp: $("hp"), scrap: $("scrap"), wave: $("wave"), score: $("score"),
    banner: $("banner"), toast: $("toast"),
    hub: $("screen-hub"), upgrades: $("screen-upgrades"), pause: $("screen-pause"),
    over: $("screen-over"), codex: $("screen-codex"),
    bestWave: $("best-wave"), bestScore: $("best-score"), chips: $("chips"), chipsUp: $("chips-up"),
    btnContinue: $("btn-continue"), upgradeList: $("upgrade-list"),
    overSummary: $("over-summary"), overChips: $("over-chips"),
    btnMute: $("btn-mute"), btnPause: $("btn-pause"),
    btnSell: $("btn-sell"), btnUpgrade: $("btn-upgrade"),
    inspect: $("inspect"), inspectText: $("inspect-text"),
  };

  let audioCtx = null;
  function beep(freq, dur, type = "square", gain = 0.03) {
    if (settings.muted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = gain;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur);
    } catch { /* ignore */ }
  }

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

  // ---------- procedural path ----------
  function generatePath(seed, w, h) {
    const rng = mulberry32(hashSeed(seed + ":path"));
    const padX = w * 0.12, padY = h * 0.08;
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

  function wavePlan(seed, wave, diffId) {
    const diff = DIFFICULTIES[diffId] || DIFFICULTIES.normal;
    const rng = mulberry32(hashSeed(seed + ":wave:" + wave + ":" + diff.id));
    const difficulty = (1 + (wave - 1) * 0.18) * diff.hpMul;
    const count = Math.min(48, Math.floor((6 + Math.floor(wave * 1.4 + rng() * 3)) * diff.countMul));
    const interval = Math.max(0.22, (0.95 - wave * 0.03 + (rng() - 0.5) * 0.12) * diff.intervalMul);
    const mix = [];
    const isBoss = wave % 10 === 0;
    if (isBoss) mix.push({ type: "boss", n: 1 + Math.floor(wave / 20) });
    const weights = {
      drone: 0.4 + rng() * 0.15,
      crawler: 0.28,
      armor: Math.min(0.4, 0.08 + wave * 0.02 + (diff.id === "nightmare" ? 0.08 : 0)),
      swarm: wave >= 3 ? 0.22 + rng() * 0.12 : 0,
    };
    let left = count - (isBoss ? mix[0].n : 0);
    while (left > 0) {
      const r = rng();
      let type = "drone";
      const sum = weights.drone + weights.crawler + weights.armor + weights.swarm;
      let acc = weights.drone / sum;
      if (r > acc) { acc += weights.crawler / sum; type = r <= acc ? "crawler" : type; }
      if (r > acc) { acc += weights.armor / sum; type = r <= acc ? "armor" : type; }
      if (r > acc) type = "swarm";
      const n = type === "swarm" ? Math.min(left, 3 + Math.floor(rng() * 4)) : Math.min(left, 1 + Math.floor(rng() * 3));
      mix.push({ type, n });
      left -= n;
    }
    for (let i = mix.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [mix[i], mix[j]] = [mix[j], mix[i]];
    }
    return { count, interval, mix, difficulty, isBoss, speedMul: diff.speedMul, rewardMul: diff.rewardMul };
  }

  const state = {
    mode: "hub", seed: null, difficulty: "normal", path: null,
    w: 390, h: 620, hp: 20, scrap: 120, score: 0, wave: 0,
    selectedTower: null, selectedBuilt: null,
    towers: [], enemies: [], projectiles: [], fx: [],
    spawnQueue: [], spawnTimer: 0, betweenWaves: 0, time: 0, frame: 0,
  };

  function resize() {
    const wrap = $("stage-wrap");
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.max(280, rect.width);
    const cssH = Math.max(360, rect.height);
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
        chillT: e.chillT, shred: e.shred, reward: e.reward, tags: e.tags,
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
      damage: stats.damage * (1 + (level - 1) * 0.25),
      range: stats.range * (1 + (level - 1) * 0.08),
      fireRate: stats.fireRate * Math.max(0.55, 1 - (level - 1) * 0.04),
      splash: stats.splash ? stats.splash * (1 + (level - 1) * 0.1) : 0,
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
          slow: e.slow || 1, slowT: e.slowT || 0, burn: e.burn || 0, burnT: e.burnT || 0,
          chillT: e.chillT || 0, shred: e.shred || 0, reward: e.reward, alive: true,
        };
      });
      state.projectiles = []; state.fx = [];
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
    state.towers = []; state.enemies = []; state.projectiles = []; state.fx = [];
    state.spawnQueue = []; state.spawnTimer = 0; state.betweenWaves = 1.2;
    state.selectedBuilt = null; state.selectedTower = null;
    state.mode = "playing";
    showScreen(null);
    showBanner(diff.name.toUpperCase() + " RUN");
    beep(440, 0.08, "triangle", 0.04);
    saveJSON(STORAGE.meta, meta);
    saveRun(); updateHUD();
  }
  function continueRun() {
    resize();
    if (!loadRun()) { toast("No saved run"); return; }
    showScreen("pause"); updateHUD();
  }
  function endRun(abandoned) {
    const wave = state.wave, score = state.score;
    const diff = DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal;
    const chips = Math.floor((abandoned ? wave * 2 + score / 80 : wave * 4 + score / 40) * diff.chipMul);
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
    els.overSummary.textContent = `${diff.name} · Wave ${wave} · Score ${score}` + (abandoned ? " (abandoned)" : "");
    els.overChips.textContent = `+${Math.max(0, chips)} chips` + (newly.length ? ` · Unlocked ${newly.join(", ")}!` : "");
    showScreen("over"); refreshHub();
    beep(180, 0.2, "sawtooth", 0.04);
  }

  function showScreen(name) {
    els.hub.classList.toggle("hidden", name !== "hub");
    els.upgrades.classList.toggle("hidden", name !== "upgrades");
    els.pause.classList.toggle("hidden", name !== "pause");
    els.over.classList.toggle("hidden", name !== "over");
    els.codex.classList.toggle("hidden", name !== "codex");
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
    els.btnMute.textContent = settings.muted ? "🔇" : "🔊";
    renderDifficultyPicks();
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
    return Math.floor(BASE_TOWER[t.type].cost * (0.7 + t.level * 0.55));
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
    els.inspectText.innerHTML =
      `<strong>${BASE_TOWER[sel.type].name}</strong> Lv${sel.level} · ${BASE_TOWER[sel.type].blurb}<br>` +
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
          saveJSON(STORAGE.meta, meta); beep(660, 0.07, "triangle", 0.04);
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
        });
      }
    }
    state.spawnTimer = 0.35; state.betweenWaves = 0;
    const diffName = (DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal).name;
    showBanner(plan.isBoss ? `BOSS ${state.wave}` : `${diffName.toUpperCase()} ${state.wave}`);
    beep(520, 0.1, "square", 0.035);
    saveRun();
  }
  function spawnEnemy(type, difficulty, speedMul = 1, rewardMul = 1) {
    const def = ENEMY[type] || ENEMY.drone;
    const hp = Math.floor(def.hp * difficulty * (type === "boss" ? 1 + state.wave * 0.05 : 1));
    const jitter = 0.95 + (hashSeed(state.seed + type + state.enemies.length) % 100) / 500;
    state.enemies.push({
      type, dist: 0, hp, maxHp: hp,
      speed: def.speed * jitter * speedMul,
      reward: Math.floor(def.reward * (0.9 + difficulty * 0.05) * rewardMul),
      r: def.r, color: def.color, shape: def.shape, tags: [...def.tags],
      slow: 1, slowT: 0, burn: 0, burnT: 0, chillT: 0, shred: 0, alive: true,
    });
  }

  function placeTower(x, y) {
    const type = state.selectedTower;
    if (!type || !state.path) return;
    const stats = towerStats(type);
    if (state.scrap < stats.cost) { toast("Not enough scrap"); return; }
    if (distToPath(state.path, x, y) < 28) { toast("Too close to runway"); return; }
    if (x < 16 || y < 16 || x > state.w - 16 || y > state.h - 16) return;
    for (const t of state.towers) {
      if (Math.hypot(t.x - x, t.y - y) < 36) { toast("Too close to another tower"); return; }
    }
    state.scrap -= stats.cost;
    state.towers.push({
      type, x, y, nx: x / state.w, ny: y / state.h,
      level: 1, cooldown: 0, elements: [], ...stats,
    });
    state.fx.push({ kind: "place", x, y, t: 0.45, color: stats.color });
    beep(700, 0.06, "triangle", 0.04);
    state.selectedTower = null;
    updateHUD(); saveRun();
  }

  function canTarget(tower, enemy) {
    const flying = enemy.tags.includes("flying");
    if (flying && !tower.hitsAir) return false;
    if (!flying && !tower.hitsGround) return false;
    return true;
  }

  function findTarget(tower, enemies) {
    let best = null;
    for (const e of enemies) {
      if (!e.alive || !canTarget(tower, e)) continue;
      const p = posOnPath(state.path, e.dist);
      const d = Math.hypot(p.x - tower.x, p.y - tower.y);
      if (d <= tower.range && e.dist > (best ? best.dist : -1)) best = e;
    }
    return best;
  }

  function damageMultiplier(tower, enemy) {
    const els = tower.elements || [];
    const has = (e) => els.includes(e);
    const key = comboKey(els);
    let mul = 1;
    const flying = enemy.tags.includes("flying");
    const armored = enemy.tags.includes("armored");
    const swarm = enemy.tags.includes("swarm");

    // tower archetype modifiers
    if (tower.airBonus && flying) mul *= tower.airBonus;
    if (tower.armorPenalty && armored) mul *= tower.armorPenalty;

    // single / combo modifiers
    if (key === "earth+wind") {
      // Tempest: ignore air/armor penalties, bonus to both
      if (tower.armorPenalty && armored) mul /= tower.armorPenalty;
      if (flying) mul *= 1.25;
      if (armored) mul *= 1.25;
    } else {
      if (has("earth") && armored) mul *= 1.45;
      if (has("earth") && flying) mul *= 0.55; // earth shrugs flying unless tempest
      if (has("wind") && flying) mul *= 1.5;
      if (has("wind") && armored) mul *= 0.7;
      if (has("fire") && swarm) mul *= 1.25;
      if (has("fire") && armored) mul *= 0.85;
    }

    if (enemy.shred > 0) mul *= 1 + Math.min(0.5, enemy.shred);

    // Storm shatter: big bonus vs chilled
    if (key === "water+wind" && enemy.chillT > 0) mul *= 1.75;

    return mul;
  }

  function applyOnHitEffects(tower, enemy, dealt) {
    const els = tower.elements || [];
    const has = (e) => els.includes(e);
    const key = comboKey(els);
    const p = posOnPath(state.path, enemy.dist);

    // singles
    if (has("fire") || tower.burn) {
      const burn = (has("fire") ? 8 : 0) + (tower.burn || 0);
      enemy.burn = Math.max(enemy.burn, burn);
      enemy.burnT = Math.max(enemy.burnT, key === "fire+wind" ? 3.2 : 2.2);
    }
    if (has("water") || (tower.slow && tower.type === "coil" && !els.length)) {
      // water chill; coil also slows baseline
    }
    if (has("water")) {
      const heavy = key === "earth+water";
      enemy.slow = Math.min(enemy.slow, heavy ? 0.35 : 0.55);
      enemy.slowT = Math.max(enemy.slowT, heavy ? 2.2 : 1.5);
      enemy.chillT = Math.max(enemy.chillT, heavy ? 2.2 : 1.5);
    } else if (tower.slow) {
      enemy.slow = Math.min(enemy.slow, tower.slow);
      enemy.slowT = Math.max(enemy.slowT, tower.slowDur || 1.2);
    }
    if (has("earth") && key !== "earth+wind") {
      enemy.shred = Math.min(0.5, (enemy.shred || 0) + 0.12);
    }
    if (has("wind")) {
      enemy.dist = Math.max(0, enemy.dist - (key === "earth+wind" ? 18 : 10));
    }

    // combos
    if (key === "fire+water") {
      // Steam AoE
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
      state.fx.push({ kind: "blast", x: p.x, y: p.y, t: 0.3, r: 42, color: "#9ad0e8" });
    }
    if (key === "fire+wind" && enemy.burnT > 0) {
      // Wildfire spread
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
    state.fx.push({ kind: "pop", x: p.x, y: p.y, t: 0.4, color: e.color });
    beep(320 + Math.random() * 80, 0.04, "square", 0.025);

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
      state.fx.push({ kind: "blast", x: p.x, y: p.y, t: 0.4, r: 50, color: "#e85d4c" });
    }
  }

  function damageEnemy(e, amount, tower, opts = {}) {
    if (!e.alive) return 0;
    let dmg = amount * damageMultiplier(tower, e);
    if (opts.critChance && Math.random() < opts.critChance) {
      dmg *= 2;
      const p = posOnPath(state.path, e.dist);
      state.fx.push({ kind: "text", x: p.x, y: p.y - 14, t: 0.5, text: "CRIT", color: "#e8a838" });
    }
    if (comboKey(tower.elements || []) === "water+wind" && e.chillT > 0) {
      const p = posOnPath(state.path, e.dist);
      state.fx.push({ kind: "text", x: p.x, y: p.y - 18, t: 0.45, text: "SHATTER", color: "#5ec8e8" });
    }
    e.hp -= dmg;
    applyOnHitEffects(tower, e, dmg);
    const p = posOnPath(state.path, e.dist);
    state.fx.push({ kind: "spark", x: p.x, y: p.y, t: 0.28, color: opts.color || tower.color });
    if (e.hp <= 0) {
      const magma = comboKey(tower.elements || []) === "earth+fire" ? dmg * 0.9 : 0;
      killEnemy(e, { magma });
    }
    return dmg;
  }

  function fireTower(tower, target) {
    const p = posOnPath(state.path, target.dist);
    const els = tower.elements || [];
    const tint = els.length ? ELEMENTS[els[0]].color : tower.color;

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
        let second = null, best = Infinity;
        for (const e of state.enemies) {
          if (!e.alive || e === target || !canTarget(tower, e)) continue;
          const q = posOnPath(state.path, e.dist);
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < 70 && d < best) { best = d; second = e; }
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
    beep(tower.type === "mortar" ? 140 : 880, 0.03, "square", 0.02);
  }

  function update(dt) {
    if (state.mode !== "playing" || !state.path) return;
    state.time += dt; state.frame++;

    if (state.betweenWaves > 0) {
      state.betweenWaves -= dt;
      if (state.betweenWaves <= 0) beginWave();
    }

    if (state.spawnQueue.length) {
      state.spawnTimer -= dt;
      const plan = wavePlan(state.seed, Math.max(1, state.wave), state.difficulty);
      if (state.spawnTimer <= 0) {
        const next = state.spawnQueue.shift();
        spawnEnemy(next.type, next.difficulty, next.speedMul || 1, next.rewardMul || 1);
        state.spawnTimer = plan.interval * (next.type === "swarm" ? 0.35 : 1);
      }
    } else if (state.betweenWaves <= 0 && state.enemies.every((e) => !e.alive) && state.wave > 0) {
      state.enemies = [];
      state.betweenWaves = 2.2;
      state.scrap += 15 + state.wave * 2;
      saveRun();
    }

    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 1; }
      if (e.chillT > 0) e.chillT -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.hp -= e.burn * dt;
        if (e.hp <= 0) killEnemy(e);
      }
      e.dist += e.speed * e.slow * dt;
      if (e.dist >= state.path.total) {
        e.alive = false;
        state.hp -= e.type === "boss" ? 5 : 1;
        state.fx.push({ kind: "leak", t: 0.5 });
        beep(110, 0.15, "sawtooth", 0.05);
        if (state.hp <= 0) { state.hp = 0; updateHUD(); endRun(false); return; }
      }
    }

    for (const tower of state.towers) {
      tower.cooldown -= dt;
      if (tower.cooldown > 0) continue;
      const target = findTarget(tower, state.enemies);
      if (target) { fireTower(tower, target); tower.cooldown = tower.fireRate; }
    }

    for (const p of state.projectiles) {
      p.t += dt;
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
          state.fx.push({ kind: "blast", x: p.tx, y: p.ty, t: 0.35, r: p.splash, color: p.color });
          p.dead = true;
        }
      }
    }
    state.projectiles = state.projectiles.filter((p) => !p.dead);
    for (const f of state.fx) f.t -= dt;
    state.fx = state.fx.filter((f) => f.t > 0);

    if (state.frame % 45 === 0) saveRun();
    if (state.frame % 10 === 0) updateHUD();
  }

  function draw() {
    const w = state.w, h = state.h;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1a3a42"); g.addColorStop(0.45, "#15261c"); g.addColorStop(1, "#0f1a16");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.07; ctx.fillStyle = "#6fd3b0";
    for (let i = 0; i < 8; i++) {
      const y = ((i * 73 + state.time * 3) % (h + 40)) - 20;
      ctx.fillRect(0, y, w, 2);
    }
    ctx.globalAlpha = 1;

    if (state.path) {
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 34;
      ctx.beginPath();
      state.path.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke();
      ctx.strokeStyle = "#2a3036"; ctx.lineWidth = 28;
      ctx.beginPath();
      state.path.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke();
      ctx.save(); ctx.setLineDash([10, 12]);
      ctx.strokeStyle = "rgba(232,168,56,0.75)"; ctx.lineWidth = 2;
      ctx.beginPath();
      state.path.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.stroke(); ctx.restore();
      const start = state.path.points[0], end = state.path.points[state.path.points.length - 1];
      ctx.fillStyle = "rgba(94,200,232,0.35)";
      ctx.beginPath(); ctx.arc(start.x, start.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = state.hp <= 5 ? "#e85d4c" : "#e8a838";
      roundRect(end.x - 16, end.y - 12, 32, 24, 6); ctx.fill();
      ctx.fillStyle = "#1a1208"; ctx.font = "bold 10px Sora, sans-serif";
      ctx.textAlign = "center"; ctx.fillText("HANGAR", end.x, end.y + 3);
    }

    for (let i = 0; i < state.towers.length; i++) {
      const t = state.towers[i];
      if (state.selectedBuilt === i) {
        ctx.beginPath(); ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(242,235,224,0.18)"; ctx.lineWidth = 1.5; ctx.stroke();
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
      } else {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x, y); ctx.stroke();
      }
    }
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
      } else if (f.kind === "blast") {
        ctx.globalAlpha = a * 2; ctx.strokeStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.1 - a), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === "beam") {
        ctx.globalAlpha = Math.min(1, a * 8); ctx.strokeStyle = f.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === "place") {
        ctx.globalAlpha = a * 2; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, 18 + (0.45 - a) * 40, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === "text") {
        ctx.globalAlpha = Math.min(1, a * 3); ctx.fillStyle = f.color;
        ctx.font = "bold 11px Sora, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(f.text, f.x, f.y - (0.5 - a) * 20); ctx.globalAlpha = 1;
      } else if (f.kind === "leak") {
        ctx.globalAlpha = a; ctx.fillStyle = "rgba(232,93,76,0.25)";
        ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
      }
    }
    if (state.seed && state.mode !== "hub") {
      ctx.globalAlpha = 0.35; ctx.fillStyle = "#f2ebe0";
      ctx.font = "9px Sora, sans-serif"; ctx.textAlign = "left";
      ctx.fillText(state.seed.slice(0, 18), 8, h - 8); ctx.globalAlpha = 1;
    }
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
  function drawTower(t, selected) {
    ctx.save(); ctx.translate(t.x, t.y);
    if (selected) {
      ctx.strokeStyle = "rgba(232,168,56,0.8)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
    }
    if (t.type === "turret") {
      ctx.fillStyle = "#c47a3a"; roundRect(-10, -10, 20, 20, 4); ctx.fill();
      ctx.fillStyle = "#e8a838"; ctx.fillRect(0, -3, 16, 6);
    } else if (t.type === "mortar") {
      ctx.fillStyle = "#3d6b45"; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6fd3b0"; ctx.beginPath(); ctx.arc(0, -4, 5, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = "#2a6f88";
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(12, 0); ctx.lineTo(0, 12); ctx.lineTo(-12, 0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#5ec8e8"; ctx.lineWidth = 2; ctx.stroke();
    }
    // element gems
    const els = t.elements || [];
    els.forEach((el, i) => {
      ctx.fillStyle = ELEMENTS[el].color;
      ctx.beginPath(); ctx.arc(-8 + i * 16, -16, 4, 0, Math.PI * 2); ctx.fill();
    });
    if (t.level > 1) {
      ctx.fillStyle = "#f2ebe0"; ctx.font = "bold 9px Sora, sans-serif";
      ctx.textAlign = "center"; ctx.fillText(String(t.level), 0, 20);
    }
    ctx.restore();
  }
  function drawEnemy(e, x, y) {
    ctx.save(); ctx.translate(x, y);
    if (e.tags.includes("flying")) {
      ctx.strokeStyle = "rgba(154,208,176,0.5)"; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(0, 0, e.r + 6, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (e.slow < 1 || e.chillT > 0) {
      ctx.strokeStyle = "rgba(94,200,232,0.5)";
      ctx.beginPath(); ctx.arc(0, 0, e.r + 4, 0, Math.PI * 2); ctx.stroke();
    }
    if (e.burnT > 0) {
      ctx.fillStyle = "rgba(232,93,76,0.35)";
      ctx.beginPath(); ctx.arc(0, 0, e.r + 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = e.color;
    if (e.shape === "tri") {
      ctx.beginPath(); ctx.moveTo(0, -e.r); ctx.lineTo(e.r, e.r); ctx.lineTo(-e.r, e.r); ctx.closePath(); ctx.fill();
    } else if (e.shape === "sq") {
      roundRect(-e.r, -e.r, e.r * 2, e.r * 2, 3); ctx.fill();
    } else if (e.shape === "hex") {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        i ? ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r) : ctx.moveTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
      }
      ctx.closePath(); ctx.fill();
    } else if (e.shape === "boss") {
      roundRect(-e.r, -e.r * 0.7, e.r * 2, e.r * 1.4, 5); ctx.fill();
      ctx.fillStyle = "#1a1208"; ctx.fillRect(-e.r * 0.4, -4, e.r * 0.8, 8);
    } else {
      ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
    }
    const pct = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(-10, -e.r - 8, 20, 3);
    ctx.fillStyle = pct < 0.3 ? "#e85d4c" : "#6fd3b0"; ctx.fillRect(-10, -e.r - 8, 20 * pct, 3);
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
  function onCanvasTap(evt) {
    if (state.mode !== "playing") return;
    evt.preventDefault();
    const { x, y } = canvasPos(evt);
    for (let i = state.towers.length - 1; i >= 0; i--) {
      const t = state.towers[i];
      if (Math.hypot(t.x - x, t.y - y) < 22) {
        state.selectedBuilt = i; state.selectedTower = null; updateHUD(); return;
      }
    }
    if (state.selectedTower) { placeTower(x, y); return; }
    state.selectedBuilt = null; updateHUD();
  }
  canvas.addEventListener("pointerdown", onCanvasTap, { passive: false });

  document.querySelectorAll(".tower-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.mode !== "playing") return;
      const type = btn.dataset.tower;
      state.selectedTower = state.selectedTower === type ? null : type;
      state.selectedBuilt = null; updateHUD();
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
      state.fx.push({ kind: "place", x: t.x, y: t.y, t: 0.35, color: ELEMENTS[el].color });
      toast(describeCombo(t.elements));
      beep(640, 0.06, "triangle", 0.035);
      updateHUD(); saveRun();
    });
  });

  els.btnSell.addEventListener("click", () => {
    if (state.selectedBuilt == null) return;
    const t = state.towers[state.selectedBuilt];
    const elBonus = (t.elements || []).length * 15;
    state.scrap += Math.floor((t.sell || 30) * (0.7 + t.level * 0.15) + elBonus * 0.5);
    state.towers.splice(state.selectedBuilt, 1);
    state.selectedBuilt = null; updateHUD(); saveRun();
    beep(240, 0.05, "triangle", 0.03);
  });
  els.btnUpgrade.addEventListener("click", () => {
    if (state.selectedBuilt == null) return;
    const t = state.towers[state.selectedBuilt];
    const cost = upgradeCost(t);
    if (state.scrap < cost) { toast("Need more scrap"); return; }
    state.scrap -= cost; t.level += 1;
    const base = towerStats(t.type);
    t.damage = base.damage * (1 + (t.level - 1) * 0.25);
    t.range = base.range * (1 + (t.level - 1) * 0.08);
    t.fireRate = base.fireRate * Math.max(0.55, 1 - (t.level - 1) * 0.04);
    if (base.splash) t.splash = base.splash * (1 + (t.level - 1) * 0.1);
    Object.assign(t, {
      hitsAir: base.hitsAir, hitsGround: base.hitsGround,
      airBonus: base.airBonus, armorPenalty: base.armorPenalty,
      slow: base.slow, slowDur: base.slowDur, crit: base.crit, burn: base.burn, chain: base.chain,
    });
    state.fx.push({ kind: "place", x: t.x, y: t.y, t: 0.4, color: t.color });
    updateHUD(); saveRun(); beep(760, 0.07, "triangle", 0.04);
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
    els.btnMute.textContent = settings.muted ? "🔇" : "🔊";
  });
  $("btn-play").addEventListener("click", () => { clearRun(); resize(); startNewRun(); });
  $("btn-continue").addEventListener("click", continueRun);
  $("btn-upgrades").addEventListener("click", () => { showScreen("upgrades"); renderUpgrades(); });
  $("btn-upgrades-back").addEventListener("click", () => { showScreen("hub"); refreshHub(); });
  $("btn-to-hub").addEventListener("click", () => { saveRun(); state.mode = "hub"; showScreen("hub"); refreshHub(); });
  $("btn-abandon").addEventListener("click", () => endRun(true));
  $("btn-again").addEventListener("click", () => { clearRun(); resize(); startNewRun(); });
  $("btn-over-hub").addEventListener("click", () => { state.mode = "hub"; showScreen("hub"); refreshHub(); });
  $("btn-codex").addEventListener("click", () => {
    if (state.mode === "playing") { state.mode = "paused"; saveRun(); }
    showScreen("codex");
  });
  $("btn-codex-back").addEventListener("click", () => {
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
  window.addEventListener("resize", () => { resize(); if (state.mode === "playing" || state.mode === "paused") updateHUD(); });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; update(dt); draw();
    requestAnimationFrame(frame);
  }

  resize(); refreshHub(); showScreen("hub");
  els.btnMute.textContent = settings.muted ? "🔇" : "🔊";
  requestAnimationFrame(frame);
  window.__RD = { state, startNewRun, saveRun, loadRun, generatePath, wavePlan, ELEMENTS };
})();
