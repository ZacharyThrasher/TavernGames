import { updateState, addHistoryEntry, addLogToAll } from "../../state.js";
import { tavernSocket } from "../../socket.js";
import { getActorName } from "../utils/actors.js";
import { getNextOpeningPlayer, allPlayersCompletedOpening, calculateBettingOrder, notifyUser } from "../utils/game-logic.js";
import { OPENING_ROLLS_REQUIRED, getDieCost } from "../constants.js";
import { deductFromActor } from "../../wallet.js";
import { drinkForPayment } from "../utils/game-logic.js";

export async function submitStandardRoll({ state, tableData, userId, die, isOpeningPhase, ante, payload }) {
  // V2.0: Variable dice costs in betting phase
  let newPot = state.pot;
  let rollCost = 0;
  if (!isOpeningPhase) {
    // V4.9: Dared rolls are FREE
    if (tableData.dared?.[userId]) {
      rollCost = 0;
    } else {
      rollCost = getDieCost(die, ante);
    }

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
      }
    }
  }

  // V3: Hunch Accuracy - Use pre-rolled value if available
  let forcedResult = null;
  if (tableData.hunchRolls?.[userId] && tableData.hunchRolls[userId][die] !== undefined) {
    forcedResult = tableData.hunchRolls[userId][die];
  }

  let roll;
  if (forcedResult !== null) {
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

  if (die === 20 && naturalRoll === 20) {
    const currentTotal = tableData.totals[userId] ?? 0;
    result = 21 - currentTotal;
  }

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

  // In betting phase, delay visuals until after cheat resolution to avoid double rolls.
  if (isOpeningPhase) {
    try {
      await tavernSocket.executeAsUser("showRoll", userId, {
        formula: `1d${die}`,
        die: die,
        result: result,
        blind: isBlind
      });
    } catch (e) {
      console.warn("Tavern Twenty-One | Could not show dice to player:", e);
    }
  }

  const rolls = { ...tableData.rolls };
  const totals = { ...tableData.totals };
  const cleaningFees = { ...tableData.cleaningFees };
  const visibleTotals = { ...tableData.visibleTotals };

  const existingRolls = rolls[userId] ?? [];
  const isPublic = isOpeningPhase ? existingRolls.length === 0 : false;

  rolls[userId] = [...existingRolls, { die, result, public: isPublic, blind: isBlind }];
  totals[userId] = (totals[userId] ?? 0) + result;

  if (isPublic) {
    visibleTotals[userId] = (visibleTotals[userId] ?? 0) + result;
  }

  if (naturalRoll === 1) {
    cleaningFees[userId] = (cleaningFees[userId] ?? 0) + 1;
  }

  const busts = { ...tableData.busts };
  const isBust = totals[userId] > 21;
  let pendingBust = false;
  if (isBust && !isOpeningPhase) {
    pendingBust = true;
  } else if (isBust) {
    busts[userId] = true;
    tavernSocket.executeForEveryone("showBustFanfare", userId);
  }

  const userName = getActorName(userId);

  let rollCostMsg = "";
  if (!isOpeningPhase) {
    if (rollCost === 0) rollCostMsg = " (FREE)";
    else rollCostMsg = ` (${rollCost}gp)`;
  }

  let specialMsg = "";
  if (die === 20 && naturalRoll === 20) {
    specialMsg = " **NATURAL 20 = INSTANT 21!**";
  } else if (naturalRoll === 1) {
    specialMsg = " *Spilled drink! 1gp cleaning fee.*";
  }

  if (isOpeningPhase) {
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
      await addHistoryEntry({
        type: "roll",
        player: userName,
        die: `d${die}`,
        result,
        total: totals[userId],
        message: `${userName} rolled a d${die}${rollCostMsg}...${specialMsg}`,
      });
    }
  }

  const goadBackfire = { ...tableData.goadBackfire };
  if (goadBackfire[userId]?.mustRoll) {
    delete goadBackfire[userId];
  }

  const dared = { ...tableData.dared };
  if (dared[userId]) {
    delete dared[userId];
  }

  const hunchLocked = { ...tableData.hunchLocked };
  const hunchLockedDie = { ...tableData.hunchLockedDie };
  if (hunchLocked[userId]) {
    delete hunchLocked[userId];
    delete hunchLockedDie[userId];
  }

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
    dared,
    hunchLocked,
    hunchLockedDie,
    hunchPrediction,
    hunchExact,
    hunchRolls,
    pendingBust: pendingBust ? userId : null,
  };

  if (!isOpeningPhase) {
    updatedTable.hasActed = { ...updatedTable.hasActed, [userId]: true };
  }

  await updateState((current) => ({
    tableData: updatedTable,
    pot: current.pot + rollCost,
  }));

  if (isOpeningPhase) {
    const myRolls = rolls[userId] ?? [];
    if (myRolls.length >= OPENING_ROLLS_REQUIRED || isBust) {
      if (allPlayersCompletedOpening(state, updatedTable)) {
        updatedTable.bettingOrder = calculateBettingOrder(state, updatedTable);
        updatedTable.phase = "betting";
        updatedTable.currentPlayer = updatedTable.bettingOrder.find(id => !updatedTable.busts[id]) ?? null;
        updatedTable.sideBetRound = 1;
        updatedTable.sideBetRoundStart = updatedTable.currentPlayer;

        const orderNames = updatedTable.bettingOrder
          .filter(id => !updatedTable.busts[id])
          .map(id => {
            const name = game.users.get(id)?.name ?? "Unknown";
            const vt = updatedTable.visibleTotals[id] ?? 0;
            return `${name} (${vt})`;
          })
          .join(" → ");

        await addLogToAll({
          title: "Betting Round",
          message: `Opening complete!<br><strong>Turn order:</strong> ${orderNames}<br><em>d20: FREE | d10: 1/2 Ante | d6/d8: Ante | d4: 2x Ante</em>`,
          icon: "fa-solid fa-hand-holding-dollar",
          type: "phase"
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
