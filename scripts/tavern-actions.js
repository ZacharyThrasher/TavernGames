import { MODULE_ID, TAVERN_GAMES, getState, updateState, getStateMacro } from "./state.js";
import { tavernSocket } from "./socket.js";
import { resolveTwentyOne, startTwentyOneRound, submitTwentyOneRoll, holdTwentyOne } from "./twenty-one.js";
import { startLiarsDiceRound, submitLiarsBid, callLiarsDice } from "./liars-dice.js";

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
  if (state.players[userId]) return state;

  const players = { ...state.players };
  players[userId] = {
    id: userId,
    name: user.name,
    gold: 0,
    currentBet: 0,
    hasFolded: false,
    hand: [],
  };

  const turnOrder = [...state.turnOrder, userId];
  return updateState({ players, turnOrder });
}

export async function handleLeaveTable(userId) {
  ensureGM();
  const state = getState();
  if (!state.players[userId]) return state;

  const players = { ...state.players };
  delete players[userId];
  const turnOrder = state.turnOrder.filter((id) => id !== userId);
  const turnIndex = Math.min(state.turnIndex, Math.max(0, turnOrder.length - 1));

  return updateState({ players, turnOrder, turnIndex });
}

export async function handleSetGame(gameId) {
  ensureGM();
  const state = getState();
  if (state.status !== "LOBBY") {
    ui.notifications.warn("Cannot switch games while a round is active.");
    return state;
  }
  return updateState({ activeGame: gameId });
}

export async function handleStartRound() {
  ensureGM();
  const state = getState();
  if (!state.turnOrder.length) {
    ui.notifications.warn("No players at the table.");
    return state;
  }

  if (state.activeGame === TAVERN_GAMES.TWENTY_ONE) {
    return startTwentyOneRound();
  }
  return startLiarsDiceRound();
}

export async function handlePlayerAction(action, payload, userId) {
  ensureGM();
  const state = getState();

  if (state.activeGame === TAVERN_GAMES.TWENTY_ONE) {
    if (action === "roll") {
      return submitTwentyOneRoll(payload, userId);
    }
    if (action === "hold") {
      return holdTwentyOne(userId);
    }
    if (action === "resolve") {
      return resolveTwentyOne();
    }
  }

  if (state.activeGame === TAVERN_GAMES.LIARS_DICE) {
    if (action === "bid") {
      return submitLiarsBid(payload, userId);
    }
    if (action === "call") {
      return callLiarsDice(userId);
    }
  }

  return state;
}

export async function broadcastSound(src) {
  return tavernSocket.executeForEveryone("playSound", src);
}

export async function playSound(src) {
  AudioHelper.play({ src, volume: 0.8, autoplay: true, loop: false }, true);
}

Hooks.on("ready", () => {
  if (!tavernSocket) return;
  tavernSocket.register("playSound", playSound);
});

export async function updateMacroState(next) {
  const macro = getStateMacro();
  if (!macro) return;
  await macro.setFlag(MODULE_ID, "state", next);
}
