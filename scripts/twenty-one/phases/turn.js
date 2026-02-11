import { getState, updateState, addHistoryEntry, addLogToAll } from "../../state.js";

import { tavernSocket } from "../../socket.js";
import { getActorName, getSafeActorName } from "../utils/actors.js";
import { payOutWinners } from "../../wallet.js";
import { getNextActivePlayer, allPlayersFinished, notifyUser } from "../utils/game-logic.js";
import { MODULE_ID, emptyTableData, getAllowedDice, getDieCost } from "../constants.js";
import { revealDice } from "./core.js";
import { submitGoblinRoll, holdGoblin } from "../rulesets/goblin.js";
import { submitStandardRoll } from "../rulesets/standard.js";
import { REVEAL_DURATION } from "../../ui/dice-reveal.js";
import { delay, withWarning } from "../utils/runtime.js";

export async function submitRoll(payload, userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    await notifyUser(userId, "No active round.");
    return state;
  }

  let tableData = state.tableData ?? emptyTableData();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const isOpeningPhase = tableData.phase === "opening";
  const die = Number(payload?.die);

  const gameMode = tableData.gameMode ?? "standard";
  const isGoblinMode = gameMode === "goblin";
  const allowedDice = getAllowedDice(gameMode);

  if (!allowedDice.includes(die)) {
    await notifyUser(userId, "Invalid die selection.");
    return state;
  }

  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  // Prevent duplicate/raced rolls while the previous betting roll is awaiting cheat resolution.
  if (!isGoblinMode && tableData.pendingAction === "cheat_decision") {
    await notifyUser(userId, "Resolve your current roll before rolling again.");
    return state;
  }

  const goblinSuddenDeath = (tableData.gameMode ?? "standard") === "goblin"
    && tableData.goblinSuddenDeathActive
    && (tableData.goblinSuddenDeathParticipants ?? []).includes(userId);

  if (!goblinSuddenDeath && (tableData.holds[userId] || tableData.busts[userId] || tableData.folded?.[userId])) {
    await notifyUser(userId, "You've already finished this round.");
    return state;
  }
  if (!isGoblinMode && tableData.dared?.[userId] && die !== 8) {
    await notifyUser(userId, "You are Dared! You forced to roll a d8 (Free) or Fold.");
    return state;
  }
  if (!isGoblinMode && tableData.goadBackfire?.[userId]?.forceD20 && die !== 20) {
    await notifyUser(userId, "Critically Goaded! You are forced to roll a d20!");
    return state;
  }
  if (!isGoblinMode && tableData.hunchLocked?.[userId] && die !== 20) {
    await notifyUser(userId, "Foresight locked you into rolling a d20!");
    return state;
  }
  if (!isGoblinMode && tableData.pendingBumpRetaliation?.attackerId === userId) {
    console.warn("Tavern | Blocked Roll due to Lock:", tableData.pendingBumpRetaliation);
    await notifyUser(userId, "You were caught bumping! Wait for retaliation.");
    return state;
  }

  if (isGoblinMode) {
    return submitGoblinRoll({ state, tableData, userId, die });
  }

  return submitStandardRoll({ state, tableData, userId, die, isOpeningPhase, ante, payload });
}

export async function finishTurn(userId) {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();
  const gameMode = tableData.gameMode ?? "standard";
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const rolls = tableData.rolls[userId] ?? [];
  const lastRollIndex = rolls.length - 1;
  const lastRoll = rolls[lastRollIndex];

  if (lastRoll && tableData.phase === "betting" && !lastRoll.public && !lastRoll.blind && (tableData.gameMode ?? "standard") !== "goblin") {
    // It was hidden for cheat opportunity - time to reveal
    const updatedRolls = [...rolls];
    updatedRolls[lastRollIndex] = { ...lastRoll, public: true };

    const updatedVisibleTotals = { ...tableData.visibleTotals };
    const previousVisibleTotal = updatedVisibleTotals[userId] ?? 0;
    updatedVisibleTotals[userId] = (updatedVisibleTotals[userId] ?? 0) + lastRoll.result;

    tableData.rolls = { ...tableData.rolls, [userId]: updatedRolls };
    tableData.visibleTotals = updatedVisibleTotals;

    const userName = getActorName(userId);
    // Check cost again for log consistency
    let rollCostMsg = "";
    if (gameMode !== "goblin") {
      // Simplified cost check
      const cost = getDieCost(lastRoll.die, ante);
      if (cost === 0) rollCostMsg = " (FREE)";
      else rollCostMsg = ` (${cost}gp)`;
    }

    let specialMsg = "";
    if (gameMode === "goblin") {
      if (lastRoll.die === 2) {
        const coinValue = lastRoll.coinValue ?? 2;
        specialMsg = lastRoll.result === 2 ? ` **COIN: +${coinValue}!**` : " **COIN: DEATH!**";
      } else if (lastRoll.result === 1) {
        specialMsg = " **BUST!**";
      } else if (lastRoll.die === 20 && lastRoll.result === 20) {
        specialMsg = " **NAT 20: EXPLODE!**";
      }
    } else {
      if (lastRoll.die === 20 && lastRoll.result === 21) specialMsg = " **NATURAL 20 = INSTANT 21!**";
      else if (lastRoll.die !== 20 && lastRoll.result === 1) specialMsg = " *Spilled drink! 1gp cleaning fee.*";
    }
    await addLogToAll({
      title: `${userName} rolled d${lastRoll.die}`,
      message: `Result: <strong>${lastRoll.result}</strong>${rollCostMsg}${specialMsg}`,
      icon: "fa-solid fa-dice",
      type: "roll"
    });

    await addHistoryEntry({
      type: "roll",
      player: userName,
      die: `d${lastRoll.die}`,
      result: lastRoll.result,
      total: tableData.totals[userId],
      message: `${userName} rolled a d${lastRoll.die}${rollCostMsg}...${specialMsg}`,
    });
    // This replaces DSN for the dramatic post-cheat betting reveal.
    // The condition above already gates on !lastRoll.blind, so blind rolls never reach here.
    const isNat20 = lastRoll.die === 20 && lastRoll.result === 21;
    const isBust = (tableData.totals[userId] ?? 0) > 21;
    const isJackpot = !isBust && (tableData.totals[userId] ?? 0) === 21;
    await withWarning("Dice reveal error", () => tavernSocket.executeForEveryone("showDiceReveal", userId, lastRoll.die, lastRoll.result, {
      isNat20,
      isBust,
      isJackpot,
    }));
    await delay(REVEAL_DURATION);

    // Show score surge AFTER cheat resolution (public reveal)
    if (gameMode !== "goblin") {
      const delta = lastRoll.result;
      if (delta > 0) {
        await withWarning("Could not show score surge", () => tavernSocket.executeForEveryone("showScoreSurge", userId, {
          from: previousVisibleTotal,
          to: previousVisibleTotal + delta,
          delta,
          multiplied: false
        }));
      }
    }
  }

  const updatedTable = { ...tableData, pendingAction: null };
  if ((tableData.gameMode ?? "standard") !== "goblin") {
    if (tableData.pendingBust === userId) {
      const currentTotal = tableData.totals[userId] ?? 0;
      if (currentTotal > 21) {
        // Still busted after cheat decision
        updatedTable.busts = { ...updatedTable.busts, [userId]: true };
        const userName = getActorName(userId);
        const safeUserName = getSafeActorName(userId);
        await addLogToAll({
          title: "BUST!",
          message: `${safeUserName} busted with ${currentTotal}!`,
          icon: "fa-solid fa-skull",
          type: "bust",
          cssClass: "failure"
        });

        await addHistoryEntry({
          type: "bust",
          player: userName,
          total: currentTotal,
          message: `${userName} BUSTED with ${currentTotal}!`,
        });
        // Trigger fanfare
        try {
          await tavernSocket.executeForEveryone("showBustFanfare", userId);
        } catch (error) {
          console.warn("Tavern Twenty-One | Could not show bust fanfare:", error);
        }
      }
      // Clear the pending bust flag
      updatedTable.pendingBust = null;
    }
  }

  updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);

  if (updatedTable.phase === "betting" && updatedTable.sideBetRoundStart) {
    const nextId = updatedTable.currentPlayer;
    if (nextId === updatedTable.sideBetRoundStart) {
      updatedTable.sideBetRound = (updatedTable.sideBetRound ?? 1) + 1;
    }
  }
  updatedTable.skillUsedThisTurn = false;
  updatedTable.lastSkillUsed = null;

  const next = await updateState({ tableData: updatedTable });

  if (allPlayersFinished(state, updatedTable)) {
    return revealDice();
  }

  return next;
}

export async function hold(userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    await notifyUser(userId, "No active round.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
  const gameMode = tableData.gameMode ?? "standard";

  if (gameMode === "goblin") {
    return holdGoblin({ state, tableData, userId });
  }

  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  if (tableData.holds[userId] || tableData.busts[userId] || tableData.folded?.[userId]) {
    await notifyUser(userId, "You've already finished this round.");
    return state;
  }

  if (tableData.phase === "opening" || tableData.phase === "cut") {
    await notifyUser(userId, "Cannot hold during opening phase.");
    return state;
  }

  if (tableData.goadBackfire?.[userId]?.mustRoll) {
    await notifyUser(userId, "You were goaded! You must roll instead.");
    return state;
  }

  if (tableData.hunchLocked?.[userId]) {
    await notifyUser(userId, "Your Foresight locked you into rolling!");
    return state;
  }
  if (tableData.dared?.[userId]) {
    await notifyUser(userId, "You are Dared! You forced to roll a d8 (Free) or Fold.");
    return state;
  }
  if (tableData.pendingBumpRetaliation?.attackerId === userId) {
    await notifyUser(userId, "You were caught bumping! Wait for retaliation.");
    return state;
  }

  const holds = { ...tableData.holds, [userId]: true };
  const updatedTable = { ...tableData, holds };
  updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);
  updatedTable.skillUsedThisTurn = false;
  updatedTable.lastSkillUsed = null;

  const userName = getActorName(userId);
  const safeUserName = getSafeActorName(userId);
  await addLogToAll({
    title: "Hold",
    message: `${safeUserName} holds.`,
    icon: "fa-solid fa-hand",
    type: "hold"
  });

  await addHistoryEntry({
    type: "hold",
    player: userName,
    total: tableData.totals[userId],
    message: `${userName} holds at ${tableData.totals[userId]}.`,
  });

  const next = await updateState({ tableData: updatedTable });

  if (allPlayersFinished(state, updatedTable)) {
    return revealDice();
  }

  return next;
}

export async function fold(userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    await notifyUser(userId, "No active round.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
  if ((tableData.gameMode ?? "standard") === "goblin") {
    await notifyUser(userId, "No folding in Goblin Mode.");
    return state;
  }
  const ante = game.settings.get(MODULE_ID, "fixedAnte");

  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  if (tableData.phase === "opening" || tableData.phase === "cut") {
    await notifyUser(userId, "Cannot fold during opening phase.");
    return state;
  }

  if (tableData.folded?.[userId] || tableData.busts?.[userId]) {
    await notifyUser(userId, "You've already finished this round.");
    return state;
  }

  const hasActed = tableData.hasActed?.[userId] ?? false;
  const refund = hasActed ? 0 : Math.floor(ante / 2);

  const userName = getActorName(userId);
  const safeUserName = getSafeActorName(userId);
  const updatedFoldedEarly = refund > 0
    ? { ...tableData.foldedEarly, [userId]: true }
    : tableData.foldedEarly;

  if (refund > 0) {
    await payOutWinners({ [userId]: refund });
  }

  const updatedTable = {
    ...tableData,
    folded: { ...tableData.folded, [userId]: true },
    foldedEarly: updatedFoldedEarly,
    skillUsedThisTurn: false,
    lastSkillUsed: null,
  };
  updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);
  await addLogToAll({
    title: "Fold",
    message: `${safeUserName} folds.${refund > 0 ? ` (Refund: ${refund}gp)` : ""}`,
    icon: "fa-solid fa-door-open",
    type: "fold"
  });

  await addHistoryEntry({
    type: "fold",
    player: userName,
    refund,
    message: refund > 0
      ? `${userName} folded early and received ${refund}gp back.`
      : `${userName} folded (no refund).`,
  });

  const next = await updateState({ tableData: updatedTable });

  if (allPlayersFinished(state, updatedTable)) {
    return revealDice();
  }

  return next;
}

