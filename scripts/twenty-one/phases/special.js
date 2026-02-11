import { getState, updateState, addHistoryEntry, addLogToAll, addPrivateLog } from "../../state.js";
import { deductFromActor, payOutWinners } from "../../wallet.js";
import { tavernSocket } from "../../socket.js";
import { getActorName, getSafeActorName } from "../utils/actors.js";
import { getAccusationCost, isActingAsHouse, notifyUser } from "../utils/game-logic.js";
import { ACCUSATION_BOUNTY_MULTIPLIER, MODULE_ID, TIMING, emptyTableData, OPENING_ROLLS_REQUIRED } from "../constants.js";
import { finishRound } from "./core.js";
import { processSideBetPayouts } from "./side-bets.js";
import { summarizeDuelRolls } from "../rules/duel-rules.js";
import { delay, fireAndForget, withWarning } from "../utils/runtime.js";

export async function useCut(userId, reroll = false) {
  const state = getState();
  if (state.status !== "PLAYING") {
    await notifyUser(userId, "No active round.");
    return state;
  }

  let tableData = state.tableData ?? emptyTableData();

  if (tableData.phase !== "cut") {
    await notifyUser(userId, "You cannot use The Cut right now (Not in cut phase).");
    return state;
  }

  if (tableData.theCutPlayer !== userId) {
    await notifyUser(userId, "Only the player with The Cut can do that.");
    return state;
  }
  const userName = getActorName(userId);
  const safeUserName = getSafeActorName(userId);

  if (reroll) {
    const playerRolls = tableData.rolls?.[userId] ?? [];
    const holeRoll = playerRolls[1];
    if (!holeRoll) {
      await notifyUser(userId, "Your cut hand is missing a hole die.");
      return state;
    }

    const roll = await new Roll("1d10").evaluate();
    const oldValue = holeRoll.result;
    const updatedPlayerRolls = [...playerRolls];
    updatedPlayerRolls[1] = { ...holeRoll, result: roll.total };
    tableData = {
      ...tableData,
      rolls: { ...tableData.rolls, [userId]: updatedPlayerRolls },
      totals: {
        ...tableData.totals,
        [userId]: (tableData.totals?.[userId] ?? 0) - oldValue + roll.total,
      },
    };

    await withWarning("Could not show dice to player", () => tavernSocket.executeAsUser("showRoll", userId, {
      formula: "1d10",
      die: 10,
      result: roll.total
    }));
    await addPrivateLog(userId, {
      title: "The Cut Result",
      message: `Hole Die: ${oldValue} → <strong>${roll.total}</strong><br>New Total: ${tableData.totals[userId]}`,
      icon: "fa-solid fa-scissors",
      type: "phase",
      cssClass: "success"
    });

    await addHistoryEntry({
      type: "cut",
      player: userName,
      message: `${userName} used The Cut (hole die re-rolled).`,
    });

    // Public Log (Hidden Value)
    await addLogToAll({
      title: "The Cut",
      message: `<strong>${safeUserName}</strong> re-rolled their Hole Die!<br><em>(Value remains hidden)</em>`,
      icon: "fa-solid fa-scissors",
      type: "phase"
    }, [], userId);

  } else {
    await addLogToAll({
      title: "The Cut",
      message: `<strong>${safeUserName}</strong> passes the cut.<br><em>(Original hole die kept)</em>`,
      icon: "fa-solid fa-hand-point-right",
      type: "phase"
    }, [], userId);
  }

  tableData.phase = "betting";
  tableData.theCutUsed = true;
  tableData.currentPlayer = tableData.bettingOrder.find(id => !tableData.busts[id]) ?? null;
  tableData.sideBetRound = 1;
  tableData.sideBetRoundStart = tableData.currentPlayer;
  tableData.skillUsedThisTurn = false;

  const orderNames = tableData.bettingOrder
    .filter(id => !tableData.busts[id])
    .map(id => {
      const safeName = getSafeActorName(id);
      const vt = tableData.visibleTotals[id] ?? 0;
      return `${safeName} (${vt})`;
    })
    .join(" → ");

  await addLogToAll({
    title: "Betting Round",
    message: `<strong>Turn order:</strong> ${orderNames}<br><em>d20: FREE | d10: 1/2 Ante | d6/d8: Ante | d4: 2x Ante</em>`,
    icon: "fa-solid fa-hand-holding-dollar",
    type: "phase"
  });

  return updateState({ tableData });
}

export async function submitDuelRoll(userId) {
  const state = getState();
  if (state.status !== "DUEL") {
    await notifyUser(userId, "No duel in progress.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
  const duel = tableData.duel;

  if (!duel || !duel.active) {
    await notifyUser(userId, "No active duel.");
    return state;
  }

  if (!duel.participants.includes(userId)) {
    await notifyUser(userId, "You're not in this duel!");
    return state;
  }

  if (duel.rolls[userId]) {
    await notifyUser(userId, "You've already rolled in this duel.");
    return state;
  }

  const userName = getActorName(userId);
  const safeUserName = getSafeActorName(userId);

  const playerRolls = tableData.rolls[userId] ?? [];
  const hitsTaken = Math.max(0, playerRolls.length - OPENING_ROLLS_REQUIRED);

  const d4Count = hitsTaken;
  const formula = d4Count > 0 ? `1d20 + ${d4Count}d4` : "1d20";
  const roll = await new Roll(formula).evaluate();

  const d20Result = roll.dice[0]?.total ?? roll.total;
  const d4Total = d4Count > 0 ? (roll.dice[1]?.total ?? 0) : 0;
  const total = roll.total;

  // Show 3D Dice safely
  if (game.dice3d) {
    await withWarning("Could not show duel dice", () => game.dice3d.showForRoll(roll, game.users.get(userId), true));
  }

  // Log the Duel Roll
  await addLogToAll({
    title: `${safeUserName} Duel Roll`,
    message: `Rolled <strong>${formula}</strong><br>Result: <strong>${total}</strong>`,
    icon: "fa-solid fa-dice-d20",
    type: "roll"
  }, [], userId);

  const updatedDuel = {
    ...duel,
    rolls: { ...duel.rolls, [userId]: { total, d20: d20Result, d4Bonus: d4Total, hits: hitsTaken } },
    pendingRolls: duel.pendingRolls.filter(id => id !== userId),
  };

  const updatedTableData = {
    ...tableData,
    duel: updatedDuel,
  };

  await updateState({ tableData: updatedTableData });

  if (updatedDuel.pendingRolls.length === 0) {
    return resolveDuel();
  }

  return getState();
}

async function resolveDuel() {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();
  const duel = tableData.duel;

  if (!duel || !duel.active) {
    return state;
  }

  const duelSummary = summarizeDuelRolls(duel.rolls, {
    getNameForUserId: (id) => getActorName(id),
    getSafeNameForUserId: (id) => getSafeActorName(id)
  });
  const results = duelSummary.results;
  const winners = duelSummary.winners;
  const highestTotal = duelSummary.highestTotal;
  if (winners.length === 0) return state;

  if (winners.length > 1) {
    const tiedNames = winners.map(w => w.playerName).join(" vs ");
    const tiedNamesSafe = winners.map(w => w.safePlayerName).join(" vs ");

    await addLogToAll({
      title: "Sudden Death!",
      message: `<strong>${tiedNamesSafe}</strong> TIED at <strong>${highestTotal}</strong>!<br><em>The duel continues...</em>`,
      icon: "fa-solid fa-swords",
      type: "phase"
    });

    const updatedDuel = {
      ...duel,
      rolls: {}, // Reset rolls for the next round
      pendingRolls: winners.map(w => w.playerId),
      round: duel.round + 1,
    };

    await addHistoryEntry({
      type: "duel_tie",
      round: duel.round,
      tiedPlayers: tiedNames,
      message: `Duel stalemate at ${highestTotal}! Round ${duel.round + 1} begins...`,
    });

    return updateState({
      tableData: { ...tableData, duel: updatedDuel },
    });
  }

  const winner = winners[0];
  const potAmount = duel.pot;

  await payOutWinners({ [winner.playerId]: potAmount });


  const resultsMsg = results
    .sort((a, b) => b.total - a.total)
    .map(r => `${r.safePlayerName}: ${r.total}`)
    .join(" | ");

  await addLogToAll({
    title: "Duel Victory!",
      message: `<strong>${getSafeActorName(winner.playerId)}</strong> wins the pot (<strong>${potAmount}gp</strong>)!<br>${resultsMsg}`,
      icon: "fa-solid fa-trophy",
      type: "phase",
      cssClass: "success"
    }, [], winner.playerId);

  await addHistoryEntry({
    type: "duel_end",
    winner: winner.playerName,
    payout: potAmount,
    round: duel.round,
    message: `${winner.playerName} wins the duel and ${potAmount}gp!`,
  });
  fireAndForget("Could not show duel victory fanfare", tavernSocket.executeForEveryone("showVictoryFanfare", winner.playerId));

  const sideBetWinnerIds = await processSideBetPayouts(winner.playerId);
  const sideBetWinners = {};
  for (const id of sideBetWinnerIds) sideBetWinners[id] = true;

  return updateState({
    status: "PAYOUT",
    tableData: { ...tableData, duel: null, sideBetWinners },
  });
}

/**
 * @param {Object} payload - { targetId, dieIndex }
 * @param {string} userId - The accusing player
 */
export async function accuse(payload, userId) {
  const state = getState();
  if (!["PLAYING", "INSPECTION"].includes(state.status)) {
    await notifyUser(userId, "Accusations can only be made during an active round.");
    return state;
  }
  if (state.tableData?.gameMode === "goblin") {
    await notifyUser(userId, "Accusations are disabled in Goblin Rules.");
    return state;
  }

  if (isActingAsHouse(userId, state)) {
    await notifyUser(userId, "The house observes but does not accuse.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const { targetId, dieIndex } = payload ?? {};
  const dieIndexNumber = Number(dieIndex);

  if (!targetId || !state.turnOrder.includes(targetId)) {
    await notifyUser(userId, "Invalid accusation target.");
    return state;
  }

  if (targetId === userId) {
    await notifyUser(userId, "You can't accuse yourself!");
    return state;
  }

  if (isActingAsHouse(targetId, state)) {
    await notifyUser(userId, "You can't accuse the house!");
    return state;
  }

  if (tableData.accusedThisRound?.[userId]) {
    await notifyUser(userId, "You have already made an accusation this round.");
    return state;
  }

  if (tableData.busts?.[userId]) {
    await notifyUser(userId, "You busted - you can't make accusations!");
    return state;
  }
  const targetRolls = tableData.rolls?.[targetId] ?? [];
  if (!Number.isInteger(dieIndexNumber) || dieIndexNumber < 0 || dieIndexNumber >= targetRolls.length) {
    await notifyUser(userId, "Invalid die selection.");
    return state;
  }

  if (tableData.caught?.[targetId]) {
    await notifyUser(userId, "That player has already been caught cheating!");
    return state;
  }

  const accusationCost = getAccusationCost(ante);
  const canAfford = await deductFromActor(userId, accusationCost);
  if (!canAfford) {
    await notifyUser(userId, `You need ${accusationCost}gp to make an accusation.`);
    return state;
  }
  fireAndForget("Could not show accuse cut-in", tavernSocket.executeForEveryone("showSkillCutIn", "ACCUSE", userId, targetId));

  // Dramatic Pause
  await delay(TIMING.STAREDOWN_DELAY);
  const accuserName = getActorName(userId);
  const targetName = getActorName(targetId);
  const safeAccuserName = getSafeActorName(userId);
  const safeTargetName = getSafeActorName(targetId);
  const targetCheaterData = tableData.cheaters?.[targetId];
  const cheatsOnDie = targetCheaterData?.cheats?.filter(c => c.dieIndex === dieIndexNumber) ?? [];
  const legacyCheatOnDie = targetCheaterData?.deceptionRolls?.filter(c => c.dieIndex === dieIndexNumber) ?? [];
  const dieWasCheated = cheatsOnDie.length > 0 || legacyCheatOnDie.length > 0;

  const targetDie = targetRolls[dieIndexNumber];
  const dieLabel = `d${targetDie.die}`;

  const updatedAccusedThisRound = { ...tableData.accusedThisRound, [userId]: { targetId, dieIndex: dieIndexNumber } };
  let updatedCaught = { ...tableData.caught };
  let newPot = state.pot;

  if (dieWasCheated) {
    updatedCaught[targetId] = true;
    const bounty = ante * ACCUSATION_BOUNTY_MULTIPLIER;
    let actualBounty = 0;
    if (bounty > 0) {
      const collected = await deductFromActor(targetId, bounty);
      if (collected) actualBounty = bounty;
    }

    const totalReward = accusationCost + actualBounty;
    await payOutWinners({ [userId]: totalReward });

    const bountyMsg = actualBounty > 0 ? `${actualBounty}gp bounty` : "no bounty";

    await addLogToAll({
      title: "Cheater Caught!",
      message: `<strong>${safeAccuserName}</strong> exposed <strong>${safeTargetName}</strong>!<br>
        <em>${safeAccuserName} earns ${totalReward}gp (${bountyMsg})</em>`,
      icon: "fa-solid fa-gavel",
      type: "cheat",
      cssClass: "success"
    }, [], userId);

    await addHistoryEntry({
      type: "cheat_caught",
      accuser: accuserName,
      caught: targetName,
      dieIndex: dieIndexNumber,
      reward: totalReward,
      message: `${accuserName} caught ${targetName} cheating on their ${dieLabel}!`,
    });

  } else {
    newPot += accusationCost;

    await addLogToAll({
      title: "False Accusation!",
      message: `<strong>${safeAccuserName}</strong> accused <strong>${safeTargetName}</strong> but was wrong about that die.<br>
        <em>${safeAccuserName} loses their ${accusationCost}gp fee.</em>`,
      icon: "fa-solid fa-face-frown",
      type: "cheat",
      cssClass: "failure"
    }, [], userId);

    await addHistoryEntry({
      type: "accusation_failed",
      accuser: accuserName,
      target: targetName,
      dieIndex: dieIndexNumber,
      cost: accusationCost,
      message: `${accuserName} falsely accused ${targetName}'s ${dieLabel} and loses ${accusationCost}gp.`,
    });
  }

  return updateState({
    tableData: {
      ...tableData,
      accusedThisRound: updatedAccusedThisRound,
      caught: updatedCaught
    },
    pot: newPot
  });
}

export async function skipInspection() {
  const state = getState();
  if (state.status !== "INSPECTION") {
    return state;
  }
  return finishRound();
}


