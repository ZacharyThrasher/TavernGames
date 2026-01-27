import { updateState, addHistoryEntry, addLogToAll } from "../../state.js";
import { tavernSocket } from "../../socket.js";
import { getActorName } from "../utils/actors.js";
import { allPlayersFinished, getNextActivePlayer, notifyUser } from "../utils/game-logic.js";
import { revealDice } from "../phases/core.js";
import { showPublicRollFromData } from "../../dice.js";

export async function submitGoblinRoll({ state, tableData, userId, die }) {
  // Used dice tracking
  const usedDice = tableData.usedDice?.[userId] ?? [];
  if (die !== 2 && usedDice.includes(die)) {
    ui.notifications.warn("You have already used this die type!");
    return state;
  }

  // Roll
  const roll = await new Roll(`1d${die}`).evaluate();
  let result = roll.total;
  const naturalRoll = result;

  // V5.7: Check for Blind State (from Foresight failure)
  let isBlind = false;
  if (tableData.blindNextRoll?.[userId]) {
    isBlind = true;
    const blindNextRoll = { ...tableData.blindNextRoll };
    delete blindNextRoll[userId];
    tableData.blindNextRoll = blindNextRoll;

    if (tableData.hunchLocked?.[userId]) {
      const hunchLocked = { ...tableData.hunchLocked };
      delete hunchLocked[userId];
      const hunchLockedDie = { ...tableData.hunchLockedDie };
      delete hunchLockedDie[userId];
      tableData.hunchLocked = hunchLocked;
      tableData.hunchLockedDie = hunchLockedDie;
    }
  }

  // Visuals (Goblin: show once, publicly)
  try {
    await showPublicRollFromData(Number(die), Number(result), userId);
  } catch (e) { }

  // Logic Processing
  let multiplier = 1;
  const exploded = naturalRoll === die;
  let endTurn = false;
  let setScoreToOne = false;

  if (die === 2) {
    if (naturalRoll === 1) {
      setScoreToOne = true;
      endTurn = true;
    } else {
      multiplier = 2;
      result = 0;
    }
  } else if (naturalRoll === 1) {
    endTurn = true;
  }

  // Coin flip pizzazz
  if (die === 2) {
    try {
      await tavernSocket.executeForEveryone("showCoinFlip", userId, naturalRoll);
    } catch (e) { }
  }

  // Update State
  const rolls = { ...tableData.rolls };
  const totals = { ...tableData.totals };
  const busts = { ...tableData.busts };
  const visibleTotals = { ...tableData.visibleTotals };
  const usedDiceMap = { ...tableData.usedDice };
  const goblinSetProgress = { ...tableData.goblinSetProgress };

  const existingRolls = rolls[userId] ?? [];
  const isPublic = true;
  rolls[userId] = [...existingRolls, { die, result: naturalRoll, public: isPublic, blind: isBlind }];

  // Update Totals
  const previousTotal = totals[userId] ?? 0;
  const maxBefore = Math.max(0, ...Object.entries(totals).filter(([id]) => id !== userId).map(([, v]) => Number(v ?? 0)));
  let currentTotal = previousTotal;
  if (setScoreToOne) {
    currentTotal = 1;
  } else if (multiplier > 1) {
    currentTotal *= multiplier;
  } else {
    currentTotal += result;
  }
  totals[userId] = currentTotal;

  if (isPublic) {
    let currentVisible = visibleTotals[userId] ?? 0;
    if (setScoreToOne) {
      currentVisible = 1;
    } else if (multiplier > 1) {
      currentVisible *= multiplier;
    } else {
      currentVisible += result;
    }
    visibleTotals[userId] = currentVisible;
  }

  // Mark die as used (unless exploded) and track progress for full-set reset
  if (!exploded && die !== 2) {
    usedDiceMap[userId] = [...(usedDiceMap[userId] ?? []), die];
  }

  if (die !== 2) {
    const progress = new Set(goblinSetProgress[userId] ?? []);
    if (!exploded) progress.add(die);
    goblinSetProgress[userId] = [...progress];
  }

  const totalDelta = currentTotal - previousTotal;
  if (totalDelta !== 0 || multiplier > 1 || setScoreToOne) {
    try {
      await tavernSocket.executeForEveryone("showScoreSurge", userId, {
        from: previousTotal,
        to: currentTotal,
        delta: totalDelta,
        multiplied: multiplier > 1
      });
    } catch (e) { }
  }

  if (currentTotal > maxBefore && currentTotal > 0) {
    try {
      await tavernSocket.executeForEveryone("showJackpotInlay");
    } catch (e) { }
  }

  const userName = getActorName(userId);
  let msg = "";
  if (die === 2) {
    if (setScoreToOne) msg = `${userName} flipped TAILS and dropped to 1!`;
    else msg = `${userName} flipped HEADS and DOUBLED their score to ${currentTotal}!`;
  } else {
    if (naturalRoll === 1) msg = `${userName} rolled a 1 on d${die} and their turn ends!`;
    else if (exploded) msg = `${userName} rolled a MAX on d${die}! It explodes — roll it again!`;
    else msg = `${userName} rolled ${result} on d${die}. Total: ${currentTotal}.`;
  }

  if (tableData.phase === "opening") {
    await addLogToAll({
      title: exploded ? "Explosion!" : "Roll",
      message: msg,
      icon: "fa-solid fa-dice",
      type: "roll",
      cssClass: exploded ? "success" : ""
    });

    await addHistoryEntry({
      type: "roll",
      player: userName,
      die: `d${die}`,
      result: naturalRoll,
      total: currentTotal,
      message: msg
    });
  }

  let updatedTable = {
    ...tableData,
    rolls,
    totals,
    busts,
    visibleTotals,
    usedDice: usedDiceMap,
    goblinSetProgress,
    hasActed: { ...tableData.hasActed, [userId]: true },
    pendingAction: null
  };

  let fullSetReset = false;
  if (!endTurn) {
    const requiredDice = [4, 6, 8, 10, 20];
    const progress = new Set(goblinSetProgress[userId] ?? []);
    fullSetReset = requiredDice.every(d => progress.has(d));
    if (fullSetReset) {
      updatedTable.usedDice = { ...usedDiceMap, [userId]: [] };
      updatedTable.goblinSetProgress = { ...goblinSetProgress, [userId]: [] };
    }
  }

  if (fullSetReset) {
    await addLogToAll({
      title: "Full Set!",
      message: `${userName} rolled a full set and resets their dice!`,
      icon: "fa-solid fa-dice",
      type: "roll",
      cssClass: "success"
    });

    try {
      await tavernSocket.executeForEveryone("showFullSetBurst", userId);
    } catch (e) { }

    await addHistoryEntry({
      type: "roll",
      player: userName,
      message: `${userName} completed a full set and reset their dice.`,
    });
  }

  if (endTurn) {
    const remaining = updatedTable.goblinFinalRemaining ?? [];
    if (updatedTable.goblinFinalActive && remaining.includes(userId)) {
      updatedTable.goblinFinalRemaining = remaining.filter(id => id !== userId);
      updatedTable.holds = { ...updatedTable.holds, [userId]: true };
    }

    const suddenRemaining = updatedTable.goblinSuddenDeathRemaining ?? [];
    if (updatedTable.goblinSuddenDeathActive && suddenRemaining.includes(userId)) {
      updatedTable.goblinSuddenDeathRemaining = suddenRemaining.filter(id => id !== userId);
      updatedTable.holds = { ...updatedTable.holds, [userId]: true };
    }

    updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);
    updatedTable.skillUsedThisTurn = false;
    updatedTable.lastSkillUsed = null;
  }

  const next = await updateState({ tableData: updatedTable });
  const finalRemaining = updatedTable.goblinFinalRemaining ?? [];
  if (updatedTable.goblinFinalActive && finalRemaining.length === 0) return revealDice();
  const suddenRemaining = updatedTable.goblinSuddenDeathRemaining ?? [];
  if (updatedTable.goblinSuddenDeathActive && suddenRemaining.length === 0) return revealDice();
  if (allPlayersFinished(state, updatedTable)) return revealDice();

  return next;
}

export async function holdGoblin({ state, tableData, userId }) {
  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  if (tableData.folded?.[userId]) {
    ui.notifications.warn("You've already finished this round.");
    return state;
  }

  let holds = { ...tableData.holds, [userId]: true };
  let goblinFinalActive = tableData.goblinFinalActive ?? false;
  let goblinFinalTargetId = tableData.goblinFinalTargetId ?? null;
  let goblinFinalTargetScore = tableData.goblinFinalTargetScore ?? null;
  let goblinFinalRemaining = tableData.goblinFinalRemaining ?? [];
  let goblinSuddenDeathActive = tableData.goblinSuddenDeathActive ?? false;
  let goblinSuddenDeathParticipants = tableData.goblinSuddenDeathParticipants ?? [];
  let goblinSuddenDeathRemaining = tableData.goblinSuddenDeathRemaining ?? [];

  if (goblinSuddenDeathActive && goblinSuddenDeathRemaining.includes(userId)) {
    goblinSuddenDeathRemaining = goblinSuddenDeathRemaining.filter(id => id !== userId);
  } else if (!goblinFinalActive) {
    goblinFinalActive = true;
    goblinFinalTargetId = userId;
    goblinFinalTargetScore = tableData.totals?.[userId] ?? 0;
    const activePlayers = state.turnOrder.filter(id => !tableData.folded?.[id] && !tableData.caught?.[id]);
    goblinFinalRemaining = activePlayers.filter(id => id !== userId);
    holds = { [userId]: true };
  } else if (goblinFinalRemaining.includes(userId)) {
    goblinFinalRemaining = goblinFinalRemaining.filter(id => id !== userId);
  }

  const updatedTable = {
    ...tableData,
    holds,
    goblinFinalActive,
    goblinFinalTargetId,
    goblinFinalTargetScore,
    goblinFinalRemaining,
    goblinSuddenDeathActive,
    goblinSuddenDeathParticipants,
    goblinSuddenDeathRemaining,
    skillUsedThisTurn: false,
    lastSkillUsed: null
  };

  updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);

  const userName = getActorName(userId);
  if (goblinSuddenDeathActive) {
    await addLogToAll({
      title: "Sudden Death",
      message: `${userName} ends their sudden‑death turn.`,
      icon: "fa-solid fa-bolt",
      type: "phase"
    });
  } else if (!tableData.goblinFinalActive) {
    await addLogToAll({
      title: "Final Round!",
      message: `<strong>${userName}</strong> holds at <strong>${goblinFinalTargetScore}</strong>.<br>Everyone gets one more turn to beat it.`,
      icon: "fa-solid fa-hourglass-half",
      type: "phase"
    });
  } else {
    await addLogToAll({
      title: "Hold",
      message: `${userName} holds.`,
      icon: "fa-solid fa-hand",
      type: "hold"
    });
  }

  await addHistoryEntry({
    type: "hold",
    player: userName,
    total: tableData.totals?.[userId] ?? 0,
    message: `${userName} holds at ${tableData.totals?.[userId] ?? 0}.`
  });

  const next = await updateState({ tableData: updatedTable });
  if (goblinFinalActive && (goblinFinalRemaining?.length ?? 0) === 0) return revealDice();
  if (allPlayersFinished(state, updatedTable)) return revealDice();
  return next;
}
