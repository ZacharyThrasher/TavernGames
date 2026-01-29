import { MODULE_ID, getState, updateState, markLogsAsSeen } from "./state.js";
import { startRound, submitRoll, hold, revealDice, finishRound, returnToLobby, cheat, accuse, skipInspection, goad, bumpTable, bumpRetaliation, hunch, profile, useCut, fold, submitDuelRoll, finishTurn, bootGoblin } from "./twenty-one/index.js";
import { emptyTableData } from "./twenty-one/constants.js";
import { placeSideBet } from "./twenty-one/phases/side-bets.js";
import { setNpcWallet, getNpcCashOutSummary } from "./wallet.js";
import { notifyUser } from "./twenty-one/utils/game-logic.js";
import { escapeHtmlString } from "./twenty-one/utils/actors.js";

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
    await notifyUser(userId, "Cannot join while a round is in progress.");
    return state;
  }
  if (state.players[userId]) return state;

  // V3.5: Handle GM playing as NPC
  const isGMUser = user.isGM;
  const playingAsNpc = isGMUser && options.playingAsNpc;

  let avatar, characterName, npcActorId, initialWallet;

  if (playingAsNpc) {
    // GM is playing as selected NPC
    npcActorId = options.npcActorId;
    const npcActor = game.actors.get(npcActorId);
    avatar = npcActor?.img || options.npcImg || "icons/svg/mystery-man.svg";
    characterName = npcActor?.name || options.npcName || "NPC";

    // V4: Set initial NPC wallet
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
    // V3.5: Track GM-as-NPC mode
    playingAsNpc: playingAsNpc || false,
    npcActorId: npcActorId || null,
    // V4: Track initial wallet for cash-out summary
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

  // V4: Generate cash out summary for NPCs
  if (player.playingAsNpc) {
    const summary = getNpcCashOutSummary(userId);
    if (summary) {
      const safeName = escapeHtmlString(summary.name);
      await ChatMessage.create({
        content: `
          <div class="tavern-npc-cashout">
            <h3><i class="fa-solid fa-cash-register"></i> NPC Cash Out</h3>
            <p><strong>${safeName}</strong> is leaving the table.</p>
            <hr>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span>Initial Stake:</span> <span>${summary.initial} gp</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span>Final Wallet:</span> <span>${summary.current} gp</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; color: ${summary.netChange >= 0 ? '#88ff88' : '#ff8888'};">
              <span>Net Change:</span> <span>${summary.netChangeDisplay} gp</span>
            </div>
            <p style="font-size: 0.85em; color: #888; margin-top: 8px; font-style: italic;">
              GM: Manually update the actor sheet if desired.
            </p>
          </div>
        `,
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

  switch (action) {
    case "roll":
      return submitRoll(payload, userId);
    case "hold":
      return hold(userId);
    case "boot": {
      const state = getState();
      const tableData = state.tableData ?? emptyTableData();
      return bootGoblin({ state, tableData, userId, targetId: payload?.targetId });
    }
    // V3: New actions
    case "fold":
      return fold(userId);
    case "useCut":
      return useCut(userId, payload?.reroll);

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
