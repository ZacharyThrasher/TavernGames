import { getState } from "../state.js";
import { handlePlayerAction } from "../tavern-actions.js";
import { emptyTableData, VALID_DICE } from "../twenty-one/constants.js";
import {
  getValidBootTargets,
  getValidBumpTargets,
  getValidGoadTargets,
  getValidProfileTargets,
  isActingAsHouse
} from "../twenty-one/utils/game-logic.js";

const DEFAULT_STRATEGY = "balanced";
const DEFAULT_DIFFICULTY = "normal";
const VALID_STRATEGIES = new Set(["balanced", "aggressive", "conservative", "duelist", "tactician", "bully", "chaotic"]);
const VALID_DIFFICULTIES = new Set(["easy", "normal", "hard", "legendary"]);
const MAX_ACTIONS_PER_CYCLE = 12;
const DEFAULT_ACTION_DELAY_MS = 140;

const DIFFICULTY_PROFILES = {
  easy: {
    skillBias: 0.72,
    riskBias: -0.24,
    foldBias: 0.2,
    cheatBias: 0.55,
    chaosBias: 0.08,
    delayMs: 230
  },
  normal: {
    skillBias: 1,
    riskBias: 0,
    foldBias: 0,
    cheatBias: 1,
    chaosBias: 0,
    delayMs: DEFAULT_ACTION_DELAY_MS
  },
  hard: {
    skillBias: 1.2,
    riskBias: 0.12,
    foldBias: -0.04,
    cheatBias: 1.2,
    chaosBias: -0.03,
    delayMs: 120
  },
  legendary: {
    skillBias: 1.45,
    riskBias: 0.24,
    foldBias: -0.08,
    cheatBias: 1.42,
    chaosBias: -0.06,
    delayMs: 90
  }
};

let runTimer = null;
let running = false;
let queued = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function randomChance(probability) {
  return Math.random() < probability;
}

function clampProbability(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function isThisActiveGM() {
  if (!game.user?.isGM) return false;
  const activeGM = game.users.activeGM;
  if (!activeGM) return true;
  return activeGM.id === game.user.id;
}

function normalizeStrategy(value) {
  return VALID_STRATEGIES.has(value) ? value : DEFAULT_STRATEGY;
}

function normalizeDifficulty(value) {
  return VALID_DIFFICULTIES.has(value) ? value : DEFAULT_DIFFICULTY;
}

function getDifficultyProfile(difficulty) {
  return DIFFICULTY_PROFILES[normalizeDifficulty(difficulty)] ?? DIFFICULTY_PROFILES[DEFAULT_DIFFICULTY];
}

function chanceWithSkillBias(baseChance, difficulty, extraBias = 1) {
  const profile = getDifficultyProfile(difficulty);
  return clampProbability(baseChance * profile.skillBias * extraBias);
}

function chanceWithChaosBias(baseChance, difficulty) {
  const profile = getDifficultyProfile(difficulty);
  return clampProbability(baseChance + profile.chaosBias);
}

function getActionDelayMsForState(state) {
  const tableData = getTableData(state);
  const currentId = tableData.currentPlayer;
  if (currentId) {
    const { difficulty } = getAutoplayConfig(state, currentId);
    return getDifficultyProfile(difficulty).delayMs;
  }

  if (state?.status === "DUEL") {
    const pendingRolls = tableData.duel?.pendingRolls ?? [];
    const duelUserId = pendingRolls.find((id) => isAutoplayEnabled(state, id));
    if (duelUserId) {
      const { difficulty } = getAutoplayConfig(state, duelUserId);
      return getDifficultyProfile(difficulty).delayMs;
    }
  }

  return DEFAULT_ACTION_DELAY_MS;
}

function getAutoplayConfig(state, userId) {
  const autoplayMap = state?.autoplay ?? {};
  const entry = autoplayMap?.[userId] ?? {};
  return {
    enabled: entry?.enabled === true,
    strategy: normalizeStrategy(entry?.strategy),
    difficulty: normalizeDifficulty(entry?.difficulty)
  };
}

function isAutoplayEnabled(state, userId) {
  return Boolean(state?.players?.[userId]) && getAutoplayConfig(state, userId).enabled;
}

function getTableData(state) {
  return state?.tableData ?? emptyTableData();
}

function getHighestVisibleOpponent(state, userId) {
  const tableData = getTableData(state);
  let best = null;
  for (const [id, player] of Object.entries(state?.players ?? {})) {
    if (id === userId) continue;
    if (tableData.busts?.[id] || tableData.folded?.[id] || tableData.caught?.[id]) continue;
    const visibleTotal = Number(tableData.visibleTotals?.[id] ?? 0);
    if (!best || visibleTotal > best.visibleTotal) {
      best = { id, name: player.name ?? "Unknown", visibleTotal, isHolding: Boolean(tableData.holds?.[id]) };
    }
  }
  return best;
}

function chooseRetaliationDieIndex(state, attackerId) {
  const tableData = getTableData(state);
  const rolls = tableData.rolls?.[attackerId] ?? [];
  if (rolls.length === 0) return 0;

  let bestIndex = 0;
  let bestValue = -Infinity;
  for (let i = 0; i < rolls.length; i++) {
    const value = Number(rolls[i]?.result ?? 0);
    if (value > bestValue) {
      bestValue = value;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function canUseTurnSkill(state, userId) {
  const tableData = getTableData(state);
  if (state.status !== "PLAYING") return false;
  if ((tableData.gameMode ?? "standard") === "goblin") return false;
  if (tableData.phase !== "betting") return false;
  if (tableData.currentPlayer !== userId) return false;
  if (tableData.skillUsedThisTurn) return false;
  if (tableData.busts?.[userId] || tableData.folded?.[userId] || tableData.holds?.[userId]) return false;
  if (isActingAsHouse(userId, state)) return false;
  return true;
}

function pickGoadPayload(state, userId, strategy) {
  const tableData = getTableData(state);
  const targets = getValidGoadTargets(state, userId);
  if (!targets.length) return null;

  const holdingTargets = targets.filter((t) => t.isHolding);
  const targetPool = holdingTargets.length ? holdingTargets : targets;
  const highest = targetPool
    .map((t) => ({ ...t, visibleTotal: Number(tableData.visibleTotals?.[t.id] ?? 0) }))
    .sort((a, b) => b.visibleTotal - a.visibleTotal)[0];

  const attackerSkill = strategy === "aggressive" ? "itm" : (randomChance(0.5) ? "per" : "itm");
  return highest ? { targetId: highest.id, attackerSkill } : null;
}

function pickBumpPayload(state, userId) {
  const tableData = getTableData(state);
  const targets = getValidBumpTargets(state, userId);
  if (!targets.length) return null;

  const scored = targets.map((target) => {
    const dice = Array.isArray(target.dice) ? target.dice : [];
    const preferredPool = dice.filter((die) => die.isPublic);
    const diePool = preferredPool.length ? preferredPool : dice;
    const bestDie = diePool.sort((a, b) => Number(b.result ?? 0) - Number(a.result ?? 0))[0];
    return {
      id: target.id,
      visibleTotal: Number(tableData.visibleTotals?.[target.id] ?? 0),
      dieIndex: Number(bestDie?.index ?? 0)
    };
  });

  scored.sort((a, b) => b.visibleTotal - a.visibleTotal);
  const choice = scored[0];
  if (!choice) return null;
  return { targetId: choice.id, dieIndex: choice.dieIndex };
}

function pickProfilePayload(state, userId) {
  const tableData = getTableData(state);
  const targets = getValidProfileTargets(state, userId);
  if (!targets.length) return null;
  const highThreats = targets
    .map((target) => ({ ...target, visibleTotal: Number(tableData.visibleTotals?.[target.id] ?? 0) }))
    .sort((a, b) => b.visibleTotal - a.visibleTotal);
  const choice = highThreats[0] ?? pickRandom(targets);
  return choice ? { targetId: choice.id } : null;
}

function shouldHoldStandard(state, userId, strategy, difficulty) {
  const tableData = getTableData(state);
  if (tableData.currentPlayer !== userId) return false;
  if (tableData.phase !== "betting") return false;
  if ((tableData.gameMode ?? "standard") === "goblin") return false;
  if (tableData.busts?.[userId] || tableData.folded?.[userId] || tableData.holds?.[userId]) return false;
  if (tableData.goadBackfire?.[userId]?.mustRoll) return false;
  if (tableData.hunchLocked?.[userId]) return false;
  if (tableData.dared?.[userId]) return false;
  if (tableData.pendingBumpRetaliation?.attackerId === userId) return false;

  const myTotal = Number(tableData.totals?.[userId] ?? 0);
  const highestOpp = getHighestVisibleOpponent(state, userId);
  const highestOppVisible = Number(highestOpp?.visibleTotal ?? 0);
  const profile = getDifficultyProfile(difficulty);
  const cautionShift = Math.round(-profile.riskBias * 5);
  const pressuredLead = highestOppVisible + (strategy === "tactician" ? 0 : 1);

  switch (strategy) {
    case "conservative":
      return myTotal >= (18 + cautionShift) || (myTotal >= (16 + cautionShift) && myTotal >= highestOppVisible + 1);
    case "aggressive":
      return myTotal >= Math.max(18, 20 + cautionShift) || (myTotal >= Math.max(17, 19 + cautionShift) && myTotal >= highestOppVisible + 2);
    case "duelist":
      return myTotal >= Math.max(18, 19 + cautionShift)
        || (myTotal >= Math.max(16, 17 + cautionShift) && myTotal >= pressuredLead && (highestOpp?.isHolding || highestOppVisible >= 17));
    case "tactician":
      return myTotal >= Math.max(17, 18 + cautionShift)
        || (myTotal >= Math.max(15, 16 + cautionShift) && myTotal >= pressuredLead && highestOppVisible >= 15);
    case "bully":
      return myTotal >= Math.max(18, 19 + cautionShift)
        || (myTotal >= Math.max(16, 17 + cautionShift) && highestOppVisible <= myTotal - 1 && highestOppVisible >= 14);
    case "chaotic":
      return (myTotal >= Math.max(17, 20 + cautionShift) && randomChance(chanceWithChaosBias(0.8, difficulty)))
        || (myTotal >= Math.max(15, 18 + cautionShift) && randomChance(chanceWithChaosBias(0.45, difficulty)));
    default:
      return myTotal >= Math.max(17, 19 + cautionShift) || (myTotal >= Math.max(15, 17 + cautionShift) && myTotal >= pressuredLead);
  }
}

function shouldFoldStandard(state, userId, strategy, difficulty) {
  const tableData = getTableData(state);
  if (tableData.currentPlayer !== userId) return false;
  if (tableData.phase !== "betting") return false;
  if ((tableData.gameMode ?? "standard") === "goblin") return false;
  if (tableData.busts?.[userId] || tableData.folded?.[userId] || tableData.holds?.[userId]) return false;

  const myTotal = Number(tableData.totals?.[userId] ?? 0);
  const highestOpp = getHighestVisibleOpponent(state, userId);
  const highestOppVisible = Number(highestOpp?.visibleTotal ?? 0);
  const forcedRoll = Boolean(tableData.goadBackfire?.[userId]?.mustRoll || tableData.hunchLocked?.[userId] || tableData.dared?.[userId]);
  const profile = getDifficultyProfile(difficulty);
  const foldBias = profile.foldBias;
  const riskBias = profile.riskBias;

  if (strategy === "chaotic") return randomChance(chanceWithChaosBias(0.04 + Math.max(0, foldBias * 0.35), difficulty));
  if (strategy === "conservative") {
    if (tableData.dared?.[userId] && myTotal <= 12) return true;
    if (forcedRoll && myTotal >= Math.max(16, 18 - Math.round(riskBias * 2))) {
      return randomChance(clampProbability(0.55 + foldBias));
    }
    return myTotal <= 11 && highestOppVisible >= 17 && randomChance(clampProbability(0.2 + foldBias * 0.7));
  }
  if (strategy === "balanced") {
    if (forcedRoll && myTotal >= Math.max(17, 19 - Math.round(riskBias * 3))) {
      return randomChance(clampProbability(0.35 + foldBias * 0.55));
    }
    return myTotal <= 10 && highestOppVisible >= 18 && randomChance(clampProbability(0.1 + foldBias * 0.45));
  }
  if (strategy === "duelist") {
    if (forcedRoll && myTotal >= Math.max(17, 19 - Math.round(riskBias * 2))) {
      return randomChance(clampProbability(0.28 + foldBias * 0.4));
    }
    return myTotal <= 9 && highestOppVisible >= 19 && randomChance(clampProbability(0.08 + foldBias * 0.4));
  }
  if (strategy === "tactician") {
    if (forcedRoll && myTotal >= Math.max(16, 18 - Math.round(riskBias * 2))) {
      return randomChance(clampProbability(0.42 + foldBias * 0.65));
    }
    return myTotal <= 10 && highestOppVisible >= 17 && randomChance(clampProbability(0.16 + foldBias * 0.45));
  }
  if (strategy === "bully") {
    if (forcedRoll && myTotal >= Math.max(18, 20 - Math.round(riskBias * 2))) {
      return randomChance(clampProbability(0.2 + foldBias * 0.35));
    }
    return false;
  }
  if (strategy === "aggressive") {
    return forcedRoll && myTotal >= Math.max(18, 20 - Math.round(riskBias * 3)) && randomChance(clampProbability(0.15 + foldBias * 0.3));
  }
  return false;
}

function chooseStandardDie(state, userId, strategy, difficulty) {
  const tableData = getTableData(state);
  const phase = tableData.phase ?? "opening";
  if (phase === "opening") return 10;

  if (tableData.hunchLocked?.[userId]) return 20;
  if (tableData.goadBackfire?.[userId]?.forceD20) return 20;
  if (tableData.dared?.[userId]) return 8;

  const myTotal = Number(tableData.totals?.[userId] ?? 0);
  const highestOppVisible = Number(getHighestVisibleOpponent(state, userId)?.visibleTotal ?? 0);
  const gap = 21 - myTotal;
  const profile = getDifficultyProfile(difficulty);
  const riskBias = profile.riskBias;
  const reckless = riskBias > 0.15;

  if (strategy === "chaotic") return pickRandom(VALID_DICE) ?? 6;
  if (strategy === "duelist") {
    if (myTotal <= 10 && randomChance(clampProbability(0.25 + riskBias * 0.5))) return 20;
    if (gap <= 4) return 4;
    if (gap <= 7) return 8;
    if (gap <= 10) return 10;
    return randomChance(clampProbability(0.5 + riskBias * 0.4)) ? 20 : 10;
  }
  if (strategy === "tactician") {
    if (gap <= 3) return 4;
    if (gap <= 5) return 6;
    if (gap <= 7) return 8;
    if (gap <= 9) return 10;
    if (highestOppVisible >= 18 && myTotal <= 14) return 20;
    return 10;
  }
  if (strategy === "bully") {
    if (myTotal <= 11 && randomChance(clampProbability(0.2 + riskBias * 0.4))) return 20;
    if (gap <= 5) return 6;
    if (gap <= 8) return 8;
    if (gap <= 10) return 10;
    return 20;
  }
  if (strategy === "aggressive") {
    if (myTotal <= 10 && randomChance(clampProbability(0.35 + riskBias * 0.4))) return 20;
    if (gap <= 4) return 4;
    if (gap <= 6) return 6;
    if (gap <= 8) return 8;
    if (gap <= 10) return 10;
    return 20;
  }
  if (strategy === "conservative") {
    if (reckless && gap > 11 && myTotal <= 11) return 20;
    if (gap <= 4) return 4;
    if (gap <= 6) return 6;
    if (gap <= 8) return 8;
    return 10;
  }

  // balanced
  if (gap <= 4) return 4;
  if (gap <= 6) return 6;
  if (gap <= 8) return 8;
  if (gap <= 10) return 10;
  if (reckless && myTotal <= 11) return 20;
  return 20;
}

function canGoblinHold(state, userId) {
  const tableData = getTableData(state);
  if ((tableData.gameMode ?? "standard") !== "goblin") return false;
  if (tableData.currentPlayer !== userId) return false;
  if (tableData.busts?.[userId] || tableData.folded?.[userId]) return false;

  const rolls = tableData.rolls?.[userId] ?? [];
  if (!rolls.length) return false;

  const activeIds = state.turnOrder.filter((id) => !tableData.busts?.[id] && !tableData.folded?.[id] && !tableData.caught?.[id]);
  const myTotal = Number(tableData.totals?.[userId] ?? 0);
  const maxTotal = activeIds.length
    ? Math.max(...activeIds.map((id) => Number(tableData.totals?.[id] ?? 0)))
    : 0;

  return myTotal >= maxTotal;
}

function shouldHoldGoblin(state, userId, strategy, difficulty) {
  if (!canGoblinHold(state, userId)) return false;
  const tableData = getTableData(state);
  const myTotal = Number(tableData.totals?.[userId] ?? 0);
  const stageDie = Number(tableData.goblinStageDie ?? 20);
  const profile = getDifficultyProfile(difficulty);
  const cautionShift = Math.round(-profile.riskBias * 4);

  switch (strategy) {
    case "conservative":
      return myTotal >= Math.max(18, 20 + cautionShift);
    case "aggressive":
      return myTotal >= Math.max(22, 27 + cautionShift) || (stageDie <= 6 && myTotal >= Math.max(20, 24 + cautionShift));
    case "duelist":
      return myTotal >= Math.max(21, 25 + cautionShift) || (stageDie <= 4 && myTotal >= Math.max(19, 22 + cautionShift));
    case "tactician":
      return myTotal >= Math.max(19, 23 + cautionShift) || (stageDie <= 6 && myTotal >= Math.max(18, 21 + cautionShift));
    case "bully":
      return myTotal >= Math.max(23, 28 + cautionShift) || (stageDie <= 4 && myTotal >= Math.max(21, 25 + cautionShift));
    case "chaotic":
      return (myTotal >= Math.max(22, 26 + cautionShift) && randomChance(chanceWithChaosBias(0.25, difficulty)))
        || randomChance(chanceWithChaosBias(0.03, difficulty));
    default:
      return myTotal >= Math.max(20, 24 + cautionShift) || (stageDie <= 4 && myTotal >= Math.max(18, 21 + cautionShift));
  }
}

function shouldUseCut(state, userId, strategy, difficulty) {
  const tableData = getTableData(state);
  const hole = Number(tableData.rolls?.[userId]?.[1]?.result ?? 0);
  const profile = getDifficultyProfile(difficulty);
  const riskBias = profile.riskBias;
  if (strategy === "chaotic") return randomChance(chanceWithChaosBias(0.5, difficulty));
  if (strategy === "aggressive") return hole <= Math.max(4, 6 - Math.round(riskBias * 2));
  if (strategy === "conservative") return hole <= Math.max(3, 4 - Math.round(riskBias * 2));
  if (strategy === "duelist") return hole <= Math.max(4, 6 - Math.round(riskBias * 3));
  if (strategy === "tactician") return hole <= Math.max(3, 5 - Math.round(riskBias * 2));
  if (strategy === "bully") return hole <= Math.max(4, 6 - Math.round(riskBias * 3));
  return hole <= Math.max(3, 5 - Math.round(riskBias * 2));
}

async function runAction(action, payload, userId) {
  const beforeRevision = Number(getState()?.revision ?? 0);
  try {
    await handlePlayerAction(action, payload, userId);
  } catch (error) {
    console.warn(`Tavern Twenty-One | Autoplay failed to run action '${action}' for ${userId}:`, error);
    return false;
  }
  const afterRevision = Number(getState()?.revision ?? 0);
  return afterRevision > beforeRevision;
}

function chooseCheatPayload(state, userId, strategy, difficulty) {
  const tableData = getTableData(state);
  if (tableData.pendingAction !== "cheat_decision" || tableData.currentPlayer !== userId) return null;

  const rolls = tableData.rolls?.[userId] ?? [];
  if (!rolls.length) return null;

  const myTotal = Number(tableData.totals?.[userId] ?? 0);
  const highestOppVisible = Number(getHighestVisibleOpponent(state, userId)?.visibleTotal ?? 0);
  const heat = Number(tableData.playerHeat?.[userId] ?? tableData.heatDC ?? 10);
  const profile = getDifficultyProfile(difficulty);

  let baseCheatChance = 0.2;
  switch (strategy) {
    case "aggressive":
      baseCheatChance = 0.45;
      break;
    case "bully":
      baseCheatChance = 0.5;
      break;
    case "duelist":
      baseCheatChance = 0.32;
      break;
    case "tactician":
      baseCheatChance = 0.28;
      break;
    case "conservative":
      baseCheatChance = 0.08;
      break;
    case "chaotic":
      baseCheatChance = 0.3;
      break;
    default:
      baseCheatChance = 0.24;
      break;
  }

  let best = null;
  for (let dieIndex = 0; dieIndex < rolls.length; dieIndex++) {
    const roll = rolls[dieIndex];
    if (!roll || roll.blind) continue;
    const oldValue = Number(roll.result ?? 0);
    const dieMax = Number(roll.die ?? 0);

    for (const adjustment of [3, 2, 1, -1, -2, -3]) {
      const newValue = Math.max(1, Math.min(dieMax, oldValue + adjustment));
      if (newValue === oldValue) continue;
      const newTotal = myTotal - oldValue + newValue;

      // Favor outcomes that land safely near 21.
      let score = -Math.abs(21 - newTotal) * 6;
      if (newTotal > 21) score -= 60;
      if (myTotal > 21 && newTotal <= 21) score += 50;
      if (newTotal === 21) score += 44;
      else if (newTotal === 20) score += 24;
      else if (newTotal === 19) score += 10;

      if (newTotal >= highestOppVisible && myTotal < highestOppVisible) score += 12;
      if (adjustment > 0 && myTotal < 19) score += 4;
      if (adjustment < 0 && myTotal > 21) score += 16;

      if (!best || score > best.score) {
        best = { dieIndex, adjustment, score, newTotal };
      }
    }
  }

  if (!best) return null;
  if (best.newTotal > 21 && strategy !== "chaotic") return null;

  let finalChance = baseCheatChance * profile.cheatBias;
  if (heat <= 10) finalChance += 0.16;
  else if (heat >= 15) finalChance -= 0.2;
  if (best.newTotal >= 20) finalChance += 0.12;
  if (myTotal >= 20 && best.newTotal < myTotal && strategy !== "chaotic") finalChance -= 0.1;

  if (!randomChance(clampProbability(finalChance))) return null;
  return { dieIndex: best.dieIndex, adjustment: best.adjustment };
}

async function runStandardRollAndFinish(userId, die, strategy, difficulty) {
  const rolled = await runAction("roll", { die }, userId);
  if (!rolled) return false;

  const stateAfterRoll = getState();
  const tableData = getTableData(stateAfterRoll);
  if (
    stateAfterRoll.status === "PLAYING"
    && (tableData.gameMode ?? "standard") !== "goblin"
    && tableData.pendingAction === "cheat_decision"
    && tableData.currentPlayer === userId
  ) {
    const waitMs = Math.max(70, Math.floor(getDifficultyProfile(difficulty).delayMs * 0.7));
    await delay(waitMs);

    const cheatPayload = chooseCheatPayload(getState(), userId, strategy, difficulty);
    if (cheatPayload) {
      const cheated = await runAction("cheat", cheatPayload, userId);
      if (cheated) return true;
    }

    await runAction("finishTurn", {}, userId);
  }

  return true;
}

async function tryTurnSkill(state, userId, strategy, difficulty) {
  if (!canUseTurnSkill(state, userId)) return false;
  const tableData = getTableData(state);
  const myTotal = Number(tableData.totals?.[userId] ?? 0);
  const myVisible = Number(tableData.visibleTotals?.[userId] ?? 0);
  const myRollCount = (tableData.rolls?.[userId] ?? []).length;

  const hasHunched = tableData.usedSkills?.[userId]?.hunch === true;
  const hasProfiled = tableData.usedSkills?.[userId]?.profile === true;
  const hasGoaded = tableData.goadedThisRound?.[userId] || tableData.usedSkills?.[userId]?.goad === true;
  const hasBumped = tableData.bumpedThisRound?.[userId] || tableData.usedSkills?.[userId]?.bump === true;

  const canHunch = !hasHunched && !tableData.hunchLocked?.[userId];
  const canProfile = !hasProfiled;
  const canGoad = !hasGoaded;
  const canBump = !hasBumped;

  const profilePayload = canProfile ? pickProfilePayload(state, userId) : null;
  const goadPayload = canGoad ? pickGoadPayload(state, userId, strategy) : null;
  const bumpPayload = canBump ? pickBumpPayload(state, userId) : null;
  const highestOpp = getHighestVisibleOpponent(state, userId);
  const oppVisible = Number(highestOpp?.visibleTotal ?? 0);
  const oppHolding = Boolean(highestOpp?.isHolding);
  const profile = getDifficultyProfile(difficulty);
  const risky = profile.riskBias > 0.1;

  if (strategy === "aggressive") {
    if (goadPayload && oppHolding && randomChance(chanceWithSkillBias(0.45, difficulty))) {
      return runAction("goad", goadPayload, userId);
    }
    if (bumpPayload && myTotal <= 17 && randomChance(chanceWithSkillBias(0.35, difficulty))) {
      return runAction("bumpTable", bumpPayload, userId);
    }
    if (canHunch && myTotal <= 14 && randomChance(chanceWithSkillBias(0.25, difficulty))) {
      return runAction("hunch", {}, userId);
    }
    if (profilePayload && oppVisible >= 18 && randomChance(chanceWithSkillBias(0.15, difficulty))) {
      return runAction("profile", profilePayload, userId);
    }
    return false;
  }

  if (strategy === "conservative") {
    if (canHunch && myRollCount <= 2 && myTotal <= 14 && randomChance(chanceWithSkillBias(0.4, difficulty))) {
      return runAction("hunch", {}, userId);
    }
    if (profilePayload && oppVisible >= 18 && randomChance(chanceWithSkillBias(0.2, difficulty))) {
      return runAction("profile", profilePayload, userId);
    }
    if (goadPayload && oppHolding && oppVisible > myVisible + 2 && randomChance(chanceWithSkillBias(0.12, difficulty))) {
      return runAction("goad", goadPayload, userId);
    }
    return false;
  }

  if (strategy === "duelist") {
    if (goadPayload && oppHolding && oppVisible >= myVisible && randomChance(chanceWithSkillBias(0.42, difficulty))) {
      return runAction("goad", goadPayload, userId);
    }
    if (bumpPayload && oppVisible >= myVisible && randomChance(chanceWithSkillBias(0.28, difficulty))) {
      return runAction("bumpTable", bumpPayload, userId);
    }
    if (canHunch && myTotal <= 15 && randomChance(chanceWithSkillBias(0.26, difficulty))) {
      return runAction("hunch", {}, userId);
    }
    if (profilePayload && oppVisible >= 17 && randomChance(chanceWithSkillBias(0.24, difficulty))) {
      return runAction("profile", profilePayload, userId);
    }
    return false;
  }

  if (strategy === "tactician") {
    if (canHunch && myRollCount === 2 && myTotal <= 16 && randomChance(chanceWithSkillBias(0.62, difficulty))) {
      return runAction("hunch", {}, userId);
    }
    if (profilePayload && oppVisible >= 15 && randomChance(chanceWithSkillBias(0.36, difficulty))) {
      return runAction("profile", profilePayload, userId);
    }
    if (goadPayload && oppHolding && oppVisible > myVisible && randomChance(chanceWithSkillBias(0.22, difficulty))) {
      return runAction("goad", goadPayload, userId);
    }
    if (bumpPayload && myTotal <= 16 && randomChance(chanceWithSkillBias(0.17, difficulty))) {
      return runAction("bumpTable", bumpPayload, userId);
    }
    return false;
  }

  if (strategy === "bully") {
    if (goadPayload && randomChance(chanceWithSkillBias(0.58, difficulty))) {
      return runAction("goad", goadPayload, userId);
    }
    if (bumpPayload && randomChance(chanceWithSkillBias(0.46, difficulty))) {
      return runAction("bumpTable", bumpPayload, userId);
    }
    if (profilePayload && randomChance(chanceWithSkillBias(0.32, difficulty))) {
      return runAction("profile", profilePayload, userId);
    }
    if (canHunch && myTotal <= 17 && randomChance(chanceWithSkillBias(0.34, difficulty))) {
      return runAction("hunch", {}, userId);
    }
    return false;
  }

  if (strategy === "chaotic") {
    const options = [];
    if (canHunch) options.push({ action: "hunch", payload: {} });
    if (profilePayload) options.push({ action: "profile", payload: profilePayload });
    if (goadPayload) options.push({ action: "goad", payload: goadPayload });
    if (bumpPayload) options.push({ action: "bumpTable", payload: bumpPayload });
    if (!options.length || !randomChance(chanceWithChaosBias(0.45 + (risky ? 0.1 : 0), difficulty))) return false;
    const choice = pickRandom(options);
    return runAction(choice.action, choice.payload, userId);
  }

  // balanced
  if (canHunch && myRollCount === 2 && myTotal <= 16 && randomChance(chanceWithSkillBias(0.55, difficulty))) {
    return runAction("hunch", {}, userId);
  }
  if (profilePayload && oppVisible >= 16 && randomChance(chanceWithSkillBias(0.3, difficulty))) {
    return runAction("profile", profilePayload, userId);
  }
  if (goadPayload && oppHolding && oppVisible > myVisible && randomChance(chanceWithSkillBias(0.3, difficulty))) {
    return runAction("goad", goadPayload, userId);
  }
  if (bumpPayload && myTotal <= 16 && randomChance(chanceWithSkillBias(0.2, difficulty))) {
    return runAction("bumpTable", bumpPayload, userId);
  }
  return false;
}

async function runStandardTurn(state, userId, strategy, difficulty) {
  const tableData = getTableData(state);
  const phase = tableData.phase ?? "opening";

  if (tableData.pendingAction === "cheat_decision") {
    const cheatPayload = chooseCheatPayload(state, userId, strategy, difficulty);
    if (cheatPayload) {
      const cheated = await runAction("cheat", cheatPayload, userId);
      if (cheated) return true;
    }
    return runAction("finishTurn", {}, userId);
  }

  if (phase === "opening") {
    return runStandardRollAndFinish(userId, 10, strategy, difficulty);
  }

  if (phase !== "betting") return false;

  const usedSkill = await tryTurnSkill(state, userId, strategy, difficulty);
  if (usedSkill) return true;

  if (shouldFoldStandard(state, userId, strategy, difficulty)) {
    return runAction("fold", {}, userId);
  }
  if (shouldHoldStandard(state, userId, strategy, difficulty)) {
    return runAction("hold", {}, userId);
  }

  const die = chooseStandardDie(state, userId, strategy, difficulty);
  return runStandardRollAndFinish(userId, die, strategy, difficulty);
}

async function runGoblinTurn(state, userId, strategy, difficulty) {
  const tableData = getTableData(state);
  if ((tableData.gameMode ?? "standard") !== "goblin") return false;

  if (tableData.pendingAction === "goblin_hold" && tableData.currentPlayer === userId) {
    if (shouldHoldGoblin(state, userId, strategy, difficulty)) return runAction("hold", {}, userId);
    return runAction("goblinContinue", {}, userId);
  }

  if (tableData.currentPlayer !== userId || tableData.phase !== "betting") return false;

  const boots = Number(tableData.goblinBoots?.[userId] ?? 0);
  if (boots > 0) {
    const bootTargets = getValidBootTargets(state, userId);
    if (bootTargets.length > 0) {
      const profile = getDifficultyProfile(difficulty);
      let bootChance = 0.15;
      if (strategy === "aggressive") bootChance = 0.4;
      else if (strategy === "balanced") bootChance = 0.25;
      else if (strategy === "chaotic") bootChance = 0.5;
      else if (strategy === "duelist") bootChance = 0.34;
      else if (strategy === "tactician") bootChance = 0.28;
      else if (strategy === "bully") bootChance = 0.48;

      bootChance = clampProbability(bootChance * profile.skillBias + profile.chaosBias * 0.5);

      if (randomChance(bootChance)) {
        const sorted = bootTargets.sort(
          (a, b) => Number(tableData.totals?.[b.id] ?? 0) - Number(tableData.totals?.[a.id] ?? 0)
        );
        const target = sorted[0];
        if (target?.id) return runAction("boot", { targetId: target.id }, userId);
      }
    }
  }

  const stageDie = Number(tableData.goblinStageDie ?? 20);
  return runAction("roll", { die: stageDie }, userId);
}

async function runSingleStep() {
  if (!isThisActiveGM()) return false;

  const state = getState();
  const tableData = getTableData(state);

  if (state.status === "DUEL") {
    const duel = tableData.duel;
    if (!duel?.active) return false;
    const pendingRolls = Array.isArray(duel.pendingRolls) ? duel.pendingRolls : [];
    if (!pendingRolls.length) return false;

    const autoplayPending = pendingRolls.filter((id) => isAutoplayEnabled(state, id));
    if (!autoplayPending.length) return false;

    const nextDuelRoller = autoplayPending.find((id) => state.players?.[id]?.isAi) ?? autoplayPending[0];
    if (!nextDuelRoller) return false;

    return runAction("duelRoll", {}, nextDuelRoller);
  }

  if (state.status === "INSPECTION") {
    const nonHousePlayers = state.turnOrder.filter((id) => !isActingAsHouse(id, state));
    const canAutoResolve = nonHousePlayers.length > 0 && nonHousePlayers.every((id) => isAutoplayEnabled(state, id));
    if (canAutoResolve) {
      return runAction("skipInspection", {}, game.user.id);
    }
    return false;
  }

  if (state.status !== "PLAYING") return false;

  const pendingRetaliation = tableData.pendingBumpRetaliation;
  if (pendingRetaliation?.targetId && isAutoplayEnabled(state, pendingRetaliation.targetId)) {
    const dieIndex = chooseRetaliationDieIndex(state, pendingRetaliation.attackerId);
    return runAction("bumpRetaliation", { dieIndex }, pendingRetaliation.targetId);
  }

  const currentId = tableData.currentPlayer;
  if (!currentId || !isAutoplayEnabled(state, currentId)) return false;

  const { strategy, difficulty } = getAutoplayConfig(state, currentId);

  if (tableData.phase === "cut" && tableData.theCutPlayer === currentId) {
    const reroll = shouldUseCut(state, currentId, strategy, difficulty);
    return runAction("useCut", { reroll }, currentId);
  }

  if ((tableData.gameMode ?? "standard") === "goblin") {
    return runGoblinTurn(state, currentId, strategy, difficulty);
  }

  return runStandardTurn(state, currentId, strategy, difficulty);
}

async function runAutoplayLoop() {
  if (!isThisActiveGM()) return;
  if (running) {
    queued = true;
    return;
  }

  running = true;
  try {
    for (let i = 0; i < MAX_ACTIONS_PER_CYCLE; i++) {
      const acted = await runSingleStep();
      if (!acted) break;
      await delay(getActionDelayMsForState(getState()));
    }
  } catch (error) {
    console.warn("Tavern Twenty-One | Autoplay loop error:", error);
  } finally {
    running = false;
    if (queued) {
      queued = false;
      requestAutoplayTick(getActionDelayMsForState(getState()));
    }
  }
}

export function requestAutoplayTick(delayMs = DEFAULT_ACTION_DELAY_MS) {
  if (!game.user?.isGM) return;
  if (!isThisActiveGM()) return;
  if (running) {
    queued = true;
    return;
  }
  if (runTimer) return;

  runTimer = setTimeout(() => {
    runTimer = null;
    void runAutoplayLoop();
  }, Math.max(0, Number(delayMs) || DEFAULT_ACTION_DELAY_MS));
}
