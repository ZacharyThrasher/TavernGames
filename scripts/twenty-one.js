import { MODULE_ID, getState, updateState, addHistoryEntry } from "./state.js";
import { canAffordAnte, deductAnteFromActors, payOutWinners } from "./wallet.js";
import { createChatCard } from "./ui/chat.js";
import { showPublicRoll } from "./dice.js";
import { playSound } from "./sounds.js";
import { tavernSocket } from "./socket.js";

const VALID_DICE = [20, 12, 10, 8, 6, 4];
const MIN_ROLLS_BEFORE_HOLD = 2;

function emptyTableData() {
  return {
    totals: {},
    holds: {},
    busts: {},
    rolls: {},
    currentPlayer: null,
    revealedTotals: {},
  };
}

function getNextActivePlayer(state, tableData) {
  const order = state.turnOrder;
  if (!order.length) return null;

  const currentIndex = tableData.currentPlayer
    ? order.indexOf(tableData.currentPlayer)
    : -1;

  // Find next player who hasn't held or busted
  for (let i = 1; i <= order.length; i++) {
    const nextIndex = (currentIndex + i) % order.length;
    const nextId = order[nextIndex];
    if (!tableData.holds[nextId] && !tableData.busts[nextId]) {
      return nextId;
    }
  }
  return null;
}

function allPlayersFinished(state, tableData) {
  return state.turnOrder.every((id) => tableData.holds[id] || tableData.busts[id]);
}

export async function startRound() {
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
  await playSound("coins");

  const tableData = emptyTableData();
  
  // Calculate pot: each non-GM player antes, house matches non-GM players only
  const nonGMPlayers = state.turnOrder.filter(id => !game.users.get(id)?.isGM);
  const playerAntes = nonGMPlayers.length * ante;
  const houseMatch = playerAntes; // House matches player antes only
  const pot = playerAntes + houseMatch;

  state.turnOrder.forEach((id) => {
    tableData.totals[id] = 0;
    tableData.rolls[id] = [];
  });

  tableData.currentPlayer = state.turnOrder[0];

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

  await createChatCard({
    title: "Twenty-One",
    subtitle: "A new round begins!",
    message: `Each player antes ${ante}gp. The house matches. Pot: <strong>${pot}gp</strong>`,
    icon: "fa-solid fa-coins",
  });

  return next;
}

export async function submitRoll(payload, userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    ui.notifications.warn("No active round.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();

  if (tableData.currentPlayer !== userId) {
    ui.notifications.warn("It's not your turn.");
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

  const roll = await new Roll(`1d${die}`).evaluate();
  const result = roll.total ?? 0;

  // Send the dice roll display to the player who rolled (via socket)
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

  rolls[userId] = [...(rolls[userId] ?? []), { die, result }];
  totals[userId] = (totals[userId] ?? 0) + result;

  const busts = { ...tableData.busts };
  const isBust = totals[userId] > 21;
  if (isBust) {
    busts[userId] = true;
  }

  const userName = game.users.get(userId)?.name ?? "Unknown";
  await addHistoryEntry({
    type: isBust ? "bust" : "roll",
    player: userName,
    die: `d${die}`,
    result,
    total: totals[userId],
    message: isBust
      ? `${userName} rolled d${die} and BUSTED with ${totals[userId]}!`
      : `${userName} rolled a d${die}...`,
  });

  const updatedTable = {
    ...tableData,
    rolls,
    totals,
    busts,
  };

  // Find next player
  updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);

  const next = await updateState({ tableData: updatedTable });

  if (allPlayersFinished(state, updatedTable)) {
    return revealResults();
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
    ui.notifications.warn("It's not your turn.");
    return state;
  }

  if (tableData.holds[userId] || tableData.busts[userId]) {
    ui.notifications.warn("You've already finished this round.");
    return state;
  }

  // Require minimum number of rolls before holding
  const rollCount = (tableData.rolls[userId] ?? []).length;
  if (rollCount < MIN_ROLLS_BEFORE_HOLD) {
    ui.notifications.warn(`You must roll at least ${MIN_ROLLS_BEFORE_HOLD} dice before holding.`);
    return state;
  }

  const holds = { ...tableData.holds, [userId]: true };
  const updatedTable = { ...tableData, holds };
  updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);

  const userName = game.users.get(userId)?.name ?? "Unknown";
  await addHistoryEntry({
    type: "hold",
    player: userName,
    total: tableData.totals[userId],
    message: `${userName} holds.`,
  });

  const next = await updateState({ tableData: updatedTable });

  if (allPlayersFinished(state, updatedTable)) {
    return revealResults();
  }

  return next;
}

export async function revealResults() {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();

  // Mark as revealing
  await updateState({ status: "REVEALING" });
  await playSound("reveal");

  // Show all rolls publicly
  for (const userId of state.turnOrder) {
    const playerRolls = tableData.rolls[userId] ?? [];
    for (const rollData of playerRolls) {
      const roll = await new Roll(`1d${rollData.die}`).evaluate();
      // Override the result to show the actual value
      if (roll.terms?.[0]?.results?.[0]) {
        roll.terms[0].results[0].result = rollData.result;
        roll._total = rollData.result;
      }
      await showPublicRoll(roll, userId);
      await new Promise(r => setTimeout(r, 800)); // Stagger reveals
    }
  }

  // Calculate winners
  const totals = tableData.totals ?? {};
  let best = 0;
  state.turnOrder.forEach((id) => {
    const total = totals[id] ?? 0;
    if (total <= 21 && total > best) best = total;
  });

  const winners = state.turnOrder.filter((id) => (totals[id] ?? 0) === best && best > 0);
  const potShare = winners.length ? Math.floor(state.pot / winners.length) : 0;

  if (winners.length) {
    await payOutWinners(winners, potShare);
    await playSound("win");
  } else {
    await playSound("lose");
  }

  const winnerNames = winners.map(id => game.users.get(id)?.name).join(", ");
  const resultsMsg = state.turnOrder.map(id => {
    const name = game.users.get(id)?.name ?? "Unknown";
    const total = totals[id] ?? 0;
    const busted = tableData.busts[id];
    return `${name}: ${total}${busted ? " (BUST)" : ""}${winners.includes(id) ? " ★" : ""}`;
  }).join(" | ");

  await addHistoryEntry({
    type: "round_end",
    winners: winnerNames || "None",
    winningTotal: best,
    payout: potShare,
    message: winners.length
      ? `${winnerNames} wins with ${best}! Payout: ${potShare}gp each.`
      : "Everyone busted! House wins.",
    results: resultsMsg,
  });

  await createChatCard({
    title: "Results Revealed!",
    subtitle: winners.length ? `Winner${winners.length > 1 ? "s" : ""}: ${winnerNames}` : "House Wins!",
    message: `<div class="tavern-results">${resultsMsg}</div>${winners.length ? `<div class="tavern-payout">Payout: <strong>${potShare}gp</strong> each</div>` : ""}`,
    icon: winners.length ? "fa-solid fa-trophy" : "fa-solid fa-skull",
  });

  return updateState({
    status: "PAYOUT",
  });
}

export async function returnToLobby() {
  return updateState({
    status: "LOBBY",
    pot: 0,
    tableData: emptyTableData(),
  });
}
