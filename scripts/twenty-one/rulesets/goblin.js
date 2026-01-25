import { updateState, addHistoryEntry, addLogToAll } from "../../state.js";
import { tavernSocket } from "../../socket.js";
import { getActorName } from "../utils/actors.js";
import { allPlayersFinished } from "../utils/game-logic.js";
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
  let bust = false;
  let multiplier = 1;
  let exploded = false;

  if (die === 2) {
    if (naturalRoll === 1) {
      bust = true;
    } else {
      multiplier = 2;
      result = 0;
    }
  } else {
    if (naturalRoll === 1) {
      bust = true;
    } else if (die === 20 && naturalRoll === 20) {
      exploded = true;
    }
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
  let currentTotal = totals[userId] ?? 0;
  if (multiplier > 1) {
    currentTotal *= multiplier;
  } else {
    currentTotal += result;
  }
  totals[userId] = currentTotal;

  if (isPublic) {
    let currentVisible = visibleTotals[userId] ?? 0;
    if (multiplier > 1) {
      currentVisible *= multiplier;
    } else {
      currentVisible += result;
    }
    visibleTotals[userId] = currentVisible;
  }

  // Mark die as used (Unless exploded)
  if (!exploded && die !== 2) {
    usedDiceMap[userId] = [...(usedDiceMap[userId] ?? []), die];
  }

  // Track full-set progress
  if (die !== 2) {
    const progress = new Set(goblinSetProgress[userId] ?? []);
    progress.add(die);
    goblinSetProgress[userId] = [...progress];
  }

  // Check Bust
  if (bust) {
    busts[userId] = true;
    tavernSocket.executeForEveryone("showBustFanfare", userId);
  }

  const userName = getActorName(userId);
  let msg = "";
  if (die === 2) {
    if (bust) msg = `${userName} flipped TAILS and DIED! (Bust)`;
    else msg = `${userName} flipped HEADS and DOUBLED their score to ${currentTotal}!`;
  } else {
    if (bust) msg = `${userName} rolled a 1 on d${die} and BUSTED!`;
    else if (exploded) msg = `${userName} rolled a NAT 20! The d20 explodes and can be rolled again!`;
    else msg = `${userName} rolled ${result} on d${die}. Total: ${currentTotal}.`;
  }

  if (tableData.phase === "opening") {
    await addLogToAll({
      title: bust ? "BUST!" : (exploded ? "Explosion!" : "Roll"),
      message: msg,
      icon: bust ? "fa-solid fa-skull" : "fa-solid fa-dice",
      type: bust ? "bust" : "roll",
      cssClass: bust ? "failure" : (exploded ? "success" : "")
    });

    await addHistoryEntry({
      type: bust ? "bust" : "roll",
      player: userName,
      die: `d${die}`,
      result: naturalRoll,
      total: currentTotal,
      message: msg
    });
  }

  let fullSetReset = false;
  if (!bust) {
    const requiredDice = [4, 6, 8, 10, 20];
    const progress = new Set(goblinSetProgress[userId] ?? []);
    fullSetReset = requiredDice.every(d => progress.has(d));
    if (fullSetReset) {
      usedDiceMap[userId] = [];
      goblinSetProgress[userId] = [];
    }
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

  const next = await updateState({ tableData: updatedTable });
  if (allPlayersFinished(state, updatedTable)) {
    return revealDice();
  }

  return next;
}
