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
  const MAX_PARTICLES_SAVER = 64;
  const MAX_FX = 48;
  const MAX_FX_SAVER = 20;

  // layout*: path length / bend / pad pressure — difficulty is not HP-only.
  const DIFFICULTIES = {
    normal: {
      id: "normal", name: "Normal", hpMul: 1, speedMul: 1, countMul: 1, intervalMul: 1, rewardMul: 1, chipMul: 1,
      zigMin: 5, zigMax: 7, edgeInset: 0.14, travel: 1.0, bendJitter: 0.08, hairpin: 0.35,
      padOffset: 48, padClear: 30, padEvery: 1, pathClear: 28, unlock: null,
    },
    hard: {
      id: "hard", name: "Hard", hpMul: 1.42, speedMul: 1.1, countMul: 1.18, intervalMul: 0.9, rewardMul: 1.4, chipMul: 1.55,
      zigMin: 4, zigMax: 5, edgeInset: 0.18, travel: 0.78, bendJitter: 0.14, hairpin: 0.7,
      padOffset: 38, padClear: 26, padEvery: 1, pathClear: 26,
      unlock: { kind: "wave", difficulty: "normal", wave: 10 },
    },
    nightmare: {
      id: "nightmare", name: "Nightmare", hpMul: 2.0, speedMul: 1.24, countMul: 1.35, intervalMul: 0.78, rewardMul: 1.85, chipMul: 2.35,
      zigMin: 3, zigMax: 4, edgeInset: 0.22, travel: 0.58, bendJitter: 0.2, hairpin: 1.0,
      padOffset: 32, padClear: 24, padEvery: 2, pathClear: 24,
      unlock: { kind: "wave", difficulty: "hard", wave: 12 },
    },
  };

  const BASE_TOWER = {
    turret: {
      name: "Turret", cost: 58, damage: 28, range: 82, fireRate: 0.4, sell: 28, color: "#e8883a",
      hitsAir: true, hitsGround: true, splash: 0,
      blurb: "High DPS · short range · hits air & ground",
    },
    mortar: {
      name: "Mortar", cost: 90, damage: 40, range: 128, fireRate: 1.28, splash: 50, sell: 42, color: "#6fbf8a",
      hitsAir: false, hitsGround: true,
      blurb: "AoE splash · slow · cannot hit flying",
    },
    coil: {
      name: "Coil", cost: 74, damage: 14, range: 108, fireRate: 0.55, sell: 36, color: "#4db8c4",
      hitsAir: true, hitsGround: true, airBonus: 1.55, armorPenalty: 0.58, slow: 0.55, slowDur: 1.4,
      blurb: "Slows · anti-air · weak vs armor",
    },
    spire: {
      name: "Spire", cost: 110, damage: 72, range: 158, fireRate: 1.45, sell: 52, color: "#d4a060",
      hitsAir: true, hitsGround: true, pierce: 3, armorBonus: 1.2,
      blurb: "Pierce line · long range · slow fire",
    },
  };

  // Internal balance ledger: cost-per-DPS / ability budget for tuning.
  // DPS ~ damage / fireRate (splash & pierce counted as ability multipliers).
  const BALANCE = {
    scrapStart: 105,
    scrapWaveBase: 16,
    scrapWavePer: 2.1,
    scrapKillScale: 0.72,
    levelDmgPer: 0.22,
    levelDmgSoft: 0.035, // damp after L6
    levelRangePer: 0.08,
    levelRatePer: 0.04,
    levelCd: 2.4,
    hpEarly: 0.13,
    hpMid: 0.2,
    hpLate: 0.32,
    hpDeepBase: 1.055, // exponential after wave 40
    countCap: 58,
    rewardDeepFade: 0.012, // reduce kill reward growth deep
  };
  function towerAbilityMul(def) {
    let m = 1;
    if (def.splash) m *= 1.35;
    if (def.pierce) m *= 1 + 0.22 * Math.min(4, def.pierce);
    if (def.slow != null) m *= 1.15;
    if (def.airBonus) m *= 1.08;
    if (def.armorBonus) m *= 1.1;
    if (def.chain) m *= 1.12;
    if (def.crit) m *= 1 + def.crit * 0.5;
    if (def.burn) m *= 1.1;
    return m;
  }
  function estimateTowerDps(def) {
    return (def.damage / Math.max(0.12, def.fireRate)) * towerAbilityMul(def);
  }
  function costPerDps(def) {
    return def.cost / Math.max(1, estimateTowerDps(def));
  }
  // Sanity anchors used while retuning (kept for balance audits).
  const COST_PER_DPS = Object.fromEntries(
    Object.keys(BASE_TOWER).map((k) => [k, Math.round(costPerDps(BASE_TOWER[k]) * 10) / 10])
  );

  const ELEMENTS = {
    fire: { id: "fire", name: "Fire", color: "#e85d4c", cost: 28, tip: "Burn DoT" },
    water: { id: "water", name: "Water", color: "#4db8c4", cost: 28, tip: "Chill slow" },
    earth: { id: "earth", name: "Earth", color: "#c4a35a", cost: 28, tip: "Vs armor + shred" },
    wind: { id: "wind", name: "Wind", color: "#7ec9a0", cost: 28, tip: "Vs air + shove" },
    arc: { id: "arc", name: "Arc", color: "#d4b84a", cost: 32, tip: "Shock stun" },
    frost: { id: "frost", name: "Frost", color: "#8ec8e8", cost: 32, tip: "Hard freeze" },
  };
  const ELEMENT_IDS = Object.keys(ELEMENTS);
  const ELEMENT_SECOND_COST = 48;
  const MAX_ELEMENTS = 2;
  const COMBO_SHORT = {
    "fire+water": "STEAM",
    "earth+fire": "MAGMA",
    "fire+wind": "WILDFIRE",
    "earth+water": "MUD",
    "water+wind": "STORM",
    "earth+wind": "TEMPEST",
    "arc+fire": "PLASMA",
    "arc+water": "CONDUCT",
    "arc+earth": "QUAKE",
    "arc+wind": "SURGE",
    "arc+frost": "FLASHFREEZE",
    "fire+frost": "MELT",
    "frost+water": "GLACIER",
    "earth+frost": "PERMAFROST",
    "frost+wind": "BLIZZARD",
  };

  // Multi-rank hub trees. col/row drive the visual tree; effect stacks per rank.
  function upNode(partial) {
    return {
      max: 1, cost: 24, costGrow: 1.48, req: null, reqRank: 1, col: 0, row: 0, icon: "star",
      ...partial,
    };
  }
  const UPGRADE_TREES = {
    turret: [
      upNode({ id: "t_dmg", name: "Hot Rounds", desc: "+16% damage / rank", icon: "dmg", max: 5, cost: 22, col: 0, row: 0, effect: { damage: 1.16 } }),
      upNode({ id: "t_spd", name: "Servo Drive", desc: "+12% fire rate / rank", icon: "spd", max: 4, cost: 24, col: 1, row: 0, effect: { fireRate: 0.88 } }),
      upNode({ id: "t_rng", name: "Long Barrel", desc: "+10% range / rank", icon: "rng", max: 4, cost: 20, col: 2, row: 0, effect: { range: 1.1 } }),
      upNode({ id: "t_ap", name: "AP Core", desc: "+14% damage / rank", icon: "dmg", max: 4, cost: 36, req: "t_dmg", reqRank: 2, col: 0, row: 1, effect: { damage: 1.14 } }),
      upNode({ id: "t_burst", name: "Burst Mag", desc: "+11% fire rate / rank", icon: "spd", max: 3, cost: 40, req: "t_spd", reqRank: 2, col: 1, row: 1, effect: { fireRate: 0.89 } }),
      upNode({ id: "t_spot", name: "Spotter Link", desc: "+12% range / rank", icon: "rng", max: 3, cost: 34, req: "t_rng", reqRank: 2, col: 2, row: 1, effect: { range: 1.12 } }),
      upNode({ id: "t_crit", name: "Crit Optics", desc: "+7% crit / rank (×2 dmg)", icon: "crit", max: 4, cost: 48, req: "t_ap", reqRank: 1, col: 0, row: 2, effect: { critAdd: 0.07 } }),
      upNode({ id: "t_focus", name: "Focus Latch", desc: "+8% vs bosses / rank", icon: "special", max: 3, cost: 52, req: "t_burst", reqRank: 1, col: 1, row: 2, effect: { bossBonus: 0.08 } }),
      upNode({ id: "t_air", name: "Flak Tips", desc: "+10% vs air / rank", icon: "air", max: 3, cost: 44, req: "t_spot", reqRank: 1, col: 2, row: 2, effect: { airBonusAdd: 0.1 } }),
      upNode({ id: "t_over", name: "Overdrive", desc: "+9% dmg & rate / rank", icon: "special", max: 3, cost: 70, req: "t_crit", reqRank: 2, col: 0, row: 3, effect: { damage: 1.09, fireRate: 0.93 } }),
      upNode({ id: "t_rail", name: "Rail Sync", desc: "+15% range / rank", icon: "rng", max: 2, cost: 75, req: "t_focus", reqRank: 1, col: 1, row: 3, effect: { range: 1.15 } }),
      upNode({ id: "t_master", name: "Masterwork", desc: "+12% all combat / rank", icon: "star", max: 2, cost: 95, req: "t_over", reqRank: 1, col: 1, row: 4, effect: { damage: 1.12, fireRate: 0.94, range: 1.06 } }),
    ],
    mortar: [
      upNode({ id: "m_dmg", name: "HE Shells", desc: "+16% damage / rank", icon: "dmg", max: 5, cost: 24, col: 0, row: 0, effect: { damage: 1.16 } }),
      upNode({ id: "m_splash", name: "Wider Blast", desc: "+14% splash / rank", icon: "splash", max: 4, cost: 26, col: 1, row: 0, effect: { splash: 1.14 } }),
      upNode({ id: "m_rng", name: "Arc Sight", desc: "+9% range / rank", icon: "rng", max: 4, cost: 22, col: 2, row: 0, effect: { range: 1.09 } }),
      upNode({ id: "m_he2", name: "Cluster Core", desc: "+13% damage / rank", icon: "dmg", max: 4, cost: 38, req: "m_dmg", reqRank: 2, col: 0, row: 1, effect: { damage: 1.13 } }),
      upNode({ id: "m_cluster", name: "Cluster Cap", desc: "+16% splash / rank", icon: "splash", max: 3, cost: 42, req: "m_splash", reqRank: 2, col: 1, row: 1, effect: { splash: 1.16 } }),
      upNode({ id: "m_loader", name: "Fast Loader", desc: "+10% fire rate / rank", icon: "spd", max: 4, cost: 30, req: "m_rng", reqRank: 1, col: 2, row: 1, effect: { fireRate: 0.9 } }),
      upNode({ id: "m_burn", name: "Incendiary", desc: "+4 burn / rank", icon: "burn", max: 4, cost: 48, req: "m_he2", reqRank: 1, col: 0, row: 2, effect: { burnAdd: 4 } }),
      upNode({ id: "m_quake", name: "Quake Fuse", desc: "+8% vs armor / rank", icon: "earth", max: 3, cost: 50, req: "m_cluster", reqRank: 1, col: 1, row: 2, effect: { armorBonusAdd: 0.08 } }),
      upNode({ id: "m_sky", name: "Sky Hook", desc: "Unlock air hits · +6% air / rank", icon: "air", max: 2, cost: 85, req: "m_loader", reqRank: 2, col: 2, row: 2, effect: { hitsAir: true, airBonusAdd: 0.06 } }),
      upNode({ id: "m_napalm", name: "Napalm Nest", desc: "+5 burn & +8% splash / rank", icon: "burn", max: 3, cost: 72, req: "m_burn", reqRank: 2, col: 0, row: 3, effect: { burnAdd: 5, splash: 1.08 } }),
      upNode({ id: "m_siege", name: "Siege Cadence", desc: "+11% dmg & rate / rank", icon: "special", max: 3, cost: 78, req: "m_quake", reqRank: 1, col: 1, row: 3, effect: { damage: 1.11, fireRate: 0.92 } }),
      upNode({ id: "m_master", name: "Barrage Crown", desc: "+12% combat / rank", icon: "star", max: 2, cost: 100, req: "m_siege", reqRank: 1, col: 1, row: 4, effect: { damage: 1.12, splash: 1.1, range: 1.05 } }),
    ],
    coil: [
      upNode({ id: "c_dmg", name: "Amp Coil", desc: "+17% damage / rank", icon: "dmg", max: 5, cost: 22, col: 0, row: 0, effect: { damage: 1.17 } }),
      upNode({ id: "c_slow", name: "Deep Freeze", desc: "Stronger slow / rank", icon: "slow", max: 4, cost: 26, col: 1, row: 0, effect: { slowStep: 0.06 } }),
      upNode({ id: "c_rng", name: "Field Expand", desc: "+10% range / rank", icon: "rng", max: 4, cost: 22, col: 2, row: 0, effect: { range: 1.1 } }),
      upNode({ id: "c_amp2", name: "Resonance", desc: "+14% damage / rank", icon: "dmg", max: 4, cost: 36, req: "c_dmg", reqRank: 2, col: 0, row: 1, effect: { damage: 1.14 } }),
      upNode({ id: "c_hold", name: "Cryo Hold", desc: "+18% slow duration / rank", icon: "slow", max: 3, cost: 34, req: "c_slow", reqRank: 2, col: 1, row: 1, effect: { slowDur: 1.18 } }),
      upNode({ id: "c_pulse", name: "Pulse Sync", desc: "+12% fire rate / rank", icon: "spd", max: 4, cost: 28, req: "c_rng", reqRank: 1, col: 2, row: 1, effect: { fireRate: 0.88 } }),
      upNode({ id: "c_chain", name: "Arc Jump", desc: "+1 chain target / rank", icon: "chain", max: 2, cost: 55, req: "c_amp2", reqRank: 1, col: 0, row: 2, effect: { chainAdd: 1 } }),
      upNode({ id: "c_air", name: "Sky Latch", desc: "+12% air bonus / rank", icon: "air", max: 3, cost: 40, req: "c_hold", reqRank: 1, col: 1, row: 2, effect: { airBonusAdd: 0.12 } }),
      upNode({ id: "c_armor", name: "Breach Coil", desc: "Less armor penalty / rank", icon: "earth", max: 3, cost: 46, req: "c_pulse", reqRank: 1, col: 2, row: 2, effect: { armorPenStep: 0.08 } }),
      upNode({ id: "c_storm", name: "Storm Lattice", desc: "+10% dmg & chain potency", icon: "special", max: 3, cost: 70, req: "c_chain", reqRank: 1, col: 0, row: 3, effect: { damage: 1.1, fireRate: 0.94 } }),
      upNode({ id: "c_glare", name: "Glare Field", desc: "+12% range & slow / rank", icon: "slow", max: 2, cost: 74, req: "c_air", reqRank: 1, col: 1, row: 3, effect: { range: 1.12, slowStep: 0.04 } }),
      upNode({ id: "c_master", name: "Singularity", desc: "+12% combat / rank", icon: "star", max: 2, cost: 98, req: "c_storm", reqRank: 1, col: 1, row: 4, effect: { damage: 1.12, range: 1.06, slowDur: 1.1 } }),
    ],
    spire: [
      upNode({ id: "s_dmg", name: "Focus Lens", desc: "+15% damage / rank", icon: "dmg", max: 5, cost: 28, col: 0, row: 0, effect: { damage: 1.15 } }),
      upNode({ id: "s_pierce", name: "Rift Bore", desc: "+1 pierce / rank", icon: "pierce", max: 3, cost: 34, col: 1, row: 0, effect: { pierceAdd: 1 } }),
      upNode({ id: "s_rng", name: "Sky Spire", desc: "+11% range / rank", icon: "rng", max: 4, cost: 26, col: 2, row: 0, effect: { range: 1.11 } }),
      upNode({ id: "s_core", name: "Magma Core", desc: "+13% damage / rank", icon: "dmg", max: 4, cost: 42, req: "s_dmg", reqRank: 2, col: 0, row: 1, effect: { damage: 1.13 } }),
      upNode({ id: "s_shaft", name: "Deep Shaft", desc: "+1 pierce / rank", icon: "pierce", max: 2, cost: 55, req: "s_pierce", reqRank: 1, col: 1, row: 1, effect: { pierceAdd: 1 } }),
      upNode({ id: "s_servo", name: "Gyro Mount", desc: "+10% fire rate / rank", icon: "spd", max: 4, cost: 32, req: "s_rng", reqRank: 1, col: 2, row: 1, effect: { fireRate: 0.9 } }),
      upNode({ id: "s_boss", name: "Tyrant Mark", desc: "+10% vs bosses / rank", icon: "special", max: 3, cost: 58, req: "s_core", reqRank: 1, col: 0, row: 2, effect: { bossBonus: 0.1 } }),
      upNode({ id: "s_armor", name: "Sunder Tip", desc: "+10% vs armor / rank", icon: "earth", max: 3, cost: 52, req: "s_shaft", reqRank: 1, col: 1, row: 2, effect: { armorBonusAdd: 0.1 } }),
      upNode({ id: "s_seek", name: "Seeking Beam", desc: "+9% range & rate / rank", icon: "rng", max: 3, cost: 56, req: "s_servo", reqRank: 2, col: 2, row: 2, effect: { range: 1.09, fireRate: 0.93 } }),
      upNode({ id: "s_crit", name: "Eclipse Crit", desc: "+8% crit / rank", icon: "crit", max: 3, cost: 72, req: "s_boss", reqRank: 1, col: 0, row: 3, effect: { critAdd: 0.08 } }),
      upNode({ id: "s_line", name: "Line Storm", desc: "+12% pierce damage / rank", icon: "pierce", max: 3, cost: 76, req: "s_armor", reqRank: 1, col: 1, row: 3, effect: { damage: 1.12 } }),
      upNode({ id: "s_master", name: "Apex Spire", desc: "+12% combat / rank", icon: "star", max: 2, cost: 110, req: "s_crit", reqRank: 1, col: 1, row: 4, effect: { damage: 1.12, range: 1.08, fireRate: 0.94 } }),
    ],
  };

  // resist: <1 resists that element, >1 is weak. Applied per socketed element on hit.
  // Learn via pips (□ resist / △ weak) + WEAK/RESIST hit text — no wiki needed.
  const ENEMY = {
    drone: {
      hp: 34, speed: 70, reward: 11, r: 11, color: "#4db8c4", shape: "tri",
      tags: ["flying", "fast"], label: "Drone",
      resist: { fire: 0.9, water: 1.2, earth: 0.5, wind: 1.45, arc: 1.35, frost: 0.75 },
    },
    crawler: {
      hp: 88, speed: 40, reward: 18, r: 13, color: "#e8883a", shape: "sq",
      tags: ["ground"], label: "Crawler",
      resist: { fire: 1.2, water: 1.0, earth: 1.1, wind: 0.8, arc: 0.9, frost: 1.15 },
    },
    armor: {
      hp: 220, speed: 26, reward: 38, r: 15, color: "#a89a8c", shape: "hex",
      tags: ["ground", "armored"], label: "Armor",
      resist: { fire: 0.55, water: 0.8, earth: 1.5, wind: 0.5, arc: 1.4, frost: 0.7 },
    },
    swarm: {
      hp: 18, speed: 84, reward: 7, r: 8, color: "#6fbf8a", shape: "dot",
      tags: ["ground", "swarm"], label: "Swarm",
      resist: { fire: 1.55, water: 0.65, earth: 0.9, wind: 0.85, arc: 0.7, frost: 1.35 },
    },
    // Boss roster — distinct silhouettes, resists, and abilities.
    behemoth: {
      hp: 920, speed: 20, reward: 120, r: 24, color: "#e85d4c", shape: "boss",
      tags: ["ground", "armored", "boss"], label: "Behemoth", ability: "bulk",
      resist: { fire: 0.65, water: 0.7, earth: 1.25, wind: 0.55, arc: 1.2, frost: 0.6 },
    },
    emberwyrm: {
      hp: 760, speed: 34, reward: 130, r: 22, color: "#ff8a4a", shape: "wyrm",
      tags: ["flying", "armored", "boss"], label: "Emberwyrm", ability: "ashregen",
      resist: { fire: 0.35, water: 1.45, earth: 0.75, wind: 1.05, arc: 0.85, frost: 1.35 },
    },
    shellwarden: {
      hp: 1100, speed: 16, reward: 140, r: 26, color: "#a89a8c", shape: "warden",
      tags: ["ground", "armored", "boss"], label: "Shellwarden", ability: "carapace",
      resist: { fire: 0.5, water: 0.55, earth: 1.55, wind: 0.45, arc: 1.45, frost: 0.55 },
    },
    broodmother: {
      hp: 840, speed: 22, reward: 135, r: 23, color: "#6fbf8a", shape: "brood",
      tags: ["ground", "armored", "boss", "swarm"], label: "Broodmother", ability: "brood",
      resist: { fire: 1.35, water: 0.5, earth: 0.85, wind: 0.8, arc: 0.65, frost: 1.25 },
    },
    galeheart: {
      hp: 780, speed: 30, reward: 125, r: 22, color: "#4db8c4", shape: "gale",
      tags: ["ground", "armored", "boss", "fast"], label: "Galeheart", ability: "tempest",
      resist: { fire: 1.15, water: 0.85, earth: 1.2, wind: 0.3, arc: 1.1, frost: 1.3 },
    },
  };
  // Save/compat alias
  ENEMY.boss = ENEMY.behemoth;

  const BOSS_ROSTER = ["behemoth", "emberwyrm", "shellwarden", "broodmother", "galeheart"];
  function isBossType(type) {
    return !!(ENEMY[type] && ENEMY[type].tags && ENEMY[type].tags.includes("boss"));
  }
  function isBossEnemy(e) {
    return !!(e && e.tags && e.tags.includes("boss"));
  }
  function bossPoolForWave(wave) {
    const pool = ["behemoth"];
    if (wave >= 10) pool.push("emberwyrm");
    if (wave >= 20) pool.push("shellwarden");
    if (wave >= 30) pool.push("broodmother");
    if (wave >= 40) pool.push("galeheart");
    return pool;
  }
  function pickBossType(wave, index, rng, used) {
    const pool = bossPoolForWave(wave);
    // Prefer unused types in a multi-boss pack for readability.
    const fresh = pool.filter((t) => !used.has(t));
    const pickFrom = fresh.length ? fresh : pool;
    const t = pickFrom[Math.floor(rng() * pickFrom.length)];
    used.add(t);
    return t;
  }

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
    for (const el of ELEMENT_IDS) {
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

  const MILESTONES = [
    { id: "w5", label: "Wave 5", kind: "wave", difficulty: "normal", wave: 5, chips: 12 },
    { id: "w10", label: "Wave 10", kind: "wave", difficulty: "normal", wave: 10, chips: 24 },
    { id: "w20", label: "Wave 20", kind: "wave", difficulty: "normal", wave: 20, chips: 48 },
    { id: "hard", label: "Hard clear 8", kind: "wave", difficulty: "hard", wave: 8, chips: 36 },
    { id: "daily3", label: "3 Dailies", kind: "dailies", count: 3, chips: 30 },
  ];

  const defaultMeta = () => ({
    chips: 0, owned: {}, unlockedDifficulties: { normal: true }, selectedDifficulty: "normal",
    bestByDifficulty: { normal: { wave: 0, score: 0 }, hard: { wave: 0, score: 0 }, nightmare: { wave: 0, score: 0 } },
    milestones: {}, dailiesCompleted: 0, lastDailyKey: null, lastDailyBest: { wave: 0, score: 0 },
  });
  const defaultSettings = () => ({
    muted: false, volume: 0.7, music: false, haptics: true,
    gameSpeed: 1, tutorialDone: false, coachStep: 0,
    shake: "low", particles: true, hitFlash: true, screenFlash: true, combatFx: true,
    dmgNumbers: true, batterySaver: false, largeTap: false,
  });
  const defaultBest = () => ({ wave: 0, score: 0 });

  function dailyKey(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function dailySeedFor(key) {
    return `ew-daily-${key}`;
  }
  const prefersReducedMotion = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  if (typeof settings.volume !== "number" || settings.volume < 0 || settings.volume > 1) settings.volume = 0.7;
  if (typeof settings.music !== "boolean") settings.music = false;
  if (typeof settings.haptics !== "boolean") settings.haptics = true;
  if (typeof settings.dmgNumbers !== "boolean") settings.dmgNumbers = true;
  if (typeof settings.batterySaver !== "boolean") settings.batterySaver = false;
  if (typeof settings.largeTap !== "boolean") settings.largeTap = false;
  if (!meta.milestones) meta.milestones = {};
  if (typeof meta.dailiesCompleted !== "number") meta.dailiesCompleted = 0;
  if (prefersReducedMotion() && settings.shake !== "off") {
    /* honor OS reduce-motion without overwriting saved prefs permanently */
  }
  let best = loadJSON(STORAGE.best, defaultBest());
  let runIsDaily = false;
  let runDailyKey = null;

  function juiceOff() {
    return settings.shake === "off" && settings.particles === false;
  }
  function motionAllowed() {
    return !prefersReducedMotion() && !juiceOff();
  }

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
    btnSell: $("btn-sell"), btnUpgrade: $("btn-upgrade"), btnAutoLevel: $("btn-auto-level"),
    inspect: $("inspect"), inspectText: $("inspect-text"),
    coach: $("coach"), coachText: $("coach-text"),
  };

  /* ---- audio + haptics (mute / volume / reduce-motion aware) ---- */
  let audioCtx = null;
  let masterGain = null;
  let musicNodes = null;
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = settings.muted ? 0 : settings.volume;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    syncMasterGain();
    return audioCtx;
  }
  function syncMasterGain() {
    if (!masterGain || !audioCtx) return;
    const v = settings.muted ? 0 : Math.max(0, Math.min(1, settings.volume));
    masterGain.gain.setTargetAtTime(v, audioCtx.currentTime, 0.04);
  }
  function beep(freq, dur, type = "square", gain = 0.03) {
    if (settings.muted || settings.volume <= 0.001) return;
    try {
      const ac = ensureAudio();
      const o = ac.createOscillator();
      const g = ac.createGain();
      const filt = ac.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = Math.min(4200, freq * 4);
      o.type = type;
      o.frequency.setValueAtTime(freq, ac.currentTime);
      g.gain.setValueAtTime(Math.max(0.0001, gain), ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(filt); filt.connect(g); g.connect(masterGain || ac.destination);
      o.start();
      o.stop(ac.currentTime + dur + 0.02);
    } catch { /* ignore */ }
  }
  function toneSlide(f0, f1, dur, type = "sine", gain = 0.03) {
    if (settings.muted || settings.volume <= 0.001) return;
    try {
      const ac = ensureAudio();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, ac.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), ac.currentTime + dur);
      g.gain.setValueAtTime(gain, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g); g.connect(masterGain || ac.destination);
      o.start(); o.stop(ac.currentTime + dur + 0.02);
    } catch { /* ignore */ }
  }
  function stopMusic() {
    if (!musicNodes) return;
    try {
      musicNodes.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.2);
      const nodes = musicNodes;
      setTimeout(() => {
        try { nodes.osc1.stop(); nodes.osc2.stop(); nodes.lfo.stop(); } catch { /* */ }
      }, 500);
    } catch { /* */ }
    musicNodes = null;
  }
  function startMusic() {
    if (settings.muted || !settings.music || prefersReducedMotion()) { stopMusic(); return; }
    if (musicNodes) return;
    try {
      const ac = ensureAudio();
      const osc1 = ac.createOscillator();
      const osc2 = ac.createOscillator();
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      const g = ac.createGain();
      const filt = ac.createBiquadFilter();
      osc1.type = "sine"; osc1.frequency.value = 110;
      osc2.type = "triangle"; osc2.frequency.value = 164.8;
      lfo.type = "sine"; lfo.frequency.value = 0.07;
      lfoGain.gain.value = 12;
      filt.type = "lowpass"; filt.frequency.value = 480;
      g.gain.value = 0.0001;
      lfo.connect(lfoGain); lfoGain.connect(osc1.frequency);
      osc1.connect(filt); osc2.connect(filt); filt.connect(g); g.connect(masterGain || ac.destination);
      osc1.start(); osc2.start(); lfo.start();
      g.gain.setTargetAtTime(0.028, ac.currentTime, 1.2);
      musicNodes = { osc1, osc2, lfo, gain: g };
    } catch { musicNodes = null; }
  }
  function syncMusic() {
    if (settings.music && !settings.muted) startMusic();
    else stopMusic();
  }
  function haptic(pattern) {
    if (!settings.haptics || settings.muted) return;
    if (!motionAllowed()) return;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(pattern);
      }
    } catch { /* unsupported */ }
  }
  const sfx = {
    place: () => { toneSlide(520, 780, 0.09, "triangle", 0.05); haptic(12); },
    upgrade: () => { beep(520, 0.05, "triangle", 0.03); setTimeout(() => toneSlide(780, 980, 0.09, "triangle", 0.04), 40); haptic([8, 30, 16]); },
    socket: () => { beep(640, 0.06, "sine", 0.035); beep(960, 0.04, "sine", 0.02); haptic(10); },
    shoot: (kind) => beep(kind === "mortar" ? 140 : kind === "coil" ? 980 : kind === "spire" ? 320 : 880, 0.028, "square", 0.016),
    hit: () => beep(260 + Math.random() * 60, 0.025, "square", 0.014),
    kill: () => { toneSlide(420, 180, 0.08, "square", 0.028); haptic(8); },
    leak: () => { beep(110, 0.18, "sawtooth", 0.05); haptic([30, 40, 30]); },
    wave: () => { toneSlide(400, 620, 0.12, "triangle", 0.035); haptic(14); },
    start: () => { toneSlide(330, 520, 0.14, "triangle", 0.04); haptic(18); },
    over: () => { toneSlide(220, 90, 0.28, "sawtooth", 0.04); haptic([40, 60, 40]); },
    buy: () => { beep(660, 0.07, "triangle", 0.04); haptic(10); },
    ui: () => beep(400, 0.03, "triangle", 0.02),
    speed: () => beep(500 + settings.gameSpeed * 120, 0.05, "triangle", 0.03),
    cancel: () => beep(220, 0.04, "triangle", 0.02),
  };

  function ownedRank(id) {
    const v = (meta.owned || {})[id];
    if (v === true) return 1;
    const n = Number(v) || 0;
    return Math.max(0, Math.floor(n));
  }
  function upgradeCostAt(u, nextRank) {
    return Math.floor(u.cost * Math.pow(u.costGrow || 1.45, Math.max(0, nextRank - 1)));
  }
  function reqSatisfied(u) {
    if (!u.req) return true;
    return ownedRank(u.req) >= (u.reqRank || 1);
  }
  function applyUpgradeEffect(base, e, ranks) {
    if (!e || ranks <= 0) return;
    for (let i = 0; i < ranks; i++) {
      if (e.damage) base.damage *= e.damage;
      if (e.range) base.range *= e.range;
      if (e.fireRate) base.fireRate *= e.fireRate;
      if (e.splash) base.splash = (base.splash || 40) * e.splash;
      if (e.slow != null) base.slow = e.slow;
      if (e.slowDur) base.slowDur = (base.slowDur || 1.2) * e.slowDur;
      if (e.crit) base.crit = e.crit;
      if (e.critAdd) base.crit = (base.crit || 0) + e.critAdd;
      if (e.burn) base.burn = e.burn;
      if (e.burnAdd) base.burn = (base.burn || 0) + e.burnAdd;
      if (e.chain) base.chain = e.chain;
      if (e.chainAdd) base.chain = (base.chain || 0) + e.chainAdd;
      if (e.pierceAdd) base.pierce = (base.pierce || 0) + e.pierceAdd;
      if (e.bossBonus) base.bossBonus = (base.bossBonus || 0) + e.bossBonus;
      if (e.airBonusAdd) base.airBonus = (base.airBonus || 1) + e.airBonusAdd;
      if (e.armorBonusAdd) base.armorBonus = (base.armorBonus || 1) + e.armorBonusAdd;
      if (e.armorPenStep) base.armorPenalty = Math.min(1, (base.armorPenalty == null ? 1 : base.armorPenalty) + e.armorPenStep);
      if (e.slowStep) base.slow = Math.max(0.2, (base.slow == null ? 0.7 : base.slow) - e.slowStep);
      if (e.hitsAir) base.hitsAir = true;
    }
  }
  function towerStats(type) {
    const base = { ...BASE_TOWER[type] };
    const tree = UPGRADE_TREES[type] || [];
    for (const u of tree) applyUpgradeEffect(base, u.effect, ownedRank(u.id));
    return base;
  }

  function comboKey(elements) {
    return [...elements].sort().join("+");
  }
  function describeCombo(elements) {
    if (!elements.length) return "No elements";
    if (elements.length === 1) {
      const el = ELEMENTS[elements[0]];
      return el ? `${el.name}: ${el.tip}` : elements[0];
    }
    return ({
      "fire+water": "Steam burst (AoE)",
      "earth+fire": "Magma (explode on kill)",
      "fire+wind": "Wildfire (spread burn)",
      "earth+water": "Mud (heavy slow)",
      "water+wind": "Storm (shatter chill)",
      "earth+wind": "Tempest (full vs air & armor)",
      "arc+fire": "Plasma (burst hit)",
      "arc+water": "Conduct (shock splash)",
      "arc+earth": "Quake (AoE stun)",
      "arc+wind": "Surge (chain jump)",
      "arc+frost": "Flashfreeze (stun + freeze)",
      "fire+frost": "Melt (armor crack)",
      "frost+water": "Glacier (deep freeze)",
      "earth+frost": "Permafrost (root)",
      "frost+wind": "Blizzard (AoE chill)",
    })[comboKey(elements)] || elements.map((id) => (ELEMENTS[id] || {}).name || id).join("+");
  }

  function finalizeLane(points) {
    const dense = densify(points, 18);
    const lengths = [0];
    let total = 0;
    for (let i = 1; i < dense.length; i++) {
      total += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y);
      lengths.push(total);
    }
    return { points: dense, lengths, total, corners: points.slice() };
  }
  function spawnCountForDifficulty(diffId) {
    if (diffId === "nightmare") return 4;
    if (diffId === "hard") return 3;
    return 2;
  }
  function layoutForDifficulty(diffId) {
    return DIFFICULTIES[diffId] || DIFFICULTIES.normal;
  }
  function generatePath(seed, w, h, diffId) {
    const diff = layoutForDifficulty(diffId);
    const rng = mulberry32(hashSeed(seed + ":path:" + diff.id));
    // Harder diffs: shorter path (fewer zigs + less horizontal travel), tighter bends, less pad room.
    const padX = w * diff.edgeInset;
    const padY = h * (0.07 + (diff.edgeInset - 0.14) * 0.35);
    const travel = Math.max(0.45, Math.min(1, diff.travel));
    const zigzags = diff.zigMin + Math.floor(rng() * (diff.zigMax - diff.zigMin + 1));
    const corners = [];
    let y = padY;
    // Start nearer the center on hard layouts so early angles are worse.
    const startSpan = (w - padX * 2) * (0.55 + travel * 0.45);
    const startLeft = (w - startSpan) / 2;
    let x = startLeft + rng() * startSpan;
    corners.push({ x, y });
    let goingRight = rng() > 0.5;
    for (let i = 1; i <= zigzags; i++) {
      const targetY = padY + ((h - padY * 2) * i) / (zigzags + 1);
      corners.push({ x, y: targetY });
      // Horizontal reach shrinks with travel; hard/nightmare stay in a tighter corridor.
      const reach = (w * 0.5 - padX) * travel;
      const center = w * 0.5 + (rng() - 0.5) * w * 0.06 * (1 - travel);
      let targetX = goingRight ? center + reach : center - reach;
      // Occasional overshoot / undershoot for meaner cover angles.
      targetX += (rng() - 0.5) * w * 0.04 * diff.hairpin;
      targetX = Math.max(padX * 0.85, Math.min(w - padX * 0.85, targetX));
      // Hairpins: mid-point pulled toward the previous x so turns get acute.
      const pull = 0.35 + diff.hairpin * 0.4;
      const midBase = x * pull + targetX * (1 - pull);
      const mid = midBase + (rng() - 0.5) * w * diff.bendJitter;
      const midY = targetY + (rng() - 0.5) * (10 + diff.hairpin * 18);
      corners.push({ x: Math.max(12, Math.min(w - 12, mid)), y: midY });
      x = targetX;
      corners.push({ x, y: targetY });
      goingRight = !goingRight;
      // Nightmare: sometimes skip a full flip (stacked same-side jogs = bad firing lanes).
      if (diff.hairpin > 0.85 && rng() < 0.28) goingRight = !goingRight;
    }
    const exit = { x, y: h - padY * (0.85 + travel * 0.2) };
    corners.push(exit);
    const main = finalizeLane(corners);
    const lanes = [main];
    const spawnN = spawnCountForDifficulty(diff.id);
    // Extra spawn lanes merge earlier on hard layouts (less react time).
    const mergeIdx = Math.min(
      corners.length - 2,
      diff.id === "nightmare" ? 2 : diff.id === "hard" ? 3 : 4
    );
    const mergePt = corners[Math.max(1, mergeIdx)];
    const sideStarts = [
      { x: padX * 0.45, y: padY * 0.55 },
      { x: w - padX * 0.45, y: padY * 0.55 },
      { x: padX * 0.6, y: padY + (h - padY * 2) * 0.14 },
      { x: w - padX * 0.6, y: padY + (h - padY * 2) * 0.14 },
    ];
    for (let s = 1; s < spawnN; s++) {
      const start = sideStarts[(s - 1) % sideStarts.length];
      const midY = (start.y + mergePt.y) / 2;
      const midX = start.x * (0.25 + travel * 0.2) + mergePt.x * (0.75 - travel * 0.2)
        + (rng() - 0.5) * (12 + diff.hairpin * 16);
      const spur = [start, { x: midX, y: midY }, mergePt, ...corners.slice(corners.indexOf(mergePt) + 1)];
      lanes.push(finalizeLane(spur));
    }
    // Bend pads: still guaranteed, but tighter / sparser as difficulty rises.
    const pads = [];
    const bendPts = corners.filter((_, i) => i > 0 && i < corners.length - 1 && i % 3 === 1);
    const every = Math.max(1, diff.padEvery | 0);
    for (let i = 0; i < bendPts.length; i++) {
      if (i % every !== 0) continue;
      const b = bendPts[i];
      const bIdx = corners.indexOf(b);
      const prev = corners[Math.max(0, bIdx - 1)] || corners[0];
      const next = corners[Math.min(corners.length - 1, bIdx + 1)] || exit;
      let tx = next.x - prev.x, ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len; ty /= len;
      const side = (i % 2 === 0) ? 1 : -1;
      // Worse angles: bias pads into the "inside" of acute turns on hard+.
      const insideBias = diff.hairpin > 0.5 && rng() < 0.45 ? -side : side;
      const ox = -ty * insideBias * diff.padOffset;
      const oy = tx * insideBias * diff.padOffset;
      let px = b.x + ox, py = b.y + oy;
      px = Math.max(20, Math.min(w - 20, px));
      py = Math.max(20, Math.min(h - 20, py));
      for (let n = 0; n < 6; n++) {
        if (distToPathNetwork({ lanes }, px, py) >= diff.padClear) break;
        px += ox * 0.22; py += oy * 0.22;
        px = Math.max(20, Math.min(w - 20, px));
        py = Math.max(20, Math.min(h - 20, py));
      }
      pads.push({ x: px, y: py, bend: i });
    }
    // Always keep at least one pad even on nightmare sparsity.
    if (!pads.length && bendPts.length) {
      const b = bendPts[0];
      pads.push({
        x: Math.max(24, Math.min(w - 24, b.x + 36)),
        y: Math.max(24, Math.min(h - 24, b.y)),
        bend: 0,
      });
    }
    return {
      points: main.points, lengths: main.lengths, total: main.total,
      lanes, pads, spawnN: lanes.length, layout: diff.id, pathClear: diff.pathClear,
    };
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
    if (!path || !path.points) return Infinity;
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
  function distToPathNetwork(path, x, y) {
    if (!path) return Infinity;
    if (path.lanes && path.lanes.length) {
      let best = Infinity;
      for (const lane of path.lanes) best = Math.min(best, distToPath(lane, x, y));
      return best;
    }
    return distToPath(path, x, y);
  }
  function laneForEnemy(e) {
    if (!state.path) return null;
    if (state.path.lanes && state.path.lanes.length) {
      const i = Math.max(0, Math.min(state.path.lanes.length - 1, e.lane || 0));
      return state.path.lanes[i];
    }
    return state.path;
  }
  function enemyPos(e) {
    const lane = laneForEnemy(e);
    return lane ? posOnPath(lane, e.dist) : { x: 0, y: 0 };
  }
  function enemyPathTotal(e) {
    const lane = laneForEnemy(e);
    return lane ? lane.total : (state.path ? state.path.total : 0);
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
    const early = Math.min(wave, 10);
    const mid = Math.max(0, Math.min(wave, 22) - 10);
    const late = Math.max(0, Math.min(wave, 40) - 22);
    const deep = Math.max(0, wave - 40);
    // Steeper deep curve so endless is a real climb (cost-per-DPS tuned).
    const difficulty = (
      1 + early * BALANCE.hpEarly + mid * BALANCE.hpMid + late * BALANCE.hpLate
    ) * Math.pow(BALANCE.hpDeepBase, deep) * diff.hpMul;
    const bossN = bossCountForWave(wave, rng);
    const isBoss = bossN > 0;
    const count = Math.min(
      BALANCE.countCap,
      Math.floor((7 + Math.floor(wave * 1.35 + rng() * 3) + deep * 0.15) * diff.countMul)
    );
    const interval = Math.max(0.18, (0.9 - wave * 0.024 + (rng() - 0.5) * 0.1) * diff.intervalMul);
    const mix = [];
    const bossHpShare = bossN <= 1 ? 1 : (0.62 + 0.38 / bossN);
    const usedBosses = new Set();
    const bossPacks = [];
    for (let i = 0; i < bossN; i++) {
      bossPacks.push({
        type: pickBossType(wave, i, rng, usedBosses),
        n: 1, bossIndex: i, bossTotal: bossN, bossHpShare,
      });
    }
    for (const b of bossPacks) mix.push(b);
    const weights = {
      drone: 0.4 + rng() * 0.15,
      crawler: 0.28,
      armor: Math.min(0.45, 0.1 + wave * 0.022 + (diff.id === "nightmare" ? 0.1 : 0)),
      swarm: wave >= 3 ? 0.24 + rng() * 0.12 : 0,
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
    if (bossN > 0 && fodder.length) {
      const split = Math.ceil(fodder.length * 0.45);
      mix.length = 0;
      for (let i = 0; i < split; i++) mix.push(fodder[i]);
      for (const b of bossPacks) mix.push(b);
      for (let i = split; i < fodder.length; i++) mix.push(fodder[i]);
    } else {
      for (const f of fodder) mix.push(f);
    }
    const rewardFade = 1 / (1 + deep * BALANCE.rewardDeepFade);
    return {
      count, interval, mix, difficulty, isBoss, bossN,
      speedMul: diff.speedMul * (1 + Math.min(0.35, deep * 0.002)),
      rewardMul: diff.rewardMul * rewardFade * BALANCE.scrapKillScale,
      spawnLanes: (state.path && state.path.spawnN) || spawnCountForDifficulty(diff.id),
    };
  }

  function livingEnemyCount() {
    let n = 0;
    for (const e of state.enemies) if (e.alive) n++;
    return n;
  }
  function livingBossCount() {
    let n = 0;
    for (const e of state.enemies) if (e.alive && isBossEnemy(e)) n++;
    return n;
  }
  /** Gap after a wave's spawn queue empties before the next wave — overlaps are intentional. */
  function nextWaveDelay() {
    const living = livingEnemyCount();
    // Slightly longer when the field is already crowded, but never gated on a full clear.
    const crowd = Math.min(1.2, living * 0.045);
    return 1.6 + crowd;
  }

  const state = {
    mode: "hub", seed: null, difficulty: "normal", path: null,
    w: 390, h: 620, hp: 20, scrap: 155, score: 0, wave: 0,
    selectedTower: null, selectedBuilt: null,
    towers: [], enemies: [], projectiles: [], fx: [], particles: [],
    spawnQueue: [], spawnTimer: 0, betweenWaves: 0, awaitingStart: false, time: 0, frame: 0,
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
  function particleCap() {
    return settings.batterySaver ? MAX_PARTICLES_SAVER : MAX_PARTICLES;
  }
  function fxCap() {
    return settings.batterySaver ? MAX_FX_SAVER : MAX_FX;
  }
  function trimFx() {
    const cap = fxCap();
    if (state.fx.length > cap) state.fx.splice(0, state.fx.length - cap);
  }
  function shakeMul() {
    if (!motionAllowed()) return 0;
    if (settings.batterySaver) return Math.min(SHAKE_MUL[settings.shake] ?? 0, SHAKE_MUL.low);
    return SHAKE_MUL[settings.shake] ?? SHAKE_MUL.low;
  }
  function addShake(amount) {
    const mul = shakeMul();
    if (mul <= 0 || amount <= 0) return;
    state.shake = Math.min(3.2, state.shake + amount * mul);
  }
  function spawnParticles(x, y, color, n, speed = 60) {
    if (settings.particles === false) return;
    const budget = particleCap() - state.particles.length;
    let count = Math.min(n, Math.max(0, budget));
    if (settings.batterySaver) count = Math.ceil(count * 0.45);
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
    trimFx();
  }
  function syncLargeTap() {
    const on = !!settings.largeTap;
    document.documentElement.toggleAttribute("data-large-tap", on);
    const app = $("app");
    if (app) app.toggleAttribute("data-large-tap", on);
  }
  function syncPerfFlags() {
    const app = $("app");
    if (app) app.toggleAttribute("data-battery-saver", !!settings.batterySaver);
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
    "Prep phase: place towers on stone / bend pads.",
    "Socket elements (try Arc / Frost), then tap Start.",
    "Watch △ weak / □ resist pips — trial wins fights.",
  ];
  let coachTimer = null;
  function syncCoachDots(step) {
    const wrap = $("coach-steps");
    if (!wrap) return;
    wrap.querySelectorAll("span").forEach((el) => {
      const i = Number(el.dataset.step);
      el.classList.toggle("active", i === step);
      el.classList.toggle("done", i < step);
    });
  }
  function showCoach(step) {
    if (settings.tutorialDone || !els.coach) return;
    if (coachTimer) { clearTimeout(coachTimer); coachTimer = null; }
    if (step >= COACH_STEPS.length) {
      hideCoach(true);
      return;
    }
    settings.coachStep = step;
    saveJSON(STORAGE.settings, settings);
    els.coachText.textContent = COACH_STEPS[step];
    syncCoachDots(step);
    els.coach.classList.remove("hidden");
    // Final tip auto-clears so the first run stays under ~30s of coaching.
    if (step === COACH_STEPS.length - 1) {
      coachTimer = setTimeout(() => hideCoach(true), 4500);
    }
  }
  function hideCoach(done) {
    if (!els.coach) return;
    if (coachTimer) { clearTimeout(coachTimer); coachTimer = null; }
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

  let placePtr = null; // drag-to-place pointer session
  function syncPlaceCancel() {
    const btn = $("btn-place-cancel");
    if (!btn) return;
    const show = state.mode === "playing" && !!state.selectedTower;
    btn.classList.toggle("hidden", !show);
  }
  function syncStartBtn() {
    const btn = $("btn-start-wave");
    if (!btn) return;
    const show = state.mode === "playing" && !!state.awaitingStart && !!state.seed;
    btn.classList.toggle("hidden", !show);
    btn.disabled = !show;
  }
  function playerStartWaves() {
    if (state.mode !== "playing" || !state.awaitingStart) return;
    state.awaitingStart = false;
    state.betweenWaves = 0;
    syncStartBtn();
    beginWave();
    toast("Wave 1");
    saveRun();
    advanceCoach(1);
  }
  function cancelPlacement(silent) {
    if (!state.selectedTower && !state.ghost) return;
    state.selectedTower = null;
    state.ghost = null;
    placePtr = null;
    updateHUD();
    syncPlaceCancel();
    if (!silent) { sfx.cancel(); toast("Placement canceled"); }
  }

  function resize() {
    const wrap = $("stage-wrap");
    const rect = wrap.getBoundingClientRect();
    const dprCap = settings.batterySaver ? 1.25 : 2;
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    const cssW = Math.max(260, Math.floor(rect.width));
    const cssH = Math.max(320, Math.floor(rect.height));
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.w = cssW; state.h = cssH;
    if (state.seed) {
      state.path = generatePath(state.seed, state.w, state.h, state.difficulty);
      for (const t of state.towers) {
        if (t.nx != null) { t.x = t.nx * state.w; t.y = t.ny * state.h; }
      }
    }
  }

  function serializeRun() {
    return {
      seed: state.seed, difficulty: state.difficulty || "normal",
      isDaily: !!runIsDaily, dailyKey: runDailyKey || null,
      hp: state.hp, scrap: state.scrap, score: state.score, wave: state.wave,
      betweenWaves: state.betweenWaves, awaitingStart: !!state.awaitingStart,
      spawnTimer: state.spawnTimer, spawnQueue: state.spawnQueue,
      towers: state.towers.map((t) => ({
        type: t.type, nx: t.x / state.w, ny: t.y / state.h,
        level: t.level, cooldown: t.cooldown, levelCd: t.levelCd || 0, elements: t.elements || [],
      })),
      enemies: state.enemies.map((e) => ({
        type: e.type, dist: e.dist, hp: e.hp, maxHp: e.maxHp, speed: e.speed, lane: e.lane || 0,
        slow: e.slow, slowT: e.slowT, burn: e.burn, burnT: e.burnT,
        chillT: e.chillT, shred: e.shred, knockCd: e.knockCd || 0,
        stunT: e.stunT || 0, stunCd: e.stunCd || 0, freezeT: e.freezeT || 0,
        reward: e.reward, tags: e.tags,
        resist: e.resist, bossIndex: e.bossIndex, bossTotal: e.bossTotal, color: e.color, r: e.r,
        ability: e.ability, shield: e.shield, shieldMax: e.shieldMax, shieldCd: e.shieldCd,
        abilityT: e.abilityT, enraged: e.enraged, baseSpeed: e.baseSpeed, label: e.label,
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
    const level = t.level || 1;
    const tower = {
      type: t.type, x: t.nx * state.w, y: t.ny * state.h, nx: t.nx, ny: t.ny,
      level, cooldown: t.cooldown || 0, levelCd: t.levelCd || 0,
      elements: [...(t.elements || [])],
      aim: typeof t.aim === "number" ? t.aim : -Math.PI / 2,
      recoil: 0,
    };
    applyTowerLevelStats(tower);
    return tower;
  }
  function loadRun() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE.run) || "null");
      if (!data || !data.seed) return false;
      state.seed = data.seed;
      state.difficulty = data.difficulty || "normal";
      runIsDaily = !!data.isDaily;
      runDailyKey = data.dailyKey || (runIsDaily ? dailyKey() : null);
      meta.selectedDifficulty = state.difficulty;
      state.path = generatePath(state.seed, state.w, state.h, state.difficulty);
      state.hp = data.hp; state.scrap = data.scrap; state.score = data.score; state.wave = data.wave;
      state.betweenWaves = data.betweenWaves || 0;
      state.awaitingStart = data.awaitingStart != null
        ? !!data.awaitingStart
        : (data.wave === 0 && !(data.spawnQueue && data.spawnQueue.length));
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
          ability: e.ability || def.ability || null,
          label: e.label || def.label,
          shield: e.shield || 0, shieldMax: e.shieldMax || 0, shieldCd: e.shieldCd || 0,
          abilityT: e.abilityT || 0, enraged: !!e.enraged, baseSpeed: e.baseSpeed || e.speed,
          slow: e.slow || 1, slowT: e.slowT || 0, burn: e.burn || 0, burnT: e.burnT || 0,
          chillT: e.chillT || 0, shred: e.shred || 0, knockCd: e.knockCd || 0,
          stunT: e.stunT || 0, stunCd: e.stunCd || 0, freezeT: e.freezeT || 0,
          matchFxAt: 0, reward: e.reward, alive: true, hitFlash: 0, lane: e.lane || 0,
        };
      });
      state.projectiles = []; state.fx = []; state.particles = [];
      state.selectedBuilt = null; state.selectedTower = null;
      state.mode = "paused";
      syncStartBtn();
      return true;
    } catch { return false; }
  }

  function claimMilestones(wave, score, diffId) {
    if (!meta.milestones) meta.milestones = {};
    const newly = [];
    for (const m of MILESTONES) {
      if (meta.milestones[m.id]) continue;
      let ok = false;
      if (m.kind === "wave") {
        const rec = (meta.bestByDifficulty && meta.bestByDifficulty[m.difficulty]) || { wave: 0 };
        const reached = m.difficulty === diffId ? Math.max(rec.wave, wave) : rec.wave;
        ok = reached >= m.wave;
      } else if (m.kind === "dailies") {
        ok = (meta.dailiesCompleted || 0) >= m.count;
      }
      if (!ok) continue;
      meta.milestones[m.id] = { at: Date.now(), wave, score };
      meta.chips += m.chips || 0;
      newly.push(m.label + (m.chips ? ` (+${m.chips})` : ""));
    }
    return newly;
  }

  function refreshMilestonesUI() {
    const el = $("milestone-list");
    if (!el) return;
    const claimed = meta.milestones || {};
    el.innerHTML = MILESTONES.map((m) => {
      const done = !!claimed[m.id];
      return `<li class="${done ? "done" : ""}"><span>${m.label}</span><span>${done ? "✓" : m.chips + "c"}</span></li>`;
    }).join("");
  }

  function startNewRun(opts = {}) {
    syncDifficultyUnlocks();
    runIsDaily = !!opts.daily;
    runDailyKey = opts.dailyKey || null;
    if (!runIsDaily) {
      if (!isDifficultyUnlocked(meta.selectedDifficulty)) meta.selectedDifficulty = "normal";
      state.difficulty = meta.selectedDifficulty || "normal";
      state.seed = newRunSeed();
    } else {
      state.difficulty = "normal";
      state.seed = dailySeedFor(runDailyKey || dailyKey());
    }
    state.path = generatePath(state.seed, state.w, state.h, state.difficulty);
    const diff = currentDiff();
    state.hp = diff.id === "nightmare" ? 16 : diff.id === "hard" ? 18 : 20;
    state.scrap = Math.floor(BALANCE.scrapStart * (diff.id === "nightmare" ? 0.85 : diff.id === "hard" ? 0.95 : 1));
    state.score = 0; state.wave = 0;
    state.towers = []; state.enemies = []; state.projectiles = []; state.fx = []; state.particles = [];
    state.spawnQueue = []; state.spawnTimer = 0; state.betweenWaves = 0;
    state.awaitingStart = true; // Prep: place freely; waves wait for Start.
    state.selectedBuilt = null; state.selectedTower = null; state.ghost = null;
    placePtr = null;
    state.shake = 0; state.flash = 0;
    state.mode = "playing";
    showScreen(null);
    showBanner("Prep · place towers");
    ensureAudio();
    sfx.start();
    syncMusic();
    saveJSON(STORAGE.meta, meta);
    saveRun(); updateHUD();
    syncStartBtn();
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
    const dailyBonus = runIsDaily && !abandoned && wave >= 8 ? 18 : 0;
    const chips = Math.floor((abandoned ? wave * 3 + score / 55 : wave * 6.5 + score / 26) * diff.chipMul) + dailyBonus;
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
    if (runIsDaily && runDailyKey) {
      if (meta.lastDailyKey !== runDailyKey) {
        meta.dailiesCompleted = (meta.dailiesCompleted || 0) + 1;
        meta.lastDailyKey = runDailyKey;
      }
      const db = meta.lastDailyBest || { wave: 0, score: 0 };
      if (wave > (db.wave || 0)) db.wave = wave;
      if (score > (db.score || 0)) db.score = score;
      meta.lastDailyBest = db;
    }
    const mile = claimMilestones(wave, score, diff.id);
    for (const m of mile) newly.push(m);
    saveJSON(STORAGE.meta, meta);
    if (wave > best.wave) best.wave = wave;
    if (score > best.score) best.score = score;
    saveJSON(STORAGE.best, best);
    const wasDaily = runIsDaily;
    runIsDaily = false; runDailyKey = null;
    clearRun();
    state.mode = "over";
    hideCoach(false);
    els.overSummary.textContent =
      `${wasDaily ? "Daily · " : ""}${diff.name} · Wave ${wave} · Score ${formatCompact(score)}` +
      (abandoned ? " (abandoned)" : "");
    els.overChips.textContent =
      `+${Math.max(0, chips)} chips` +
      (dailyBonus ? ` · daily +${dailyBonus}` : "") +
      (newly.length ? ` · ${newly.join(", ")}` : "");
    showScreen("over"); refreshHub();
    sfx.over();
    addShake(1.1);
  }

  function showScreen(name) {
    els.hub.classList.toggle("hidden", name !== "hub");
    els.upgrades.classList.toggle("hidden", name !== "upgrades");
    els.pause.classList.toggle("hidden", name !== "pause");
    els.over.classList.toggle("hidden", name !== "over");
    if (els.codex) els.codex.classList.toggle("hidden", name !== "codex");
    if (els.settings) els.settings.classList.toggle("hidden", name !== "settings");
    // Layout mode: play chrome only when no full-screen sheet is up (stops HUD/dock stacking).
    const app = $("app");
    if (app) {
      const ui = name == null ? "play" : (name === "hub" ? "hub" : "sheet");
      app.setAttribute("data-ui", ui);
      const chromeHidden = ui !== "play";
      if (els.inspect && chromeHidden) els.inspect.classList.add("hidden");
      if (chromeHidden) {
        hideCoach(false);
        cancelPlacement(true);
      }
    }
    syncPlaceCancel();
    syncStartBtn();
  }

  function refreshHub() {
    meta = loadJSON(STORAGE.meta, defaultMeta());
    if (!meta.unlockedDifficulties) meta.unlockedDifficulties = { normal: true };
    if (!meta.bestByDifficulty) meta.bestByDifficulty = defaultMeta().bestByDifficulty;
    syncDifficultyUnlocks();
    best = loadJSON(STORAGE.best, defaultBest());
    const diffId = meta.selectedDifficulty || "normal";
    const rec = meta.bestByDifficulty[diffId] || { wave: 0, score: 0 };
    els.bestWave.textContent = formatCompact(rec.wave || best.wave || 0);
    const bestScore = rec.score || best.score || 0;
    els.bestScore.textContent = formatCompact(bestScore);
    els.bestScore.title = String(bestScore);
    els.chips.textContent = formatCompact(meta.chips);
    els.chips.title = String(meta.chips);
    els.btnContinue.classList.toggle("hidden", !hasSavedRun());
    const dailyBtn = $("btn-daily");
    if (dailyBtn) {
      const key = dailyKey();
      const doneToday = meta.lastDailyKey === key;
      dailyBtn.textContent = doneToday ? "Daily · Replay" : "Daily Rift";
      dailyBtn.title = "Seed " + dailySeedFor(key);
      const hint = $("daily-hint");
      if (hint) {
        const bestD = meta.lastDailyBest || { wave: 0, score: 0 };
        hint.textContent = doneToday
          ? `Today’s best: W${bestD.wave || 0} · ${formatCompact(bestD.score || 0)} · ${meta.dailiesCompleted || 0} dailies`
          : `Shared seed ${key} · clear W8 for bonus chips`;
      }
    }
    refreshMilestonesUI();
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
    bindToggle("opt-haptics", "haptics");
    bindToggle("opt-dmgnumbers", "dmgNumbers");
    const bindPref = (id, key, after) => {
      const el = $(id);
      if (!el) return;
      el.checked = !!settings[key];
      el.onchange = () => {
        settings[key] = !!el.checked;
        saveSettings();
        if (after) after();
        sfx.ui();
      };
    };
    bindPref("opt-batterysaver", "batterySaver", () => {
      if (settings.batterySaver) {
        if (state.particles.length > particleCap()) state.particles.length = particleCap();
        trimFx();
      }
      syncPerfFlags();
      resize();
      toast(settings.batterySaver ? "Battery saver on" : "Battery saver off");
    });
    bindPref("opt-largetap", "largeTap", () => {
      syncLargeTap();
      toast(settings.largeTap ? "Large taps on" : "Large taps off");
    });
    const musicEl = $("opt-music");
    if (musicEl) {
      musicEl.checked = !!settings.music;
      musicEl.onchange = () => {
        settings.music = !!musicEl.checked;
        saveSettings();
        ensureAudio();
        syncMusic();
        sfx.ui();
      };
    }
    const vol = $("opt-volume");
    const volVal = $("opt-volume-val");
    if (vol) {
      vol.value = String(Math.round(settings.volume * 100));
      if (volVal) volVal.textContent = vol.value + "%";
      vol.oninput = () => {
        settings.volume = Math.max(0, Math.min(1, Number(vol.value) / 100));
        if (volVal) volVal.textContent = Math.round(settings.volume * 100) + "%";
        ensureAudio();
        syncMasterGain();
      };
      vol.onchange = () => {
        saveSettings();
        if (settings.volume > 0 && settings.muted) {
          settings.muted = false;
          syncMuteUI();
          saveSettings();
        }
        syncMasterGain();
        sfx.ui();
      };
    }
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
    const layoutNote = sel.id === "nightmare"
      ? "short harsh path"
      : sel.id === "hard"
        ? "tighter bends"
        : "open layout";
    hint.textContent = isDifficultyUnlocked(meta.selectedDifficulty)
      ? `${sel.name}: ×${sel.hpMul.toFixed(2)} HP · ${layoutNote} · ×${sel.chipMul} chips`
      : unlockHint(meta.selectedDifficulty);
  }

  /** Compact HUD numbers so large scores/scrap never blow out the layout. */
  function formatCompact(n) {
    const raw = Number(n) || 0;
    const v = Math.floor(Math.abs(raw));
    const sign = raw < 0 ? "-" : "";
    const trim = (x) => {
      const s = x.toFixed(1);
      return s.endsWith(".0") ? s.slice(0, -2) : s;
    };
    if (v >= 1e9) return sign + trim(v / 1e9) + "B";
    if (v >= 1e6) return sign + trim(v / 1e6) + "M";
    if (v >= 1e4) {
      const k = v / 1e3;
      if (k >= 999.95) return sign + trim(v / 1e6) + "M";
      return sign + trim(k) + "K";
    }
    return sign + String(v);
  }

  function updateHUD() {
    els.hp.textContent = String(Math.max(0, state.hp));
    const scrap = Math.floor(state.scrap);
    const score = Math.floor(state.score);
    els.scrap.textContent = formatCompact(scrap);
    els.scrap.title = String(scrap);
    const dShort = ({ normal: "N", hard: "H", nightmare: "NM" })[state.difficulty] || "N";
    els.wave.textContent = state.awaitingStart
      ? `${dShort} · Prep`
      : `${dShort} · W${Math.max(1, state.wave)}`;
    els.score.textContent = formatCompact(score);
    els.score.title = String(score);
    if (els.wave && els.wave.parentElement) {
      els.wave.parentElement.title = state.awaitingStart
        ? `${dShort} · Prep — tap Start when ready`
        : `${dShort} · Wave ${Math.max(1, state.wave)} · Score ${score}`;
    }
    refreshTowerButtons();
    updateInspect();
    syncPlaceCancel();
    syncStartBtn();
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
    // Steeper curve so endless scrap can't buy infinite power.
    const base = BASE_TOWER[t.type].cost;
    return Math.floor(base * (0.62 + t.level * 0.58 + Math.pow(Math.max(0, t.level - 3), 1.35) * 0.35));
  }
  function towerLevelReady(t) {
    return !t.levelCd || t.levelCd <= 0;
  }
  function applyTowerLevelStats(t) {
    const base = towerStats(t.type);
    const soft = 1 + Math.max(0, t.level - 6) * BALANCE.levelDmgSoft;
    t.damage = base.damage * (1 + (t.level - 1) * BALANCE.levelDmgPer) / soft;
    t.range = base.range * (1 + (t.level - 1) * BALANCE.levelRangePer);
    t.fireRate = base.fireRate * Math.max(0.48, 1 - (t.level - 1) * BALANCE.levelRatePer);
    if (base.splash) t.splash = base.splash * (1 + (t.level - 1) * 0.1);
    Object.assign(t, {
      hitsAir: base.hitsAir, hitsGround: base.hitsGround,
      airBonus: base.airBonus, armorPenalty: base.armorPenalty, armorBonus: base.armorBonus,
      slow: base.slow, slowDur: base.slowDur, crit: base.crit, burn: base.burn,
      chain: base.chain, pierce: base.pierce, bossBonus: base.bossBonus,
      color: base.color, sell: base.sell,
    });
  }
  function levelTower(t, opts = {}) {
    if (!t || !towerLevelReady(t)) return false;
    const cost = upgradeCost(t);
    if (state.scrap < cost) return false;
    state.scrap -= cost;
    t.level += 1;
    t.levelCd = BALANCE.levelCd;
    applyTowerLevelStats(t);
    if (!opts.silent) {
      burstUpgrade(t.x, t.y, t.color);
      sfx.upgrade();
    }
    return true;
  }
  function autoLevelAllTowers() {
    if (!state.towers.length) { toast("No towers yet"); return; }
    let n = 0;
    // Cheapest-first so scrap spreads.
    const order = state.towers.map((t, i) => i).sort((a, b) => upgradeCost(state.towers[a]) - upgradeCost(state.towers[b]));
    for (const i of order) {
      const t = state.towers[i];
      if (!towerLevelReady(t)) continue;
      if (!levelTower(t, { silent: true })) continue;
      n += 1;
      burstUpgrade(t.x, t.y, t.color);
    }
    if (n) { sfx.upgrade(); toast(`Leveled ${n} tower${n > 1 ? "s" : ""}`); updateHUD(); saveRun(); }
    else toast("On cooldown or need scrap");
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
      ? `<span class="match-tip">Hit feedback shows WEAK / RESIST — △ weak · □ resist on foes.</span><br>`
      : `<span class="match-tip">Socket up to 2. Pair for combos; learn matchups in combat.</span><br>`;
    els.inspectText.innerHTML =
      `<strong>${BASE_TOWER[sel.type].name}</strong> Lv${sel.level} · ${BASE_TOWER[sel.type].blurb}<br>` +
      matchTip +
      `${describeCombo(elsList)} · socket ${elsList.length}/${MAX_ELEMENTS}` +
      (elsList.length < MAX_ELEMENTS ? ` · next ${elementCost(sel)} scrap` : "");
    els.btnSell.disabled = false;
    const ready = towerLevelReady(sel);
    const upCost = upgradeCost(sel);
    els.btnUpgrade.disabled = !ready || state.scrap < upCost;
    els.btnUpgrade.textContent = !ready ? `Up ${Math.ceil(sel.levelCd || 0)}s` : `Up ${upCost}`;
    if (els.btnAutoLevel) {
      const anyReady = state.towers.some((t) => towerLevelReady(t) && state.scrap >= upgradeCost(t));
      els.btnAutoLevel.disabled = !anyReady;
    }
    document.querySelectorAll(".el-btn").forEach((btn) => {
      const el = btn.dataset.el;
      const def = ELEMENTS[el];
      const owned = elsList.includes(el);
      const full = elsList.length >= MAX_ELEMENTS;
      const label = def ? def.name : (el[0].toUpperCase() + el.slice(1));
      btn.classList.toggle("active", owned);
      btn.disabled = owned || (full && !owned) || state.scrap < elementCost(sel);
      btn.textContent = owned ? label + " ✓" : label;
      if (def) btn.title = `${def.name}: ${def.tip}`;
    });
  }

  function showBanner(text) {
    const b = els.banner;
    if (!b) return;
    b.textContent = text;
    b.classList.remove("hidden", "show");
    // Subtle non-blocking chip — short dwell, no stage takeover.
    requestAnimationFrame(() => b.classList.add("show"));
    clearTimeout(showBanner._t);
    showBanner._t = setTimeout(() => {
      b.classList.remove("show");
      setTimeout(() => b.classList.add("hidden"), 220);
    }, 700);
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
    els.chipsUp.textContent = `${formatCompact(meta.chips)} chips`;
    if (els.chipsUp) els.chipsUp.title = `${meta.chips} chips`;
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === upgradeTab));
    const list = els.upgradeList;
    list.innerHTML = "";
    list.className = "upgrade-tree";
    const tree = UPGRADE_TREES[upgradeTab] || [];
    const maxRow = tree.reduce((m, u) => Math.max(m, u.row || 0), 0);
    const maxCol = tree.reduce((m, u) => Math.max(m, u.col || 0), 0);
    const grid = document.createElement("div");
    grid.className = "up-tree-grid";
    grid.style.setProperty("--up-cols", String(maxCol + 1));
    grid.style.setProperty("--up-rows", String(maxRow + 1));
    // Connector layer
    const wires = document.createElement("div");
    wires.className = "up-tree-wires";
    wires.setAttribute("aria-hidden", "true");
    for (const u of tree) {
      if (!u.req) continue;
      const parent = tree.find((p) => p.id === u.req);
      if (!parent) continue;
      const wire = document.createElement("span");
      wire.className = "up-wire" + (ownedRank(u.req) >= (u.reqRank || 1) ? " lit" : "");
      const x1 = (parent.col + 0.5) / (maxCol + 1);
      const y1 = (parent.row + 0.82) / (maxRow + 1);
      const x2 = (u.col + 0.5) / (maxCol + 1);
      const y2 = (u.row + 0.18) / (maxRow + 1);
      wire.style.left = `${Math.min(x1, x2) * 100}%`;
      wire.style.width = `${Math.abs(x2 - x1) * 100}%`;
      wire.style.top = `${y1 * 100}%`;
      wire.style.height = `${Math.max(8, (y2 - y1) * 100)}%`;
      if (Math.abs(x2 - x1) < 0.02) wire.classList.add("vert");
      else wire.classList.add("elbow");
      wires.appendChild(wire);
    }
    grid.appendChild(wires);
    for (const u of tree) {
      const rank = ownedRank(u.id);
      const max = u.max || 1;
      const full = rank >= max;
      const reqOk = reqSatisfied(u);
      const nextCost = full ? 0 : upgradeCostAt(u, rank + 1);
      const node = document.createElement("button");
      node.type = "button";
      node.className = "up-node" + (rank ? " owned" : "") + (full ? " maxed" : "") + (!reqOk && !rank ? " locked" : "");
      node.style.gridColumn = String((u.col || 0) + 1);
      node.style.gridRow = String((u.row || 0) + 1);
      node.innerHTML =
        `<span class="up-ico up-ico-${u.icon || "star"}" aria-hidden="true"></span>` +
        `<span class="up-body"><span class="up-name">${u.name}</span>` +
        `<span class="up-desc">${u.desc}</span>` +
        `<span class="up-rank">${rank}/${max}</span></span>` +
        `<span class="up-cost">${full ? "MAX" : nextCost}</span>`;
      node.disabled = full || !reqOk || meta.chips < nextCost;
      if (!full && reqOk) {
        node.addEventListener("click", () => {
          const r = ownedRank(u.id);
          if (r >= (u.max || 1) || !reqSatisfied(u)) return;
          const cost = upgradeCostAt(u, r + 1);
          if (meta.chips < cost) return;
          meta.chips -= cost;
          meta.owned[u.id] = r + 1;
          saveJSON(STORAGE.meta, meta); sfx.buy();
          renderUpgrades(); refreshHub();
        });
      }
      grid.appendChild(node);
    }
    list.appendChild(grid);
  }

  function beginWave() {
    state.wave += 1;
    const plan = wavePlan(state.seed, state.wave, state.difficulty);
    state.spawnQueue = [];
    const laneN = (state.path && state.path.spawnN) || plan.spawnLanes || 1;
    let laneCursor = 0;
    for (const pack of plan.mix) {
      for (let i = 0; i < pack.n; i++) {
        const lane = laneCursor % laneN;
        laneCursor += 1;
        state.spawnQueue.push({
          type: pack.type, difficulty: plan.difficulty,
          speedMul: plan.speedMul, rewardMul: plan.rewardMul,
          bossIndex: pack.bossIndex, bossTotal: pack.bossTotal, bossHpShare: pack.bossHpShare,
          lane,
        });
      }
    }
    state.spawnTimer = 0.35; state.betweenWaves = 0; state.awaitingStart = false;
    syncStartBtn();
    let banner = `W${state.wave}`;
    if (plan.bossN > 1) {
      const names = [...new Set(plan.mix.filter((p) => isBossType(p.type)).map((p) => (ENEMY[p.type] || {}).label || p.type))];
      banner = names.length <= 2
        ? `${names.join(" + ")} · W${state.wave}`
        : `×${plan.bossN} · W${state.wave}`;
    } else if (plan.isBoss) {
      const b = plan.mix.find((p) => isBossType(p.type));
      banner = `${((b && ENEMY[b.type]) || {}).label || "Boss"} · W${state.wave}`;
    }
    if (livingBossCount() > 0 && plan.isBoss) banner = `Overlap · ${banner}`;
    showBanner(banner);
    sfx.wave();
    saveRun();
  }
  function spawnEnemy(type, difficulty, speedMul = 1, rewardMul = 1, meta = {}) {
    const def = ENEMY[type] || ENEMY.drone;
    const boss = isBossType(type);
    const bossTotal = meta.bossTotal || 1;
    const bossIndex = meta.bossIndex || 0;
    const hpShare = boss ? (meta.bossHpShare || (bossTotal <= 1 ? 1 : 0.7 + 0.3 / bossTotal)) : 1;
    const bossScale = boss ? (1 + state.wave * 0.04) * hpShare : 1;
    const hp = Math.floor(def.hp * difficulty * bossScale);
    const jitter = 0.95 + (hashSeed(state.seed + type + state.enemies.length) % 100) / 500;
    // Multi-boss packs move a touch slower so they stay readable on the rift.
    const packSlow = boss && bossTotal > 1 ? Math.max(0.78, 1 - (bossTotal - 1) * 0.07) : 1;
    const r = boss && bossTotal > 1 ? def.r * (0.9 + (bossIndex % 3) * 0.04) : def.r;
    const ability = def.ability || null;
    const shieldMax = ability === "carapace" ? Math.floor(hp * 0.28) : 0;
    state.enemies.push({
      type, dist: 0, hp, maxHp: hp,
      speed: def.speed * jitter * speedMul * packSlow,
      baseSpeed: def.speed * jitter * speedMul * packSlow,
      reward: Math.floor(def.reward * (0.9 + difficulty * 0.05) * rewardMul * (boss && bossTotal > 1 ? 0.85 : 1)),
      r, color: def.color, shape: def.shape, tags: [...def.tags],
      resist: { ...(def.resist || {}) },
      label: def.label || type,
      ability, bossIndex, bossTotal,
      shield: shieldMax, shieldMax, shieldCd: 0,
      abilityT: 1.5 + Math.random() * 1.5,
      enraged: false,
      slow: 1, slowT: 0, burn: 0, burnT: 0, chillT: 0, shred: 0, knockCd: 0,
      stunT: 0, stunCd: 0, freezeT: 0, matchFxAt: 0, alive: true, hitFlash: 0,
      lane: meta.lane || 0,
    });
  }

  function placeTower(x, y) {
    const type = state.selectedTower;
    if (!type || !state.path) return;
    const stats = towerStats(type);
    if (state.scrap < stats.cost) { toast("Not enough scrap"); return; }
    const clear = (state.path && state.path.pathClear) || layoutForDifficulty(state.difficulty).pathClear || 28;
    if (distToPathNetwork(state.path, x, y) < clear) { toast("Too close to the rift"); return; }
    if (x < 16 || y < 16 || x > state.w - 16 || y > state.h - 16) return;
    for (const t of state.towers) {
      if (Math.hypot(t.x - x, t.y - y) < 36) { toast("Too close to another tower"); return; }
    }
    state.scrap -= stats.cost;
    // Snap to nearest bend pad when close — guarantees a spot at each bend.
    if (state.path.pads && state.path.pads.length) {
      let best = null, bestD = Math.max(22, clear + 2);
      for (const pad of state.path.pads) {
        const d = Math.hypot(pad.x - x, pad.y - y);
        if (d < bestD) { bestD = d; best = pad; }
      }
      if (best) { x = best.x; y = best.y; }
    }
    state.towers.push({
      type, x, y, nx: x / state.w, ny: y / state.h,
      level: 1, cooldown: 0, levelCd: 0, elements: [], ...stats,
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
      const p = enemyPos(e);
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
    if (tower.armorBonus && armored) mul *= tower.armorBonus;
    if (tower.bossBonus && isBossEnemy(enemy)) mul *= 1 + tower.bossBonus;

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
      if (has("arc") && armored) mul *= 1.3;
      if (has("frost") && enemy.tags.includes("fast")) mul *= 1.2;
      if (has("frost") && swarm) mul *= 1.15;
    }

    if (key === "arc+fire") mul *= 1.35;
    if (key === "fire+frost" && armored) mul *= 1.4;
    if (key === "arc+frost" && (enemy.stunT > 0 || enemy.freezeT > 0)) mul *= 1.25;

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
    const p = enemyPos(enemy);
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
    if (has("arc")) {
      const rf = resistFactor("arc");
      const stunCd = enemy.stunCd || 0;
      if (stunCd <= 0 && rf > 0.35) {
        const dur = (key === "arc+earth" || key === "arc+frost" ? 0.55 : 0.28) * Math.min(1.2, rf);
        enemy.stunT = Math.max(enemy.stunT || 0, dur);
        enemy.stunCd = key === "arc+earth" ? 1.4 : 1.8;
        if (Math.random() < 0.35) {
          state.fx.push({ kind: "text", x: p.x, y: p.y - 20, t: 0.4, text: "SHOCK", color: ELEMENTS.arc.color });
        }
      }
    }
    if (has("frost")) {
      const rf = resistFactor("frost");
      const deep = key === "frost+water" || key === "arc+frost" || key === "earth+frost";
      const freezeAmt = deep ? 0.12 : 0.28;
      const slowAmt = 1 - (1 - freezeAmt) * rf;
      enemy.slow = Math.min(enemy.slow, Math.min(0.95, Math.max(0.08, slowAmt)));
      enemy.slowT = Math.max(enemy.slowT, (deep ? 2.4 : 1.4) * Math.min(1.25, rf));
      enemy.freezeT = Math.max(enemy.freezeT || 0, (deep ? 1.6 : 0.9) * Math.min(1.2, rf));
      if (key === "earth+frost") {
        enemy.shred = Math.min(0.5, (enemy.shred || 0) + 0.1 * rf);
      }
    }

    if (key === "fire+water") {
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
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
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 55) {
          e.burn = Math.max(e.burn, 6);
          e.burnT = Math.max(e.burnT, 1.8);
        }
      }
    }
    if (key === "arc+water") {
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 48) {
          e.hp -= dealt * 0.28;
          e.stunT = Math.max(e.stunT || 0, 0.2);
          if (e.hp <= 0) killEnemy(e);
        }
      }
      pushCombatFx({ kind: "blast", x: p.x, y: p.y, t: 0.28, r: 48, color: ELEMENTS.arc.color });
      spawnParticles(p.x, p.y, ELEMENTS.arc.color, 10, 80);
    }
    if (key === "arc+earth") {
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 50) {
          e.stunT = Math.max(e.stunT || 0, 0.35);
          e.stunCd = Math.max(e.stunCd || 0, 1.1);
        }
      }
      pushCombatFx({ kind: "ring", x: p.x, y: p.y, t: 0.35, r0: 10, r1: 50, color: ELEMENTS.earth.color });
    }
    if (key === "arc+wind") {
      let bestD = Infinity, second = null;
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < 70 && d < bestD) { bestD = d; second = e; }
      }
      if (second) {
        const q = enemyPos(second);
        second.hp -= dealt * 0.55;
        if (settings.hitFlash !== false) second.hitFlash = 0.1;
        second.stunT = Math.max(second.stunT || 0, 0.18);
        state.fx.push({ kind: "beam", x: p.x, y: p.y, x2: q.x, y2: q.y, t: 0.12, color: ELEMENTS.arc.color });
        pushCombatFx({ kind: "spark", x: q.x, y: q.y, t: 0.22, color: ELEMENTS.arc.color });
        if (second.hp <= 0) killEnemy(second);
      }
    }
    if (key === "frost+wind") {
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 58) {
          e.slow = Math.min(e.slow, 0.45);
          e.slowT = Math.max(e.slowT, 1.2);
          e.freezeT = Math.max(e.freezeT || 0, 0.7);
          e.chillT = Math.max(e.chillT, 1.2);
        }
      }
      pushCombatFx({ kind: "blast", x: p.x, y: p.y, t: 0.32, r: 58, color: ELEMENTS.frost.color });
      spawnParticles(p.x, p.y, ELEMENTS.frost.color, 12, 70);
    }
    if (key === "fire+frost" && enemy.tags.includes("armored")) {
      enemy.shred = Math.min(0.5, (enemy.shred || 0) + 0.18);
      if (Math.random() < 0.4) {
        state.fx.push({ kind: "text", x: p.x, y: p.y - 22, t: 0.4, text: "MELT", color: ELEMENTS.frost.color });
      }
    }
  }

  function killEnemy(e, opts = {}) {
    if (!e.alive) return;
    e.alive = false;
    const p = enemyPos(e);
    state.scrap += e.reward;
    state.score += e.reward * 2 + Math.floor(state.wave);
    pushCombatFx({ kind: "pop", x: p.x, y: p.y, t: 0.4, color: e.color });
    spawnParticles(p.x, p.y, e.color, isBossEnemy(e) ? 28 : 12, isBossEnemy(e) ? 140 : 90);
    if (isBossEnemy(e)) addShake(1.15);
    else addShake(0.22);
    sfx.kill();

    if (opts.magma) {
      for (const o of state.enemies) {
        if (!o.alive) continue;
        const q = enemyPos(o);
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
    const matchMul = damageMultiplier(tower, e);
    let dmg = amount * matchMul;
    let didCrit = false;
    if (opts.critChance && Math.random() < opts.critChance) {
      dmg *= 2;
      didCrit = true;
      const p = enemyPos(e);
      state.fx.push({ kind: "text", x: p.x, y: p.y - 14, t: 0.5, text: "CRIT", color: "#ffb34a" });
      addShake(0.4);
    }
    if (comboKey(tower.elements || []) === "water+wind" && e.chillT > 0) {
      const p = enemyPos(e);
      state.fx.push({ kind: "text", x: p.x, y: p.y - 18, t: 0.45, text: "SHATTER", color: "#4db8c4" });
    }
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, dmg);
      e.shield -= absorbed;
      dmg -= absorbed;
      e.shieldCd = 4.5;
      if (dmg <= 0) {
        if (settings.hitFlash !== false) e.hitFlash = 0.08;
        const sp = enemyPos(e);
        pushCombatFx({ kind: "spark", x: sp.x, y: sp.y, t: 0.2, color: "#d8d0c4" });
        return absorbed;
      }
    }
    e.hp -= dmg;
    if (settings.hitFlash !== false) e.hitFlash = 0.12;
    applyOnHitEffects(tower, e, dmg);
    const p = enemyPos(e);
    pushCombatFx({ kind: "spark", x: p.x, y: p.y, t: 0.28, color: opts.color || tower.color });
    // Teach matchups in combat: occasional WEAK / RESIST callouts (ICD per foe).
    const elsArr = tower.elements || [];
    if (elsArr.length && !opts.silentMatch) {
      const now = performance.now();
      const cdUntil = e.matchFxAt || 0;
      if (now >= cdUntil) {
        if (matchMul >= 1.25) {
          state.fx.push({ kind: "text", x: p.x, y: p.y - e.r - 20, t: 0.5, text: "WEAK", color: "#6fbf8a" });
          e.matchFxAt = now + 900;
        } else if (matchMul <= 0.75) {
          state.fx.push({ kind: "text", x: p.x, y: p.y - e.r - 20, t: 0.5, text: "RESIST", color: "#a89a8c" });
          e.matchFxAt = now + 900;
        }
      }
    }
    if (settings.dmgNumbers !== false && dmg >= 1) {
      const shown = Math.max(1, Math.round(dmg));
      let numColor = didCrit ? "#ffb34a" : (opts.color || "#f3ebe2");
      if (!didCrit && elsArr.length) {
        if (matchMul >= 1.25) numColor = "#9fe0b0";
        else if (matchMul <= 0.75) numColor = "#9a9088";
      }
      state.fx.push({
        kind: "text",
        x: p.x + (Math.random() - 0.5) * 10,
        y: p.y - e.r - 8,
        t: 0.55,
        text: String(shown),
        color: numColor,
      });
    }
    spawnParticles(p.x, p.y, opts.color || tower.color, 4, 55);
    sfx.hit();
    if (e.hp <= 0) {
      const magma = comboKey(tower.elements || []) === "earth+fire" ? dmg * 0.9 : 0;
      killEnemy(e, { magma });
    }
    return dmg;
  }

  function fireTower(tower, target) {
    const p = enemyPos(target);
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
          const q = enemyPos(e);
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < 70 && d < bestD) { bestD = d; second = e; }
        }
        if (second) {
          const q = enemyPos(second);
          damageEnemy(second, tower.damage * 0.7, tower, { color: tint });
          state.fx.push({ kind: "beam", x: p.x, y: p.y, x2: q.x, y2: q.y, t: 0.1, color: tint });
        }
      }
    } else if (tower.type === "spire") {
      // Pierce line: hit primary + further foes along the aim ray.
      const ang = tower.aim;
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const hits = [];
      for (const e of state.enemies) {
        if (!e.alive || !canTarget(tower, e)) continue;
        const q = enemyPos(e);
        const vx = q.x - tower.x, vy = q.y - tower.y;
        const along = vx * ux + vy * uy;
        if (along < 8 || along > tower.range) continue;
        const perp = Math.abs(vx * uy - vy * ux);
        if (perp > 16) continue;
        hits.push({ e, along });
      }
      hits.sort((a, b) => a.along - b.along);
      const pierce = Math.max(1, tower.pierce || 3);
      const end = hits[Math.min(hits.length, pierce) - 1];
      const ex = end ? enemyPos(end.e).x : tower.x + ux * tower.range;
      const ey = end ? enemyPos(end.e).y : tower.y + uy * tower.range;
      state.fx.push({ kind: "beam", x: tower.x, y: tower.y, x2: ex, y2: ey, t: 0.16, color: tint });
      hits.slice(0, pierce).forEach((h, i) => {
        damageEnemy(h.e, tower.damage * (1 - i * 0.12), tower, { color: tint, critChance: tower.crit || 0 });
      });
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

    // Prep gate: no auto-spawn until player taps Start.
    if (!state.awaitingStart) {
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
          if (isBossType(next.type)) {
            // Space bosses along the path so packs don't stack into one blob.
            state.spawnTimer = plan.interval * (3.2 + (next.bossIndex || 0) * 0.75);
          } else {
            state.spawnTimer = plan.interval * (next.type === "swarm" ? 0.35 : 1);
          }
        }
      } else if (state.betweenWaves <= 0 && state.wave > 0) {
        // Timer advance: next wave starts even if foes remain (overlaps OK).
        state.enemies = state.enemies.filter((e) => e.alive);
        state.betweenWaves = nextWaveDelay();
        state.scrap += Math.floor(BALANCE.scrapWaveBase + state.wave * BALANCE.scrapWavePer);
        saveRun();
      }
    }

    const broodSpawns = [];
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (e.hitFlash > 0) e.hitFlash -= step;
      if (e.knockCd > 0) e.knockCd -= step;
      if (e.stunCd > 0) e.stunCd -= step;
      if (e.stunT > 0) e.stunT -= step;
      if (e.freezeT > 0) e.freezeT -= step;
      if (e.slowT > 0) { e.slowT -= step; if (e.slowT <= 0) e.slow = 1; }
      if (e.chillT > 0) e.chillT -= step;
      if (e.burnT > 0) {
        e.burnT -= step;
        e.hp -= e.burn * step;
        if (Math.random() < step * 8) {
          const p = enemyPos(e);
          spawnParticles(p.x, p.y, "#e85d4c", 1, 30);
        }
        if (e.hp <= 0) killEnemy(e);
      }
      // Boss abilities
      if (e.ability === "ashregen") {
        if (e.chillT <= 0 && e.hp < e.maxHp) {
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.012 * step);
        }
      } else if (e.ability === "carapace") {
        if (e.shieldCd > 0) e.shieldCd -= step;
        else if (e.shield < e.shieldMax) {
          e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.2 * step);
        }
      } else if (e.ability === "brood") {
        e.abilityT -= step;
        if (e.abilityT <= 0) {
          e.abilityT = 4.8;
          const adds = state.enemies.filter((o) => o.alive && o.type === "swarm").length;
          if (adds < 14) {
            const childDiff = Math.max(0.85, (e.maxHp / (ENEMY.broodmother.hp || 840)) * 0.55);
            broodSpawns.push({ dist: e.dist, diff: childDiff, color: e.color });
          }
        }
      } else if (e.ability === "tempest") {
        if (!e.enraged && e.hp / e.maxHp <= 0.45) {
          e.enraged = true;
          e.speed = (e.baseSpeed || e.speed) * 1.4;
          const p = enemyPos(e);
          state.fx.push({ kind: "text", x: p.x, y: p.y - 16, t: 0.6, text: "TEMPEST", color: "#4db8c4" });
          spawnParticles(p.x, p.y, "#4db8c4", 14, 90);
        }
        if (e.enraged) e.knockCd = Math.max(e.knockCd, 0.3);
      }

      const rooted = (e.stunT > 0) || (e.freezeT > 0 && e.slow <= 0.15);
      const moveMul = e.stunT > 0 ? 0 : e.slow;
      e.dist += e.speed * moveMul * step;
      if (rooted && Math.random() < step * 3) {
        const p = enemyPos(e);
        spawnParticles(p.x, p.y, e.stunT > 0 ? ELEMENTS.arc.color : ELEMENTS.frost.color, 1, 20);
      }
      if (e.dist >= enemyPathTotal(e)) {
        e.alive = false;
        state.hp -= isBossEnemy(e) ? 5 : 1;
        pushCombatFx({ kind: "leak", t: 0.5 });
        triggerScreenFlash(0.18);
        addShake(0.95);
        sfx.leak();
        if (state.hp <= 0) { state.hp = 0; updateHUD(); endRun(false); return; }
      }
    }
    for (const b of broodSpawns) {
      for (let i = 0; i < 2; i++) {
        spawnEnemy("swarm", b.diff, 1, 0.7);
        const child = state.enemies[state.enemies.length - 1];
        child.dist = Math.max(0, b.dist - 18 - i * 10);
      }
      const p = enemyPos(b);
      spawnParticles(p.x, p.y, b.color, 8, 60);
    }

    for (const tower of state.towers) {
      if (tower.levelCd > 0) tower.levelCd = Math.max(0, tower.levelCd - step);
      if (tower.recoil > 0) tower.recoil = Math.max(0, tower.recoil - step * 4.5);
      const track = findTarget(tower, state.enemies);
      if (track) {
        const tp = enemyPos(track);
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
            const q = enemyPos(e);
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
    // Deep basalt base
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1a1410");
    g.addColorStop(0.35, "#121610");
    g.addColorStop(0.7, "#0e120e");
    g.addColorStop(1, "#0a0c0a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Cooler ash patches (terrain layer)
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 18; i++) {
      const sx = ((i * 137 + 19) % 97) / 97 * w;
      const sy = ((i * 89 + 41) % 91) / 91 * h;
      const rw = 28 + (i % 5) * 10;
      const rh = 16 + (i % 4) * 8;
      ctx.fillStyle = i % 2 ? "#243028" : "#2a2218";
      ctx.beginPath();
      ctx.ellipse(sx, sy, rw, rh, (i % 7) * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Stone grit
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 55; i++) {
      const sx = ((i * 97 + 13) % 100) / 100 * w;
      const sy = ((i * 53 + 29) % 100) / 100 * h;
      ctx.fillStyle = i % 4 === 0 ? "#6fbf8a" : i % 3 === 0 ? "#3a3028" : "#1c1814";
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2 + (i % 4) * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Soft vignette
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.45, h * 0.15, w * 0.5, h * 0.5, h * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // Heat shimmer + ambient embers (gated by juice / reduce-motion / battery saver)
    if (settings.particles !== false && motionAllowed()) {
      const bands = settings.batterySaver ? 2 : 5;
      const embers = settings.batterySaver ? 5 : 12;
      ctx.globalAlpha = settings.batterySaver ? 0.03 : 0.045;
      ctx.fillStyle = "#e85a2a";
      for (let i = 0; i < bands; i++) {
        const y = ((i * 97 + state.time * 16) % (h + 40)) - 20;
        ctx.fillRect(0, y, w, 1.2);
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < embers; i++) {
        const px = ((i * 73 + state.time * (8 + i % 3) * 3) % (w + 20)) - 10;
        const py = h - ((i * 41 + state.time * (12 + (i % 4))) % (h * 0.85));
        const a = 0.12 + 0.1 * Math.sin(state.time * 3 + i);
        ctx.globalAlpha = a;
        ctx.fillStyle = i % 2 ? "#ffb34a" : "#e85a2a";
        ctx.beginPath();
        ctx.arc(px, py, 1.2 + (i % 3) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function strokeLane(pts, widths) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  }
  function drawOneLane(pts, alphaMul) {
    ctx.save();
    ctx.globalAlpha *= alphaMul;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 40;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    ctx.strokeStyle = "#2a241c";
    ctx.lineWidth = 30;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    const glow = ctx.createLinearGradient(0, 0, 0, state.h);
    glow.addColorStop(0, "#ffc86a");
    glow.addColorStop(0.4, "#e85a2a");
    glow.addColorStop(1, "#6a1c0c");
    ctx.strokeStyle = glow;
    ctx.lineWidth = 12;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    ctx.strokeStyle = "rgba(255,230,160,0.85)";
    ctx.lineWidth = 2.6;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    ctx.restore();
  }
  function drawRiftPath() {
    if (!state.path) return;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const lanes = (state.path.lanes && state.path.lanes.length) ? state.path.lanes : [state.path];
    // Side lanes slightly quieter; main lane full heat.
    lanes.forEach((lane, i) => drawOneLane(lane.points, i === 0 ? 1 : 0.72));
    // Bend build pads — soft stone discs so placement reads as intentional.
    if (state.path.pads) {
      for (const pad of state.path.pads) {
        ctx.save();
        ctx.translate(pad.x, pad.y);
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
        g.addColorStop(0, "rgba(232,136,58,0.22)");
        g.addColorStop(0.55, "rgba(44,36,28,0.85)");
        g.addColorStop(1, "rgba(14,12,10,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(244,236,227,0.18)";
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    // Spawn markers
    lanes.forEach((lane, i) => {
      const p = lane.points[0];
      if (!p) return;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = i === 0 ? "#ffb34a" : "#4db8c4";
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
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
    const idle = Math.sin(state.time * 2.4 + t.x * 0.04) * 0.6;
    ctx.translate(0, idle * 0.15);
    // Slightly larger read on mobile
    ctx.scale(1.08, 1.08);

    if (selected) {
      ctx.strokeStyle = "rgba(255,179,74,0.95)";
      ctx.lineWidth = 2.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 24 + Math.sin(state.time * 5) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,179,74,0.25)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ground pad shadow + basalt ring
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(0, 13, 17, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const pad = ctx.createRadialGradient(0, 4, 2, 0, 6, 17);
    pad.addColorStop(0, "#4a3a2c");
    pad.addColorStop(0.55, "#2a2218");
    pad.addColorStop(1, "rgba(14,12,10,0)");
    ctx.fillStyle = pad;
    ctx.beginPath();
    ctx.ellipse(0, 8, 16, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(232,136,58,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 8, 14, 5.5, 0, 0, Math.PI * 2);
    ctx.stroke();

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

    } else if (t.type === "coil") {
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
    } else if (t.type === "spire") {
      const shaft = ctx.createLinearGradient(0, -28, 0, 12);
      shaft.addColorStop(0, "#fff0c8");
      shaft.addColorStop(0.35, "#d4a060");
      shaft.addColorStop(1, "#4a3018");
      ctx.fillStyle = shaft;
      ctx.beginPath();
      ctx.moveTo(-5, 10); ctx.lineTo(-3.5, -18); ctx.lineTo(0, -28); ctx.lineTo(3.5, -18); ctx.lineTo(5, 10);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,230,160,0.35)";
      ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#2a1c10";
      roundRect(-7, 6, 14, 8, 2); ctx.fill();
      ctx.save();
      ctx.rotate(aim);
      ctx.fillStyle = "#1a1008";
      roundRect(2, -2.5, 14, 5, 1.5); ctx.fill();
      if (recoil > 0.1) {
        ctx.globalAlpha = recoil;
        ctx.strokeStyle = "#ffb34a";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(28 + recoil * 8, 0); ctx.stroke();
        ctx.globalAlpha = 1;
      }
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
      ctx.font = "800 9px Bricolage Grotesque, Avenir Next, sans-serif";
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
    ctx.scale(1.06, 1.06);
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
    if (e.stunT > 0) {
      ctx.strokeStyle = ELEMENTS.arc.color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.freezeT > 0) {
      ctx.strokeStyle = ELEMENTS.frost.color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
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
      // Behemoth — horned furnace bulk
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
        const maw = ctx.createRadialGradient(0, 2, 1, 0, 2, e.r * 0.45);
        maw.addColorStop(0, "#ffe08a");
        maw.addColorStop(0.4, "#e85d4c");
        maw.addColorStop(1, "#1a0808");
        ctx.fillStyle = maw;
        roundRect(-e.r * 0.4, -4, e.r * 0.8, 12, 3); ctx.fill();
        ctx.fillStyle = "#ffb34a";
        ctx.fillRect(-e.r * 0.55, -e.r * 0.35, 6, 2.5);
        ctx.fillRect(e.r * 0.55 - 6, -e.r * 0.35, 6, 2.5);
      }
      ctx.restore();

    } else if (e.shape === "wyrm") {
      // Emberwyrm — flying serpentine
      ctx.save();
      ctx.translate(0, bob * 2);
      ctx.strokeStyle = "rgba(255,138,74,0.35)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(0, 0, e.r + 9, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 3; i >= 0; i--) {
        const ox = -i * 5;
        const oy = Math.sin(state.time * 6 + i) * 3;
        const seg = ctx.createRadialGradient(ox - 2, oy - 2, 0, ox, oy, e.r * 0.55);
        seg.addColorStop(0, flash ? "#ffffff" : "#ffe0a8");
        seg.addColorStop(0.45, flash ? "#ffffff" : e.color);
        seg.addColorStop(1, flash ? "#ffffff" : "#5a1808");
        ctx.fillStyle = seg;
        ctx.beginPath(); ctx.ellipse(ox, oy, e.r * (0.55 - i * 0.05), e.r * 0.38, 0.2, 0, Math.PI * 2); ctx.fill();
      }
      // head
      const head = ctx.createLinearGradient(4, -8, 14, 8);
      head.addColorStop(0, flash ? "#ffffff" : "#ffd080");
      head.addColorStop(1, flash ? "#ffffff" : "#c44a2a");
      ctx.fillStyle = head;
      ctx.beginPath();
      ctx.moveTo(e.r * 0.2, -e.r * 0.35);
      ctx.lineTo(e.r + 4, 0);
      ctx.lineTo(e.r * 0.2, e.r * 0.35);
      ctx.closePath(); ctx.fill();
      if (!flash) {
        ctx.fillStyle = "#1a0808";
        ctx.beginPath(); ctx.arc(e.r * 0.55, -2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffb34a";
        ctx.beginPath(); ctx.arc(e.r * 0.55, -2, 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

    } else if (e.shape === "warden") {
      // Shellwarden — heavy dome + shield ring
      ctx.save();
      ctx.translate(0, bob * 0.3);
      if (e.shield > 0) {
        ctx.strokeStyle = `rgba(216,208,196,${0.35 + 0.35 * (e.shield / (e.shieldMax || 1))})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 6 + Math.sin(state.time * 3) * 1.2, 0, Math.PI * 2); ctx.stroke();
      }
      const dome = ctx.createRadialGradient(-4, -6, 2, 0, 0, e.r);
      dome.addColorStop(0, flash ? "#ffffff" : "#e8e0d4");
      dome.addColorStop(0.5, flash ? "#ffffff" : e.color);
      dome.addColorStop(1, flash ? "#ffffff" : "#2a2824");
      ctx.fillStyle = dome;
      ctx.beginPath(); ctx.arc(0, 2, e.r, Math.PI, 0); ctx.lineTo(e.r, e.r * 0.55); ctx.lineTo(-e.r, e.r * 0.55); ctx.closePath(); ctx.fill();
      if (!flash) {
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -e.r + 4); ctx.lineTo(0, e.r * 0.4);
        ctx.moveTo(-e.r * 0.55, -2); ctx.lineTo(e.r * 0.55, -2);
        ctx.stroke();
        ctx.fillStyle = "#c4a35a";
        ctx.beginPath(); ctx.arc(0, -2, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3a3028";
        ctx.beginPath(); ctx.arc(0, -2, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = flash ? "#ffffff" : "#4a4840";
      roundRect(-e.r * 0.85, e.r * 0.35, e.r * 1.7, e.r * 0.45, 4); ctx.fill();
      ctx.restore();

    } else if (e.shape === "brood") {
      // Broodmother — bulbous sac + spawn vents
      ctx.save();
      ctx.translate(0, bob * 0.5);
      const sac = ctx.createRadialGradient(-3, -4, 2, 0, 0, e.r);
      sac.addColorStop(0, flash ? "#ffffff" : "#c8f0d0");
      sac.addColorStop(0.45, flash ? "#ffffff" : e.color);
      sac.addColorStop(1, flash ? "#ffffff" : "#1a2a18");
      ctx.fillStyle = sac;
      ctx.beginPath(); ctx.ellipse(0, 2, e.r * 1.05, e.r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      if (!flash) {
        for (let i = 0; i < 5; i++) {
          const a = -0.8 + i * 0.4;
          const bx = Math.cos(a) * e.r * 0.55;
          const by = Math.sin(a) * e.r * 0.4 - 2;
          ctx.fillStyle = i % 2 ? "#2a4a30" : "#4a7a50";
          ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = "#1a1008";
        ctx.beginPath(); ctx.ellipse(0, -e.r * 0.35, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffb34a";
        ctx.beginPath(); ctx.arc(-2, -e.r * 0.35, 1.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(2, -e.r * 0.35, 1.2, 0, Math.PI * 2); ctx.fill();
        // mandible legs
        ctx.strokeStyle = "#3a5a38";
        ctx.lineWidth = 2;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(s * e.r * 0.6, e.r * 0.2);
          ctx.lineTo(s * (e.r + 4), e.r * 0.55);
          ctx.stroke();
        }
      }
      ctx.restore();

    } else if (e.shape === "gale") {
      // Galeheart — swept crescent with storm core
      ctx.save();
      ctx.translate(0, bob * 1.2);
      const spin = state.time * 4;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = `rgba(77,184,196,${0.55 - i * 0.12})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, e.r + 4 + i * 3, (e.r + 4 + i * 3) * 0.45, spin + i, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = flash ? "#ffffff" : e.color;
      ctx.beginPath();
      ctx.moveTo(-e.r, 0);
      ctx.quadraticCurveTo(0, -e.r * 1.15, e.r * 0.9, -e.r * 0.25);
      ctx.quadraticCurveTo(e.r * 0.2, 0, e.r * 0.9, e.r * 0.25);
      ctx.quadraticCurveTo(0, e.r * 1.15, -e.r, 0);
      ctx.closePath(); ctx.fill();
      if (!flash) {
        const core = ctx.createRadialGradient(-2, -2, 0, 0, 0, e.r * 0.45);
        core.addColorStop(0, e.enraged ? "#ffffff" : "#e8ffff");
        core.addColorStop(0.4, e.enraged ? "#ffb34a" : "#4db8c4");
        core.addColorStop(1, "#0a2030");
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.4, 0, Math.PI * 2); ctx.fill();
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

    // Element resist pips: filled square = resist, bright triangle = weak
    const resist = enemyResist(e);
    const pipEls = ELEMENT_IDS.filter((el) => {
      const v = resist[el];
      return v != null && (v <= 0.85 || v >= 1.15);
    });
    if (pipEls.length) {
      const pipGap = pipEls.length > 5 ? 7 : 9;
      const pipW = pipEls.length * pipGap;
      pipEls.forEach((el, i) => {
        const px = -pipW / 2 + i * pipGap + pipGap / 2;
        const py = barY - 7;
        const v = resist[el];
        ctx.save();
        ctx.fillStyle = ELEMENTS[el].color;
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.lineWidth = 1;
        ctx.globalAlpha = v <= 0.85 ? 1 : 0.9;
        ctx.beginPath();
        if (v <= 0.85) {
          roundRect(px - 3, py - 3, 6, 6, 1.5); ctx.fill(); ctx.stroke();
        } else {
          ctx.moveTo(px, py - 4);
          ctx.lineTo(px + 3.4, py + 2.6);
          ctx.lineTo(px - 3.4, py + 2.6);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      });
    }

    if (e.shieldMax > 0 && e.shield > 0) {
      const sp = Math.max(0, e.shield / e.shieldMax);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      roundRect(-barW / 2, barY - 5, barW, 2.5, 1); ctx.fill();
      ctx.fillStyle = "#d8d0c4";
      roundRect(-barW / 2, barY - 5, barW * sp, 2.5, 1); ctx.fill();
    }

    if (isBossEnemy(e)) {
      const tag = (e.label || "Boss").slice(0, 10);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const tw = Math.max(28, tag.length * 5.2);
      roundRect(-tw / 2, e.r + 2, tw, 11, 3); ctx.fill();
      ctx.fillStyle = "#ffb34a";
      ctx.font = "800 8px Bricolage Grotesque, Avenir Next, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const suffix = (e.bossTotal || 1) > 1 ? ` ${(e.bossIndex || 0) + 1}/${e.bossTotal}` : "";
      ctx.fillText(tag + suffix, 0, e.r + 7.5);
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
      const p = enemyPos(e);
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
        ctx.font = "800 11px Bricolage Grotesque, Avenir Next, sans-serif"; ctx.textAlign = "center";
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
      clientX: t.clientX,
      clientY: t.clientY,
    };
  }
  function placementOk(x, y) {
    if (!state.path) return false;
    const clear = (state.path && state.path.pathClear) || layoutForDifficulty(state.difficulty).pathClear || 28;
    if (distToPathNetwork(state.path, x, y) < clear) return false;
    if (x < 16 || y < 16 || x > state.w - 16 || y > state.h - 16) return false;
    for (const t of state.towers) {
      if (Math.hypot(t.x - x, t.y - y) < 36) return false;
    }
    return true;
  }

  const TOWER_HIT_R = 28;

  function onCanvasPointerDown(evt) {
    if (state.mode !== "playing") return;
    evt.preventDefault();
    ensureAudio();
    syncMusic();
    const { x, y, clientX, clientY } = canvasPos(evt);

    for (let i = state.towers.length - 1; i >= 0; i--) {
      const t = state.towers[i];
      if (Math.hypot(t.x - x, t.y - y) < TOWER_HIT_R) {
        state.selectedBuilt = i;
        state.selectedTower = null;
        state.ghost = null;
        placePtr = null;
        haptic(8);
        updateHUD();
        return;
      }
    }

    if (state.selectedTower) {
      placePtr = {
        id: evt.pointerId,
        x0: clientX, y0: clientY,
        x, y,
        dragged: false,
      };
      state.ghost = { x, y, ok: placementOk(x, y) };
      state.selectedBuilt = null;
      try { canvas.setPointerCapture(evt.pointerId); } catch { /* */ }
      updateHUD();
      return;
    }

    state.selectedBuilt = null;
    updateHUD();
  }

  function onCanvasPointerMove(evt) {
    if (state.mode !== "playing") return;
    if (placePtr && placePtr.id === evt.pointerId && state.selectedTower) {
      const { x, y, clientX, clientY } = canvasPos(evt);
      if (Math.hypot(clientX - placePtr.x0, clientY - placePtr.y0) > 10) placePtr.dragged = true;
      placePtr.x = x; placePtr.y = y;
      state.ghost = { x, y, ok: placementOk(x, y) };
      return;
    }
    if (!state.selectedTower) { state.ghost = null; return; }
    // Hover preview (mouse)
    if (evt.pointerType === "mouse") {
      const { x, y } = canvasPos(evt);
      state.ghost = { x, y, ok: placementOk(x, y) };
    }
  }

  function finishPlacePointer(evt, canceled) {
    if (!placePtr || placePtr.id !== evt.pointerId) return;
    const { x, y } = state.ghost || placePtr;
    const ok = !canceled && state.selectedTower && placementOk(x, y);
    placePtr = null;
    try { canvas.releasePointerCapture(evt.pointerId); } catch { /* */ }
    if (ok) {
      placeTower(x, y);
      state.ghost = null;
    } else if (state.selectedTower) {
      state.ghost = null;
      if (!canceled) toast("Invalid spot — drag beside the rift");
      syncPlaceCancel();
    }
    updateHUD();
  }

  canvas.addEventListener("pointerdown", onCanvasPointerDown, { passive: false });
  canvas.addEventListener("pointermove", onCanvasPointerMove, { passive: true });
  canvas.addEventListener("pointerup", (evt) => finishPlacePointer(evt, false), { passive: true });
  canvas.addEventListener("pointercancel", (evt) => finishPlacePointer(evt, true), { passive: true });

  document.querySelectorAll(".tower-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.mode !== "playing") return;
      ensureAudio();
      const type = btn.dataset.tower;
      if (state.selectedTower === type) {
        cancelPlacement(false);
        return;
      }
      state.selectedTower = type;
      state.selectedBuilt = null;
      state.ghost = null;
      placePtr = null;
      updateHUD();
      haptic(6);
      sfx.ui();
    });
  });

  if ($("btn-place-cancel")) {
    $("btn-place-cancel").addEventListener("click", () => cancelPlacement(false));
  }
  if ($("btn-start-wave")) {
    $("btn-start-wave").addEventListener("click", () => {
      ensureAudio();
      playerStartWaves();
      sfx.ui();
    });
  }
  document.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape") cancelPlacement(false);
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
      const combo = describeCombo(t.elements);
      toast(combo);
      if (t.elements.length >= 2) {
        const short = COMBO_SHORT[comboKey(t.elements)] || "COMBO";
        state.fx.push({ kind: "text", x: t.x, y: t.y - 28, t: 0.85, text: short, color: ELEMENTS[el].color });
        pushCombatFx({ kind: "ring", x: t.x, y: t.y, t: 0.45, r0: 12, r1: 48, color: ELEMENTS[el].color });
        haptic([10, 40, 18]);
      }
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
    if (!towerLevelReady(t)) { toast("Level cooling down"); return; }
    if (!levelTower(t)) { toast("Need more scrap"); return; }
    updateHUD(); saveRun();
  });
  if (els.btnAutoLevel) {
    els.btnAutoLevel.addEventListener("click", () => autoLevelAllTowers());
  }

  els.btnPause.addEventListener("click", () => {
    if (state.mode === "playing") { state.mode = "paused"; saveRun(); showScreen("pause"); }
    else if (state.mode === "paused") { state.mode = "playing"; showScreen(null); syncStartBtn(); }
  });
  $("btn-resume").addEventListener("click", () => {
    if (!state.seed) loadRun();
    state.mode = "playing"; showScreen(null); syncStartBtn(); saveRun();
  });
  els.btnMute.addEventListener("click", () => {
    settings.muted = !settings.muted;
    saveJSON(STORAGE.settings, settings);
    syncMuteUI();
    syncMasterGain();
    syncMusic();
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
  if ($("btn-daily")) {
    $("btn-daily").addEventListener("click", () => {
      clearRun();
      resize();
      startNewRun({ daily: true, dailyKey: dailyKey() });
      toast("Daily rift · " + dailyKey());
    });
  }
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
  // Codex hidden — discovery via play (tooltips, combat feedback, trial).
  if ($("btn-codex")) $("btn-codex").classList.add("hidden");
  if ($("screen-codex")) $("screen-codex").classList.add("hidden");
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => { upgradeTab = tab.dataset.tab; renderUpgrades(); });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "playing") {
      state.mode = "paused"; saveRun(); showScreen("pause");
    }
    if (!document.hidden) kickFrame();
  });
  window.addEventListener("resize", () => {
    resize();
    if (state.mode === "playing" || state.mode === "paused") updateHUD();
  });

  let last = performance.now();
  let acc = 0;
  const FIXED = 1 / 60;
  let rafId = 0;
  function frame(now) {
    rafId = 0;
    if (document.hidden) {
      // Battery: skip sim/draw while backgrounded (visibilitychange already pauses runs).
      return;
    }
    let frameDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += frameDt;
    // fixed step for buttery sim; draw every raf
    const stepLimit = settings.batterySaver ? 3 : 4;
    let steps = 0;
    while (acc >= FIXED && steps < stepLimit) {
      update(FIXED);
      acc -= FIXED;
      steps++;
    }
    if (steps === 0) {
      // still decay shake when paused via tiny update
      if (state.mode !== "playing") update(frameDt);
    }
    trimFx();
    draw();
    rafId = requestAnimationFrame(frame);
  }
  function kickFrame() {
    if (!rafId && !document.hidden) {
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  }

  /* ---- PWA install + update toast ---- */
  let deferredInstall = null;
  function syncInstallBanner() {
    const banner = $("install-banner");
    if (!banner) return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    const canInstall = !!deferredInstall && !standalone;
    banner.classList.toggle("hidden", !canInstall);
    banner.setAttribute("aria-hidden", canInstall ? "false" : "true");
  }
  window.addEventListener("beforeinstallprompt", (ev) => {
    ev.preventDefault();
    deferredInstall = ev;
    syncInstallBanner();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    syncInstallBanner();
    toast("Emberwell installed");
  });
  const btnInstall = $("btn-install");
  if (btnInstall) {
    btnInstall.addEventListener("click", async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      try { await deferredInstall.userChoice; } catch { /* ignore */ }
      deferredInstall = null;
      syncInstallBanner();
    });
  }
  const btnInstallDismiss = $("btn-install-dismiss");
  if (btnInstallDismiss) {
    btnInstallDismiss.addEventListener("click", () => {
      deferredInstall = null;
      const banner = $("install-banner");
      if (banner) banner.classList.add("hidden");
    });
  }

  resize();
  refreshHub();
  showScreen("hub");
  syncMuteUI();
  syncSpeedUI();
  syncLargeTap();
  syncPerfFlags();
  syncInstallBanner();
  if (sessionStorage.getItem("ew_just_updated") === ((typeof APP_VERSION !== "undefined" && APP_VERSION) || "")) {
    sessionStorage.removeItem("ew_just_updated");
    setTimeout(() => toast("Updated to v" + APP_VERSION), 400);
  }
  kickFrame();
  window.__RD = { state, startNewRun, saveRun, loadRun, generatePath, wavePlan, ELEMENTS, settings, sfx };
})();
