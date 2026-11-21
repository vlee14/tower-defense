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

  // layout*: KR/BTD lessons — harder = shorter path, more gates, less pad space (not HP-only).
  // pathClear = road half-width (~outer berm 23) + tower footprint — keep towers fully off asphalt.
  const ROAD_HALF_W = 28;
  const TOWER_PLACE_R = 22;
  const DIFFICULTIES = {
    normal: {
      id: "normal", name: "Normal", hpMul: 1, speedMul: 1, countMul: 1, intervalMul: 1, rewardMul: 1, chipMul: 1,
      edgeInset: 0.12, travel: 1.0, hairpin: 0.35, padOffset: 50, padClear: 36, pathClear: ROAD_HALF_W + TOWER_PLACE_R,
      motifs: ["s-bend", "dual-merge", "y-merge"], unlock: null,
    },
    hard: {
      id: "hard", name: "Hard", hpMul: 1.42, speedMul: 1.1, countMul: 1.18, intervalMul: 0.9, rewardMul: 1.4, chipMul: 1.55,
      edgeInset: 0.17, travel: 0.74, hairpin: 0.75, padOffset: 40, padClear: 34, pathClear: ROAD_HALF_W + TOWER_PLACE_R,
      motifs: ["hairpin", "y-merge", "triple-funnel"],
      unlock: { kind: "wave", difficulty: "normal", wave: 10 },
    },
    nightmare: {
      id: "nightmare", name: "Nightmare", hpMul: 2.0, speedMul: 1.24, countMul: 1.35, intervalMul: 0.78, rewardMul: 1.85, chipMul: 2.35,
      edgeInset: 0.21, travel: 0.52, hairpin: 1.0, padOffset: 34, padClear: 32, pathClear: ROAD_HALF_W + TOWER_PLACE_R - 2,
      motifs: ["hairpin", "triple-funnel", "quad-squeeze"],
      unlock: { kind: "wave", difficulty: "hard", wave: 12 },
    },
  };

  const BASE_TOWER = {
    turret: {
      name: "Turret", cost: 58, damage: 28, range: 82, fireRate: 0.4, sell: 28, color: "#e8883a",
      hitsAir: true, hitsGround: true, splash: 0, turnRate: 4.2, maxRange: 118,
      blurb: "High DPS · short range · hits air & ground",
    },
    mortar: {
      name: "Mortar", cost: 90, damage: 40, range: 128, fireRate: 1.28, splash: 50, sell: 42, color: "#6fbf8a",
      hitsAir: false, hitsGround: true, turnRate: 2.1, maxRange: 168,
      blurb: "AoE splash · slow · cannot hit flying",
    },
    coil: {
      name: "Coil", cost: 74, damage: 14, range: 108, fireRate: 0.55, sell: 36, color: "#4db8c4",
      hitsAir: true, hitsGround: true, airBonus: 1.55, armorPenalty: 0.58, slow: 0.55, slowDur: 1.4, turnRate: 5.5, maxRange: 148,
      blurb: "Slows · anti-air · weak vs armor",
    },
    spire: {
      name: "Spire", cost: 110, damage: 72, range: 158, fireRate: 1.45, sell: 52, color: "#d4a060",
      hitsAir: true, hitsGround: true, pierce: 3, armorBonus: 1.2, turnRate: 2.8, maxRange: 210,
      blurb: "Pierce line · long range · slow fire",
    },
  };

  // Internal balance ledger: cost-per-DPS / ability budget for tuning.
  // DPS ~ damage / fireRate (splash & pierce counted as ability multipliers).
  // HP curve: soft early (W1–5 learnable), steeper mid/late, deep exponential climb.
  // Daily applies DAILY.* muls on top of Normal + hard-layout path; hard-stops at waveCap.
  const DAILY = {
    waveCap: 100,
    layout: "hard",
    hpMul: 1.48,
    speedMul: 1.14,
    countMul: 1.25,
    intervalMul: 0.82,
    rewardMul: 0.88,
    scrapWaveMul: 0.82,
    armorBias: 0.12,
    chipMul: 1.35,
    clearBonus: 100,
  };
  const BALANCE = {
    scrapStart: 105,
    scrapWaveBase: 16,
    scrapWavePer: 2.1,
    scrapKillScale: 0.65,
    levelDmgPer: 0.22,
    levelDmgSoft: 0.035, // damp after L6
    levelRangePer: 0.08,
    levelRatePer: 0.04,
    levelCd: 1.25, // wall-clock seconds (not scaled by game speed)
    hpEarly: 0.11, // W1–10: slightly gentler than before
    hpMid: 0.26, // W11–22: clear step up
    hpLate: 0.42, // W23–40: threatening
    hpDeepBase: 1.068, // exponential after wave 40
    countCap: 68,
    countWaveEarly: 1.05, // W1–5 spawn growth
    countWaveLate: 1.58, // denser mid/late packs
    rewardDeepFade: 0.018, // scrap lags HP deep so economy can't outscale forever
    // CC: never hard-pin. Floor = always forward progress.
    moveFloor: 0.3,
    moveFloorArmored: 0.36,
    moveFloorBoss: 0.48,
    slowFloor: 0.32,
    slowFloorBoss: 0.5,
    stunCap: 0.32,
    stunCapBoss: 0.14,
    stunCd: 2.4,
    stunCdBoss: 3.6,
    freezeCd: 2.2,
    freezeCdBoss: 3.4,
    knockCap: 5,
    knockCapBoss: 1.6,
    knockCd: 1.35,
    knockCdBoss: 2.2,
    ccDrPer: 0.45,
    ccDrDecay: 0.55, // per second
    ccDrCap: 2.8,
    aoeCcMul: 0.45, // AoE CC much weaker than single-target
    aimAlign: 0.28, // rad — must face target to fire
    acquireDelay: 0.18, // seconds after target switch before shooting
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
    arc: { id: "arc", name: "Arc", color: "#d4b84a", cost: 32, tip: "Shock interrupt (ICD)" },
    frost: { id: "frost", name: "Frost", color: "#8ec8e8", cost: 32, tip: "Chill — never full stop" },
  };
  const ELEMENT_IDS = Object.keys(ELEMENTS);
  const ELEMENT_SECOND_COST = 48;
  const MAX_ELEMENTS = 2;
  const COMBO_SHORT = {
    "fire+water": "GEYSER",
    "earth+fire": "MAGMA",
    "fire+wind": "WILDFIRE",
    "earth+water": "MIRE",
    "water+wind": "SHATTER",
    "earth+wind": "TEMPEST",
    "arc+fire": "PLASMA",
    "arc+water": "CONDUCT",
    "arc+earth": "FRACTURE",
    "arc+wind": "SURGE",
    "arc+frost": "BRITTLE",
    "fire+frost": "MELT",
    "frost+water": "RIME",
    "earth+frost": "SPIKE",
    "frost+wind": "WHITEOUT",
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
    overTitle: $("over-title"), overSummary: $("over-summary"), overChips: $("over-chips"),
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
  function clampTowerRange(type, range) {
    const cap = (BASE_TOWER[type] && BASE_TOWER[type].maxRange) || 200;
    return Math.min(cap, range);
  }
  function towerStats(type) {
    const base = { ...BASE_TOWER[type] };
    const tree = UPGRADE_TREES[type] || [];
    for (const u of tree) applyUpgradeEffect(base, u.effect, ownedRank(u.id));
    base.range = clampTowerRange(type, base.range);
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
      "fire+water": "Geyser (blast + shove forward)",
      "earth+fire": "Magma (kill → lava pool)",
      "fire+wind": "Wildfire (spread burn)",
      "earth+water": "Mire (sticky zone)",
      "water+wind": "Shatter (bonus vs chilled)",
      "earth+wind": "Tempest (air + armor)",
      "arc+fire": "Plasma (execute mark)",
      "arc+water": "Conduct (chain splash)",
      "arc+earth": "Fracture (shred pulse)",
      "arc+wind": "Surge (chain jump)",
      "arc+frost": "Brittle (next-hit amp)",
      "fire+frost": "Melt (armor crack)",
      "frost+water": "Rime (shield then pop)",
      "earth+frost": "Spike (armor pierce)",
      "frost+wind": "Whiteout (scramble + chill)",
    })[comboKey(elements)] || elements.map((id) => (ELEMENTS[id] || {}).name || id).join("+");
  }

  function finalizeLane(points) {
    const dense = densify(points, 16);
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
  function clampMap(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function pt(x, y, w, h, m = 14) {
    return { x: clampMap(x, m, w - m), y: clampMap(y, m, h - m) };
  }
  /** Angle turn at corner i (radians). Large = meaningful bend. */
  function cornerTurn(corners, i) {
    if (i <= 0 || i >= corners.length - 1) return 0;
    const a = corners[i - 1], b = corners[i], c = corners[i + 1];
    const ax = a.x - b.x, ay = a.y - b.y;
    const cx = c.x - b.x, cy = c.y - b.y;
    const al = Math.hypot(ax, ay) || 1, cl = Math.hypot(cx, cy) || 1;
    const dot = clampMap((ax * cx + ay * cy) / (al * cl), -1, 1);
    return Math.acos(dot);
  }
  function appendZig(corners, w, h, fromY, toY, startX, travel, hairpin, rng, flips) {
    let x = startX;
    let goingRight = rng() > 0.5;
    const inset = w * (0.12 + (1 - travel) * 0.08);
    const reach = (w * 0.5 - inset) * travel;
    for (let i = 1; i <= flips; i++) {
      const t = i / (flips + 1);
      const y = fromY + (toY - fromY) * t;
      corners.push(pt(x, y, w, h));
      const center = w * 0.5 + (rng() - 0.5) * w * 0.04 * (1 - travel);
      let tx = goingRight ? center + reach : center - reach;
      tx += (rng() - 0.5) * w * 0.03 * hairpin;
      const pull = 0.32 + hairpin * 0.42;
      const midX = x * pull + tx * (1 - pull) + (rng() - 0.5) * w * 0.05;
      const midY = y + (rng() - 0.5) * (8 + hairpin * 14);
      corners.push(pt(midX, midY, w, h));
      x = tx;
      corners.push(pt(x, y, w, h));
      goingRight = !goingRight;
    }
    return x;
  }
  /**
   * Motif-based maps (Kingdom Rush / BTD lessons): intentional entrances, planned merges,
   * readable bends — not random spaghetti. Returns { spine, spawns, merges, motif }.
   */
  function composeMotif(motif, w, h, spawnN, diff, rng) {
    const travel = Math.max(0.45, Math.min(1, diff.travel));
    const hairpin = diff.hairpin;
    const top = h * 0.055;
    const exitY = h * (0.9 - (1 - travel) * 0.03);
    const midBand = h * (0.28 + (1 - travel) * 0.08);
    const funnelY = h * (0.38 + (1 - travel) * 0.1);
    const inset = w * diff.edgeInset;
    const spawns = [];
    const merges = [];
    const spine = [];

    if (motif === "dual-merge") {
      // Two parallel upper lanes → choke merge → S-run.
      const left = pt(inset * 0.7, top, w, h);
      const right = pt(w - inset * 0.7, top, w, h);
      const merge = pt(w * 0.5 + (rng() - 0.5) * w * 0.06, midBand, w, h);
      spawns.push(left, right);
      merges.push(merge);
      spine.push(merge);
      const flips = travel > 0.85 ? 4 : travel > 0.65 ? 3 : 2;
      const x = appendZig(spine, w, h, merge.y + h * 0.04, exitY - h * 0.06, merge.x, travel, hairpin, rng, flips);
      spine.push(pt(x, exitY, w, h));
    } else if (motif === "y-merge") {
      // Y: side gates + optional center, merge, then corridor.
      const gates = [
        pt(inset * 0.55, top + h * 0.01, w, h),
        pt(w * 0.5, top, w, h),
        pt(w - inset * 0.55, top + h * 0.01, w, h),
      ];
      for (let i = 0; i < Math.min(spawnN, gates.length); i++) spawns.push(gates[i]);
      while (spawns.length < spawnN) {
        spawns.push(pt(inset + rng() * (w - inset * 2), top + h * 0.04, w, h));
      }
      const merge = pt(w * 0.5 + (rng() - 0.5) * 20, funnelY, w, h);
      merges.push(merge);
      spine.push(merge);
      const flips = travel > 0.8 ? 3 : 2;
      const x = appendZig(spine, w, h, merge.y + h * 0.05, exitY - h * 0.05, merge.x, travel * 0.92, hairpin, rng, flips);
      spine.push(pt(x, exitY, w, h));
    } else if (motif === "triple-funnel" || motif === "quad-squeeze") {
      // Multi-gate fan into early funnel — short react window.
      const n = motif === "quad-squeeze" ? 4 : 3;
      const span = w - inset * 1.4;
      for (let i = 0; i < Math.max(n, spawnN); i++) {
        if (spawns.length >= spawnN) break;
        const t = spawnN === 1 ? 0.5 : i / (spawnN - 1);
        spawns.push(pt(inset * 0.7 + span * t, top + (i % 2) * h * 0.012, w, h));
      }
      const merge1 = pt(w * 0.5 + (rng() - 0.5) * 16, h * (0.22 + (1 - travel) * 0.06), w, h);
      merges.push(merge1);
      spine.push(merge1);
      if (travel < 0.7) {
        const choke = pt(w * 0.5 + (rng() - 0.5) * w * 0.08 * hairpin, h * 0.42, w, h);
        merges.push(choke);
        spine.push(choke);
      }
      const flips = motif === "quad-squeeze" ? 1 : (travel > 0.7 ? 2 : 1);
      const startX = spine[spine.length - 1].x;
      const startY = spine[spine.length - 1].y + h * 0.04;
      const x = appendZig(spine, w, h, startY, exitY - h * 0.04, startX, Math.max(0.48, travel * 0.85), hairpin, rng, flips);
      spine.push(pt(x, exitY, w, h));
    } else if (motif === "hairpin") {
      // Tight switchbacks in a corridor — classic KR pressure.
      const gateL = pt(inset * 0.85, top, w, h);
      const gateR = pt(w - inset * 0.85, top, w, h);
      const gateC = pt(w * 0.5, top - h * 0.005, w, h);
      if (spawnN >= 4) spawns.push(gateL, pt(w * 0.35, top, w, h), pt(w * 0.65, top, w, h), gateR);
      else if (spawnN >= 3) spawns.push(gateL, gateC, gateR);
      else spawns.push(gateL, gateR);
      const merge = pt(w * 0.5, midBand * 0.85, w, h);
      merges.push(merge);
      spine.push(merge);
      const corridor = travel * 0.55;
      const flips = 2 + Math.floor(hairpin * 2);
      let x = merge.x;
      let y = merge.y;
      let side = rng() > 0.5 ? 1 : -1;
      for (let i = 0; i < flips; i++) {
        y += (exitY - merge.y) / (flips + 1);
        const outer = w * 0.5 + side * (w * 0.5 - inset) * corridor;
        spine.push(pt(outer, y - h * 0.02, w, h));
        spine.push(pt(outer, y + h * 0.01, w, h));
        x = w * 0.5 - side * (w * 0.5 - inset) * corridor * 0.35;
        spine.push(pt(x, y + h * 0.02, w, h));
        side *= -1;
      }
      spine.push(pt(w * 0.5 + (rng() - 0.5) * 24, exitY, w, h));
    } else {
      // s-bend — authored serpentine with two gates merging mid-map.
      const left = pt(inset * 0.75, top, w, h);
      const right = pt(w - inset * 0.75, top, w, h);
      spawns.push(left, right);
      while (spawns.length < spawnN) {
        spawns.push(pt(w * 0.5 + (spawns.length % 2 ? -1 : 1) * inset, top + h * 0.03, w, h));
      }
      const merge = pt(w * 0.5 + (rng() - 0.5) * w * 0.1, midBand, w, h);
      merges.push(merge);
      // Lead-in from a soft center approach for spine start.
      spine.push(pt(w * 0.5, top + h * 0.08, w, h));
      spine.push(merge);
      const flips = travel > 0.9 ? 5 : travel > 0.7 ? 4 : 3;
      const x = appendZig(spine, w, h, merge.y + h * 0.03, exitY - h * 0.05, merge.x, travel, hairpin * 0.7, rng, flips);
      spine.push(pt(x, exitY, w, h));
    }

    // Ensure exit is last spine point.
    if (!spine.length || spine[spine.length - 1].y < exitY - 8) {
      const last = spine[spine.length - 1] || { x: w * 0.5, y: funnelY };
      spine.push(pt(last.x, exitY, w, h));
    }
    return { spine, spawns, merges, motif };
  }
  function buildPadsFromAnchors(anchors, lanes, w, h, diff, rng) {
    const pads = [];
    const seen = [];
    const tooClose = (x, y) => seen.some((p) => Math.hypot(p.x - x, p.y - y) < 34);
    for (let i = 0; i < anchors.length; i++) {
      const b = anchors[i];
      const prev = anchors[Math.max(0, i - 1)];
      const next = anchors[Math.min(anchors.length - 1, i + 1)];
      let tx = next.x - prev.x, ty = next.y - prev.y;
      const len = Math.hypot(tx, ty) || 1;
      tx /= len; ty /= len;
      const side = (i % 2 === 0) ? 1 : -1;
      const inside = diff.hairpin > 0.55 && (b.merge || rng() < 0.4) ? -side : side;
      const ox = -ty * inside * diff.padOffset;
      const oy = tx * inside * diff.padOffset;
      let px = clampMap(b.x + ox, 22, w - 22);
      let py = clampMap(b.y + oy, 22, h - 22);
      for (let n = 0; n < 7; n++) {
        if (distToPathNetwork({ lanes }, px, py) >= diff.padClear) break;
        px = clampMap(px + ox * 0.2, 22, w - 22);
        py = clampMap(py + oy * 0.2, 22, h - 22);
      }
      if (distToPathNetwork({ lanes }, px, py) < diff.padClear * 0.85) continue;
      if (tooClose(px, py)) continue;
      const pad = { x: px, y: py, bend: i, merge: !!b.merge };
      pads.push(pad);
      seen.push(pad);
    }
    if (!pads.length && anchors.length) {
      const b = anchors[Math.floor(anchors.length / 2)] || anchors[0];
      pads.push({
        x: clampMap(b.x + diff.padOffset, 24, w - 24),
        y: clampMap(b.y, 24, h - 24),
        bend: 0,
      });
    }
    return pads;
  }
  function generatePath(seed, w, h, diffId) {
    const diff = layoutForDifficulty(diffId);
    const rng = mulberry32(hashSeed(seed + ":path:" + diff.id));
    const spawnN = spawnCountForDifficulty(diff.id);
    const pool = diff.motifs || ["s-bend"];
    const motif = pool[Math.floor(rng() * pool.length)];
    const composed = composeMotif(motif, w, h, spawnN, diff, rng);
    const { spine, spawns, merges } = composed;

    // Main lane = first spawn (or spine head) through spine.
    const mainStart = spawns[0] || spine[0];
    const mainCorners = [mainStart];
    // Authored gate plaza → approach into first merge / spine.
    mainCorners.push(pt(mainStart.x, mainStart.y + h * 0.05, w, h));
    if (merges[0] && Math.hypot(mainStart.x - merges[0].x, mainStart.y - merges[0].y) > 20) {
      const m0 = merges[0];
      mainCorners.push(pt(mainStart.x * 0.55 + m0.x * 0.45, mainStart.y * 0.35 + m0.y * 0.65, w, h));
      mainCorners.push(pt(m0.x, m0.y - h * 0.015, w, h));
    }
    for (const c of spine) {
      const last = mainCorners[mainCorners.length - 1];
      if (!last || Math.hypot(last.x - c.x, last.y - c.y) > 6) mainCorners.push(c);
    }
    const main = finalizeLane(mainCorners);
    const lanes = [main];

    // Side spawns → authored approach arcs into merges (readable multi-gate pressure).
    for (let s = 1; s < spawns.length; s++) {
      const start = spawns[s];
      const merge = merges[Math.min(merges.length - 1, Math.floor((s - 1) / Math.max(1, spawns.length - 1) * merges.length))] || merges[0] || spine[0];
      const side = start.x < w * 0.5 ? -1 : 1;
      // Plaza drop just below the gate, then sweep inward toward the choke.
      const plaza = pt(start.x + side * w * 0.01, start.y + h * 0.055, w, h);
      const sweep = pt(
        start.x * 0.55 + merge.x * 0.45 + side * w * 0.04,
        start.y * 0.35 + merge.y * 0.65,
        w, h
      );
      const mouth = pt(
        merge.x + side * 8,
        merge.y - h * 0.02,
        w, h
      );
      const mergeIdx = spine.findIndex((p) => Math.hypot(p.x - merge.x, p.y - merge.y) < 8);
      const rest = mergeIdx >= 0 ? spine.slice(mergeIdx) : [merge, ...spine];
      const spur = [start, plaza, sweep, mouth, ...rest];
      lanes.push(finalizeLane(spur));
    }

    // Pad anchors: every meaningful bend + every merge.
    const anchors = [];
    for (let i = 1; i < mainCorners.length - 1; i++) {
      if (cornerTurn(mainCorners, i) > 0.55) anchors.push({ ...mainCorners[i], merge: false });
    }
    for (const m of merges) anchors.push({ ...m, merge: true });
    // Dedupe near-duplicates.
    const unique = [];
    for (const a of anchors) {
      if (unique.some((u) => Math.hypot(u.x - a.x, u.y - a.y) < 28)) {
        if (a.merge) unique.find((u) => Math.hypot(u.x - a.x, u.y - a.y) < 28).merge = true;
        continue;
      }
      unique.push(a);
    }
    // Pad anchors stay for obstacle spacing only — not drawn (free placement).
    const pads = buildPadsFromAnchors(unique, lanes, w, h, diff, rng);
    const exit = mainCorners[mainCorners.length - 1];

    // Unbuildable rocks: harder maps pack more obstacles (BTD-style space pressure).
    const obstacles = [];
    const rockN = diff.id === "nightmare" ? 7 : diff.id === "hard" ? 5 : 3;
    const pathClear = diff.pathClear;
    for (let i = 0; i < rockN * 4 && obstacles.length < rockN; i++) {
      const x = 28 + rng() * (w - 56);
      const y = h * 0.14 + rng() * (h * 0.7);
      const r = 14 + rng() * 10 + (diff.id === "nightmare" ? 3 : 0);
      if (distToPathNetwork({ lanes }, x, y) < pathClear + r + 6) continue;
      if (pads.some((p) => Math.hypot(p.x - x, p.y - y) < r + 22)) continue;
      if (obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 10)) continue;
      if (spawns.some((s) => Math.hypot(s.x - x, s.y - y) < r + 36)) continue;
      if (exit && Math.hypot(exit.x - x, exit.y - y) < r + 40) continue;
      obstacles.push({ x, y, r });
    }

    return {
      points: main.points, lengths: main.lengths, total: main.total,
      lanes, pads, obstacles, spawns: spawns.slice(0, lanes.length), merges, exit,
      spawnN: lanes.length, motif, layout: diff.id, pathClear: diff.pathClear,
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
      if (runIsDaily && wave >= 30) n += 1;
      return Math.min(5, Math.max(1, n));
    }
    // Mid/late: more mid-cycle bosses so pressure stacks across overlaps.
    const midChance = runIsDaily ? 0.62 : 0.42;
    if (wave >= 18 && wave % 5 === 0 && rng() < midChance) return 1;
    if (wave >= 28 && wave % 5 === 0 && rng() < (runIsDaily ? 0.78 : 0.55)) return 1;
    if (wave >= 35 && rng() < (runIsDaily ? 0.18 : 0.12)) return 1;
    return 0;
  }

  function wavePlan(seed, wave, diffId) {
    const diff = DIFFICULTIES[diffId] || DIFFICULTIES.normal;
    const daily = runIsDaily ? DAILY : null;
    const rng = mulberry32(hashSeed(seed + ":wave:" + wave + ":" + diff.id + (daily ? ":daily" : "")));
    const early = Math.min(wave, 10);
    const mid = Math.max(0, Math.min(wave, 22) - 10);
    const late = Math.max(0, Math.min(wave, 40) - 22);
    const deep = Math.max(0, wave - 40);
    // Soft early → steep mid/late → deep exponential (Daily multiplies on top of Normal).
    const difficulty = (
      1 + early * BALANCE.hpEarly + mid * BALANCE.hpMid + late * BALANCE.hpLate
    ) * Math.pow(BALANCE.hpDeepBase, deep) * diff.hpMul * (daily ? daily.hpMul : 1);
    const bossN = bossCountForWave(wave, rng);
    const isBoss = bossN > 0;
    const countSlope = wave <= 5 ? BALANCE.countWaveEarly : BALANCE.countWaveLate;
    const count = Math.min(
      BALANCE.countCap,
      Math.floor(
        (6 + Math.floor(wave * countSlope + rng() * 3) + deep * 0.4) *
        diff.countMul * (daily ? daily.countMul : 1)
      )
    );
    const interval = Math.max(
      0.15,
      (0.9 - wave * 0.026 + (rng() - 0.5) * 0.1) * diff.intervalMul * (daily ? daily.intervalMul : 1)
    );
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
    const armorBias = (diff.id === "nightmare" ? 0.1 : 0) + (daily ? daily.armorBias : 0);
    const weights = {
      drone: 0.38 + rng() * 0.14,
      crawler: 0.26,
      armor: Math.min(0.55, 0.08 + wave * 0.028 + armorBias),
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
    const layoutId = daily ? daily.layout : diff.id;
    return {
      count, interval, mix, difficulty, isBoss, bossN,
      speedMul: diff.speedMul * (1 + Math.min(0.42, deep * 0.003)) * (daily ? daily.speedMul : 1),
      rewardMul: diff.rewardMul * rewardFade * BALANCE.scrapKillScale * (daily ? daily.rewardMul : 1),
      spawnLanes: (state.path && state.path.spawnN) || spawnCountForDifficulty(layoutId),
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
    towers: [], enemies: [], projectiles: [], fx: [], particles: [], hazards: [],
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
    "Prep: place towers anywhere off the road — avoid rocks.",
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
      state.path = generatePath(state.seed, state.w, state.h, runLayoutDiffId());
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
      state.path = generatePath(state.seed, state.w, state.h, runLayoutDiffId());
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

  function runLayoutDiffId() {
    if (runIsDaily) return DAILY.layout;
    return state.difficulty || "normal";
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
      // Meta tracks as Normal; wavePlan + layout use Daily modifiers / Hard path.
      state.difficulty = "normal";
      state.seed = dailySeedFor(runDailyKey || dailyKey());
    }
    state.path = generatePath(state.seed, state.w, state.h, runLayoutDiffId());
    const diff = currentDiff();
    state.hp = runIsDaily ? 18 : diff.id === "nightmare" ? 16 : diff.id === "hard" ? 18 : 20;
    const scrapMul = runIsDaily ? 0.92
      : diff.id === "nightmare" ? 0.85
      : diff.id === "hard" ? 0.95
      : 1;
    state.scrap = Math.floor(BALANCE.scrapStart * scrapMul);
    state.score = 0; state.wave = 0;
    state.towers = []; state.enemies = []; state.projectiles = []; state.fx = []; state.particles = []; state.hazards = []; state.enemySeq = 0;
    state.spawnQueue = []; state.spawnTimer = 0; state.betweenWaves = 0;
    state.awaitingStart = true; // Prep: place freely; waves wait for Start.
    state.selectedBuilt = null; state.selectedTower = null; state.ghost = null;
    placePtr = null;
    state.shake = 0; state.flash = 0;
    state.mode = "playing";
    showScreen(null);
    showBanner(runIsDaily ? "Daily · 100 waves" : "Prep · place towers");
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
  function endRun(abandoned, opts = {}) {
    const wave = state.wave, score = state.score;
    const victory = !!opts.victory && !abandoned;
    const diff = DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal;
    const wasDaily = runIsDaily;
    const dailyBonus = wasDaily && !abandoned
      ? (wave >= 8 ? 18 : 0) + (victory ? DAILY.clearBonus : 0)
      : 0;
    const chipScale = diff.chipMul * (wasDaily ? DAILY.chipMul : 1);
    const chips = Math.floor((abandoned ? wave * 3 + score / 55 : wave * 6.5 + score / 26) * chipScale) + dailyBonus;
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
    if (wasDaily && runDailyKey) {
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
    runIsDaily = false; runDailyKey = null;
    clearRun();
    state.mode = "over";
    hideCoach(false);
    if (els.overTitle) {
      els.overTitle.textContent = victory
        ? "Rift Sealed"
        : abandoned
          ? "Run Abandoned"
          : "Wellheart Breached";
    }
    els.overSummary.textContent =
      `${wasDaily ? "Daily · " : ""}${wasDaily ? "Rift" : diff.name} · Wave ${wave}${wasDaily ? "/" + DAILY.waveCap : ""} · Score ${formatCompact(score)}` +
      (abandoned ? " (abandoned)" : victory ? " · clear" : "");
    els.overChips.textContent =
      `+${Math.max(0, chips)} chips` +
      (dailyBonus ? ` · daily +${dailyBonus}` : "") +
      (newly.length ? ` · ${newly.join(", ")}` : "");
    showScreen("over"); refreshHub();
    sfx.over();
    addShake(victory ? 0.55 : 1.1);
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
          ? `Today’s best: W${bestD.wave || 0}/${DAILY.waveCap} · ${formatCompact(bestD.score || 0)} · ${meta.dailiesCompleted || 0} dailies`
          : `Shared seed ${key} · ${DAILY.waveCap} waves · harder than Normal`;
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
    const dShort = runIsDaily
      ? "D"
      : ({ normal: "N", hard: "H", nightmare: "NM" })[state.difficulty] || "N";
    const waveN = Math.max(1, state.wave);
    els.wave.textContent = state.awaitingStart
      ? `${dShort} · Prep`
      : runIsDaily
        ? `${dShort} · W${waveN}/${DAILY.waveCap}`
        : `${dShort} · W${waveN}`;
    els.score.textContent = formatCompact(score);
    els.score.title = String(score);
    if (els.wave && els.wave.parentElement) {
      els.wave.parentElement.title = state.awaitingStart
        ? `${dShort} · Prep — tap Start when ready`
        : runIsDaily
          ? `Daily · Wave ${waveN} of ${DAILY.waveCap} · Score ${score}`
          : `${dShort} · Wave ${waveN} · Score ${score}`;
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
    return !t || !t.levelCd || t.levelCd <= 0;
  }
  function maxTowerLevelCd() {
    let m = 0;
    for (const t of state.towers) m = Math.max(m, t.levelCd || 0);
    return m;
  }
  function countAffordableLevels(readyOnly = true) {
    // Estimate how many levels Up All can buy right now (cheapest-first spend-down).
    let scrap = state.scrap;
    const levels = state.towers.map((t) => t.level);
    const ready = state.towers.map((t) => towerLevelReady(t));
    let n = 0;
    for (let guard = 0; guard < 200; guard++) {
      let best = -1, bestCost = Infinity;
      for (let i = 0; i < state.towers.length; i++) {
        if (readyOnly && !ready[i]) continue;
        const fake = { type: state.towers[i].type, level: levels[i] };
        const c = upgradeCost(fake);
        if (scrap >= c && c < bestCost) { bestCost = c; best = i; }
      }
      if (best < 0) break;
      scrap -= bestCost;
      levels[best] += 1;
      n += 1;
    }
    return n;
  }
  function applyTowerLevelStats(t) {
    const base = towerStats(t.type);
    const soft = 1 + Math.max(0, t.level - 6) * BALANCE.levelDmgSoft;
    t.damage = base.damage * (1 + (t.level - 1) * BALANCE.levelDmgPer) / soft;
    t.range = clampTowerRange(t.type, base.range * (1 + (t.level - 1) * BALANCE.levelRangePer));
    t.fireRate = base.fireRate * Math.max(0.48, 1 - (t.level - 1) * BALANCE.levelRatePer);
    if (base.splash) t.splash = base.splash * (1 + (t.level - 1) * 0.1);
    t.turnRate = base.turnRate || t.turnRate;
    t.maxRange = base.maxRange;
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
    if (!opts.skipCd) t.levelCd = BALANCE.levelCd;
    applyTowerLevelStats(t);
    if (!opts.silent) {
      burstUpgrade(t.x, t.y, t.color);
      sfx.upgrade();
    }
    return true;
  }
  function syncAutoLevelBtn() {
    if (!els.btnAutoLevel) return;
    if (!state.towers.length) {
      els.btnAutoLevel.disabled = true;
      els.btnAutoLevel.textContent = "Up All";
      els.btnAutoLevel.title = "Place a tower first";
      return;
    }
    const ready = state.towers.some((t) => towerLevelReady(t));
    const canBuy = countAffordableLevels(true);
    if (!ready) {
      const cd = maxTowerLevelCd();
      els.btnAutoLevel.disabled = true;
      els.btnAutoLevel.textContent = cd > 0 ? `All ${Math.ceil(cd)}s` : "Up All";
      els.btnAutoLevel.title = cd > 0 ? `Level cooldown ${cd.toFixed(1)}s` : "No towers ready";
      return;
    }
    if (!canBuy) {
      const cheapest = Math.min(...state.towers.filter(towerLevelReady).map(upgradeCost));
      els.btnAutoLevel.disabled = true;
      els.btnAutoLevel.textContent = "Up All";
      els.btnAutoLevel.title = `Need ${cheapest} scrap for next level`;
      return;
    }
    els.btnAutoLevel.disabled = false;
    els.btnAutoLevel.textContent = canBuy > 1 ? `Up All · ${canBuy}` : "Up All";
    els.btnAutoLevel.title = `Auto-level ready towers (${canBuy} level${canBuy > 1 ? "s" : ""})`;
  }
  /** Spend scrap across ready towers cheapest-first until broke; one shared CD after. */
  function autoLevelAllTowers() {
    if (!state.towers.length) { toast("No towers yet"); syncAutoLevelBtn(); return; }
    const readyIdx = [];
    for (let i = 0; i < state.towers.length; i++) {
      if (towerLevelReady(state.towers[i])) readyIdx.push(i);
    }
    if (!readyIdx.length) {
      const cd = maxTowerLevelCd();
      toast(cd > 0 ? `Level cooldown ${Math.ceil(cd)}s` : "No towers ready");
      syncAutoLevelBtn();
      return;
    }
    let levels = 0;
    let spent = 0;
    const touched = new Set();
    for (let guard = 0; guard < 200; guard++) {
      let best = -1, bestCost = Infinity;
      for (const i of readyIdx) {
        const t = state.towers[i];
        const c = upgradeCost(t);
        if (state.scrap >= c && c < bestCost) { bestCost = c; best = i; }
      }
      if (best < 0) break;
      const t = state.towers[best];
      state.scrap -= bestCost;
      t.level += 1;
      applyTowerLevelStats(t);
      spent += bestCost;
      levels += 1;
      touched.add(best);
    }
    if (!levels) {
      const cheapest = Math.min(...readyIdx.map((i) => upgradeCost(state.towers[i])));
      toast(`Need ${cheapest} scrap`);
      syncAutoLevelBtn();
      return;
    }
    for (const i of touched) {
      const t = state.towers[i];
      t.levelCd = BALANCE.levelCd;
      burstUpgrade(t.x, t.y, t.color);
    }
    sfx.upgrade();
    const towersN = touched.size;
    toast(
      levels === 1
        ? `+1 level · −${spent} scrap`
        : `+${levels} levels on ${towersN} tower${towersN > 1 ? "s" : ""} · −${spent}`
    );
    updateHUD();
    saveRun();
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
    els.btnUpgrade.title = !ready
      ? `Cooldown ${Math.ceil(sel.levelCd || 0)}s`
      : state.scrap < upCost
        ? `Need ${upCost} scrap`
        : `Level up for ${upCost} scrap`;
    syncAutoLevelBtn();
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
    const cols = maxCol + 1;
    const rows = maxRow + 1;
    const grid = document.createElement("div");
    grid.className = "up-tree-grid";
    grid.style.setProperty("--up-cols", String(cols));
    grid.style.setProperty("--up-rows", String(rows));

    // Connected skill tree: curved branches + hub nodes in grid space.
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "up-tree-svg");
    svg.setAttribute("viewBox", `0 0 ${cols} ${rows}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    const hubKeys = new Set();
    for (const u of tree) {
      if (!u.req) continue;
      const parent = tree.find((p) => p.id === u.req);
      if (!parent) continue;
      const lit = ownedRank(u.req) >= (u.reqRank || 1);
      const x1 = (parent.col || 0) + 0.5;
      const y1 = (parent.row || 0) + 0.88;
      const x2 = (u.col || 0) + 0.5;
      const y2 = (u.row || 0) + 0.12;
      const midY = (y1 + y2) / 2;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      // Smooth S-curve when columns differ; vertical otherwise.
      if (Math.abs(x1 - x2) < 0.05) {
        path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
      } else {
        path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
      }
      path.setAttribute("class", "up-branch" + (lit ? " lit" : ""));
      svg.appendChild(path);
      const hk = `${parent.col},${parent.row}`;
      if (!hubKeys.has(hk)) {
        hubKeys.add(hk);
        const hub = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        hub.setAttribute("cx", String(x1));
        hub.setAttribute("cy", String(y1));
        hub.setAttribute("r", "0.07");
        hub.setAttribute("class", "up-hub" + (lit ? " lit" : ""));
        svg.appendChild(hub);
      }
      const leaf = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      leaf.setAttribute("cx", String(x2));
      leaf.setAttribute("cy", String(y2));
      leaf.setAttribute("r", "0.06");
      leaf.setAttribute("class", "up-hub" + (ownedRank(u.id) > 0 ? " lit" : ""));
      svg.appendChild(leaf);
    }
    grid.appendChild(svg);

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
      // Vertical stack: icon+name, desc, rank/cost footer — no overlapping cost pill.
      node.innerHTML =
        `<span class="up-top"><span class="up-ico up-ico-${u.icon || "star"}" aria-hidden="true"></span>` +
        `<span class="up-name">${u.name}</span></span>` +
        `<span class="up-desc">${u.desc}</span>` +
        `<span class="up-foot"><span class="up-rank">${rank}/${max}</span>` +
        `<span class="up-cost">${full ? "MAX" : nextCost}</span></span>`;
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
    if (runIsDaily && state.wave >= DAILY.waveCap) return;
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
    if (runIsDaily && state.wave >= DAILY.waveCap) banner = `Final · ${banner}`;
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
    state.enemySeq = (state.enemySeq || 0) + 1;
    state.enemies.push({
      id: state.enemySeq,
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
      stunT: 0, stunCd: 0, freezeT: 0, freezeCd: 0, ccDR: 0,
      brittleT: 0, rimeShield: 0, plasmaMark: 0, matchFxAt: 0, alive: true, hitFlash: 0,
      lane: meta.lane || 0,
    });
  }

  function moveFloorFor(e) {
    if (isBossEnemy(e)) return BALANCE.moveFloorBoss;
    if (e.tags && e.tags.includes("armored")) return BALANCE.moveFloorArmored;
    return BALANCE.moveFloor;
  }
  function slowFloorFor(e) {
    return isBossEnemy(e) ? BALANCE.slowFloorBoss : BALANCE.slowFloor;
  }
  function ccPotency(e, opts = {}) {
    let m = 1 / (1 + Math.min(BALANCE.ccDrCap, e.ccDR || 0) * BALANCE.ccDrPer);
    if (isBossEnemy(e)) m *= 0.42;
    else if (e.tags && e.tags.includes("armored")) m *= 0.72;
    // AoE / splash CC is intentionally weaker than single-target sockets.
    if (opts.aoe) m *= BALANCE.aoeCcMul;
    if (opts.mul != null) m *= opts.mul;
    return m;
  }
  function noteCc(e, weight = 1) {
    e.ccDR = Math.min(BALANCE.ccDrCap, (e.ccDR || 0) + weight);
  }
  function applyMoveSlow(e, targetMul, dur, opts = {}) {
    const floor = slowFloorFor(e);
    const pot = ccPotency(e, opts);
    const desired = Math.max(floor, 1 - (1 - targetMul) * pot);
    e.slow = Math.min(e.slow, desired);
    e.slowT = Math.max(e.slowT || 0, dur * Math.min(1.15, 0.65 + pot * 0.5));
    if (!opts.soft) noteCc(e, opts.aoe ? 0.18 : 0.35);
  }
  function applyStun(e, dur, opts = {}) {
    const pot = ccPotency(e, opts);
    const cd = (isBossEnemy(e) ? BALANCE.stunCdBoss : BALANCE.stunCd) * (opts.aoe ? 1.25 : 1);
    if ((e.stunCd || 0) > 0 || pot < 0.18) return false;
    const cap = isBossEnemy(e) ? BALANCE.stunCapBoss : BALANCE.stunCap;
    e.stunT = Math.max(e.stunT || 0, Math.min(cap, dur * pot));
    e.stunCd = cd;
    noteCc(e, opts.aoe ? 0.4 : 0.85);
    return true;
  }
  function applyFreezeChill(e, targetMul, dur, freezeDur, opts = {}) {
    const pot = ccPotency(e, opts);
    const fCd = (isBossEnemy(e) ? BALANCE.freezeCdBoss : BALANCE.freezeCd) * (opts.aoe ? 1.2 : 1);
    applyMoveSlow(e, targetMul, dur, opts);
    if ((e.freezeCd || 0) <= 0 && pot > 0.22) {
      e.freezeT = Math.max(e.freezeT || 0, Math.min(1.0, freezeDur * pot));
      e.freezeCd = fCd;
      noteCc(e, opts.aoe ? 0.25 : 0.5);
    }
    e.chillT = Math.max(e.chillT || 0, dur * (opts.aoe ? 0.55 : 0.85));
  }
  function applyKnock(e, push, opts = {}) {
    const pot = ccPotency(e, opts);
    const cd = (isBossEnemy(e) ? BALANCE.knockCdBoss : BALANCE.knockCd) * (opts.aoe ? 1.15 : 1);
    if ((e.knockCd || 0) > 0 || pot < 0.18) return false;
    const cap = isBossEnemy(e) ? BALANCE.knockCapBoss : BALANCE.knockCap;
    const amt = Math.min(cap, push * pot);
    e.dist = Math.max(0, e.dist - amt);
    e.knockCd = cd;
    noteCc(e, opts.aoe ? 0.2 : 0.4);
    return true;
  }
  function angleDelta(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function pushHazard(h) {
    if (!state.hazards) state.hazards = [];
    state.hazards.push(h);
    if (state.hazards.length > 24) state.hazards.shift();
  }
  function comboBurst(x, y, color, label) {
    pushCombatFx({ kind: "blast", x, y, t: 0.34, r: 46, color });
    pushCombatFx({ kind: "ring", x, y, t: 0.4, r0: 8, r1: 40, color });
    if (label) state.fx.push({ kind: "text", x, y: y - 18, t: 0.5, text: label, color });
    spawnParticles(x, y, color, 12, 90);
  }

  function hitsObstacle(x, y, rad = 18) {
    const obs = (state.path && state.path.obstacles) || [];
    for (const o of obs) {
      if (Math.hypot(o.x - x, o.y - y) < (o.r || 16) + rad) return true;
    }
    return false;
  }
  function pathPlacementClear() {
    const fromPath = state.path && state.path.pathClear;
    const fromDiff = layoutForDifficulty(runLayoutDiffId()).pathClear;
    // Always enforce road half-width + footprint so towers cannot sit on asphalt.
    return Math.max(ROAD_HALF_W + TOWER_PLACE_R, fromPath || 0, fromDiff || 0, 50);
  }
  function placeTower(x, y) {
    const type = state.selectedTower;
    if (!type || !state.path) return;
    const stats = towerStats(type);
    if (state.scrap < stats.cost) { toast("Not enough scrap"); return; }
    // Free placement: path clearance + obstacles + spacing — no pad-only slots.
    if (!placementOk(x, y)) {
      if (hitsObstacle(x, y, TOWER_PLACE_R)) toast("Blocked by rock");
      else if (distToPathNetwork(state.path, x, y) < pathPlacementClear()) toast("Too close to the road");
      else toast("Invalid spot");
      return;
    }
    state.scrap -= stats.cost;
    state.towers.push({
      ...stats,
      type, x, y, nx: x / state.w, ny: y / state.h,
      level: 1, cooldown: 0, levelCd: 0, elements: [],
      aim: -Math.PI / 2, recoil: 0, turnRate: stats.turnRate || 3.5,
      lockId: null, acquireT: 0,
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

  function applyOnHitEffects(tower, enemy, dealt, hitOpts = {}) {
    const elsArr = tower.elements || [];
    const has = (e) => elsArr.includes(e);
    const key = comboKey(elsArr);
    const p = enemyPos(enemy);
    const aoeHit = !!hitOpts.aoe || !!tower.splash;
    const st = aoeHit ? { aoe: true } : {};
    const r = enemyResist(enemy);
    const resistFactor = (el) => {
      const v = r[el] == null ? 1 : r[el];
      return Math.max(0.25, Math.min(1.6, v));
    };

    // Primary sockets — single-target potency unless this hit is splash.
    if (has("fire") || tower.burn) {
      const rf = resistFactor("fire");
      const burn = ((has("fire") ? 8 : 0) + (tower.burn || 0)) * rf * (aoeHit ? 0.7 : 1);
      enemy.burn = Math.max(enemy.burn, burn);
      enemy.burnT = Math.max(enemy.burnT, (key === "fire+wind" ? 3.0 : 2.0) * Math.min(1.2, rf));
    }
    if (has("water") && key !== "earth+water" && key !== "fire+water") {
      const rf = resistFactor("water");
      applyMoveSlow(enemy, 1 - (1 - 0.58) * rf, 1.4, st);
      enemy.chillT = Math.max(enemy.chillT || 0, 1.2);
    } else if (tower.slow && !has("water")) {
      applyMoveSlow(enemy, tower.slow, tower.slowDur || 1.2, st);
    }
    if (has("earth") && key !== "earth+wind" && key !== "arc+earth" && key !== "earth+frost") {
      const rf = resistFactor("earth");
      enemy.shred = Math.min(0.5, (enemy.shred || 0) + 0.12 * rf * (aoeHit ? BALANCE.aoeCcMul : 1));
    }
    if (has("wind") && key !== "frost+wind" && key !== "fire+water") {
      const rf = resistFactor("wind");
      if (rf > 0.35) applyKnock(enemy, key === "earth+wind" ? 5.5 : 3.5, st);
    }
    if (has("arc") && key !== "arc+earth" && key !== "arc+frost" && key !== "arc+water") {
      const rf = resistFactor("arc");
      if (rf > 0.35 && applyStun(enemy, 0.26, st) && Math.random() < 0.3) {
        state.fx.push({ kind: "text", x: p.x, y: p.y - 20, t: 0.4, text: "SHOCK", color: ELEMENTS.arc.color });
      }
    }
    if (has("frost") && key !== "arc+frost" && key !== "frost+water" && key !== "earth+frost" && key !== "frost+wind") {
      const rf = resistFactor("frost");
      applyFreezeChill(enemy, 1 - (1 - 0.38) * rf, 1.35, 0.7, st);
    }

    // Distinct pair combos (mechanic + VFX) — avoid stacking the same hard CC.
    if (key === "fire+water") {
      // Geyser: damage + shove FORWARD along path (anti-stall).
      enemy.hp -= dealt * 0.22;
      enemy.dist += isBossEnemy(enemy) ? 6 : 14;
      comboBurst(p.x, p.y, "#9ad0e8", "GEYSER");
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 40) {
          e.hp -= dealt * 0.18;
          e.dist += isBossEnemy(e) ? 3 : 8;
          if (e.hp <= 0) killEnemy(e);
        }
      }
      if (enemy.hp <= 0) killEnemy(enemy);
    } else if (key === "earth+water") {
      // Mire: leave sticky zone (soft slow only via hazard).
      pushHazard({ kind: "mire", x: p.x, y: p.y, r: 46, t: 3.2, slow: 0.72 });
      comboBurst(p.x, p.y, ELEMENTS.earth.color, "MIRE");
      applyMoveSlow(enemy, 0.72, 0.8, { aoe: true });
    } else if (key === "fire+wind" && enemy.burnT > 0) {
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 55) {
          e.burn = Math.max(e.burn, 6);
          e.burnT = Math.max(e.burnT, 1.8);
        }
      }
      pushCombatFx({ kind: "ring", x: p.x, y: p.y, t: 0.4, r0: 10, r1: 56, color: "#e85d4c" });
      state.fx.push({ kind: "text", x: p.x, y: p.y - 18, t: 0.45, text: "WILDFIRE", color: "#e85d4c" });
    } else if (key === "arc+fire") {
      // Plasma: execute mark — bonus damage if low HP.
      enemy.plasmaMark = Math.max(enemy.plasmaMark || 0, 2.4);
      let bonus = 0;
      if (enemy.hp / enemy.maxHp < 0.35) bonus = dealt * (isBossEnemy(enemy) ? 0.35 : 0.7);
      if (bonus) {
        enemy.hp -= bonus;
        state.fx.push({ kind: "text", x: p.x, y: p.y - 22, t: 0.5, text: "PLASMA", color: ELEMENTS.arc.color });
        pushCombatFx({ kind: "beam", x: tower.x, y: tower.y, x2: p.x, y2: p.y, t: 0.14, color: "#ffe08a" });
        if (enemy.hp <= 0) killEnemy(enemy);
      } else {
        pushCombatFx({ kind: "spark", x: p.x, y: p.y, t: 0.28, color: ELEMENTS.arc.color });
      }
    } else if (key === "arc+water") {
      // Conduct: splash damage, tiny stumble (AoE CC nerfed).
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 48) {
          e.hp -= dealt * 0.3;
          applyStun(e, 0.16, { aoe: true });
          if (e.hp <= 0) killEnemy(e);
        }
      }
      comboBurst(p.x, p.y, ELEMENTS.arc.color, "CONDUCT");
    } else if (key === "arc+earth") {
      // Fracture: shred pulse — not a stun lock.
      enemy.shred = Math.min(0.5, (enemy.shred || 0) + 0.16);
      applyMoveSlow(enemy, 0.7, 0.55, st);
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 50) {
          e.shred = Math.min(0.5, (e.shred || 0) + 0.1);
          applyMoveSlow(e, 0.78, 0.4, { aoe: true });
        }
      }
      pushCombatFx({ kind: "ring", x: p.x, y: p.y, t: 0.4, r0: 8, r1: 52, color: ELEMENTS.earth.color });
      state.fx.push({ kind: "text", x: p.x, y: p.y - 18, t: 0.45, text: "FRACTURE", color: ELEMENTS.earth.color });
    } else if (key === "arc+wind") {
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
        applyStun(second, 0.14, { aoe: true });
        state.fx.push({ kind: "beam", x: p.x, y: p.y, x2: q.x, y2: q.y, t: 0.12, color: ELEMENTS.arc.color });
        pushCombatFx({ kind: "spark", x: q.x, y: q.y, t: 0.22, color: ELEMENTS.arc.color });
        state.fx.push({ kind: "text", x: q.x, y: q.y - 16, t: 0.4, text: "SURGE", color: ELEMENTS.arc.color });
        if (second.hp <= 0) killEnemy(second);
      }
    } else if (key === "arc+frost") {
      // Brittle: next hit amp — no stun+freeze stack.
      enemy.brittleT = Math.max(enemy.brittleT || 0, 2.8);
      applyMoveSlow(enemy, 0.65, 0.9, st);
      state.fx.push({ kind: "text", x: p.x, y: p.y - 20, t: 0.45, text: "BRITTLE", color: ELEMENTS.frost.color });
      pushCombatFx({ kind: "ring", x: p.x, y: p.y, t: 0.35, r0: 6, r1: 28, color: ELEMENTS.frost.color });
    } else if (key === "frost+water") {
      // Rime: temporary shell that pops for damage (not deep freeze).
      if ((enemy.rimeShield || 0) <= 0) {
        enemy.rimeShield = Math.max(18, dealt * 0.45);
        state.fx.push({ kind: "text", x: p.x, y: p.y - 18, t: 0.45, text: "RIME", color: ELEMENTS.frost.color });
        pushCombatFx({ kind: "ring", x: p.x, y: p.y, t: 0.4, r0: 4, r1: 26, color: "#c8e8f8" });
      } else {
        const pop = enemy.rimeShield;
        enemy.rimeShield = 0;
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const q = enemyPos(e);
          if (Math.hypot(q.x - p.x, q.y - p.y) < 44) {
            e.hp -= pop * (e === enemy ? 1 : 0.55);
            applyMoveSlow(e, 0.7, 0.5, { aoe: true });
            if (e.hp <= 0) killEnemy(e);
          }
        }
        comboBurst(p.x, p.y, ELEMENTS.frost.color, "POP");
      }
      applyMoveSlow(enemy, 0.62, 1.0, st);
    } else if (key === "earth+frost") {
      // Spike: armor pierce damage, light chill.
      const pierce = dealt * (enemy.tags.includes("armored") ? 0.45 : 0.2);
      enemy.hp -= pierce;
      enemy.shred = Math.min(0.5, (enemy.shred || 0) + 0.14);
      applyMoveSlow(enemy, 0.68, 0.7, st);
      state.fx.push({ kind: "text", x: p.x, y: p.y - 20, t: 0.45, text: "SPIKE", color: ELEMENTS.earth.color });
      pushCombatFx({ kind: "spark", x: p.x, y: p.y, t: 0.3, color: ELEMENTS.frost.color });
      if (enemy.hp <= 0) killEnemy(enemy);
    } else if (key === "frost+wind") {
      // Whiteout: scramble facing + soft chill (AoE).
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) > 58) continue;
        applyMoveSlow(e, 0.7, 1.0, { aoe: true });
        e.chillT = Math.max(e.chillT || 0, 1.0);
        // Nudge along path — keeps pressure, not a pin.
        e.dist += (Math.random() - 0.35) * (isBossEnemy(e) ? 4 : 10);
        e.dist = Math.max(0, e.dist);
      }
      comboBurst(p.x, p.y, ELEMENTS.frost.color, "WHITEOUT");
    } else if (key === "fire+frost" && enemy.tags.includes("armored")) {
      enemy.shred = Math.min(0.5, (enemy.shred || 0) + 0.2);
      if (Math.random() < 0.45) {
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
      pushHazard({ kind: "magma", x: p.x, y: p.y, r: 48, t: 2.6, dps: Math.max(10, opts.magma * 0.4) });
      for (const o of state.enemies) {
        if (!o.alive) continue;
        const q = enemyPos(o);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 50) {
          o.hp -= opts.magma * 0.55;
          o.burn = Math.max(o.burn, 5);
          o.burnT = Math.max(o.burnT, 1.5);
          if (o.hp <= 0) killEnemy(o);
        }
      }
      pushCombatFx({ kind: "blast", x: p.x, y: p.y, t: 0.4, r: 50, color: "#e85d4c" });
      state.fx.push({ kind: "text", x: p.x, y: p.y - 16, t: 0.5, text: "MAGMA", color: "#e85d4c" });
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
    if ((e.brittleT || 0) > 0) {
      dmg *= 1.4;
      e.brittleT = 0;
      const bp = enemyPos(e);
      state.fx.push({ kind: "text", x: bp.x, y: bp.y - 16, t: 0.4, text: "CRACK", color: ELEMENTS.frost.color });
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
    applyOnHitEffects(tower, e, dmg, { aoe: !!opts.aoe });
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
    // Keep current aim — rotation system already slewed toward the target.
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
        state.enemies = state.enemies.filter((e) => e.alive);
        // Daily hard-stops at waveCap: wait for a clear field, then victory.
        if (runIsDaily && state.wave >= DAILY.waveCap) {
          if (livingEnemyCount() === 0) {
            endRun(false, { victory: true });
            return;
          }
          // Hold — do not schedule wave 101.
        } else {
          // Timer advance: next wave starts even if foes remain (overlaps OK).
          state.betweenWaves = nextWaveDelay();
          const scrapWave = Math.floor(BALANCE.scrapWaveBase + state.wave * BALANCE.scrapWavePer);
          state.scrap += Math.floor(scrapWave * (runIsDaily ? DAILY.scrapWaveMul : 1));
          saveRun();
        }
      }
    }

    const broodSpawns = [];
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (e.hitFlash > 0) e.hitFlash -= step;
      if (e.knockCd > 0) e.knockCd -= step;
      if (e.stunCd > 0) e.stunCd -= step;
      if (e.freezeCd > 0) e.freezeCd -= step;
      if (e.stunT > 0) e.stunT -= step;
      if (e.freezeT > 0) e.freezeT -= step;
      if (e.slowT > 0) { e.slowT -= step; if (e.slowT <= 0) e.slow = 1; }
      if (e.chillT > 0) e.chillT -= step;
      if (e.brittleT > 0) e.brittleT -= step;
      if (e.plasmaMark > 0) e.plasmaMark -= step;
      if (e.ccDR > 0) e.ccDR = Math.max(0, e.ccDR - BALANCE.ccDrDecay * step);
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

      // Always keep forward progress — stun/freeze softens to moveFloor, never 0.
      const floor = moveFloorFor(e);
      let moveMul = Math.max(floor, e.slow == null ? 1 : e.slow);
      if (e.stunT > 0) moveMul = floor;
      else if (e.freezeT > 0) moveMul = Math.max(floor, Math.min(moveMul, floor + 0.08));
      e.dist += e.speed * moveMul * step;
      if ((e.stunT > 0 || e.freezeT > 0) && Math.random() < step * 3) {
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

    // Hazards (mire / magma pools)
    if (state.hazards && state.hazards.length) {
      for (const h of state.hazards) {
        h.t -= step;
        if (h.t <= 0) continue;
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const q = enemyPos(e);
          if (Math.hypot(q.x - h.x, q.y - h.y) > h.r) continue;
          if (h.kind === "mire") applyMoveSlow(e, h.slow || 0.72, 0.25, { aoe: true, soft: true });
          if (h.kind === "magma") {
            e.hp -= (h.dps || 12) * step;
            e.burn = Math.max(e.burn, 4);
            e.burnT = Math.max(e.burnT, 0.6);
            if (e.hp <= 0) killEnemy(e);
          }
        }
      }
      state.hazards = state.hazards.filter((h) => h.t > 0);
    }

    for (const tower of state.towers) {
      // Level CD is wall-clock so Up All isn't glued shut at 1× or trivial at 5×.
      if (tower.levelCd > 0) tower.levelCd = Math.max(0, tower.levelCd - dt);
      if (tower.recoil > 0) tower.recoil = Math.max(0, tower.recoil - step * 4.5);
      if (tower.acquireT > 0) tower.acquireT = Math.max(0, tower.acquireT - step);

      const track = findTarget(tower, state.enemies);
      const trackId = track ? track.id : null;
      if (trackId != null && tower.lockId !== trackId) {
        tower.lockId = trackId;
        tower.acquireT = BALANCE.acquireDelay * (tower.type === "mortar" ? 1.35 : tower.type === "spire" ? 1.15 : 1);
      }
      if (!track) tower.lockId = null;

      let aligned = false;
      if (track) {
        const tp = enemyPos(track);
        const want = Math.atan2(tp.y - tower.y, tp.x - tower.x);
        const dAim = angleDelta(tower.aim || 0, want);
        const rate = tower.turnRate || (BASE_TOWER[tower.type] && BASE_TOWER[tower.type].turnRate) || 3.5;
        const maxStep = rate * step;
        tower.aim = (tower.aim || 0) + Math.max(-maxStep, Math.min(maxStep, dAim));
        aligned = Math.abs(angleDelta(tower.aim, want)) <= BALANCE.aimAlign;
      }

      tower.cooldown -= step;
      if (tower.cooldown > 0) continue;
      if (track && aligned && (tower.acquireT || 0) <= 0) {
        fireTower(tower, track);
        tower.cooldown = tower.fireRate;
      }
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
              damageEnemy(e, p.damage, p.tower, { color: p.color, aoe: true });
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

  function hash2(i, j) {
    const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function drawField() {
    const w = state.w, h = state.h;
    const seedN = (state.seed || "ember").split("").reduce((a, c) => a + c.charCodeAt(0), 0);

    // Warm basalt plateau with cool moss bowls — readable ground plane.
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#342820");
    sky.addColorStop(0.18, "#261e18");
    sky.addColorStop(0.55, "#1c2018");
    sky.addColorStop(0.82, "#161a14");
    sky.addColorStop(1, "#10140e");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Soft horizon heat wash near spawn belt
    const heat = ctx.createLinearGradient(0, 0, 0, h * 0.28);
    heat.addColorStop(0, "rgba(232,90,42,0.14)");
    heat.addColorStop(0.55, "rgba(180,80,30,0.05)");
    heat.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = heat;
    ctx.fillRect(0, 0, w, h * 0.32);

    // Broad mineral shelves (seeded, motif-stable)
    for (let i = 0; i < 18; i++) {
      const hx = hash2(i + seedN, 3);
      const hy = hash2(i, seedN + 7);
      const sx = hx * w;
      const sy = hy * h;
      const rw = 56 + (i % 6) * 20;
      const rh = 26 + (i % 5) * 14;
      const shelf = ctx.createRadialGradient(sx, sy, 4, sx, sy, rw);
      const cool = (i + seedN) % 3 === 0;
      shelf.addColorStop(0, cool ? "rgba(62,78,58,0.42)" : "rgba(72,56,40,0.48)");
      shelf.addColorStop(0.55, cool ? "rgba(40,52,38,0.18)" : "rgba(48,38,28,0.2)");
      shelf.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = shelf;
      ctx.beginPath();
      ctx.ellipse(sx, sy, rw, rh, hx * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stratified stone bands
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 8; i++) {
      const y = (hash2(i, seedN) * 0.85 + 0.08) * h;
      ctx.strokeStyle = i % 2 ? "#3a3228" : "#2a3428";
      ctx.lineWidth = 6 + (i % 3) * 3;
      ctx.beginPath();
      ctx.moveTo(-10, y);
      for (let x = 0; x <= w + 20; x += 28) {
        const dy = (hash2(x * 0.05 + i, seedN) - 0.5) * 10;
        ctx.lineTo(x, y + dy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Magma vein network (quiet glow, terrain identity)
    for (let i = 0; i < 9; i++) {
      const x0 = hash2(i * 2, seedN) * w;
      const y0 = hash2(seedN, i * 3) * h;
      const x1 = x0 + (hash2(i, 9) - 0.5) * 90;
      const y1 = y0 + 40 + hash2(i, 11) * 50;
      const vein = ctx.createLinearGradient(x0, y0, x1, y1);
      vein.addColorStop(0, "rgba(90,36,18,0)");
      vein.addColorStop(0.4, "rgba(180,64,28,0.35)");
      vein.addColorStop(0.7, "rgba(255,140,50,0.12)");
      vein.addColorStop(1, "rgba(40,16,8,0)");
      ctx.strokeStyle = vein;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2 + 18, (y0 + y1) / 2 - 8, x1, y1);
      ctx.stroke();
    }

    // Rock clusters with lit faces
    for (let i = 0; i < 12; i++) {
      const sx = hash2(i + 20, seedN) * w;
      const sy = hash2(seedN + 4, i + 30) * h;
      const s = 10 + (i % 4) * 3;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(sx + 1, sy + s * 0.55, s * 1.1, s * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      const rock = ctx.createLinearGradient(sx - s, sy - s, sx + s, sy + s);
      rock.addColorStop(0, "#5a5248");
      rock.addColorStop(0.4, "#2e2a24");
      rock.addColorStop(1, "#12100e");
      ctx.fillStyle = rock;
      ctx.beginPath();
      ctx.moveTo(sx - s, sy + s * 0.2);
      ctx.lineTo(sx - s * 0.35, sy - s * 0.85);
      ctx.lineTo(sx + s * 0.25, sy - s);
      ctx.lineTo(sx + s * 0.95, sy - s * 0.15);
      ctx.lineTo(sx + s * 0.7, sy + s * 0.55);
      ctx.lineTo(sx - s * 0.2, sy + s * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,220,170,0.12)";
      ctx.beginPath();
      ctx.moveTo(sx - s * 0.2, sy - s * 0.4);
      ctx.lineTo(sx + s * 0.1, sy - s * 0.9);
      ctx.lineTo(sx + s * 0.35, sy - s * 0.2);
      ctx.closePath();
      ctx.fill();
      if (i % 3 === 0) {
        ctx.fillStyle = "rgba(111,191,138,0.22)";
        ctx.beginPath();
        ctx.ellipse(sx - s * 0.15, sy, s * 0.4, s * 0.18, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Fine grit / mica
    for (let i = 0; i < 90; i++) {
      const sx = hash2(i, seedN + 1) * w;
      const sy = hash2(seedN + 2, i) * h;
      ctx.globalAlpha = 0.18 + hash2(i, 5) * 0.2;
      ctx.fillStyle = i % 6 === 0 ? "#7ec9a0" : i % 4 === 0 ? "#c4a35a" : "#3a342c";
      ctx.fillRect(sx, sy, 1.2 + (i % 3) * 0.6, 1.2 + (i % 2) * 0.5);
    }
    ctx.globalAlpha = 1;

    // Atmospheric depth bands
    const haze = ctx.createLinearGradient(0, h * 0.35, 0, h);
    haze.addColorStop(0, "rgba(0,0,0,0)");
    haze.addColorStop(0.7, "rgba(8,10,8,0.18)");
    haze.addColorStop(1, "rgba(6,8,6,0.35)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);

    // Vignette
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.4, h * 0.1, w * 0.5, h * 0.5, h * 0.82);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.48)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // Ambient ember motes + soft trails
    if (settings.particles !== false && motionAllowed()) {
      const embers = settings.batterySaver ? 6 : 16;
      for (let i = 0; i < embers; i++) {
        const drift = state.time * (8 + i % 5) + i * 17;
        const px = ((i * 73 + drift * 2.2) % (w + 30)) - 15;
        const py = h - ((i * 41 + state.time * (12 + (i % 5))) % (h * 0.92));
        const pulse = 0.12 + 0.1 * Math.sin(state.time * 2.8 + i);
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 5);
        glow.addColorStop(0, i % 3 === 0 ? `rgba(255,200,100,${pulse + 0.15})` : `rgba(232,100,40,${pulse})`);
        glow.addColorStop(1, "rgba(80,20,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = "rgba(255,160,60,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py + 2);
        ctx.lineTo(px - 1.5, py + 10);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function strokePts(pts) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  }
  function laneTangent(pts, i) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { tx: dx / len, ty: dy / len, nx: -dy / len, ny: dx / len };
  }
  function laneWidths(isMain) {
    return {
      outer: isMain ? 46 : 40,
      berm: isMain ? 38 : 34,
      bed: isMain ? 28 : 24,
      lane: isMain ? 18 : 15,
    };
  }
  function nearMerge(x, y, merges, rad) {
    if (!merges || !merges.length) return false;
    for (const m of merges) {
      if (Math.hypot(m.x - x, m.y - y) < rad) return true;
    }
    return false;
  }
  /** Split a lane polyline into runs that skip merge mouths (avoids X-overlap berms). */
  function laneRunsSkippingMerges(pts, merges, rad) {
    const runs = [];
    let run = [];
    for (let i = 0; i < pts.length; i++) {
      if (nearMerge(pts[i].x, pts[i].y, merges, rad)) {
        if (run.length >= 2) runs.push(run);
        run = [];
      } else {
        run.push(pts[i]);
      }
    }
    if (run.length >= 2) runs.push(run);
    return runs;
  }
  function strokeLaneRuns(pts, merges, rad, strokeFn) {
    const gap = merges && merges.length ? rad : 0;
    if (!gap) {
      strokeFn(pts);
      return;
    }
    for (const run of laneRunsSkippingMerges(pts, merges, gap)) strokeFn(run);
  }
  /**
   * Layered road pass so overlapping lanes fuse into continuous asphalt
   * instead of stacking full ribbons (double berms / seams at Y-joins).
   * layer: shadow | berm | shoulder | bed | surface | detail
   */
  function drawLaneLayer(pts, alphaMul, isMain, layer, merges) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.globalAlpha *= alphaMul;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const w = laneWidths(isMain);
    const mergeGap = 34;

    if (layer === "shadow") {
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = w.outer + 6;
      strokeLaneRuns(pts, merges, mergeGap, (run) => { strokePts(run); ctx.stroke(); });
    } else if (layer === "berm") {
      ctx.strokeStyle = "#4a3c2e";
      ctx.lineWidth = w.outer;
      strokeLaneRuns(pts, merges, mergeGap, (run) => { strokePts(run); ctx.stroke(); });
    } else if (layer === "shoulder") {
      ctx.strokeStyle = "#2a2218";
      ctx.lineWidth = w.berm;
      strokeLaneRuns(pts, merges, mergeGap, (run) => { strokePts(run); ctx.stroke(); });
    } else if (layer === "bed") {
      const bedGrad = ctx.createLinearGradient(0, 0, 0, state.h);
      bedGrad.addColorStop(0, "#6a5c4a");
      bedGrad.addColorStop(0.4, "#4a3e32");
      bedGrad.addColorStop(1, "#32281e");
      ctx.strokeStyle = bedGrad;
      ctx.lineWidth = w.bed;
      strokeLaneRuns(pts, merges, mergeGap, (run) => { strokePts(run); ctx.stroke(); });
    } else if (layer === "surface") {
      ctx.strokeStyle = isMain ? "#4a4034" : "#42382e";
      ctx.lineWidth = w.lane;
      strokeLaneRuns(pts, merges, mergeGap, (run) => { strokePts(run); ctx.stroke(); });
    } else if (layer === "detail") {
      const mergeRad = 38;
      const step = isMain ? 14 : 16;
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        const seg = Math.hypot(dx, dy);
        acc += seg;
        while (acc >= step) {
          acc -= step;
          const t = 1 - acc / seg;
          const x = pts[i - 1].x + dx * t;
          const y = pts[i - 1].y + dy * t;
          if (nearMerge(x, y, merges, mergeRad)) continue;
          const { nx, ny } = laneTangent(pts, i);
          const side = ((i * 3) % 2 ? 1 : -1) * (3 + (i % 4));
          ctx.globalAlpha = 0.22 * alphaMul;
          ctx.fillStyle = i % 3 ? "#6a5a48" : "#2a2218";
          ctx.beginPath();
          ctx.ellipse(x + nx * side, y + ny * side, 2.4, 1.5, Math.atan2(dy, dx), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = alphaMul;

      // Wear marks skip merge mouths so joins stay one continuous bed
      const wearRuns = laneRunsSkippingMerges(pts, merges, mergeRad - 4);
      for (const wearPts of wearRuns) {
        ctx.strokeStyle = "rgba(18,14,10,0.35)";
        ctx.lineWidth = isMain ? 2.4 : 2;
        ctx.setLineDash([10, 14]);
        strokePts(wearPts); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = isMain ? "rgba(140,56,28,0.4)" : "rgba(110,48,28,0.28)";
        ctx.lineWidth = isMain ? 1.8 : 1.3;
        strokePts(wearPts); ctx.stroke();
        ctx.strokeStyle = isMain ? "rgba(200,120,60,0.12)" : "rgba(180,100,50,0.08)";
        ctx.lineWidth = 0.8;
        strokePts(wearPts); ctx.stroke();
        ctx.strokeStyle = "rgba(220,200,170,0.2)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 9]);
        strokePts(wearPts); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }
  /**
   * Side lanes share the spine after the merge for gameplay — for drawing, trim
   * them at the merge so round caps meet the main ribbon (no double spine / join disk).
   */
  function lanePointsForDraw(pts, laneIndex, merges) {
    if (!pts || pts.length < 2) return pts;
    if (laneIndex === 0 || !merges || !merges.length) return pts;
    for (let i = 0; i < pts.length; i++) {
      if (nearMerge(pts[i].x, pts[i].y, merges, 14)) {
        // Keep a short nib past the mouth so the round cap seats into the spine.
        return pts.slice(0, Math.min(pts.length, i + 2));
      }
    }
    return pts;
  }
  /** Soft fill where a trimmed spur meets the spine — no ring, just asphalt continuity. */
  function drawMergeJunction(m) {
    ctx.save();
    ctx.translate(m.x, m.y);
    const bed = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
    bed.addColorStop(0, "#4a4034");
    bed.addColorStop(0.55, "#42382e");
    bed.addColorStop(1, "rgba(50,40,30,0)");
    ctx.fillStyle = bed;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawSpawnPortal(p, index, total) {
    if (!p) return;
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 3.1 + index * 1.15);
    const hues = ["#ffb34a", "#4db8c4", "#6fbf8a", "#d4b84a"];
    const col = hues[index % hues.length];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1.22, 1.22);

    // Approach apron (intentional gate plaza)
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 18, 34, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    const apron = ctx.createRadialGradient(0, 10, 2, 0, 14, 36);
    apron.addColorStop(0, "#4a3c30");
    apron.addColorStop(0.55, "#2a2218");
    apron.addColorStop(1, "rgba(14,12,10,0)");
    ctx.fillStyle = apron;
    ctx.beginPath();
    ctx.ellipse(0, 14, 32, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Radiating ground cracks toward lane
    ctx.strokeStyle = "rgba(180,60,28,0.4)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.28;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 6 + 6);
      ctx.lineTo(Math.cos(a) * (22 + pulse * 4), Math.sin(a) * 14 + 16);
      ctx.stroke();
    }

    // Stone arch pillars with depth
    const pillar = (ox) => {
      const g = ctx.createLinearGradient(ox - 5, -28, ox + 5, 14);
      g.addColorStop(0, "#6a5a48");
      g.addColorStop(0.45, "#3a3024");
      g.addColorStop(1, "#1a1410");
      ctx.fillStyle = g;
      roundRect(ox - 5, -26, 10, 40, 2); ctx.fill();
      ctx.fillStyle = "rgba(255,220,170,0.14)";
      roundRect(ox - 4, -24, 3, 34, 1); ctx.fill();
      // Cap stone
      ctx.fillStyle = "#4a4034";
      roundRect(ox - 7, -30, 14, 7, 2); ctx.fill();
    };
    pillar(-18);
    pillar(18);

    // Arch lintel + keystone
    const lintel = ctx.createLinearGradient(-22, -32, 22, -20);
    lintel.addColorStop(0, "#3a3024");
    lintel.addColorStop(0.5, "#5a4a38");
    lintel.addColorStop(1, "#2a2218");
    ctx.fillStyle = lintel;
    ctx.beginPath();
    ctx.moveTo(-24, -22);
    ctx.quadraticCurveTo(0, -40 - pulse * 2, 24, -22);
    ctx.lineTo(22, -16);
    ctx.quadraticCurveTo(0, -32, -22, -16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.55 + pulse * 0.35;
    ctx.beginPath();
    ctx.moveTo(0, -34); ctx.lineTo(4, -26); ctx.lineTo(0, -22); ctx.lineTo(-4, -26);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // Inner void
    ctx.fillStyle = "#08060a";
    ctx.beginPath();
    ctx.ellipse(0, -6, 12, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Swirling portal energy
    for (let r = 0; r < 4; r++) {
      ctx.save();
      ctx.rotate(state.time * (1.2 + r * 0.35) * (r % 2 ? 1 : -1));
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.4 + pulse * 0.35 - r * 0.08;
      ctx.lineWidth = 2.6 - r * 0.4;
      ctx.beginPath();
      ctx.ellipse(0, -6, 7 + r * 3.2 + pulse * 1.2, 11 + r * 2.2 + pulse, 0.3, 0, Math.PI * 1.6);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const core = ctx.createRadialGradient(-2, -10, 0.5, 0, -6, 12);
    core.addColorStop(0, "#fff8e0");
    core.addColorStop(0.25, col);
    core.addColorStop(0.7, "rgba(40,20,10,0.5)");
    core.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(0, -6, 9 + pulse * 1.5, 13 + pulse, 0, 0, Math.PI * 2);
    ctx.fill();

    // Color-ring + tiny numeric badge (no "GATE N" lettering)
    if (total > 1) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.28 + pulse * 0.22;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 2, 28 + pulse * 2, 18 + pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // Compact badge on the apron — icon-first, digit only
      ctx.fillStyle = "rgba(10,8,6,0.78)";
      ctx.beginPath();
      ctx.arc(0, 22, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 22, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = "800 11px Bricolage Grotesque, Avenir Next, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), 0, 22.5);
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
  }
  function drawExitRift(p) {
    if (!p) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1.18, 1.18);
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 2.4);

    // Keep plaza
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 36, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 4, 36);
    glow.addColorStop(0, `rgba(232,90,42,${0.4 + pulse * 0.15})`);
    glow.addColorStop(0.45, "rgba(120,40,20,0.28)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(0, 4, 34, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bastion walls
    const wall = ctx.createLinearGradient(-28, -18, 28, 16);
    wall.addColorStop(0, "#3a3028");
    wall.addColorStop(0.5, "#1a1410");
    wall.addColorStop(1, "#4a3a2c");
    ctx.fillStyle = wall;
    ctx.beginPath();
    ctx.moveTo(-26, 10);
    ctx.lineTo(-22, -8);
    ctx.lineTo(-12, -18);
    ctx.lineTo(0, -22);
    ctx.lineTo(12, -18);
    ctx.lineTo(22, -8);
    ctx.lineTo(26, 10);
    ctx.lineTo(16, 14);
    ctx.lineTo(-16, 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,179,74,0.3)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Ember mouth
    const mouth = ctx.createLinearGradient(0, -16, 0, 12);
    mouth.addColorStop(0, "#fff0c0");
    mouth.addColorStop(0.35, "#ffb34a");
    mouth.addColorStop(0.7, "#e85a2a");
    mouth.addColorStop(1, "#2a0808");
    ctx.fillStyle = mouth;
    ctx.beginPath();
    ctx.moveTo(-12, 8);
    ctx.quadraticCurveTo(0, -20 - pulse * 2, 12, 8);
    ctx.closePath();
    ctx.fill();

    // Shield crest — base identity without spelled-out name
    ctx.fillStyle = "rgba(244,236,227,0.85)";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(5, -1);
    ctx.lineTo(3, 6);
    ctx.lineTo(0, 9);
    ctx.lineTo(-3, 6);
    ctx.lineTo(-5, -1);
    ctx.closePath();
    ctx.fill();

    // Ember hearth glow under the bastion (no text banner)
    const hearth = ctx.createRadialGradient(0, 14, 1, 0, 16, 16);
    hearth.addColorStop(0, `rgba(255,179,74,${0.45 + pulse * 0.2})`);
    hearth.addColorStop(0.55, "rgba(232,90,42,0.22)");
    hearth.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hearth;
    ctx.beginPath();
    ctx.ellipse(0, 16, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawRiftPath() {
    if (!state.path) return;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const lanes = (state.path.lanes && state.path.lanes.length) ? state.path.lanes : [state.path];
    const merges = state.path.merges || [];
    // Trimmed draw polylines: main spine full; side spurs stop at merge (round-cap join).
    const drawPts = lanes.map((lane, i) => lanePointsForDraw(lane.points, i, merges));
    // Side spurs first, then main. Trimming (not stroke-gaps) makes the Y join.
    const layers = ["shadow", "berm", "shoulder", "bed", "surface"];
    for (const layer of layers) {
      for (let i = drawPts.length - 1; i >= 0; i--) {
        drawLaneLayer(drawPts[i], i === 0 ? 1 : 0.95, i === 0, layer, null);
      }
    }
    // Soft asphalt blend at mouths (no ring / join disk)
    for (const m of merges) drawMergeJunction(m);
    for (let i = drawPts.length - 1; i >= 0; i--) {
      // Skip wear marks right at the mouth so seams stay quiet
      drawLaneLayer(drawPts[i], i === 0 ? 1 : 0.95, i === 0, "detail", merges);
    }
    // Unbuildable rocks — map constraint.
    if (state.path.obstacles) {
      for (const o of state.path.obstacles) {
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        ctx.ellipse(0, o.r * 0.4, o.r * 1.05, o.r * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        const rock = ctx.createLinearGradient(-o.r, -o.r, o.r, o.r);
        rock.addColorStop(0, "#5a5246");
        rock.addColorStop(0.4, "#2e2a24");
        rock.addColorStop(1, "#12100c");
        ctx.fillStyle = rock;
        ctx.beginPath();
        ctx.moveTo(-o.r * 0.95, o.r * 0.2);
        ctx.lineTo(-o.r * 0.5, -o.r * 0.7);
        ctx.lineTo(o.r * 0.1, -o.r * 1.0);
        ctx.lineTo(o.r * 0.9, -o.r * 0.3);
        ctx.lineTo(o.r * 0.75, o.r * 0.55);
        ctx.lineTo(-o.r * 0.2, o.r * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,220,170,0.14)";
        ctx.beginPath();
        ctx.moveTo(-o.r * 0.2, -o.r * 0.3);
        ctx.lineTo(o.r * 0.05, -o.r * 0.85);
        ctx.lineTo(o.r * 0.3, -o.r * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(111,191,138,0.2)";
        ctx.beginPath();
        ctx.ellipse(-o.r * 0.15, -o.r * 0.05, o.r * 0.38, o.r * 0.16, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    // Pads stay data-only for layout spacing — no dotted slot markers (free placement).
    const spawnPts = state.path.spawns || lanes.map((l) => l.points[0]);
    spawnPts.forEach((p, i) => drawSpawnPortal(p, i, spawnPts.length));
    const exit = state.path.exit || (lanes[0] && lanes[0].points[lanes[0].points.length - 1]);
    drawExitRift(exit);
  }

  function drawGhostPlacement() {
    if (!state.ghost || !state.selectedTower || !state.path) return;
    const { x, y, ok } = state.ghost;
    const stats = towerStats(state.selectedTower);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(x, y, stats.range, 0, Math.PI * 2);
    ctx.strokeStyle = ok ? "rgba(255,179,74,0.65)" : "rgba(232,93,76,0.65)";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // Footprint disk — red when overlapping road/rocks
    ctx.save();
    ctx.fillStyle = ok ? "rgba(255,179,74,0.12)" : "rgba(232,93,76,0.22)";
    ctx.strokeStyle = ok ? "rgba(255,179,74,0.45)" : "rgba(232,93,76,0.85)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, TOWER_PLACE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // Mini tower silhouette instead of flat disk
    ctx.save();
    ctx.globalAlpha = ok ? 0.55 : 0.35;
    ctx.translate(x, y);
    ctx.scale(0.92, 0.92);
    drawTower({
      x: 0, y: 0, type: state.selectedTower, aim: -Math.PI / 2,
      recoil: 0, level: 1, elements: [],
    }, false);
    ctx.restore();
    if (!ok) {
      ctx.save();
      ctx.strokeStyle = "rgba(232,93,76,0.9)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 10);
      ctx.lineTo(x + 10, y + 10);
      ctx.moveTo(x + 10, y - 10);
      ctx.lineTo(x - 10, y + 10);
      ctx.stroke();
      ctx.restore();
    }
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
    const attack = recoil > 0.08;
    ctx.translate(0, idle * 0.25);
    ctx.scale(1.42, 1.42);

    if (selected) {
      ctx.strokeStyle = "rgba(255,179,74,0.95)";
      ctx.lineWidth = 2.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 26 + Math.sin(state.time * 5) * 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,179,74,0.22)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Foundation plinth
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.ellipse(0, 15, 20, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const pad = ctx.createRadialGradient(0, 4, 2, 0, 6, 20);
    pad.addColorStop(0, "#6a5844");
    pad.addColorStop(0.45, "#3a3024");
    pad.addColorStop(0.8, "#1a1410");
    pad.addColorStop(1, "rgba(14,12,10,0)");
    ctx.fillStyle = pad;
    ctx.beginPath();
    ctx.ellipse(0, 10, 18, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(196,163,90,0.28)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 10, 15, 5.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (t.type === "turret") {
      // Chassis + armor skirts
      const body = ctx.createLinearGradient(-14, -12, 14, 14);
      body.addColorStop(0, "#6a4228");
      body.addColorStop(0.4, "#2a1810");
      body.addColorStop(1, "#a85828");
      ctx.fillStyle = body;
      roundRect(-13, -7, 26, 18, 5); ctx.fill();
      ctx.strokeStyle = "rgba(255,179,74,0.35)";
      ctx.lineWidth = 1.2;
      roundRect(-13, -7, 26, 18, 5); ctx.stroke();
      ctx.fillStyle = "#1a1008";
      roundRect(-11, -4, 8, 5, 1.5); ctx.fill();
      roundRect(3, -4, 8, 5, 1.5); ctx.fill();
      ctx.fillStyle = "#c4a35a";
      [[-10, 3], [10, 3], [-10, 9], [10, 9]].forEach(([rx, ry]) => {
        ctx.beginPath(); ctx.arc(rx, ry, 1.6, 0, Math.PI * 2); ctx.fill();
      });
      // Mag hopper (idle bob)
      ctx.fillStyle = "#3a2414";
      roundRect(-4, 2 + idle * 0.3, 8, 6, 1.5); ctx.fill();
      ctx.fillStyle = `rgba(255,179,74,${0.35 + pulse * 0.35})`;
      ctx.fillRect(-2, 4, 4, 2);

      ctx.save();
      ctx.rotate(aim);
      ctx.translate(-recoil * 4, 0);
      const house = ctx.createLinearGradient(0, -9, 0, 9);
      house.addColorStop(0, "#f0b060");
      house.addColorStop(0.45, "#a85828");
      house.addColorStop(1, "#3a1c0c");
      ctx.fillStyle = house;
      roundRect(-9, -8, 16, 16, 3); ctx.fill();
      ctx.strokeStyle = "rgba(26,16,8,0.45)";
      ctx.lineWidth = 1; roundRect(-9, -8, 16, 16, 3); ctx.stroke();
      // Optic
      const lens = ctx.createRadialGradient(-2, -1, 0.5, -2, 0, 4.5);
      lens.addColorStop(0, "#fff8d8");
      lens.addColorStop(0.4, "#ffb34a");
      lens.addColorStop(1, "#4a1808");
      ctx.fillStyle = lens;
      ctx.beginPath(); ctx.arc(-2, 0, 3.6, 0, Math.PI * 2); ctx.fill();
      // Twin barrels + cooling rings
      const barrel = ctx.createLinearGradient(4, -6, 24, 6);
      barrel.addColorStop(0, "#ffc86a");
      barrel.addColorStop(0.5, "#e8883a");
      barrel.addColorStop(1, "#5a2810");
      ctx.fillStyle = barrel;
      roundRect(5, -6.5, 18, 4.2, 1.5); ctx.fill();
      roundRect(5, 2.2, 18, 4.2, 1.5); ctx.fill();
      ctx.strokeStyle = "rgba(26,16,8,0.5)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const bx = 9 + i * 4;
        ctx.beginPath(); ctx.moveTo(bx, -6.5); ctx.lineTo(bx, -2.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, 2.2); ctx.lineTo(bx, 6.4); ctx.stroke();
      }
      ctx.fillStyle = "#1a1008";
      ctx.fillRect(21, -5.5, 3, 2.2);
      ctx.fillRect(21, 3.2, 3, 2.2);
      if (attack) {
        ctx.globalAlpha = Math.min(1, recoil * 1.4);
        ctx.fillStyle = "#ffe08a";
        ctx.beginPath(); ctx.arc(25, -4.4, 2.5 + recoil * 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(25, 4.3, 2.5 + recoil * 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

    } else if (t.type === "mortar") {
      // Tripod legs with joints
      ctx.lineCap = "round";
      [[-13, 15], [13, 15], [0, 17]].forEach(([lx, ly], i) => {
        ctx.strokeStyle = "#2a3828";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(i === 2 ? 0 : (i ? 5 : -5), 5);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.fillStyle = "#6fbf8a";
        ctx.beginPath(); ctx.arc(lx, ly, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#1a2418";
        ctx.beginPath(); ctx.arc(i === 2 ? 0 : (i ? 5 : -5), 5, 2, 0, Math.PI * 2); ctx.fill();
      });
      const plate = ctx.createRadialGradient(-2, 2, 1, 0, 4, 14);
      plate.addColorStop(0, "#6a8a68");
      plate.addColorStop(0.55, "#243424");
      plate.addColorStop(1, "#101810");
      ctx.fillStyle = plate;
      ctx.beginPath(); ctx.arc(0, 4, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(111,191,138,0.5)";
      ctx.lineWidth = 1.6; ctx.stroke();
      // Counterweight
      ctx.fillStyle = "#1a2418";
      ctx.beginPath(); ctx.arc(-8, 6, 3.5, 0, Math.PI * 2); ctx.fill();

      const bob = Math.sin(state.time * 2.2) * 0.05;
      ctx.save();
      ctx.rotate(aim * 0.18 - 0.7 + bob - recoil * 0.25);
      const tube = ctx.createLinearGradient(-7, 0, 7, 0);
      tube.addColorStop(0, "#142014");
      tube.addColorStop(0.35, "#6fbf8a");
      tube.addColorStop(0.55, "#d0f5d8");
      tube.addColorStop(1, "#2a4a30");
      ctx.fillStyle = tube;
      roundRect(-6, -22, 12, 30, 5); ctx.fill();
      ctx.fillStyle = "rgba(26,16,8,0.5)";
      ctx.fillRect(-6, -14, 12, 2.2);
      ctx.fillRect(-6, -4, 12, 2.2);
      ctx.fillRect(-6, 5, 12, 2.2);
      // Shell peek when idle
      if (!attack) {
        ctx.fillStyle = "#c4a35a";
        ctx.beginPath(); ctx.arc(0, -16, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      const muzzle = ctx.createRadialGradient(0, -22, 0, 0, -22, 6);
      muzzle.addColorStop(0, "#060a06");
      muzzle.addColorStop(0.55, "#2a3a28");
      muzzle.addColorStop(1, "#6fbf8a");
      ctx.fillStyle = muzzle;
      ctx.beginPath(); ctx.arc(0, -22, 5.2, 0, Math.PI * 2); ctx.fill();
      if (attack) {
        ctx.globalAlpha = recoil * 0.9;
        ctx.fillStyle = "#c8f8d0";
        ctx.beginPath(); ctx.arc(0, -28, 5 + recoil * 3, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      ctx.fillStyle = "#243024";
      roundRect(-5, 7, 10, 8, 2); ctx.fill();
      ctx.fillStyle = `rgba(111,191,138,${0.4 + pulse * 0.45})`;
      ctx.fillRect(-2.5, 9, 5, 3.5);

    } else if (t.type === "coil") {
      const spin = state.time * 2.6;
      // Insulator stack base
      ctx.fillStyle = "#1a2830";
      roundRect(-8, 4, 16, 10, 3); ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 ? "#4db8c4" : "#2a4850";
        roundRect(-7 + i, 5 + i * 2.5, 14 - i * 2, 2, 1); ctx.fill();
      }
      const chassis = ctx.createLinearGradient(-14, -14, 14, 14);
      chassis.addColorStop(0, "#3a6070");
      chassis.addColorStop(0.5, "#0e1c22");
      chassis.addColorStop(1, "#4db8c4");
      ctx.fillStyle = chassis;
      ctx.beginPath();
      ctx.moveTo(0, -16); ctx.lineTo(15, 0); ctx.lineTo(0, 12); ctx.lineTo(-15, 0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(168,238,245,0.6)";
      ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(9, 0); ctx.lineTo(0, 8); ctx.lineTo(-9, 0);
      ctx.closePath(); ctx.fill();
      for (let i = 0; i < 3; i++) {
        const r = 5.5 + i * 3.4;
        ctx.save();
        ctx.rotate(spin * (i % 2 ? 1 : -1) + i * 0.7);
        ctx.strokeStyle = `rgba(77,184,196,${0.8 - i * 0.18})`;
        ctx.lineWidth = 2 - i * 0.35;
        ctx.beginPath();
        ctx.ellipse(0, -2, r, r * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Idle spark ticks
        if (!attack && i === 0) {
          ctx.fillStyle = `rgba(200,250,255,${0.4 + pulse * 0.4})`;
          ctx.beginPath(); ctx.arc(r, 0, 1.4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      const core = ctx.createRadialGradient(-1, -2, 0, 0, -1, 6);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.35, "#a8eef5");
      core.addColorStop(1, "#1a6080");
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, -1, 4 + pulse * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.rotate(aim);
      ctx.fillStyle = "rgba(168,238,245,0.9)";
      ctx.beginPath();
      ctx.moveTo(9, -3); ctx.lineTo(18 - recoil * 2.5, 0); ctx.lineTo(9, 3);
      ctx.closePath(); ctx.fill();
      if (attack) {
        ctx.globalAlpha = recoil;
        ctx.strokeStyle = "#a8eef5";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(26 + recoil * 10, -3 + Math.sin(state.time * 40) * 2);
        ctx.lineTo(24, 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

    } else if (t.type === "spire") {
      // Buttress base
      ctx.fillStyle = "#2a1c10";
      ctx.beginPath();
      ctx.moveTo(-12, 12); ctx.lineTo(-7, 4); ctx.lineTo(7, 4); ctx.lineTo(12, 12);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#3a2a18";
      roundRect(-8, 5, 16, 9, 2); ctx.fill();
      // Faceted crystal shaft
      const shaft = ctx.createLinearGradient(0, -30, 0, 10);
      shaft.addColorStop(0, "#fff6d8");
      shaft.addColorStop(0.3, "#e8b868");
      shaft.addColorStop(0.7, "#a87038");
      shaft.addColorStop(1, "#3a2410");
      ctx.fillStyle = shaft;
      ctx.beginPath();
      ctx.moveTo(-6, 8); ctx.lineTo(-4.5, -14); ctx.lineTo(0, -30); ctx.lineTo(4.5, -14); ctx.lineTo(6, 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.beginPath();
      ctx.moveTo(-2, 6); ctx.lineTo(-1.5, -12); ctx.lineTo(0, -28); ctx.lineTo(-0.2, 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,230,160,0.4)";
      ctx.lineWidth = 1; ctx.stroke();
      // Idle rune glow
      ctx.strokeStyle = `rgba(255,179,74,${0.25 + pulse * 0.4})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-3, -4); ctx.lineTo(3, -4);
      ctx.moveTo(0, -10); ctx.lineTo(0, 2);
      ctx.stroke();
      ctx.save();
      ctx.rotate(aim);
      ctx.fillStyle = "#1a1008";
      roundRect(2, -3, 16, 6, 2); ctx.fill();
      ctx.fillStyle = "#d4a060";
      ctx.fillRect(14, -1.5, 4, 3);
      if (attack) {
        ctx.globalAlpha = Math.min(1, recoil * 1.5);
        ctx.strokeStyle = "#ffb34a";
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(32 + recoil * 10, 0); ctx.stroke();
        ctx.fillStyle = "#fff0c8";
        ctx.beginPath(); ctx.arc(18, 0, 2 + recoil * 2, 0, Math.PI * 2); ctx.fill();
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
    ctx.scale(1.48, 1.48);
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
      // Swarm mite cluster — distinct carapaces, not soft blobs
      ctx.save();
      const n = 4;
      for (let i = 0; i < n; i++) {
        const a = state.time * 5 + i * (Math.PI * 2 / n) + e.dist * 0.1;
        const rr = e.r * (0.55 + 0.2 * Math.sin(state.time * 3 + i));
        const mx = Math.cos(a) * rr;
        const my = Math.sin(a) * rr * 0.7 + bob;
        ctx.fillStyle = flash ? "#ffffff" : "#1a2a18";
        ctx.beginPath();
        ctx.ellipse(mx, my + 1.2, e.r * 0.42, e.r * 0.28, a, 0, Math.PI * 2);
        ctx.fill();
        const mg = ctx.createLinearGradient(mx - 3, my - 3, mx + 3, my + 3);
        mg.addColorStop(0, flash ? "#ffffff" : "#e8ffe8");
        mg.addColorStop(0.45, flash ? "#ffffff" : e.color);
        mg.addColorStop(1, flash ? "#ffffff" : "#243828");
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.moveTo(mx, my - e.r * 0.45);
        ctx.quadraticCurveTo(mx + e.r * 0.5, my, mx, my + e.r * 0.4);
        ctx.quadraticCurveTo(mx - e.r * 0.5, my, mx, my - e.r * 0.45);
        ctx.fill();
        if (!flash) {
          ctx.fillStyle = "#1a1008";
          ctx.beginPath(); ctx.arc(mx - 1.2, my - 1, 1.1, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#b8f5c8";
          ctx.beginPath(); ctx.arc(mx - 1.2, my - 1, 0.45, 0, Math.PI * 2); ctx.fill();
        }
      }
      const nuc = ctx.createRadialGradient(-1, -1, 0, 0, 0, e.r * 0.7);
      nuc.addColorStop(0, flash ? "#ffffff" : "#f0fff0");
      nuc.addColorStop(0.4, flash ? "#ffffff" : e.color);
      nuc.addColorStop(1, flash ? "#ffffff" : "#1a2a18");
      ctx.fillStyle = nuc;
      ctx.beginPath(); ctx.arc(0, bob * 0.3, e.r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Rim light — reads volume on small mobile silhouettes
    if (!flash) {
      ctx.strokeStyle = "rgba(255,240,210,0.28)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.92, -Math.PI * 0.85, -Math.PI * 0.15);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.95, Math.PI * 0.1, Math.PI * 0.9);
      ctx.stroke();
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
        const sy = y - arc;
        const glow = ctx.createRadialGradient(x, sy, 0, x, sy, 9);
        glow.addColorStop(0, "#fff6d0");
        glow.addColorStop(0.35, p.color);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, sy, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(x, sy, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.beginPath(); ctx.arc(x - 1.2, sy - 1.4, 1.8, 0, Math.PI * 2); ctx.fill();
      } else {
        const ang = Math.atan2(y - p.y, x - p.x);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x, y); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = "#fff8e0";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.cos(ang) * 8 + Math.sin(ang) * 3, y - Math.sin(ang) * 8 - Math.cos(ang) * 3);
        ctx.lineTo(x - Math.cos(ang) * 8 - Math.sin(ang) * 3, y - Math.sin(ang) * 8 + Math.cos(ang) * 3);
        ctx.closePath(); ctx.fill();
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
      ctx.font = "9px Nunito, Avenir Next, sans-serif"; ctx.textAlign = "left";
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
    // Reject when the tower disk would overlap painted road (center clearance = roadHalf + footprint).
    if (distToPathNetwork(state.path, x, y) < pathPlacementClear()) return false;
    if (hitsObstacle(x, y, TOWER_PLACE_R)) return false;
    if (x < 16 || y < 16 || x > state.w - 16 || y > state.h - 16) return false;
    for (const t of state.towers) {
      if (Math.hypot(t.x - x, t.y - y) < TOWER_PLACE_R * 2) return false;
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
      if (!canceled) toast("Invalid — keep off the road & rocks");
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
  window.__RD = {
    state, startNewRun, saveRun, loadRun, generatePath, wavePlan, beginWave, endRun,
    ELEMENTS, settings, sfx, DAILY, BALANCE, DIFFICULTIES,
  };
})();
