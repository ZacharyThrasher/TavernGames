import { getState, updateState } from "./state.js";
import { createChatCard } from "./ui/chat.js";
import { showPublicRoll, showSecretRoll } from "./dice.js";

function emptyLiarsData() {
  return {
    dice: {},
    currentBid: null,
    currentPlayer: null,
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

async function buildFixedRoll(values) {
  const roll = await new Roll(`${values.length}d6`).evaluate();
  const term = roll.terms?.[0];
  if (term?.results) {
    term.results.forEach((result, index) => {
      result.result = values[index] ?? result.result;
    });
  }
  roll._total = values.reduce((sum, value) => sum + value, 0);
  return roll;
}

export async function startLiarsDiceRound() {
  const state = getState();
  const tableData = emptyLiarsData();

  const dice = {};
  for (const id of state.turnOrder) {
    dice[id] = [];
    for (let i = 0; i < 5; i += 1) {
      const roll = await new Roll("1d6").evaluate();
      dice[id].push(roll.total ?? 0);
      await showSecretRoll(roll, id);
    }
  }

  tableData.dice = dice;
  tableData.currentBid = null;
  tableData.currentPlayer = state.turnOrder[0];

  const next = await updateState({
    status: "PLAYING",
    tableData,
    turnIndex: 0,
  });

  await createChatCard({
    title: "Liar's Dice begins",
    message: "Bids are open. Raise the quantity or face, or call Liar.",
  });

  return next;
}

export async function submitLiarsBid(payload, userId) {
  const state = getState();
  const tableData = state.tableData ?? emptyLiarsData();

  if (tableData.currentPlayer !== userId) {
    ui.notifications.warn("Not your turn.");
    return state;
  }

  const quantity = Number(payload?.quantity ?? 0);
  const face = Number(payload?.face ?? 0);

  if (!quantity || !face) {
    ui.notifications.warn("Invalid bid.");
    return state;
  }

  const current = tableData.currentBid;
  if (current) {
    const valid = quantity > current.quantity || (quantity === current.quantity && face > current.face);
    if (!valid) {
      ui.notifications.warn("Bid must raise quantity or face.");
      return state;
    }
  }

  const updated = {
    ...tableData,
    currentBid: { quantity, face, userId },
  };
  updated.currentPlayer = nextPlayer(state, updated);

  return updateState({ tableData: updated });
}

export async function callLiarsDice(userId) {
  const state = getState();
  const tableData = state.tableData ?? emptyLiarsData();
  const bid = tableData.currentBid;

  if (!bid) {
    ui.notifications.warn("No bid to challenge.");
    return state;
  }

  const dice = tableData.dice ?? {};
  let count = 0;
  Object.values(dice).forEach((hand) => {
    hand.forEach((value) => {
      if (value === bid.face || value === 1) count += 1;
    });
  });

  const bidderWins = count >= bid.quantity;
  const loser = bidderWins ? userId : bid.userId;

  for (const [id, hand] of Object.entries(dice)) {
    if (!hand.length) continue;
    const roll = await buildFixedRoll(hand);
    await showPublicRoll(roll, id);
  }

  await createChatCard({
    title: "Liar's Dice called",
    message: `${bidderWins ? "Bid stands" : "Bid fails"}. ${game.users.get(loser)?.name} loses a die.`,
  });

  const next = await updateState({
    status: "PAYOUT",
    tableData: emptyLiarsData(),
  });

  return next;
}
