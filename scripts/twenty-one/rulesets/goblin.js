import { updateState, addHistoryEntry, addLogToAll } from "../../state.js";
import { tavernSocket } from "../../socket.js";
import { getActorName } from "../utils/actors.js";
import { notifyUser } from "../utils/game-logic.js";
import { revealDice } from "../phases/core.js";
import { showPublicRollFromData } from "../../dice.js";
import { GOBLIN_STAGE_DICE } from "../constants.js";

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

async function advanceStageIfNeeded(state, tableData) {
  let updatedTable = { ...tableData };
  const remaining = updatedTable.goblinStageRemaining ?? [];

  if (remaining.length > 0) {
    updatedTable.currentPlayer = getNextStagePlayer(state, updatedTable);
    return { tableData: updatedTable, action: null };
  }

  const rollingPlayers = getRollingPlayers(state, updatedTable);
  const { leaders } = getLeaders(state, updatedTable);

  if (updatedTable.goblinSuddenDeathActive) {
    if (leaders.length <= 1) return { tableData: updatedTable, action: "finish" };

    const nextRemaining = normalizeRemaining(state, updatedTable, leaders);
    updatedTable.goblinSuddenDeathParticipants = leaders;
    updatedTable.goblinSuddenDeathRemaining = nextRemaining;
    updatedTable.goblinStageRemaining = nextRemaining;
    updatedTable.currentPlayer = nextRemaining[0] ?? null;
    return { tableData: updatedTable, action: "sudden-death-continue", leaders };
  }

  if (rollingPlayers.length === 0) {
    if (leaders.length > 1) {
      const updatedHolds = { ...updatedTable.holds };
      for (const id of leaders) delete updatedHolds[id];
      const nextRemaining = normalizeRemaining(state, updatedTable, leaders);
      updatedTable.goblinSuddenDeathActive = true;
      updatedTable.goblinSuddenDeathParticipants = leaders;
      updatedTable.goblinSuddenDeathRemaining = nextRemaining;
      updatedTable.goblinStageRemaining = nextRemaining;
      updatedTable.goblinStageDie = 2;
      updatedTable.holds = updatedHolds;
      updatedTable.currentPlayer = nextRemaining[0] ?? null;
      return { tableData: updatedTable, action: "sudden-death-start", leaders };
    }
    return { tableData: updatedTable, action: "finish" };
  }

  const stageIndex = Number.isInteger(updatedTable.goblinStageIndex) ? updatedTable.goblinStageIndex : 0;
  const stageDie = GOBLIN_STAGE_DICE[stageIndex] ?? 20;
  if (stageDie === 4) {
    if (leaders.length > 1) {
      const updatedHolds = { ...updatedTable.holds };
      for (const id of leaders) delete updatedHolds[id];
      const nextRemaining = normalizeRemaining(state, updatedTable, leaders);
      updatedTable.goblinSuddenDeathActive = true;
      updatedTable.goblinSuddenDeathParticipants = leaders;
      updatedTable.goblinSuddenDeathRemaining = nextRemaining;
      updatedTable.goblinStageRemaining = nextRemaining;
      updatedTable.goblinStageDie = 2;
      updatedTable.holds = updatedHolds;
      updatedTable.currentPlayer = nextRemaining[0] ?? null;
      return { tableData: updatedTable, action: "sudden-death-start", leaders };
    }
    return { tableData: updatedTable, action: "finish" };
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

export async function submitGoblinRoll({ state, tableData, userId, die }) {
  const stageDie = getStageDie(tableData);
  if (Number(die) !== stageDie) {
    ui.notifications.warn(`The Chamber demands a d${stageDie}.`);
    return state;
  }

  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  let stageRemaining = tableData.goblinStageRemaining ?? [];
  if (stageRemaining.length === 0) {
    stageRemaining = normalizeRemaining(state, tableData, getRollingPlayers(state, tableData));
    tableData.goblinStageRemaining = stageRemaining;
  }
  if (!stageRemaining.includes(userId)) {
    ui.notifications.warn("You've already rolled this stage.");
    return state;
  }

  const roll = await new Roll(`1d${stageDie}`).evaluate();
  const result = roll.total;

  try {
    await showPublicRollFromData(Number(stageDie), Number(result), userId);
  } catch (e) { }

  if (stageDie === 2) {
    try {
      await tavernSocket.executeForEveryone("showCoinFlip", userId, result);
    } catch (e) { }
  }

  const rolls = { ...tableData.rolls };
  const totals = { ...tableData.totals };
  const visibleTotals = { ...tableData.visibleTotals };
  const busts = { ...tableData.busts };
  const holds = { ...tableData.holds };
  const goblinBoots = { ...tableData.goblinBoots };

  const existingRolls = rolls[userId] ?? [];
  rolls[userId] = [...existingRolls, { die: stageDie, result, public: true, blind: false }];

  const previousTotal = Number(totals[userId] ?? 0);
  let currentTotal = previousTotal;
  let busted = false;
  let message = "";
  let logTitle = "Roll";
  let logType = "roll";
  let cssClass = "";

  if (result === 1) {
    busted = true;
    currentTotal = 0;
    totals[userId] = 0;
    visibleTotals[userId] = 0;
    busts[userId] = true;
    delete holds[userId];
    message = stageDie === 2
      ? `${getActorName(userId)} flipped TAILS and DIED.`
      : `${getActorName(userId)} rolled a 1 on d${stageDie} and DIED.`;
    logTitle = "BUST!";
    logType = "bust";
    cssClass = "failure";

    try {
      await tavernSocket.executeForEveryone("showBustFanfare", userId);
    } catch (e) { }
  } else {
    if (stageDie === 2) {
      currentTotal = previousTotal + 2;
      message = `${getActorName(userId)} flipped HEADS for +2. Total: ${currentTotal}.`;
    } else {
      currentTotal = previousTotal + result;
      message = `${getActorName(userId)} rolled ${result} on d${stageDie}. Total: ${currentTotal}.`;
    }
    totals[userId] = currentTotal;
    visibleTotals[userId] = currentTotal;

    if (stageDie !== 2 && result === stageDie) {
      goblinBoots[userId] = (goblinBoots[userId] ?? 0) + 1;
      message += ` <strong>Boot earned!</strong>`;
      cssClass = "success";
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
    message,
    icon: "fa-solid fa-dice",
    type: logType,
    cssClass
  });

  await addHistoryEntry({
    type: logType,
    player: getActorName(userId),
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

  const remaining = updatedTable.goblinStageRemaining ?? [];
  updatedTable.goblinStageRemaining = remaining.filter(id => id !== userId);
  if (updatedTable.goblinSuddenDeathActive) {
    const suddenRemaining = updatedTable.goblinSuddenDeathRemaining ?? [];
    updatedTable.goblinSuddenDeathRemaining = suddenRemaining.filter(id => id !== userId);
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
  } else if (progress.action === "sudden-death-start") {
    await addLogToAll({
      title: "SUDDEN DEATH",
      message: `<strong>${progress.leaders.map(id => getActorName(id)).join(" vs ")}</strong> are tied!<br><em>The coin decides.</em>`,
      icon: "fa-solid fa-bolt",
      type: "phase"
    });
    tavernSocket.executeForEveryone("showSkillCutIn", "SUDDEN_DEATH", progress.leaders[0], progress.leaders[1]);
  } else if (progress.action === "sudden-death-continue") {
    await addLogToAll({
      title: "Sudden Death Continues",
      message: `Tie persists. The coin flips again.`,
      icon: "fa-solid fa-bolt",
      type: "phase"
    });
  }

  if (progress.action === "finish") return revealDice();

  return next;
}

export async function holdGoblin({ state, tableData, userId }) {
  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  if (tableData.folded?.[userId] || tableData.busts?.[userId]) {
    ui.notifications.warn("You've already finished this round.");
    return state;
  }

  if (tableData.goblinSuddenDeathActive) {
    await notifyUser(userId, "No holding in Sudden Death.");
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
    skillUsedThisTurn: false,
    lastSkillUsed: null
  };

  const progress = await advanceStageIfNeeded(state, updatedTable);
  updatedTable = progress.tableData;

  updatedTable.currentPlayer = updatedTable.currentPlayer ?? getNextStagePlayer(state, updatedTable);

  const userName = getActorName(userId);
  await addLogToAll({
    title: "Hold",
    message: `${userName} holds at ${tableData.totals?.[userId] ?? 0}.`,
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
  } else if (progress.action === "sudden-death-start") {
    await addLogToAll({
      title: "SUDDEN DEATH",
      message: `<strong>${progress.leaders.map(id => getActorName(id)).join(" vs ")}</strong> are tied!<br><em>The coin decides.</em>`,
      icon: "fa-solid fa-bolt",
      type: "phase"
    });
    tavernSocket.executeForEveryone("showSkillCutIn", "SUDDEN_DEATH", progress.leaders[0], progress.leaders[1]);
  }

  if (progress.action === "finish") return revealDice();

  return next;
}

export async function bootGoblin({ state, tableData, userId, targetId }) {
  if ((tableData.gameMode ?? "standard") !== "goblin") {
    ui.notifications.warn("Boots are only available in Goblin Mode.");
    return state;
  }

  if (!targetId) {
    ui.notifications.warn("Select a target to boot.");
    return state;
  }
  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  const boots = tableData.goblinBoots?.[userId] ?? 0;
  if (boots <= 0) {
    ui.notifications.warn("You have no Boots.");
    return state;
  }

  if (!tableData.holds?.[targetId]) {
    ui.notifications.warn("That player isn't holding.");
    return state;
  }

  if (tableData.busts?.[targetId] || tableData.folded?.[targetId] || tableData.caught?.[targetId]) {
    ui.notifications.warn("That player is out of the round.");
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
  await addLogToAll({
    title: "Boot!",
    message: `<strong>${userName}</strong> kicks <strong>${targetName}</strong> back into the Chamber!`,
    icon: "fa-solid fa-shoe-prints",
    type: "phase"
  });

  await addHistoryEntry({
    type: "phase",
    player: userName,
    message: `${userName} booted ${targetName} back into the Chamber.`
  });

  return updateState({ tableData: updatedTable });
}
