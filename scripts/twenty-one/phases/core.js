import { getState, updateState, addHistoryEntry, addLogToAll } from "../../state.js";
import { MODULE_ID } from "../constants.js";
import { canAffordAnte, deductAnteFromActors, deductFromActor, payOutWinners } from "../../wallet.js";
import { showPublicRoll } from "../../dice.js";

import { tavernSocket } from "../../socket.js";
import { getActorName, getSafeActorName } from "../utils/actors.js";
import { calculateBettingOrder, getAccusationCost } from "../utils/game-logic.js";
import { TIMING, emptyTableData, GOBLIN_STAGE_DICE } from "../constants.js";
import { processSideBetPayouts } from "./side-bets.js";
import { delay, fireAndForget, withWarning } from "../utils/runtime.js";
import { localizeOrFallback } from "../utils/i18n.js";

const t = (key, fallback, data = {}) => localizeOrFallback(key, fallback, data);

export async function startRound(startingHeat = 10) {
  const state = getState();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const configuredMode = game.settings.get(MODULE_ID, "gameMode");

  if (!state.turnOrder.length) {
    ui.notifications.warn(t("TAVERN.Notifications.NoPlayersAtTable", "No players at the table."));
    return state;
  }

  const affordability = canAffordAnte(state, ante);
  if (!affordability.ok) {
    ui.notifications.warn(
      t("TAVERN.Notifications.CannotAffordAnte", "{name} cannot afford the {ante}gp ante.", {
        name: affordability.name,
        ante
      })
    );
    return state;
  }

  await deductAnteFromActors(state, ante);


  const tableData = emptyTableData();
  const gameMode = state.tableData?.gameMode ?? configuredMode ?? "standard";
  tableData.gameMode = gameMode;
  tableData.usedDice = {};
  for (const pid of state.turnOrder) {
    tableData.playerHeat[pid] = startingHeat;
  }

  // Calculate pot: each player antes
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

  if (gameMode === "goblin") {
    tableData.phase = "betting";
    tableData.bettingOrder = [...state.turnOrder];
    tableData.currentPlayer = tableData.bettingOrder[0] ?? null;
    tableData.sideBetRound = 1;
    tableData.sideBetRoundStart = tableData.currentPlayer;
    tableData.theCutPlayer = null;
    tableData.theCutUsed = false;
    tableData.goblinStageIndex = 0;
    tableData.goblinStageDie = GOBLIN_STAGE_DICE[0] ?? 20;
    tableData.goblinStageRemaining = [...tableData.bettingOrder];
    tableData.goblinSuddenDeathActive = false;
    tableData.goblinSuddenDeathParticipants = [];
    tableData.goblinSuddenDeathRemaining = [];
    tableData.goblinBoots = {};
    tableData.goblinHoldStage = {};

    const next = await updateState({
      status: "PLAYING",
      pot,
      tableData,
      turnIndex: 0,
    });

    const playerNames = state.turnOrder.map(id => getActorName(id)).join(", ");
    await addHistoryEntry({
      type: "round_start",
      message: `New Goblin round started. Ante: ${ante}gp each. Pot: ${pot}gp.`,
      players: playerNames,
    });

    await addLogToAll({
      title: "Goblin Rules",
      message: `New round started (Goblin Rules).<br>
        <em>The Chamber shrinks: d20 → d12 → d10 → d8 → d6 → d4 → Coin.<br>
        Roll a 1 and you die. Max roll earns a Boot. Highest survivor wins.</em>`,
      icon: "fa-solid fa-dice",
      type: "phase"
    });

    return next;
  }
  let lowestVisible = Infinity;
  let cutPlayerId = null;

  // Execute rolls in parallel for speed
  const rollPromises = state.turnOrder.map(async (userId) => {
    const roll1 = await new Roll("1d10").evaluate();
    const roll2 = await new Roll("1d10").evaluate();

    // Show dice to player immediately (visible die public, hole die private)
    fireAndForget("Could not show opening die", tavernSocket.executeAsUser("showRoll", userId, {
      formula: "1d10",
      die: 10,
      result: roll1.total
    }));

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
  tableData.bettingOrder = calculateBettingOrder(state, tableData);
  tableData.theCutPlayer = cutPlayerId;
  tableData.theCutUsed = false;
  if (cutPlayerId && state.turnOrder.length > 1) {
    tableData.phase = "cut";
    tableData.currentPlayer = cutPlayerId;
  } else {
    tableData.phase = "betting";
    tableData.currentPlayer = tableData.bettingOrder.find(id => !tableData.busts[id]) ?? null;
    tableData.sideBetRound = 1;
    tableData.sideBetRoundStart = tableData.currentPlayer;
  }

  const next = await updateState({
    status: "PLAYING",
    pot,
    tableData,
    turnIndex: 0,
  });

  const playerNames = state.turnOrder.map(id => getActorName(id)).join(", ");
  await addHistoryEntry({
    type: "round_start",
    message: `New round started. Ante: ${ante}gp each. Pot: ${pot}gp.`,
    players: playerNames,
  });
  const safeCutPlayerName = cutPlayerId ? getSafeActorName(cutPlayerId) : null;
  const openingLine = gmIsPlayingAsNpc
    ? `Each player antes ${ante}gp. Pot: <strong>${pot}gp</strong><br>`
    : `Each player antes ${ante}gp. The house matches. Pot: <strong>${pot}gp</strong><br>`;
  let chatMessage = `${openingLine}<em>All hands dealt (2d10 each: 1 visible, 1 hole)</em>`;

  if (cutPlayerId && state.turnOrder.length > 1) {
    chatMessage += `<br><strong>${safeCutPlayerName}</strong> has The Cut (lowest visible: ${lowestVisible})`;
  }
  await addLogToAll({
    title: "New Round!",
    message: chatMessage,
    icon: "fa-solid fa-coins",
    type: "phase"
  }, [], cutPlayerId);

  return next;
}

export async function revealDice() {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();
  const gameMode = tableData.gameMode ?? state.tableData?.gameMode ?? "standard";

  if (gameMode === "goblin") {
    return finishRound();
  }

  // Mark as revealing
  await updateState({ status: "REVEALING" });


  // Show all rolls publicly - launch all dice animations in parallel for speed
  const rollPromises = [];
  for (const userId of state.turnOrder) {
    const playerRolls = tableData.rolls[userId] ?? [];
    for (const rollData of playerRolls) {
      rollPromises.push((async () => {
        const roll = await new Roll(`1d${rollData.die}`).evaluate();
        // Override the result to show the actual value
        if (roll.terms?.[0]?.results?.[0]) {
          roll.terms[0].results[0].result = rollData.result;
          roll._total = rollData.result;
        }
        await showPublicRoll(roll, userId);
      })());
    }
  }

  await Promise.all(rollPromises);
  await delay(TIMING.POST_REVEAL_DELAY);
  fireAndForget("Could not show staredown cut-in", tavernSocket.executeForEveryone("showSkillCutIn", "STAREDOWN", null, null));
  await delay(TIMING.STAREDOWN_DELAY);

  // Now transition to The Staredown
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const accusationCost = getAccusationCost(ante);

  await addLogToAll({
    title: "The Staredown",
    message: `All dice revealed... but can you trust them?<br>
      <strong>Make an Accusation?</strong> (Cost: <strong>${accusationCost}gp</strong>)<br>
      <em>Make a false accusation and forfeit your winnings.</em>`,
    icon: "fa-solid fa-eye",
    type: "phase"
  });

  return updateState({ status: "INSPECTION" });
}

export async function finishRound() {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();

  await updateState({ status: "REVEALING" });
  const caught = { ...tableData.caught };
  const fumbledCheaterNames = [];
  const fumbledCheaterNamesSafe = [];
  for (const [cheaterId, cheaterData] of Object.entries(tableData.cheaters)) {
    if (caught[cheaterId]) continue; // Already caught
    const cheats = cheaterData.cheats ?? cheaterData.deceptionRolls ?? [];
    for (const cheatRecord of cheats) {
      if (cheatRecord.fumbled) {
        caught[cheaterId] = true;
        const cheaterName = getActorName(cheaterId);
        const safeCheaterName = getSafeActorName(cheaterId);
        fumbledCheaterNames.push(cheaterName);
        fumbledCheaterNamesSafe.push(safeCheaterName);
        break;
      }
    }
  }

  if (fumbledCheaterNames.length > 0) {
    await addLogToAll({
      title: "Fumbled!",
      message: `<strong>${fumbledCheaterNamesSafe.join(", ")}</strong> fumbled their cheat and got caught red-handed!`,
      icon: "fa-solid fa-hand-fist",
      type: "cheat",
      cssClass: "failure"
    });
  }

  const totals = tableData.totals ?? {};
  const gameMode = tableData.gameMode ?? state.tableData?.gameMode ?? "standard";
  const isGoblinMode = gameMode === "goblin";
  let best = isGoblinMode ? -Infinity : 0;
  state.turnOrder.forEach((id) => {
    if (caught[id]) return;
    if (tableData.busts?.[id]) return;
    if (tableData.folded?.[id]) return;
    const total = totals[id] ?? 0;
    if (isGoblinMode) {
      if (total > best) best = total;
    } else if (total <= 21 && total > best) {
      best = total;
    }
  });

  const winners = state.turnOrder.filter((id) => {
    if (caught[id]) return false;
    if (tableData.folded?.[id]) return false;
    if (tableData.busts?.[id]) return false;
    if (isGoblinMode) {
      return best !== -Infinity && (totals[id] ?? 0) === best;
    }
    return (totals[id] ?? 0) === best && best > 0;
  });

  if (winners.length > 1) {
    if (isGoblinMode) {
      const participants = [...winners];
      const updatedHolds = { ...tableData.holds };
      for (const id of state.turnOrder) {
        if (!participants.includes(id)) updatedHolds[id] = true;
        else delete updatedHolds[id];
      }

      await addLogToAll({
        title: "SUDDEN DEATH",
        message: `<strong>${participants.map(id => getSafeActorName(id)).join(" vs ")}</strong> are tied!<br><em>The coin decides.</em>`,
        icon: "fa-solid fa-bolt",
        type: "phase"
      });

      fireAndForget(
        "Could not show sudden death cut-in",
        tavernSocket.executeForEveryone("showSkillCutIn", "SUDDEN_DEATH", participants[0], participants[1])
      );

      return updateState({
        status: "PLAYING",
        tableData: {
          ...tableData,
          holds: updatedHolds,
          goblinSuddenDeathActive: true,
          goblinSuddenDeathParticipants: participants,
          goblinSuddenDeathRemaining: participants,
          goblinStageRemaining: participants,
          goblinStageDie: 2,
          currentPlayer: participants[0] ?? null
        }
      });
    }

    const duelParticipantNames = winners.map(id => getActorName(id)).join(" vs ");
    const duelParticipantNamesSafe = winners.map(id => getSafeActorName(id)).join(" vs ");

    await addLogToAll({
      title: "The Duel!",
      message: `<strong>${duelParticipantNamesSafe}</strong> are TIED!<br>
        <em>One final clash to settle the pot!</em><br>
        <span style="font-size: 0.9em; opacity: 0.8;">Roll 1d20 + 1d4 per Hit taken.</span>`,
      icon: "fa-solid fa-swords",
      type: "phase"
    });
    const [p1, p2] = winners; // Guaranteed to have at least 2
    fireAndForget("Could not show duel cut-in", tavernSocket.executeForEveryone("showSkillCutIn", "DUEL", p1, p2));
    await delay(TIMING.SKILL_DRAMATIC_PAUSE);

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
  const cleaningFees = tableData.cleaningFees ?? {};
  const cleaningFeeMessages = [];
  let totalCleaningFees = 0;
  for (const [userId, fee] of Object.entries(cleaningFees)) {
    if (fee > 0) {
      await deductFromActor(userId, fee);
      totalCleaningFees += fee;
      const safeUserName = getSafeActorName(userId);
      cleaningFeeMessages.push(`${safeUserName}: ${fee}gp`);
    }
  }

  // Add cleaning fees to pot before winner takes it
  const finalPot = state.pot + totalCleaningFees;

  if (cleaningFeeMessages.length > 0) {
    await addLogToAll({
      title: "Cleaning Fees",
      message: `Use a coaster next time!<br>${cleaningFeeMessages.join("<br>")}`,
      icon: "fa-solid fa-broom",
      type: "system"
    });
  }

  if (winners.length === 1) {
    let payout = finalPot;
    if (isGoblinMode) {
      const holdStage = tableData.goblinHoldStage?.[winners[0]];
      if (holdStage && holdStage > 8) {
        payout = Math.floor(finalPot * 0.5);
        await addLogToAll({
          title: "Coward's Tax",
          message: `${getSafeActorName(winners[0])} held early and only claims <strong>${payout}gp</strong>. The House keeps the rest.`,
          icon: "fa-solid fa-land-mine-on",
          type: "system"
        });
      }
    }

    const payouts = { [winners[0]]: payout };
    if (payout > 0) await payOutWinners(payouts);
    const victoryPot = isGoblinMode ? payout : finalPot;
    await withWarning("Could not show victory fanfare", () => tavernSocket.executeForEveryone("showVictoryFanfare", winners[0], victoryPot));
    const sideBetWinnerIds = await processSideBetPayouts(winners[0]);
    const sideBetWinners = {};
    for (const id of sideBetWinnerIds) sideBetWinners[id] = true;
    tableData.sideBetWinners = sideBetWinners;
  } else if (winners.length === 0) {
    if (isGoblinMode) {
      await addLogToAll({
        title: "Total Wipeout",
        message: "Everyone died. The House keeps the pot.",
        icon: "fa-solid fa-skull",
        type: "system"
      });
    }
    tableData.sideBetWinners = {};
    await processSideBetPayouts(null);
  }

  return updateState({
    status: "PAYOUT",
    pot: 0,
    tableData: { ...tableData, caught },
  });
}

export async function returnToLobby() {
  const state = getState();
  const configuredMode = game.settings.get(MODULE_ID, "gameMode");
  const gameMode = state.tableData?.gameMode ?? configuredMode ?? "standard";
  return updateState({
    status: "LOBBY",
    pot: 0,
    tableData: { ...emptyTableData(), gameMode },
  });
}

