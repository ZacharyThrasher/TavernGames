/**
 * Tavern Twenty-One — Headless Game Engine
 * 
 * A complete reimplementation of the Tavern 21 game loop that runs
 * without Foundry VTT. Designed for AI agents to playtest, evaluate,
 * and iterate on game design.
 * 
 * This engine faithfully reproduces:
 *   - Opening phase (2×d10: one visible, one hole)
 *   - The Cut (lowest visible gets to reroll hole die)
 *   - Betting phase (buy dice, roll, hold, fold)
 *   - Skills (Goad, Bump, Cheat, Hunch, Profile)
 *   - The Staredown (accusations)
 *   - Duels (tied winners clash)
 *   - Side Bets
 *   - Goblin Mode (stage-based, d20→d12→d10→d8→d6→d4→coin)
 *   - Wallets, antes, cleaning fees
 */

// ─── Dice ──────────────────────────────────────────────────────────
export function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollD20() { return rollDie(20); }

// ─── Constants (mirroring constants.js) ────────────────────────────
export const VALID_DICE = [4, 6, 8, 10, 20];
export const GOBLIN_STAGE_DICE = [20, 12, 10, 8, 6, 4];
export const GOBLIN_DICE = [...GOBLIN_STAGE_DICE, 2];
export const HUNCH_DC = 12;
export const HUNCH_THRESHOLDS = { 2: 1, 4: 2, 6: 3, 8: 4, 10: 5, 20: 10 };
export const DIE_COST_MULTIPLIERS = { 4: 2, 6: 1, 8: 1, 10: 0.5, 20: 0.5 };
export const ACCUSATION_COST_MULTIPLIER = 2;
export const ACCUSATION_BOUNTY_MULTIPLIER = 5;
export const DEFAULT_BUST_LIMIT = 21;
export const TAVERN_EVENTS = [
  {
    id: "lucky_stars",
    name: "Lucky Stars Align",
    description: "Fortune favors intuition. Hunch and Profile checks gain +1.",
    hunchBonus: 1,
    profileBonus: 1,
  },
  {
    id: "brawlers_night",
    name: "Brawler's Night",
    description: "Goad and Bump checks gain +2.",
    goadBonus: 2,
    bumpBonus: 2,
  },
  {
    id: "oracle_whispers",
    name: "Oracle's Whispers",
    description: "Hunch and Profile checks gain +2.",
    hunchBonus: 2,
    profileBonus: 2,
  },
  {
    id: "thieves_guild",
    name: "Thieves' Guild Presence",
    description: "Cheat checks gain +2, but accusations cost more.",
    cheatBonus: 2,
    accusationCostMultiplier: 2.5,
  },
  {
    id: "city_watch",
    name: "City Watch Patrol",
    description: "Cheat checks suffer -2, but accusations are cheaper and pay better.",
    cheatBonus: -2,
    accusationCostMultiplier: 1.25,
    accusationBountyMultiplier: 6,
  },
  {
    id: "happy_hour",
    name: "Happy Hour Blessing",
    description: "d4/d6 are 1gp cheaper and drinks grant extra courage.",
    dieCostDelta: { 4: -1, 6: -1 },
    drinkCourageBonus: 1,
  },
];

export function getDieCost(die, ante) {
  const multiplier = DIE_COST_MULTIPLIERS[die] ?? 1;
  return Math.floor(ante * multiplier);
}

export function getAllowedDice(gameMode = "standard") {
  return gameMode === "goblin" ? GOBLIN_DICE : VALID_DICE;
}

// ─── Pure Rules (mirroring pure-rules.js) ──────────────────────────
export function calculateStandardTotal(rolls) {
  if (!Array.isArray(rolls)) return 0;
  return rolls.reduce((sum, r) => sum + Number(r?.result ?? 0), 0);
}

export function calculateVisibleTotal(rolls) {
  if (!Array.isArray(rolls)) return 0;
  return rolls.reduce((sum, r) => {
    const isPublic = r?.public ?? true;
    const isBlind = r?.blind ?? false;
    return isPublic && !isBlind ? sum + Number(r?.result ?? 0) : sum;
  }, 0);
}

export function resolveContest({ attackerTotal, defenderTotal, isNat1 = false }) {
  const success = !isNat1 && attackerTotal > defenderTotal;
  return { success, outcome: success ? "success" : "failure" };
}

export function classifyHunchPrediction(die, value, thresholds = HUNCH_THRESHOLDS) {
  const threshold = Number(thresholds?.[die] ?? Math.floor(Number(die) / 2));
  return Number(value) > threshold ? "HIGH" : "LOW";
}

export function calculateBettingOrderByVisibleTotals(turnOrder, visibleTotals) {
  return [...turnOrder].sort((a, b) => {
    const totalA = Number(visibleTotals?.[a] ?? 0);
    const totalB = Number(visibleTotals?.[b] ?? 0);
    return totalA - totalB;
  });
}

// ─── Event Log ─────────────────────────────────────────────────────
export class EventLog {
  constructor(verbose = false) {
    this.entries = [];
    this.verbose = verbose;
  }
  log(type, message, data = {}) {
    const entry = { type, message, ...data, timestamp: Date.now() };
    this.entries.push(entry);
    if (this.verbose) {
      console.log(`  [${type}] ${message}`);
    }
  }
  getByType(type) {
    return this.entries.filter(e => e.type === type);
  }
}

// ─── Player Wallet ─────────────────────────────────────────────────
export class PlayerWallet {
  constructor(initialGold = 100) {
    this.gold = initialGold;
    this.initialGold = initialGold;
    this.totalWon = 0;
    this.totalLost = 0;
  }
  canAfford(amount) { return this.gold >= amount; }
  deduct(amount) {
    if (!this.canAfford(amount)) return false;
    this.gold -= amount;
    this.totalLost += amount;
    return true;
  }
  add(amount) {
    this.gold += amount;
    this.totalWon += amount;
  }
  get net() { return this.gold - this.initialGold; }
}

// ─── Simulated Player ──────────────────────────────────────────────
export class SimPlayer {
  constructor(id, name, stats = {}) {
    this.id = id;
    this.name = name;
    // D&D-style ability modifiers for skill checks
    this.stats = {
      str: stats.str ?? 0,
      dex: stats.dex ?? 0,
      con: stats.con ?? 0,
      int: stats.int ?? 0,
      wis: stats.wis ?? 0,
      cha: stats.cha ?? 0,
      // Skill proficiencies (bonus on top of ability mod)
      sleightOfHand: stats.sleightOfHand ?? 0,   // DEX + prof
      intimidation: stats.intimidation ?? 0,       // CHA + prof
      persuasion: stats.persuasion ?? 0,           // CHA + prof
      insight: stats.insight ?? 0,                 // WIS + prof
      investigation: stats.investigation ?? 0,     // INT + prof
      deception: stats.deception ?? 0,             // CHA + prof
    };
    this.wallet = new PlayerWallet(stats.startingGold ?? 100);
  }
  getMod(ability) { return this.stats[ability] ?? 0; }
  getSkillMod(skill) {
    const skillToAbility = {
      sleightOfHand: "dex", intimidation: "cha", persuasion: "cha",
      insight: "wis", investigation: "int", deception: "cha",
    };
    const ability = skillToAbility[skill] ?? "cha";
    return this.getMod(ability) + (this.stats[skill] ?? 0);
  }
}

// ─── Table Data Factory ────────────────────────────────────────────
export function emptyTableData() {
  return {
    totals: {}, visibleTotals: {}, rolls: {}, rolling: {},
    holds: {}, busts: {}, folded: {}, foldedEarly: {},
    bettingOrder: null, currentPlayer: null,
    phase: "opening", gameMode: "standard",
    // Skills
    cheaters: {}, caught: {}, disqualified: {},
    goadedThisRound: {}, goadBackfire: {},
    bumpedThisRound: {}, pendingBumpRetaliation: null,
    cleaningFees: {}, profiledBy: {},
    drinkCount: {}, sloppy: {},
    liquidCourage: {},
    playerHeat: {}, cheatsThisRound: 0,
    hasActed: {},
    hunchPrediction: {}, hunchRolls: {}, hunchLocked: {},
    hunchLockedDie: {}, hunchExact: {},
    blindNextRoll: {}, blindDice: {},
    dared: {},
    accusedThisRound: {},
    usedSkills: {}, skillUsedThisTurn: false, lastSkillUsed: null,
    // Side bets
    sideBets: {}, sideBetPool: 0, sideBetRound: 1,
    sideBetRoundStart: null, sideBetWinners: {},
    // The Cut
    hitCount: {}, theCutPlayer: null, theCutUsed: false,
    // Duel
    duel: null,
    // Goblin
    usedDice: {}, goblinSetProgress: {},
    goblinFinalActive: false, goblinFinalTargetId: null,
    goblinFinalTargetScore: null, goblinFinalRemaining: [],
    goblinSuddenDeathActive: false, goblinSuddenDeathParticipants: [],
    goblinSuddenDeathRemaining: [],
    goblinStageIndex: 0, goblinStageDie: 20, goblinStageRemaining: [],
    goblinBoots: {}, goblinHoldStage: {},
    // Round flavor
    roundEvent: null,
    heroicSaveAvailable: {},
    heroicSaveUsed: {},
    // System
    houseRules: { startingHeat: 10 }, heatDC: 10,
    pendingAction: null, pendingBust: null,
  };
}

// ════════════════════════════════════════════════════════════════════
//  HEADLESS GAME ENGINE
// ════════════════════════════════════════════════════════════════════
export class HeadlessEngine {
  /**
   * @param {Object} options
   * @param {SimPlayer[]} options.players - Array of SimPlayers
   * @param {number} options.ante - Ante amount (default 5)
   * @param {string} options.gameMode - "standard" or "goblin"
   * @param {boolean} options.verbose - Print events to console
   * @param {number} options.startingHeat - Initial heat DC (default 10)
   */
  constructor(options = {}) {
    const players = options.players ?? [];
    if (players.length < 2) throw new Error("Need at least 2 players");

    this.players = new Map(players.map(p => [p.id, p]));
    this.ante = options.ante ?? 5;
    this.gameMode = options.gameMode ?? "standard";
    this.verbose = options.verbose ?? false;
    this.startingHeat = options.startingHeat ?? 10;

    // Game state
    this.status = "LOBBY";
    this.pot = 0;
    this.baseTurnOrder = players.map(p => p.id);
    this.turnOrder = [...this.baseTurnOrder];
    this.tableData = emptyTableData();
    this.tableData.gameMode = this.gameMode;
    this.log = new EventLog(this.verbose);
    this.roundNumber = 0;

    // Metrics
    this.metrics = {
      totalRounds: 0,
      skillsUsed: { goad: 0, bump: 0, cheat: 0, hunch: 0, profile: 0 },
      cheatsAttempted: 0, cheatsSucceeded: 0, cheatsCaught: 0,
      accusations: 0, accusationsCorrect: 0,
      drinks: 0,
      heroicSaves: 0,
      busts: 0, folds: 0, holds: 0,
      duels: 0, nat20s: 0, nat1s: 0,
      closestFinish: Infinity, // smallest margin of victory
      biggestPot: 0,
      tavernEvents: {},
      winsByPlayer: {},
      goldByPlayer: {},
      roundLengths: [], // number of rolls per round
    };
  }

  getPlayer(id) { return this.players.get(id); }

  // ─── STANDARD MODE: Start Round ──────────────────────────────────
  startRound() {
    this.roundNumber++;
    this.metrics.totalRounds++;
    this.status = "PLAYING";
    if (this.baseTurnOrder.length > 0) {
      const offset = (this.roundNumber - 1) % this.baseTurnOrder.length;
      this.turnOrder = [
        ...this.baseTurnOrder.slice(offset),
        ...this.baseTurnOrder.slice(0, offset),
      ];
    }
    this.tableData = emptyTableData();
    this.tableData.gameMode = this.gameMode;
    this.pot = 0;

    const td = this.tableData;

    // Deduct antes
    for (const id of this.turnOrder) {
      const player = this.getPlayer(id);
      player.wallet.deduct(this.ante);
      this.pot += this.ante;
    }
    // House match (simulate house matching)
    this.pot *= 2;

    this.log.log("round_start", `Round ${this.roundNumber} started. Ante: ${this.ante}gp. Pot: ${this.pot}gp.`);

    // Initialize heat
    for (const id of this.turnOrder) {
      td.playerHeat[id] = this.startingHeat;
      td.heroicSaveAvailable[id] = true;
      td.heroicSaveUsed[id] = false;
    }

    td.roundEvent = this._rollTavernEvent();
    if (td.roundEvent) {
      const eventId = td.roundEvent.id;
      this.metrics.tavernEvents[eventId] = (this.metrics.tavernEvents[eventId] ?? 0) + 1;
      this.log.log("tavern_event", `${td.roundEvent.name}: ${td.roundEvent.description}`, { eventId });
    }

    this.metrics.biggestPot = Math.max(this.metrics.biggestPot, this.pot);

    if (this.gameMode === "goblin") {
      return this._startGoblinRound();
    }

    // Opening phase: deal 2×d10 per player (1 visible, 1 hole)
    let lowestVisible = Infinity;
    let cutPlayerId = null;

    for (const id of this.turnOrder) {
      const roll1 = rollDie(10); // visible
      const roll2 = rollDie(10); // hole
      td.rolls[id] = [
        { die: 10, result: roll1, public: true },
        { die: 10, result: roll2, public: false },
      ];
      td.totals[id] = roll1 + roll2;
      td.visibleTotals[id] = roll1;

      this.log.log("opening_roll", `${this.getPlayer(id).name} dealt: visible ${roll1}, hole ${roll2} (total: ${roll1 + roll2})`);

      if (roll1 < lowestVisible) {
        lowestVisible = roll1;
        cutPlayerId = id;
      }
    }

    td.bettingOrder = calculateBettingOrderByVisibleTotals(this.turnOrder, td.visibleTotals);
    td.theCutPlayer = cutPlayerId;
    td.theCutUsed = false;

    if (cutPlayerId && this.turnOrder.length > 1) {
      td.phase = "cut";
      td.currentPlayer = cutPlayerId;
      this.log.log("cut", `${this.getPlayer(cutPlayerId).name} has The Cut (lowest visible: ${lowestVisible})`);
    } else {
      td.phase = "betting";
      td.currentPlayer = td.bettingOrder.find(id => !td.busts[id]) ?? null;
      td.sideBetRound = 1;
      td.sideBetRoundStart = td.currentPlayer;
    }

    return this._getState();
  }

  // ─── The Cut ─────────────────────────────────────────────────────
  useCut(userId, reroll = false) {
    const td = this.tableData;
    if (td.phase !== "cut" || td.theCutPlayer !== userId) return this._getState();

    if (reroll) {
      const rolls = td.rolls[userId];
      const oldHole = rolls[1].result;
      const newHole = rollDie(10);
      rolls[1] = { ...rolls[1], result: newHole };
      td.totals[userId] = rolls[0].result + newHole;
      this.log.log("cut_reroll", `${this.getPlayer(userId).name} used The Cut: hole ${oldHole} → ${newHole}`);
    } else {
      this.log.log("cut_pass", `${this.getPlayer(userId).name} passed The Cut.`);
    }

    td.phase = "betting";
    td.theCutUsed = true;
    td.currentPlayer = td.bettingOrder.find(id => !td.busts[id]) ?? null;
    td.sideBetRound = 1;
    td.sideBetRoundStart = td.currentPlayer;

    return this._getState();
  }

  // ─── Roll (Standard Mode) ───────────────────────────────────────
  submitRoll(userId, die) {
    const td = this.tableData;
    if (this.status !== "PLAYING") return this._getState();
    if (td.currentPlayer !== userId) return this._getState();

    const allowed = getAllowedDice(this.gameMode);
    if (!allowed.includes(die)) return this._getState();

    if (this.gameMode === "goblin") {
      return this._submitGoblinRoll(userId, die);
    }

    // Check cost (modified by tavern event)
    const cost = this._getModifiedDieCost(die);
    const player = this.getPlayer(userId);
    if (cost > 0) {
      if (!player.wallet.deduct(cost)) return this._getState(); // can't afford
      this.pot += cost;
    }

    // Roll
    let forcedResult = null;
    if (td.hunchRolls?.[userId]?.[die] !== undefined) {
      forcedResult = td.hunchRolls[userId][die];
    }
    let result = forcedResult !== null ? forcedResult : rollDie(die);
    const naturalRoll = result;

    // Nat 20 on d20 = instant bust ceiling for the round
    if (die === 20 && naturalRoll === 20) {
      const bustLimit = this._getBustLimit();
      result = bustLimit - (td.totals[userId] ?? 0);
      this.metrics.nat20s++;
      this.log.log("nat20", `${player.name} rolled a NATURAL 20 on d20! Instant ${bustLimit}!`);
    }

    // Nat 1 = cleaning fee
    if (naturalRoll === 1) {
      this.metrics.nat1s++;
      td.cleaningFees[userId] = (td.cleaningFees[userId] ?? 0) + 1;
    }

    const isBlind = !!td.blindNextRoll?.[userId];
    if (isBlind) {
      delete td.blindNextRoll[userId];
      delete td.hunchLocked?.[userId];
      delete td.hunchLockedDie?.[userId];
    }

    const rolls = td.rolls[userId] ?? [];
    rolls.push({ die, result, public: true, blind: isBlind });
    td.rolls[userId] = rolls;
    td.totals[userId] = calculateStandardTotal(rolls);
    td.visibleTotals[userId] = calculateVisibleTotal(rolls);

    this.log.log("roll", `${player.name} rolled d${die} → ${result} (total: ${td.totals[userId]})`, {
      player: userId, die, result, total: td.totals[userId], cost
    });

    // Check bust / heroic save
    this._resolveBust(userId, "roll");

    // Clear forced conditions
    if (td.goadBackfire?.[userId]?.mustRoll) delete td.goadBackfire[userId];
    if (td.dared?.[userId]) delete td.dared[userId];
    if (td.hunchLocked?.[userId]) { delete td.hunchLocked[userId]; delete td.hunchLockedDie?.[userId]; }

    // Clear hunch data after use
    if (td.hunchRolls?.[userId] || td.hunchPrediction?.[userId]) {
      delete td.hunchPrediction?.[userId];
      delete td.hunchExact?.[userId];
      delete td.hunchRolls?.[userId];
    }

    td.hasActed[userId] = true;
    this._advanceTurn();
    return this._getState();
  }

  // ─── Hold ────────────────────────────────────────────────────────
  hold(userId) {
    const td = this.tableData;
    if (this.status !== "PLAYING") return this._getState();
    if (td.currentPlayer !== userId) return this._getState();
    if (td.holds[userId] || td.busts[userId] || td.folded?.[userId]) return this._getState();

    if (this.gameMode === "goblin") {
      return this._holdGoblin(userId);
    }

    // Can't hold if goaded
    if (td.goadBackfire?.[userId]?.mustRoll) return this._getState();

    td.holds[userId] = true;
    this.metrics.holds++;
    this.log.log("hold", `${this.getPlayer(userId).name} HOLDS at ${td.totals[userId]}`, {
      player: userId, total: td.totals[userId]
    });

    this._advanceTurn();
    return this._getState();
  }

  // ─── Fold ────────────────────────────────────────────────────────
  fold(userId) {
    const td = this.tableData;
    if (this.status !== "PLAYING") return this._getState();
    if (td.currentPlayer !== userId) return this._getState();
    if (td.holds[userId] || td.busts[userId] || td.folded?.[userId]) return this._getState();

    td.folded[userId] = true;
    if (!td.hasActed?.[userId]) td.foldedEarly[userId] = true;
    this.metrics.folds++;
    this.log.log("fold", `${this.getPlayer(userId).name} FOLDS.`, { player: userId });

    this._advanceTurn();
    return this._getState();
  }

  // ─── Drink (Tavern Action) ──────────────────────────────────────
  drink(userId) {
    const td = this.tableData;
    if (this.status !== "PLAYING" || td.phase !== "betting") return this._getState();
    if (td.currentPlayer !== userId) return this._getState();
    if (this.gameMode === "goblin") return this._getState();
    if (td.holds[userId] || td.busts[userId] || td.folded?.[userId]) return this._getState();

    const drinks = td.drinkCount[userId] ?? 0;
    if (drinks >= 3) return this._getState();

    const player = this.getPlayer(userId);
    const cost = this.ante;
    if (!player.wallet.canAfford(cost)) return this._getState();

    player.wallet.deduct(cost);
    this.pot += cost;
    this.metrics.drinks++;
    this.metrics.biggestPot = Math.max(this.metrics.biggestPot, this.pot);

    const nextDrinks = drinks + 1;
    td.drinkCount[userId] = nextDrinks;
    const courageGain = 1 + (td.roundEvent?.drinkCourageBonus ?? 0);
    td.liquidCourage[userId] = (td.liquidCourage[userId] ?? 0) + courageGain;

    if (nextDrinks >= 2) {
      td.sloppy[userId] = true;
      this.log.log("drink_sloppy", `${player.name} overdoes the drinks. Courage surges, but they get sloppy.`, {
        player: userId, drinks: nextDrinks, courage: td.liquidCourage[userId], cost
      });
    } else {
      this.log.log("drink", `${player.name} buys a drink and gains Liquid Courage (+${courageGain} to next skill check).`, {
        player: userId, drinks: nextDrinks, courage: td.liquidCourage[userId], cost
      });
    }

    td.hasActed[userId] = true;
    this._advanceTurn();
    return this._getState();
  }

  // ─── Skill: Cheat ───────────────────────────────────────────────
  cheat(userId, dieIndex, adjustment) {
    const td = this.tableData;
    if (this.status !== "PLAYING" || td.phase !== "betting") return this._getState();
    if (td.currentPlayer !== userId) return this._getState();
    if (td.skillUsedThisTurn) return this._getState();
    if (td.usedSkills?.[userId]?.cheat) return this._getState();
    if (this.gameMode === "goblin") return this._getState();

    const player = this.getPlayer(userId);
    const rolls = td.rolls[userId] ?? [];
    if (dieIndex < 0 || dieIndex >= rolls.length) return this._getState();

    this.metrics.skillsUsed.cheat++;
    this.metrics.cheatsAttempted++;

    // Sleight of Hand check vs heat DC
    const heatDC = td.playerHeat[userId] ?? 10;
    const d20 = rollD20();
    const sloppy = !!td.sloppy?.[userId];
    const rawRoll = sloppy ? Math.min(d20, rollD20()) : d20;
    const sleightMod = player.getSkillMod("sleightOfHand");
    const courageBonus = this._consumeLiquidCourage(userId);
    const eventBonus = this._getEventModifier("cheatBonus");
    const total = rawRoll + sleightMod + courageBonus + eventBonus;
    const isNat1 = rawRoll === 1;
    const isNat20 = rawRoll === 20;

    // Initialize cheater tracking
    if (!td.cheaters[userId]) td.cheaters[userId] = { cheats: [] };

    if (isNat1) {
      // Fumble: auto-caught, pay ante
      td.caught[userId] = true;
      player.wallet.deduct(this.ante);
      this.pot += this.ante;
      this.metrics.cheatsCaught++;
      td.cheaters[userId].cheats.push({ dieIndex, adjustment, fumbled: true, dc: heatDC, roll: total });
      this.log.log("cheat_fumble", `${player.name} fumbled their cheat! NAT 1! Auto-caught!`, { player: userId });
    } else if (isNat20 || total >= heatDC) {
      // Success
      const targetRoll = rolls[dieIndex];
      const maxVal = targetRoll.die;
      const oldVal = targetRoll.result;
      const newVal = Math.max(1, Math.min(maxVal, oldVal + adjustment));
      rolls[dieIndex] = { ...targetRoll, result: newVal };
      td.rolls[userId] = rolls;
      td.totals[userId] = calculateStandardTotal(rolls);
      td.visibleTotals[userId] = calculateVisibleTotal(rolls);
      this._resolveBust(userId, "cheat");

      const invisible = isNat20;
      if (!invisible) {
        td.playerHeat[userId] = heatDC + 2;
      }
      td.cheaters[userId].cheats.push({
        dieIndex, adjustment, fumbled: false, invisible,
        dc: heatDC, roll: total, oldValue: oldVal, newValue: newVal
      });
      this.metrics.cheatsSucceeded++;
      this.log.log("cheat_success", `${player.name} cheated: d${targetRoll.die} ${oldVal}→${newVal}${invisible ? " (invisible!)" : ""}`, {
        player: userId, oldVal, newVal, invisible
      });
    } else {
      // Fail (die NOT modified, heat still increases)
      td.playerHeat[userId] = heatDC + 2;
      td.cheaters[userId].cheats.push({ dieIndex, adjustment, fumbled: false, failed: true, dc: heatDC, roll: total });
      this.log.log("cheat_fail", `${player.name} failed to cheat (roll ${total} vs DC ${heatDC})`, { player: userId });
    }

    td.skillUsedThisTurn = true;
    td.lastSkillUsed = "cheat";
    td.usedSkills[userId] = { ...(td.usedSkills[userId] ?? {}), cheat: true };
    td.cheatsThisRound++;
    // Cheat auto-finishes turn in the real game
    this._advanceTurn();
    return this._getState();
  }

  // ─── Skill: Goad ────────────────────────────────────────────────
  goad(userId, targetId, attackerSkill = "intimidation") {
    const td = this.tableData;
    if (this.status !== "PLAYING" || td.phase !== "betting") return this._getState();
    if (td.currentPlayer !== userId) return this._getState();
    if (td.skillUsedThisTurn) return this._getState();
    if (td.usedSkills?.[userId]?.goad) return this._getState();
    if (this.gameMode === "goblin") return this._getState();
    if (!targetId || targetId === userId) return this._getState();
    if (td.busts?.[targetId] || td.folded?.[targetId] || td.sloppy?.[targetId]) return this._getState();

    const attacker = this.getPlayer(userId);
    const defender = this.getPlayer(targetId);
    if (!attacker || !defender) return this._getState();

    this.metrics.skillsUsed.goad++;

    // Attacker: Intimidation or Persuasion vs Defender: Insight
    const atkD20 = rollD20();
    const defD20 = rollD20();
    const atkSloppy = !!td.sloppy?.[userId];
    const defSloppy = !!td.sloppy?.[targetId];
    const atkRaw = atkSloppy ? Math.min(atkD20, rollD20()) : atkD20;
    const defRaw = defSloppy ? Math.min(defD20, rollD20()) : defD20;

    const skill = attackerSkill === "persuasion" ? "persuasion" : "intimidation";
    const courageBonus = this._consumeLiquidCourage(userId);
    const eventBonus = this._getEventModifier("goadBonus");
    const atkTotal = atkRaw + attacker.getSkillMod(skill) + courageBonus + eventBonus;
    const defTotal = defRaw + defender.getSkillMod("insight");
    const isNat1 = atkRaw === 1;
    const isNat20 = atkRaw === 20;

    td.goadedThisRound = { ...td.goadedThisRound, [userId]: targetId };

    if (isNat1) {
      // Backfire + locked into d20
      td.goadBackfire[userId] = { mustRoll: true, goadedBy: targetId, forceD20: true };
      if (td.holds[userId]) delete td.holds[userId];
      this.log.log("goad_nat1", `${attacker.name} goaded ${defender.name} but NAT 1! Backfire + locked into d20!`);
    } else if (isNat20 || atkTotal > defTotal) {
      // Success: target must roll
      const forceD20 = isNat20;
      td.goadBackfire[targetId] = { mustRoll: true, goadedBy: userId, forceD20 };
      if (td.holds[targetId]) delete td.holds[targetId];
      this.log.log("goad_success", `${attacker.name} goaded ${defender.name}! They must roll${forceD20 ? " a d20" : ""}.`);
    } else {
      // Failure: backfire on attacker
      td.goadBackfire[userId] = { mustRoll: true, goadedBy: targetId, forceD20: false };
      if (td.holds[userId]) delete td.holds[userId];
      this.log.log("goad_fail", `${attacker.name} failed to goad ${defender.name}. Backfire!`);
    }

    td.skillUsedThisTurn = true;
    td.lastSkillUsed = "goad";
    td.usedSkills[userId] = { ...(td.usedSkills[userId] ?? {}), goad: true };
    td.hasActed[userId] = true;
    this._advanceTurn();
    return this._getState();
  }

  // ─── Skill: Bump ────────────────────────────────────────────────
  bump(userId, targetId, dieIndex) {
    const td = this.tableData;
    if (this.status !== "PLAYING" || td.phase !== "betting") return this._getState();
    if (td.currentPlayer !== userId) return this._getState();
    if (td.skillUsedThisTurn) return this._getState();
    if (td.usedSkills?.[userId]?.bump) return this._getState();
    if (this.gameMode === "goblin") return this._getState();
    if (!targetId || targetId === userId) return this._getState();

    const attacker = this.getPlayer(userId);
    const defender = this.getPlayer(targetId);
    if (!attacker || !defender) return this._getState();

    const targetRolls = td.rolls[targetId] ?? [];
    if (dieIndex < 0 || dieIndex >= targetRolls.length) return this._getState();

    this.metrics.skillsUsed.bump++;

    const atkD20 = rollD20();
    const defD20 = rollD20();
    const atkSloppy = !!td.sloppy?.[userId];
    const defSloppy = !!td.sloppy?.[targetId];
    const atkRaw = atkSloppy ? Math.min(atkD20, rollD20()) : atkD20;
    const defRaw = defSloppy ? Math.min(defD20, rollD20()) : defD20;
    const courageBonus = this._consumeLiquidCourage(userId);
    const eventBonus = this._getEventModifier("bumpBonus");
    const atkTotal = atkRaw + attacker.getMod("str") + courageBonus + eventBonus;
    const defTotal = defRaw + defender.getMod("str");
    const isNat1 = atkRaw === 1;

    td.bumpedThisRound = { ...td.bumpedThisRound, [userId]: targetId };

    if (isNat1) {
      // Backfire + pay ante
      attacker.wallet.deduct(this.ante);
      this.pot += this.ante;
      // Defender gets to reroll one of attacker's dice (we'll auto-pick worst)
      const atkRolls = td.rolls[userId] ?? [];
      if (atkRolls.length > 0) {
        const idx = this._pickWorstDieForBump(atkRolls, td.totals[userId] ?? 0);
        const oldVal = atkRolls[idx].result;
        const newVal = rollDie(atkRolls[idx].die);
        atkRolls[idx] = { ...atkRolls[idx], result: newVal };
        td.rolls[userId] = atkRolls;
        td.totals[userId] = calculateStandardTotal(atkRolls);
        td.visibleTotals[userId] = calculateVisibleTotal(atkRolls);
        this.log.log("bump_nat1", `${attacker.name} bumped but NAT 1! Backfire! d${atkRolls[idx].die}: ${oldVal}→${newVal}, plus ante penalty.`);
      }
    } else if (atkTotal > defTotal) {
      // Success: reroll target's die
      const targetRoll = targetRolls[dieIndex];
      const oldVal = targetRoll.result;
      const newVal = rollDie(targetRoll.die);
      targetRolls[dieIndex] = { ...targetRoll, result: newVal };
      td.rolls[targetId] = targetRolls;
      td.totals[targetId] = calculateStandardTotal(targetRolls);
      td.visibleTotals[targetId] = calculateVisibleTotal(targetRolls);

      // Check if target busted
      this._resolveBust(targetId, "bump");
      this.log.log("bump_success", `${attacker.name} bumped ${defender.name}'s d${targetRoll.die}: ${oldVal}→${newVal}`);
    } else {
      // Failure: target chooses one of attacker's dice to reroll (auto-pick best for defender)
      const atkRolls = td.rolls[userId] ?? [];
      if (atkRolls.length > 0) {
        const idx = this._pickBestDieForRetaliation(atkRolls, td.totals[userId] ?? 0);
        const oldVal = atkRolls[idx].result;
        const newVal = rollDie(atkRolls[idx].die);
        atkRolls[idx] = { ...atkRolls[idx], result: newVal };
        td.rolls[userId] = atkRolls;
        td.totals[userId] = calculateStandardTotal(atkRolls);
        td.visibleTotals[userId] = calculateVisibleTotal(atkRolls);

        this._resolveBust(userId, "bump_retaliation");
        this.log.log("bump_fail", `${attacker.name} failed bump. ${defender.name} retaliates: d${atkRolls[idx].die}: ${oldVal}→${newVal}`);
      }
    }

    td.skillUsedThisTurn = true;
    td.lastSkillUsed = "bump";
    td.usedSkills[userId] = { ...(td.usedSkills[userId] ?? {}), bump: true };
    td.hasActed[userId] = true;
    this._advanceTurn();
    return this._getState();
  }

  // ─── Skill: Hunch ───────────────────────────────────────────────
  hunch(userId) {
    const td = this.tableData;
    if (this.status !== "PLAYING" || td.phase !== "betting") return this._getState();
    if (td.currentPlayer !== userId) return this._getState();
    if (td.skillUsedThisTurn) return this._getState();
    if (this.gameMode === "goblin") return this._getState();
    if (td.usedSkills?.[userId]?.hunch) return this._getState();

    const player = this.getPlayer(userId);
    this.metrics.skillsUsed.hunch++;

    const d20 = rollD20();
    const sloppy = !!td.sloppy?.[userId];
    const raw = sloppy ? Math.min(d20, rollD20()) : d20;
    const wisMod = player.getMod("wis");
    const courageBonus = this._consumeLiquidCourage(userId);
    const eventBonus = this._getEventModifier("hunchBonus");
    const total = raw + wisMod + courageBonus + eventBonus;
    const isNat1 = raw === 1;
    const isNat20 = raw === 20;

    if (isNat1) {
      // Locked into d20, blind next roll
      td.hunchLocked[userId] = true;
      td.hunchLockedDie[userId] = 20;
      td.blindNextRoll[userId] = true;
      this.log.log("hunch_nat1", `${player.name} used Hunch but NAT 1! Locked into d20, blind roll!`);
    } else if (isNat20 || total >= HUNCH_DC) {
      // Success: pre-roll all dice and reveal predictions
      const predictions = {};
      const prerolls = {};
      for (const die of VALID_DICE) {
        const val = rollDie(die);
        prerolls[die] = val;
        predictions[die] = classifyHunchPrediction(die, val);
      }
      td.hunchRolls[userId] = prerolls;
      td.hunchPrediction[userId] = predictions;
      if (isNat20) {
        td.hunchExact[userId] = { ...prerolls };
        this.log.log("hunch_nat20", `${player.name} used Hunch — NAT 20! Exact values revealed: ${JSON.stringify(prerolls)}`);
      } else {
        this.log.log("hunch_success", `${player.name} used Hunch — Success! Predictions: ${JSON.stringify(predictions)}`);
      }
    } else {
      // Failure: blind next roll
      td.blindNextRoll[userId] = true;
      this.log.log("hunch_fail", `${player.name} failed Hunch (${total} vs DC ${HUNCH_DC}). Next roll is blind.`);
    }

    td.skillUsedThisTurn = true;
    td.lastSkillUsed = "hunch";
    td.usedSkills[userId] = { ...(td.usedSkills[userId] ?? {}), hunch: true };
    // Hunch does NOT advance turn (it's a bonus action before rolling)
    return this._getState();
  }

  // ─── Skill: Profile ─────────────────────────────────────────────
  profile(userId, targetId) {
    const td = this.tableData;
    if (this.status !== "PLAYING" || td.phase !== "betting") return this._getState();
    if (td.currentPlayer !== userId) return this._getState();
    if (td.skillUsedThisTurn) return this._getState();
    if (this.gameMode === "goblin") return this._getState();
    if (td.usedSkills?.[userId]?.profile) return this._getState();
    if (!targetId || targetId === userId) return this._getState();

    const profiler = this.getPlayer(userId);
    const target = this.getPlayer(targetId);
    if (!profiler || !target) return this._getState();

    this.metrics.skillsUsed.profile++;

    const d20 = rollD20();
    const sloppy = !!td.sloppy?.[userId];
    const raw = sloppy ? Math.min(d20, rollD20()) : d20;
    const invMod = profiler.getSkillMod("investigation");
    const courageBonus = this._consumeLiquidCourage(userId);
    const eventBonus = this._getEventModifier("profileBonus");
    const total = raw + invMod + courageBonus + eventBonus;
    const isNat1 = raw === 1;
    const isNat20 = raw === 20;

    // Passive deception = 10 + deception mod + total cheats on their dice
    const targetCheats = td.cheaters?.[targetId]?.cheats?.length ?? 0;
    const passiveDeception = 10 + target.getSkillMod("deception") + targetCheats;

    const hasCheated = (td.cheaters?.[targetId]?.cheats?.length ?? 0) > 0;

    if (!td.profiledBy[targetId]) td.profiledBy[targetId] = [];

    if (isNat1) {
      // Backfire: target learns profiler's info
      td.profiledBy[targetId].push({ by: userId, result: "backfire" });
      this.log.log("profile_backfire", `${profiler.name} profiled ${target.name} — NAT 1! Target learns YOUR secrets!`);
    } else if (isNat20 || total >= passiveDeception) {
      td.profiledBy[targetId].push({
        by: userId, result: "success",
        cheated: hasCheated, exact: isNat20
      });
      this.log.log("profile_success", `${profiler.name} profiled ${target.name} — ${isNat20 ? "NAT 20!" : "Success!"} Cheated: ${hasCheated}`);
    } else {
      td.profiledBy[targetId].push({ by: userId, result: "fail" });
      this.log.log("profile_fail", `${profiler.name} failed to profile ${target.name} (${total} vs passive ${passiveDeception})`);
    }

    td.skillUsedThisTurn = true;
    td.lastSkillUsed = "profile";
    td.usedSkills[userId] = { ...(td.usedSkills[userId] ?? {}), profile: true };
    td.hasActed[userId] = true;
    // Profile does NOT advance turn in the real game either
    return this._getState();
  }

  // ─── Accuse (Staredown Phase) ───────────────────────────────────
  accuse(userId, targetId, dieIndex) {
    const td = this.tableData;
    if (this.status !== "INSPECTION") return this._getState();
    if (td.accusedThisRound?.[userId]) return this._getState();

    const accuser = this.getPlayer(userId);
    const target = this.getPlayer(targetId);
    if (!accuser || !target) return this._getState();

    const cost = this._getAccusationCost();
    if (!accuser.wallet.canAfford(cost)) return this._getState();

    this.metrics.accusations++;

    // Check if target actually cheated. dieIndex < 0 means "any die."
    const cheats = td.cheaters?.[targetId]?.cheats ?? [];
    const accuseAnyDie = dieIndex === undefined || dieIndex === null || dieIndex < 0;
    const wasActuallyCheated = accuseAnyDie
      ? cheats.some(c => !c.failed && !c.fumbled)
      : cheats.some(c => c.dieIndex === dieIndex && !c.failed && !c.fumbled);

    accuser.wallet.deduct(cost);
    this.pot += cost;
    td.accusedThisRound[userId] = true;

    if (wasActuallyCheated) {
      // Correct accusation
      td.caught[targetId] = true;
      const bounty = this._getAccusationBounty();
      accuser.wallet.add(bounty);
      this.metrics.accusationsCorrect++;
      this.log.log("accuse_correct", `${accuser.name} correctly accused ${target.name}! Bounty: ${bounty}gp`);
    } else {
      // Wrong accusation - accuser is disqualified
      td.disqualified[userId] = true;
      this.log.log("accuse_wrong", `${accuser.name} falsely accused ${target.name}. Disqualified!`);
    }

    return this._getState();
  }

  // ─── Side Bet ───────────────────────────────────────────────────
  placeSideBet(userId, championId, amount) {
    const td = this.tableData;
    if (this.status !== "PLAYING") return this._getState();
    if ((td.sideBetRound ?? 1) > 2) return this._getState();
    if (amount < this.ante) return this._getState();

    const player = this.getPlayer(userId);
    if (!player.wallet.canAfford(amount)) return this._getState();

    player.wallet.deduct(amount);
    if (!td.sideBets[userId]) td.sideBets[userId] = [];
    td.sideBets[userId].push({ championId, amount });
    td.sideBetPool = (td.sideBetPool ?? 0) + amount;

    this.log.log("side_bet", `${player.name} bet ${amount}gp on ${this.getPlayer(championId)?.name}`);
    return this._getState();
  }

  // ─── Reveal & Finish Round ──────────────────────────────────────
  finishBetting() {
    if (this.status !== "PLAYING") return this._getState();
    // Move to inspection (staredown)
    this.status = "INSPECTION";
    this.log.log("staredown", "The Staredown begins... all dice revealed.");
    return this._getState();
  }

  finishRound() {
    const td = this.tableData;
    const bustLimit = this._getBustLimit();

    // Process fumbled cheaters
    for (const [cheaterId, cheaterData] of Object.entries(td.cheaters)) {
      if (td.caught[cheaterId]) continue;
      const cheats = cheaterData.cheats ?? [];
      for (const cheat of cheats) {
        if (cheat.fumbled) {
          td.caught[cheaterId] = true;
          this.metrics.cheatsCaught++;
          break;
        }
      }
    }

    // Determine winner(s)
    const totals = td.totals ?? {};
    let best = 0;
    for (const id of this.turnOrder) {
      if (td.caught?.[id]) continue;
      if (td.busts?.[id]) continue;
      if (td.folded?.[id]) continue;
      if (td.disqualified?.[id]) continue;
      const total = totals[id] ?? 0;
      if (total <= bustLimit && total > best) best = total;
    }

    const winners = this.turnOrder.filter(id => {
      if (td.caught?.[id] || td.busts?.[id] || td.folded?.[id] || td.disqualified?.[id]) return false;
      return (totals[id] ?? 0) === best && best > 0;
    });

    // Cleaning fees
    for (const [userId, fee] of Object.entries(td.cleaningFees)) {
      if (fee > 0) {
        this.getPlayer(userId)?.wallet.deduct(fee);
        this.pot += fee;
      }
    }

    // Handle duel
    if (winners.length > 1) {
      return this._runDuel(winners);
    }

    // Pay out
    if (winners.length === 1) {
      const winnerId = winners[0];
      this.getPlayer(winnerId).wallet.add(this.pot);
      this.log.log("winner", `${this.getPlayer(winnerId).name} wins ${this.pot}gp!`, { player: winnerId, pot: this.pot });

      // Track metrics
      this.metrics.winsByPlayer[winnerId] = (this.metrics.winsByPlayer[winnerId] ?? 0) + 1;

      // Closest finish tracking
      const sortedTotals = this.turnOrder
        .filter(id => !td.busts?.[id] && !td.folded?.[id] && !td.caught?.[id] && !td.disqualified?.[id])
        .map(id => totals[id] ?? 0)
        .filter(total => total <= bustLimit)
        .sort((a, b) => b - a);
      if (sortedTotals.length >= 2) {
        const margin = sortedTotals[0] - sortedTotals[1];
        this.metrics.closestFinish = Math.min(this.metrics.closestFinish, margin);
      }

      // Side bet payouts
      this._processSideBets(winnerId);
    } else {
      this.log.log("no_winner", "No winner this round. House keeps the pot.");
      this._processSideBets(null);
    }

    this.status = "PAYOUT";
    this.pot = 0;

    // Track gold
    for (const [id, player] of this.players) {
      this.metrics.goldByPlayer[id] = player.wallet.gold;
    }

    return this._getState();
  }

  returnToLobby() {
    this.status = "LOBBY";
    this.tableData = emptyTableData();
    this.tableData.gameMode = this.gameMode;
    return this._getState();
  }

  // ─── Goblin Mode ────────────────────────────────────────────────
  _startGoblinRound() {
    const td = this.tableData;
    td.phase = "betting";
    td.bettingOrder = [...this.turnOrder];
    td.currentPlayer = td.bettingOrder[0] ?? null;
    td.goblinStageIndex = 0;
    td.goblinStageDie = GOBLIN_STAGE_DICE[0] ?? 20;
    td.goblinStageRemaining = [...td.bettingOrder];
    td.goblinBoots = {};
    td.goblinHoldStage = {};
    this.log.log("goblin_start", "Goblin Round started! d20 → d12 → d10 → d8 → d6 → d4 → Coin");
    return this._getState();
  }

  _submitGoblinRoll(userId, die) {
    const td = this.tableData;
    const currentStageDie = td.goblinSuddenDeathActive ? 2 : td.goblinStageDie;
    if (die !== currentStageDie) return this._getState();

    const player = this.getPlayer(userId);
    const result = rollDie(die);

    this.log.log("goblin_roll", `${player.name} rolled d${die} → ${result}`, { player: userId, die, result });

    if (die === 2) {
      // Coin flip: 1 = death, 2 = survive + bonus
      if (result === 1) {
        td.totals[userId] = 0;
        td.busts[userId] = true;
        this.metrics.busts++;
        this.log.log("goblin_death", `${player.name} flipped DEATH on the coin!`);
      } else {
        const bonus = 2;
        td.totals[userId] = (td.totals[userId] ?? 0) + bonus;
        this.log.log("goblin_coin_survive", `${player.name} survived the coin! +${bonus}`);
      }
    } else {
      if (result === 1) {
        // Bust
        td.totals[userId] = 0;
        td.busts[userId] = true;
        this.metrics.busts++;
        this.log.log("goblin_bust", `${player.name} rolled a 1! BUST!`);
      } else {
        td.totals[userId] = (td.totals[userId] ?? 0) + result;
        // Max roll = boot earned
        if (result === die) {
          td.goblinBoots[userId] = (td.goblinBoots[userId] ?? 0) + 1;
          this.log.log("goblin_boot", `${player.name} rolled MAX (${result})! Earned a Boot!`);
        }
      }
    }

    const rolls = td.rolls[userId] ?? [];
    rolls.push({ die, result, public: true });
    td.rolls[userId] = rolls;
    td.visibleTotals[userId] = td.totals[userId] ?? 0;

    // Advance goblin turn
    this._advanceGoblinTurn(userId);
    return this._getState();
  }

  _holdGoblin(userId) {
    const td = this.tableData;
    // Only leader can hold
    let best = -Infinity;
    let leaderId = null;
    for (const id of this.turnOrder) {
      if (td.busts?.[id] || td.folded?.[id]) continue;
      if ((td.totals[id] ?? 0) > best) {
        best = td.totals[id] ?? 0;
        leaderId = id;
      }
    }
    if (userId !== leaderId) return this._getState();

    td.holds[userId] = true;
    td.goblinHoldStage[userId] = td.goblinStageDie;
    td.goblinStageRemaining = (td.goblinStageRemaining ?? []).filter(id => id !== userId);
    this.metrics.holds++;
    this.log.log("goblin_hold", `${this.getPlayer(userId).name} holds at ${td.totals[userId]} (stage d${td.goblinStageDie})`);

    this._advanceGoblinTurn(userId);
    return this._getState();
  }

  _advanceGoblinTurn(afterUserId) {
    const td = this.tableData;
    const remaining = (td.goblinStageRemaining ?? []).filter(
      id => !td.busts?.[id] && !td.holds?.[id] && !td.folded?.[id]
    );
    td.goblinStageRemaining = remaining;

    if (remaining.length === 0) {
      // Advance stage
      const nextStageIndex = (td.goblinStageIndex ?? 0) + 1;
      if (nextStageIndex >= GOBLIN_STAGE_DICE.length) {
        // Enter sudden death (coin flips)
        const survivors = this.turnOrder.filter(id => !td.busts?.[id] && !td.folded?.[id]);
        if (survivors.length <= 1) {
          this._finishGoblinRound();
          return;
        }
        td.goblinSuddenDeathActive = true;
        td.goblinSuddenDeathParticipants = survivors;
        td.goblinSuddenDeathRemaining = [...survivors];
        td.goblinStageDie = 2;
        td.currentPlayer = survivors[0] ?? null;
        this.log.log("goblin_sudden_death", "Sudden Death begins! Coin flips!");
        return;
      }

      td.goblinStageIndex = nextStageIndex;
      td.goblinStageDie = GOBLIN_STAGE_DICE[nextStageIndex];
      // Everyone still alive (not holding, not bust) re-enters
      const nextRemaining = this.turnOrder.filter(
        id => !td.busts?.[id] && !td.holds?.[id] && !td.folded?.[id]
      );
      td.goblinStageRemaining = nextRemaining;

      if (nextRemaining.length === 0) {
        this._finishGoblinRound();
        return;
      }
      td.currentPlayer = nextRemaining[0];
      this.log.log("goblin_stage", `Stage advanced to d${td.goblinStageDie}`);
      return;
    }

    // Next player in remaining
    const curIdx = remaining.indexOf(afterUserId);
    const nextIdx = (curIdx + 1) % remaining.length;
    if (nextIdx === 0 && remaining.length > 0) {
      // Wrapped around — check if stage should advance (all remaining have rolled)
      // For simplicity, advance the next player
    }
    td.currentPlayer = remaining[nextIdx] ?? remaining[0] ?? null;
  }

  _finishGoblinRound() {
    const td = this.tableData;
    const totals = td.totals ?? {};
    let best = -Infinity;
    for (const id of this.turnOrder) {
      if (td.busts?.[id] || td.folded?.[id] || td.caught?.[id]) continue;
      if ((totals[id] ?? 0) > best) best = totals[id] ?? 0;
    }

    const winners = this.turnOrder.filter(id => {
      if (td.busts?.[id] || td.folded?.[id] || td.caught?.[id]) return false;
      return best > -Infinity && (totals[id] ?? 0) === best;
    });

    if (winners.length > 1) {
      // Sudden death coin flips
      td.goblinSuddenDeathActive = true;
      td.goblinSuddenDeathParticipants = [...winners];
      td.goblinSuddenDeathRemaining = [...winners];
      td.goblinStageDie = 2;
      td.currentPlayer = winners[0] ?? null;
      this.log.log("goblin_tiebreaker", `Tied at ${best}! Sudden death coin flips.`);
      return;
    }

    if (winners.length === 1) {
      let payout = this.pot;
      const holdStage = td.goblinHoldStage?.[winners[0]];
      if (holdStage && holdStage > 8) {
        payout = Math.floor(this.pot * 0.5);
        this.log.log("goblin_coward_tax", `${this.getPlayer(winners[0]).name} held early — Coward's Tax! Half pot.`);
      }
      this.getPlayer(winners[0]).wallet.add(payout);
      this.metrics.winsByPlayer[winners[0]] = (this.metrics.winsByPlayer[winners[0]] ?? 0) + 1;
      this.log.log("winner", `${this.getPlayer(winners[0]).name} wins ${payout}gp!`, { player: winners[0], pot: payout });
    } else {
      this.log.log("goblin_wipeout", "Total wipeout! House keeps the pot.");
    }

    this.status = "PAYOUT";
    this.pot = 0;
    for (const [id, player] of this.players) {
      this.metrics.goldByPlayer[id] = player.wallet.gold;
    }
  }

  // ─── Duel (Tied Winners) ────────────────────────────────────────
  _runDuel(winners) {
    this.metrics.duels++;
    this.log.log("duel", `DUEL! ${winners.map(id => this.getPlayer(id).name).join(" vs ")} clash for the pot!`);

    const td = this.tableData;
    const duelRolls = {};
    for (const id of winners) {
      const d20 = rollD20();
      const hits = td.hitCount?.[id] ?? 0;
      let d4Bonus = 0;
      for (let i = 0; i < hits; i++) d4Bonus += rollDie(4);
      duelRolls[id] = { d20, d4Bonus, hits, total: d20 + d4Bonus };
    }

    // Find winner
    const highest = Math.max(...Object.values(duelRolls).map(r => r.total));
    const duelWinners = winners.filter(id => duelRolls[id].total === highest);

    if (duelWinners.length > 1) {
      // Still tied — re-duel (recursive, max 5 attempts)
      this.log.log("duel_tie", "Duel tied! Re-rolling...");
      return this._runDuel(duelWinners);
    }

    const winnerId = duelWinners[0];
    this.getPlayer(winnerId).wallet.add(this.pot);
    this.metrics.winsByPlayer[winnerId] = (this.metrics.winsByPlayer[winnerId] ?? 0) + 1;
    this.log.log("duel_winner", `${this.getPlayer(winnerId).name} wins the duel and takes ${this.pot}gp!`);

    this._processSideBets(winnerId);
    this.status = "PAYOUT";
    this.pot = 0;
    for (const [id, player] of this.players) {
      this.metrics.goldByPlayer[id] = player.wallet.gold;
    }
    return this._getState();
  }

  // ─── Side Bet Payouts ───────────────────────────────────────────
  _processSideBets(winnerId) {
    const td = this.tableData;
    const sideBets = td.sideBets ?? {};
    for (const [betterId, bets] of Object.entries(sideBets)) {
      for (const bet of bets) {
        if (winnerId && bet.championId === winnerId) {
          const payout = bet.amount * 2; // 2:1 payout
          this.getPlayer(betterId)?.wallet.add(payout);
          td.sideBetWinners[betterId] = true;
          this.log.log("side_bet_win", `${this.getPlayer(betterId)?.name} won side bet: ${payout}gp`);
        }
      }
    }
  }

  // ─── Turn Management ────────────────────────────────────────────
  _advanceTurn() {
    const td = this.tableData;
    const order = td.bettingOrder ?? this.turnOrder;

    // Check if all players are done
    const allDone = order.every(id =>
      td.holds[id] || td.busts[id] || td.folded?.[id] || td.caught?.[id]
    );

    if (allDone) {
      this.finishBetting();
      return;
    }

    // Find next active player
    const curIdx = td.currentPlayer ? order.indexOf(td.currentPlayer) : -1;
    for (let i = 1; i <= order.length; i++) {
      const nextIdx = (curIdx + i) % order.length;
      const nextId = order[nextIdx];
      if (!td.holds[nextId] && !td.busts[nextId] && !td.folded?.[nextId] && !td.caught?.[nextId]) {
        td.currentPlayer = nextId;

        // Track side bet round advancement
        if (td.sideBetRoundStart && nextId === td.sideBetRoundStart) {
          td.sideBetRound = (td.sideBetRound ?? 1) + 1;
        }

        td.skillUsedThisTurn = false;
        td.lastSkillUsed = null;
        return;
      }
    }

    // Everyone done
    this.finishBetting();
  }

  _rollTavernEvent() {
    if (!Array.isArray(TAVERN_EVENTS) || TAVERN_EVENTS.length === 0) return null;
    const idx = Math.floor(Math.random() * TAVERN_EVENTS.length);
    return { ...TAVERN_EVENTS[idx] };
  }

  _getEventModifier(key) {
    const event = this.tableData?.roundEvent;
    return Number(event?.[key] ?? 0);
  }

  _getBustLimit() {
    const event = this.tableData?.roundEvent;
    return Number(event?.bustLimit ?? DEFAULT_BUST_LIMIT);
  }

  _getModifiedDieCost(die) {
    const base = getDieCost(die, this.ante);
    const delta = Number(this.tableData?.roundEvent?.dieCostDelta?.[die] ?? 0);
    return Math.max(0, base + delta);
  }

  _getAccusationCost() {
    const multiplier = Number(this.tableData?.roundEvent?.accusationCostMultiplier ?? ACCUSATION_COST_MULTIPLIER);
    return Math.max(1, Math.floor(this.ante * multiplier));
  }

  _getAccusationBounty() {
    const multiplier = Number(this.tableData?.roundEvent?.accusationBountyMultiplier ?? ACCUSATION_BOUNTY_MULTIPLIER);
    return Math.max(1, Math.floor(this.ante * multiplier));
  }

  _consumeLiquidCourage(userId) {
    const td = this.tableData;
    const stacks = Number(td.liquidCourage?.[userId] ?? 0);
    if (stacks <= 0) return 0;
    td.liquidCourage[userId] = stacks - 1;
    if (td.liquidCourage[userId] <= 0) {
      delete td.liquidCourage[userId];
    }
    return 1;
  }

  _tryHeroicSave(userId, source = "roll") {
    const td = this.tableData;
    if (this.gameMode === "goblin") return false;
    if (source !== "roll") return false;
    if (!td.heroicSaveAvailable?.[userId]) return false;
    if ((td.drinkCount?.[userId] ?? 0) < 1) return false;

    const bustLimit = this._getBustLimit();
    const total = td.totals?.[userId] ?? 0;
    const overshoot = total - bustLimit;
    if (overshoot !== 1) return false;

    const rolls = td.rolls?.[userId] ?? [];
    const lastIdx = rolls.length - 1;
    if (lastIdx < 0) return false;

    const player = this.getPlayer(userId);
    if (!player?.wallet.canAfford(this.ante)) return false;
    player.wallet.deduct(this.ante);
    this.pot += this.ante;
    this.metrics.biggestPot = Math.max(this.metrics.biggestPot, this.pot);

    const lastRoll = rolls[lastIdx];
    const corrected = Number(lastRoll?.result ?? 0) - overshoot;
    if (corrected < 1) return false;

    rolls[lastIdx] = { ...lastRoll, result: corrected };
    td.rolls[userId] = rolls;
    td.totals[userId] = calculateStandardTotal(rolls);
    td.visibleTotals[userId] = calculateVisibleTotal(rolls);
    td.heroicSaveAvailable[userId] = false;
    td.heroicSaveUsed[userId] = true;
    td.holds[userId] = true;
    this.metrics.heroicSaves++;
    this.log.log(
      "heroic_save",
      `${player?.name} invokes a Heroic Save! d${lastRoll?.die} ${lastRoll?.result}→${corrected}, holds at ${td.totals[userId]} (cost: ${this.ante}gp).`,
      { player: userId, source, overshoot, cost: this.ante }
    );
    return true;
  }

  _resolveBust(userId, source = "roll") {
    const td = this.tableData;
    const total = td.totals?.[userId] ?? 0;
    const bustLimit = this._getBustLimit();
    if (total <= bustLimit) return false;
    if (this._tryHeroicSave(userId, source)) return false;

    td.busts[userId] = true;
    this.metrics.busts++;
    this.log.log("bust", `${this.getPlayer(userId)?.name} BUSTED with ${total} (limit ${bustLimit})!`, { player: userId, source });
    return true;
  }

  _pickWorstDieForBump(rolls, total) {
    // Pick the die whose reroll would hurt the player most (highest value die).
    let bestIdx = 0, bestVal = -1;
    for (let i = 0; i < rolls.length; i++) {
      if (rolls[i].result > bestVal) {
        bestVal = rolls[i].result;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  _pickBestDieForRetaliation(rolls, total) {
    // Retaliation: defender picks the die most likely to hurt attacker
    return this._pickWorstDieForBump(rolls, total);
  }

  // ─── State Snapshot ─────────────────────────────────────────────
  _getState() {
    return {
      status: this.status,
      pot: this.pot,
      turnOrder: this.turnOrder,
      tableData: this.tableData,
      currentPlayer: this.tableData.currentPlayer,
      phase: this.tableData.phase,
      gameMode: this.gameMode,
      bustLimit: this._getBustLimit(),
      roundEvent: this.tableData.roundEvent,
      roundNumber: this.roundNumber,
      players: Object.fromEntries(
        [...this.players.entries()].map(([id, p]) => [id, {
          id, name: p.name, gold: p.wallet.gold,
          total: this.tableData.totals?.[id] ?? 0,
          visibleTotal: this.tableData.visibleTotals?.[id] ?? 0,
          rolls: this.tableData.rolls?.[id] ?? [],
          isHolding: !!this.tableData.holds?.[id],
          isBusted: !!this.tableData.busts?.[id],
          isFolded: !!this.tableData.folded?.[id],
          isCaught: !!this.tableData.caught?.[id],
        }])
      ),
    };
  }

  // ─── Convenience: Get available actions for a player ────────────
  getAvailableActions(userId) {
    const td = this.tableData;
    const actions = [];

    if (this.status !== "PLAYING") {
      if (this.status === "INSPECTION") {
        if (!td.accusedThisRound?.[userId]) actions.push("accuse");
        actions.push("skip_inspection");
      }
      return actions;
    }

    if (td.currentPlayer !== userId) return actions;
    if (td.busts?.[userId] || td.folded?.[userId] || td.caught?.[userId]) return actions;

    // Must roll if goaded
    if (td.goadBackfire?.[userId]?.mustRoll) {
      if (td.goadBackfire[userId].forceD20) {
        actions.push("roll_d20_forced");
      } else {
        actions.push("roll_forced");
      }
      actions.push("fold"); // can always fold
      return actions;
    }

    if (this.gameMode === "goblin") {
      actions.push("roll");
      // Can hold only if leader
      let best = -Infinity, leaderId = null;
      for (const id of this.turnOrder) {
        if (td.busts?.[id] || td.folded?.[id]) continue;
        if ((td.totals[id] ?? 0) > best) { best = td.totals[id]; leaderId = id; }
      }
      if (userId === leaderId && !td.holds?.[userId]) actions.push("hold");
      return actions;
    }

    // Standard mode
    if (td.phase === "cut" && td.theCutPlayer === userId) {
      actions.push("cut_reroll", "cut_pass");
      return actions;
    }

    if (td.phase === "betting") {
      actions.push("roll", "hold", "fold");
      if ((td.drinkCount?.[userId] ?? 0) < 3) {
        actions.push("drink");
      }

      // Skills (if not used this turn)
      if (!td.skillUsedThisTurn) {
        if (!td.usedSkills?.[userId]?.hunch) actions.push("hunch");
        if (!td.usedSkills?.[userId]?.profile) actions.push("profile");
        if (!td.usedSkills?.[userId]?.goad) actions.push("goad");
        if (!td.usedSkills?.[userId]?.bump) actions.push("bump");
        if (!td.usedSkills?.[userId]?.cheat) actions.push("cheat");
      }

      // Side bets (first 2 rounds)
      if ((td.sideBetRound ?? 1) <= 2) actions.push("side_bet");
    }

    return actions;
  }

  // ─── Get game info for AI decision-making ───────────────────────
  getGameInfo(forPlayerId) {
    const td = this.tableData;
    const player = this.getPlayer(forPlayerId);
    const myRolls = td.rolls?.[forPlayerId] ?? [];
    const myTotal = td.totals?.[forPlayerId] ?? 0;
    const myVisible = td.visibleTotals?.[forPlayerId] ?? 0;

    // What this player can see about others
    const opponents = {};
    for (const id of this.turnOrder) {
      if (id === forPlayerId) continue;
      const opp = this.getPlayer(id);
      opponents[id] = {
        name: opp.name,
        visibleTotal: td.visibleTotals?.[id] ?? 0,
        isHolding: !!td.holds?.[id],
        isBusted: !!td.busts?.[id],
        isFolded: !!td.folded?.[id],
        rollCount: (td.rolls?.[id] ?? []).length,
        gold: opp.wallet.gold,
      };
    }

    return {
      myTotal, myVisible,
      myRolls,
      myGold: player.wallet.gold,
      pot: this.pot,
      phase: td.phase,
      gameMode: this.gameMode,
      opponents,
      hunchPredictions: td.hunchPrediction?.[forPlayerId] ?? null,
      hunchExact: td.hunchExact?.[forPlayerId] ?? null,
      profileResults: this._getProfileResults(forPlayerId),
      availableActions: this.getAvailableActions(forPlayerId),
      isMustRoll: !!td.goadBackfire?.[forPlayerId]?.mustRoll,
      isForceD20: !!td.goadBackfire?.[forPlayerId]?.forceD20,
      sideBetRound: td.sideBetRound ?? 1,
      round: this.roundNumber,
      heat: td.playerHeat?.[forPlayerId] ?? 10,
      bustLimit: this._getBustLimit(),
      roundEvent: td.roundEvent,
      drinkCount: td.drinkCount?.[forPlayerId] ?? 0,
      isSloppy: !!td.sloppy?.[forPlayerId],
      liquidCourage: td.liquidCourage?.[forPlayerId] ?? 0,
      heroicSaveUsed: !!td.heroicSaveUsed?.[forPlayerId],
    };
  }

  _getProfileResults(userId) {
    const td = this.tableData;
    const results = [];
    for (const [targetId, profiles] of Object.entries(td.profiledBy ?? {})) {
      for (const p of profiles) {
        if (p.by === userId && (p.result === "success" || p.result === "nat20")) {
          results.push({ targetId, cheated: p.cheated, exact: p.exact });
        }
      }
    }
    return results;
  }
}
