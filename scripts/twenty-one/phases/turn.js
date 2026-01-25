import { MODULE_ID, getState, updateState, addHistoryEntry, addLogToAll } from "../../state.js"; // V5.8.6: Restore missing imports

import { tavernSocket } from "../../socket.js";
import { getActorName, payOutWinners } from "../utils/actors.js";
import { getNextActivePlayer, allPlayersFinished, notifyUser } from "../utils/game-logic.js";
import { emptyTableData, getAllowedDice, getDieCost } from "../constants.js";
import { revealDice } from "./core.js";
import { submitGoblinRoll } from "../rulesets/goblin.js";
import { submitStandardRoll } from "../rulesets/standard.js";
import { showPublicRollFromData } from "../../dice.js";

// V5.14.0: Goblin Rules Branching

export async function submitRoll(payload, userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    ui.notifications.warn("No active round.");
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
    ui.notifications.warn("Invalid die selection.");
    return state;
  }

  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  if (tableData.holds[userId] || tableData.busts[userId] || tableData.folded?.[userId]) {
    ui.notifications.warn("You've already finished this round.");
    return state;
  }

  // V4.9: Dared check - can ONLY buy d8 (Free) if dared
  // V5.7: Deprecated Dared in favor of Goad Backfire Symmetry, but keeping for legacy safety
  if (tableData.dared?.[userId] && die !== 8) {
    ui.notifications.warn("You are Dared! You forced to roll a d8 (Free) or Fold.");
    return state;
  }

  // V5.7: Goad Force D20 check
  if (tableData.goadBackfire?.[userId]?.forceD20 && die !== 20) {
    ui.notifications.warn("Critically Goaded! You are forced to roll a d20!");
    return state;
  }

  // V4.9: Hunch Lock check - can ONLY roll d20 if locked
  if (tableData.hunchLocked?.[userId] && die !== 20) {
    ui.notifications.warn("Foresight locked you into rolling a d20!");
    return state;
  }

  // V3.5: Bump Retaliation Lock
  if (tableData.pendingBumpRetaliation?.attackerId === userId) {
    console.warn("Tavern | Blocked Roll due to Lock:", tableData.pendingBumpRetaliation);
    ui.notifications.warn("You were caught bumping! Wait for retaliation.");
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

  if (tableData.currentPlayer !== userId) {
    // maybe admin override
  }

  // V4.1: Reveal hidden betting rolls and log them (moved from submitRoll)
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const rolls = tableData.rolls[userId] ?? [];
  const lastRollIndex = rolls.length - 1;
  const lastRoll = rolls[lastRollIndex];

  if (lastRoll && tableData.phase === "betting" && !lastRoll.public && !lastRoll.blind && (tableData.gameMode ?? "standard") !== "goblin") {
    // It was hidden for cheat opportunity - time to reveal
    const updatedRolls = [...rolls];
    updatedRolls[lastRollIndex] = { ...lastRoll, public: true };

    const updatedVisibleTotals = { ...tableData.visibleTotals };
    const gameMode = tableData.gameMode ?? "standard";
    if (gameMode === "goblin" && lastRoll.die === 2) {
      if (lastRoll.result === 2) {
        updatedVisibleTotals[userId] = (updatedVisibleTotals[userId] ?? 0) * 2;
      }
      // Tails adds nothing; bust is handled elsewhere.
    } else {
      updatedVisibleTotals[userId] = (updatedVisibleTotals[userId] ?? 0) + lastRoll.result;
    }

    tableData.rolls = { ...tableData.rolls, [userId]: updatedRolls };
    tableData.visibleTotals = updatedVisibleTotals;

    // V5.8: We don't need to log this revealing action if we already logged the roll privately or we are about to log result
    // Actually the logic was to log it NOW that it's public.
    // The player saw "You rolled X" privately (maybe?).
    // Let's log the "Finalized Roll" to everyone.

    const user = game.users.get(userId);
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
        specialMsg = lastRoll.result === 2 ? " **COIN: DOUBLE!**" : " **COIN: BUST!**";
      } else if (lastRoll.result === 1) {
        specialMsg = " **BUST!**";
      } else if (lastRoll.die === 20 && lastRoll.result === 20) {
        specialMsg = " **NAT 20: EXPLODE!**";
      }
    } else {
      if (lastRoll.die === 20 && lastRoll.result === 21) specialMsg = " **NATURAL 20 = INSTANT 21!**";
      else if (lastRoll.die !== 20 && lastRoll.result === 1) specialMsg = " *Spilled drink! 1gp cleaning fee.*";
    }

    // V5.8: Add Log to All
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

    // V5.9: Show Public Roll (DSN) for the reveal
    // This runs on the client effectively (triggered by state update usually, but here likely GM/Actor owner)
    // If triggered by GM, DSN sync handles it.
    try {
      await showPublicRollFromData(Number(lastRoll.die), Number(lastRoll.result), userId);
    } catch (e) { console.warn("Tavern | DSN Error:", e); }
  }

  const updatedTable = { ...tableData, pendingAction: null };

  // V3.4: Resolve pending bust after cheat decision (Standard only)
  if ((tableData.gameMode ?? "standard") !== "goblin") {
    if (tableData.pendingBust === userId) {
      const currentTotal = tableData.totals[userId] ?? 0;
      if (currentTotal > 21) {
        // Still busted after cheat decision
        updatedTable.busts = { ...updatedTable.busts, [userId]: true };
        const userName = getActorName(userId);

        // V5.8: Log Bust
        await addLogToAll({
          title: "BUST!",
          message: `${userName} busted with ${currentTotal}!`,
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
        await tavernSocket.executeForEveryone("showBustFanfare", userId);
      }
      // Clear the pending bust flag
      updatedTable.pendingBust = null;
    }
  }

  const isBust = updatedTable.busts?.[userId];

  updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);

  if (updatedTable.phase === "betting" && updatedTable.sideBetRoundStart) {
    const nextId = updatedTable.currentPlayer;
    if (nextId === updatedTable.sideBetRoundStart) {
      updatedTable.sideBetRound = (updatedTable.sideBetRound ?? 1) + 1;
    }
  }

  // V3: Reset skill usage flag for the new player
  updatedTable.skillUsedThisTurn = false;

  const next = await updateState({ tableData: updatedTable });

  if (allPlayersFinished(state, updatedTable)) {
    return revealDice();
  }

  return next;
}

export async function hold(userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    ui.notifications.warn("No active round.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();

  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  if (tableData.holds[userId] || tableData.busts[userId] || tableData.folded?.[userId]) {
    ui.notifications.warn("You've already finished this round.");
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

  // V4: Dared check - cannot hold if dared
  if (tableData.dared?.[userId]) {
    await notifyUser(userId, "You are Dared! You forced to roll a d8 (Free) or Fold.");
    return state;
  }

  // V3.5: Bump Retaliation Lock
  if (tableData.pendingBumpRetaliation?.attackerId === userId) {
    await notifyUser(userId, "You were caught bumping! Wait for retaliation.");
    return state;
  }

  const holds = { ...tableData.holds, [userId]: true };
  const updatedTable = { ...tableData, holds };
  updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);
  updatedTable.skillUsedThisTurn = false;

  const userName = getActorName(userId);

  // V5.8: Log Hold
  await addLogToAll({
    title: "Hold",
    message: `${userName} holds.`, // Don't show total yet? Or visible total?
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
    ui.notifications.warn("No active round.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
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
    ui.notifications.warn("You've already finished this round.");
    return state;
  }

  const hasActed = tableData.hasActed?.[userId] ?? false;
  const refund = hasActed ? 0 : Math.floor(ante / 2);

  const userName = getActorName(userId);

  if (refund > 0) {
    await payOutWinners({ [userId]: refund });
    tableData.foldedEarly = { ...tableData.foldedEarly, [userId]: true };
  }

  tableData.folded = { ...tableData.folded, [userId]: true };
  tableData.currentPlayer = getNextActivePlayer(state, tableData);
  tableData.skillUsedThisTurn = false;

  // V5.8: Log Fold
  await addLogToAll({
    title: "Fold",
    message: `${userName} folds.${refund > 0 ? ` (Refund: ${refund}gp)` : ""}`,
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

  const next = await updateState({ tableData });

  if (allPlayersFinished(state, tableData)) {
    return revealDice();
  }

  return next;
}
