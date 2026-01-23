import { MODULE_ID, getState, updateState, addHistoryEntry } from "../../state.js";
import { canAffordAnte, deductAnteFromActors, deductFromActor, payOutWinners } from "../../wallet.js";
import { createChatCard } from "../../ui/chat.js";
import { showPublicRoll } from "../../dice.js";

import { tavernSocket } from "../../socket.js";
import { getActorForUser } from "../utils/actors.js";
import { calculateBettingOrder, getGMUserIds } from "../utils/game-logic.js";
import { emptyTableData } from "../constants.js";
import { processSideBetPayouts } from "./side-bets.js";

export async function startRound(startingHeat = 10) {
  const state = getState();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");

  if (!state.turnOrder.length) {
    ui.notifications.warn("No players at the table.");
    return state;
  }

  const affordability = canAffordAnte(state, ante);
  if (!affordability.ok) {
    ui.notifications.warn(`${affordability.name} cannot afford the ${ante}gp ante.`);
    return state;
  }

  await deductAnteFromActors(state, ante);


  const tableData = emptyTableData();

  // V5: Initialize Per-Player Heat
  for (const pid of state.turnOrder) {
    tableData.playerHeat[pid] = startingHeat;
  }

  // Calculate pot: each player antes
  // V3.5: If GM is playing as NPC, no house match (everyone antes equally)
  // If GM is house, house matches non-GM players
  const gmId = state.turnOrder.find(id => game.users.get(id)?.isGM);
  const gmPlayerData = gmId ? state.players?.[gmId] : null;
  const gmIsPlayingAsNpc = gmPlayerData?.playingAsNpc;

  let pot;
  if (gmIsPlayingAsNpc) {
    // GM is a player, no house match - everyone antes equally
    pot = state.turnOrder.length * ante;
  } else {
    // Traditional: non-GM players ante, house matches
    const nonGMPlayers = state.turnOrder.filter(id => !game.users.get(id)?.isGM);
    const playerAntes = nonGMPlayers.length * ante;
    const houseMatch = playerAntes;
    pot = playerAntes + houseMatch;
  }

  // V3: Auto-roll 2d10 for everyone (1 visible, 1 hole)
  let lowestVisible = Infinity;
  let cutPlayerId = null;

  // Execute rolls in parallel for speed
  const rollPromises = state.turnOrder.map(async (userId) => {
    const roll1 = await new Roll("1d10").evaluate();
    const roll2 = await new Roll("1d10").evaluate();

    // Show dice to player immediately (visible die public, hole die private)
    try {
      // Don't await the socket call to prevent blocking other processing
      tavernSocket.executeAsUser("showRoll", userId, {
        formula: "1d10",
        die: 10,
        result: roll1.total
      });
    } catch (e) {
      console.warn("Tavern Twenty-One | Could not show dice to player:", e);
    }

    return { userId, roll1, roll2 };
  });

  const results = await Promise.all(rollPromises);

  // Process results
  for (const { userId, roll1, roll2 } of results) {
    tableData.rolls[userId] = [
      { die: 10, result: roll1.total, public: true },   // Visible
      { die: 10, result: roll2.total, public: false },  // Hole
    ];
    tableData.totals[userId] = roll1.total + roll2.total;
    tableData.visibleTotals[userId] = roll1.total;

    // Track lowest visible for The Cut
    if (roll1.total < lowestVisible) {
      lowestVisible = roll1.total;
      cutPlayerId = userId;
    }
  }

  // V3: Calculate betting order (sorted by visible total, lowest first)
  tableData.bettingOrder = calculateBettingOrder(state, tableData);

  // V3: Set up The Cut - lowest visible die can re-roll hole
  tableData.theCutPlayer = cutPlayerId;
  tableData.theCutUsed = false;

  // V3: Transition to cut phase if someone gets The Cut, otherwise straight to betting
  if (cutPlayerId && state.turnOrder.length > 1) {
    tableData.phase = "cut";
    tableData.currentPlayer = cutPlayerId;
  } else {
    tableData.phase = "betting";
    tableData.currentPlayer = tableData.bettingOrder.find(id => !tableData.busts[id]) ?? null;
  }

  const next = await updateState({
    status: "PLAYING",
    pot,
    tableData,
    turnIndex: 0,
  });

  const playerNames = state.turnOrder.map(id => game.users.get(id)?.name).join(", ");
  await addHistoryEntry({
    type: "round_start",
    message: `New round started. Ante: ${ante}gp each. Pot: ${pot}gp.`,
    players: playerNames,
  });

  // V3: Updated message for auto-roll opening
  const cutPlayerName = cutPlayerId ? (getActorForUser(cutPlayerId)?.name ?? game.users.get(cutPlayerId)?.name ?? "Unknown") : null;
  let chatMessage = `Each player antes ${ante}gp. The house matches. Pot: <strong>${pot}gp</strong><br>` +
    `<em>All hands dealt (2d10 each: 1 visible, 1 hole)</em>`;

  if (cutPlayerId && state.turnOrder.length > 1) {
    chatMessage += `<br><strong>${cutPlayerName}</strong> has The Cut (lowest visible: ${lowestVisible})`;
  }

  await createChatCard({
    title: "Twenty-One",
    subtitle: "A new round begins!",
    message: chatMessage,
    icon: "fa-solid fa-coins",
  });

  return next;
}

export async function revealDice() {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();

  // Mark as revealing
  await updateState({ status: "REVEALING" });


  // Show all rolls publicly - launch all dice animations in parallel for speed
  const rollPromises = [];
  for (const oduserId of state.turnOrder) {
    const playerRolls = tableData.rolls[oduserId] ?? [];
    for (const rollData of playerRolls) {
      rollPromises.push((async () => {
        const roll = await new Roll(`1d${rollData.die}`).evaluate();
        // Override the result to show the actual value
        if (roll.terms?.[0]?.results?.[0]) {
          roll.terms[0].results[0].result = rollData.result;
          roll._total = rollData.result;
        }
        await showPublicRoll(roll, oduserId);
      })());
    }
  }

  await Promise.all(rollPromises);
  await new Promise(r => setTimeout(r, 500));

  // V4.8.47: Staredown Cinematic
  tavernSocket.executeForEveryone("showSkillCutIn", "STAREDOWN", null, null);
  await new Promise(r => setTimeout(r, 2500));

  // Now transition to The Staredown
  const accusationCost = Math.floor(state.pot / 2);

  await createChatCard({
    title: "The Staredown",
    subtitle: "All dice revealed. But can you trust what you see?",
    message: `<strong>Make an Accusation?</strong> (Costs <strong>${accusationCost}gp</strong> - half the pot)<br>` +
      `Point your finger at someone you suspect. If they cheated and you beat their skill, they're caught!<br>` +
      `<em>But accuse an innocent... and you forfeit your winnings.</em>`,
    icon: "fa-solid fa-eye",
  });

  return updateState({ status: "INSPECTION" });
}

export async function finishRound() {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();

  await updateState({ status: "REVEALING" });

  // V2.0: Check for fumbled cheaters (physical cheat < 10 = auto-caught)
  const caught = { ...tableData.caught };
  const fumbledCheaterNames = [];
  for (const [cheaterId, cheaterData] of Object.entries(tableData.cheaters)) {
    if (caught[cheaterId]) continue; // Already caught
    const cheats = cheaterData.cheats ?? cheaterData.deceptionRolls ?? [];
    for (const cheatRecord of cheats) {
      if (cheatRecord.fumbled) {
        caught[cheaterId] = true;
        const cheaterName = getActorForUser(cheaterId)?.name ?? game.users.get(cheaterId)?.name ?? "Unknown";
        fumbledCheaterNames.push(cheaterName);
        break;
      }
    }
  }

  if (fumbledCheaterNames.length > 0) {
    await createChatCard({
      title: "Fumbled!",
      subtitle: "A clumsy cheater exposed!",
      message: `<strong>${fumbledCheaterNames.join(", ")}</strong> fumbled their sleight of hand and got caught red-handed!`,
      icon: "fa-solid fa-hand-fist",
    });
  }

  // V2.0: If an accusation was made, reveal the outcome and handle bounty
  if (tableData.accusation) {
    const { accuserId, targetId, success, cost, bounty } = tableData.accusation;
    const accuserName = getActorForUser(accuserId)?.name ?? game.users.get(accuserId)?.name ?? "Unknown";
    const targetName = getActorForUser(targetId)?.name ?? game.users.get(targetId)?.name ?? "Unknown";

    await new Promise(r => setTimeout(r, 1000));

    if (success) {


      const refund = cost ?? 0;
      const bountyAmount = bounty ?? 0;

      let actualBounty = 0;
      if (bountyAmount > 0) {
        const collected = await deductFromActor(targetId, bountyAmount);
        actualBounty = collected ? bountyAmount : 0;
      }

      const totalReward = refund + actualBounty;
      if (totalReward > 0) {
        await payOutWinners({ [accuserId]: totalReward });
      }

      const bountyMsg = actualBounty > 0 ? `${actualBounty}gp bounty` : "no bounty (they're broke!)";

      await createChatCard({
        title: "Cheater Caught!",
        subtitle: `${accuserName} was right!`,
        message: `<strong>${targetName}</strong> was caught cheating and forfeits the round.<br>
          <em>${accuserName} receives ${refund}gp refund + ${bountyMsg} = <strong>${totalReward}gp</strong>!</em>`,
        icon: "fa-solid fa-gavel",
      });

      await addHistoryEntry({
        type: "cheat_caught",
        accuser: accuserName,
        caught: targetName,
        reward: totalReward,
        message: `${accuserName} caught ${targetName} cheating and earned ${totalReward}gp!`,
      });
    } else {


      await createChatCard({
        title: "False Accusation!",
        subtitle: `${targetName} is innocent.`,
        message: `<strong>${accuserName}</strong> was wrong and loses their ${cost ?? 0}gp accusation fee.`,
        icon: "fa-solid fa-face-frown",
      });

      await addHistoryEntry({
        type: "accusation_failed",
        accuser: accuserName,
        target: targetName,
        cost: cost ?? 0,
        message: `${accuserName} falsely accused ${targetName} and loses ${cost ?? 0}gp.`,
      });
    }

    await new Promise(r => setTimeout(r, 500));
  }

  const totals = tableData.totals ?? {};
  let best = 0;
  state.turnOrder.forEach((id) => {
    if (caught[id]) return;
    const total = totals[id] ?? 0;
    if (total <= 21 && total > best) best = total;
  });

  const winners = state.turnOrder.filter((id) => {
    if (caught[id]) return false;
    if (tableData.folded?.[id]) return false; // V3: Folded players cannot win
    return (totals[id] ?? 0) === best && best > 0;
  });

  if (winners.length > 1) {
    const duelParticipantNames = winners.map(id =>
      getActorForUser(id)?.name ?? game.users.get(id)?.name ?? "Unknown"
    ).join(" vs ");

    await createChatCard({
      title: "The Duel!",
      subtitle: "Highest total wins!",
      message: `<strong>${duelParticipantNames}</strong> are tied for the win!<br>
        <em>The stakes are high. One final clash to settle the pot!</em><br>
        <span style="font-size: 0.9em; color: #888;">Roll 1d20 + 1d4 per Hit taken this round.</span>`,
      icon: "fa-solid fa-swords",
    });

    // V4.8.50: Duel Cinematic (Fixed)
    const [p1, p2] = winners; // Guaranteed to have at least 2
    tavernSocket.executeForEveryone("showSkillCutIn", "DUEL", p1, p2);
    await new Promise(r => setTimeout(r, 3000));

    const duel = {
      active: true,
      participants: [...winners],
      rolls: {},
      pendingRolls: [...winners],
      round: 1,
      pot: state.pot,
    };

    await addHistoryEntry({
      type: "duel_start",
      participants: duelParticipantNames,
      message: `Duel! ${duelParticipantNames} clash for the pot!`,
    });

    return updateState({
      status: "DUEL",
      tableData: { ...tableData, caught, duel },
    });
  }

  // V3.5: Collect cleaning fees BEFORE payout - they go into the pot
  const cleaningFees = tableData.cleaningFees ?? {};
  const cleaningFeeMessages = [];
  let totalCleaningFees = 0;
  for (const [odId, fee] of Object.entries(cleaningFees)) {
    if (fee > 0) {
      await deductFromActor(odId, fee);
      totalCleaningFees += fee;
      const userName = game.users.get(odId)?.name ?? "Unknown";
      cleaningFeeMessages.push(`${userName}: ${fee}gp`);
    }
  }

  // Add cleaning fees to pot before winner takes it
  const finalPot = state.pot + totalCleaningFees;

  if (cleaningFeeMessages.length > 0) {
    await createChatCard({
      title: "Cleaning Fees",
      subtitle: "Spilled Drinks → Added to Pot",
      message: `Cleaning fees collected (${totalCleaningFees}gp added to pot):<br>${cleaningFeeMessages.join("<br>")}`,
      icon: "fa-solid fa-broom",
    });
  }

  if (winners.length === 1) {
    const payouts = { [winners[0]]: finalPot };
    await payOutWinners(payouts);

    // V4.1: Victory Fanfare
    try {
      await tavernSocket.executeForEveryone("showVictoryFanfare", winners[0]);
    } catch (e) {
      console.warn("Could not show victory fanfare:", e);
    }

    // V4: Process side bet payouts
    await processSideBetPayouts(winners[0]);
  } else if (winners.length === 0) {

    // V4: No winner - side bets lost
    await processSideBetPayouts(null);
  }

  return updateState({
    status: "PAYOUT",
    pot: 0,
    tableData: { ...tableData, caught },
  });
}

export async function returnToLobby() {
  return updateState({
    status: "LOBBY",
    pot: 0,
    tableData: emptyTableData(),
  });
}
