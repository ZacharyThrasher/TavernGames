import { MODULE_ID, getState, updateState, addHistoryEntry } from "../../state.js";
import { deductFromActor, payOutWinners } from "../../wallet.js";
import { createChatCard } from "../../ui/chat.js";
import { tavernSocket } from "../../socket.js";
import { getActorForUser } from "../utils/actors.js";
import { notifyUser } from "../utils/game-logic.js";
import { emptyTableData, OPENING_ROLLS_REQUIRED } from "../constants.js";
import { finishRound } from "./core.js";

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

  const actor = getActorForUser(userId);
  const userName = actor?.name ?? game.users.get(userId)?.name ?? "Unknown";

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

    // V3.4: Public chat does NOT reveal the new value
    await createChatCard({
      title: "The Cut",
      subtitle: `${userName} takes the cut!`,
      message: `Re-rolled their hole die. <em>The new value remains hidden...</em>`,
      icon: "fa-solid fa-scissors",
    });

    // V4.6: Whisper actual values only to the cut player (no GM privilege)
    // V4.9: Secret Private Feedback (Hidden from GM)
    const cutFeedback = `<div class="tavern-skill-result success">
        <strong>The Cut</strong><br>
        Your hole die: ${oldValue} → <strong>${roll.total}</strong><br>
        <em>New Total: ${tableData.totals[userId]}</em>
      </div>`;
    await tavernSocket.executeForUsers("showPrivateFeedback", [userId], userId, "The Cut Result", cutFeedback);

    await addHistoryEntry({
      type: "cut",
      player: userName,
      message: `${userName} used The Cut (hole die re-rolled).`,
    });
  } else {
    await createChatCard({
      title: "The Cut",
      subtitle: `${userName} passes`,
      message: `Kept their original hole die`,
      icon: "fa-solid fa-hand",
    });
  }

  tableData.phase = "betting";
  tableData.theCutUsed = true;
  tableData.currentPlayer = tableData.bettingOrder.find(id => !tableData.busts[id]) ?? null;
  // V3.5.2: Reset skill usage for first player after cut phase
  tableData.skillUsedThisTurn = false;

  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const orderNames = tableData.bettingOrder
    .filter(id => !tableData.busts[id])
    .map(id => {
      const name = game.users.get(id)?.name ?? "Unknown";
      const vt = tableData.visibleTotals[id] ?? 0;
      return `${name} (${vt})`;
    })
    .join(" → ");

  await createChatCard({
    title: "Betting Round",
    subtitle: "The game begins!",
    message: `<strong>Turn order (by visible total):</strong> ${orderNames}<br><em>d20: FREE | d10: ${Math.floor(ante / 2)}gp | d6/d8: ${ante}gp | d4: ${ante * 2}gp</em>`,
    icon: "fa-solid fa-hand-holding-dollar",
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

  const actor = getActorForUser(userId);
  const userName = actor?.name ?? game.users.get(userId)?.name ?? "Unknown";

  const playerRolls = tableData.rolls[userId] ?? [];
  const hitsTaken = Math.max(0, playerRolls.length - OPENING_ROLLS_REQUIRED);

  const d4Count = hitsTaken;
  const formula = d4Count > 0 ? `1d20 + ${d4Count}d4` : "1d20";
  const roll = await new Roll(formula).evaluate();

  const d20Result = roll.dice[0]?.total ?? roll.total;
  const d4Total = d4Count > 0 ? (roll.dice[1]?.total ?? 0) : 0;
  const total = roll.total;

  await ChatMessage.create({
    speaker: { alias: userName },
    flavor: `<em>${userName} rolls for the duel...</em><br>Duel Roll${hitsTaken > 0 ? ` (+${hitsTaken}d4 for Hits taken)` : ""}`,
    content: `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">${formula}</div><div class="dice-tooltip"><section class="tooltip-part"><div class="dice"><ol class="dice-rolls"><li class="roll die d20">${d20Result}</li></ol></div></section>${d4Count > 0 ? `<section class="tooltip-part"><div class="dice"><ol class="dice-rolls">${d4Total}</ol></div></section>` : ""}</div><h4 class="dice-total">${total}</h4></div></div>`,
    rolls: [roll],
  });

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
    const playerName = getActorForUser(playerId)?.name ?? game.users.get(playerId)?.name ?? "Unknown";
    results.push({ playerId, playerName, ...rollData });
    if (rollData.total > highestTotal) {
      highestTotal = rollData.total;
    }
  }

  const winners = results.filter(r => r.total === highestTotal);

  if (winners.length > 1) {
    const tiedNames = winners.map(w => w.playerName).join(" vs ");

    await createChatCard({
      title: "Sudden Death!",
      subtitle: "The duel continues...",
      message: `<strong>${tiedNames}</strong> are still tied at <strong>${highestTotal}</strong>!<br>
        <em>Neither side yields! They clash again with renewed intensity!</em><br>
        <strong>Next Roll: d20 + d4s (Same Hits)</strong>`,
      icon: "fa-solid fa-swords",
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

  await createChatCard({
    title: "Duel Victory!",
    subtitle: `${winner.playerName} wins the duel!`,
    message: `<strong>${winner.playerName}</strong> claims the pot of <strong>${potAmount}gp</strong>!<br>
      <div class="tavern-results">${resultsMsg}</div>`,
    icon: "fa-solid fa-trophy",
  });

  await addHistoryEntry({
    type: "duel_end",
    winner: winner.playerName,
    payout: potAmount,
    round: duel.round,
    message: `${winner.playerName} wins the duel and ${potAmount}gp!`,
  });

  // V4.8.61: Trigger Victory Fanfare for Duel Winner
  tavernSocket.executeForEveryone("showVictoryFanfare", winner.playerId);

  return updateState({
    status: "PAYOUT",
    tableData: { ...tableData, duel: null },
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

  const accuserActor = getActorForUser(userId);
  const accuserName = accuserActor?.name ?? game.users.get(userId)?.name ?? "Unknown";
  const targetName = getActorForUser(targetId)?.name ?? game.users.get(targetId)?.name ?? "Unknown";

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

    const bountyMsg = actualBounty > 0 ? `${actualBounty}gp bounty` : "no bounty (they're broke!)";

    await createChatCard({
      title: "Cheater Caught!",
      subtitle: `${accuserName} nailed it!`,
      message: `<strong>${accuserName}</strong> accused <strong>${targetName}</strong>'s <strong>${dieLabel}</strong>!<br>
        <strong>That die WAS cheated!</strong> ${targetName} forfeits the round.<br>
        <em>${accuserName} receives ${accusationCost}gp refund + ${bountyMsg} = <strong>${totalReward}gp</strong>!</em>`,
      icon: "fa-solid fa-gavel",
    });


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

    await createChatCard({
      title: "False Accusation!",
      subtitle: `That die was clean.`,
      message: `<strong>${accuserName}</strong> accused <strong>${targetName}</strong>'s <strong>${dieLabel}</strong>!<br>
        <em>That specific die was NOT cheated.</em><br>
        ${accuserName} loses their ${accusationCost}gp accusation fee.`,
      icon: "fa-solid fa-face-frown",
    });


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
