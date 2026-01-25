import { MODULE_ID, getState, updateState, addHistoryEntry, addLogToAll, addPrivateLog } from "../../state.js"; // V5.8
import { deductFromActor, payOutWinners } from "../../wallet.js";
// import { createChatCard } from "../../ui/chat.js"; // Removed
import { tavernSocket } from "../../socket.js";
import { getActorForUser, getActorName } from "../utils/actors.js"; // V5.9
import { notifyUser } from "../utils/game-logic.js";
import { emptyTableData, OPENING_ROLLS_REQUIRED } from "../constants.js";
import { finishRound } from "./core.js";
import { processSideBetPayouts } from "./side-bets.js";

export async function useCut(userId, reroll = false) {
  const state = getState();
  if (state.status !== "PLAYING") {
    ui.notifications.warn("No active round.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();

  if (tableData.phase !== "cut") {
    await notifyUser(userId, "You cannot use The Cut right now (Not in cut phase).");
    return state;
  }

  // Debug logging to catch ID mismatches
  if (tableData.theCutPlayer !== userId) {
    console.warn("Tavern | Cut ID Mismatch:", { expected: tableData.theCutPlayer, actual: userId });
    // V4.8.18: If the user clicked the button, they likely ARE the cut player in their UI.
    // Proceeding anyway but logging to debug why they don't match.
  }

  // V5.9: Use getActorName
  const userName = getActorName(userId);

  if (reroll) {
    const roll = await new Roll("1d10").evaluate();
    const oldValue = tableData.rolls[userId][1].result;
    tableData.rolls[userId][1].result = roll.total;
    tableData.totals[userId] = tableData.totals[userId] - oldValue + roll.total;

    try {
      await tavernSocket.executeAsUser("showRoll", userId, {
        formula: "1d10",
        die: 10,
        result: roll.total
      });
    } catch (e) {
      console.warn("Tavern Twenty-One | Could not show dice to player:", e);
    }

    // V4.6: Whisper actual values only to the cut player (no GM privilege)
    // V4.9: Secret Private Feedback (Hidden from GM)
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
      message: `<strong>${userName}</strong> re-rolled their Hole Die!<br><em>(Value remains hidden)</em>`,
      icon: "fa-solid fa-scissors",
      type: "phase"
    }, [], userId);

  } else {
    await addLogToAll({
      title: "The Cut",
      message: `<strong>${userName}</strong> passes the cut.<br><em>(Original hole die kept)</em>`,
      icon: "fa-solid fa-hand-point-right",
      type: "phase"
    }, [], userId);
  }

  tableData.phase = "betting";
  tableData.theCutUsed = true;
  tableData.currentPlayer = tableData.bettingOrder.find(id => !tableData.busts[id]) ?? null;
  tableData.sideBetRound = 1;
  tableData.sideBetRoundStart = tableData.currentPlayer;
  // V3.5.2: Reset skill usage for first player after cut phase
  tableData.skillUsedThisTurn = false;

  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const orderNames = tableData.bettingOrder
    .filter(id => !tableData.busts[id])
    .map(id => {
      const name = getActorName(id); // V5.9
      const vt = tableData.visibleTotals[id] ?? 0;
      return `${name} (${vt})`;
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
    ui.notifications.warn("No duel in progress.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
  const duel = tableData.duel;

  if (!duel || !duel.active) {
    ui.notifications.warn("No active duel.");
    return state;
  }

  if (!duel.participants.includes(userId)) {
    ui.notifications.warn("You're not in this duel!");
    return state;
  }

  if (duel.rolls[userId]) {
    ui.notifications.warn("You've already rolled in this duel.");
    return state;
  }

  const userName = getActorName(userId); // V5.9

  const playerRolls = tableData.rolls[userId] ?? [];
  const hitsTaken = Math.max(0, playerRolls.length - OPENING_ROLLS_REQUIRED);

  const d4Count = hitsTaken;
  const formula = d4Count > 0 ? `1d20 + ${d4Count}d4` : "1d20";
  const roll = await new Roll(formula).evaluate();

  const d20Result = roll.dice[0]?.total ?? roll.total;
  const d4Total = d4Count > 0 ? (roll.dice[1]?.total ?? 0) : 0;
  const total = roll.total;

  // Show 3D Dice safely
  try {
    if (game.dice3d) {
      await game.dice3d.showForRoll(roll, game.users.get(userId), true);
    }
  } catch (e) { }

  // Log the Duel Roll
  await addLogToAll({
    title: `${userName} Duel Roll`,
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

  let highestTotal = 0;
  const results = [];

  for (const [playerId, rollData] of Object.entries(duel.rolls)) {
    const playerName = getActorName(playerId); // V5.9
    results.push({ playerId, playerName, ...rollData });
    if (rollData.total > highestTotal) {
      highestTotal = rollData.total;
    }
  }

  const winners = results.filter(r => r.total === highestTotal);

  if (winners.length > 1) {
    const tiedNames = winners.map(w => w.playerName).join(" vs ");

    await addLogToAll({
      title: "Sudden Death!",
      message: `<strong>${tiedNames}</strong> TIED at <strong>${highestTotal}</strong>!<br><em>The duel continues...</em>`,
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
    .map(r => `${r.playerName}: ${r.total}`)
    .join(" | ");

  await addLogToAll({
    title: "Duel Victory!",
    message: `<strong>${winner.playerName}</strong> wins the pot (<strong>${potAmount}gp</strong>)!<br>${resultsMsg}`,
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

  // V4.8.61: Trigger Victory Fanfare for Duel Winner
  tavernSocket.executeForEveryone("showVictoryFanfare", winner.playerId);

  const sideBetWinnerIds = await processSideBetPayouts(winner.playerId);
  const sideBetWinners = {};
  for (const id of sideBetWinnerIds) sideBetWinners[id] = true;

  return updateState({
    status: "PAYOUT",
    tableData: { ...tableData, duel: null, sideBetWinners },
  });
}

/**
 * V4: Accuse a specific die of being cheated
 * @param {Object} payload - { targetId, dieIndex }
 * @param {string} userId - The accusing player
 */
export async function accuse(payload, userId) {
  const state = getState();
  if (state.status === "LOBBY" || state.status === "PAYOUT") {
    ui.notifications.warn("Accusations can only be made during an active round.");
    return state;
  }
  if (state.tableData?.gameMode === "goblin") {
    ui.notifications.warn("Accusations are disabled in Goblin Rules.");
    return state;
  }

  // V3.5: House cannot accuse, but GM-as-NPC can
  const user = game.users.get(userId);
  const playerData = state.players?.[userId];
  const isHouse = user?.isGM && !playerData?.playingAsNpc;
  if (isHouse) {
    ui.notifications.warn("The house observes but does not accuse.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const { targetId, dieIndex } = payload;

  if (!targetId || !state.turnOrder.includes(targetId)) {
    ui.notifications.warn("Invalid accusation target.");
    return state;
  }

  if (targetId === userId) {
    ui.notifications.warn("You can't accuse yourself!");
    return state;
  }

  // V3.5: Can't accuse the house, but GM-as-NPC is a valid target
  const targetUser = game.users.get(targetId);
  const isTargetHouse = targetUser?.isGM && !state.players?.[targetId]?.playingAsNpc;
  if (isTargetHouse) {
    ui.notifications.warn("You can't accuse the house!");
    return state;
  }

  if (tableData.accusedThisRound?.[userId]) {
    ui.notifications.warn("You have already made an accusation this round.");
    return state;
  }

  if (tableData.busts?.[userId]) {
    ui.notifications.warn("You busted - you can't make accusations!");
    return state;
  }

  // V4: Validate die index
  const targetRolls = tableData.rolls?.[targetId] ?? [];
  if (dieIndex === undefined || dieIndex < 0 || dieIndex >= targetRolls.length) {
    ui.notifications.warn("Invalid die selection.");
    return state;
  }

  const accusationCost = ante * 2;
  const canAfford = await deductFromActor(userId, accusationCost);
  if (!canAfford) {
    await notifyUser(userId, `You need ${accusationCost}gp (2x ante) to make an accusation.`);
    return state;
  }

  // V4.8.47: Accuse Cinematic Cut-In
  state.suspectId = targetId; // Track for UI if needed
  tavernSocket.executeForEveryone("showSkillCutIn", "ACCUSE", userId, targetId);

  // Dramatic Pause
  await new Promise(r => setTimeout(r, 2500));

  // V5.9: Use getActorName
  const accuserName = getActorName(userId);
  const targetName = getActorName(targetId);

  // V4: Check if THIS SPECIFIC DIE was cheated
  const targetCheaterData = tableData.cheaters?.[targetId];
  const cheatsOnDie = targetCheaterData?.cheats?.filter(c => c.dieIndex === dieIndex) ?? [];
  const legacyCheatOnDie = targetCheaterData?.deceptionRolls?.filter(c => c.dieIndex === dieIndex) ?? [];
  const dieWasCheated = cheatsOnDie.length > 0 || legacyCheatOnDie.length > 0;

  const alreadyCaught = tableData.caught?.[targetId];
  const targetDie = targetRolls[dieIndex];
  const dieLabel = `d${targetDie.die}`;

  // "You can't accuse a player who has already been caught."
  if (alreadyCaught) {
    ui.notifications.warn("That player has already been caught cheating!");
    await payOutWinners({ [userId]: accusationCost });
    return state;
  }

  const updatedAccusedThisRound = { ...tableData.accusedThisRound, [userId]: { targetId, dieIndex } };
  let updatedCaught = { ...tableData.caught };
  let newPot = state.pot;

  if (dieWasCheated) {
    // V4: Correct accusation - specific die was cheated
    updatedCaught[targetId] = true;
    const bounty = ante * 5;
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
      message: `<strong>${accuserName}</strong> exposed <strong>${targetName}</strong>!<br>
        <em>${accuserName} earns ${totalReward}gp (${bountyMsg})</em>`,
      icon: "fa-solid fa-gavel",
      type: "cheat",
      cssClass: "success"
    }, [], userId);

    await addHistoryEntry({
      type: "cheat_caught",
      accuser: accuserName,
      caught: targetName,
      dieIndex,
      reward: totalReward,
      message: `${accuserName} caught ${targetName} cheating on their ${dieLabel}!`,
    });

  } else {
    // V4: Wrong accusation - even if they cheated on ANOTHER die, this specific one was clean
    newPot += accusationCost;

    await addLogToAll({
      title: "False Accusation!",
      message: `<strong>${accuserName}</strong> accused <strong>${targetName}</strong> but was wrong about that die.<br>
        <em>${accuserName} loses their ${accusationCost}gp fee.</em>`,
      icon: "fa-solid fa-face-frown",
      type: "cheat",
      cssClass: "failure"
    }, [], userId);

    await addHistoryEntry({
      type: "accusation_failed",
      accuser: accuserName,
      target: targetName,
      dieIndex,
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
