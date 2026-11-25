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
  // pathClear = road bed+edge (16) + tower footprint (14) = 30px — fits snugly inside bends and V-junctions off asphalt.
  const ROAD_HALF_W = 16;
  const TOWER_PLACE_R = 14;
  const DIFFICULTIES = {
    normal: {
      id: "normal", name: "Normal", hpMul: 1, speedMul: 1, countMul: 1, intervalMul: 1, rewardMul: 1, chipMul: 1,
      edgeInset: 0.12, travel: 1.0, hairpin: 0.35, padOffset: 38, padClear: 30, pathClear: ROAD_HALF_W + TOWER_PLACE_R,
      motifs: ["s-bend", "dual-merge", "y-merge"], unlock: null,
    },
    hard: {
      id: "hard", name: "Hard", hpMul: 1.85, speedMul: 1.12, countMul: 1.22, intervalMul: 0.86, rewardMul: 1.25, chipMul: 1.45,
      edgeInset: 0.17, travel: 0.74, hairpin: 0.75, padOffset: 35, padClear: 30, pathClear: ROAD_HALF_W + TOWER_PLACE_R,
      motifs: ["hairpin", "y-merge", "triple-funnel"],
      unlock: { kind: "wave", difficulty: "normal", wave: 10 },
    },
    nightmare: {
      id: "nightmare", name: "Nightmare", hpMul: 2.85, speedMul: 1.24, countMul: 1.35, intervalMul: 0.76, rewardMul: 1.35, chipMul: 2.0,
      edgeInset: 0.21, travel: 0.52, hairpin: 1.0, padOffset: 32, padClear: 29, pathClear: ROAD_HALF_W + TOWER_PLACE_R - 1,
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
  // HP curve: learnable early, steeper mid/late, fierce exponential deep climb.
  // Daily applies DAILY.* muls on top of Normal + hard-layout path; hard-stops at waveCap.
  const DAILY = {
    waveCap: 100,
    layout: "hard",
    hpMul: 1.75,
    speedMul: 1.15,
    countMul: 1.26,
    intervalMul: 0.82,
    rewardMul: 0.86,
    scrapWaveMul: 0.8,
    armorBias: 0.12,
    chipMul: 1.4,
    clearBonus: 120,
  };
  const BALANCE = {
    scrapStart: 130,
    scrapWaveBase: 16,
    scrapWavePer: 2.1,
    scrapKillScale: 0.64,
    levelDmgPer: 0.22,
    levelDmgSoft: 0.035, // damp after L6
    levelRangePer: 0.08,
    levelRatePer: 0.04,
    levelCd: 1.25, // wall-clock seconds (not scaled by game speed)
    hpEarly: 0.14, // W1–10: crisp early pressure
    hpMid: 0.34, // W11–22: serious mid-game check
    hpLate: 0.56, // W23–40: dangerous late waves
    hpDeepBase: 1.082, // steeper exponential after wave 40
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
    fire: { id: "fire", name: "Fire", color: "#ee6450", cost: 28, tip: "Burn DoT" },
    water: { id: "water", name: "Water", color: "#50c2cf", cost: 28, tip: "Chill slow" },
    earth: { id: "earth", name: "Earth", color: "#cca95c", cost: 28, tip: "Vs armor + shred" },
    wind: { id: "wind", name: "Wind", color: "#7ed0a2", cost: 28, tip: "Vs air + shove" },
    arc: { id: "arc", name: "Arc", color: "#e0c354", cost: 32, tip: "Shock interrupt (ICD)" },
    frost: { id: "frost", name: "Frost", color: "#92cef0", cost: 32, tip: "Heavy chill slow" },
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

  const TARGET_MODES = ["first", "strong", "close", "weak"];
  const TARGET_LABELS = { first: "First", strong: "Strong", close: "Close", weak: "Weak" };

  const ABILITY_DEF = {
    meteor: { cd: 20, radius: 68, dmgBase: 155, dmgWave: 34, poolDur: 4.5 },
    surge: { cd: 26, dur: 6.2, rateMul: 0.64, critAdd: 0.22 },
    nova: { cd: 22, dur: 2.8, dmgBase: 48, dmgWave: 13 },
  };

  const WAVE_MUTATORS = {
    sky: { id: "sky", label: "Sky Raid", cls: "", desc: "Heavy flying Drone assault" },
    phalanx: { id: "phalanx", label: "Iron Phalanx", cls: "", desc: "Dense armored column" },
    swarm: { id: "swarm", label: "Swarm Rush", cls: "", desc: "Fast packed Swarm flood" },
    hasted: { id: "hasted", label: "Hasted", cls: "", desc: "+18% speed · +15% scrap" },
    carapace: { id: "carapace", label: "Carapace", cls: "", desc: "Mini-shields · +18% scrap" },
    regen: { id: "regen", label: "Regenerating", cls: "boss", desc: "Heals 2.2% HP/s · Chill halves regen" },
    juggernaut: { id: "juggernaut", label: "Unstoppable", cls: "boss", desc: "50% CC resistance · +18% scrap" },
    bounty: { id: "bounty", label: "Bounty Wave", cls: "bounty", desc: "+45% scrap drops!" },
  };

  const BOSS_TIPS = {
    behemoth: "Heavy bulk · Earth & Arc punch armor",
    emberwyrm: "Ashregen · Chill or Frost halts healing",
    shellwarden: "Shield regens · Burst with Earth & Arc",
    broodmother: "Spawns Swarms · Fire & splash clear fast",
    galeheart: "Enrages at 45% HP · Frost & Earth counter",
  };

  const RELICS = [
    { id: "volatile", name: "Volatile Core", tag: "On-Kill", rarity: "epic", glyph: "✦", desc: "Slain foes erupt for 11% max HP splash (35% cap vs bosses)." },
    { id: "combo_amp", name: "Resonant Matrix", tag: "Combos", rarity: "epic", glyph: "◈", desc: "Dual-socket towers deal +24% dmg & +40% combo blasts." },
    { id: "cryo_vuln", name: "Brittle Chill", tag: "Control", rarity: "rare", glyph: "❄", desc: "Slowed or chilled foes take +25% bonus damage." },
    { id: "twin_bolt", name: "Split Chamber", tag: "Turret", rarity: "epic", glyph: "»", desc: "Turrets fire an extra split bolt at 42% damage." },
    { id: "lava_shell", name: "Magma Shells", tag: "Mortar", rarity: "rare", glyph: "●", desc: "Mortar shells leave scorching lava pools on impact." },
    { id: "arc_fork", name: "Tesla Fork", tag: "Coil", rarity: "rare", glyph: "⚡", desc: "Coils chain to +1 extra target (+20% jump dmg)." },
    { id: "sunder_beam", name: "Rift Sunder", tag: "Spire", rarity: "rare", glyph: "┃", desc: "Spire rails shred armor & deal +25% vs bosses." },
    { id: "bounty", name: "Scrap Magnet", tag: "Economy", rarity: "common", glyph: "⬡", desc: "+28% kill scrap and +45% boss bounty." },
    { id: "scrap_vault", name: "Forge Vault", tag: "Economy", rarity: "common", glyph: "❖", desc: "+5% banked scrap interest (+25 cap) & +45 scrap now." },
    { id: "rapid_rite", name: "Rift Conduit", tag: "Powers", rarity: "rare", glyph: "☄", desc: "Meteor, Surge & Nova recharge 35% faster and hit 35% harder." },
    { id: "frostbite_nova", name: "Glacial Core", tag: "Control", rarity: "rare", glyph: "✧", desc: "Cryo Nova deals +85% shatter damage & freezes 40% longer." },
    { id: "chain_catalyst", name: "Rift Catalyst", tag: "Combos", rarity: "epic", glyph: "⟳", desc: "Elemental combo procs shave 0.25s off all power cooldowns." },
    { id: "executioner", name: "Coup de Grace", tag: "Offense", rarity: "common", glyph: "⚔", desc: "Foes under 25% HP take +65% damage." },
    { id: "well_mend", name: "Wellheart Bloom", tag: "Instant", rarity: "common", glyph: "♥", desc: "Restore +5 Wellheart HP and gain +90 scrap right now." },
    { id: "overclock_all", name: "Forge Tempo", tag: "Offense", rarity: "common", glyph: "▲", desc: "All towers gain +15% attack speed and +8% range." },
  ];
  const RELIC_WAVES = [3, 6, 10, 15, 20, 25, 30, 35, 40, 50, 60, 75, 90];

  /* Endless endgame chip sinks (Mastery Altar + Rift Blessings) */
  const MAX_BLESSINGS = 3;
  const MASTERY_INFUSIONS = [
    {
      id: "m_dmg", name: "Molten Core", base: 250, grow: 1.42,
      desc: "+2% all tower damage per rank",
      fmt: (r) => `+${(r * 2).toFixed(0)}% dmg`,
    },
    {
      id: "m_spd", name: "Aether Clockwork", base: 300, grow: 1.44,
      desc: "+1.5% all tower attack speed per rank",
      fmt: (r) => `+${(r * 1.5).toFixed(1)}% speed`,
    },
    {
      id: "m_eco", name: "Gilded Rift", base: 280, grow: 1.42,
      desc: "+15 start scrap & +3 wave scrap per rank",
      fmt: (r) => `+${r * 15} start · +${r * 3}/w`,
    },
    {
      id: "m_hp", name: "Wellheart Bastion", base: 260, grow: 1.45,
      desc: "+2 max Wellheart HP per rank",
      fmt: (r) => `+${r * 2} max HP`,
    },
    {
      id: "m_pwr", name: "Cataclysm Conduit", base: 320, grow: 1.44,
      desc: "+4% power dmg & faster Meteor/Surge/Nova CD",
      fmt: (r) => `+${r * 4}% pwr · −${Math.round((1 - Math.max(0.38, 1 / (1 + r * 0.025))) * 100)}% CD`,
    },
    {
      id: "m_rel", name: "Relic Resonance", base: 400, grow: 1.48,
      desc: "+3% Rare/Epic relic odds & +1 free reroll / 5 ranks",
      fmt: (r) => `+${Math.min(150, r * 3)}% odds · +${Math.min(4, Math.floor(r / 5))} reroll`,
    },
  ];
  let masteryBulkMode = "1";
  function masteryRank(id) {
    return (meta.infusions && meta.infusions[id]) || 0;
  }
  function masteryCostAt(inf, nextRank) {
    return Math.floor(inf.base * Math.pow(inf.grow, Math.max(0, nextRank - 1)));
  }
  function masteryBulkPlan(inf, mode = masteryBulkMode, chips = meta.chips) {
    const startRank = masteryRank(inf.id);
    const maxSteps = mode === "5" ? 5 : mode === "max" ? 500 : 1;
    let count = 0;
    let total = 0;
    for (let i = 0; i < maxSteps; i++) {
      const c = masteryCostAt(inf, startRank + i + 1);
      if (!Number.isFinite(c) || c > 1e15) break;
      if (mode === "max" && total + c > chips) break;
      total += c;
      count += 1;
    }
    if (mode === "max" && count === 0) {
      return { count: 1, total: masteryCostAt(inf, startRank + 1), affordable: false };
    }
    return { count, total, affordable: count > 0 && chips >= total };
  }
  function totalMasteryRanks() {
    if (!meta.infusions) return 0;
    let sum = 0;
    for (const inf of MASTERY_INFUSIONS) sum += (meta.infusions[inf.id] || 0);
    return sum;
  }
  function ascensionLevel() {
    return Math.floor(totalMasteryRanks() / 5);
  }
  function toRoman(num) {
    if (num <= 0) return "";
    const pairs = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let n = Math.min(3999, Math.floor(num)), out = "";
    for (const [v, s] of pairs) { while (n >= v) { out += s; n -= v; } }
    return out;
  }
  function blessingCost(cur = meta.blessings || 0) {
    return Math.floor((500 + ascensionLevel() * 250) * Math.pow(3, cur));
  }
  function anyMasteryAffordable() {
    if ((meta.blessings || 0) < MAX_BLESSINGS && meta.chips >= blessingCost()) return true;
    for (const inf of MASTERY_INFUSIONS) {
      if (meta.chips >= masteryCostAt(inf, masteryRank(inf.id) + 1)) return true;
    }
    return false;
  }

  // Multi-rank hub trees. col/row drive the visual tree; effect stacks per rank.
  // exclusive: only one node in the group may be purchased (real branch choice).
  // path: forge lane tint (offense / economy / defense / elements / utility).
  function upNode(partial) {
    return {
      max: 1, cost: 36, costGrow: 1.58, req: null, reqRank: 1, col: 0, row: 0, icon: "star",
      exclusive: null, path: null, tip: null,
      ...partial,
    };
  }
  const FORGE_PATHS = [
    { id: "offense", label: "Offense" },
    { id: "economy", label: "Economy" },
    { id: "defense", label: "Defense" },
    { id: "elements", label: "Elements" },
    { id: "utility", label: "Utility" },
  ];
  const UPGRADE_TREES = {
    // Global forge — distinct paths with tradeoffs; towers keep their own offense trees.
    forge: [
      // Offense
      upNode({ id: "f_edge", name: "Ember Edge", desc: "+6% all tower damage / rank", icon: "dmg", path: "offense", max: 4, cost: 32, col: 0, row: 0, effect: { globalDmg: 1.06 } }),
      upNode({ id: "f_keen", name: "Keen Ember", desc: "+4% crit chance / rank", icon: "crit", path: "offense", max: 3, cost: 78, req: "f_edge", reqRank: 2, col: 0, row: 1, effect: { globalCritAdd: 0.04 } }),
      upNode({ id: "f_tyrant", name: "Tyrant Brand", desc: "+7% vs bosses / rank", icon: "special", path: "offense", max: 3, cost: 130, req: "f_keen", reqRank: 1, col: 0, row: 2, effect: { globalBoss: 0.07 } }),
      upNode({ id: "f_blood", name: "Bloodrush", desc: "+9% dmg & rate · −10% sell", icon: "special", path: "offense", max: 2, cost: 240, costGrow: 1.65, req: "f_tyrant", reqRank: 1, col: 0, row: 3, exclusive: "f_finisher", effect: { globalDmg: 1.09, globalFireRate: 0.94, sellMul: 0.9 } }),
      upNode({ id: "f_steady", name: "Steady Aim", desc: "+10% all range · −6% rate", icon: "rng", path: "offense", max: 2, cost: 240, costGrow: 1.65, req: "f_tyrant", reqRank: 1, col: 0, row: 4, exclusive: "f_finisher", effect: { globalRange: 1.1, globalFireRate: 1.06 } }),
      upNode({ id: "f_apex", name: "Apex Ember", desc: "+8% damage / rank", icon: "star", path: "offense", max: 2, cost: 480, costGrow: 1.7, req: "f_blood", reqRank: 1, col: 0, row: 5, effect: { globalDmg: 1.08 } }),

      // Economy
      upNode({ id: "f_cache", name: "Starter Cache", desc: "+14 start scrap / rank", icon: "star", path: "economy", max: 4, cost: 28, col: 1, row: 0, effect: { scrapStartAdd: 14 } }),
      upNode({ id: "f_salvage", name: "Salvage Rights", desc: "+9% kill scrap / rank", icon: "special", path: "economy", max: 4, cost: 72, req: "f_cache", reqRank: 2, col: 1, row: 1, effect: { scrapKillMul: 1.09 } }),
      upNode({ id: "f_tithe", name: "Wave Tithe", desc: "+5 wave scrap / rank", icon: "spd", path: "economy", max: 3, cost: 110, req: "f_salvage", reqRank: 1, col: 1, row: 2, effect: { scrapWaveAdd: 5 } }),
      upNode({ id: "f_merchant", name: "Merchant's Cut", desc: "+12% sell value / rank", icon: "star", path: "economy", max: 3, cost: 175, req: "f_tithe", reqRank: 1, col: 1, row: 3, effect: { sellMul: 1.12 } }),
      upNode({ id: "f_vault", name: "Vault Crown", desc: "+22 start scrap · +6% kills", icon: "star", path: "economy", max: 2, cost: 420, costGrow: 1.7, req: "f_merchant", reqRank: 2, col: 1, row: 5, effect: { scrapStartAdd: 22, scrapKillMul: 1.06 } }),

      // Defense
      upNode({ id: "f_heart", name: "Stone Heart", desc: "+1 Wellheart / rank", icon: "earth", path: "defense", max: 3, cost: 36, col: 2, row: 0, effect: { baseHpAdd: 1 } }),
      upNode({ id: "f_soft", name: "Soft Landing", desc: "−1 leak dmg (min 1) / rank", icon: "earth", path: "defense", max: 2, cost: 95, req: "f_heart", reqRank: 1, col: 2, row: 1, effect: { leakReduce: 1 } }),
      upNode({ id: "f_wall", name: "Bastion Wall", desc: "+2 Wellheart / rank", icon: "earth", path: "defense", max: 2, cost: 155, req: "f_soft", reqRank: 1, col: 2, row: 2, effect: { baseHpAdd: 2 } }),
      upNode({ id: "f_gate", name: "Iron Gate", desc: "−1 boss leak / rank", icon: "special", path: "defense", max: 2, cost: 230, req: "f_wall", reqRank: 1, col: 2, row: 3, exclusive: "f_bastion", effect: { bossLeakReduce: 1 } }),
      upNode({ id: "f_rally", name: "Rally Banner", desc: "+2 HP · +8 start scrap", icon: "star", path: "defense", max: 2, cost: 230, req: "f_wall", reqRank: 1, col: 2, row: 4, exclusive: "f_bastion", effect: { baseHpAdd: 2, scrapStartAdd: 8 } }),
      upNode({ id: "f_citadel", name: "Citadel", desc: "+3 Wellheart / rank", icon: "star", path: "defense", max: 1, cost: 460, req: "f_gate", reqRank: 1, col: 2, row: 5, effect: { baseHpAdd: 3 } }),

      // Elements
      upNode({ id: "f_attune", name: "Attune Spark", desc: "−10% socket cost / rank", icon: "burn", path: "elements", max: 3, cost: 30, col: 3, row: 0, effect: { elementCostMul: 0.9 } }),
      upNode({ id: "f_twin", name: "Twin Channel", desc: "−14% 2nd socket / rank", icon: "chain", path: "elements", max: 2, cost: 85, req: "f_attune", reqRank: 2, col: 3, row: 1, effect: { elementSecondMul: 0.86 } }),
      upNode({ id: "f_focus", name: "Element Focus", desc: "+9% dmg when socketed", icon: "burn", path: "elements", max: 3, cost: 125, req: "f_twin", reqRank: 1, col: 3, row: 2, effect: { elementDmgMul: 1.09 } }),
      upNode({ id: "f_rift", name: "Rift Conduct", desc: "Sockets punch resists harder", icon: "special", path: "elements", max: 2, cost: 210, req: "f_focus", reqRank: 1, col: 3, row: 3, exclusive: "f_attune_deep", effect: { resistPierce: 0.12 } }),
      upNode({ id: "f_prism", name: "Prism Bloom", desc: "+12% dual-socket damage", icon: "star", path: "elements", max: 2, cost: 210, req: "f_focus", reqRank: 1, col: 3, row: 4, exclusive: "f_attune_deep", effect: { dualSocketDmg: 1.12 } }),
      upNode({ id: "f_prism_crown", name: "Prism Crown", desc: "+10% socketed dmg / rank", icon: "star", path: "elements", max: 2, cost: 440, costGrow: 1.7, req: "f_rift", reqRank: 1, col: 3, row: 5, effect: { elementDmgMul: 1.1 } }),

      // Utility
      upNode({ id: "f_hands", name: "Quick Hands", desc: "−10% level cooldown / rank", icon: "spd", path: "utility", max: 3, cost: 30, col: 4, row: 0, effect: { levelCdMul: 0.9 } }),
      upNode({ id: "f_bulk", name: "Bulk Order", desc: "−5% tower cost / rank", icon: "special", path: "utility", max: 3, cost: 75, req: "f_hands", reqRank: 1, col: 4, row: 1, effect: { towerCostMul: 0.95 } }),
      upNode({ id: "f_kit", name: "Field Kit", desc: "+8% sell value / rank", icon: "star", path: "utility", max: 2, cost: 115, req: "f_bulk", reqRank: 1, col: 4, row: 2, effect: { sellMul: 1.08 } }),
      upNode({ id: "f_smith", name: "Autosmith", desc: "−14% level CD / rank", icon: "spd", path: "utility", max: 2, cost: 195, req: "f_kit", reqRank: 1, col: 4, row: 3, exclusive: "f_tools", effect: { levelCdMul: 0.86 } }),
      upNode({ id: "f_ledger", name: "Ledger Mark", desc: "−7% tower cost / rank", icon: "special", path: "utility", max: 2, cost: 195, req: "f_kit", reqRank: 1, col: 4, row: 4, exclusive: "f_tools", effect: { towerCostMul: 0.93 } }),
      upNode({ id: "f_logistics", name: "Logistics Crown", desc: "−6% cost & CD / rank", icon: "star", path: "utility", max: 2, cost: 400, costGrow: 1.7, req: "f_smith", reqRank: 1, col: 4, row: 5, effect: { towerCostMul: 0.94, levelCdMul: 0.94 } }),
    ],
    turret: [
      upNode({ id: "t_dmg", name: "Hot Rounds", desc: "+12% damage / rank", icon: "dmg", path: "offense", max: 4, cost: 34, col: 0, row: 0, effect: { damage: 1.12 } }),
      upNode({ id: "t_spd", name: "Servo Drive", desc: "+10% fire rate / rank", icon: "spd", path: "offense", max: 4, cost: 36, col: 1, row: 0, effect: { fireRate: 0.9 } }),
      upNode({ id: "t_rng", name: "Long Barrel", desc: "+9% range / rank", icon: "rng", path: "offense", max: 4, cost: 32, col: 2, row: 0, effect: { range: 1.09 } }),
      upNode({ id: "t_kit", name: "Spare Mag", desc: "−4% tower cost / rank", icon: "special", path: "utility", max: 3, cost: 40, col: 3, row: 0, effect: { towerCostSelf: 0.96 } }),
      upNode({ id: "t_ap", name: "AP Core", desc: "+11% damage / rank", icon: "dmg", path: "offense", max: 3, cost: 78, req: "t_dmg", reqRank: 2, col: 0, row: 1, effect: { damage: 1.11 } }),
      upNode({ id: "t_burst", name: "Burst Mag", desc: "+9% fire rate / rank", icon: "spd", path: "offense", max: 3, cost: 82, req: "t_spd", reqRank: 2, col: 1, row: 1, effect: { fireRate: 0.91 } }),
      upNode({ id: "t_spot", name: "Spotter Link", desc: "+10% range / rank", icon: "rng", path: "offense", max: 3, cost: 74, req: "t_rng", reqRank: 2, col: 2, row: 1, effect: { range: 1.1 } }),
      upNode({ id: "t_scrap", name: "Brass Recycle", desc: "+6% kill scrap near turret", icon: "star", path: "economy", max: 2, cost: 88, req: "t_kit", reqRank: 1, col: 3, row: 1, effect: { killScrapAura: 0.06 } }),
      upNode({ id: "t_crit", name: "Crit Optics", desc: "+6% crit / rank (×2 dmg)", icon: "crit", path: "offense", max: 3, cost: 120, req: "t_ap", reqRank: 1, col: 0, row: 2, effect: { critAdd: 0.06 } }),
      upNode({ id: "t_focus", name: "Focus Latch", desc: "+7% vs bosses / rank", icon: "special", path: "offense", max: 3, cost: 125, req: "t_burst", reqRank: 1, col: 1, row: 2, effect: { bossBonus: 0.07 } }),
      upNode({ id: "t_air", name: "Flak Tips", desc: "+9% vs air / rank", icon: "air", path: "offense", max: 3, cost: 118, req: "t_spot", reqRank: 1, col: 2, row: 2, effect: { airBonusAdd: 0.09 } }),
      upNode({ id: "t_socket", name: "Socket Rail", desc: "−8% element cost on turret", icon: "burn", path: "elements", max: 2, cost: 130, req: "t_scrap", reqRank: 1, col: 3, row: 2, effect: { elementCostSelf: 0.92 } }),
      upNode({ id: "t_glass", name: "Glass Bore", desc: "+16% dmg · −8% range", icon: "dmg", path: "offense", max: 2, cost: 210, costGrow: 1.62, req: "t_crit", reqRank: 2, col: 0, row: 3, exclusive: "t_mid", effect: { damage: 1.16, range: 0.92 } }),
      upNode({ id: "t_tempo", name: "Tempo Latch", desc: "+12% rate · −6% dmg", icon: "spd", path: "offense", max: 2, cost: 210, costGrow: 1.62, req: "t_focus", reqRank: 1, col: 1, row: 3, exclusive: "t_mid", effect: { fireRate: 0.88, damage: 0.94 } }),
      upNode({ id: "t_rail", name: "Rail Sync", desc: "+12% range · +air", icon: "rng", path: "offense", max: 2, cost: 200, req: "t_air", reqRank: 1, col: 2, row: 3, exclusive: "t_mid", effect: { range: 1.12, airBonusAdd: 0.08 } }),
      upNode({ id: "t_over", name: "Overdrive", desc: "+8% dmg & rate / rank", icon: "special", path: "offense", max: 2, cost: 280, costGrow: 1.65, req: "t_glass", reqRank: 1, col: 0, row: 4, effect: { damage: 1.08, fireRate: 0.94 } }),
      upNode({ id: "t_sentinel", name: "Sentinel Kit", desc: "+HP aura soft · +sell", icon: "earth", path: "defense", max: 2, cost: 260, req: "t_socket", reqRank: 1, col: 3, row: 4, effect: { sellSelf: 1.15, leakGuardNear: 1 } }),
      upNode({ id: "t_master", name: "Masterwork", desc: "+10% combat / rank", icon: "star", path: "offense", max: 2, cost: 460, costGrow: 1.72, req: "t_glass", reqRank: 1, col: 1, row: 5, effect: { damage: 1.1, fireRate: 0.95, range: 1.05 } }),
    ],
    mortar: [
      upNode({ id: "m_dmg", name: "HE Shells", desc: "+12% damage / rank", icon: "dmg", path: "offense", max: 4, cost: 36, col: 0, row: 0, effect: { damage: 1.12 } }),
      upNode({ id: "m_splash", name: "Wider Blast", desc: "+12% splash / rank", icon: "splash", path: "offense", max: 4, cost: 38, col: 1, row: 0, effect: { splash: 1.12 } }),
      upNode({ id: "m_rng", name: "Arc Sight", desc: "+8% range / rank", icon: "rng", path: "offense", max: 4, cost: 34, col: 2, row: 0, effect: { range: 1.08 } }),
      upNode({ id: "m_kit", name: "Shell Cache", desc: "+10 start scrap / rank", icon: "star", path: "economy", max: 3, cost: 42, col: 3, row: 0, effect: { scrapStartAdd: 10 } }),
      upNode({ id: "m_he2", name: "Cluster Core", desc: "+10% damage / rank", icon: "dmg", path: "offense", max: 3, cost: 82, req: "m_dmg", reqRank: 2, col: 0, row: 1, effect: { damage: 1.1 } }),
      upNode({ id: "m_cluster", name: "Cluster Cap", desc: "+13% splash / rank", icon: "splash", path: "offense", max: 3, cost: 88, req: "m_splash", reqRank: 2, col: 1, row: 1, effect: { splash: 1.13 } }),
      upNode({ id: "m_loader", name: "Fast Loader", desc: "+9% fire rate / rank", icon: "spd", path: "offense", max: 3, cost: 76, req: "m_rng", reqRank: 1, col: 2, row: 1, effect: { fireRate: 0.91 } }),
      upNode({ id: "m_pay", name: "War Bonds", desc: "+5% kill scrap / rank", icon: "special", path: "economy", max: 2, cost: 90, req: "m_kit", reqRank: 1, col: 3, row: 1, effect: { scrapKillMul: 1.05 } }),
      upNode({ id: "m_burn", name: "Incendiary", desc: "+3 burn / rank", icon: "burn", path: "elements", max: 3, cost: 125, req: "m_he2", reqRank: 1, col: 0, row: 2, effect: { burnAdd: 3 } }),
      upNode({ id: "m_quake", name: "Quake Fuse", desc: "+8% vs armor / rank", icon: "earth", path: "offense", max: 3, cost: 128, req: "m_cluster", reqRank: 1, col: 1, row: 2, effect: { armorBonusAdd: 0.08 } }),
      upNode({ id: "m_sky", name: "Sky Hook", desc: "Unlock air · +5% air / rank", icon: "air", path: "offense", max: 2, cost: 195, req: "m_loader", reqRank: 2, col: 2, row: 2, effect: { hitsAir: true, airBonusAdd: 0.05 } }),
      upNode({ id: "m_attune", name: "Fuse Attune", desc: "−8% socket cost", icon: "burn", path: "elements", max: 2, cost: 135, req: "m_pay", reqRank: 1, col: 3, row: 2, effect: { elementCostSelf: 0.92 } }),
      upNode({ id: "m_napalm", name: "Napalm Nest", desc: "+4 burn · +7% splash", icon: "burn", path: "elements", max: 2, cost: 230, costGrow: 1.62, req: "m_burn", reqRank: 2, col: 0, row: 3, exclusive: "m_mid", effect: { burnAdd: 4, splash: 1.07 } }),
      upNode({ id: "m_siege", name: "Siege Cadence", desc: "+10% dmg & rate", icon: "special", path: "offense", max: 2, cost: 230, costGrow: 1.62, req: "m_quake", reqRank: 1, col: 1, row: 3, exclusive: "m_mid", effect: { damage: 1.1, fireRate: 0.93 } }),
      upNode({ id: "m_carpet", name: "Carpet Arc", desc: "+14% splash · −8% dmg", icon: "splash", path: "offense", max: 2, cost: 220, req: "m_sky", reqRank: 1, col: 2, row: 3, exclusive: "m_mid", effect: { splash: 1.14, damage: 0.92 } }),
      upNode({ id: "m_bunker", name: "Bunker Stock", desc: "+1 HP · +sell", icon: "earth", path: "defense", max: 2, cost: 250, req: "m_attune", reqRank: 1, col: 3, row: 4, effect: { baseHpAdd: 1, sellSelf: 1.12 } }),
      upNode({ id: "m_master", name: "Barrage Crown", desc: "+10% combat / rank", icon: "star", path: "offense", max: 2, cost: 480, costGrow: 1.72, req: "m_napalm", reqRank: 1, col: 1, row: 5, effect: { damage: 1.1, splash: 1.08, range: 1.04 } }),
    ],
    coil: [
      upNode({ id: "c_dmg", name: "Amp Coil", desc: "+13% damage / rank", icon: "dmg", path: "offense", max: 4, cost: 34, col: 0, row: 0, effect: { damage: 1.13 } }),
      upNode({ id: "c_slow", name: "Deep Freeze", desc: "Stronger slow / rank", icon: "slow", path: "offense", max: 4, cost: 38, col: 1, row: 0, effect: { slowStep: 0.05 } }),
      upNode({ id: "c_rng", name: "Field Expand", desc: "+9% range / rank", icon: "rng", path: "offense", max: 4, cost: 34, col: 2, row: 0, effect: { range: 1.09 } }),
      upNode({ id: "c_kit", name: "Coolant Loop", desc: "−8% level CD / rank", icon: "spd", path: "utility", max: 3, cost: 40, col: 3, row: 0, effect: { levelCdSelf: 0.92 } }),
      upNode({ id: "c_amp2", name: "Resonance", desc: "+11% damage / rank", icon: "dmg", path: "offense", max: 3, cost: 80, req: "c_dmg", reqRank: 2, col: 0, row: 1, effect: { damage: 1.11 } }),
      upNode({ id: "c_hold", name: "Cryo Hold", desc: "+15% slow duration / rank", icon: "slow", path: "offense", max: 3, cost: 84, req: "c_slow", reqRank: 2, col: 1, row: 1, effect: { slowDur: 1.15 } }),
      upNode({ id: "c_pulse", name: "Pulse Sync", desc: "+10% fire rate / rank", icon: "spd", path: "offense", max: 3, cost: 76, req: "c_rng", reqRank: 1, col: 2, row: 1, effect: { fireRate: 0.9 } }),
      upNode({ id: "c_scrap", name: "Arc Tax", desc: "+5% kill scrap / rank", icon: "star", path: "economy", max: 2, cost: 88, req: "c_kit", reqRank: 1, col: 3, row: 1, effect: { scrapKillMul: 1.05 } }),
      upNode({ id: "c_chain", name: "Arc Jump", desc: "+1 chain target / rank", icon: "chain", path: "elements", max: 2, cost: 145, req: "c_amp2", reqRank: 1, col: 0, row: 2, effect: { chainAdd: 1 } }),
      upNode({ id: "c_air", name: "Sky Latch", desc: "+10% air bonus / rank", icon: "air", path: "offense", max: 3, cost: 120, req: "c_hold", reqRank: 1, col: 1, row: 2, effect: { airBonusAdd: 0.1 } }),
      upNode({ id: "c_armor", name: "Breach Coil", desc: "Less armor penalty / rank", icon: "earth", path: "offense", max: 3, cost: 125, req: "c_pulse", reqRank: 1, col: 2, row: 2, effect: { armorPenStep: 0.07 } }),
      upNode({ id: "c_attune", name: "Frost Attune", desc: "−8% socket cost", icon: "slow", path: "elements", max: 2, cost: 130, req: "c_scrap", reqRank: 1, col: 3, row: 2, effect: { elementCostSelf: 0.92 } }),
      upNode({ id: "c_storm", name: "Storm Lattice", desc: "+9% dmg · keep chains", icon: "special", path: "offense", max: 2, cost: 225, costGrow: 1.62, req: "c_chain", reqRank: 1, col: 0, row: 3, exclusive: "c_mid", effect: { damage: 1.09, fireRate: 0.95 } }),
      upNode({ id: "c_glare", name: "Glare Field", desc: "+10% range & slow", icon: "slow", path: "offense", max: 2, cost: 225, costGrow: 1.62, req: "c_air", reqRank: 1, col: 1, row: 3, exclusive: "c_mid", effect: { range: 1.1, slowStep: 0.035 } }),
      upNode({ id: "c_breach", name: "Hard Breach", desc: "Armor pen · −6% air", icon: "earth", path: "offense", max: 2, cost: 215, req: "c_armor", reqRank: 1, col: 2, row: 3, exclusive: "c_mid", effect: { armorPenStep: 0.1, airBonusAdd: -0.06 } }),
      upNode({ id: "c_guard", name: "Coil Ward", desc: "+1 HP · +sell", icon: "earth", path: "defense", max: 2, cost: 245, req: "c_attune", reqRank: 1, col: 3, row: 4, effect: { baseHpAdd: 1, sellSelf: 1.12 } }),
      upNode({ id: "c_master", name: "Singularity", desc: "+10% combat / rank", icon: "star", path: "offense", max: 2, cost: 460, costGrow: 1.72, req: "c_storm", reqRank: 1, col: 1, row: 5, effect: { damage: 1.1, range: 1.05, slowDur: 1.08 } }), // sibling unlock via c_mid
    ],
    spire: [
      upNode({ id: "s_dmg", name: "Focus Lens", desc: "+11% damage / rank", icon: "dmg", path: "offense", max: 4, cost: 40, col: 0, row: 0, effect: { damage: 1.11 } }),
      upNode({ id: "s_pierce", name: "Rift Bore", desc: "+1 pierce / rank", icon: "pierce", path: "offense", max: 3, cost: 48, col: 1, row: 0, effect: { pierceAdd: 1 } }),
      upNode({ id: "s_rng", name: "Sky Spire", desc: "+9% range / rank", icon: "rng", path: "offense", max: 4, cost: 38, col: 2, row: 0, effect: { range: 1.09 } }),
      upNode({ id: "s_kit", name: "Lens Polish", desc: "−5% tower cost / rank", icon: "special", path: "utility", max: 3, cost: 44, col: 3, row: 0, effect: { towerCostSelf: 0.95 } }),
      upNode({ id: "s_core", name: "Magma Core", desc: "+10% damage / rank", icon: "dmg", path: "offense", max: 3, cost: 90, req: "s_dmg", reqRank: 2, col: 0, row: 1, effect: { damage: 1.1 } }),
      upNode({ id: "s_shaft", name: "Deep Shaft", desc: "+1 pierce / rank", icon: "pierce", path: "offense", max: 2, cost: 140, req: "s_pierce", reqRank: 1, col: 1, row: 1, effect: { pierceAdd: 1 } }),
      upNode({ id: "s_servo", name: "Gyro Mount", desc: "+9% fire rate / rank", icon: "spd", path: "offense", max: 3, cost: 82, req: "s_rng", reqRank: 1, col: 2, row: 1, effect: { fireRate: 0.91 } }),
      upNode({ id: "s_tithe", name: "Beacon Tithe", desc: "+4 wave scrap / rank", icon: "star", path: "economy", max: 2, cost: 95, req: "s_kit", reqRank: 1, col: 3, row: 1, effect: { scrapWaveAdd: 4 } }),
      upNode({ id: "s_boss", name: "Tyrant Mark", desc: "+9% vs bosses / rank", icon: "special", path: "offense", max: 3, cost: 135, req: "s_core", reqRank: 1, col: 0, row: 2, effect: { bossBonus: 0.09 } }),
      upNode({ id: "s_armor", name: "Sunder Tip", desc: "+9% vs armor / rank", icon: "earth", path: "offense", max: 3, cost: 130, req: "s_shaft", reqRank: 1, col: 1, row: 2, effect: { armorBonusAdd: 0.09 } }),
      upNode({ id: "s_seek", name: "Seeking Beam", desc: "+8% range & rate / rank", icon: "rng", path: "offense", max: 3, cost: 128, req: "s_servo", reqRank: 2, col: 2, row: 2, effect: { range: 1.08, fireRate: 0.94 } }),
      upNode({ id: "s_attune", name: "Rift Attune", desc: "−8% socket cost", icon: "burn", path: "elements", max: 2, cost: 140, req: "s_tithe", reqRank: 1, col: 3, row: 2, effect: { elementCostSelf: 0.92 } }),
      upNode({ id: "s_crit", name: "Eclipse Crit", desc: "+7% crit / rank", icon: "crit", path: "offense", max: 2, cost: 240, costGrow: 1.62, req: "s_boss", reqRank: 1, col: 0, row: 3, exclusive: "s_mid", effect: { critAdd: 0.07 } }),
      upNode({ id: "s_line", name: "Line Storm", desc: "+11% pierce damage", icon: "pierce", path: "offense", max: 2, cost: 240, costGrow: 1.62, req: "s_armor", reqRank: 1, col: 1, row: 3, exclusive: "s_mid", effect: { damage: 1.11 } }),
      upNode({ id: "s_horizon", name: "Horizon Rail", desc: "+14% range · −7% dmg", icon: "rng", path: "offense", max: 2, cost: 230, req: "s_seek", reqRank: 1, col: 2, row: 3, exclusive: "s_mid", effect: { range: 1.14, damage: 0.93 } }),
      upNode({ id: "s_ward", name: "Spire Ward", desc: "+1 HP · +sell", icon: "earth", path: "defense", max: 2, cost: 255, req: "s_attune", reqRank: 1, col: 3, row: 4, effect: { baseHpAdd: 1, sellSelf: 1.12 } }),
      upNode({ id: "s_master", name: "Apex Spire", desc: "+10% combat / rank", icon: "star", path: "offense", max: 2, cost: 520, costGrow: 1.72, req: "s_crit", reqRank: 1, col: 1, row: 5, effect: { damage: 1.1, range: 1.06, fireRate: 0.95 } }), // sibling unlock via s_mid
    ],
  };

  // Capstone wiring: allow either exclusive mid-branch to unlock the crown when req is one sibling.
  function unlockViaExclusiveSibling(u, tree) {
    if (!u.req) return false;
    const reqNode = tree.find((p) => p.id === u.req);
    if (!reqNode || !reqNode.exclusive) return false;
    return tree.some((p) => p.exclusive === reqNode.exclusive && ownedRank(p.id) >= (u.reqRank || 1));
  }

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
    // Rift Conduct: pull resists toward 1 (sockets punch through).
    const pierce = metaBonuses().resistPierce || 0;
    if (pierce > 0 && m < 1) m = 1 - (1 - m) * Math.max(0, 1 - pierce);
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
    { id: "w5", label: "Wave 5", kind: "wave", difficulty: "normal", wave: 5, chips: 8 },
    { id: "w10", label: "Wave 10", kind: "wave", difficulty: "normal", wave: 10, chips: 14 },
    { id: "w20", label: "Wave 20", kind: "wave", difficulty: "normal", wave: 20, chips: 28 },
    { id: "hard", label: "Hard clear 8", kind: "wave", difficulty: "hard", wave: 8, chips: 22 },
    { id: "daily3", label: "3 Dailies", kind: "dailies", count: 3, chips: 16 },
  ];

  const defaultMeta = () => ({
    chips: 0, owned: {}, infusions: {}, blessings: 0,
    unlockedDifficulties: { normal: true }, selectedDifficulty: "normal",
    maxNightmareTier: 1, selectedNmTier: 1, bestByNmTier: {},
    bestByDifficulty: { normal: { wave: 0, score: 0 }, hard: { wave: 0, score: 0 }, nightmare: { wave: 0, score: 0 } },
    milestones: {}, dailiesCompleted: 0, lastDailyKey: null, lastDailyBest: { wave: 0, score: 0 },
  });
  const NM_UNLOCK_WAVE = 20;
  function nmTierProfile(tier = 1) {
    const t = Math.max(1, Math.floor(Number(tier) || 1));
    if (t <= 1) {
      return { tier: 1, hpMul: 1, speedMul: 1, countMul: 1, intervalMul: 1, chipMul: 1, mutChance: 0.56 };
    }
    const n = t - 1;
    return {
      tier: t,
      hpMul: Math.pow(1.65, n),
      speedMul: 1 + Math.min(0.45, n * 0.05),
      countMul: 1 + Math.min(0.55, n * 0.06),
      intervalMul: Math.max(0.62, Math.pow(0.95, n)),
      chipMul: 1 + n * 0.35,
      mutChance: Math.min(0.86, 0.58 + n * 0.06),
    };
  }
  function skillTreeProgress() {
    let owned = 0, total = 0;
    for (const tree of Object.values(UPGRADE_TREES)) {
      const seenExcl = new Set();
      for (const u of tree) {
        if (u.exclusive) {
          if (seenExcl.has(u.exclusive)) continue;
          seenExcl.add(u.exclusive);
          const group = tree.filter((n) => n.exclusive === u.exclusive);
          let groupMax = 0, groupOwned = 0;
          for (const g of group) {
            groupMax = Math.max(groupMax, g.max || 1);
            groupOwned = Math.max(groupOwned, (meta.owned && meta.owned[g.id]) || 0);
          }
          total += groupMax;
          owned += Math.min(groupMax, groupOwned);
        } else {
          const m = u.max || 1;
          total += m;
          owned += Math.min(m, (meta.owned && meta.owned[u.id]) || 0);
        }
      }
    }
    return { owned, total, pct: total > 0 ? Math.round((owned / total) * 100) : 0 };
  }
  function isSkillTreeMaxed() {
    const p = skillTreeProgress();
    return p.total > 0 && p.owned >= p.total;
  }
  function syncNightmareTierUnlock() {
    if (!meta.maxNightmareTier || meta.maxNightmareTier < 1) meta.maxNightmareTier = 1;
    if (!meta.selectedNmTier || meta.selectedNmTier < 1) meta.selectedNmTier = 1;
    if (!meta.bestByNmTier || typeof meta.bestByNmTier !== "object") meta.bestByNmTier = {};
    if (isSkillTreeMaxed()) {
      if (!meta.unlockedDifficulties) meta.unlockedDifficulties = { normal: true };
      meta.unlockedDifficulties.hard = true;
      meta.unlockedDifficulties.nightmare = true;
      if (meta.maxNightmareTier < 2) meta.maxNightmareTier = 2;
    }
    if (meta.selectedNmTier > meta.maxNightmareTier) meta.selectedNmTier = meta.maxNightmareTier;
  }
  const defaultSettings = () => ({
    muted: false, volume: 0.7, music: false, haptics: true,
    gameSpeed: 1, tutorialDone: false, coachStep: 0,
    shake: "low", particles: true, hitFlash: true, screenFlash: true, combatFx: true,
    dmgNumbers: true, batterySaver: false, largeTap: false, autoWave: false,
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
  if (!meta.infusions || typeof meta.infusions !== "object") meta.infusions = {};
  if (typeof meta.blessings !== "number" || meta.blessings < 0) meta.blessings = 0;
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
  if (typeof settings.autoWave !== "boolean") settings.autoWave = false;
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
  const mainCtx = canvas.getContext("2d", { alpha: false });
  let ctx = mainCtx;
  const els = {
    app: $("app"),
    hp: $("hp"), scrap: $("scrap"), wave: $("wave"), score: $("score"),
    banner: $("banner"), toast: $("toast"), streakPill: $("streak-pill"),
    hub: $("screen-hub"), upgrades: $("screen-upgrades"), pause: $("screen-pause"),
    over: $("screen-over"), codex: $("screen-codex"), settings: $("screen-settings"),
    relic: $("screen-relic"),
    bestWave: $("best-wave"), bestScore: $("best-score"), chips: $("chips"), chipsUp: $("chips-up"),
    btnContinue: $("btn-continue"), upgradeList: $("upgrade-list"),
    overTitle: $("over-title"), overSummary: $("over-summary"), overChips: $("over-chips"),
    btnMute: $("btn-mute"), btnPause: $("btn-pause"), btnSpeed: $("btn-speed"),
    speedLabel: $("speed-label"),
    btnSell: $("btn-sell"), btnUpgrade: $("btn-upgrade"), btnAutoLevel: $("btn-auto-level"),
    btnMove: $("btn-move"),
    btnTargetMode: $("btn-target-mode"), btnInspectClose: $("btn-inspect-close"),
    btnNextWave: $("btn-next-wave"), abilityBar: $("ability-bar"),
    btnMeteor: $("btn-ab-meteor"), btnSurge: $("btn-ab-surge"), btnNova: $("btn-ab-nova"),
    meteorFill: $("ab-meteor-fill"), surgeFill: $("ab-surge-fill"), novaFill: $("ab-nova-fill"),
    meteorLabel: $("ab-meteor-label"), surgeLabel: $("ab-surge-label"), novaLabel: $("ab-nova-label"),
    relicStrip: $("relic-strip"), wavePreview: $("wave-preview"),
    bossBar: $("boss-bar"), bossName: $("boss-name"), bossWeak: $("boss-weak"),
    bossTrail: $("boss-trail"), bossFill: $("boss-fill"), bossShield: $("boss-shield"), bossTip: $("boss-tip"),
    btnRelicReroll: $("btn-relic-reroll"), btnRelicSalvage: $("btn-relic-salvage"),
    overStats: $("over-stats"), overMvp: $("over-mvp"), overGoal: $("over-goal"), btnOverForge: $("btn-over-forge"),
    inspect: $("inspect"), inspectText: $("inspect-text"),
    coach: $("coach"), coachText: $("coach-text"),
  };

  /* ---- audio + haptics (mute / volume / reduce-motion aware) ---- */
  let audioCtx = null;
  let masterGain = null;
  let musicNodes = null;
  let noiseBuf = null;
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
  function noiseBurst(dur = 0.14, freq = 600, gain = 0.05) {
    if (settings.muted || settings.volume <= 0.001) return;
    try {
      const ac = ensureAudio();
      if (!noiseBuf) {
        const len = Math.floor(ac.sampleRate * 0.35);
        noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      const filt = ac.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(freq, ac.currentTime);
      filt.frequency.exponentialRampToValueAtTime(120, ac.currentTime + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(Math.max(0.0001, gain), ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      src.connect(filt); filt.connect(g); g.connect(masterGain || ac.destination);
      src.start(); src.stop(ac.currentTime + dur + 0.02);
    } catch { /* ignore */ }
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
    place: () => { toneSlide(420, 740, 0.09, "triangle", 0.055); beep(210, 0.05, "sine", 0.04); haptic(12); },
    upgrade: () => { beep(520, 0.05, "triangle", 0.038); setTimeout(() => toneSlide(760, 1080, 0.1, "triangle", 0.048), 42); haptic([8, 28, 16]); },
    socket: () => { beep(580, 0.06, "sine", 0.04); setTimeout(() => beep(880, 0.07, "triangle", 0.036), 35); haptic(10); },
    shoot: (kind) => {
      if (kind === "mortar") { toneSlide(155, 62, 0.11, "triangle", 0.045); noiseBurst(0.07, 450, 0.03); }
      else if (kind === "coil") { toneSlide(1120, 620, 0.055, "sawtooth", 0.022); }
      else if (kind === "spire") { toneSlide(680, 180, 0.09, "sawtooth", 0.03); noiseBurst(0.05, 1600, 0.02); }
      else { toneSlide(840, 480, 0.032, "triangle", 0.02); }
    },
    hit: () => beep(240 + Math.random() * 80, 0.024, "triangle", 0.016),
    boom: () => { toneSlide(140, 44, 0.18, "sine", 0.065); noiseBurst(0.16, 520, 0.055); },
    meteor: () => { toneSlide(190, 38, 0.34, "sawtooth", 0.075); noiseBurst(0.3, 950, 0.08); haptic([20, 30, 35]); },
    surge: () => { toneSlide(280, 880, 0.24, "triangle", 0.055); setTimeout(() => beep(1040, 0.14, "sine", 0.04), 90); haptic([12, 24, 18]); },
    nova: () => { toneSlide(1320, 290, 0.28, "sine", 0.055); setTimeout(() => noiseBurst(0.18, 2200, 0.045), 30); haptic([14, 22, 18]); },
    bossKill: () => { toneSlide(180, 46, 0.3, "sawtooth", 0.07); noiseBurst(0.24, 700, 0.065); setTimeout(() => beep(660, 0.12, "triangle", 0.05), 110); setTimeout(() => beep(990, 0.18, "triangle", 0.055), 190); haptic([24, 30, 36]); },
    relic: () => { beep(523, 0.08, "triangle", 0.045); setTimeout(() => beep(659, 0.08, "triangle", 0.045), 70); setTimeout(() => beep(784, 0.14, "triangle", 0.05), 140); haptic(14); },
    streak: () => { toneSlide(540, 960, 0.12, "triangle", 0.04); haptic(10); },
    kill: (streak = 0) => { const lift = Math.min(240, streak * 14); toneSlide(400 + lift, 180 + lift * 0.4, 0.075, "triangle", 0.032); haptic(6); },
    leak: () => { toneSlide(145, 70, 0.22, "sawtooth", 0.06); haptic([30, 40, 30]); },
    wave: () => { toneSlide(380, 620, 0.13, "triangle", 0.042); haptic(14); },
    start: () => { toneSlide(330, 560, 0.15, "triangle", 0.048); haptic(18); },
    over: () => { toneSlide(220, 82, 0.32, "sawtooth", 0.05); haptic([40, 60, 40]); },
    buy: () => { beep(640, 0.07, "triangle", 0.045); setTimeout(() => beep(860, 0.06, "sine", 0.03), 45); haptic(10); },
    ui: () => beep(430, 0.028, "triangle", 0.022),
    speed: () => beep(500 + settings.gameSpeed * 110, 0.045, "triangle", 0.03),
    cancel: () => beep(220, 0.04, "triangle", 0.022),
  };

  function ownedRank(id) {
    const v = (meta.owned || {})[id];
    if (v === true) return 1;
    const n = Number(v) || 0;
    return Math.max(0, Math.floor(n));
  }
  function upgradeCostAt(u, nextRank) {
    return Math.floor(u.cost * Math.pow(u.costGrow || 1.58, Math.max(0, nextRank - 1)));
  }
  function findUpgradeNode(id) {
    for (const tree of Object.values(UPGRADE_TREES)) {
      const hit = tree.find((u) => u.id === id);
      if (hit) return hit;
    }
    return null;
  }
  function treeForNode(u) {
    for (const tree of Object.values(UPGRADE_TREES)) {
      if (tree.includes(u) || tree.some((n) => n.id === u.id)) return tree;
    }
    return [];
  }
  function exclusiveBlocked(u, tree) {
    if (!u.exclusive) return false;
    if (ownedRank(u.id) > 0) return false;
    const list = tree || treeForNode(u);
    return list.some((o) => o.exclusive === u.exclusive && o.id !== u.id && ownedRank(o.id) > 0);
  }
  function reqSatisfied(u, tree) {
    if (!u.req) return true;
    if (ownedRank(u.req) >= (u.reqRank || 1)) return true;
    return unlockViaExclusiveSibling(u, tree || treeForNode(u));
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
      if (e.towerCostSelf) base.cost = Math.max(12, Math.floor(base.cost * e.towerCostSelf));
      if (e.sellSelf) base.sell = Math.floor((base.sell || 20) * e.sellSelf);
      if (e.elementCostSelf) base.elementCostMul = (base.elementCostMul || 1) * e.elementCostSelf;
      if (e.levelCdSelf) base.levelCdMul = (base.levelCdMul || 1) * e.levelCdSelf;
      if (e.killScrapAura) base.killScrapAura = (base.killScrapAura || 0) + e.killScrapAura;
      if (e.leakGuardNear) base.leakGuardNear = (base.leakGuardNear || 0) + e.leakGuardNear;
    }
  }
  function emptyMetaBonuses() {
    return {
      scrapStartAdd: 0, scrapKillMul: 1, scrapWaveAdd: 0,
      baseHpAdd: 0, leakReduce: 0, bossLeakReduce: 0,
      elementCostMul: 1, elementSecondMul: 1, elementDmgMul: 1,
      resistPierce: 0, dualSocketDmg: 1,
      sellMul: 1, levelCdMul: 1, towerCostMul: 1,
      globalDmg: 1, globalFireRate: 1, globalRange: 1,
      globalCritAdd: 0, globalBoss: 0,
      masteryPowerDmg: 1, masteryPowerCd: 1,
      masteryRelicOdds: 0, masteryFreeRerolls: 0,
    };
  }
  function applyMetaEffect(b, e, ranks) {
    if (!e || ranks <= 0) return;
    for (let i = 0; i < ranks; i++) {
      if (e.scrapStartAdd) b.scrapStartAdd += e.scrapStartAdd;
      if (e.scrapKillMul) b.scrapKillMul *= e.scrapKillMul;
      if (e.scrapWaveAdd) b.scrapWaveAdd += e.scrapWaveAdd;
      if (e.baseHpAdd) b.baseHpAdd += e.baseHpAdd;
      if (e.leakReduce) b.leakReduce += e.leakReduce;
      if (e.bossLeakReduce) b.bossLeakReduce += e.bossLeakReduce;
      if (e.elementCostMul) b.elementCostMul *= e.elementCostMul;
      if (e.elementSecondMul) b.elementSecondMul *= e.elementSecondMul;
      if (e.elementDmgMul) b.elementDmgMul *= e.elementDmgMul;
      if (e.resistPierce) b.resistPierce += e.resistPierce;
      if (e.dualSocketDmg) b.dualSocketDmg *= e.dualSocketDmg;
      if (e.sellMul) b.sellMul *= e.sellMul;
      if (e.levelCdMul) b.levelCdMul *= e.levelCdMul;
      if (e.towerCostMul) b.towerCostMul *= e.towerCostMul;
      if (e.globalDmg) b.globalDmg *= e.globalDmg;
      if (e.globalFireRate) b.globalFireRate *= e.globalFireRate;
      if (e.globalRange) b.globalRange *= e.globalRange;
      if (e.globalCritAdd) b.globalCritAdd += e.globalCritAdd;
      if (e.globalBoss) b.globalBoss += e.globalBoss;
    }
  }
  let _metaBonusCache = null;
  let _metaBonusKey = "";
  function metaBonuses() {
    const key = JSON.stringify(meta.owned || {}) + "|" + JSON.stringify(meta.infusions || {});
    if (_metaBonusCache && _metaBonusKey === key) return _metaBonusCache;
    const b = emptyMetaBonuses();
    for (const tree of Object.values(UPGRADE_TREES)) {
      for (const u of tree) applyMetaEffect(b, u.effect, ownedRank(u.id));
    }
    // Endless Mastery Infusions (bounded, smooth scaling)
    const rDmg = masteryRank("m_dmg");
    const rSpd = masteryRank("m_spd");
    const rEco = masteryRank("m_eco");
    const rHp = masteryRank("m_hp");
    const rPwr = masteryRank("m_pwr");
    const rRel = masteryRank("m_rel");
    if (rDmg > 0) b.globalDmg *= 1 + rDmg * 0.02;
    if (rSpd > 0) b.globalFireRate /= 1 + rSpd * 0.015;
    if (rEco > 0) { b.scrapStartAdd += rEco * 15; b.scrapWaveAdd += rEco * 3; }
    if (rHp > 0) b.baseHpAdd += rHp * 2;
    if (rPwr > 0) {
      b.masteryPowerDmg = 1 + rPwr * 0.04;
      b.masteryPowerCd = Math.max(0.38, 1 / (1 + rPwr * 0.025));
    }
    if (rRel > 0) {
      b.masteryRelicOdds = Math.min(1.5, rRel * 0.03);
      b.masteryFreeRerolls = Math.min(4, Math.floor(rRel / 5));
    }
    _metaBonusCache = b;
    _metaBonusKey = key;
    return b;
  }
  function invalidateMetaBonuses() { _metaBonusCache = null; _metaBonusKey = ""; }
  function clampTowerRange(type, range) {
    const cap = (BASE_TOWER[type] && BASE_TOWER[type].maxRange) || 200;
    return Math.min(cap, range);
  }
  function relicCount(id) {
    if (!state || !state.relics) return 0;
    let n = 0;
    for (const r of state.relics) if (r === id) n++;
    return n;
  }
  function towerStats(type) {
    const base = { ...BASE_TOWER[type] };
    const tree = UPGRADE_TREES[type] || [];
    for (const u of tree) applyUpgradeEffect(base, u.effect, ownedRank(u.id));
    const mb = metaBonuses();
    base.damage *= mb.globalDmg;
    base.fireRate *= mb.globalFireRate;
    base.range *= mb.globalRange;
    const tempo = relicCount("overclock_all");
    if (tempo > 0) {
      base.fireRate *= Math.pow(0.87, tempo);
      base.range *= Math.pow(1.08, tempo);
    }
    base.cost = Math.max(12, Math.floor(base.cost * mb.towerCostMul));
    // sellMul applied at sell-time so mid-run forge buys still count.
    if (mb.globalCritAdd) base.crit = (base.crit || 0) + mb.globalCritAdd;
    if (mb.globalBoss) base.bossBonus = (base.bossBonus || 0) + mb.globalBoss;
    base.range = clampTowerRange(type, base.range);
    return base;
  }

  function comboKey(elements) {
    return [...elements].sort().join("+");
  }
  const COMBO_DESC = {
    "fire+water": "Geyser (blast + shove back)",
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
  };
  function describeCombo(elements) {
    if (!elements.length) return "No elements";
    if (elements.length === 1) {
      const el = ELEMENTS[elements[0]];
      return el ? `${el.name}: ${el.tip}` : elements[0];
    }
    return COMBO_DESC[comboKey(elements)] || elements.map((id) => (ELEMENTS[id] || {}).name || id).join("+");
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
  function pt(x, y, w, h, m = 28) {
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
    const inset = Math.max(36, w * (0.13 + (1 - travel) * 0.08));
    const reach = (w * 0.5 - inset) * travel;
    // Keep vertical switchback bands generous (>=98px between centerlines) so towers always fit comfortably inside turns.
    const maxFlips = Math.max(1, Math.min(3, Math.floor((toY - fromY) / 98) - 1));
    const safeFlips = Math.max(1, Math.min(flips, maxFlips));
    for (let i = 1; i <= safeFlips; i++) {
      const t = i / (safeFlips + 1);
      const y = fromY + (toY - fromY) * t;
      corners.push(pt(x, y, w, h));
      const center = w * 0.5 + (rng() - 0.5) * w * 0.04 * (1 - travel);
      let tx = goingRight ? center + reach : center - reach;
      tx += (rng() - 0.5) * w * 0.03 * hairpin;
      const pull = 0.34 + hairpin * 0.36;
      const midX = x * pull + tx * (1 - pull) + (rng() - 0.5) * w * 0.04;
      const midY = y + (rng() - 0.5) * (6 + hairpin * 10);
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
    // Safe top & bottom margins so portal arches stay below banner and Wellheart stays above Start Wave button.
    const top = Math.max(66, h * 0.112);
    const exitY = Math.min(h - 68, h * (0.855 - (1 - travel) * 0.015));
    const midBand = h * (0.29 + (1 - travel) * 0.07);
    const funnelY = h * (0.38 + (1 - travel) * 0.08);
    const inset = Math.max(46, w * diff.edgeInset);
    const spawns = [];
    const merges = [];
    const spine = [];

    if (motif === "dual-merge") {
      // Two parallel upper lanes → choke merge → S-run.
      const left = pt(Math.max(44, inset * 0.9), top, w, h, 42);
      const right = pt(Math.min(w - 44, w - inset * 0.9), top, w, h, 42);
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
      const corridor = Math.max(0.62, travel * 0.72);
      const maxFlips = Math.max(1, Math.min(3, Math.floor((exitY - merge.y) / 104) - 1));
      const flips = Math.max(1, Math.min(maxFlips, 2 + Math.floor(hairpin * 1.5)));
      let x = merge.x;
      let y = merge.y;
      let side = rng() > 0.5 ? 1 : -1;
      for (let i = 0; i < flips; i++) {
        y += (exitY - merge.y) / (flips + 1);
        const outer = w * 0.5 + side * (w * 0.5 - inset) * corridor;
        spine.push(pt(outer, y - h * 0.008, w, h));
        spine.push(pt(outer, y + h * 0.008, w, h));
        x = w * 0.5 - side * (w * 0.5 - inset) * corridor * 0.45;
        spine.push(pt(x, y + h * 0.01, w, h));
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
      spine.push(merge);
      const flips = travel > 0.9 ? 5 : travel > 0.7 ? 4 : 3;
      const x = appendZig(spine, w, h, merge.y + h * 0.03, exitY - h * 0.05, merge.x, travel, hairpin * 0.7, rng, flips);
      spine.push(pt(x, exitY, w, h));
    }

    // Keep all spawn portals comfortably inside canvas edges and below top banner.
    for (const s of spawns) {
      s.x = clampMap(s.x, 44, w - 44);
      s.y = clampMap(s.y, 64, h - 72);
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
  function enemyHeading(e) {
    const lane = laneForEnemy(e);
    if (!lane) return Math.PI / 2;
    const p0 = posOnPath(lane, Math.max(0, e.dist - 4));
    const p1 = posOnPath(lane, Math.min(lane.total, e.dist + 6));
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    if (Math.hypot(dx, dy) < 0.01) return Math.PI / 2;
    return Math.atan2(dy, dx);
  }
  function enemyPathTotal(e) {
    const lane = laneForEnemy(e);
    return lane ? lane.total : (state.path ? state.path.total : 0);
  }

  function bossCountForWave(wave, rng, diffId = "normal", nmTier = 1) {
    // Decade waves always bring bosses; harder modes & NM ×N escalate earlier (cap 5).
    if (wave > 0 && wave % 10 === 0) {
      let n = 1 + Math.floor((wave - 10) / 10); // 10→1, 20→2, 30→3…
      if (wave >= 50) n += Math.floor((wave - 50) / 25);
      if (runIsDaily && wave >= 30) n += 1;
      if (diffId === "nightmare" && nmTier >= 2 && wave >= 10) n += 1;
      return Math.min(5, Math.max(1, n));
    }
    // Mid/late: earlier boss pressure on Hard, Nightmare & Nightmare ×N.
    const midStart = diffId === "nightmare" ? (nmTier >= 2 ? 12 : 15) : diffId === "hard" ? 15 : 18;
    const midChance = runIsDaily ? 0.65 : diffId === "nightmare" ? (nmTier >= 2 ? 0.78 : 0.62) : diffId === "hard" ? 0.52 : 0.42;
    if (wave >= midStart && wave % 5 === 0 && rng() < midChance) return 1;
    if (wave >= 25 && wave % 5 === 0 && rng() < Math.min(0.88, midChance + 0.16)) return 1;
    if (wave >= 32 && rng() < (runIsDaily || diffId === "nightmare" ? 0.22 : 0.12)) return 1;
    return 0;
  }

  function wavePlan(seed, wave, diffId, nmTier = (diffId === "nightmare" ? (state.nmTier || 1) : 1)) {
    const diff = DIFFICULTIES[diffId] || DIFFICULTIES.normal;
    const daily = runIsDaily ? DAILY : null;
    const nm = (!daily && diff.id === "nightmare") ? nmTierProfile(nmTier) : nmTierProfile(1);
    const rng = mulberry32(hashSeed(seed + ":wave:" + wave + ":" + diff.id + (nm.tier > 1 ? ":x" + nm.tier : "") + (daily ? ":daily" : "")));
    const early = Math.min(wave, 10);
    const mid = Math.max(0, Math.min(wave, 22) - 10);
    const late = Math.max(0, Math.min(wave, 40) - 22);
    const deep = Math.max(0, wave - 40);
    // Learnable early → steep mid/late → fierce deep exponential (NM ×N scales exponentially per tier).
    const difficulty = (
      1 + early * BALANCE.hpEarly + mid * BALANCE.hpMid + late * BALANCE.hpLate
    ) * Math.pow(BALANCE.hpDeepBase, deep) * diff.hpMul * nm.hpMul * (daily ? daily.hpMul : 1);
    const bossN = bossCountForWave(wave, rng, diff.id, nm.tier);
    const isBoss = bossN > 0;
    const countSlope = wave <= 5 ? BALANCE.countWaveEarly : BALANCE.countWaveLate;
    const count = Math.min(
      BALANCE.countCap,
      Math.floor(
        (6 + Math.floor(wave * countSlope + rng() * 3) + deep * 0.4) *
        diff.countMul * nm.countMul * (daily ? daily.countMul : 1)
      )
    );
    const interval = Math.max(
      0.13,
      (0.9 - wave * 0.026 + (rng() - 0.5) * 0.1) * diff.intervalMul * nm.intervalMul * (daily ? daily.intervalMul : 1)
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
    const armorBias = (diff.id === "nightmare" ? 0.12 + Math.min(0.14, (nm.tier - 1) * 0.03) : diff.id === "hard" ? 0.05 : 0) + (daily ? daily.armorBias : 0);
    // Seeded Wave Mutators from Wave 4+ (Hard/NM unlock Regenerating & Unstoppable earlier!)
    let mutator = null;
    const mutRollChance = diff.id === "nightmare" ? nm.mutChance : diff.id === "hard" ? 0.62 : 0.52;
    if (wave >= 4 && !isBoss && rng() < mutRollChance) {
      const mPool = ["sky", "phalanx", "swarm", "hasted", "carapace", "bounty"];
      if (wave >= 8 || diff.id === "hard" || diff.id === "nightmare") {
        mPool.push("regen", "juggernaut");
        if (nm.tier >= 2) mPool.push("carapace", "regen", "juggernaut");
      }
      mutator = WAVE_MUTATORS[mPool[Math.floor(rng() * mPool.length)]];
    }
    const weights = {
      drone: (mutator && mutator.id === "sky" ? 0.95 : 0.38) + rng() * 0.14,
      crawler: mutator && (mutator.id === "sky" || mutator.id === "swarm") ? 0.12 : 0.26,
      armor: mutator && mutator.id === "phalanx"
        ? 0.92
        : Math.min(0.58, 0.08 + wave * 0.028 + armorBias),
      swarm: mutator && mutator.id === "swarm"
        ? 1.15
        : (wave >= 3 ? 0.24 + rng() * 0.12 : 0),
    };
    const mutCountMul = mutator && mutator.id === "swarm" ? 1.25 : 1;
    let left = Math.max(0, Math.round(count * mutCountMul) - bossN);
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
    const counts = {};
    for (const pack of mix) counts[pack.type] = (counts[pack.type] || 0) + pack.n;
    const mutSpeedMul = mutator && mutator.id === "hasted" ? 1.18 : 1;
    const mutRewardMul = mutator && mutator.id === "bounty" ? 1.45
      : mutator && (mutator.id === "carapace" || mutator.id === "juggernaut") ? 1.18
      : mutator && mutator.id === "hasted" ? 1.15
      : 1;
    const rewardFade = 1 / (1 + deep * BALANCE.rewardDeepFade);
    const layoutId = daily ? daily.layout : diff.id;
    return {
      count, interval, mix, counts, difficulty, isBoss, bossN, mutator,
      speedMul: diff.speedMul * nm.speedMul * (1 + Math.min(0.42, deep * 0.003)) * (daily ? daily.speedMul : 1) * mutSpeedMul,
      rewardMul: diff.rewardMul * rewardFade * BALANCE.scrapKillScale * (daily ? daily.rewardMul : 1) * mutRewardMul,
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
  /** Breathing gap after wave clears (near-instant when Auto-send waves is enabled). */
  function nextWaveDelay() {
    return settings.autoWave ? 0.45 : 4.2;
  }

  function defaultRunStats() {
    return { kills: 0, bosses: 0, combos: 0, peakStreak: 0, flawlessWaves: 0, totalDmg: 0, interestEarned: 0 };
  }

  const state = {
    mode: "hub", seed: null, difficulty: "normal", nmTier: 1, path: null,
    w: 390, h: 620, hp: 20, maxHp: 20, scrap: 130, score: 0, wave: 0,
    selectedTower: null, selectedBuilt: null, movingTower: null,
    towers: [], enemies: [], projectiles: [], fx: [], particles: [], hazards: [],
    spawnQueue: [], spawnTimer: 0, waveInterval: 0.75, betweenWaves: 0, awaitingStart: false, time: 0, frame: 0,
    sendWaveCd: 0, paidWave: 0,
    shake: 0, flash: 0, hitstopT: 0, ghost: null,
    relics: [], relicDraftWave: 0, pendingRelicDraft: false, relicRerolls: 0, relicDraftSalt: 0, blessingDrafts: 0,
    meteorCd: 0, surgeCd: 0, surgeT: 0, novaCd: 0, armedAbility: null,
    streak: 0, streakT: 0, streakTier: 0,
    waveLeaks: 0, flawlessStreak: 0,
    runStats: defaultRunStats(),
    lastRunWasDaily: false,
    terrainDirty: true,
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
    if (fx.kind === "blast" || fx.kind === "ring" || fx.kind === "pop") {
      let circleN = 0;
      for (let i = state.fx.length - 1; i >= 0; i--) {
        const cur = state.fx[i];
        if (cur.kind === "blast" || cur.kind === "ring" || cur.kind === "pop") {
          circleN++;
          if (cur.kind === fx.kind && Math.hypot((cur.x || 0) - (fx.x || 0), (cur.y || 0) - (fx.y || 0)) < 22 && cur.t > 0.14) {
            return;
          }
        }
      }
      if (circleN >= 10) return;
    }
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
    const show = state.mode === "playing" && (!!state.selectedTower || !!state.armedAbility || state.movingTower != null);
    btn.classList.toggle("hidden", !show);
    if (show) {
      btn.textContent = state.movingTower != null ? "Cancel Move" : state.armedAbility ? "Cancel Aim" : "Cancel";
    }
  }
  function syncStartBtn() {
    const btn = $("btn-start-wave");
    if (!btn) return;
    const show = state.mode === "playing" && !!state.awaitingStart && !!state.seed;
    btn.classList.toggle("hidden", !show);
    btn.disabled = !show;
  }
  const MAX_STACKED_SPAWNS = 65;
  function nextPendingRelicWave() {
    for (const w of RELIC_WAVES) {
      if (w <= state.wave && w > (state.relicDraftWave || 0)) return w;
    }
    return 0;
  }
  function payWaveClearEconomy(opts = {}) {
    const w = state.wave;
    if (w <= 0 || (state.paidWave || 0) >= w) return null;
    state.paidWave = w;
    const scrapWaveRaw = Math.floor(
      BALANCE.scrapWaveBase + w * BALANCE.scrapWavePer + metaBonuses().scrapWaveAdd
    );
    const scrapWave = Math.floor(scrapWaveRaw * (runIsDaily ? DAILY.scrapWaveMul : 1));
    // Scrap Interest: +5% banked scrap (cap +28), boosted by Forge Vault relic (+4%, +20 cap each)
    const vaults = relicCount("scrap_vault");
    const intRate = 0.05 + vaults * 0.04;
    const intCap = 28 + vaults * 20;
    const interest = Math.min(intCap, Math.floor(state.scrap * intRate));
    // Flawless Wave Bonus only when wave clears with 0 leaks (heal every 5 flawless on Normal/Hard only).
    let flawlessBonus = 0;
    let healed = false;
    if (!opts.rushed) {
      if ((state.waveLeaks || 0) === 0) {
        state.flawlessStreak = (state.flawlessStreak || 0) + 1;
        if (state.runStats) state.runStats.flawlessWaves = (state.runStats.flawlessWaves || 0) + 1;
        flawlessBonus = Math.max(3, Math.round(scrapWave * 0.12));
        if (state.difficulty !== "nightmare" && state.flawlessStreak % 5 === 0 && state.hp < (state.maxHp || 20)) {
          state.hp += 1;
          healed = true;
        }
      } else {
        state.flawlessStreak = 0;
      }
    }
    state.scrap += scrapWave + interest + flawlessBonus;
    if (state.runStats) state.runStats.interestEarned = (state.runStats.interestEarned || 0) + interest;
    return { scrapWave, interest, flawlessBonus, healed };
  }
  function canCallNextWave() {
    return (
      state.mode === "playing" &&
      !state.awaitingStart &&
      !!state.seed &&
      !(runIsDaily && state.wave >= DAILY.waveCap)
    );
  }
  function earlyWaveBonus() {
    if (!canCallNextWave()) return 0;
    if (state.betweenWaves > 0) {
      return Math.max(4, Math.round(state.betweenWaves * (3.2 + state.wave * 0.4)));
    }
    const active = state.spawnQueue.length + livingEnemyCount();
    return Math.max(6, Math.round((2.8 + Math.min(18, active) * 0.22) * (2.6 + state.wave * 0.36)));
  }
  function syncNextWaveBtn() {
    const btn = els.btnNextWave;
    if (!btn) return;
    const show =
      canCallNextWave() &&
      !state.selectedTower &&
      state.movingTower == null &&
      !state.armedAbility;
    btn.classList.toggle("hidden", !show);
    if (!show) return;
    const nextW = state.wave + 1;
    const plan = wavePlan(state.seed, nextW, state.difficulty);
    const queuedFull = state.spawnQueue.length >= MAX_STACKED_SPAWNS;
    const cooling = (state.sendWaveCd || 0) > 0;
    const isRush = state.betweenWaves <= 0 && (state.spawnQueue.length > 0 || livingEnemyCount() > 0);
    btn.disabled = queuedFull || cooling;
    btn.classList.toggle("is-boss", !!plan.isBoss);
    btn.classList.toggle("is-rush", !plan.isBoss && isRush);
    if (queuedFull) {
      btn.textContent = "Queue Full";
    } else {
      const bonus = earlyWaveBonus();
      const tag = plan.isBoss ? " BOSS" : "";
      btn.textContent = `▶ W${nextW}${tag} +${bonus}`;
    }
    const mutTxt = plan.isBoss ? "BOSS Wave" : (plan.mutator ? `${plan.mutator.label}: ${plan.mutator.desc}` : `Wave ${nextW}`);
    btn.title = `${mutTxt} — send immediately [Space]`;
  }
  function syncWavePreview() {
    const el = els.wavePreview;
    if (!el) return;
    // Prep only: during combat the docked strip holds Abilities + always-available Send Next Wave.
    const show =
      state.mode === "playing" &&
      !!state.seed &&
      !!state.awaitingStart &&
      !state.selectedTower &&
      state.movingTower == null &&
      !state.armedAbility &&
      !(runIsDaily && state.wave >= DAILY.waveCap);
    el.classList.toggle("hidden", !show);
    if (!show) return;
    const nextW = state.wave + 1;
    const plan = wavePlan(state.seed, nextW, state.difficulty);
    const parts = [];
    if (plan.isBoss) {
      const bNames = [...new Set(plan.mix.filter((p) => isBossType(p.type)).map((p) => (ENEMY[p.type] || {}).label || "Boss"))];
      parts.push(`<span class="wp-mut boss">BOSS: ${bNames.join(" + ")}</span>`);
    } else if (plan.mutator) {
      parts.push(`<span class="wp-mut ${plan.mutator.cls || ""}" title="${plan.mutator.desc}">${plan.mutator.label}</span>`);
    } else {
      parts.push(`<span class="wp-item"><strong>W${nextW}</strong></span>`);
    }
    const order = ["drone", "crawler", "armor", "swarm"];
    for (const k of order) {
      const n = (plan.counts && plan.counts[k]) || 0;
      if (!n) continue;
      const def = ENEMY[k];
      parts.push(`<span class="wp-item"><span class="wp-dot" style="background:${def.color}"></span>${def.label} ×${n}</span>`);
    }
    el.innerHTML = parts.join("");
  }
  function syncBossBar() {
    if (!els.bossBar) return;
    if (state.mode !== "playing") {
      els.bossBar.classList.add("hidden");
      if (els.app) els.app.dataset.boss = "0";
      return;
    }
    let boss = null;
    for (const e of state.enemies) {
      if (!e.alive || !isBossEnemy(e)) continue;
      if (!boss || e.dist > boss.dist) boss = e;
    }
    if (!boss) {
      els.bossBar.classList.add("hidden");
      if (els.app) els.app.dataset.boss = "0";
      return;
    }
    els.bossBar.classList.remove("hidden");
    if (els.app) els.app.dataset.boss = "1";
    const hpPct = Math.max(0, Math.min(100, (boss.hp / Math.max(1, boss.maxHp)) * 100));
    const trailPct = Math.max(hpPct, Math.min(100, ((boss.hpTrail != null ? boss.hpTrail : boss.hp) / Math.max(1, boss.maxHp)) * 100));
    const shPct = boss.shieldMax > 0 ? Math.max(0, Math.min(100, (boss.shield / boss.shieldMax) * 100)) : 0;
    const totalBosses = livingBossCount();
    els.bossName.textContent = `${boss.label}${totalBosses > 1 ? ` ×${totalBosses}` : ""}`;
    const r = enemyResist(boss);
    const weaks = Object.entries(r).filter(([, v]) => v >= 1.2).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([k]) => ELEMENTS[k] ? ELEMENTS[k].name : k);
    els.bossWeak.textContent = weaks.length ? weaks.join("·") : "";
    els.bossFill.style.width = `${hpPct.toFixed(1)}%`;
    els.bossTrail.style.width = `${trailPct.toFixed(1)}%`;
    els.bossShield.style.width = `${shPct.toFixed(1)}%`;
    const tip = BOSS_TIPS[boss.type] || "";
    if (els.bossBar) els.bossBar.title = tip;
    if (els.bossTip) els.bossTip.textContent = `${formatCompact(Math.ceil(boss.hp))}`;
  }
  let lastRelicStripSig = "";
  function syncRelicStrip() {
    const el = els.relicStrip;
    if (!el) return;
    const list = state.relics || [];
    const show = state.mode === "playing" && list.length > 0;
    el.classList.toggle("hidden", !show);
    if (!show) return;
    const sig = list.join(",");
    if (sig === lastRelicStripSig) return;
    lastRelicStripSig = sig;
    const counts = {};
    let bestRarity = "common";
    let leadGlyph = "✦";
    for (const id of list) {
      counts[id] = (counts[id] || 0) + 1;
      const def = RELICS.find((r) => r.id === id);
      if (def) {
        if (def.rarity === "epic") { bestRarity = "epic"; leadGlyph = def.glyph; }
        else if (def.rarity === "rare" && bestRarity === "common") { bestRarity = "rare"; leadGlyph = def.glyph; }
        else if (bestRarity === "common") { leadGlyph = def.glyph; }
      }
    }
    const summaryParts = Object.entries(counts).map(([id, n]) => {
      const def = RELICS.find((r) => r.id === id);
      return def ? `${def.name}${n > 1 ? ` ×${n}` : ""}` : id;
    });
    el.innerHTML = "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `relic-chip rarity-${bestRarity}`;
    btn.title = `Active Relics: ${summaryParts.join(" · ")}`;
    btn.innerHTML = `<span>${leadGlyph}</span><span>×${list.length}</span>`;
    btn.addEventListener("click", () => {
      sfx.ui();
      toast(`Relics: ${summaryParts.join(" · ")}`);
    });
    el.appendChild(btn);
  }

  function callNextWaveEarly() {
    if (!canCallNextWave()) return;
    if ((state.sendWaveCd || 0) > 0) return;
    if (state.spawnQueue.length >= MAX_STACKED_SPAWNS) {
      toast("Wave queue full — clear some foes first");
      sfx.cancel();
      return;
    }
    const isMidWave = state.betweenWaves <= 0 && (state.spawnQueue.length > 0 || livingEnemyCount() > 0);
    const bonus = earlyWaveBonus();
    let clearPay = null;
    if (isMidWave) {
      clearPay = payWaveClearEconomy({ rushed: true });
    }
    state.scrap += bonus;
    state.betweenWaves = 0;
    state.sendWaveCd = 0.5;
    sfx.streak();
    if (isMidWave && clearPay) {
      const bits = [`W${state.wave + 1} Rush +${bonus}`];
      if (clearPay.scrapWave > 0) bits.push(`+${clearPay.scrapWave} wave`);
      if (clearPay.interest > 0) bits.push(`+${clearPay.interest} int`);
      toast(bits.join(" · "));
    } else {
      toast(`Early wave! +${bonus} scrap`);
    }
    beginWave({ append: isMidWave });
    updateHUD();
    saveRun();
  }

  function abilityCdMul() {
    return Math.pow(0.65, relicCount("rapid_rite")) * (metaBonuses().masteryPowerCd || 1);
  }
  function abilityDmgMul() {
    return (1 + 0.35 * relicCount("rapid_rite")) * (metaBonuses().masteryPowerDmg || 1);
  }
  function syncAbilitiesUI() {
    if (!els.abilityBar) return;
    const show = state.mode === "playing" && !state.awaitingStart && !!state.seed;
    els.abilityBar.classList.toggle("hidden", !show);
    if (!show) return;
    const mMax = ABILITY_DEF.meteor.cd * abilityCdMul();
    const sMax = ABILITY_DEF.surge.cd * abilityCdMul();
    const nMax = ABILITY_DEF.nova.cd * abilityCdMul();
    if (els.btnMeteor) {
      const ready = state.meteorCd <= 0;
      const armed = state.armedAbility === "meteor";
      els.btnMeteor.classList.toggle("ready", ready && !armed);
      els.btnMeteor.classList.toggle("armed", armed);
      els.btnMeteor.classList.toggle("cooling", !ready);
      els.btnMeteor.disabled = !ready;
      const pct = ready ? 100 : Math.max(0, Math.min(100, (1 - state.meteorCd / mMax) * 100));
      if (els.meteorFill) els.meteorFill.style.width = ready ? "0%" : `${pct.toFixed(0)}%`;
      if (els.meteorLabel) els.meteorLabel.textContent = armed ? "Tap Map" : ready ? "Meteor" : `${Math.ceil(state.meteorCd)}s`;
    }
    if (els.btnSurge) {
      const active = state.surgeT > 0;
      const ready = state.surgeCd <= 0 && !active;
      els.btnSurge.classList.toggle("ready", ready);
      els.btnSurge.classList.toggle("active-buff", active);
      els.btnSurge.classList.toggle("cooling", !ready && !active);
      els.btnSurge.disabled = !ready;
      const pct = ready || active ? 100 : Math.max(0, Math.min(100, (1 - state.surgeCd / sMax) * 100));
      if (els.surgeFill) els.surgeFill.style.width = (ready || active) ? "0%" : `${pct.toFixed(0)}%`;
      if (els.surgeLabel) els.surgeLabel.textContent = active ? `Surge ${Math.ceil(state.surgeT)}s` : ready ? "Surge" : `${Math.ceil(state.surgeCd)}s`;
    }
    if (els.btnNova) {
      const ready = state.novaCd <= 0;
      els.btnNova.classList.toggle("ready", ready);
      els.btnNova.classList.toggle("cooling", !ready);
      els.btnNova.disabled = !ready;
      const pct = ready ? 100 : Math.max(0, Math.min(100, (1 - state.novaCd / nMax) * 100));
      if (els.novaFill) els.novaFill.style.width = ready ? "0%" : `${pct.toFixed(0)}%`;
      if (els.novaLabel) els.novaLabel.textContent = ready ? "Nova" : `${Math.ceil(state.novaCd)}s`;
    }
  }
  function armMeteor() {
    if (state.mode !== "playing" || state.awaitingStart || state.meteorCd > 0) return;
    if (state.armedAbility === "meteor") {
      state.armedAbility = null;
      state.ghost = null;
      sfx.cancel();
    } else {
      state.selectedTower = null;
      state.selectedBuilt = null;
      state.movingTower = null;
      state.armedAbility = "meteor";
      state.ghost = null;
      sfx.ui();
      toast("Tap battlefield to call Meteor");
    }
    updateHUD();
  }
  function fireMeteorAt(x, y) {
    if (state.mode !== "playing" || state.meteorCd > 0) return;
    const rad = ABILITY_DEF.meteor.radius;
    const dmg = (ABILITY_DEF.meteor.dmgBase + state.wave * ABILITY_DEF.meteor.dmgWave) * abilityDmgMul();
    state.meteorCd = ABILITY_DEF.meteor.cd * abilityCdMul();
    state.armedAbility = null;
    state.ghost = null;
    const fakeTower = {
      type: "mortar", x, y, color: "#ff8c42", elements: ["fire", "earth"],
      hitsAir: true, hitsGround: true, bossBonus: 0.15,
    };
    let hits = 0;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const p = enemyPos(e);
      if (Math.hypot(p.x - x, p.y - y) <= rad) {
        damageEnemy(e, dmg, fakeTower, { color: "#ffb854", aoe: true, silentMatch: true });
        applyStun(e, 0.45, { aoe: true });
        hits++;
      }
    }
    pushHazard({ kind: "magma", x, y, r: rad * 0.72, t: ABILITY_DEF.meteor.poolDur, dps: Math.max(16, dmg * 0.16) });
    pushCombatFx({ kind: "blast", x, y, t: 0.48, r: rad, color: "#ff7a32" });
    pushCombatFx({ kind: "ring", x, y, t: 0.52, r0: 10, r1: rad * 1.15, color: "#ffe08a" });
    state.fx.push({ kind: "text", x, y: y - 16, t: 0.78, text: hits ? `METEOR ×${hits}` : "METEOR", color: "#ffd166", scale: 1.25 });
    spawnParticles(x, y, "#ff8c3a", 28, 160);
    spawnParticles(x, y, "#ffe08a", 16, 110);
    state.hitstopT = Math.max(state.hitstopT || 0, 0.038);
    addShake(1.3);
    sfx.meteor();
    updateHUD();
    saveRun();
  }
  function triggerSurge() {
    if (state.mode !== "playing" || state.awaitingStart || state.surgeCd > 0 || state.surgeT > 0) return;
    const durBonus = 1 + 0.2 * relicCount("rapid_rite");
    state.surgeT = ABILITY_DEF.surge.dur * durBonus;
    state.surgeCd = ABILITY_DEF.surge.cd * abilityCdMul();
    for (const t of state.towers) {
      pushCombatFx({ kind: "ring", x: t.x, y: t.y, t: 0.5, r0: 8, r1: 42, color: "#ffd166" });
      spawnParticles(t.x, t.y, "#ffb854", 8, 70);
    }
    const pct = Math.round((1 / Math.max(0.35, ABILITY_DEF.surge.rateMul * Math.pow(0.9, relicCount("rapid_rite"))) - 1) * 100);
    showBanner(`Ember Surge · +${pct}% speed`);
    sfx.surge();
    addShake(0.45);
    updateHUD();
    saveRun();
  }
  function triggerNova() {
    if (state.mode !== "playing" || state.awaitingStart || state.novaCd > 0) return;
    state.novaCd = ABILITY_DEF.nova.cd * abilityCdMul();
    const glacial = relicCount("frostbite_nova");
    const dmg = (ABILITY_DEF.nova.dmgBase + state.wave * ABILITY_DEF.nova.dmgWave) * abilityDmgMul() * (1 + 0.85 * glacial);
    const dur = ABILITY_DEF.nova.dur * (1 + 0.4 * glacial);
    const cx = state.w * 0.5, cy = state.h * 0.5;
    let hits = 0;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const p = enemyPos(e);
      dealDirectDamage(e, dmg, null, { color: "#92cef0", label: null });
      e.shred = Math.min(0.55, (e.shred || 0) + 0.16);
      applyFreezeChill(e, 0.42, dur, 0.85 * (1 + 0.35 * glacial), { aoe: true });
      spawnParticles(p.x, p.y, "#92cef0", 6, 75);
      hits++;
    }
    pushCombatFx({ kind: "ring", x: cx, y: cy, t: 0.55, r0: 14, r1: Math.max(state.w, state.h) * 0.65, color: "#92cef0" });
    pushCombatFx({ kind: "ring", x: cx, y: cy, t: 0.45, r0: 6, r1: Math.max(state.w, state.h) * 0.42, color: "#dff6ff" });
    showBanner(hits ? `Cryo Nova · ${hits} chilled` : "Cryo Nova");
    sfx.nova();
    addShake(0.6);
    updateHUD();
    saveRun();
  }

  function relicSynergyHint(r) {
    const towers = state.towers || [];
    if (!towers.length) return "";
    if (r.id === "twin_bolt") {
      const n = towers.filter((t) => t.type === "turret").length;
      return n ? `Matches ${n} Turret${n > 1 ? "s" : ""}` : "";
    }
    if (r.id === "lava_shell") {
      const n = towers.filter((t) => t.type === "mortar").length;
      return n ? `Matches ${n} Mortar${n > 1 ? "s" : ""}` : "";
    }
    if (r.id === "arc_fork") {
      const n = towers.filter((t) => t.type === "coil").length;
      return n ? `Matches ${n} Coil${n > 1 ? "s" : ""}` : "";
    }
    if (r.id === "sunder_beam") {
      const n = towers.filter((t) => t.type === "spire").length;
      return n ? `Matches ${n} Spire${n > 1 ? "s" : ""}` : "";
    }
    if (r.id === "combo_amp" || r.id === "chain_catalyst") {
      const n = towers.filter((t) => (t.elements || []).length >= 2).length;
      return n ? `Matches ${n} combo tower${n > 1 ? "s" : ""}` : "";
    }
    if (r.id === "cryo_vuln") {
      const n = towers.filter((t) => t.type === "coil" || (t.elements || []).some((el) => el === "water" || el === "frost")).length;
      return n ? `Matches ${n} chill/slow tower${n > 1 ? "s" : ""}` : "";
    }
    if (r.id === "well_mend" && state.hp < (state.maxHp || 20)) {
      return `Heals Wellheart (${state.hp}/${state.maxHp || 20})`;
    }
    return "";
  }
  function relicRerollCost() {
    const freeLimit = 1 + (metaBonuses().masteryFreeRerolls || 0);
    return (state.relicRerolls || 0) < freeLimit ? 0 : 35;
  }
  function openRelicDraft(opts = {}) {
    const wrap = $("relic-choices");
    if (!wrap || !els.relic) return;
    state.pendingRelicDraft = true;
    const isBlessing = (state.blessingDrafts || 0) > 0 && state.awaitingStart;
    const salt = state.relicDraftSalt || 0;
    const rng = mulberry32(hashSeed(`${state.seed}:relic:${state.wave}:${salt}`));
    // Weighted draw by rarity (Common 1.0, Rare 0.85, Epic 0.62 — higher waves & Mastery tilt rarer!)
    const mb = metaBonuses();
    const oddsBoost = mb.masteryRelicOdds || 0;
    const epicBoost = Math.min(0.45, state.wave * 0.015) + oddsBoost * 0.45;
    const rareBoost = oddsBoost * 0.3;
    const pool = RELICS.slice();
    const picks = [];
    while (picks.length < 3 && pool.length) {
      let totalW = 0;
      const weights = pool.map((r) => {
        const w = r.rarity === "epic" ? 0.62 + epicBoost : r.rarity === "rare" ? 0.85 + rareBoost : 1.0;
        totalW += w;
        return w;
      });
      let roll = rng() * totalW;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        roll -= weights[i];
        if (roll <= 0) { idx = i; break; }
      }
      picks.push(pool.splice(idx, 1)[0]);
    }
    const sub = $("relic-subtitle");
    if (sub) {
      sub.textContent = isBlessing
        ? `Rift Blessing (${state.blessingDrafts} left) — draft a starting Relic before Wave 1!`
        : `Wave ${state.wave} cleared — pick 1 Rift Relic for this run.`;
    }
    wrap.innerHTML = "";
    for (const r of picks) {
      const owned = relicCount(r.id);
      const syn = relicSynergyHint(r);
      const card = document.createElement("button");
      card.type = "button";
      card.className = `relic-card rarity-${r.rarity || "common"}`;
      card.innerHTML =
        `<span class="relic-badge" aria-hidden="true">${r.glyph}</span>` +
        `<span class="relic-copy">` +
          `<span class="relic-name"><span>${r.name}${owned ? ` ×${owned + 1}` : ""}</span><span class="relic-tag">${r.tag}</span></span>` +
          `<span class="relic-desc">${r.desc}</span>` +
          (syn ? `<span class="relic-synergy">★ ${syn}</span>` : "") +
        `</span>`;
      card.addEventListener("click", () => applyRelic(r));
      wrap.appendChild(card);
    }
    if (els.btnRelicReroll) {
      const cost = relicRerollCost();
      const freeLeft = Math.max(0, 1 + (mb.masteryFreeRerolls || 0) - (state.relicRerolls || 0));
      els.btnRelicReroll.textContent = cost === 0 ? (freeLeft > 1 ? `Reroll (Free ×${freeLeft})` : "Reroll (Free)") : `Reroll · ${cost}`;
      els.btnRelicReroll.disabled = cost > 0 && state.scrap < cost;
    }
    if (els.btnRelicSalvage) {
      const salvage = 55 + state.wave * 4;
      els.btnRelicSalvage.textContent = `Salvage +${salvage}`;
    }
    state.mode = "relic";
    showScreen("relic");
    saveRun();
    if (!opts.silent) sfx.relic();
  }
  function rerollRelicDraft() {
    if (state.mode !== "relic") return;
    const cost = relicRerollCost();
    if (cost > 0 && state.scrap < cost) { toast(`Need ${cost} scrap`); return; }
    state.scrap -= cost;
    state.relicRerolls = (state.relicRerolls || 0) + 1;
    state.relicDraftSalt = (state.relicDraftSalt || 0) + 1;
    sfx.ui();
    openRelicDraft({ silent: true });
    updateHUD();
  }
  function finishRelicDraft() {
    if ((state.blessingDrafts || 0) > 0 && state.awaitingStart) {
      state.blessingDrafts -= 1;
      if (state.blessingDrafts > 0) {
        state.relicDraftSalt = (state.relicDraftSalt || 0) + 1;
        openRelicDraft({ silent: true });
        updateHUD();
        return;
      }
    }
    state.pendingRelicDraft = false;
    if (!state.awaitingStart && !state.spawnQueue.length && livingEnemyCount() === 0 && state.betweenWaves <= 0) {
      state.betweenWaves = nextWaveDelay();
    }
    state.mode = "playing";
    showScreen(null);
    updateHUD();
    saveRun();
  }
  function salvageRelicDraft() {
    if (state.mode !== "relic") return;
    const salvage = 55 + state.wave * 4;
    state.scrap += salvage;
    finishRelicDraft();
    toast(`Salvaged +${salvage} scrap`);
    sfx.buy();
  }
  function applyRelic(r) {
    if (!state.relics) state.relics = [];
    state.relics.push(r.id);
    if (r.id === "well_mend") {
      state.hp += 5;
      state.maxHp = Math.max(state.maxHp || 20, state.hp);
      state.scrap += 90;
    } else if (r.id === "scrap_vault") {
      state.scrap += 45;
    } else if (r.id === "overclock_all") {
      for (const t of state.towers) applyTowerLevelStats(t);
    }
    finishRelicDraft();
    toast(`Relic: ${r.name}`);
    sfx.buy();
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
    if (!state.selectedTower && !state.ghost && !state.armedAbility && state.movingTower == null) return;
    state.selectedTower = null;
    state.armedAbility = null;
    state.movingTower = null;
    state.ghost = null;
    placePtr = null;
    updateHUD();
    syncPlaceCancel();
    if (!silent) { sfx.cancel(); toast("Canceled"); }
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
    state.terrainDirty = true;
    if (state.seed) {
      state.path = generatePath(state.seed, state.w, state.h, runLayoutDiffId());
      for (const t of state.towers) {
        if (t.nx != null) { t.x = t.nx * state.w; t.y = t.ny * state.h; }
      }
    }
  }

  function serializeRun() {
    return {
      seed: state.seed, difficulty: state.difficulty || "normal", nmTier: state.nmTier || 1,
      isDaily: !!runIsDaily, dailyKey: runDailyKey || null,
      hp: state.hp, maxHp: state.maxHp || state.hp, scrap: state.scrap, score: state.score, wave: state.wave,
      betweenWaves: state.betweenWaves, awaitingStart: !!state.awaitingStart,
      spawnTimer: state.spawnTimer, waveInterval: state.waveInterval || 0.75, spawnQueue: state.spawnQueue,
      enemySeq: state.enemySeq || 0,
      relics: state.relics || [], relicDraftWave: state.relicDraftWave || 0,
      pendingRelicDraft: !!state.pendingRelicDraft,
      relicRerolls: state.relicRerolls || 0, relicDraftSalt: state.relicDraftSalt || 0,
      blessingDrafts: state.blessingDrafts || 0,
      meteorCd: state.meteorCd || 0, surgeCd: state.surgeCd || 0, surgeT: state.surgeT || 0, novaCd: state.novaCd || 0,
      streak: state.streak || 0, streakT: state.streakT || 0, streakTier: state.streakTier || 0,
      waveLeaks: state.waveLeaks || 0, flawlessStreak: state.flawlessStreak || 0, paidWave: state.paidWave || 0,
      runStats: state.runStats || defaultRunStats(),
      hazards: (state.hazards || []).map((h) => ({ ...h })),
      towers: state.towers.map((t) => ({
        type: t.type, nx: t.x / state.w, ny: t.y / state.h,
        level: t.level, cooldown: t.cooldown, levelCd: t.levelCd || 0,
        elements: t.elements || [], targetMode: t.targetMode || "first",
        aim: typeof t.aim === "number" ? t.aim : -Math.PI / 2,
        investedScrap: t.investedScrap || towerStats(t.type).cost,
        totalDmg: t.totalDmg || 0, kills: t.kills || 0, combos: t.combos || 0,
      })),
      enemies: state.enemies.map((e) => ({
        id: e.id, type: e.type, dist: e.dist, hp: e.hp, maxHp: e.maxHp, speed: e.speed, lane: e.lane || 0,
        slow: e.slow, slowT: e.slowT, burn: e.burn, burnT: e.burnT,
        chillT: e.chillT, shred: e.shred, knockCd: e.knockCd || 0,
        stunT: e.stunT || 0, stunCd: e.stunCd || 0, freezeT: e.freezeT || 0, freezeCd: e.freezeCd || 0,
        ccDR: e.ccDR || 0, brittleT: e.brittleT || 0, rimeShield: e.rimeShield || 0, plasmaMark: e.plasmaMark || 0,
        bountyTag: !!e.bountyTag, regenTag: !!e.regenTag, unstoppable: !!e.unstoppable,
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
    const baseCost = towerStats(t.type).cost;
    const tower = {
      type: t.type, x: t.nx * state.w, y: t.ny * state.h, nx: t.nx, ny: t.ny,
      level, cooldown: t.cooldown || 0, levelCd: t.levelCd || 0,
      elements: [...(t.elements || [])],
      targetMode: TARGET_MODES.includes(t.targetMode) ? t.targetMode : "first",
      aim: typeof t.aim === "number" ? t.aim : -Math.PI / 2,
      recoil: 0,
      investedScrap: t.investedScrap || baseCost,
      totalDmg: t.totalDmg || 0,
      kills: t.kills || 0,
      combos: t.combos || 0,
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
      state.nmTier = state.difficulty === "nightmare" ? Math.max(1, data.nmTier || 1) : 1;
      runIsDaily = !!data.isDaily;
      runDailyKey = data.dailyKey || (runIsDaily ? dailyKey() : null);
      meta.selectedDifficulty = state.difficulty;
      state.relics = Array.isArray(data.relics) ? [...data.relics] : [];
      state.relicDraftWave = data.relicDraftWave || 0;
      state.pendingRelicDraft = !!data.pendingRelicDraft;
      state.relicRerolls = data.relicRerolls || 0;
      state.relicDraftSalt = data.relicDraftSalt || 0;
      state.blessingDrafts = data.blessingDrafts || 0;
      state.meteorCd = data.meteorCd || 0;
      state.surgeCd = data.surgeCd || 0;
      state.surgeT = data.surgeT || 0;
      state.novaCd = data.novaCd || 0;
      state.armedAbility = null;
      state.movingTower = null;
      state.streak = data.streak || 0;
      state.streakT = data.streakT || 0;
      state.streakTier = data.streakTier || 0;
      state.waveLeaks = data.waveLeaks || 0;
      state.flawlessStreak = data.flawlessStreak || 0;
      state.paidWave = data.paidWave || 0;
      state.sendWaveCd = 0;
      state.runStats = { ...defaultRunStats(), ...(data.runStats || {}) };
      state.hitstopT = 0;
      lastRelicStripSig = "";
      state.path = generatePath(state.seed, state.w, state.h, runLayoutDiffId());
      state.terrainDirty = true;
      state.hp = data.hp; state.maxHp = data.maxHp || Math.max(20, data.hp || 20);
      state.scrap = data.scrap; state.score = data.score; state.wave = data.wave;
      state.betweenWaves = data.betweenWaves || 0;
      state.awaitingStart = data.awaitingStart != null
        ? !!data.awaitingStart
        : (data.wave === 0 && !(data.spawnQueue && data.spawnQueue.length));
      state.spawnTimer = data.spawnTimer || 0;
      state.waveInterval = data.waveInterval || 0.75;
      state.spawnQueue = data.spawnQueue || [];
      state.towers = (data.towers || []).map(hydrateTower);
      let maxId = data.enemySeq || 0;
      state.enemies = (data.enemies || []).map((e, idx) => {
        const def = ENEMY[e.type] || ENEMY.drone;
        const id = e.id != null ? e.id : (idx + 1);
        if (id > maxId) maxId = id;
        return {
          ...def, id, type: e.type, dist: e.dist, hp: e.hp, maxHp: e.maxHp, hpTrail: e.hp,
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
          stunT: e.stunT || 0, stunCd: e.stunCd || 0, freezeT: e.freezeT || 0, freezeCd: e.freezeCd || 0,
          ccDR: e.ccDR || 0, brittleT: e.brittleT || 0, rimeShield: e.rimeShield || 0, plasmaMark: e.plasmaMark || 0,
          bountyTag: !!e.bountyTag, regenTag: !!e.regenTag, unstoppable: !!e.unstoppable,
          matchFxAt: 0, reward: e.reward, alive: true, hitFlash: 0, lane: e.lane || 0,
        };
      });
      state.enemySeq = maxId;
      state.projectiles = []; state.fx = []; state.particles = [];
      state.hazards = Array.isArray(data.hazards) ? data.hazards.map((h) => ({ ...h })) : [];
      state.selectedBuilt = null; state.selectedTower = null;
      state.mode = "paused";
      syncStartBtn();
      syncPauseDetails();
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
    syncNightmareTierUnlock();
    runIsDaily = !!opts.daily;
    runDailyKey = opts.dailyKey || null;
    state.lastRunWasDaily = runIsDaily;
    if (!runIsDaily) {
      if (!isDifficultyUnlocked(meta.selectedDifficulty)) meta.selectedDifficulty = "normal";
      state.difficulty = meta.selectedDifficulty || "normal";
      state.nmTier = state.difficulty === "nightmare" ? Math.max(1, Math.min(meta.maxNightmareTier || 1, meta.selectedNmTier || 1)) : 1;
      state.seed = newRunSeed();
    } else {
      // Meta tracks as Normal; wavePlan + layout use Daily modifiers / Hard path.
      state.difficulty = "normal";
      state.nmTier = 1;
      state.seed = dailySeedFor(runDailyKey || dailyKey());
    }
    state.relics = [];
    state.relicDraftWave = 0;
    state.pendingRelicDraft = false;
    state.relicRerolls = 0;
    state.relicDraftSalt = 0;
    state.blessingDrafts = 0;
    if (!runIsDaily && (meta.blessings || 0) > 0) {
      state.blessingDrafts = Math.min(MAX_BLESSINGS, meta.blessings);
      meta.blessings = 0;
    }
    state.meteorCd = 0;
    state.surgeCd = 0;
    state.surgeT = 0;
    state.novaCd = 0;
    state.armedAbility = null;
    state.movingTower = null;
    state.streak = 0; state.streakT = 0; state.streakTier = 0;
    state.waveLeaks = 0; state.flawlessStreak = 0; state.paidWave = 0; state.sendWaveCd = 0;
    state.runStats = defaultRunStats();
    state.hitstopT = 0;
    lastRelicStripSig = "";
    state.path = generatePath(state.seed, state.w, state.h, runLayoutDiffId());
    state.terrainDirty = true;
    const diff = currentDiff();
    const mb = metaBonuses();
    const baseHp = runIsDaily ? 18 : diff.id === "nightmare" ? 16 : diff.id === "hard" ? 18 : 20;
    state.hp = baseHp + mb.baseHpAdd;
    state.maxHp = state.hp;
    const scrapMul = runIsDaily ? 0.92
      : diff.id === "nightmare" ? 0.85
      : diff.id === "hard" ? 0.95
      : 1;
    state.scrap = Math.floor(BALANCE.scrapStart * scrapMul + mb.scrapStartAdd);
    state.score = 0; state.wave = 0;
    state.towers = []; state.enemies = []; state.projectiles = []; state.fx = []; state.particles = []; state.hazards = []; state.enemySeq = 0;
    state.spawnQueue = []; state.spawnTimer = 0; state.waveInterval = 0.75; state.betweenWaves = 0;
    state.awaitingStart = true; // Prep: place freely; waves wait for Start.
    state.selectedBuilt = null; state.selectedTower = null; state.ghost = null;
    placePtr = null;
    state.shake = 0; state.flash = 0;
    state.mode = "playing";
    showScreen(null);
    showBanner(runIsDaily ? "Daily Rift · 100 waves" : "Prep · place towers");
    ensureAudio();
    sfx.start();
    syncMusic();
    saveJSON(STORAGE.meta, meta);
    saveRun(); updateHUD();
    syncStartBtn();
    if (state.blessingDrafts > 0) {
      openRelicDraft();
    } else if (!settings.tutorialDone) {
      showCoach(0);
    }
  }
  function continueRun() {
    resize();
    if (!loadRun()) { toast("No saved run"); return; }
    if (state.pendingRelicDraft) {
      openRelicDraft({ silent: true });
      updateHUD();
      return;
    }
    showScreen("pause"); updateHUD();
  }
  function anyForgeUpgradeAffordable() {
    for (const tree of Object.values(UPGRADE_TREES)) {
      if (treeHasAffordable(tree, tree)) return true;
    }
    return anyMasteryAffordable();
  }
  function nextRunGoal(wave, diffId, nmTier = 1) {
    // Prefer difficulty unlock first, then Nightmare ×N ladder, then unclaimed milestones.
    if (!isDifficultyUnlocked("hard")) {
      const cur = Math.max((meta.bestByDifficulty && meta.bestByDifficulty.normal && meta.bestByDifficulty.normal.wave) || 0, diffId === "normal" ? wave : 0);
      return { label: "Unlock Hard Mode", cur: Math.min(10, cur), target: 10, reward: "Hard Mode" };
    }
    if (!isDifficultyUnlocked("nightmare")) {
      const cur = Math.max((meta.bestByDifficulty && meta.bestByDifficulty.hard && meta.bestByDifficulty.hard.wave) || 0, diffId === "hard" ? wave : 0);
      return { label: "Unlock Nightmare", cur: Math.min(12, cur), target: 12, reward: "Nightmare" };
    }
    const maxTier = meta.maxNightmareTier || 1;
    if (maxTier < 2) {
      const prog = skillTreeProgress();
      return { label: "Max Skill Trees → Nightmare ×2", cur: prog.owned, target: prog.total, reward: "NM ×2" };
    }
    if (diffId === "nightmare" && nmTier >= maxTier) {
      const tBest = (meta.bestByNmTier && meta.bestByNmTier[nmTier] && meta.bestByNmTier[nmTier].wave) || 0;
      const cur = Math.min(NM_UNLOCK_WAVE, Math.max(tBest, wave));
      return { label: `Unlock Nightmare ×${nmTier + 1}`, cur, target: NM_UNLOCK_WAVE, reward: `NM ×${nmTier + 1}` };
    }
    const claimed = meta.milestones || {};
    for (const m of MILESTONES) {
      if (claimed[m.id]) continue;
      if (m.kind === "wave") {
        const rec = (meta.bestByDifficulty && meta.bestByDifficulty[m.difficulty]) || { wave: 0 };
        const cur = Math.min(m.wave, m.difficulty === diffId ? Math.max(rec.wave, wave) : rec.wave);
        return { label: m.label, cur, target: m.wave, reward: `+${m.chips}c` };
      }
      if (m.kind === "dailies") {
        return { label: m.label, cur: Math.min(m.count, meta.dailiesCompleted || 0), target: m.count, reward: `+${m.chips}c` };
      }
    }
    const topTier = meta.maxNightmareTier || 2;
    const topBest = (meta.bestByNmTier && meta.bestByNmTier[topTier] && meta.bestByNmTier[topTier].wave) || 0;
    return { label: `Unlock Nightmare ×${topTier + 1}`, cur: Math.min(NM_UNLOCK_WAVE, topBest), target: NM_UNLOCK_WAVE, reward: `NM ×${topTier + 1}` };
  }
  function endRun(abandoned, opts = {}) {
    const wave = state.wave, score = state.score;
    const victory = !!opts.victory && !abandoned;
    const diff = DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal;
    const nmTier = (!runIsDaily && diff.id === "nightmare") ? Math.max(1, state.nmTier || 1) : 1;
    const nmProf = nmTierProfile(nmTier);
    const wasDaily = runIsDaily;
    state.lastRunWasDaily = wasDaily;
    const dailyBonus = wasDaily && !abandoned
      ? (wave >= 8 ? 15 : 0) + (victory ? DAILY.clearBonus : 0)
      : 0;
    const rs = state.runStats || defaultRunStats();
    // Balanced, non-exploding chip payout: waves survived + bosses + flawless + sqrt(score) bonus.
    const waveChips =
      Math.min(wave, 20) * 4.5 +
      Math.max(0, Math.min(wave, 50) - 20) * 7.0 +
      Math.max(0, wave - 50) * 9.5;
    const bossChips = (rs.bosses || 0) * 14;
    const flawlessChips = (rs.flawlessWaves || 0) * 3;
    const scoreChips = Math.floor(Math.sqrt(Math.max(0, score)) * 0.9);
    const abandonMul = abandoned ? 0.5 : 1.0;
    const chipScale = diff.chipMul * nmProf.chipMul * (wasDaily ? DAILY.chipMul : 1);
    const chips = Math.floor((waveChips + bossChips + flawlessChips + scoreChips) * abandonMul * chipScale) + dailyBonus;
    meta.chips += Math.max(0, chips);
    if (!meta.bestByDifficulty[diff.id]) meta.bestByDifficulty[diff.id] = { wave: 0, score: 0 };
    const rec = meta.bestByDifficulty[diff.id];
    if (wave > rec.wave) rec.wave = wave;
    if (score > rec.score) rec.score = score;
    if (!wasDaily && diff.id === "nightmare") {
      if (!meta.bestByNmTier || typeof meta.bestByNmTier !== "object") meta.bestByNmTier = {};
      if (!meta.bestByNmTier[nmTier]) meta.bestByNmTier[nmTier] = { wave: 0, score: 0 };
      if (wave > meta.bestByNmTier[nmTier].wave) meta.bestByNmTier[nmTier].wave = wave;
      if (score > meta.bestByNmTier[nmTier].score) meta.bestByNmTier[nmTier].score = score;
    }
    const newly = [];
    for (const id of Object.keys(DIFFICULTIES)) {
      if (!meta.unlockedDifficulties[id] && isDifficultyUnlocked(id)) {
        meta.unlockedDifficulties[id] = true;
        newly.push(DIFFICULTIES[id].name);
      }
    }
    syncNightmareTierUnlock();
    if (!wasDaily && !abandoned && diff.id === "nightmare" && nmTier >= 2 && wave >= NM_UNLOCK_WAVE && nmTier >= (meta.maxNightmareTier || 1)) {
      meta.maxNightmareTier = nmTier + 1;
      newly.push(`Nightmare ×${meta.maxNightmareTier}`);
    }
    // Only count Daily completion when actually played (not abandoned on Wave 0).
    if (wasDaily && runDailyKey && !abandoned && wave >= 1) {
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
    if (els.bossBar) els.bossBar.classList.add("hidden");
    if (els.relicStrip) els.relicStrip.classList.add("hidden");
    if (els.overTitle) {
      els.overTitle.textContent = victory
        ? "Rift Sealed"
        : abandoned
          ? "Run Abandoned"
          : "Wellheart Breached";
    }
    const diffLabel = wasDaily ? "Rift" : (diff.id === "nightmare" && nmTier > 1 ? `Nightmare ×${nmTier}` : diff.name);
    els.overSummary.textContent =
      `${wasDaily ? "Daily · " : ""}${diffLabel} · Wave ${wave}${wasDaily ? "/" + DAILY.waveCap : ""} · Score ${formatCompact(score)}` +
      (abandoned ? " (abandoned)" : victory ? " · clear" : "");
    els.overChips.textContent =
      `+${formatCompact(Math.max(0, chips))} chips` +
      (dailyBonus ? ` · daily +${dailyBonus}` : "") +
      (newly.length ? ` · ${newly.join(", ")}` : "");

    // Render Run Breakdown Stats Grid
    if (els.overStats) {
      const cells = [
        ["Kills", formatCompact(rs.kills || 0)],
        ["Bosses", String(rs.bosses || 0)],
        ["Combos", formatCompact(rs.combos || 0)],
        ["Peak Streak", `×${rs.peakStreak || 0}`],
        ["Flawless", String(rs.flawlessWaves || 0)],
        ["Total DMG", formatCompact(Math.round(rs.totalDmg || 0))],
      ];
      els.overStats.innerHTML = cells.map(([k, v]) => `<div class="over-stat"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("");
    }
    // Render MVP Tower Spotlight
    if (els.overMvp) {
      let mvp = null;
      for (const t of state.towers) {
        if ((t.totalDmg || 0) > 0 && (!mvp || (t.totalDmg || 0) > (mvp.totalDmg || 0))) mvp = t;
      }
      if (mvp) {
        els.overMvp.classList.remove("hidden");
        const comboTag = (mvp.elements && mvp.elements.length >= 2 && COMBO_SHORT[comboKey(mvp.elements)])
          ? ` · ${COMBO_SHORT[comboKey(mvp.elements)]}`
          : (mvp.elements && mvp.elements.length === 1 ? ` · ${ELEMENTS[mvp.elements[0]].name}` : "");
        els.overMvp.innerHTML =
          `<div><div class="over-mvp-tag">★ MVP Tower</div><div class="over-mvp-title">${BASE_TOWER[mvp.type].name} Lv${mvp.level}${comboTag}</div></div>` +
          `<div class="over-mvp-meta"><strong>${formatCompact(Math.round(mvp.totalDmg))} DMG</strong><br>${mvp.kills || 0} kills</div>`;
      } else {
        els.overMvp.classList.add("hidden");
      }
    }
    // Render Next Unlock / Milestone Goal Bar
    if (els.overGoal) {
      const goal = nextRunGoal(wave, diff.id, nmTier);
      if (goal) {
        const pct = Math.max(4, Math.min(100, Math.round((goal.cur / Math.max(1, goal.target)) * 100)));
        const rewardSuffix = goal.reward && !goal.label.includes(goal.reward) ? ` (${goal.reward})` : "";
        els.overGoal.classList.remove("hidden");
        els.overGoal.innerHTML =
          `<div class="over-goal-row"><span>Next: ${goal.label}${rewardSuffix}</span><span>${goal.cur}/${goal.target}</span></div>` +
          `<div class="over-goal-bar"><div class="over-goal-fill" style="width:${pct}%"></div></div>`;
      } else {
        els.overGoal.classList.add("hidden");
      }
    }
    const btnAgain = $("btn-again");
    if (btnAgain) btnAgain.textContent = wasDaily ? "Retry Daily Rift" : "New Run";
    if (els.btnOverForge) {
      const canSpend = anyForgeUpgradeAffordable();
      els.btnOverForge.classList.toggle("has-afford", canSpend);
      els.btnOverForge.textContent = canSpend ? `Forge (${formatCompact(meta.chips)}c)` : "Forge";
    }

    showScreen("over"); refreshHub();
    sfx.over();
    addShake(victory ? 0.55 : 1.1);
  }

  function syncPauseDetails() {
    const metaEl = $("pause-meta");
    if (metaEl) {
      const baseD = DIFFICULTIES[state.difficulty]?.name || "Normal";
      const dName = runIsDaily ? "Daily Rift" : (state.difficulty === "nightmare" && (state.nmTier || 1) > 1 ? `Nightmare ×${state.nmTier}` : baseD);
      const seedTxt = state.seed ? ` · ${state.seed.slice(0, 14)}` : "";
      metaEl.textContent = `${dName} · Wave ${Math.max(1, state.wave)}${seedTxt} · Auto-saved locally.`;
    }
    const relEl = $("pause-relics");
    if (relEl) {
      const counts = {};
      for (const id of state.relics || []) counts[id] = (counts[id] || 0) + 1;
      const entries = Object.entries(counts);
      relEl.classList.toggle("hidden", entries.length === 0);
      relEl.innerHTML = entries.map(([id, n]) => {
        const def = RELICS.find((r) => r.id === id);
        if (!def) return "";
        return `<span class="pause-relic-pill" title="${def.desc}">${def.glyph} ${def.name}${n > 1 ? ` ×${n}` : ""}</span>`;
      }).join("");
    }
  }

  function resetAllProgress() {
    try {
      localStorage.removeItem(STORAGE.meta);
      localStorage.removeItem(STORAGE.best);
      localStorage.removeItem(STORAGE.run);
    } catch { /* ignore */ }
    meta = defaultMeta();
    best = defaultBest();
    settings.tutorialDone = false;
    settings.coachStep = 0;
    saveSettings();
    invalidateMetaBonuses();
    runIsDaily = false;
    runDailyKey = null;
    state.seed = null;
    state.nmTier = 1;
    state.mode = "hub";
    state.towers = []; state.enemies = []; state.projectiles = [];
    state.fx = []; state.particles = []; state.hazards = [];
    state.relics = []; state.selectedBuilt = null; state.selectedTower = null;
    state.armedAbility = null; state.movingTower = null;
    state.pendingRelicDraft = false; state.relicRerolls = 0;
    state.flawlessStreak = 0; state.hitstopT = 0; state.paidWave = 0; state.sendWaveCd = 0;
    lastRelicStripSig = "";
    if (els.app) els.app.dataset.boss = "0";
    if (els.bossBar) els.bossBar.classList.add("hidden");
    if (els.relicStrip) els.relicStrip.classList.add("hidden");
    if (els.wavePreview) els.wavePreview.classList.add("hidden");
    treeScrollMemory.clear();
    upgradeTab = "forge";
    forgeLane = "offense";
    upgradeTreeState.key = null;
    const confirmBox = $("reset-confirm-box");
    if (confirmBox) confirmBox.classList.add("hidden");
    refreshHub();
    showScreen("hub");
    sfx.cancel();
    toast("All progress reset");
  }

  function respecForge() {
    let refunded = 0;
    for (const tree of Object.values(UPGRADE_TREES)) {
      for (const u of tree) {
        const r = ownedRank(u.id);
        for (let k = 1; k <= r; k++) refunded += upgradeCostAt(u, k);
      }
    }
    for (const inf of MASTERY_INFUSIONS) {
      const r = masteryRank(inf.id);
      for (let k = 1; k <= r; k++) refunded += masteryCostAt(inf, k);
    }
    if (refunded <= 0) {
      toast("No upgrades to refund");
      return;
    }
    meta.chips += refunded;
    meta.owned = {};
    meta.infusions = {};
    invalidateMetaBonuses();
    saveJSON(STORAGE.meta, meta);
    sfx.relic();
    renderUpgrades({ rebuild: true });
    refreshHub();
    toast(`Refunded ${formatCompact(refunded)} chips`);
  }

  let codexTab = "combos";
  let codexReturnScreen = "hub";
  function renderCodex() {
    const body = $("codex-body");
    if (!body) return;
    document.querySelectorAll(".codex-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.codex === codexTab);
    });
    if (codexTab === "combos") {
      const elRows = ELEMENT_IDS.map((id) => {
        const e = ELEMENTS[id];
        return `<div class="codex-item"><div class="codex-item-top"><span style="color:${e.color}">${e.name}</span><span class="codex-pill">${e.cost} scrap</span></div><div class="codex-item-sub">${e.tip}</div></div>`;
      }).join("");
      const comboRows = Object.entries(COMBO_DESC).map(([k, desc]) => {
        const [a, b] = k.split("+");
        const ea = ELEMENTS[a], eb = ELEMENTS[b];
        const title = `<span style="color:${ea?.color || "#fff"}">${ea?.name || a}</span> + <span style="color:${eb?.color || "#fff"}">${eb?.name || b}</span>`;
        const short = COMBO_SHORT[k] || "";
        return `<div class="codex-item"><div class="codex-item-top"><span>${title}</span><span class="codex-pill">${short}</span></div><div class="codex-item-sub">${desc}</div></div>`;
      }).join("");
      body.innerHTML = elRows + comboRows;
    } else if (codexTab === "towers") {
      body.innerHTML = Object.entries(BASE_TOWER).map(([id, def]) => {
        const st = towerStats(id);
        const dps = Math.round(st.damage / Math.max(0.1, st.fireRate));
        return `<div class="codex-item"><div class="codex-item-top"><span style="color:${def.color}">${def.name}</span><span class="codex-pill">${st.cost} scrap · ~${dps} DPS</span></div><div class="codex-item-sub">${def.blurb} · Range ${Math.round(st.range)}</div></div>`;
      }).join("");
    } else {
      const keys = ["drone", "crawler", "armor", "swarm", ...BOSS_ROSTER];
      body.innerHTML = keys.map((k) => {
        const e = ENEMY[k];
        const isBoss = isBossType(k);
        const res = formatResistLine(e.resist || {});
        const abilityDesc = ({
          bulk: "Heavy armored vanguard",
          ashregen: "Flying · regenerates HP unless chilled",
          carapace: "Regenerating carapace shield",
          brood: "Spawns Swarm adds periodically",
          tempest: "Enrages & surges below 45% HP",
        })[e.ability] || (e.tags.includes("flying") ? "Flying unit" : "Ground unit");
        return `<div class="codex-item"><div class="codex-item-top"><span style="color:${e.color}">${e.label}</span><span class="codex-pill">${isBoss ? "BOSS" : e.tags.join(" · ")}</span></div><div class="codex-item-sub">${abilityDesc} · ${res}</div></div>`;
      }).join("");
    }
  }
  function openCodex(from) {
    codexReturnScreen = from || "hub";
    renderCodex();
    showScreen("codex");
  }
  function closeCodex() {
    if (codexReturnScreen === "pause" && state.seed) {
      state.mode = "paused";
      showScreen("pause");
    } else {
      state.mode = "hub";
      showScreen("hub");
      refreshHub();
    }
  }

  function showScreen(name) {
    els.hub.classList.toggle("hidden", name !== "hub");
    els.upgrades.classList.toggle("hidden", name !== "upgrades");
    els.pause.classList.toggle("hidden", name !== "pause");
    els.over.classList.toggle("hidden", name !== "over");
    if (els.codex) els.codex.classList.toggle("hidden", name !== "codex");
    if (els.settings) els.settings.classList.toggle("hidden", name !== "settings");
    if (els.relic) els.relic.classList.toggle("hidden", name !== "relic");
    if (name === "pause") syncPauseDetails();
    // Reset scroll position to top whenever opening a screen.
    if (name && els[name]) els[name].scrollTop = 0;
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
    syncNextWaveBtn();
    syncAbilitiesUI();
  }

  function refreshHub() {
    meta = loadJSON(STORAGE.meta, defaultMeta());
    if (!meta.infusions || typeof meta.infusions !== "object") meta.infusions = {};
    if (typeof meta.blessings !== "number" || meta.blessings < 0) meta.blessings = 0;
    if (!meta.unlockedDifficulties) meta.unlockedDifficulties = { normal: true };
    if (!meta.bestByDifficulty) meta.bestByDifficulty = defaultMeta().bestByDifficulty;
    syncDifficultyUnlocks();
    syncNightmareTierUnlock();
    best = loadJSON(STORAGE.best, defaultBest());
    const ascEl = $("hub-ascension");
    if (ascEl) {
      const asc = ascensionLevel();
      ascEl.classList.toggle("hidden", asc <= 0);
      if (asc > 0) ascEl.textContent = `Ascension ${toRoman(asc)}`;
    }
    const diffId = meta.selectedDifficulty || "normal";
    const nmSel = diffId === "nightmare" ? Math.max(1, meta.selectedNmTier || 1) : 1;
    const rec = (diffId === "nightmare" && nmSel > 1)
      ? ((meta.bestByNmTier && meta.bestByNmTier[nmSel]) || { wave: 0, score: 0 })
      : (meta.bestByDifficulty[diffId] || { wave: 0, score: 0 });
    els.bestWave.textContent = formatCompact(rec.wave || (nmSel > 1 ? 0 : best.wave) || 0);
    const bestScore = rec.score || (nmSel > 1 ? 0 : best.score) || 0;
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
    bindPref("opt-autowave", "autoWave", () => {
      toast(settings.autoWave ? "Auto-send waves on" : "Auto-send waves off");
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
    const tierBar = $("nm-tier-bar");
    if (!wrap) return;
    syncNightmareTierUnlock();
    wrap.innerHTML = "";
    for (const id of ["normal", "hard", "nightmare"]) {
      const def = DIFFICULTIES[id];
      const unlocked = isDifficultyUnlocked(id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "diff-btn" + (meta.selectedDifficulty === id ? " active" : "") + (!unlocked ? " locked" : "");
      const nmTag = id === "nightmare" && unlocked && (meta.selectedNmTier || 1) > 1 ? ` ×${meta.selectedNmTier}` : "";
      btn.innerHTML = unlocked ? `${def.name}${nmTag}` : `${def.name}<span class="lock">Locked</span>`;
      btn.addEventListener("click", () => {
        if (!unlocked) { hint.textContent = unlockHint(id); toast(unlockHint(id)); return; }
        meta.selectedDifficulty = id; saveJSON(STORAGE.meta, meta); refreshHub();
      });
      wrap.appendChild(btn);
    }
    const sel = DIFFICULTIES[meta.selectedDifficulty] || DIFFICULTIES.normal;
    const isNm = meta.selectedDifficulty === "nightmare" && isDifficultyUnlocked("nightmare");
    const nmSel = isNm ? Math.max(1, meta.selectedNmTier || 1) : 1;
    const nmProf = nmTierProfile(nmSel);
    const effHp = sel.hpMul * nmProf.hpMul;
    const effChips = sel.chipMul * nmProf.chipMul;
    hint.textContent = isDifficultyUnlocked(meta.selectedDifficulty)
      ? `×${effHp >= 10 ? effHp.toFixed(0) : effHp.toFixed(1)} HP · ×${effChips.toFixed(2).replace(/\.00$/, "")} chips`
      : unlockHint(meta.selectedDifficulty);
    if (tierBar) {
      if (!isNm) {
        tierBar.classList.add("hidden");
        tierBar.innerHTML = "";
      } else {
        tierBar.classList.remove("hidden");
        const maxT = meta.maxNightmareTier || 1;
        if (maxT < 2) {
          const prog = skillTreeProgress();
          tierBar.innerHTML =
            `<div class="nm-tier-lock">` +
              `<span>Max all skill trees to unlock <strong>Nightmare ×2</strong></span>` +
              `<span class="nm-tier-pct">${prog.pct}%</span>` +
            `</div>`;
        } else {
          const nextHint = nmSel >= maxT
            ? `Reach W${NM_UNLOCK_WAVE} to unlock ×${maxT + 1}`
            : `Unlocked up to ×${maxT}`;
          tierBar.innerHTML =
            `<div class="nm-tier-copy">` +
              `<div class="nm-tier-title">Nightmare Tier</div>` +
              `<div class="nm-tier-sub">${nextHint}</div>` +
            `</div>` +
            `<div class="nm-tier-ctrl">` +
              `<button type="button" id="btn-nm-down" class="nm-tier-btn" aria-label="Lower Nightmare tier"${nmSel <= 1 ? " disabled" : ""}>−</button>` +
              `<span class="nm-tier-val">×${nmSel}</span>` +
              `<button type="button" id="btn-nm-up" class="nm-tier-btn" aria-label="Higher Nightmare tier"${nmSel >= maxT ? " disabled" : ""}>+</button>` +
            `</div>`;
          const down = tierBar.querySelector("#btn-nm-down");
          const up = tierBar.querySelector("#btn-nm-up");
          if (down) down.addEventListener("click", () => {
            if ((meta.selectedNmTier || 1) <= 1) return;
            meta.selectedNmTier -= 1;
            saveJSON(STORAGE.meta, meta);
            sfx.ui();
            refreshHub();
          });
          if (up) up.addEventListener("click", () => {
            if ((meta.selectedNmTier || 1) >= (meta.maxNightmareTier || 1)) return;
            meta.selectedNmTier = (meta.selectedNmTier || 1) + 1;
            saveJSON(STORAGE.meta, meta);
            sfx.ui();
            refreshHub();
          });
        }
      }
    }
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
      : state.difficulty === "nightmare" && (state.nmTier || 1) > 1
        ? `NM${state.nmTier}`
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
        ? `${dShort} · Prep — tap Start Wave when ready`
        : runIsDaily
          ? `Daily · Wave ${waveN} of ${DAILY.waveCap} · Score ${score}`
          : `${dShort} · Wave ${waveN} · Score ${score}`;
    }
    if (els.streakPill) {
      const showStreak = state.mode === "playing" && state.streak >= 5 && state.streakT > 0;
      els.streakPill.classList.toggle("hidden", !showStreak);
      if (showStreak) els.streakPill.textContent = `🔥 ×${state.streak}`;
    }
    refreshTowerButtons();
    updateInspect();
    syncPlaceCancel();
    syncStartBtn();
    syncNextWaveBtn();
    syncWavePreview();
    syncBossBar();
    syncRelicStrip();
    syncAbilitiesUI();
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
  function towerSellValue(t) {
    // Fair 70% refund of total invested scrap (build + levels + sockets), boosted by sell Forge nodes.
    const invested = t.investedScrap || towerStats(t.type).cost;
    const base = Math.max(t.sell || 20, Math.round(invested * 0.70));
    return Math.max(1, Math.min(Math.round(invested * 0.92), Math.floor(base * metaBonuses().sellMul)));
  }
  function moveTowerCost() {
    return state.awaitingStart ? 0 : 15;
  }
  function startMoveTower() {
    if (state.mode !== "playing" || state.selectedBuilt == null) return;
    const cost = moveTowerCost();
    if (state.scrap < cost) { toast(`Need ${cost} scrap to move`); sfx.cancel(); return; }
    state.movingTower = state.selectedBuilt;
    state.selectedBuilt = null;
    state.selectedTower = null;
    state.armedAbility = null;
    state.ghost = null;
    sfx.ui();
    toast(cost === 0 ? "Tap new spot to relocate (Free)" : `Tap new spot to relocate (−${cost})`);
    updateHUD();
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
      elementCostMul: base.elementCostMul || 1,
      levelCdMul: base.levelCdMul || 1,
      killScrapAura: base.killScrapAura || 0,
      leakGuardNear: base.leakGuardNear || 0,
    });
  }
  function levelTower(t, opts = {}) {
    if (!t || !towerLevelReady(t)) return false;
    const cost = upgradeCost(t);
    if (state.scrap < cost) return false;
    state.scrap -= cost;
    t.investedScrap = (t.investedScrap || towerStats(t.type).cost) + cost;
    t.level += 1;
    if (!opts.skipCd) {
      const selfMul = t.levelCdMul || 1;
      t.levelCd = BALANCE.levelCd * metaBonuses().levelCdMul * selfMul;
    }
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
      t.investedScrap = (t.investedScrap || towerStats(t.type).cost) + bestCost;
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
      const selfMul = t.levelCdMul || 1;
      t.levelCd = BALANCE.levelCd * metaBonuses().levelCdMul * selfMul;
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
  function elementCost(t, elId) {
    const mb = metaBonuses();
    const second = !!(t.elements && t.elements.length);
    const elBase = elId && ELEMENTS[elId] ? ELEMENTS[elId].cost : ELEMENTS.fire.cost;
    const base = second ? (ELEMENT_SECOND_COST + Math.max(0, elBase - 28)) : elBase;
    const selfMul = t.elementCostMul || 1;
    const pathMul = second ? mb.elementCostMul * mb.elementSecondMul : mb.elementCostMul;
    return Math.max(8, Math.floor(base * pathMul * selfMul));
  }

  function updateInspect() {
    const sel = state.selectedBuilt != null ? state.towers[state.selectedBuilt] : null;
    if (!sel || state.mode !== "playing") {
      els.inspect.classList.add("hidden");
      if (els.app) els.app.dataset.inspect = "0";
      return;
    }
    els.inspect.classList.remove("hidden");
    if (els.app) els.app.dataset.inspect = "1";
    const elsList = sel.elements || [];
    const dps = Math.round(sel.damage / Math.max(0.1, sel.fireRate));
    const dmgTxt = formatCompact(Math.round(sel.totalDmg || 0));
    const killsTxt = sel.kills || 0;
    const nextTxt = elsList.length < MAX_ELEMENTS ? ` · Socket ${elementCost(sel, "fire")}+` : " · Full";
    els.inspectText.innerHTML =
      `<strong>${BASE_TOWER[sel.type].name}</strong> Lv${sel.level} · ${dps} DPS · ${dmgTxt} DMG · ${killsTxt}K` +
      `<span class="inspect-sub">${describeCombo(elsList)}${nextTxt}</span>`;

    if (els.btnMove) {
      const mc = moveTowerCost();
      els.btnMove.textContent = mc === 0 ? "Move" : `Move ${mc}`;
      els.btnMove.disabled = state.scrap < mc;
      els.btnMove.title = mc === 0 ? "Relocate tower free during Prep [V]" : `Relocate tower for ${mc} scrap [V]`;
    }

    if (els.btnTargetMode) {
      const mode = sel.targetMode || "first";
      els.btnTargetMode.textContent = TARGET_LABELS[mode] || "First";
      els.btnTargetMode.title = `Targeting: ${TARGET_LABELS[mode] || "First"} [T]`;
    }

    els.btnSell.disabled = false;
    els.btnSell.textContent = `Sell +${towerSellValue(sel)}`;
    const ready = towerLevelReady(sel);
    const upCost = upgradeCost(sel);
    els.btnUpgrade.disabled = !ready || state.scrap < upCost;
    els.btnUpgrade.textContent = !ready ? `Up ${Math.ceil(sel.levelCd || 0)}s` : `Up · ${upCost}`;
    els.btnUpgrade.title = !ready
      ? `Cooldown ${Math.ceil(sel.levelCd || 0)}s`
      : state.scrap < upCost
        ? `Need ${upCost} scrap`
        : `Level up for ${upCost} scrap [U]`;
    syncAutoLevelBtn();
    document.querySelectorAll(".el-btn").forEach((btn) => {
      const el = btn.dataset.el;
      const def = ELEMENTS[el];
      const owned = elsList.includes(el);
      const full = elsList.length >= MAX_ELEMENTS;
      const cost = elementCost(sel, el);
      const label = def ? def.name : (el[0].toUpperCase() + el.slice(1));
      btn.classList.toggle("active", owned);
      btn.disabled = owned || (full && !owned) || state.scrap < cost;
      if (owned) {
        btn.innerHTML = `<span>${label} ✓</span>`;
      } else if (elsList.length === 1) {
        const preview = COMBO_SHORT[comboKey([elsList[0], el])];
        btn.innerHTML = preview
          ? `<span>${label}</span><span class="el-combo-hint">→ ${preview}</span>`
          : `<span>${label}</span>`;
      } else {
        btn.innerHTML = `<span>${label}</span><span class="el-combo-hint">${cost}</span>`;
      }
      if (def) btn.title = `${def.name} (${cost} scrap): ${def.tip}`;
    });
  }

  function showBanner(text) {
    if (els.toast) {
      clearTimeout(toast._t);
      els.toast.classList.remove("show");
      els.toast.classList.add("hidden");
    }
    const b = els.banner;
    if (!b) return;
    b.textContent = text;
    b.classList.remove("hidden", "show");
    requestAnimationFrame(() => b.classList.add("show"));
    clearTimeout(showBanner._t);
    showBanner._t = setTimeout(() => {
      b.classList.remove("show");
      setTimeout(() => b.classList.add("hidden"), 220);
    }, 1100);
  }
  function toast(text) {
    if (els.banner) {
      clearTimeout(showBanner._t);
      els.banner.classList.remove("show");
      els.banner.classList.add("hidden");
    }
    const t = els.toast;
    t.textContent = text;
    t.classList.remove("hidden");
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.classList.add("hidden"), 200);
    }, 1500);
  }

  let upgradeTab = "forge";
  let forgeLane = "offense";
  const TOWER_PILLARS = {
    turret: ["Damage", "Fire Rate", "Range"],
    mortar: ["Payload", "Blast", "Ordnance"],
    coil: ["Voltage", "Cryo", "Pulse"],
    spire: ["Focus", "Pierce", "Range"],
  };
  const treeScrollMemory = new Map();
  const upgradeTreeState = {
    key: null,
    scroller: null,
    sections: [],
    nodes: new Map(),
    laneBtns: new Map(),
    supportBadge: null,
    ro: null,
    connectorRaf: 0,
  };

  function treeHasAffordable(nodes, fullTree) {
    for (const u of nodes) {
      const r = ownedRank(u.id);
      if (r >= (u.max || 1)) continue;
      if (!reqSatisfied(u, fullTree) || exclusiveBlocked(u, fullTree)) continue;
      if (meta.chips >= upgradeCostAt(u, r + 1)) return true;
    }
    return false;
  }

  function treeRankTotals(nodes) {
    let owned = 0;
    let max = 0;
    for (const u of nodes) {
      owned += ownedRank(u.id);
      max += (u.max || 1);
    }
    return { owned, max };
  }

  function nodeRequirementText(u, tree) {
    if (!u.req) return "";
    if (reqSatisfied(u, tree) || ownedRank(u.id) > 0) return "";
    const parent = tree.find((p) => p.id === u.req) || findUpgradeNode(u.req);
    const need = u.reqRank || 1;
    if (parent && parent.exclusive) return `Needs 1 Specialization`;
    const pname = parent ? parent.name : "prior node";
    return `Needs ${pname} ×${need}`;
  }

  function updateUpgradeTabBadges() {
    document.querySelectorAll("#screen-upgrades .tab").forEach((tab) => {
      const id = tab.dataset.tab;
      tab.classList.toggle("active", id === upgradeTab);
      let badge = tab.querySelector(".tab-rank");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "tab-rank";
        tab.appendChild(badge);
      }
      if (id === "mastery") {
        tab.classList.toggle("has-afford", anyMasteryAffordable());
        const mRanks = totalMasteryRanks();
        badge.textContent = mRanks > 0 ? String(mRanks) : "";
        badge.classList.toggle("hidden", mRanks <= 0);
        return;
      }
      const tree = UPGRADE_TREES[id] || [];
      tab.classList.toggle("has-afford", treeHasAffordable(tree, tree));
      const { owned } = treeRankTotals(tree);
      badge.textContent = owned > 0 ? String(owned) : "";
      badge.classList.toggle("hidden", owned <= 0);
    });
  }

  function updateForgeLaneBadges() {
    if (!upgradeTreeState.laneBtns.size) return;
    const forgeTree = UPGRADE_TREES.forge || [];
    for (const p of FORGE_PATHS) {
      const btn = upgradeTreeState.laneBtns.get(p.id);
      if (!btn) continue;
      const laneNodes = forgeTree.filter((u) => u.path === p.id);
      const { owned, max } = treeRankTotals(laneNodes);
      btn.classList.toggle("active", forgeLane === p.id);
      btn.classList.toggle("has-afford", treeHasAffordable(laneNodes, forgeTree));
      const countEl = btn.querySelector(".lane-count");
      if (countEl) countEl.textContent = `${owned}/${max}`;
    }
  }

  function drawSectionConnectors(section) {
    const { container, svg, edges } = section;
    if (!container || !svg) return;
    const cRect = container.getBoundingClientRect();
    const w = Math.round(container.scrollWidth || cRect.width);
    const h = Math.round(container.scrollHeight || cRect.height);
    if (w < 10 || h < 10) return;
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.innerHTML = "";

    const relRect = (el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left - cRect.left + container.scrollLeft,
        right: r.right - cRect.left + container.scrollLeft,
        top: r.top - cRect.top + container.scrollTop,
        bottom: r.bottom - cRect.top + container.scrollTop,
        cx: r.left - cRect.left + container.scrollLeft + r.width / 2,
        cy: r.top - cRect.top + container.scrollTop + r.height / 2,
      };
    };

    const addPath = (d, lit, dim) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "up-branch" + (lit ? " lit" : "") + (dim ? " dim" : ""));
      svg.appendChild(path);
    };

    const addDot = (x, y, r, lit) => {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", String(r));
      dot.setAttribute("class", "up-hub" + (lit ? " lit" : ""));
      svg.appendChild(dot);
    };

    for (const edge of edges) {
      if (edge.type === "chain") {
        const a = relRect(edge.fromEl);
        const b = relRect(edge.toEl);
        const lit = ownedRank(edge.fromId) >= (edge.reqRank || 1);
        const blocked = exclusiveBlocked(edge.toNode, edge.tree);
        const horiz = b.left > a.right - 4 && Math.abs(b.cy - a.cy) < 40;
        if (horiz) {
          const x1 = a.right;
          const y1 = a.cy;
          const x2 = b.left;
          const y2 = b.cy;
          addPath(`M ${x1} ${y1} L ${x2} ${y2}`, lit, blocked);
          addDot(x1, y1, 3.5, lit);
          addDot(x2, y2, 3.5, ownedRank(edge.toId) > 0);
        } else {
          const x1 = a.cx;
          const y1 = a.bottom;
          const x2 = b.cx;
          const y2 = b.top;
          const midY = (y1 + y2) / 2;
          addPath(`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`, lit, blocked);
          addDot(x1, y1, 3.5, lit);
          addDot(x2, y2, 3.5, ownedRank(edge.toId) > 0);
        }
      } else if (edge.type === "bus") {
        const fromRects = edge.fromEls.map(relRect);
        const toRects = edge.toEls.map(relRect);
        if (!fromRects.length || !toRects.length) continue;
        const maxBottom = Math.max(...fromRects.map((r) => r.bottom));
        const minTop = Math.min(...toRects.map((r) => r.top));
        const busY = maxBottom + Math.max(10, (minTop - maxBottom) * 0.5);
        const anyLit = edge.fromIds.some((id) => ownedRank(id) >= (edge.reqRank || 1));

        const minFromX = Math.min(...fromRects.map((r) => r.cx));
        const maxFromX = Math.max(...fromRects.map((r) => r.cx));
        const minToX = Math.min(...toRects.map((r) => r.cx));
        const maxToX = Math.max(...toRects.map((r) => r.cx));
        const busLeft = Math.min(minFromX, minToX);
        const busRight = Math.max(maxFromX, maxToX);

        // Unlit base rail across all sources
        addPath(`M ${busLeft} ${busY} L ${busRight} ${busY}`, false, false);

        // Stems from each specialization option into the collector bus
        fromRects.forEach((fr, idx) => {
          const id = edge.fromIds[idx];
          const lit = ownedRank(id) >= (edge.reqRank || 1);
          const dim = anyLit && !lit;
          addPath(`M ${fr.cx} ${fr.bottom} L ${fr.cx} ${busY}`, lit, dim);
          addDot(fr.cx, fr.bottom, 3.5, lit);
          // Highlight lit horizontal segment from chosen branch toward each target
          if (lit) {
            toRects.forEach((tr) => {
              addPath(`M ${fr.cx} ${busY} L ${tr.cx} ${busY}`, true, false);
            });
          }
        });

        // Drops from collector bus into capstone card(s)
        toRects.forEach((tr, idx) => {
          const toId = edge.toIds[idx];
          addPath(`M ${tr.cx} ${busY} L ${tr.cx} ${tr.top}`, anyLit, false);
          addDot(tr.cx, tr.top, 3.8, ownedRank(toId) > 0 || anyLit);
        });
      }
    }
  }

  function scheduleTreeConnectors() {
    if (upgradeTreeState.connectorRaf) cancelAnimationFrame(upgradeTreeState.connectorRaf);
    upgradeTreeState.connectorRaf = requestAnimationFrame(() => {
      upgradeTreeState.connectorRaf = 0;
      for (const sec of upgradeTreeState.sections) drawSectionConnectors(sec);
    });
  }

  function createUpgradeNodeCard(u, tree, extraClass) {
    const node = document.createElement("button");
    node.type = "button";
    node.dataset.nodeId = u.id;
    node.className = "up-node" + (extraClass ? ` ${extraClass}` : "") + (u.path ? ` path-${u.path}` : "");

    const max = u.max || 1;
    let pipsHtml = "";
    for (let i = 0; i < max; i++) pipsHtml += `<span class="up-pip"></span>`;

    node.innerHTML =
      `<span class="up-top">` +
        `<span class="up-ico up-ico-${u.icon || "star"}" aria-hidden="true"></span>` +
        `<span class="up-name">${u.name}</span>` +
      `</span>` +
      `<span class="up-req hidden"></span>` +
      `<span class="up-desc">${u.desc}</span>` +
      `<span class="up-foot">` +
        `<span class="up-progress"><span class="up-pips">${pipsHtml}</span><span class="up-rank">0/${max}</span></span>` +
        `<span class="up-cost">0</span>` +
      `</span>`;

    const ref = {
      el: node,
      u,
      tree,
      reqEl: node.querySelector(".up-req"),
      pips: Array.from(node.querySelectorAll(".up-pip")),
      rankEl: node.querySelector(".up-rank"),
      costEl: node.querySelector(".up-cost"),
    };

    node.addEventListener("click", () => {
      const r = ownedRank(u.id);
      if (r >= (u.max || 1) || !reqSatisfied(u, tree) || exclusiveBlocked(u, tree)) return;
      const cost = upgradeCostAt(u, r + 1);
      if (meta.chips < cost) {
        sfx.cancel();
        node.classList.remove("shake");
        void node.offsetWidth;
        node.classList.add("shake");
        toast(`Need ${cost} chips`);
        return;
      }
      meta.chips -= cost;
      meta.owned[u.id] = r + 1;
      const hadNm2 = (meta.maxNightmareTier || 1) >= 2;
      syncNightmareTierUnlock();
      invalidateMetaBonuses();
      saveJSON(STORAGE.meta, meta);
      if (!hadNm2 && (meta.maxNightmareTier || 1) >= 2) {
        sfx.relic();
        toast("All Skill Trees Maxed! Unlocked Nightmare ×2!");
      } else {
        sfx.buy();
      }
      renderUpgrades({ justBoughtId: u.id });
      refreshHub();
    });

    upgradeTreeState.nodes.set(u.id, ref);
    return ref;
  }

  function syncUpgradeNodes(justBoughtId) {
    els.chipsUp.textContent = `${formatCompact(meta.chips)} chips`;
    if (els.chipsUp) els.chipsUp.title = `${meta.chips} chips`;
    updateUpgradeTabBadges();
    updateForgeLaneBadges();

    for (const ref of upgradeTreeState.nodes.values()) {
      const { el, u, tree, reqEl, pips, rankEl, costEl } = ref;
      const rank = ownedRank(u.id);
      const max = u.max || 1;
      const full = rank >= max;
      const reqOk = reqSatisfied(u, tree);
      const blocked = exclusiveBlocked(u, tree);
      const nextCost = full ? 0 : upgradeCostAt(u, rank + 1);
      const affordable = !full && reqOk && !blocked && meta.chips >= nextCost;
      const cantAfford = !full && reqOk && !blocked && meta.chips < nextCost;
      const locked = (!reqOk || blocked) && !rank;

      el.classList.toggle("owned", rank > 0);
      el.classList.toggle("maxed", full);
      el.classList.toggle("affordable", affordable);
      el.classList.toggle("cant-afford", cantAfford);
      el.classList.toggle("locked", locked);
      el.classList.toggle("blocked-alt", blocked);
      el.classList.toggle("choice", !!u.exclusive);

      // Keep unlocked-but-unaffordable buttons clickable so tapping gives clear feedback.
      el.disabled = full || blocked || !reqOk;

      const reqText = blocked ? "Other branch chosen" : nodeRequirementText(u, tree);
      reqEl.textContent = reqText;
      reqEl.classList.toggle("hidden", !reqText);

      pips.forEach((pip, idx) => pip.classList.toggle("filled", idx < rank));
      rankEl.textContent = `${rank}/${max}`;
      costEl.textContent = full ? "MAX" : blocked ? "LOCKED" : String(nextCost);

      if (blocked) el.title = "Other branch chosen (Respec to change)";
      else if (!reqOk) el.title = `${reqText} · ${u.desc}`;
      else if (cantAfford) el.title = `Need ${nextCost} chips`;
      else el.title = u.desc || u.name;

      if (justBoughtId && u.id === justBoughtId) {
        el.classList.remove("just-bought");
        void el.offsetWidth;
        el.classList.add("just-bought");
      }
    }

    if (upgradeTreeState.supportBadge && upgradeTab !== "forge") {
      const supportNodes = (UPGRADE_TREES[upgradeTab] || []).filter((u) => u.col === 3);
      const { owned, max } = treeRankTotals(supportNodes);
      upgradeTreeState.supportBadge.textContent = `${owned}/${max}`;
    }

    scheduleTreeConnectors();
  }

  function buildUpgradeTree(key) {
    // Save previous scroll position before switching tabs/lanes.
    if (upgradeTreeState.key && upgradeTreeState.scroller) {
      treeScrollMemory.set(upgradeTreeState.key, {
        top: upgradeTreeState.scroller.scrollTop,
        left: upgradeTreeState.scroller.scrollLeft,
      });
    }
    if (upgradeTreeState.ro) {
      upgradeTreeState.ro.disconnect();
      upgradeTreeState.ro = null;
    }

    const list = els.upgradeList;
    list.innerHTML = "";
    list.className = "upgrade-tree" + (upgradeTab === "forge" ? " upgrade-tree-forge" : " upgrade-tree-tower");
    upgradeTreeState.key = key;
    upgradeTreeState.sections = [];
    upgradeTreeState.nodes = new Map();
    upgradeTreeState.laneBtns = new Map();
    upgradeTreeState.supportBadge = null;

    const tree = UPGRADE_TREES[upgradeTab] || [];

    // Forge lane selector bar (zero awkward horizontal scrolling!)
    if (upgradeTab === "forge") {
      const laneBar = document.createElement("div");
      laneBar.className = "forge-lane-bar";
      laneBar.setAttribute("role", "tablist");
      for (const p of FORGE_PATHS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `forge-lane-btn path-${p.id}`;
        btn.innerHTML = `<span class="lane-dot" aria-hidden="true"></span><span class="lane-name">${p.label}</span><span class="lane-count">0/0</span>`;
        btn.addEventListener("click", () => {
          if (forgeLane === p.id) return;
          forgeLane = p.id;
          sfx.ui();
          renderUpgrades();
        });
        upgradeTreeState.laneBtns.set(p.id, btn);
        laneBar.appendChild(btn);
      }
      list.appendChild(laneBar);
    }

    const scroller = document.createElement("div");
    scroller.className = "up-tree-scroll";
    upgradeTreeState.scroller = scroller;

    if (upgradeTab === "forge") {
      const laneNodes = tree.filter((u) => u.path === forgeLane);
      const preFork = laneNodes.filter((u) => !u.exclusive && u.row < 3).sort((a, b) => a.row - b.row);
      const fork = laneNodes.filter((u) => u.exclusive).sort((a, b) => a.row - b.row);
      const postFork = laneNodes.filter((u) => !u.exclusive && u.row >= 3).sort((a, b) => a.row - b.row);

      const stage = document.createElement("div");
      stage.className = `up-forge-stage path-${forgeLane}`;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "up-tree-svg");
      svg.setAttribute("aria-hidden", "true");
      stage.appendChild(svg);

      const edges = [];
      const refById = new Map();

      preFork.forEach((u) => {
        const ref = createUpgradeNodeCard(u, tree, "up-node-spine");
        refById.set(u.id, ref);
        stage.appendChild(ref.el);
      });

      for (let i = 0; i < preFork.length - 1; i++) {
        edges.push({
          type: "chain",
          fromEl: refById.get(preFork[i].id).el,
          toEl: refById.get(preFork[i + 1].id).el,
          fromId: preFork[i].id,
          toId: preFork[i + 1].id,
          toNode: preFork[i + 1],
          reqRank: preFork[i + 1].reqRank || 1,
          tree,
        });
      }

      if (fork.length) {
        const div = document.createElement("div");
        div.className = "up-tier-divider";
        div.innerHTML = `<span>Choose 1 Specialization</span>`;
        stage.appendChild(div);

        const forkRow = document.createElement("div");
        forkRow.className = "up-fork-pair";
        fork.forEach((u) => {
          const ref = createUpgradeNodeCard(u, tree, "up-node-fork");
          refById.set(u.id, ref);
          forkRow.appendChild(ref.el);
          const parentRef = u.req && refById.get(u.req);
          if (parentRef) {
            edges.push({
              type: "chain",
              fromEl: parentRef.el,
              toEl: ref.el,
              fromId: u.req,
              toId: u.id,
              toNode: u,
              reqRank: u.reqRank || 1,
              tree,
            });
          }
        });
        stage.appendChild(forkRow);
      }

      postFork.forEach((u, idx) => {
        const isCapstone = idx === postFork.length - 1;
        const ref = createUpgradeNodeCard(u, tree, "up-node-spine" + (isCapstone ? " up-node-capstone" : ""));
        refById.set(u.id, ref);
        stage.appendChild(ref.el);

        if (idx === 0 && fork.length) {
          edges.push({
            type: "bus",
            fromIds: fork.map((f) => f.id),
            fromEls: fork.map((f) => refById.get(f.id).el),
            toIds: [u.id],
            toEls: [ref.el],
            reqRank: u.reqRank || 1,
            tree,
          });
        } else {
          const parentRef = u.req && refById.get(u.req);
          if (parentRef) {
            edges.push({
              type: "chain",
              fromEl: parentRef.el,
              toEl: ref.el,
              fromId: u.req,
              toId: u.id,
              toNode: u,
              reqRank: u.reqRank || 1,
              tree,
            });
          }
        }
      });

      upgradeTreeState.sections.push({ container: stage, svg, edges });
      scroller.appendChild(stage);
    } else {
      // Tower tree: 3-column Combat Tree + dedicated Support Track (zero horizontal scroll!)
      const combatSec = document.createElement("div");
      combatSec.className = "up-section up-tower-combat";

      const heads = document.createElement("div");
      heads.className = "up-pillar-heads";
      (TOWER_PILLARS[upgradeTab] || ["Pillar 1", "Pillar 2", "Pillar 3"]).forEach((label) => {
        const chip = document.createElement("span");
        chip.className = "up-pillar-head";
        chip.textContent = label;
        heads.appendChild(chip);
      });
      combatSec.appendChild(heads);

      const combatStage = document.createElement("div");
      combatStage.className = "up-combat-stage";
      const combatSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      combatSvg.setAttribute("class", "up-tree-svg");
      combatSvg.setAttribute("aria-hidden", "true");
      combatStage.appendChild(combatSvg);

      const coreGrid = document.createElement("div");
      coreGrid.className = "up-combat-grid";
      const refById = new Map();
      const combatEdges = [];

      const coreNodes = tree.filter((u) => u.col < 3 && !u.exclusive && u.row < 3);
      coreNodes.forEach((u) => {
        const ref = createUpgradeNodeCard(u, tree, "up-node-compact");
        ref.el.style.gridColumn = String(u.col + 1);
        ref.el.style.gridRow = String(u.row + 1);
        refById.set(u.id, ref);
        coreGrid.appendChild(ref.el);
      });
      combatStage.appendChild(coreGrid);

      coreNodes.forEach((u) => {
        if (!u.req) return;
        const pRef = refById.get(u.req);
        const cRef = refById.get(u.id);
        if (pRef && cRef) {
          combatEdges.push({
            type: "chain",
            fromEl: pRef.el,
            toEl: cRef.el,
            fromId: u.req,
            toId: u.id,
            toNode: u,
            reqRank: u.reqRank || 1,
            tree,
          });
        }
      });

      const specNodes = tree.filter((u) => u.col < 3 && u.exclusive).sort((a, b) => a.col - b.col);
      if (specNodes.length) {
        const div = document.createElement("div");
        div.className = "up-tier-divider";
        div.innerHTML = `<span>Choose 1 Specialization</span>`;
        combatStage.appendChild(div);

        const specGrid = document.createElement("div");
        specGrid.className = "up-spec-grid";
        specNodes.forEach((u) => {
          const ref = createUpgradeNodeCard(u, tree, "up-node-compact");
          refById.set(u.id, ref);
          specGrid.appendChild(ref.el);
          const pRef = u.req && refById.get(u.req);
          if (pRef) {
            combatEdges.push({
              type: "chain",
              fromEl: pRef.el,
              toEl: ref.el,
              fromId: u.req,
              toId: u.id,
              toNode: u,
              reqRank: u.reqRank || 1,
              tree,
            });
          }
        });
        combatStage.appendChild(specGrid);
      }

      const capNodes = tree.filter((u) => u.col < 3 && !u.exclusive && u.row >= 3).sort((a, b) => a.row - b.row);
      if (capNodes.length) {
        const capRow = document.createElement("div");
        capRow.className = "up-capstone-row" + (capNodes.length > 1 ? " multi" : "");
        capNodes.forEach((u) => {
          const ref = createUpgradeNodeCard(u, tree, "up-node-capstone");
          refById.set(u.id, ref);
          capRow.appendChild(ref.el);
        });
        combatStage.appendChild(capRow);

        if (specNodes.length) {
          combatEdges.push({
            type: "bus",
            fromIds: specNodes.map((s) => s.id),
            fromEls: specNodes.map((s) => refById.get(s.id).el),
            toIds: capNodes.map((c) => c.id),
            toEls: capNodes.map((c) => refById.get(c.id).el),
            reqRank: 1,
            tree,
          });
        }
      }

      combatSec.appendChild(combatStage);
      upgradeTreeState.sections.push({ container: combatStage, svg: combatSvg, edges: combatEdges });
      scroller.appendChild(combatSec);

      // Section 2: Support Track (col === 3)
      const supportNodes = tree.filter((u) => u.col === 3).sort((a, b) => a.row - b.row);
      if (supportNodes.length) {
        const supSec = document.createElement("div");
        supSec.className = "up-section up-tower-support";
        const supHead = document.createElement("div");
        supHead.className = "up-support-head";
        const supTitle = document.createElement("span");
        supTitle.textContent = "Support Track";
        const supBadge = document.createElement("span");
        supBadge.className = "up-support-badge";
        supHead.appendChild(supTitle);
        supHead.appendChild(supBadge);
        supSec.appendChild(supHead);
        upgradeTreeState.supportBadge = supBadge;

        const supStage = document.createElement("div");
        supStage.className = "up-support-stage";
        const supSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        supSvg.setAttribute("class", "up-tree-svg");
        supSvg.setAttribute("aria-hidden", "true");
        supStage.appendChild(supSvg);

        const supGrid = document.createElement("div");
        supGrid.className = "up-support-grid";
        const supEdges = [];
        const supRefs = supportNodes.map((u) => {
          const ref = createUpgradeNodeCard(u, tree, "up-node-support");
          supGrid.appendChild(ref.el);
          return ref;
        });
        for (let i = 0; i < supRefs.length - 1; i++) {
          supEdges.push({
            type: "chain",
            fromEl: supRefs[i].el,
            toEl: supRefs[i + 1].el,
            fromId: supportNodes[i].id,
            toId: supportNodes[i + 1].id,
            toNode: supportNodes[i + 1],
            reqRank: supportNodes[i + 1].reqRank || 1,
            tree,
          });
        }
        supStage.appendChild(supGrid);
        supSec.appendChild(supStage);
        upgradeTreeState.sections.push({ container: supStage, svg: supSvg, edges: supEdges });
        scroller.appendChild(supSec);
      }
    }

    list.appendChild(scroller);

    // Restore saved scroll offset for this tab/lane (if previously visited).
    const saved = treeScrollMemory.get(key);
    if (saved) {
      scroller.scrollTop = saved.top;
      scroller.scrollLeft = saved.left;
    }

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => scheduleTreeConnectors());
      ro.observe(scroller);
      upgradeTreeState.ro = ro;
    }
  }

  function renderMasteryPanel() {
    const list = els.upgradeList;
    const prevScroll = upgradeTreeState.key === "mastery" ? list.scrollTop : 0;
    if (upgradeTreeState.ro) {
      upgradeTreeState.ro.disconnect();
      upgradeTreeState.ro = null;
    }
    upgradeTreeState.key = "mastery";
    upgradeTreeState.scroller = list;
    upgradeTreeState.sections = [];
    upgradeTreeState.nodes = new Map();
    upgradeTreeState.laneBtns = new Map();
    upgradeTreeState.supportBadge = null;

    els.chipsUp.textContent = `${formatCompact(meta.chips)} chips`;
    if (els.chipsUp) els.chipsUp.title = `${meta.chips} chips`;
    updateUpgradeTabBadges();

    list.className = "upgrade-tree upgrade-tree-mastery";
    list.innerHTML = "";

    // Hero header: Ascension level + x1 / x5 / Max bulk buy toggle
    const asc = ascensionLevel();
    const totalR = totalMasteryRanks();
    const nextAscIn = 5 - (totalR % 5);
    const hero = document.createElement("div");
    hero.className = "mastery-hero";
    hero.innerHTML =
      `<div class="mastery-hero-copy">` +
        `<div class="mastery-hero-title">Rift Mastery${asc > 0 ? ` <span class="ascension-pill">Ascension ${toRoman(asc)}</span>` : ""}</div>` +
        `<div class="mastery-hero-sub">${totalR} Mastery ranks · +${nextAscIn} to Ascension ${toRoman(asc + 1)}</div>` +
      `</div>` +
      `<div class="mastery-bulk" role="group" aria-label="Buy amount">` +
        `<button type="button" class="mastery-bulk-btn${masteryBulkMode === "1" ? " active" : ""}" data-bulk="1">×1</button>` +
        `<button type="button" class="mastery-bulk-btn${masteryBulkMode === "5" ? " active" : ""}" data-bulk="5">×5</button>` +
        `<button type="button" class="mastery-bulk-btn${masteryBulkMode === "max" ? " active" : ""}" data-bulk="max">Max</button>` +
      `</div>`;
    hero.querySelectorAll(".mastery-bulk-btn").forEach((b) => {
      b.addEventListener("click", () => {
        masteryBulkMode = b.dataset.bulk;
        sfx.ui();
        renderMasteryPanel();
      });
    });
    list.appendChild(hero);

    // Repeatable consumable chip sink: Rift Blessing (start next normal/hard/nightmare run with 1-3 free Relics!)
    const curBless = meta.blessings || 0;
    const bCost = blessingCost(curBless);
    const bFull = curBless >= MAX_BLESSINGS;
    const bAfford = !bFull && meta.chips >= bCost;
    const bCard = document.createElement("div");
    bCard.className = "blessing-card";
    const pipsHtml = Array.from({ length: MAX_BLESSINGS }, (_, i) =>
      `<span class="blessing-pip${i < curBless ? " on" : ""}"></span>`
    ).join("");
    bCard.innerHTML =
      `<div class="blessing-copy">` +
        `<div class="blessing-title">Rift Blessing <span class="blessing-pips">${pipsHtml}</span></div>` +
        `<div class="blessing-desc">${curBless > 0 ? `Armed: start next non-Daily run with ${curBless} Relic draft${curBless > 1 ? "s" : ""} in Prep.` : "Draft a starting Rift Relic before Wave 1 on your next run (repeatable, up to 3)."}</div>` +
      `</div>` +
      `<button type="button" id="btn-buy-blessing" class="blessing-btn"${!bAfford ? " disabled" : ""}>${bFull ? `Max (${MAX_BLESSINGS}/${MAX_BLESSINGS})` : `Bless · ${formatCompact(bCost)}c`}</button>`;
    const bBtn = bCard.querySelector("#btn-buy-blessing");
    if (bBtn) {
      bBtn.addEventListener("click", () => {
        if ((meta.blessings || 0) >= MAX_BLESSINGS) return;
        const cost = blessingCost();
        if (meta.chips < cost) { sfx.cancel(); toast(`Need ${formatCompact(cost)} chips`); return; }
        meta.chips -= cost;
        meta.blessings = (meta.blessings || 0) + 1;
        saveJSON(STORAGE.meta, meta);
        sfx.relic();
        toast(`Rift Blessing armed (${meta.blessings}/${MAX_BLESSINGS}) for next run!`);
        renderMasteryPanel();
        refreshHub();
      });
    }
    list.appendChild(bCard);

    // 6 Infinite Rift Infusions
    const grid = document.createElement("div");
    grid.className = "mastery-grid";
    for (const inf of MASTERY_INFUSIONS) {
      const rank = masteryRank(inf.id);
      const plan = masteryBulkPlan(inf, masteryBulkMode, meta.chips);
      const card = document.createElement("button");
      card.type = "button";
      card.className = `mastery-card${plan.affordable ? " affordable" : ""}`;
      card.dataset.infusion = inf.id;
      card.disabled = !plan.affordable;
      card.innerHTML =
        `<div class="mastery-head"><span class="mastery-name">${inf.name}</span><span class="mastery-rank">Lv ${rank}</span></div>` +
        `<div class="mastery-desc">${inf.desc}</div>` +
        `<div class="mastery-cur">${rank > 0 ? inf.fmt(rank) : "Not infused yet"}</div>` +
        `<div class="mastery-foot"><span class="mastery-step">+${plan.count} rank${plan.count > 1 ? "s" : ""}</span><span class="mastery-cost">${formatCompact(plan.total)}c</span></div>`;
      card.addEventListener("click", () => {
        const p = masteryBulkPlan(inf, masteryBulkMode, meta.chips);
        if (!p.affordable || p.count <= 0) {
          sfx.cancel();
          toast(`Need ${formatCompact(p.total)} chips`);
          return;
        }
        const prevAsc = ascensionLevel();
        meta.chips -= p.total;
        if (!meta.infusions) meta.infusions = {};
        meta.infusions[inf.id] = (meta.infusions[inf.id] || 0) + p.count;
        invalidateMetaBonuses();
        saveJSON(STORAGE.meta, meta);
        const newAsc = ascensionLevel();
        if (newAsc > prevAsc) {
          sfx.relic();
          toast(`Ascension ${toRoman(newAsc)} reached!`);
        } else {
          sfx.buy();
        }
        renderMasteryPanel();
        refreshHub();
      });
      grid.appendChild(card);
    }
    list.appendChild(grid);
    list.scrollTop = prevScroll;
  }

  function renderUpgrades(opts) {
    const { rebuild = false, justBoughtId = null } = opts || {};
    meta = loadJSON(STORAGE.meta, defaultMeta());
    if (!meta.infusions || typeof meta.infusions !== "object") meta.infusions = {};
    if (typeof meta.blessings !== "number" || meta.blessings < 0) meta.blessings = 0;
    invalidateMetaBonuses();
    if (upgradeTab === "mastery") {
      renderMasteryPanel();
      return;
    }
    const key = upgradeTab === "forge" ? `forge:${forgeLane}` : upgradeTab;
    const sameView = !rebuild
      && upgradeTreeState.key === key
      && upgradeTreeState.scroller
      && els.upgradeList.contains(upgradeTreeState.scroller);
    if (!sameView) buildUpgradeTree(key);
    syncUpgradeNodes(justBoughtId);
  }

  function beginWave(opts = {}) {
    if (runIsDaily && state.wave >= DAILY.waveCap) return;
    const append = !!(opts && opts.append && state.spawnQueue.length > 0);
    state.wave += 1;
    if (!append) state.waveLeaks = 0;
    const plan = wavePlan(state.seed, state.wave, state.difficulty);
    const nextIv = plan.interval || 0.75;
    state.waveInterval = append ? Math.min(state.waveInterval || nextIv, nextIv) : nextIv;
    if (!append) state.spawnQueue = [];
    const laneN = (state.path && state.path.spawnN) || plan.spawnLanes || 1;
    const mutId = plan.mutator ? plan.mutator.id : null;
    let laneCursor = 0;
    for (const pack of plan.mix) {
      for (let i = 0; i < pack.n; i++) {
        const lane = laneCursor % laneN;
        laneCursor += 1;
        state.spawnQueue.push({
          type: pack.type, difficulty: plan.difficulty,
          speedMul: plan.speedMul, rewardMul: plan.rewardMul,
          bossIndex: pack.bossIndex, bossTotal: pack.bossTotal, bossHpShare: pack.bossHpShare,
          lane, mutId,
        });
      }
    }
    if (!append) state.spawnTimer = 0.35;
    else state.spawnTimer = Math.min(state.spawnTimer, 0.25);
    state.betweenWaves = 0; state.awaitingStart = false;
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
      const bTip = b && BOSS_TIPS[b.type];
      if (bTip && !append) toast(bTip);
    } else if (plan.mutator) {
      banner = `${plan.mutator.label} · W${state.wave}`;
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
    const shieldMax = ability === "carapace"
      ? Math.floor(hp * 0.28)
      : (meta.mutId === "carapace" ? Math.floor(hp * 0.2) : 0);
    const w = Math.max(1, state.wave);
    const waveRewardScale = 1 + Math.min(w, 30) * 0.042 + Math.max(0, w - 30) * 0.018;
    state.enemySeq = (state.enemySeq || 0) + 1;
    state.enemies.push({
      id: state.enemySeq,
      type, dist: 0, hp, maxHp: hp, hpTrail: hp,
      speed: def.speed * jitter * speedMul * packSlow,
      baseSpeed: def.speed * jitter * speedMul * packSlow,
      reward: Math.max(1, Math.floor(def.reward * waveRewardScale * rewardMul * (boss && bossTotal > 1 ? 0.85 : 1))),
      r, color: def.color, shape: def.shape, tags: [...def.tags],
      resist: { ...(def.resist || {}) },
      label: def.label || type,
      ability, bossIndex, bossTotal,
      shield: shieldMax, shieldMax, shieldCd: 0,
      bountyTag: meta.mutId === "bounty",
      regenTag: meta.mutId === "regen",
      unstoppable: meta.mutId === "juggernaut",
      abilityT: 1.5 + Math.random() * 1.5,
      enraged: false,
      slow: 1, slowT: 0, burn: 0, burnT: 0, burnTower: null, chillT: 0, shred: 0, knockCd: 0,
      stunT: 0, stunCd: 0, freezeT: 0, freezeCd: 0, ccDR: 0,
      brittleT: 0, rimeShield: 0, plasmaMark: 0, matchFxAt: 0, alive: true, hitFlash: 0,
      lane: meta.lane || 0,
    });
  }

  function moveFloorFor(e) {
    if (isBossEnemy(e) || e.unstoppable) return BALANCE.moveFloorBoss;
    if (e.tags && e.tags.includes("armored")) return BALANCE.moveFloorArmored;
    return BALANCE.moveFloor;
  }
  function slowFloorFor(e) {
    return (isBossEnemy(e) || e.unstoppable) ? BALANCE.slowFloorBoss : BALANCE.slowFloor;
  }
  function ccPotency(e, opts = {}) {
    let m = 1 / (1 + Math.min(BALANCE.ccDrCap, e.ccDR || 0) * BALANCE.ccDrPer);
    if (isBossEnemy(e)) m *= 0.42;
    else if (e.tags && e.tags.includes("armored")) m *= 0.72;
    if (e.unstoppable) m *= 0.5;
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
    for (const cur of state.hazards) {
      if (cur.kind === h.kind && Math.hypot(cur.x - h.x, cur.y - h.y) <= Math.max(cur.r || 32, h.r || 32) * 0.72) {
        cur.t = Math.max(cur.t, h.t);
        if (h.dps) cur.dps = Math.max(cur.dps || 0, h.dps);
        if (h.slow) cur.slow = Math.min(cur.slow || 1, h.slow);
        cur.r = Math.max(cur.r || 32, h.r || 32);
        return;
      }
    }
    state.hazards.push(h);
    if (state.hazards.length > 10) state.hazards.shift();
  }
  function comboBurst(x, y, color, label) {
    pushCombatFx({ kind: "blast", x, y, t: 0.22, r: 26, color });
    if (label) state.fx.push({ kind: "text", x, y: y - 18, t: 0.5, text: label, color });
    spawnParticles(x, y, color, 10, 85);
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
    // Enforce road shoulder half-width + tower footprint so towers sit snug beside the road without touching asphalt.
    return Math.max(ROAD_HALF_W + TOWER_PLACE_R, fromPath || 0, fromDiff || 0);
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
      level: 1, cooldown: 0, levelCd: 0, elements: [], targetMode: "first",
      aim: -Math.PI / 2, recoil: 0, turnRate: stats.turnRate || 3.5,
      lockId: null, acquireT: 0,
      investedScrap: stats.cost, totalDmg: 0, kills: 0, combos: 0,
    });
    burstPlace(x, y, stats.color);
    sfx.place();
    state.selectedTower = null;
    updateHUD(); saveRun();
    advanceCoach(0);
  }
  function moveTowerTo(idx, x, y) {
    const t = state.towers[idx];
    if (!t || !state.path) return false;
    const cost = moveTowerCost();
    if (state.scrap < cost) { toast(`Need ${cost} scrap`); return false; }
    if (!placementOk(x, y, idx)) {
      if (hitsObstacle(x, y, TOWER_PLACE_R)) toast("Blocked by rock");
      else if (distToPathNetwork(state.path, x, y) < pathPlacementClear()) toast("Too close to the road");
      else toast("Invalid spot");
      return false;
    }
    state.scrap -= cost;
    t.x = x; t.y = y; t.nx = x / state.w; t.ny = y / state.h;
    t.lockId = null; t.acquireT = 0;
    state.movingTower = null;
    state.selectedBuilt = idx;
    burstPlace(x, y, t.color);
    sfx.place();
    toast(cost ? `Relocated (−${cost})` : "Relocated");
    updateHUD(); saveRun();
    return true;
  }

  function canTarget(tower, enemy) {
    const flying = enemy.tags.includes("flying");
    if (flying && !tower.hitsAir) return false;
    if (!flying && !tower.hitsGround) return false;
    return true;
  }

  function findTarget(tower, enemies) {
    const mode = tower.targetMode || "first";
    let bestE = null;
    let bestVal = mode === "close" || mode === "weak" ? Infinity : -Infinity;
    for (const e of enemies) {
      if (!e.alive || !canTarget(tower, e)) continue;
      const p = enemyPos(e);
      const d = Math.hypot(p.x - tower.x, p.y - tower.y);
      if (d > tower.range) continue;
      if (mode === "strong") {
        const val = e.hp + (isBossEnemy(e) ? 1e6 : 0);
        if (val > bestVal || (val === bestVal && e.dist > (bestE ? bestE.dist : -1))) {
          bestVal = val; bestE = e;
        }
      } else if (mode === "close") {
        if (d < bestVal) { bestVal = d; bestE = e; }
      } else if (mode === "weak") {
        if (e.hp < bestVal) { bestVal = e.hp; bestE = e; }
      } else {
        if (e.dist > bestVal) { bestVal = e.dist; bestE = e; }
      }
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

    const mb = metaBonuses();
    if (elsArr.length) {
      mul *= mb.elementDmgMul;
      if (elsArr.length >= 2) {
        mul *= mb.dualSocketDmg;
        const cAmp = relicCount("combo_amp");
        if (cAmp > 0) mul *= Math.pow(1.24, cAmp);
      }
    }

    // Run Relic combat synergies
    const cryo = relicCount("cryo_vuln");
    if (cryo > 0 && (enemy.slow < 0.99 || enemy.chillT > 0 || enemy.freezeT > 0)) {
      mul *= Math.pow(1.25, cryo);
    }
    const exec = relicCount("executioner");
    if (exec > 0 && enemy.hp / Math.max(1, enemy.maxHp) <= 0.25) {
      mul *= Math.pow(1.65, exec);
    }
    const sunder = relicCount("sunder_beam");
    if (sunder > 0 && tower.type === "spire" && isBossEnemy(enemy)) {
      mul *= Math.pow(1.25, sunder);
    }

    if (enemy.shred > 0) mul *= 1 + Math.min(0.5, enemy.shred);
    if ((enemy.plasmaMark || 0) > 0) mul *= 1.18;
    if (key === "water+wind" && enemy.chillT > 0) mul *= 1.75;
    return mul;
  }

  function noteComboProc(tower) {
    if (tower) tower.combos = (tower.combos || 0) + 1;
    if (state.runStats) state.runStats.combos = (state.runStats.combos || 0) + 1;
    const cat = relicCount("chain_catalyst");
    if (cat > 0) {
      const trim = 0.25 * cat;
      if (state.meteorCd > 0) state.meteorCd = Math.max(0, state.meteorCd - trim);
      if (state.surgeCd > 0) state.surgeCd = Math.max(0, state.surgeCd - trim);
      if (state.novaCd > 0) state.novaCd = Math.max(0, state.novaCd - trim);
    }
  }

  /** Shield-respecting, telemetry-tracked direct damage for combos, DoT, hazards, Volatile Core, and Cryo Nova. */
  function dealDirectDamage(e, rawDmg, tower, opts = {}) {
    if (!e || !e.alive || rawDmg <= 0) return 0;
    let dmg = rawDmg;
    let totalApplied = 0;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, dmg);
      e.shield -= absorbed;
      dmg -= absorbed;
      totalApplied += absorbed;
      e.shieldCd = 4.5;
    }
    if (dmg > 0) {
      e.hp -= dmg;
      totalApplied += dmg;
    }
    if (totalApplied > 0) {
      if (tower && typeof tower.totalDmg === "number") tower.totalDmg += totalApplied;
      if (state.runStats) state.runStats.totalDmg = (state.runStats.totalDmg || 0) + totalApplied;
    }
    if (settings.hitFlash !== false && !opts.silentFlash) e.hitFlash = Math.max(e.hitFlash || 0, 0.08);
    if (e.hp <= 0) {
      const magma = opts.magma != null
        ? opts.magma
        : (tower && comboKey(tower.elements || []) === "earth+fire" ? Math.max(16, totalApplied * 0.9) : 0);
      killEnemy(e, { ...opts, magma, killer: tower || opts.killer || null });
    }
    return totalApplied;
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
    const cAmp = 1 + 0.4 * relicCount("combo_amp");

    // Primary sockets — single-target potency unless this hit is splash.
    if (has("fire") || tower.burn) {
      const rf = resistFactor("fire");
      const burn = ((has("fire") ? 8 : 0) + (tower.burn || 0)) * rf * (aoeHit ? 0.7 : 1);
      if (burn >= enemy.burn) enemy.burnTower = tower;
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

    // Distinct pair combos (mechanic + VFX) — all scaled by Resonant Matrix (combo_amp) and shield-aware!
    if (key === "fire+water") {
      // Geyser: scalding steam blast + BACKWARD knockback (fixed from forward shove!).
      noteComboProc(tower);
      dealDirectDamage(enemy, dealt * 0.26 * cAmp, tower);
      applyKnock(enemy, 12, st);
      comboBurst(p.x, p.y, "#9ad0e8", "GEYSER!");
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 44) {
          dealDirectDamage(e, dealt * 0.2 * cAmp, tower);
          applyKnock(e, 7, { aoe: true });
        }
      }
    } else if (key === "earth+water") {
      noteComboProc(tower);
      pushHazard({ kind: "mire", x: p.x, y: p.y, r: 46, t: 3.2 * (1 + 0.15 * relicCount("combo_amp")), slow: 0.72 });
      comboBurst(p.x, p.y, ELEMENTS.earth.color, "MIRE!");
      applyMoveSlow(enemy, 0.72, 0.8, { aoe: true });
    } else if (key === "fire+wind" && enemy.burnT > 0) {
      noteComboProc(tower);
      const spreadBurn = Math.max(6, enemy.burn * 0.85, (tower.damage || 20) * 0.22) * cAmp;
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 58) {
          if (spreadBurn >= e.burn) e.burnTower = tower;
          e.burn = Math.max(e.burn, spreadBurn);
          e.burnT = Math.max(e.burnT, 2.0);
        }
      }
      pushCombatFx({ kind: "ring", x: p.x, y: p.y, t: 0.4, r0: 10, r1: 58, color: "#e85d4c" });
      state.fx.push({ kind: "text", x: p.x, y: p.y - 18, t: 0.5, text: "WILDFIRE!", color: "#e85d4c", scale: 1.12 });
    } else if (key === "arc+fire") {
      // Plasma: marks foe for +18% incoming damage & executes low-HP foes!
      noteComboProc(tower);
      enemy.plasmaMark = Math.max(enemy.plasmaMark || 0, 2.8);
      let bonus = 0;
      if (enemy.hp / enemy.maxHp < 0.35) bonus = dealt * (isBossEnemy(enemy) ? 0.38 : 0.72) * cAmp;
      if (bonus) {
        dealDirectDamage(enemy, bonus, tower);
        state.fx.push({ kind: "text", x: p.x, y: p.y - 22, t: 0.55, text: "PLASMA!", color: ELEMENTS.arc.color, scale: 1.18 });
        pushCombatFx({ kind: "beam", x: tower.x, y: tower.y, x2: p.x, y2: p.y, t: 0.14, color: "#ffe08a" });
      } else {
        pushCombatFx({ kind: "spark", x: p.x, y: p.y, t: 0.28, color: ELEMENTS.arc.color });
      }
    } else if (key === "arc+water") {
      noteComboProc(tower);
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 50) {
          dealDirectDamage(e, dealt * 0.32 * cAmp, tower);
          applyStun(e, 0.16, { aoe: true });
        }
      }
      comboBurst(p.x, p.y, ELEMENTS.arc.color, "CONDUCT!");
    } else if (key === "arc+earth") {
      noteComboProc(tower);
      enemy.shred = Math.min(0.5, (enemy.shred || 0) + 0.16);
      applyMoveSlow(enemy, 0.7, 0.55, st);
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 52) {
          e.shred = Math.min(0.5, (e.shred || 0) + 0.12);
          applyMoveSlow(e, 0.78, 0.4, { aoe: true });
        }
      }
      pushCombatFx({ kind: "ring", x: p.x, y: p.y, t: 0.4, r0: 8, r1: 52, color: ELEMENTS.earth.color });
      state.fx.push({ kind: "text", x: p.x, y: p.y - 18, t: 0.48, text: "FRACTURE!", color: ELEMENTS.earth.color, scale: 1.12 });
    } else if (key === "arc+wind") {
      let bestD = Infinity, second = null;
      for (const e of state.enemies) {
        if (!e.alive || e === enemy) continue;
        const q = enemyPos(e);
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < 72 && d < bestD) { bestD = d; second = e; }
      }
      if (second) {
        noteComboProc(tower);
        const q = enemyPos(second);
        dealDirectDamage(second, dealt * 0.55 * cAmp, tower);
        applyStun(second, 0.14, { aoe: true });
        state.fx.push({ kind: "beam", arc: true, x: p.x, y: p.y, x2: q.x, y2: q.y, t: 0.14, color: ELEMENTS.arc.color });
        pushCombatFx({ kind: "spark", x: q.x, y: q.y, t: 0.22, color: ELEMENTS.arc.color });
        state.fx.push({ kind: "text", x: q.x, y: q.y - 16, t: 0.45, text: "SURGE!", color: ELEMENTS.arc.color, scale: 1.12 });
      }
    } else if (key === "arc+frost") {
      noteComboProc(tower);
      enemy.brittleT = Math.max(enemy.brittleT || 0, 2.8);
      applyMoveSlow(enemy, 0.65, 0.9, st);
      state.fx.push({ kind: "text", x: p.x, y: p.y - 20, t: 0.45, text: "BRITTLE!", color: ELEMENTS.frost.color, scale: 1.1 });
      pushCombatFx({ kind: "ring", x: p.x, y: p.y, t: 0.35, r0: 6, r1: 28, color: ELEMENTS.frost.color });
    } else if (key === "frost+water") {
      if ((enemy.rimeShield || 0) <= 0) {
        enemy.rimeShield = Math.max(18, dealt * 0.45 * cAmp);
        state.fx.push({ kind: "text", x: p.x, y: p.y - 18, t: 0.45, text: "RIME", color: ELEMENTS.frost.color });
        pushCombatFx({ kind: "ring", x: p.x, y: p.y, t: 0.4, r0: 4, r1: 26, color: "#c8e8f8" });
      } else {
        noteComboProc(tower);
        const pop = enemy.rimeShield;
        enemy.rimeShield = 0;
        for (const e of state.enemies) {
          if (!e.alive) continue;
          const q = enemyPos(e);
          if (Math.hypot(q.x - p.x, q.y - p.y) < 46) {
            dealDirectDamage(e, pop * (e === enemy ? 1 : 0.58), tower);
            applyMoveSlow(e, 0.7, 0.5, { aoe: true });
          }
        }
        comboBurst(p.x, p.y, ELEMENTS.frost.color, "RIME POP!");
      }
      applyMoveSlow(enemy, 0.62, 1.0, st);
    } else if (key === "earth+frost") {
      noteComboProc(tower);
      const pierce = dealt * (enemy.tags.includes("armored") ? 0.45 : 0.22) * cAmp;
      dealDirectDamage(enemy, pierce, tower);
      enemy.shred = Math.min(0.5, (enemy.shred || 0) + 0.14);
      applyMoveSlow(enemy, 0.68, 0.7, st);
      state.fx.push({ kind: "text", x: p.x, y: p.y - 20, t: 0.48, text: "SPIKE!", color: ELEMENTS.earth.color, scale: 1.12 });
      pushCombatFx({ kind: "spark", x: p.x, y: p.y, t: 0.3, color: ELEMENTS.frost.color });
    } else if (key === "frost+wind") {
      noteComboProc(tower);
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const q = enemyPos(e);
        if (Math.hypot(q.x - p.x, q.y - p.y) > 58) continue;
        applyMoveSlow(e, 0.7, 1.0, { aoe: true });
        e.chillT = Math.max(e.chillT || 0, 1.0);
        applyKnock(e, isBossEnemy(e) ? 3 : 7, { aoe: true });
      }
      comboBurst(p.x, p.y, ELEMENTS.frost.color, "WHITEOUT!");
    } else if (key === "fire+frost" && enemy.tags.includes("armored")) {
      noteComboProc(tower);
      enemy.shred = Math.min(0.5, (enemy.shred || 0) + 0.2);
      if (Math.random() < 0.5) {
        state.fx.push({ kind: "text", x: p.x, y: p.y - 22, t: 0.45, text: "MELT!", color: ELEMENTS.frost.color, scale: 1.1 });
      }
    }
  }

  function killEnemy(e, opts = {}) {
    if (!e.alive) return;
    e.alive = false;
    const p = enemyPos(e);
    const killer = opts.killer || null;
    if (killer && typeof killer.kills === "number") killer.kills += 1;
    if (state.runStats) {
      state.runStats.kills = (state.runStats.kills || 0) + 1;
      if (isBossEnemy(e)) state.runStats.bosses = (state.runStats.bosses || 0) + 1;
    }
    let scrapGain = e.reward * metaBonuses().scrapKillMul;
    const bounty = relicCount("bounty");
    if (bounty > 0) {
      scrapGain *= Math.pow(1.28, bounty);
      if (isBossEnemy(e)) scrapGain *= Math.pow(1.45, bounty);
    }
    // Proximity-checked Brass Recycle killScrapAura
    let aura = 0;
    for (const t of state.towers) {
      if (!t.killScrapAura) continue;
      if (Math.hypot(t.x - p.x, t.y - p.y) <= (t.range || 100) * 1.25) {
        aura = Math.max(aura, t.killScrapAura);
      }
    }
    if (aura) scrapGain *= 1 + aura;
    // Boss Bounty bonus!
    if (isBossEnemy(e)) scrapGain *= 1.25;
    const gained = Math.max(1, Math.floor(scrapGain));
    state.scrap += gained;
    state.score += Math.round(e.reward * 2 + Math.floor(state.wave * 1.5));

    // Floating gold scrap popup on notable kills (bosses, armored, bounty wave, or every 3rd kill so screen stays crisp)
    if (isBossEnemy(e) || e.bountyTag || e.tags.includes("armored") || (state.runStats && state.runStats.kills % 3 === 0)) {
      state.fx.push({
        kind: "text",
        x: p.x + (Math.random() - 0.5) * 10,
        y: p.y - (isBossEnemy(e) ? 28 : 10),
        t: isBossEnemy(e) ? 0.95 : 0.62,
        text: `+${gained}⬡`,
        color: "#ffd97d",
        scale: isBossEnemy(e) ? 1.3 : 0.95,
      });
    }

    // Kill-streak momentum & ability recharge on kill!
    state.streak = (state.streak || 0) + 1;
    if (state.runStats && state.streak > (state.runStats.peakStreak || 0)) {
      state.runStats.peakStreak = state.streak;
    }
    state.streakT = 2.6;
    const cdTrim = (isBossEnemy(e) ? 1.4 : 0.14) * (1 + 0.35 * relicCount("rapid_rite"));
    if (state.meteorCd > 0) state.meteorCd = Math.max(0, state.meteorCd - cdTrim);
    if (state.surgeCd > 0) state.surgeCd = Math.max(0, state.surgeCd - cdTrim);
    if (state.novaCd > 0) state.novaCd = Math.max(0, state.novaCd - cdTrim);

    const streakMarks = [8, 16, 25, 40, 60, 90, 125];
    const nextMark = streakMarks[state.streakTier || 0];
    if (nextMark && state.streak >= nextMark) {
      state.streakTier = (state.streakTier || 0) + 1;
      const bonus = 8 + state.streakTier * 6;
      state.scrap += bonus;
      state.score += bonus * 3;
      state.fx.push({ kind: "text", x: p.x, y: p.y - 26, t: 0.85, text: `STREAK ×${nextMark} +${bonus}⬡`, color: "#ffd166", scale: 1.2 });
      sfx.streak();
    }

    pushCombatFx({ kind: "pop", x: p.x, y: p.y, t: 0.4, color: e.color });
    spawnParticles(p.x, p.y, e.color, isBossEnemy(e) ? 34 : 12, isBossEnemy(e) ? 160 : 90);
    if (isBossEnemy(e)) {
      spawnParticles(p.x, p.y, "#ffd166", 24, 140);
      pushCombatFx({ kind: "ring", x: p.x, y: p.y, t: 0.6, r0: 12, r1: 84, color: "#ffd97d" });
      state.hitstopT = Math.max(state.hitstopT || 0, 0.052);
      // Boss Bounty: heal +1 Wellheart on Normal only (Hard/Nightmare keep every HP precious!)
      let bossMsg = `BOSS SLAIN! +${gained}⬡`;
      if (state.difficulty === "normal" && !runIsDaily && state.hp < (state.maxHp || 20)) {
        state.hp += 1;
        bossMsg += " · +1 HP";
      }
      state.fx.push({ kind: "text", x: p.x, y: p.y - 42, t: 1.05, text: bossMsg, color: "#ffd97d", scale: 1.32 });
      showBanner(`${e.label} Slain!`);
      addShake(1.35);
      sfx.bossKill();
    } else {
      addShake(0.2);
      sfx.kill(state.streak);
    }

    // Volatile Core relic: slain foes explode for 11% max HP splash (capped vs bosses, non-recursive).
    const vol = relicCount("volatile");
    if (vol > 0 && !opts.fromVolatile) {
      const blastDmg = Math.max(10, e.maxHp * 0.11 * vol);
      for (const o of state.enemies) {
        if (!o.alive) continue;
        const q = enemyPos(o);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 50) {
          const applied = isBossEnemy(o) ? Math.min(blastDmg, o.maxHp * 0.35) : blastDmg;
          dealDirectDamage(o, applied, killer, { fromVolatile: true });
        }
      }
      pushCombatFx({ kind: "blast", x: p.x, y: p.y, t: 0.3, r: 48, color: "#ffb854" });
    }

    if (opts.magma) {
      noteComboProc(killer);
      const cAmp = 1 + 0.4 * relicCount("combo_amp");
      pushHazard({ kind: "magma", x: p.x, y: p.y, r: 48, t: 2.8, dps: Math.max(12, opts.magma * 0.42 * cAmp), tower: killer });
      for (const o of state.enemies) {
        if (!o.alive) continue;
        const q = enemyPos(o);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 50) {
          dealDirectDamage(o, opts.magma * 0.55 * cAmp, killer, { magma: 0 });
          if (o.alive) {
            o.burn = Math.max(o.burn, 5);
            o.burnT = Math.max(o.burnT, 1.5);
            if (!o.burnTower) o.burnTower = killer;
          }
        }
      }
      pushCombatFx({ kind: "blast", x: p.x, y: p.y, t: 0.4, r: 50, color: "#ee6450" });
      state.fx.push({ kind: "text", x: p.x, y: p.y - 16, t: 0.55, text: "MAGMA!", color: "#ee6450", scale: 1.18 });
      spawnParticles(p.x, p.y, "#ee6450", 16, 100);
    }
  }

  function damageEnemy(e, amount, tower, opts = {}) {
    if (!e.alive) return 0;
    const matchMul = damageMultiplier(tower, e);
    let dmg = amount * matchMul;
    let didCrit = false;
    const surgeCrit = state.surgeT > 0 ? ABILITY_DEF.surge.critAdd * abilityDmgMul() : 0;
    const critChance = (opts.critChance || 0) + surgeCrit;
    if (critChance > 0 && Math.random() < critChance) {
      dmg *= 2;
      didCrit = true;
      const p = enemyPos(e);
      state.fx.push({ kind: "text", x: p.x, y: p.y - 16, t: 0.55, text: "CRIT!", color: "#ffd166", scale: 1.24 });
      addShake(0.36);
    }
    if ((e.brittleT || 0) > 0) {
      dmg *= 1.4;
      e.brittleT = 0;
      const bp = enemyPos(e);
      state.fx.push({ kind: "text", x: bp.x, y: bp.y - 16, t: 0.45, text: "CRACK!", color: ELEMENTS.frost.color, scale: 1.15 });
    }
    if (comboKey(tower.elements || []) === "water+wind" && e.chillT > 0) {
      noteComboProc(tower);
      const p = enemyPos(e);
      state.fx.push({ kind: "text", x: p.x, y: p.y - 18, t: 0.5, text: "SHATTER!", color: "#50c2cf", scale: 1.18 });
    }
    let shieldAbsorbed = 0;
    if (e.shield > 0) {
      shieldAbsorbed = Math.min(e.shield, dmg);
      e.shield -= shieldAbsorbed;
      dmg -= shieldAbsorbed;
      e.shieldCd = 4.5;
      if (shieldAbsorbed > 0) {
        if (tower && typeof tower.totalDmg === "number") tower.totalDmg += shieldAbsorbed;
        if (state.runStats) state.runStats.totalDmg = (state.runStats.totalDmg || 0) + shieldAbsorbed;
      }
      if (dmg <= 0) {
        if (settings.hitFlash !== false) e.hitFlash = 0.08;
        const sp = enemyPos(e);
        pushCombatFx({ kind: "spark", x: sp.x, y: sp.y, t: 0.2, color: "#92cef0" });
        return shieldAbsorbed;
      }
    }
    e.hp -= dmg;
    if (tower && typeof tower.totalDmg === "number") tower.totalDmg += dmg;
    if (state.runStats) state.runStats.totalDmg = (state.runStats.totalDmg || 0) + dmg;
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
      let numColor = didCrit ? "#ffd166" : (opts.color || "#f5eee6");
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
        scale: didCrit ? 1.18 : 0.96,
      });
    }
    spawnParticles(p.x, p.y, opts.color || tower.color, 4, 55);
    sfx.hit();
    if (e.hp <= 0) {
      const magma = comboKey(tower.elements || []) === "earth+fire" ? dmg * 0.9 : 0;
      killEnemy(e, { magma, killer: tower });
    }
    return dmg + shieldAbsorbed;
  }

  function fireTower(tower, target) {
    const p = enemyPos(target);
    const elsArr = tower.elements || [];
    const tint = elsArr.length ? ELEMENTS[elsArr[0]].color : tower.color;
    tower.recoil = 1;

    if (tower.type === "mortar") {
      state.projectiles.push({
        kind: "shell", x: tower.x, y: tower.y, tx: p.x, ty: p.y,
        t: 0, dur: 0.44, damage: tower.damage, splash: tower.splash || 44,
        tower, color: tint,
      });
    } else if (tower.type === "coil") {
      damageEnemy(target, tower.damage, tower, { color: tint, critChance: tower.crit || 0 });
      state.fx.push({ kind: "beam", arc: true, x: tower.x, y: tower.y, x2: p.x, y2: p.y, t: 0.14, color: tint });
      const totalChains = (tower.chain || 0) + relicCount("arc_fork");
      if (totalChains > 0) {
        const hitSet = new Set([target]);
        let prev = p;
        const jumpMul = 0.7 + 0.2 * relicCount("arc_fork");
        for (let c = 0; c < totalChains; c++) {
          let nextE = null, bestD = Infinity;
          for (const e of state.enemies) {
            if (!e.alive || hitSet.has(e) || !canTarget(tower, e)) continue;
            const q = enemyPos(e);
            const d = Math.hypot(q.x - prev.x, q.y - prev.y);
            if (d < 82 && d < bestD) { bestD = d; nextE = e; }
          }
          if (!nextE) break;
          hitSet.add(nextE);
          const q = enemyPos(nextE);
          damageEnemy(nextE, tower.damage * jumpMul, tower, { color: tint });
          state.fx.push({ kind: "beam", arc: true, x: prev.x, y: prev.y, x2: q.x, y2: q.y, t: 0.12, color: tint });
          prev = q;
        }
      }
    } else if (tower.type === "spire") {
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
        if (perp > 18) continue;
        hits.push({ e, along });
      }
      hits.sort((a, b) => a.along - b.along);
      const pierce = Math.max(1, tower.pierce || 3);
      const end = hits[Math.min(hits.length, pierce) - 1];
      const ex = end ? enemyPos(end.e).x : tower.x + ux * tower.range;
      const ey = end ? enemyPos(end.e).y : tower.y + uy * tower.range;
      state.fx.push({ kind: "beam", rail: true, x: tower.x, y: tower.y, x2: ex, y2: ey, t: 0.2, color: tint });
      const sunder = relicCount("sunder_beam");
      hits.slice(0, pierce).forEach((h, i) => {
        if (sunder > 0) h.e.shred = Math.min(0.55, (h.e.shred || 0) + 0.18 * sunder);
        damageEnemy(h.e, tower.damage * (1 - i * 0.11), tower, { color: tint, critChance: tower.crit || 0 });
      });
    } else {
      state.projectiles.push({
        kind: "bolt", x: tower.x, y: tower.y, tx: p.x, ty: p.y,
        t: 0, dur: 0.11, target, damage: tower.damage,
        critChance: tower.crit || 0, tower, color: tint,
      });
      // Split Chamber relic: Turret fires an extra split bolt at a secondary target or same target.
      const splits = relicCount("twin_bolt");
      if (splits > 0) {
        let alt = null, bestD = Infinity;
        for (const e of state.enemies) {
          if (!e.alive || e === target || !canTarget(tower, e)) continue;
          const q = enemyPos(e);
          const d = Math.hypot(q.x - tower.x, q.y - tower.y);
          if (d <= tower.range && d < bestD) { bestD = d; alt = e; }
        }
        const t2 = alt || target;
        const p2 = enemyPos(t2);
        state.projectiles.push({
          kind: "bolt", x: tower.x, y: tower.y, tx: p2.x, ty: p2.y,
          t: 0, dur: 0.13, target: t2, damage: tower.damage * (0.42 * splits),
          critChance: tower.crit || 0, tower, color: "#ffd166",
        });
      }
    }
    sfx.shoot(tower.type);
  }

  function update(dt) {
    if (state.mode !== "playing" || !state.path) {
      if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 18);
      if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
      return;
    }
    if (state.hitstopT > 0) {
      state.hitstopT = Math.max(0, state.hitstopT - dt);
      if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 8);
      return;
    }
    const speed = normalizeSpeed(settings.gameSpeed);
    const step = dt * speed;
    state.time += step; state.frame++;

    // Active abilities & streak timers
    if (state.sendWaveCd > 0) state.sendWaveCd = Math.max(0, state.sendWaveCd - dt);
    if (!state.awaitingStart) {
      if (state.meteorCd > 0) state.meteorCd = Math.max(0, state.meteorCd - step);
      if (state.surgeCd > 0) state.surgeCd = Math.max(0, state.surgeCd - step);
      if (state.surgeT > 0) state.surgeT = Math.max(0, state.surgeT - step);
      if (state.novaCd > 0) state.novaCd = Math.max(0, state.novaCd - step);
    }
    if (state.streakT > 0) {
      state.streakT -= step;
      if (state.streakT <= 0) {
        state.streak = 0;
        state.streakTier = 0;
      }
    }

    // Prep gate: no auto-spawn until player taps Start.
    if (!state.awaitingStart) {
      if (state.betweenWaves > 0) {
        state.betweenWaves -= step;
        if (state.betweenWaves <= 0) beginWave();
      }

      if (state.spawnQueue.length) {
        state.spawnTimer -= step;
        const iv = state.waveInterval || 0.75;
        if (state.spawnTimer <= 0) {
          const next = state.spawnQueue.shift();
          spawnEnemy(next.type, next.difficulty, next.speedMul || 1, next.rewardMul || 1, next);
          if (isBossType(next.type)) {
            state.spawnTimer = iv * (3.2 + (next.bossIndex || 0) * 0.75);
          } else {
            state.spawnTimer = iv * (next.type === "swarm" ? 0.35 : 1);
          }
        }
      } else if (state.betweenWaves <= 0 && state.wave > 0) {
        state.enemies = state.enemies.filter((e) => e.alive);
        // Wait for wave to actually clear before paying wave bonus, interest, flawless reward & Relic Draft!
        if (livingEnemyCount() === 0) {
          if (runIsDaily && state.wave >= DAILY.waveCap) {
            endRun(false, { victory: true });
            return;
          }
          state.betweenWaves = nextWaveDelay();
          const pay = payWaveClearEconomy({ rushed: false });
          if (pay) {
            const bonusBits = [`+${pay.scrapWave} wave`];
            if (pay.interest > 0) bonusBits.push(`+${pay.interest} int`);
            if (pay.flawlessBonus > 0) bonusBits.push(`Flawless +${pay.flawlessBonus}${pay.healed ? " · +1 HP" : ""}`);
            toast(bonusBits.join(" · "));
            if (pay.flawlessBonus > 0) sfx.streak();
          }

          // Trigger roguelite Rift Relic draft at milestone waves (never skipped even after wave stacking!)
          const relicW = nextPendingRelicWave();
          if (relicW > 0) {
            state.relicDraftWave = relicW;
            openRelicDraft();
            return;
          }
          saveRun();
        }
      }
    }

    const broodSpawns = [];
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (e.hpTrail == null) e.hpTrail = e.hp;
      if (e.hpTrail > e.hp) e.hpTrail = Math.max(e.hp, e.hpTrail - e.maxHp * 1.4 * step);
      else e.hpTrail = e.hp;
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
        if (Math.random() < step * 8) {
          const p = enemyPos(e);
          spawnParticles(p.x, p.y, "#ee6450", 1, 30);
        }
        dealDirectDamage(e, e.burn * step, e.burnTower || null, { silentFlash: true });
        if (!e.alive) continue;
      }
      // Regenerating wave mutator (halved while chilled)
      if (e.regenTag && e.hp < e.maxHp) {
        const rate = e.chillT > 0 ? 0.011 : 0.022;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * rate * step);
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
            broodSpawns.push({ dist: e.dist, diff: childDiff, color: e.color, lane: e.lane || 0 });
          }
        }
      } else if (e.ability === "tempest") {
        if (!e.enraged && e.hp / e.maxHp <= 0.45) {
          e.enraged = true;
          e.speed = (e.baseSpeed || e.speed) * 1.4;
          const p = enemyPos(e);
          state.fx.push({ kind: "text", x: p.x, y: p.y - 16, t: 0.65, text: "TEMPEST!", color: "#50c2cf", scale: 1.2 });
          spawnParticles(p.x, p.y, "#50c2cf", 14, 90);
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
        state.waveLeaks = (state.waveLeaks || 0) + 1;
        state.flawlessStreak = 0;
        {
          const mb = metaBonuses();
          let guard = 0;
          const ex = state.path && state.path.exit;
          if (ex) {
            for (const t of state.towers) {
              if (t.leakGuardNear && Math.hypot(t.x - ex.x, t.y - ex.y) <= (t.range || 100) * 1.35) {
                guard = Math.max(guard, t.leakGuardNear);
              }
            }
          }
          const raw = isBossEnemy(e) ? 5 - mb.bossLeakReduce - guard : 1 - mb.leakReduce;
          state.hp -= Math.max(1, raw);
        }
        triggerScreenFlash(0.16);
        addShake(0.95);
        sfx.leak();
        if (state.hp <= 0) { state.hp = 0; updateHUD(); endRun(false); return; }
      }
    }
    for (const b of broodSpawns) {
      for (let i = 0; i < 2; i++) {
        spawnEnemy("swarm", b.diff, 1, 0.7, { lane: b.lane || 0 });
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
            dealDirectDamage(e, (h.dps || 12) * step, h.tower || null, { silentFlash: true, magma: 0 });
            if (e.alive) {
              e.burn = Math.max(e.burn, 4);
              e.burnT = Math.max(e.burnT, 0.6);
              if (h.tower && !e.burnTower) e.burnTower = h.tower;
            }
          }
        }
      }
      state.hazards = state.hazards.filter((h) => h.t > 0);
    }

    const surgeRateMul = state.surgeT > 0 ? ABILITY_DEF.surge.rateMul * Math.pow(0.9, relicCount("rapid_rite")) : 1;
    for (const tower of state.towers) {
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
        const rate = (tower.turnRate || (BASE_TOWER[tower.type] && BASE_TOWER[tower.type].turnRate) || 3.5) * (state.surgeT > 0 ? 1.4 : 1);
        const maxStep = rate * step;
        tower.aim = (tower.aim || 0) + Math.max(-maxStep, Math.min(maxStep, dAim));
        aligned = Math.abs(angleDelta(tower.aim, want)) <= BALANCE.aimAlign;
      }

      tower.cooldown -= step;
      if (tower.cooldown > 0) continue;
      if (track && aligned && (tower.acquireT || 0) <= 0) {
        fireTower(tower, track);
        tower.cooldown = tower.fireRate * surgeRateMul;
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
          const lavaShell = relicCount("lava_shell");
          if (lavaShell > 0) {
            pushHazard({ kind: "magma", x: p.tx, y: p.ty, r: Math.max(36, p.splash * 0.72), t: 2.6 + lavaShell * 0.6, dps: Math.max(12, p.damage * 0.25 * lavaShell) });
          }
          pushCombatFx({ kind: "blast", x: p.tx, y: p.ty, t: 0.35, r: p.splash, color: p.color });
          spawnParticles(p.tx, p.ty, p.color, 18, 120);
          sfx.boom();
          addShake(0.45);
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
  function drawFieldStatic() {
    const w = state.w, h = state.h;
    const seedN = (state.seed || "ember").split("").reduce((a, c) => a + c.charCodeAt(0), 0);

    // Rich volcanic basalt plateau with cool mineral moss pockets & warm rift glow.
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#2d211a");
    sky.addColorStop(0.22, "#221b16");
    sky.addColorStop(0.55, "#191e17");
    sky.addColorStop(0.84, "#151914");
    sky.addColorStop(1, "#10120e");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Horizon hearth heat wash near spawn belt
    const heat = ctx.createLinearGradient(0, 0, 0, h * 0.28);
    heat.addColorStop(0, "rgba(232,96,42,0.18)");
    heat.addColorStop(0.55, "rgba(180,80,30,0.06)");
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
      shelf.addColorStop(0, cool ? "rgba(64,84,60,0.44)" : "rgba(76,58,42,0.46)");
      shelf.addColorStop(0.55, cool ? "rgba(40,54,38,0.18)" : "rgba(48,38,28,0.18)");
      shelf.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = shelf;
      ctx.beginPath();
      ctx.ellipse(sx, sy, rw, rh, hx * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stratified stone bands
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 8; i++) {
      const y = (hash2(i, seedN) * 0.85 + 0.08) * h;
      ctx.strokeStyle = i % 2 ? "#3d342a" : "#2b3629";
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

    // Glowing subterranean magma veins
    for (let i = 0; i < 10; i++) {
      const x0 = hash2(i * 2, seedN) * w;
      const y0 = hash2(seedN, i * 3) * h;
      const x1 = x0 + (hash2(i, 9) - 0.5) * 95;
      const y1 = y0 + 38 + hash2(i, 11) * 52;
      const vein = ctx.createLinearGradient(x0, y0, x1, y1);
      vein.addColorStop(0, "rgba(90,36,18,0)");
      vein.addColorStop(0.4, "rgba(210,78,32,0.42)");
      vein.addColorStop(0.7, "rgba(255,160,64,0.2)");
      vein.addColorStop(1, "rgba(40,16,8,0)");
      ctx.strokeStyle = vein;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2 + 18, (y0 + y1) / 2 - 8, x1, y1);
      ctx.stroke();
    }

    // Ambient decorative basalt outcrops
    for (let i = 0; i < 12; i++) {
      const sx = hash2(i + 20, seedN) * w;
      const sy = hash2(seedN + 4, i + 30) * h;
      const s = 9 + (i % 4) * 2.5;
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.beginPath();
      ctx.ellipse(sx + 1, sy + s * 0.55, s * 1.1, s * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      const rock = ctx.createLinearGradient(sx - s, sy - s, sx + s, sy + s);
      rock.addColorStop(0, "#5c5347");
      rock.addColorStop(0.45, "#2d2822");
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
        ctx.fillStyle = "rgba(111,191,138,0.24)";
        ctx.beginPath();
        ctx.ellipse(sx - s * 0.15, sy, s * 0.4, s * 0.18, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Fine mineral grit / mica
    for (let i = 0; i < 90; i++) {
      const sx = hash2(i, seedN + 1) * w;
      const sy = hash2(seedN + 2, i) * h;
      ctx.globalAlpha = 0.18 + hash2(i, 5) * 0.2;
      ctx.fillStyle = i % 6 === 0 ? "#7ed0a2" : i % 4 === 0 ? "#cca95c" : "#3d362d";
      ctx.fillRect(sx, sy, 1.2 + (i % 3) * 0.6, 1.2 + (i % 2) * 0.5);
    }
    ctx.globalAlpha = 1;

    // Atmospheric depth vignette
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.42, h * 0.12, w * 0.5, h * 0.5, h * 0.85);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.44)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
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
      outer: isMain ? 40 : 36,
      berm: isMain ? 34 : 30,
      bed: isMain ? 26 : 22,
      lane: isMain ? 17 : 14,
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
  let terrainCanvas = null;
  let terrainCtx = null;
  let terrainKey = "";

  function drawStaticTerrainAndRoad() {
    drawFieldStatic();
    if (!state.path) return;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const lanes = (state.path.lanes && state.path.lanes.length) ? state.path.lanes : [state.path];
    const merges = state.path.merges || [];
    const drawPts = lanes.map((lane, i) => lanePointsForDraw(lane.points, i, merges));
    const layers = ["shadow", "berm", "shoulder", "bed", "surface"];
    for (const layer of layers) {
      for (let i = drawPts.length - 1; i >= 0; i--) {
        drawLaneLayer(drawPts[i], i === 0 ? 1 : 0.95, i === 0, layer, null);
      }
    }
    for (const m of merges) drawMergeJunction(m);
    for (let i = drawPts.length - 1; i >= 0; i--) {
      drawLaneLayer(drawPts[i], i === 0 ? 1 : 0.95, i === 0, "detail", merges);
    }
    if (state.path.obstacles) {
      for (const o of state.path.obstacles) {
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.fillStyle = "rgba(0,0,0,0.48)";
        ctx.beginPath();
        ctx.ellipse(0, o.r * 0.42, o.r * 1.08, o.r * 0.44, 0, 0, Math.PI * 2);
        ctx.fill();
        const rock = ctx.createLinearGradient(-o.r, -o.r, o.r, o.r);
        rock.addColorStop(0, "#645a4c");
        rock.addColorStop(0.45, "#312c26");
        rock.addColorStop(1, "#14110e");
        ctx.fillStyle = rock;
        ctx.beginPath();
        ctx.moveTo(-o.r * 0.95, o.r * 0.2);
        ctx.lineTo(-o.r * 0.5, -o.r * 0.72);
        ctx.lineTo(o.r * 0.12, -o.r * 1.0);
        ctx.lineTo(o.r * 0.9, -o.r * 0.28);
        ctx.lineTo(o.r * 0.74, o.r * 0.55);
        ctx.lineTo(-o.r * 0.2, o.r * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255,220,175,0.16)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,225,180,0.15)";
        ctx.beginPath();
        ctx.moveTo(-o.r * 0.2, -o.r * 0.3);
        ctx.lineTo(o.r * 0.08, -o.r * 0.88);
        ctx.lineTo(o.r * 0.32, -o.r * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(111,191,138,0.22)";
        ctx.beginPath();
        ctx.ellipse(-o.r * 0.18, -o.r * 0.04, o.r * 0.38, o.r * 0.16, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function ensureTerrainCache() {
    const dpr = Math.min(settings.batterySaver ? 1.25 : 2, window.devicePixelRatio || 1);
    const key = `${state.seed || "hub"}:${state.w}x${state.h}@${dpr}:${state.path ? state.path.motif : "none"}`;
    if (!state.terrainDirty && terrainCanvas && terrainKey === key) return;
    if (!terrainCanvas) {
      terrainCanvas = document.createElement("canvas");
      terrainCtx = terrainCanvas.getContext("2d", { alpha: false });
    }
    terrainCanvas.width = Math.max(1, Math.floor(state.w * dpr));
    terrainCanvas.height = Math.max(1, Math.floor(state.h * dpr));
    terrainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx = terrainCtx;
    try {
      drawStaticTerrainAndRoad();
    } finally {
      ctx = mainCtx;
    }
    terrainKey = key;
    state.terrainDirty = false;
  }

  function drawAmbientEmbers() {
    if (settings.particles === false || !motionAllowed()) return;
    const w = state.w, h = state.h;
    const embers = settings.batterySaver ? 6 : 16;
    for (let i = 0; i < embers; i++) {
      const drift = state.time * (8 + (i % 5)) + i * 17;
      const px = ((i * 73 + drift * 2.2) % (w + 30)) - 15;
      const py = h - ((i * 41 + state.time * (12 + (i % 5))) % (h * 0.92));
      const pulse = 0.15 + 0.12 * Math.sin(state.time * 2.8 + i);
      const glow = ctx.createRadialGradient(px, py, 0, px, py, 5);
      glow.addColorStop(0, i % 3 === 0 ? `rgba(255,212,120,${pulse + 0.18})` : `rgba(232,100,40,${pulse})`);
      glow.addColorStop(1, "rgba(80,20,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHazards() {
    if (!state.hazards || !state.hazards.length) return;
    for (const h of state.hazards) {
      const fade = Math.min(1, h.t / 0.8);
      const pulse = 0.5 + 0.5 * Math.sin(state.time * 4 + h.x * 0.1);
      ctx.save();
      ctx.globalAlpha = fade * 0.72;
      if (h.kind === "magma") {
        const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r);
        g.addColorStop(0, `rgba(255, 198, 108, ${0.34 + pulse * 0.1})`);
        g.addColorStop(0.45, "rgba(210, 82, 34, 0.24)");
        g.addColorStop(0.8, "rgba(74, 22, 12, 0.14)");
        g.addColorStop(1, "rgba(20, 8, 4, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (h.kind === "mire") {
        const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r);
        g.addColorStop(0, "rgba(82, 136, 124, 0.3)");
        g.addColorStop(0.6, "rgba(56, 72, 54, 0.2)");
        g.addColorStop(1, "rgba(20, 24, 18, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawRiftPath() {
    ensureTerrainCache();
    if (terrainCanvas) {
      ctx.drawImage(terrainCanvas, 0, 0, state.w, state.h);
    }
    drawAmbientEmbers();
    drawHazards();
    if (!state.path) return;
    const lanes = (state.path.lanes && state.path.lanes.length) ? state.path.lanes : [state.path];
    const spawnPts = state.path.spawns || lanes.map((l) => l.points[0]);
    spawnPts.forEach((p, i) => drawSpawnPortal(p, i, spawnPts.length));
    const exit = state.path.exit || (lanes[0] && lanes[0].points[lanes[0].points.length - 1]);
    drawExitRift(exit);
  }

  function drawGhostPlacement() {
    if (state.armedAbility === "meteor" && state.ghost) {
      const { x, y } = state.ghost;
      const rad = ABILITY_DEF.meteor.radius;
      const pulse = 0.5 + 0.5 * Math.sin(state.time * 9);
      ctx.save();
      const fill = ctx.createRadialGradient(x, y, 4, x, y, rad);
      fill.addColorStop(0, `rgba(255, 204, 102, ${0.32 + pulse * 0.14})`);
      fill.addColorStop(0.65, "rgba(232, 90, 42, 0.18)");
      fill.addColorStop(1, "rgba(232, 90, 42, 0)");
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255, 184, 84, 0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y);
      ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const moving = state.movingTower != null ? state.towers[state.movingTower] : null;
    if (!state.ghost || (!state.selectedTower && !moving) || !state.path) return;
    const { x, y, ok } = state.ghost;
    const ghostType = moving ? moving.type : state.selectedTower;
    const stats = moving || towerStats(ghostType);
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.beginPath();
    ctx.arc(x, y, stats.range, 0, Math.PI * 2);
    ctx.fillStyle = ok ? "rgba(255, 184, 84, 0.06)" : "rgba(232, 93, 76, 0.07)";
    ctx.fill();
    ctx.strokeStyle = ok ? "rgba(255,184,84,0.75)" : "rgba(232,93,76,0.75)";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // Footprint disk — red when overlapping road/rocks
    ctx.save();
    ctx.fillStyle = ok ? "rgba(111,191,138,0.16)" : "rgba(232,93,76,0.24)";
    ctx.strokeStyle = ok ? "rgba(111,191,138,0.65)" : "rgba(232,93,76,0.9)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(x, y, TOWER_PLACE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // Mini tower silhouette instead of flat disk
    ctx.save();
    ctx.globalAlpha = ok ? 0.65 : 0.35;
    ctx.translate(x, y);
    ctx.scale(0.92, 0.92);
    drawTower({
      x: 0, y: 0, type: ghostType, aim: moving ? moving.aim : -Math.PI / 2,
      recoil: 0, level: moving ? moving.level : 1, elements: moving ? (moving.elements || []) : [],
    }, false, false);
    ctx.restore();
    if (!ok) {
      ctx.save();
      ctx.strokeStyle = "rgba(232,93,76,0.95)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 9);
      ctx.lineTo(x + 9, y + 9);
      ctx.moveTo(x + 9, y - 9);
      ctx.lineTo(x - 9, y + 9);
      ctx.stroke();
      ctx.restore();
    }
  }


  function pulseSafe(e) {
    return Math.sin(state.time * 3 + (e.dist || 0) * 0.05) * 2;
  }

  function drawTower(t, selected, isMvp = false) {
    ctx.save();
    ctx.translate(t.x, t.y);
    const aim = typeof t.aim === "number" ? t.aim : -Math.PI / 2;
    const recoil = t.recoil || 0;
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 4 + t.x * 0.05);
    const idle = Math.sin(state.time * 2.4 + t.x * 0.04) * 0.5;
    const attack = recoil > 0.08;
    ctx.translate(0, idle * 0.2);
    ctx.scale(1.12, 1.12);

    if (isMvp) {
      // Crisp tiny golden crown floating above the battlefield MVP tower
      const cy = -24 + Math.sin(state.time * 3.6) * 1.1;
      ctx.save();
      ctx.fillStyle = "#ffd97d";
      ctx.strokeStyle = "#3a2208";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-5.5, cy + 4);
      ctx.lineTo(-6.5, cy - 2);
      ctx.lineTo(-2.5, cy + 1);
      ctx.lineTo(0, cy - 3.5);
      ctx.lineTo(2.5, cy + 1);
      ctx.lineTo(6.5, cy - 2);
      ctx.lineTo(5.5, cy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (state.surgeT > 0) {
      ctx.strokeStyle = `rgba(255, 206, 94, ${0.42 + pulse * 0.35})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 2, 22 + pulse * 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (selected) {
      ctx.strokeStyle = "rgba(255,184,84,0.95)";
      ctx.lineWidth = 2.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 26 + Math.sin(state.time * 5) * 1.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,184,84,0.22)";
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
    ctx.scale(1.22, 1.22);
    const flash = e.hitFlash > 0;
    const bob = Math.sin(state.time * (e.tags.includes("flying") ? 7 : 5) + e.dist * 0.08);
    const crawl = e.dist * 0.35;

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, e.r * 0.85, e.r * 0.9, e.r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    if (e.bountyTag) {
      ctx.strokeStyle = "rgba(255, 217, 125, 0.72)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 3.5 + Math.sin(state.time * 7 + e.id) * 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if ((e.plasmaMark || 0) > 0) {
      ctx.strokeStyle = "rgba(224, 195, 84, 0.75)";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 6.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
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
      ctx.translate(0, bob * 1.4);
      ctx.rotate(enemyHeading(e) + Math.PI / 2);
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
    const trailPct = Math.max(pct, Math.min(1, (e.hpTrail != null ? e.hpTrail : e.hp) / e.maxHp));
    const barW = Math.max(20, e.r * 1.65);
    const barY = -e.r - 11;
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    roundRect(-barW / 2, barY, barW, 4.4, 1.5); ctx.fill();
    if (trailPct > pct + 0.01) {
      ctx.fillStyle = "rgba(255,244,226,0.72)";
      roundRect(-barW / 2, barY, barW * trailPct, 4.4, 1.5); ctx.fill();
    }
    const hg = ctx.createLinearGradient(-barW / 2, 0, barW / 2, 0);
    hg.addColorStop(0, pct < 0.3 ? "#ee6450" : "#4a9a60");
    hg.addColorStop(1, pct < 0.3 ? "#ffb4ab" : "#6fbf8a");
    ctx.fillStyle = hg;
    roundRect(-barW / 2, barY, barW * pct, 4.4, 1.5); ctx.fill();

    // Element resist pips: filled square = resist, bright triangle = weak
    const resist = enemyResist(e);
    const pipEls = ELEMENT_IDS.filter((el) => {
      const v = resist[el];
      return v != null && (v <= 0.85 || v >= 1.15);
    });
    if (pipEls.length) {
      const pipGap = pipEls.length > 5 ? 7 : 8.5;
      const pipW = pipEls.length * pipGap;
      pipEls.forEach((el, i) => {
        const px = -pipW / 2 + i * pipGap + pipGap / 2;
        const py = barY - 6.5;
        const v = resist[el];
        ctx.save();
        ctx.fillStyle = ELEMENTS[el].color;
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1;
        ctx.globalAlpha = v <= 0.85 ? 1 : 0.92;
        ctx.beginPath();
        if (v <= 0.85) {
          roundRect(px - 2.8, py - 2.8, 5.6, 5.6, 1.4); ctx.fill(); ctx.stroke();
        } else {
          ctx.moveTo(px, py - 3.6);
          ctx.lineTo(px + 3.2, py + 2.4);
          ctx.lineTo(px - 3.2, py + 2.4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      });
    }

    if (e.shieldMax > 0 && e.shield > 0) {
      const sp = Math.max(0, e.shield / e.shieldMax);
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      roundRect(-barW / 2, barY - 4.5, barW, 2.5, 1); ctx.fill();
      ctx.fillStyle = "#d8d0c4";
      roundRect(-barW / 2, barY - 4.5, barW * sp, 2.5, 1); ctx.fill();
    }

    if (isBossEnemy(e)) {
      const tag = (e.label || "Boss").slice(0, 12);
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      const tw = Math.max(30, tag.length * 5.4);
      roundRect(-tw / 2, e.r + 3, tw, 11, 3); ctx.fill();
      ctx.fillStyle = "#ffb854";
      ctx.font = "800 8px Bricolage Grotesque, Avenir Next, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const suffix = (e.bossTotal || 1) > 1 ? ` ${(e.bossIndex || 0) + 1}/${e.bossTotal}` : "";
      ctx.fillText(tag + suffix, 0, e.r + 8.5);
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

    drawRiftPath();
    drawGhostPlacement();

    let mvpIdx = -1, mvpDmg = 150;
    for (let i = 0; i < state.towers.length; i++) {
      const d = state.towers[i].totalDmg || 0;
      if (d > mvpDmg) { mvpDmg = d; mvpIdx = i; }
    }
    for (let i = 0; i < state.towers.length; i++) {
      const t = state.towers[i];
      if (state.selectedBuilt === i) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 184, 84, 0.05)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 184, 84, 0.36)";
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      if (state.movingTower === i) {
        ctx.save();
        ctx.globalAlpha = 0.38;
        drawTower(t, false, false);
        ctx.restore();
      } else {
        drawTower(t, state.selectedBuilt === i, i === mvpIdx);
      }
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
        // Soft ground target shadow
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${0.25 + u * 0.25})`;
        ctx.beginPath();
        ctx.ellipse(x, y + 3, 5 + u * 3, 2.5 + u * 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        const arc = Math.sin(u * Math.PI) * 38;
        const sy = y - arc;
        const glow = ctx.createRadialGradient(x, sy, 0, x, sy, 10);
        glow.addColorStop(0, "#fff8d8");
        glow.addColorStop(0.35, p.color);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(x, sy, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(x, sy, 4.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.72)";
        ctx.beginPath(); ctx.arc(x - 1.2, sy - 1.4, 1.8, 0, Math.PI * 2); ctx.fill();
      } else {
        const ang = Math.atan2(y - p.y, x - p.x);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3.2;
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
        // Soft quick kill flash (no expanding wireframe circle!)
        const pAlpha = Math.min(0.32, a * 0.85);
        const pr = 6 + (0.4 - Math.min(0.4, a)) * 14;
        ctx.globalAlpha = pAlpha;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(f.x, f.y, pr, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.kind === "blast") {
        // Pure soft radial impact glow (zero distracting wireframe circle outlines!)
        const dur = 0.32;
        const p = 1 - Math.min(1, a / dur);
        const rr = Math.max(6, (f.r || 32) * (0.35 + p * 0.65));
        const g = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, rr);
        g.addColorStop(0, f.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = Math.min(0.28, a * 0.8);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.kind === "ring") {
        const r0 = f.r0 || 0;
        const r1 = f.r1 || f.r || 40;
        const rr = r0 + (r1 - r0) * (1 - Math.min(1, a / 0.5));
        ctx.globalAlpha = Math.min(0.38, a * 0.85);
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 1.35;
        ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === "beam") {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (f.arc) {
          // Jagged electric lightning arc for Coil & Arc combos!
          const segs = 5;
          const dx = f.x2 - f.x, dy = f.y2 - f.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const buildPath = () => {
            ctx.beginPath();
            ctx.moveTo(f.x, f.y);
            for (let s = 1; s < segs; s++) {
              const t = s / segs;
              const j = (Math.sin(state.time * 70 + s * 3.7 + f.x) * 6.5);
              ctx.lineTo(f.x + dx * t + nx * j, f.y + dy * t + ny * j);
            }
            ctx.lineTo(f.x2, f.y2);
          };
          ctx.globalAlpha = Math.min(0.45, a * 4);
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 5;
          buildPath(); ctx.stroke();
          ctx.globalAlpha = Math.min(1, a * 9);
          ctx.strokeStyle = "#f2ffff";
          ctx.lineWidth = 1.8;
          buildPath(); ctx.stroke();
        } else if (f.rail) {
          // Glowing dual-layer rail beam for Spire!
          ctx.globalAlpha = Math.min(0.42, a * 3);
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 7;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
          ctx.globalAlpha = Math.min(1, a * 7);
          ctx.strokeStyle = "#fff6dc";
          ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        } else {
          ctx.globalAlpha = Math.min(1, a * 8);
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
        }
        ctx.restore();
      } else if (f.kind === "place") {
        ctx.globalAlpha = a * 2; ctx.strokeStyle = f.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, 18 + (0.5 - a) * 40, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === "text") {
        const sc = f.scale || 1;
        const px = Math.round(11.5 * sc * 10) / 10;
        ctx.globalAlpha = Math.min(1, a * 2.8);
        ctx.font = `800 ${px}px Bricolage Grotesque, Avenir Next, sans-serif`;
        ctx.textAlign = "center";
        const ty = f.y - (0.55 - a) * (20 + sc * 5);
        ctx.fillStyle = "rgba(10,8,6,0.82)";
        ctx.fillText(f.text, f.x + 1, ty + 1.2);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, ty);
        ctx.globalAlpha = 1;
      } else if (f.kind === "leak") {
        ctx.globalAlpha = a; ctx.fillStyle = "rgba(232,93,76,0.28)";
        ctx.fillRect(-ox, -oy, w + 20, h + 20); ctx.globalAlpha = 1;
      }
    }

    if (state.flash > 0 && settings.screenFlash !== false) {
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.38, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
      vg.addColorStop(0, "rgba(232,93,76,0)");
      vg.addColorStop(1, `rgba(232,93,76,${Math.min(0.28, state.flash * 1.35).toFixed(3)})`);
      ctx.fillStyle = vg;
      ctx.fillRect(-ox, -oy, w + 20, h + 20);
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
  function placementOk(x, y, ignoreIdx = -1) {
    if (!state.path) return false;
    // Reject when the tower disk would overlap painted road (center clearance = roadHalf + footprint).
    if (distToPathNetwork(state.path, x, y) < pathPlacementClear()) return false;
    if (hitsObstacle(x, y, TOWER_PLACE_R)) return false;
    if (x < 16 || y < 16 || x > state.w - 16 || y > state.h - 16) return false;
    for (let i = 0; i < state.towers.length; i++) {
      if (i === ignoreIdx) continue;
      const t = state.towers[i];
      if (Math.hypot(t.x - x, t.y - y) < TOWER_PLACE_R * 2) return false;
    }
    return true;
  }

  // Gentle magnetic nudge so placing inside road turns or beside towers nestles into the nearest valid pocket.
  function resolvePlacement(x, y, ignoreIdx = -1) {
    if (placementOk(x, y, ignoreIdx)) return { x, y, ok: true };
    const radii = [5, 10, 15];
    const steps = 12;
    for (const r of radii) {
      let best = null;
      let bestDist = Infinity;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const nx = x + Math.cos(a) * r;
        const ny = y + Math.sin(a) * r;
        if (placementOk(nx, ny, ignoreIdx)) {
          const d = Math.hypot(nx - x, ny - y);
          if (d < bestDist) {
            bestDist = d;
            best = { x: nx, y: ny, ok: true };
          }
        }
      }
      if (best) return best;
    }
    return { x, y, ok: false };
  }

  const TOWER_HIT_R = 22;

  function onCanvasPointerDown(evt) {
    if (state.mode !== "playing") return;
    evt.preventDefault();
    ensureAudio();
    syncMusic();
    const { x, y, clientX, clientY } = canvasPos(evt);

    if (state.armedAbility === "meteor") {
      placePtr = { id: evt.pointerId, x0: clientX, y0: clientY, x, y, dragged: false, ability: "meteor" };
      state.ghost = { x, y, ok: true };
      try { canvas.setPointerCapture(evt.pointerId); } catch { /* */ }
      return;
    }

    if (state.movingTower != null) {
      const snap = resolvePlacement(x, y, state.movingTower);
      placePtr = { id: evt.pointerId, x0: clientX, y0: clientY, x: snap.x, y: snap.y, dragged: false, moving: state.movingTower };
      state.ghost = snap;
      try { canvas.setPointerCapture(evt.pointerId); } catch { /* */ }
      updateHUD();
      return;
    }

    const hitR = state.selectedTower ? 14 : TOWER_HIT_R;
    for (let i = state.towers.length - 1; i >= 0; i--) {
      const t = state.towers[i];
      if (Math.hypot(t.x - x, t.y - y) < hitR) {
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
      const snap = resolvePlacement(x, y);
      placePtr = {
        id: evt.pointerId,
        x0: clientX, y0: clientY,
        x: snap.x, y: snap.y,
        dragged: false,
      };
      state.ghost = snap;
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
    if (placePtr && placePtr.id === evt.pointerId) {
      const { x, y, clientX, clientY } = canvasPos(evt);
      if (Math.hypot(clientX - placePtr.x0, clientY - placePtr.y0) > 10) placePtr.dragged = true;
      if (placePtr.ability === "meteor") {
        placePtr.x = x; placePtr.y = y;
        state.ghost = { x, y, ok: true };
      } else if (placePtr.moving != null) {
        const snap = resolvePlacement(x, y, placePtr.moving);
        placePtr.x = snap.x; placePtr.y = snap.y;
        state.ghost = snap;
      } else if (state.selectedTower) {
        const snap = resolvePlacement(x, y);
        placePtr.x = snap.x; placePtr.y = snap.y;
        state.ghost = snap;
      }
      return;
    }
    if (state.armedAbility === "meteor") {
      if (evt.pointerType === "mouse") {
        const { x, y } = canvasPos(evt);
        state.ghost = { x, y, ok: true };
      }
      return;
    }
    if (state.movingTower != null) {
      if (evt.pointerType === "mouse") {
        const { x, y } = canvasPos(evt);
        state.ghost = resolvePlacement(x, y, state.movingTower);
      }
      return;
    }
    if (!state.selectedTower) { state.ghost = null; return; }
    if (evt.pointerType === "mouse") {
      const { x, y } = canvasPos(evt);
      state.ghost = resolvePlacement(x, y);
    }
  }

  function finishPlacePointer(evt, canceled) {
    if (!placePtr || placePtr.id !== evt.pointerId) return;
    const isMeteor = placePtr.ability === "meteor";
    const movingIdx = placePtr.moving != null ? placePtr.moving : null;
    const { x, y } = state.ghost || placePtr;
    placePtr = null;
    try { canvas.releasePointerCapture(evt.pointerId); } catch { /* */ }
    if (isMeteor) {
      if (!canceled && state.armedAbility === "meteor") {
        fireMeteorAt(x, y);
      } else {
        state.ghost = null;
      }
      updateHUD();
      return;
    }
    if (movingIdx != null) {
      const snap = !canceled ? resolvePlacement(x, y, movingIdx) : { x, y, ok: false };
      state.ghost = null;
      if (snap.ok) {
        moveTowerTo(movingIdx, snap.x, snap.y);
      } else if (!canceled) {
        toast("Invalid — keep off the road & rocks");
      }
      updateHUD();
      return;
    }
    const snap = !canceled && state.selectedTower ? resolvePlacement(x, y) : { x, y, ok: false };
    if (snap.ok) {
      placeTower(snap.x, snap.y);
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
      state.armedAbility = null;
      state.movingTower = null;
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
  if (els.btnNextWave) {
    els.btnNextWave.addEventListener("click", () => {
      ensureAudio();
      callNextWaveEarly();
    });
  }
  if (els.btnMeteor) {
    els.btnMeteor.addEventListener("click", () => {
      ensureAudio();
      armMeteor();
    });
  }
  if (els.btnSurge) {
    els.btnSurge.addEventListener("click", () => {
      ensureAudio();
      triggerSurge();
    });
  }
  if (els.btnNova) {
    els.btnNova.addEventListener("click", () => {
      ensureAudio();
      triggerNova();
    });
  }
  if (els.btnRelicReroll) {
    els.btnRelicReroll.addEventListener("click", () => {
      ensureAudio();
      rerollRelicDraft();
    });
  }
  if (els.btnRelicSalvage) {
    els.btnRelicSalvage.addEventListener("click", () => {
      ensureAudio();
      salvageRelicDraft();
    });
  }
  if (els.btnMove) {
    els.btnMove.addEventListener("click", () => {
      ensureAudio();
      startMoveTower();
    });
  }
  if (els.btnTargetMode) {
    els.btnTargetMode.addEventListener("click", () => {
      if (state.selectedBuilt == null) return;
      const t = state.towers[state.selectedBuilt];
      const idx = TARGET_MODES.indexOf(t.targetMode || "first");
      t.targetMode = TARGET_MODES[(idx + 1) % TARGET_MODES.length];
      sfx.ui();
      toast(`Target: ${TARGET_LABELS[t.targetMode]}`);
      updateHUD();
      saveRun();
    });
  }
  if (els.btnInspectClose) {
    els.btnInspectClose.addEventListener("click", () => {
      state.selectedBuilt = null;
      sfx.ui();
      updateHUD();
    });
  }
  document.addEventListener("keydown", (evt) => {
    if (evt.metaKey || evt.ctrlKey || evt.altKey) return;
    const tag = (evt.target && evt.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const k = evt.key.toLowerCase();
    if (evt.key === "Escape") {
      if (state.selectedTower || state.armedAbility || state.movingTower != null) { cancelPlacement(false); return; }
      if (state.selectedBuilt != null) { state.selectedBuilt = null; updateHUD(); return; }
      if (state.mode === "playing") { state.mode = "paused"; saveRun(); showScreen("pause"); return; }
      if (state.mode === "paused") { state.mode = "playing"; showScreen(null); syncStartBtn(); return; }
      return;
    }
    if (k === "p" && (state.mode === "playing" || state.mode === "paused")) {
      evt.preventDefault();
      els.btnPause.click();
      return;
    }
    if (k === "m") {
      els.btnMute.click();
      return;
    }
    if (state.mode !== "playing") return;
    if (k === "1" || k === "2" || k === "3" || k === "4") {
      const types = ["turret", "mortar", "coil", "spire"];
      const btn = document.querySelector(`.tower-btn[data-tower="${types[Number(k) - 1]}"]`);
      if (btn) btn.click();
    } else if (k === "q") {
      ensureAudio(); armMeteor();
    } else if (k === "w") {
      ensureAudio(); triggerSurge();
    } else if (k === "e") {
      ensureAudio(); triggerNova();
    } else if (k === "f") {
      ensureAudio(); cycleSpeed();
    } else if (evt.key === " ") {
      evt.preventDefault();
      ensureAudio();
      if (state.awaitingStart) playerStartWaves();
      else if (canCallNextWave()) callNextWaveEarly();
    } else if (k === "g") {
      settings.autoWave = !settings.autoWave;
      saveSettings();
      const cb = $("opt-autowave");
      if (cb) cb.checked = settings.autoWave;
      sfx.ui();
      toast(settings.autoWave ? "Auto-send waves on" : "Auto-send waves off");
    } else if (k === "a") {
      autoLevelAllTowers();
    } else if (state.selectedBuilt != null) {
      if (k === "u") els.btnUpgrade.click();
      else if (k === "t" && els.btnTargetMode) els.btnTargetMode.click();
      else if (k === "v" && els.btnMove) startMoveTower();
      else if (k === "x" || evt.key === "Delete" || evt.key === "Backspace") {
        evt.preventDefault();
        els.btnSell.click();
      }
    }
  });

  document.querySelectorAll(".el-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.selectedBuilt == null || state.mode !== "playing") return;
      const t = state.towers[state.selectedBuilt];
      const el = btn.dataset.el;
      if (!t.elements) t.elements = [];
      if (t.elements.includes(el)) return;
      if (t.elements.length >= MAX_ELEMENTS) { toast("Max 2 elements"); return; }
      const cost = elementCost(t, el);
      if (state.scrap < cost) { toast(`Need ${cost} scrap`); return; }
      state.scrap -= cost;
      t.investedScrap = (t.investedScrap || towerStats(t.type).cost) + cost;
      t.elements.push(el);
      burstPlace(t.x, t.y, ELEMENTS[el].color);
      const combo = describeCombo(t.elements);
      toast(combo);
      if (t.elements.length >= 2) {
        const short = COMBO_SHORT[comboKey(t.elements)] || "COMBO";
        state.fx.push({ kind: "text", x: t.x, y: t.y - 28, t: 0.9, text: `${short}!`, color: ELEMENTS[el].color, scale: 1.24 });
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
    state.scrap += towerSellValue(t);
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
    if (state.pendingRelicDraft) { openRelicDraft({ silent: true }); return; }
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
  if ($("btn-respec")) $("btn-respec").addEventListener("click", respecForge);
  if ($("btn-codex")) $("btn-codex").addEventListener("click", () => openCodex("hub"));
  if ($("btn-pause-codex")) $("btn-pause-codex").addEventListener("click", () => openCodex("pause"));
  if ($("btn-codex-back")) $("btn-codex-back").addEventListener("click", closeCodex);
  document.querySelectorAll(".codex-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      codexTab = btn.dataset.codex || "combos";
      renderCodex();
      sfx.ui();
    });
  });
  if ($("btn-settings")) $("btn-settings").addEventListener("click", () => openSettings("hub"));
  if ($("btn-pause-settings")) $("btn-pause-settings").addEventListener("click", () => openSettings("pause"));
  if ($("btn-settings-back")) {
    $("btn-settings-back").addEventListener("click", () => {
      const box = $("reset-confirm-box");
      if (box) box.classList.add("hidden");
      closeSettings();
    });
  }
  if ($("btn-reset-progress")) {
    $("btn-reset-progress").addEventListener("click", () => {
      const box = $("reset-confirm-box");
      if (box) {
        box.classList.remove("hidden");
        box.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      sfx.ui();
    });
  }
  if ($("btn-reset-cancel")) {
    $("btn-reset-cancel").addEventListener("click", () => {
      const box = $("reset-confirm-box");
      if (box) box.classList.add("hidden");
      sfx.cancel();
    });
  }
  if ($("btn-reset-confirm")) {
    $("btn-reset-confirm").addEventListener("click", () => resetAllProgress());
  }
  $("btn-to-hub").addEventListener("click", () => { saveRun(); state.mode = "hub"; showScreen("hub"); refreshHub(); hideCoach(false); });
  $("btn-abandon").addEventListener("click", () => endRun(true));
  $("btn-again").addEventListener("click", () => {
    clearRun();
    resize();
    if (state.lastRunWasDaily) {
      startNewRun({ daily: true, dailyKey: dailyKey() });
      toast("Daily rift · " + dailyKey());
    } else {
      startNewRun();
    }
  });
  if (els.btnOverForge) {
    els.btnOverForge.addEventListener("click", () => {
      state.mode = "hub";
      showScreen("upgrades");
      renderUpgrades();
      sfx.ui();
    });
  }
  $("btn-over-hub").addEventListener("click", () => { state.mode = "hub"; showScreen("hub"); refreshHub(); });
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => { upgradeTab = tab.dataset.tab; renderUpgrades(); sfx.ui(); });
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
    if (els.upgrades && !els.upgrades.classList.contains("hidden")) scheduleTreeConnectors();
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
    ELEMENTS, RELICS, settings, sfx, DAILY, BALANCE, DIFFICULTIES,
    openRelicDraft, resetAllProgress, respecForge, fireMeteorAt, triggerSurge, callNextWaveEarly,
  };
})();
