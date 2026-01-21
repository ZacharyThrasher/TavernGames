import { MODULE_ID, getState, updateState } from "./state.js";
import { startRound, submitRoll, hold, revealDice, finishRound, returnToLobby, cheat, accuse, skipInspection, goad, resistGoad, bumpTable, bumpRetaliation, hunch, profile, useCut, fold, submitDuelRoll, finishTurn } from "./twenty-one/index.js";
import { placeSideBet } from "./twenty-one/phases/side-bets.js";
import { playSound } from "./sounds.js";

function ensureGM() {
  if (!game.user.isGM) {
    throw new Error("GM required for this action.");
  }
}

export async function handleJoinTable(userId, options = {}) {
  ensureGM();
  const user = game.users.get(userId);
  if (!user) return getState();

  const state = getState();
  if (state.status !== "LOBBY") {
    ui.notifications.warn("Cannot join while a round is in progress.");
    return state;
  }
  if (state.players[userId]) return state;

  // V3.5: Handle GM playing as NPC
  const isGMUser = user.isGM;
  const playingAsNpc = isGMUser && options.playingAsNpc;

  let avatar, characterName, npcActorId;

  if (playingAsNpc) {
    // GM is playing as selected NPC
    npcActorId = options.npcActorId;
    const npcActor = game.actors.get(npcActorId);
    avatar = npcActor?.img || options.npcImg || "icons/svg/mystery-man.svg";
    characterName = npcActor?.name || options.npcName || "NPC";
  } else {
    // Regular player or GM as house
    const actor = user.character;
    avatar = actor?.img || user.avatar || "icons/svg/mystery-man.svg";
    characterName = actor?.name || user.name;
  }

  const players = { ...state.players };
  players[userId] = {
    id: userId,
    name: characterName,
    userName: user.name,
    avatar,
    // V3.5: Track GM-as-NPC mode
    playingAsNpc: playingAsNpc || false,
    npcActorId: npcActorId || null,
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
    // V3: New actions
    case "fold":
      return fold(userId);
    case "useCut":
      return useCut(userId, payload?.reroll);
    case "resistGoad":
      return resistGoad(userId);
    case "hunch":
      return hunch(userId);
    case "profile":
      return profile(payload, userId);
    // Skills
    case "cheat":
      await cheat(payload, userId);
      return finishTurn(userId);
    case "accuse":
      return accuse(payload, userId);
    case "goad":
      return goad(payload, userId);
    case "bumpTable":
      return bumpTable(payload, userId);
    case "bumpRetaliation":
      return bumpRetaliation(payload, userId);
    // V4: Side bets
    case "sideBet":
      return placeSideBet(payload, userId);
    // Duel & phases
    case "duelRoll":
      return submitDuelRoll(userId);
    case "skipInspection":
      return skipInspection();
    case "reveal": {
      // During PLAYING, skip to staredown; otherwise finish round
      const currentState = getState();
      if (currentState.status === "PLAYING") {
        return revealDice();
      }
      return finishRound();
    }
    case "newRound":
      return returnToLobby();
    case "finishTurn":
      return finishTurn(userId);
    default:
      return getState();
  }
}

export async function handleResetTable() {
  ensureGM();

  return updateState({
    status: "LOBBY",
    pot: 0,
    turnOrder: [],
    players: {},
    tableData: {
      totals: {},
      visibleTotals: {},
      bettingOrder: null,
      holds: {},
      busts: {},
      rolls: {},
      currentPlayer: null,
      phase: "opening",
      cheaters: {},
      caught: {},
      accusation: null,
      disqualified: {},           // V3: Wrong accusation = disqualified
      goadedThisRound: {},
      goadBackfire: {},
      bumpedThisRound: {},
      pendingBumpRetaliation: null,
      cleaningFees: {},
      profiledBy: {},             // V3: Replaces scannedBy
      duel: null,
      drinkCount: {},
      sloppy: {},
      // V3: Heat mechanic
      heatDC: 10,
      cheatsThisRound: 0,
      // V3: Fold tracking
      folded: {},
      foldedEarly: {},
      hasActed: {},
      // V3: Hunch tracking
      hunchPrediction: {},
      hunchLocked: {},
      hunchLockedDie: {},
      hunchExact: {},
      // V3: Side bets
      sideBets: {},
      // V3: Hit tracking for Duel
      hitCount: {},
      // V3: The Cut
      theCutPlayer: null,
      theCutUsed: false,
    },
    history: [],
  });
}
