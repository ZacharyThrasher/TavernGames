import { updateState, addHistoryEntry, addLogToAll } from "../../state.js";
import { tavernSocket } from "../../socket.js";
import { getActorName, getSafeActorName } from "../utils/actors.js";
import { notifyUser } from "../utils/game-logic.js";
import { revealDice } from "../phases/core.js";
import { GOBLIN_STAGE_DICE } from "../constants.js";
import { REVEAL_DURATION } from "../../ui/dice-reveal.js";

function getStageDie(tableData) {
  if (tableData.goblinSuddenDeathActive) return 2;
  if (Number.isFinite(tableData.goblinStageDie)) return tableData.goblinStageDie;
  const index = Number.isInteger(tableData.goblinStageIndex) ? tableData.goblinStageIndex : 0;
  return GOBLIN_STAGE_DICE[index] ?? 20;
}

function getOrder(state, tableData) {
  return tableData.bettingOrder ?? state.turnOrder;
}

function getActivePlayers(state, tableData) {
  return getOrder(state, tableData)
    .filter(id => !tableData.busts?.[id] && !tableData.folded?.[id] && !tableData.caught?.[id]);
}

function getRollingPlayers(state, tableData) {
  return getActivePlayers(state, tableData).filter(id => !tableData.holds?.[id]);
}

function normalizeRemaining(state, tableData, remaining) {
  const set = new Set(remaining);
  return getOrder(state, tableData).filter(id => set.has(id));
}

function getNextStagePlayer(state, tableData) {
  const remaining = tableData.goblinStageRemaining ?? [];
  if (!remaining.length) return null;
  const order = getOrder(state, tableData);
  const currentIndex = tableData.currentPlayer ? order.indexOf(tableData.currentPlayer) : -1;
  for (let i = 1; i <= order.length; i++) {
    const nextId = order[(currentIndex + i) % order.length];
    if (remaining.includes(nextId)) return nextId;
  }
  return remaining[0];
}

function getLeaders(state, tableData) {
  const active = getActivePlayers(state, tableData);
  if (!active.length) return { max: -Infinity, leaders: [] };
  const max = Math.max(...active.map(id => Number(tableData.totals?.[id] ?? 0)));
  const leaders = active.filter(id => Number(tableData.totals?.[id] ?? 0) === max);
  return { max, leaders };
}

function shouldTriggerLastRollWin(state, tableData, userId) {
  const rollingPlayers = getRollingPlayers(state, tableData);
  if (rollingPlayers.length !== 1 || rollingPlayers[0] !== userId) return false;
  const { leaders } = getLeaders(state, tableData);
  return leaders.length === 1 && leaders[0] === userId;
}

function shouldOfferHoldOption(state, tableData, userId) {
  if (tableData.holds?.[userId]) return false;
  if (tableData.busts?.[userId] || tableData.folded?.[userId] || tableData.caught?.[userId]) return false;
  const myRolls = tableData.rolls?.[userId] ?? [];
  if (myRolls.length === 0) return false;
  const { max } = getLeaders(state, tableData);
  const myTotal = Number(tableData.totals?.[userId] ?? 0);
  return myTotal >= max;
}

async function advanceStageIfNeeded(state, tableData) {
  let updatedTable = { ...tableData };
  const remaining = updatedTable.goblinStageRemaining ?? [];

  if (remaining.length > 0) {
    updatedTable.currentPlayer = getNextStagePlayer(state, updatedTable);
    return { tableData: updatedTable, action: null };
  }

  const rollingPlayers = getRollingPlayers(state, updatedTable);

  if (updatedTable.goblinSuddenDeathActive) {
    if (rollingPlayers.length === 0) return { tableData: updatedTable, action: "finish" };

    const nextRemaining = normalizeRemaining(state, updatedTable, rollingPlayers);
    updatedTable.goblinSuddenDeathParticipants = nextRemaining;
    updatedTable.goblinSuddenDeathRemaining = nextRemaining;
    updatedTable.goblinStageRemaining = nextRemaining;
    updatedTable.currentPlayer = nextRemaining[0] ?? null;
    return { tableData: updatedTable, action: "coin-continue" };
  }

  if (rollingPlayers.length === 0) {
    return { tableData: updatedTable, action: "finish" };
  }

  const stageIndex = Number.isInteger(updatedTable.goblinStageIndex) ? updatedTable.goblinStageIndex : 0;
  const stageDie = GOBLIN_STAGE_DICE[stageIndex] ?? 20;
  if (stageDie === 4) {
    const nextRemaining = normalizeRemaining(state, updatedTable, rollingPlayers);
    updatedTable.goblinSuddenDeathActive = true;
    updatedTable.goblinSuddenDeathParticipants = nextRemaining;
    updatedTable.goblinSuddenDeathRemaining = nextRemaining;
    updatedTable.goblinStageRemaining = nextRemaining;
    updatedTable.goblinStageDie = 2;
    updatedTable.currentPlayer = nextRemaining[0] ?? null;
    return { tableData: updatedTable, action: "coin-start" };
  }

  const nextIndex = Math.min(stageIndex + 1, GOBLIN_STAGE_DICE.length - 1);
  const nextDie = GOBLIN_STAGE_DICE[nextIndex];
  const nextRemaining = normalizeRemaining(state, updatedTable, getRollingPlayers(state, updatedTable));

  updatedTable.goblinStageIndex = nextIndex;
  updatedTable.goblinStageDie = nextDie;
  updatedTable.goblinStageRemaining = nextRemaining;
  updatedTable.currentPlayer = nextRemaining[0] ?? null;

  return { tableData: updatedTable, action: "stage-advance", nextDie };
}

async function finalizeGoblinTurn(state, tableData) {
  let updatedTable = { ...tableData, pendingAction: null };

  const remaining = updatedTable.goblinStageRemaining ?? [];
  updatedTable.goblinStageRemaining = remaining.filter(id => id !== updatedTable.currentPlayer);
  if (updatedTable.goblinSuddenDeathActive) {
    const suddenRemaining = updatedTable.goblinSuddenDeathRemaining ?? [];
    updatedTable.goblinSuddenDeathRemaining = suddenRemaining.filter(id => id !== updatedTable.currentPlayer);
  }
  updatedTable.currentPlayer = getNextStagePlayer(state, updatedTable);
  updatedTable.skillUsedThisTurn = false;
  updatedTable.lastSkillUsed = null;

  const progress = await advanceStageIfNeeded(state, updatedTable);
  updatedTable = progress.tableData;

  const next = await updateState({ tableData: updatedTable });

  if (progress.action === "stage-advance") {
    await addLogToAll({
      title: "The Chamber Shrinks",
      message: `Next Stage: <strong>d${updatedTable.goblinStageDie}</strong>.`,
      icon: "fa-solid fa-skull",
      type: "phase"
    });
  } else if (progress.action === "coin-start") {
    await addLogToAll({
      title: "THE COIN",
      message: `The Chamber reaches the <strong>Coin</strong>. Only the bold keep rolling.`,
      icon: "fa-solid fa-bolt",
      type: "phase"
    });
    tavernSocket.executeForEveryone("showSkillCutIn", "COIN_STAGE");
  } else if (progress.action === "coin-continue") {
    await addLogToAll({
      title: "The Coin Spins",
      message: `The Chamber demands another flip.`,
      icon: "fa-solid fa-bolt",
      type: "phase"
    });
  }

  if (progress.action === "finish") return revealDice();

  return next;
}

export async function submitGoblinRoll({ state, tableData, userId, die }) {
  const stageDie = getStageDie(tableData);
  if (Number(die) !== stageDie) {
    await notifyUser(userId, `The Chamber demands a d${stageDie}.`);
    return state;
  }

  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  if (tableData.pendingAction === "goblin_hold") {
    await notifyUser(userId, "Decide to Hold or Continue before rolling again.");
    return state;
  }

  let stageRemaining = tableData.goblinStageRemaining ?? [];
  if (stageRemaining.length === 0) {
    stageRemaining = normalizeRemaining(state, tableData, getRollingPlayers(state, tableData));
    tableData.goblinStageRemaining = stageRemaining;
  }
  if (!stageRemaining.includes(userId)) {
    await notifyUser(userId, "You've already rolled this stage.");
    return state;
  }

  const roll = await new Roll(`1d${stageDie}`).evaluate();
  const result = roll.total;

  // V5.23: Fortune's Reveal — public cinematic reveal for goblin rolls
  try {
    const isCoinDeath = stageDie === 2 && result === 1;
    const isBust = result === 1;
    const isExplode = stageDie === 20 && result === 20;
    tavernSocket.executeForEveryone("showDiceReveal", userId, stageDie, result, {
      isCoinDeath,
      isBust,
      isExplode,
    });
    await new Promise(r => setTimeout(r, REVEAL_DURATION));
  } catch (e) { console.warn("Tavern | Dice Reveal Error:", e); }

  const rolls = { ...tableData.rolls };
  const existingRolls = rolls[userId] ?? [];
  const priorCoinRolls = existingRolls.filter(r => r.die === 2).length;
  let coinValue = null;
  if (stageDie === 2 && result === 2) {
    coinValue = 2 * Math.pow(2, priorCoinRolls);
  }

  if (stageDie === 2) {
    try {
      await tavernSocket.executeForEveryone("showCoinFlip", userId, result, coinValue ?? 2);
    } catch (e) { }
  }
  
  const totals = { ...tableData.totals };
  const visibleTotals = { ...tableData.visibleTotals };
  const busts = { ...tableData.busts };
  const holds = { ...tableData.holds };
  const goblinBoots = { ...tableData.goblinBoots };
  rolls[userId] = [...existingRolls, { die: stageDie, result, public: true, blind: false, coinValue }];

  const previousTotal = Number(totals[userId] ?? 0);
  let currentTotal = previousTotal;
  let busted = false;
  let message = "";
  let logMessage = "";
  let logTitle = "Roll";
  let logType = "roll";
  let cssClass = "";

  const userName = getActorName(userId);
  const safeUserName = getSafeActorName(userId);

  if (result === 1) {
    busted = true;
    currentTotal = 0;
    totals[userId] = 0;
    visibleTotals[userId] = 0;
    busts[userId] = true;
    delete holds[userId];
    message = stageDie === 2
      ? `${userName} flipped TAILS and DIED.`
      : `${userName} rolled a 1 on d${stageDie} and DIED.`;
    logMessage = stageDie === 2
      ? `${safeUserName} flipped TAILS and DIED.`
      : `${safeUserName} rolled a 1 on d${stageDie} and DIED.`;
    logTitle = "BUST!";
    logType = "bust";
    cssClass = "failure";

    try {
      await tavernSocket.executeForEveryone("showBustFanfare", userId);
    } catch (e) { }
  } else {
    if (stageDie === 2) {
      const bonus = coinValue ?? 2;
      currentTotal = previousTotal + bonus;
      message = `${userName} flipped HEADS for +${bonus}. Total: ${currentTotal}.`;
      logMessage = `${safeUserName} flipped HEADS for +${bonus}. Total: ${currentTotal}.`;
    } else {
      currentTotal = previousTotal + result;
      message = `${userName} rolled ${result} on d${stageDie}. Total: ${currentTotal}.`;
      logMessage = `${safeUserName} rolled ${result} on d${stageDie}. Total: ${currentTotal}.`;
    }
    totals[userId] = currentTotal;
    visibleTotals[userId] = currentTotal;

    if (stageDie !== 2 && result === stageDie) {
      goblinBoots[userId] = (goblinBoots[userId] ?? 0) + 1;
      message += ` Boot earned!`;
      logMessage += ` <strong>Boot earned!</strong>`;
      cssClass = "success";
      try {
        await tavernSocket.executeForEveryone("showSkillCutIn", "BOOT_EARNED", userId);
      } catch (e) { }
    }

    try {
      await tavernSocket.executeForEveryone("showScoreSurge", userId, {
        from: previousTotal,
        to: currentTotal,
        delta: currentTotal - previousTotal,
        multiplied: false
      });
    } catch (e) { }
  }

  await addLogToAll({
    title: logTitle,
    message: logMessage || message,
    icon: "fa-solid fa-dice",
    type: logType,
    cssClass
  });

  await addHistoryEntry({
    type: logType,
    player: userName,
    die: `d${stageDie}`,
    result,
    total: currentTotal,
    message
  });

  let updatedTable = {
    ...tableData,
    rolls,
    totals,
    visibleTotals,
    busts,
    holds,
    goblinBoots,
    hasActed: { ...tableData.hasActed, [userId]: true },
    pendingAction: null
  };

  if (!busted && shouldTriggerLastRollWin(state, updatedTable, userId)) {
    await updateState({ tableData: updatedTable });
    return revealDice();
  }

  if (!busted && shouldOfferHoldOption(state, updatedTable, userId)) {
    updatedTable.pendingAction = "goblin_hold";
    updatedTable.currentPlayer = userId;
    return updateState({ tableData: updatedTable });
  }

  return finalizeGoblinTurn(state, updatedTable);
}

export async function holdGoblin({ state, tableData, userId }) {
  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  if (tableData.folded?.[userId] || tableData.busts?.[userId]) {
    await notifyUser(userId, "You've already finished this round.");
    return state;
  }

  const myRolls = tableData.rolls?.[userId] ?? [];
  if (myRolls.length === 0) {
    await notifyUser(userId, "You must roll before holding.");
    return state;
  }

  const { max } = getLeaders(state, tableData);
  const myTotal = Number(tableData.totals?.[userId] ?? 0);
  if (myTotal < max) {
    await notifyUser(userId, "Only the current leader can Hold.");
    return state;
  }

  const holds = { ...tableData.holds, [userId]: true };
  const goblinHoldStage = { ...tableData.goblinHoldStage, [userId]: getStageDie(tableData) };
  const goblinStageRemaining = (tableData.goblinStageRemaining ?? []).filter(id => id !== userId);

  let updatedTable = {
    ...tableData,
    holds,
    goblinHoldStage,
    goblinStageRemaining,
    pendingAction: null,
    skillUsedThisTurn: false,
    lastSkillUsed: null
  };

  const progress = await advanceStageIfNeeded(state, updatedTable);
  updatedTable = progress.tableData;

  updatedTable.currentPlayer = updatedTable.currentPlayer ?? getNextStagePlayer(state, updatedTable);

  const userName = getActorName(userId);
  const safeUserName = getSafeActorName(userId);
  await addLogToAll({
    title: "Hold",
    message: `${safeUserName} holds at ${tableData.totals?.[userId] ?? 0}.`,
    icon: "fa-solid fa-hand",
    type: "hold"
  });

  await addHistoryEntry({
    type: "hold",
    player: userName,
    total: tableData.totals?.[userId] ?? 0,
    message: `${userName} holds at ${tableData.totals?.[userId] ?? 0}.`
  });

  const next = await updateState({ tableData: updatedTable });

  if (progress.action === "stage-advance") {
    await addLogToAll({
      title: "The Chamber Shrinks",
      message: `Next Stage: <strong>d${updatedTable.goblinStageDie}</strong>.`,
      icon: "fa-solid fa-skull",
      type: "phase"
    });
  } else if (progress.action === "coin-start") {
    await addLogToAll({
      title: "THE COIN",
      message: `The Chamber reaches the <strong>Coin</strong>. Only the bold keep rolling.`,
      icon: "fa-solid fa-bolt",
      type: "phase"
    });
    tavernSocket.executeForEveryone("showSkillCutIn", "COIN_STAGE");
  }

  if (progress.action === "finish") return revealDice();

  return next;
}

export async function continueGoblinTurn({ state, tableData, userId }) {
  if ((tableData.gameMode ?? "standard") !== "goblin") {
    await notifyUser(userId, "Goblin continue is only available in Goblin Mode.");
    return state;
  }

  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  if (tableData.pendingAction !== "goblin_hold") {
    await notifyUser(userId, "No hold decision pending.");
    return state;
  }

  const updatedTable = { ...tableData, pendingAction: null };
  return finalizeGoblinTurn(state, updatedTable);
}

export async function bootGoblin({ state, tableData, userId, targetId }) {
  if ((tableData.gameMode ?? "standard") !== "goblin") {
    await notifyUser(userId, "Boots are only available in Goblin Mode.");
    return state;
  }

  if (!targetId) {
    await notifyUser(userId, "Select a target to boot.");
    return state;
  }
  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  const boots = tableData.goblinBoots?.[userId] ?? 0;
  if (boots <= 0) {
    await notifyUser(userId, "You have no Boots.");
    return state;
  }

  if (!tableData.holds?.[targetId]) {
    await notifyUser(userId, "That player isn't holding.");
    return state;
  }

  if (tableData.busts?.[targetId] || tableData.folded?.[targetId] || tableData.caught?.[targetId]) {
    await notifyUser(userId, "That player is out of the round.");
    return state;
  }

  const holds = { ...tableData.holds };
  delete holds[targetId];

  const goblinHoldStage = { ...tableData.goblinHoldStage };
  delete goblinHoldStage[targetId];

  const goblinBoots = { ...tableData.goblinBoots, [userId]: Math.max(0, boots - 1) };
  const stageRemaining = tableData.goblinStageRemaining ?? [];
  const updatedRemaining = normalizeRemaining(state, tableData, [...stageRemaining, targetId]);

  const updatedTable = {
    ...tableData,
    holds,
    goblinHoldStage,
    goblinBoots,
    goblinStageRemaining: updatedRemaining
  };

  const userName = getActorName(userId);
  const targetName = getActorName(targetId);
  const safeUserName = getSafeActorName(userId);
  const safeTargetName = getSafeActorName(targetId);
  await addLogToAll({
    title: "Boot!",
    message: `<strong>${safeUserName}</strong> kicks <strong>${safeTargetName}</strong> back into the Chamber!`,
    icon: "fa-solid fa-shoe-prints",
    type: "phase"
  });

  try {
    await tavernSocket.executeForEveryone("showSkillCutIn", "BOOT", userId, targetId);
  } catch (e) { }

  await addHistoryEntry({
    type: "phase",
    player: userName,
    message: `${userName} booted ${targetName} back into the Chamber.`
  });

  return updateState({ tableData: updatedTable });
}
