import { MODULE_ID, getState, updateState } from "./state.js";
import { canAffordAnte, deductAnteFromActors, payOutWinners } from "./wallet.js";
import { createChatCard } from "./ui/chat.js";
import { showSecretRoll } from "./dice.js";

const INITIAL_DICE = [20, 12, 10, 8, 6, 4];

function emptyTwentyOneData() {
  return {
    totals: {},
    holds: {},
    busts: {},
    rolls: {},
    currentPlayer: null,
    phase: "INITIAL",
  };
}

function nextPlayer(state, tableData) {
  const order = state.turnOrder;
  if (!order.length) return null;

  const currentIndex = tableData.currentPlayer
    ? order.indexOf(tableData.currentPlayer)
    : -1;
  const nextIndex = (currentIndex + 1) % order.length;
  return order[nextIndex];
}

function allPlayersFinished(state, tableData) {
  return state.turnOrder.every((id) => tableData.holds[id] || tableData.busts[id]);
}

export async function startTwentyOneRound() {
  const state = getState();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");

  const affordability = canAffordAnte(state, ante);
  if (!affordability.ok) {
    ui.notifications.warn(`${affordability.name} cannot afford the ante.`);
    return state;
  }

  await deductAnteFromActors(state, ante);

  const tableData = emptyTwentyOneData();
  const pot = ante * state.turnOrder.length * 2;

  const totals = {};
  const rolls = {};
  state.turnOrder.forEach((id) => {
    totals[id] = 0;
    rolls[id] = [];
  });

  tableData.totals = totals;
  tableData.rolls = rolls;
  tableData.currentPlayer = state.turnOrder[0];
  tableData.phase = "INITIAL";

  const next = await updateState({
    status: "PLAYING",
    pot,
    tableData,
    turnIndex: 0,
  });

  await createChatCard({
    title: "Twenty-One begins",
    message: `Each player antes ${ante}gp. The house matches each ante.`,
  });

  return next;
}

export async function submitTwentyOneRoll(payload, userId) {
  const state = getState();
  const tableData = state.tableData ?? emptyTwentyOneData();
  const current = tableData.currentPlayer;

  if (current !== userId) {
    ui.notifications.warn("Not your turn.");
    return state;
  }

  const die = Number(payload?.die);
  if (!INITIAL_DICE.includes(die)) {
    ui.notifications.warn("Invalid die selection.");
    return state;
  }

  const roll = await new Roll(`1d${die}`).evaluate();
  const total = roll.total ?? 0;

  await showSecretRoll(roll, userId);

  const rolls = { ...tableData.rolls };
  const totals = { ...tableData.totals };

  rolls[userId] = [...(rolls[userId] ?? []), { die, result: total }];
  totals[userId] = (totals[userId] ?? 0) + total;

  const busts = { ...tableData.busts };
  if (totals[userId] > 21) {
    busts[userId] = true;
  }

  const holds = { ...tableData.holds };
  let phase = tableData.phase;
  if (phase === "INITIAL") {
    phase = "MAIN";
  }

  const updatedTable = {
    ...tableData,
    rolls,
    totals,
    busts,
    holds,
    phase,
  };

  const nextId = nextPlayer(state, updatedTable);
  updatedTable.currentPlayer = nextId;

  const next = await updateState({ tableData: updatedTable });

  if (allPlayersFinished(state, updatedTable)) {
    return resolveTwentyOne();
  }

  return next;
}

export async function holdTwentyOne(userId) {
  const state = getState();
  const tableData = state.tableData ?? emptyTwentyOneData();

  if (tableData.currentPlayer !== userId) {
    ui.notifications.warn("Not your turn.");
    return state;
  }

  const holds = { ...tableData.holds, [userId]: true };
  const updatedTable = { ...tableData, holds };
  updatedTable.currentPlayer = nextPlayer(state, updatedTable);

  const next = await updateState({ tableData: updatedTable });

  if (allPlayersFinished(state, updatedTable)) {
    return resolveTwentyOne();
  }

  return next;
}

export async function resolveTwentyOne() {
  const state = getState();
  const tableData = state.tableData ?? emptyTwentyOneData();
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
  }

  await createChatCard({
    title: "Twenty-One resolved",
    message: winners.length
      ? `Winning total: ${best}. Each winner receives ${potShare}gp.`
      : "No winners this round.",
  });

  return updateState({
    status: "PAYOUT",
    pot: 0,
    tableData: emptyTwentyOneData(),
    turnIndex: 0,
  });
}
