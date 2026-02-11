import { GOBLIN_STAGE_DICE } from "../constants.js";

export function getGoblinStageDie(tableData = {}) {
  if (tableData.goblinSuddenDeathActive) return 2;
  if (Number.isFinite(tableData.goblinStageDie)) return tableData.goblinStageDie;
  const index = Number.isInteger(tableData.goblinStageIndex) ? tableData.goblinStageIndex : 0;
  return GOBLIN_STAGE_DICE[index] ?? 20;
}

export function getGoblinOrder(turnOrder = [], tableData = {}) {
  return Array.isArray(tableData.bettingOrder) && tableData.bettingOrder.length > 0
    ? [...tableData.bettingOrder]
    : [...turnOrder];
}

export function getGoblinActivePlayers(turnOrder = [], tableData = {}) {
  const order = getGoblinOrder(turnOrder, tableData);
  return order.filter((id) => !tableData.busts?.[id] && !tableData.folded?.[id] && !tableData.caught?.[id]);
}

export function getGoblinRollingPlayers(turnOrder = [], tableData = {}) {
  return getGoblinActivePlayers(turnOrder, tableData).filter((id) => !tableData.holds?.[id]);
}

export function normalizeGoblinRemaining(turnOrder = [], tableData = {}, remaining = []) {
  const remainingSet = new Set(Array.isArray(remaining) ? remaining : []);
  return getGoblinOrder(turnOrder, tableData).filter((id) => remainingSet.has(id));
}

export function getGoblinNextStagePlayer(turnOrder = [], tableData = {}) {
  const remaining = tableData.goblinStageRemaining ?? [];
  if (!remaining.length) return null;
  const order = getGoblinOrder(turnOrder, tableData);
  const currentIndex = tableData.currentPlayer ? order.indexOf(tableData.currentPlayer) : -1;
  for (let i = 1; i <= order.length; i += 1) {
    const nextId = order[(currentIndex + i) % order.length];
    if (remaining.includes(nextId)) return nextId;
  }
  return remaining[0];
}

export function getGoblinLeaders(turnOrder = [], tableData = {}) {
  const active = getGoblinActivePlayers(turnOrder, tableData);
  if (!active.length) return { max: -Infinity, leaders: [] };
  const max = Math.max(...active.map((id) => Number(tableData.totals?.[id] ?? 0)));
  const leaders = active.filter((id) => Number(tableData.totals?.[id] ?? 0) === max);
  return { max, leaders };
}

export function shouldTriggerGoblinLastRollWin(turnOrder = [], tableData = {}, userId) {
  const rollingPlayers = getGoblinRollingPlayers(turnOrder, tableData);
  if (rollingPlayers.length !== 1 || rollingPlayers[0] !== userId) return false;
  const { leaders } = getGoblinLeaders(turnOrder, tableData);
  return leaders.length === 1 && leaders[0] === userId;
}

export function shouldOfferGoblinHoldOption(turnOrder = [], tableData = {}, userId) {
  if (tableData.holds?.[userId]) return false;
  if (tableData.busts?.[userId] || tableData.folded?.[userId] || tableData.caught?.[userId]) return false;
  const myRolls = tableData.rolls?.[userId] ?? [];
  if (myRolls.length === 0) return false;
  const { max } = getGoblinLeaders(turnOrder, tableData);
  const myTotal = Number(tableData.totals?.[userId] ?? 0);
  return myTotal >= max;
}

export function computeGoblinStageAdvance(turnOrder = [], tableData = {}) {
  let updatedTable = { ...tableData };
  const remaining = updatedTable.goblinStageRemaining ?? [];

  if (remaining.length > 0) {
    updatedTable.currentPlayer = getGoblinNextStagePlayer(turnOrder, updatedTable);
    return { tableData: updatedTable, action: null };
  }

  const rollingPlayers = getGoblinRollingPlayers(turnOrder, updatedTable);

  if (updatedTable.goblinSuddenDeathActive) {
    if (rollingPlayers.length === 0) return { tableData: updatedTable, action: "finish" };

    const nextRemaining = normalizeGoblinRemaining(turnOrder, updatedTable, rollingPlayers);
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
    const nextRemaining = normalizeGoblinRemaining(turnOrder, updatedTable, rollingPlayers);
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
  const nextRemaining = normalizeGoblinRemaining(turnOrder, updatedTable, rollingPlayers);

  updatedTable.goblinStageIndex = nextIndex;
  updatedTable.goblinStageDie = nextDie;
  updatedTable.goblinStageRemaining = nextRemaining;
  updatedTable.currentPlayer = nextRemaining[0] ?? null;

  return { tableData: updatedTable, action: "stage-advance", nextDie };
}
