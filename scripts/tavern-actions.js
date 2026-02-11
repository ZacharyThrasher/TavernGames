import { getState, updateState, markLogsAsSeen } from "./state.js";
import { startRound, submitRoll, hold, revealDice, finishRound, returnToLobby, cheat, accuse, skipInspection, goad, bumpTable, bumpRetaliation, hunch, profile, useCut, fold, submitDuelRoll, finishTurn, bootGoblin, continueGoblinTurn } from "./twenty-one/index.js";
import { MODULE_ID, emptyTableData, getAllowedDice } from "./twenty-one/constants.js";
import { placeSideBet } from "./twenty-one/phases/side-bets.js";
import { setNpcWallet, getNpcCashOutSummary } from "./wallet.js";
import { notifyUser } from "./twenty-one/utils/game-logic.js";

function ensureGM() {
  if (!game.user.isGM) {
    throw new Error("GM required for this action.");
  }
}

function normalizePayload(payload) {
  return payload && typeof payload === "object" ? payload : {};
}

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function toBool(value) {
  return value === true || value === "true";
}

function toId(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function sanitizeActionPayload(action, payload, state) {
  const data = normalizePayload(payload);
  const gameMode = state?.tableData?.gameMode ?? "standard";
  const allowedDice = new Set(getAllowedDice(gameMode));

  switch (action) {
    case "roll": {
      const die = toInt(data.die);
      if (!die || !allowedDice.has(die)) return { ok: false, error: "Invalid die selection." };
      return { ok: true, payload: { die, payWithDrink: toBool(data.payWithDrink) } };
    }
    case "useCut":
      return { ok: true, payload: { reroll: toBool(data.reroll) } };
    case "profile":
    case "boot":
      return { ok: true, payload: { targetId: toId(data.targetId) } };
    case "goad": {
      const attackerSkill = typeof data.attackerSkill === "string" ? data.attackerSkill : "itm";
      return {
        ok: true,
        payload: { targetId: toId(data.targetId), attackerSkill }
      };
    }
    case "bumpTable":
      return {
        ok: true,
        payload: { targetId: toId(data.targetId), dieIndex: toInt(data.dieIndex) }
      };
    case "bumpRetaliation":
      return {
        ok: true,
        payload: { dieIndex: toInt(data.dieIndex) }
      };
    case "accuse":
      return {
        ok: true,
        payload: { targetId: toId(data.targetId), dieIndex: toInt(data.dieIndex) }
      };
    case "sideBet": {
      const amount = toInt(data.amount);
      return {
        ok: true,
        payload: {
          championId: toId(data.championId),
          amount: amount && amount > 0 ? amount : null
        }
      };
    }
    case "cheat": {
      const adjustment = toInt(data.adjustment);
      return {
        ok: true,
        payload: {
          dieIndex: toInt(data.dieIndex),
          adjustment: adjustment ?? 1,
          cheatType: typeof data.cheatType === "string" ? data.cheatType : undefined,
          skill: typeof data.skill === "string" ? data.skill : undefined
        }
      };
    }
    case "hunch":
    case "hold":
    case "fold":
    case "duelRoll":
    case "skipInspection":
    case "reveal":
    case "newRound":
    case "finishTurn":
    case "goblinContinue":
      return { ok: true, payload: {} };
    default:
      return { ok: true, payload: data };
  }
}

function payloadHasRequiredFields(action, payload) {
  switch (action) {
    case "profile":
    case "boot":
      return Boolean(payload.targetId);
    case "goad":
      return Boolean(payload.targetId);
    case "bumpTable":
      return Boolean(payload.targetId) && Number.isInteger(payload.dieIndex);
    case "bumpRetaliation":
      return Number.isInteger(payload.dieIndex);
    case "accuse":
      return Boolean(payload.targetId) && Number.isInteger(payload.dieIndex);
    case "sideBet":
      return Boolean(payload.championId) && Number.isInteger(payload.amount);
    case "cheat":
      return Number.isInteger(payload.dieIndex) && Number.isInteger(payload.adjustment);
    default:
      return true;
  }
}

export async function handleJoinTable(userId, options = {}) {
  ensureGM();
  const user = game.users.get(userId);
  if (!user) return getState();

  const state = getState();
  if (state.status !== "LOBBY") {
    await notifyUser(userId, "Cannot join while a round is in progress.");
    return state;
  }
  if (state.players[userId]) return state;
  const isGMUser = user.isGM;
  const playingAsNpc = isGMUser && options.playingAsNpc;

  let avatar, characterName, npcActorId, initialWallet;

  if (playingAsNpc) {
    // GM is playing as selected NPC
    npcActorId = options.npcActorId;
    const npcActor = game.actors.get(npcActorId);
    avatar = npcActor?.img || options.npcImg || "icons/svg/mystery-man.svg";
    characterName = npcActor?.name || options.npcName || "NPC";
    initialWallet = options.initialWallet ?? (game.settings.get(MODULE_ID, "fixedAnte") * 20);
    await setNpcWallet(userId, initialWallet);
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
    playingAsNpc: playingAsNpc || false,
    npcActorId: npcActorId || null,
    initialWallet: playingAsNpc ? initialWallet : null,
  };

  const turnOrder = [...state.turnOrder, userId];

  return updateState({ players, turnOrder });
}

export async function handleLeaveTable(userId) {
  ensureGM();
  const state = getState();
  if (state.status !== "LOBBY" && state.status !== "PAYOUT") {
    await notifyUser(userId, "Cannot leave while a round is in progress.");
    return state;
  }

  const player = state.players[userId];
  if (!player) return state;
  if (player.playingAsNpc) {
    const summary = getNpcCashOutSummary(userId);
    if (summary) {
      const content = await foundry.applications.handlebars.renderTemplate(
        `modules/${MODULE_ID}/templates/chat/npc-cashout.hbs`,
        {
          name: summary.name,
          initial: summary.initial,
          current: summary.current,
          netChangeDisplay: summary.netChangeDisplay,
          netClass: summary.netChange >= 0 ? "positive" : "negative"
        }
      );

      await ChatMessage.create({
        content,
        whisper: ChatMessage.getWhisperRecipients("GM"),
        speaker: { alias: "Tavern Twenty-One" }
      });
    }
  }

  const players = { ...state.players };
  delete players[userId];
  const turnOrder = state.turnOrder.filter((id) => id !== userId);
  const turnIndex = Math.min(state.turnIndex, Math.max(0, turnOrder.length - 1));

  return updateState({ players, turnOrder, turnIndex });
}

export async function handleStartRound(startingHeat) {
  ensureGM();
  return startRound(startingHeat);
}

export async function handlePlayerAction(action, payload, userId) {
  ensureGM();
  const state = getState();
  const sanitized = sanitizeActionPayload(action, payload, state);
  if (!sanitized.ok) {
    await notifyUser(userId, sanitized.error ?? "Invalid action payload.");
    return state;
  }
  if (!payloadHasRequiredFields(action, sanitized.payload)) {
    await notifyUser(userId, "Invalid action payload.");
    return state;
  }
  const safePayload = sanitized.payload;

  switch (action) {
    case "roll":
      return submitRoll(safePayload, userId);
    case "hold":
      return hold(userId);
    case "boot": {
      const tableData = state.tableData ?? emptyTableData();
      return bootGoblin({ state, tableData, userId, targetId: safePayload.targetId });
    }
    case "goblinContinue": {
      const tableData = state.tableData ?? emptyTableData();
      return continueGoblinTurn({ state, tableData, userId });
    }
    case "fold":
      return fold(userId);
    case "useCut":
      return useCut(userId, safePayload.reroll);

    case "hunch":
      return hunch(userId);
    case "profile":
      return profile(safePayload, userId);
    // Skills
    case "cheat":
      await cheat(safePayload, userId);
      return finishTurn(userId);
    case "accuse":
      return accuse(safePayload, userId);
    case "goad":
      return goad(safePayload, userId);
    case "bumpTable":
      return bumpTable(safePayload, userId);
    case "bumpRetaliation":
      return bumpRetaliation(safePayload, userId);
    case "sideBet":
      return placeSideBet(safePayload, userId);
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

  const configuredMode = game.settings.get(MODULE_ID, "gameMode");
  const state = getState();
  const gameMode = state.tableData?.gameMode ?? configuredMode ?? "standard";

  return updateState({
    status: "LOBBY",
    pot: 0,
    turnOrder: [],
    players: {},
    tableData: { ...emptyTableData(), gameMode },
    history: [],
  });
}

export async function handleMarkLogsAsSeen(userId) {
  ensureGM();
  return markLogsAsSeen(userId);
}

