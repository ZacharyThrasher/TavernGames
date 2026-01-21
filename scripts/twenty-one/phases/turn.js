import { MODULE_ID, getState, updateState, addHistoryEntry } from "../../state.js";
import { deductFromActor } from "../../wallet.js";
import { playSound } from "../../sounds.js";
import { tavernSocket } from "../../socket.js";
import { getActorForUser } from "../utils/actors.js";
import { getNextActivePlayer, getNextOpeningPlayer, allPlayersCompletedOpening, allPlayersFinished, calculateBettingOrder, getDieCost, drinkForPayment, notifyUser } from "../utils/game-logic.js";
import { emptyTableData, VALID_DICE, OPENING_ROLLS_REQUIRED } from "../constants.js";
import { revealDice } from "./core.js";

export async function submitRoll(payload, userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    ui.notifications.warn("No active round.");
    return state;
  }

  let tableData = state.tableData ?? emptyTableData();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const isOpeningPhase = tableData.phase === "opening";

  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  if (tableData.holds[userId] || tableData.busts[userId]) {
    ui.notifications.warn("You've already finished this round.");
    return state;
  }

  const die = Number(payload?.die);
  if (!VALID_DICE.includes(die)) {
    ui.notifications.warn("Invalid die selection.");
    return state;
  }

  // V2.0: Variable dice costs in betting phase
  let newPot = state.pot;
  let rollCost = 0;
  if (!isOpeningPhase) {
    const user = game.users.get(userId);
    // V3.5: GM-as-NPC pays for dice like regular players
    const playerData = state.players?.[userId];
    const isHouse = user?.isGM && !playerData?.playingAsNpc;
    if (!isHouse) {
      rollCost = getDieCost(die, ante);

      if (rollCost > 0) {
        if (payload.payWithDrink) {
          const drinksNeeded = Math.ceil(rollCost / ante);
          const drinkResult = await drinkForPayment(userId, drinksNeeded, tableData);
          tableData = drinkResult.tableData;

          if (drinkResult.bust) {
            return updateState({ tableData });
          }
        } else {
          const canAfford = await deductFromActor(userId, rollCost);
          if (!canAfford) {
            await notifyUser(userId, `You need ${rollCost}gp to roll a d${die}.`);
            return state;
          }
          newPot = state.pot + rollCost;
          await playSound("coins");
        }
      }
    }
  }

  // V3: Hunch Accuracy - Use pre-rolled value if available
  let forcedResult = null;
  if (tableData.hunchRolls?.[userId]?.[die]) {
    forcedResult = tableData.hunchRolls[userId][die];
  }

  let roll;
  if (forcedResult !== null) {
    // Construct a roll with the forced result
    roll = new Roll(`1d${die}`);
    roll.terms = [
      new Die({ number: 1, faces: die, results: [{ result: forcedResult, active: true }] })
    ];
    roll._total = forcedResult;
    roll._evaluated = true;
  } else {
    roll = await new Roll(`1d${die}`).evaluate();
  }

  let result = roll.total ?? 0;
  const naturalRoll = result;

  if (die === 20 && result === 20) {
    result = 21;
  }

  try {
    await tavernSocket.executeAsUser("showRoll", userId, {
      formula: `1d${die}`,
      die: die,
      result: result
    });
  } catch (e) {
    console.warn("Tavern Twenty-One | Could not show dice to player:", e);
  }

  await playSound("dice");

  const rolls = { ...tableData.rolls };
  const totals = { ...tableData.totals };
  const cleaningFees = { ...tableData.cleaningFees };
  const visibleTotals = { ...tableData.visibleTotals };

  const existingRolls = rolls[userId] ?? [];
  const isPublic = isOpeningPhase ? existingRolls.length === 0 : true;

  rolls[userId] = [...existingRolls, { die, result, public: isPublic }];
  totals[userId] = (totals[userId] ?? 0) + result;

  if (isPublic) {
    visibleTotals[userId] = (visibleTotals[userId] ?? 0) + result;
  }

  if (naturalRoll === 1) {
    cleaningFees[userId] = (cleaningFees[userId] ?? 0) + 1;
  }

  const busts = { ...tableData.busts };
  const isBust = totals[userId] > 21;
  // V3.4: Don't immediately mark bust - let cheat dialog appear first
  // We'll set pendingBust flag instead, which gets resolved after cheat decision
  let pendingBust = false;
  if (isBust && !isOpeningPhase) {
    // In betting phase, delay bust until after cheat dialog
    pendingBust = true;
  } else if (isBust) {
    // In opening phase, bust immediately (no cheat allowed)
    busts[userId] = true;
  }

  const userName = game.users.get(userId)?.name ?? "Unknown";

  // V3.5: Show roll cost message for GM-as-NPC too
  const msgUser = game.users.get(userId);
  const msgPlayerData = state.players?.[userId];
  const isMsgHouse = msgUser?.isGM && !msgPlayerData?.playingAsNpc;
  let rollCostMsg = "";
  if (!isOpeningPhase && !isMsgHouse) {
    if (rollCost === 0) {
      rollCostMsg = " (FREE)";
    } else {
      rollCostMsg = ` (${rollCost}gp)`;
    }
  }

  let specialMsg = "";
  if (die === 20 && naturalRoll === 20) {
    specialMsg = " **NATURAL 20 = INSTANT 21!**";
  } else if (naturalRoll === 1) {
    specialMsg = " *Spilled drink! 1gp cleaning fee.*";
  }

  // V3.4: Only post bust message if opening phase (no cheat opportunity)
  // In betting phase, the bust message will be posted after cheat decision
  if (!pendingBust) {
    await addHistoryEntry({
      type: isBust ? "bust" : "roll",
      player: userName,
      die: `d${die}`,
      result,
      total: totals[userId],
      message: isBust
        ? `${userName} rolled d${die} and BUSTED with ${totals[userId]}!${specialMsg}`
        : `${userName} rolled a d${die}${rollCostMsg}...${specialMsg}`,
    });
  } else {
    // Still log the roll, but not the bust yet
    await addHistoryEntry({
      type: "roll",
      player: userName,
      die: `d${die}`,
      result,
      total: totals[userId],
      message: `${userName} rolled a d${die}${rollCostMsg}...${specialMsg}`,
    });
  }

  const goadBackfire = { ...tableData.goadBackfire };
  if (goadBackfire[userId]?.mustRoll) {
    delete goadBackfire[userId];
  }

  const hunchLocked = { ...tableData.hunchLocked };
  const hunchLockedDie = { ...tableData.hunchLockedDie };
  if (hunchLocked[userId]) {
    delete hunchLocked[userId];
    delete hunchLockedDie[userId];
  }

  // V3: Clean up Hunch predictions after rolling
  let hunchPrediction = tableData.hunchPrediction;
  let hunchExact = tableData.hunchExact;
  let hunchRolls = tableData.hunchRolls;

  if (tableData.hunchRolls?.[userId] || tableData.hunchPrediction?.[userId]) {
    hunchPrediction = { ...tableData.hunchPrediction };
    hunchExact = { ...tableData.hunchExact };
    hunchRolls = { ...tableData.hunchRolls };

    delete hunchPrediction[userId];
    delete hunchExact[userId];
    delete hunchRolls[userId];
  }

  let updatedTable = {
    ...tableData,
    rolls,
    totals,
    busts,
    cleaningFees,
    visibleTotals,
    goadBackfire,
    hunchLocked,
    hunchLockedDie,
    hunchPrediction,
    hunchExact,
    hunchRolls,
    // V3.4: Track pending bust for cheat decision
    pendingBust: pendingBust ? userId : null,
  };

  if (!isOpeningPhase) {
    updatedTable.hasActed = { ...updatedTable.hasActed, [userId]: true };
  }

  await updateState({
    tableData: updatedTable,
    pot: newPot,
  });

  if (isOpeningPhase) {
    const myRolls = rolls[userId] ?? [];
    if (myRolls.length >= OPENING_ROLLS_REQUIRED || isBust) {
      if (allPlayersCompletedOpening(state, updatedTable)) {
        updatedTable.bettingOrder = calculateBettingOrder(state, updatedTable);
        updatedTable.phase = "betting";
        updatedTable.currentPlayer = updatedTable.bettingOrder.find(id => !updatedTable.busts[id]) ?? null;

        const orderNames = updatedTable.bettingOrder
          .filter(id => !updatedTable.busts[id])
          .map(id => {
            const name = game.users.get(id)?.name ?? "Unknown";
            const vt = updatedTable.visibleTotals[id] ?? 0;
            return `${name} (${vt})`;
          })
          .join(" → ");

        await createChatCard({
          title: "Betting Round",
          subtitle: "Opening complete!",
          message: `All players have their opening hands.<br><strong>Turn order (by visible total):</strong> ${orderNames}<br><em>d20: FREE | d10: ${Math.floor(ante / 2)}gp | d6/d8: ${ante}gp | d4: ${ante * 2}gp</em>`,
          icon: "fa-solid fa-hand-holding-dollar",
        });
      } else {
        updatedTable.currentPlayer = getNextOpeningPlayer(state, updatedTable);
      }
    }
    const rolling = { ...updatedTable.rolling };
    delete rolling[userId];
    updatedTable.rolling = rolling;

    return updateState({ tableData: updatedTable });
  } else {
    updatedTable.pendingAction = "cheat_decision";

    const rolling = { ...updatedTable.rolling };
    delete rolling[userId];
    updatedTable.rolling = rolling;

    return updateState({ tableData: updatedTable });
  }
}

export async function finishTurn(userId) {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();

  if (tableData.currentPlayer !== userId) {
    // maybe admin override
  }

  const updatedTable = { ...tableData, pendingAction: null };

  // V3.4: Resolve pending bust after cheat decision
  if (tableData.pendingBust === userId) {
    const currentTotal = tableData.totals[userId] ?? 0;
    if (currentTotal > 21) {
      // Still busted after cheat decision
      updatedTable.busts = { ...updatedTable.busts, [userId]: true };
      const userName = game.users.get(userId)?.name ?? "Unknown";
      await addHistoryEntry({
        type: "bust",
        player: userName,
        total: currentTotal,
        message: `${userName} BUSTED with ${currentTotal}!`,
      });
    }
    // Clear the pending bust flag
    updatedTable.pendingBust = null;
  }

  const isBust = updatedTable.busts?.[userId];

  if (isBust) {
    updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);
  } else {
    updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);
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
    await notifyUser(userId, "Your Hunch locked you into rolling!");
    return state;
  }

  const holds = { ...tableData.holds, [userId]: true };
  const updatedTable = { ...tableData, holds };
  updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);
  updatedTable.skillUsedThisTurn = false;

  const userName = game.users.get(userId)?.name ?? "Unknown";
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

  const actor = getActorForUser(userId);
  const userName = actor?.name ?? game.users.get(userId)?.name ?? "Unknown";

  if (refund > 0) {
    await payOutWinners({ [userId]: refund });
    tableData.foldedEarly = { ...tableData.foldedEarly, [userId]: true };
  }

  tableData.folded = { ...tableData.folded, [userId]: true };
  tableData.currentPlayer = getNextActivePlayer(state, tableData);
  tableData.skillUsedThisTurn = false;

  await createChatCard({
    title: "Fold",
    subtitle: `${userName} folds`,
    message: refund > 0
      ? `Received <strong>${refund}gp</strong> refund (50% ante). Now untargetable.`
      : `No refund (already acted). Now untargetable.`,
    icon: "fa-solid fa-door-open",
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
