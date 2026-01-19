import { MODULE_ID, getState, updateState } from "./state.js";
import { startRound, submitRoll, hold, revealResults, returnToLobby } from "./twenty-one.js";
import { playSound } from "./sounds.js";

function ensureGM() {
  if (!game.user.isGM) {
    throw new Error("GM required for this action.");
  }
}

export async function handleJoinTable(userId) {
  ensureGM();
  const user = game.users.get(userId);
  if (!user) return getState();

  const state = getState();
  if (state.status !== "LOBBY") {
    ui.notifications.warn("Cannot join while a round is in progress.");
    return state;
  }
  if (state.players[userId]) return state;

  // Get character info for avatar
  const actor = user.character;
  const avatar = actor?.img || user.avatar || "icons/svg/mystery-man.svg";
  const characterName = actor?.name || user.name;

  const players = { ...state.players };
  players[userId] = {
    id: userId,
    name: characterName,
    userName: user.name,
    avatar,
  };

  const turnOrder = [...state.turnOrder, userId];
  
  await playSound("join");
  
  return updateState({ players, turnOrder });
}

export async function handleLeaveTable(userId) {
  ensureGM();
  const state = getState();
  if (state.status !== "LOBBY" && state.status !== "PAYOUT") {
    ui.notifications.warn("Cannot leave while a round is in progress.");
    return state;
  }
  if (!state.players[userId]) return state;

  const players = { ...state.players };
  delete players[userId];
  const turnOrder = state.turnOrder.filter((id) => id !== userId);
  const turnIndex = Math.min(state.turnIndex, Math.max(0, turnOrder.length - 1));

  return updateState({ players, turnOrder, turnIndex });
}

export async function handleStartRound() {
  ensureGM();
  return startRound();
}

export async function handlePlayerAction(action, payload, userId) {
  ensureGM();

  switch (action) {
    case "roll":
      return submitRoll(payload, userId);
    case "hold":
      return hold(userId);
    case "reveal":
      return revealResults();
    case "newRound":
      return returnToLobby();
    default:
      return getState();
  }
}

export async function handleResetTable() {
  ensureGM();
  const state = getState();
  
  return updateState({
    status: "LOBBY",
    pot: 0,
    turnOrder: [],
    players: {},
    tableData: {
      totals: {},
      holds: {},
      busts: {},
      rolls: {},
      currentPlayer: null,
      revealedTotals: {},
    },
    history: [],
  });
}
