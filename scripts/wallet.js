import { getState, updateState } from "./state.js";
import { MODULE_ID } from "./twenty-one/constants.js";
import { tavernSocket } from "./socket.js";
import { getActorForUser } from "./twenty-one/utils/actors.js";

function isNpcPlayer(userId, stateOverride = null) {
  const state = stateOverride ?? getState();
  const playerData = state?.players?.[userId];
  return playerData?.playingAsNpc ?? false;
}

async function showFloatingGold(userId, amount) {
  try {
    await tavernSocket.executeForEveryone("showFloatingText", userId, amount);
  } catch (error) {
    console.debug("Tavern Twenty-One | Failed to show floating gold text:", error);
  }
}

export function getNpcWallet(userId) {
  const state = getState();
  return state.npcWallets?.[userId] ?? 0;
}

export async function setNpcWallet(userId, amount) {
  const state = getState();
  const npcWallets = { ...state.npcWallets, [userId]: amount };
  await updateState({ npcWallets });
}

export async function updateNpcWallet(userId, delta) {
  const current = getNpcWallet(userId);
  const newAmount = Math.max(0, current + delta);
  await setNpcWallet(userId, newAmount);
  return newAmount;
}

export function getPlayerGold(userId) {
  const state = getState();
  if (isNpcPlayer(userId, state)) {
    return getNpcWallet(userId);
  }
  const actor = getActorForUser(userId);
  return actor?.system?.currency?.gp ?? 0;
}

export function canAffordAnte(state, ante) {
  for (const userId of state.turnOrder) {
    const user = game.users.get(userId);
    const playerData = state.players?.[userId];
    const isHouse = user?.isGM && !playerData?.playingAsNpc;
    if (isHouse) continue;
    if (isNpcPlayer(userId, state)) {
      const wallet = getNpcWallet(userId);
      if (wallet < ante) {
        const actor = getActorForUser(userId);
        return { ok: false, name: actor?.name ?? "NPC", reason: `has ${wallet}gp in their table wallet` };
      }
    } else {
      const actor = getActorForUser(userId);
      if (!actor) {
        return { ok: false, name: user?.name ?? "Unknown", reason: "no character" };
      }
      const gp = actor.system?.currency?.gp ?? 0;
      if (gp < ante) {
        return { ok: false, name: actor.name, reason: "insufficient gold" };
      }
    }
  }
  return { ok: true };
}

export async function deductAnteFromActors(state, ante) {
  for (const userId of state.turnOrder) {
    const user = game.users.get(userId);
    const playerData = state.players?.[userId];
    const isHouse = user?.isGM && !playerData?.playingAsNpc;
    if (isHouse) continue;
    if (isNpcPlayer(userId, state)) {
      await updateNpcWallet(userId, -ante);
      await showFloatingGold(userId, -ante);
    } else {
      const actor = getActorForUser(userId);
      if (!actor) continue;
      const current = actor.system?.currency?.gp ?? 0;
      await actor.update({ "system.currency.gp": current - ante });
      await showFloatingGold(userId, -ante);
    }
  }
}

/**
 * Pay out winnings to winners.
 * @param {Object} payouts - Map of { userId: amount } for variable payouts
 *                          OR array of winner userIds with flat share amount as second param (legacy support)
 * @param {number} [flatShare] - If payouts is an array, this is the flat amount each winner receives
 */
export async function payOutWinners(payouts, flatShare) {
  // Legacy support: if payouts is an array, convert to map with flat share
  if (Array.isArray(payouts)) {
    const payoutMap = {};
    for (const userId of payouts) {
      payoutMap[userId] = flatShare;
    }
    payouts = payoutMap;
  }

  const state = getState();

  for (const [userId, amount] of Object.entries(payouts)) {
    const payoutAmount = Number(amount);
    if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) continue;

    const user = game.users.get(userId);
    const isHouse = user?.isGM && !state?.players?.[userId]?.playingAsNpc;
    if (isHouse) continue;
    if (isNpcPlayer(userId, state)) {
      await updateNpcWallet(userId, payoutAmount);
      await showFloatingGold(userId, payoutAmount);
    } else {
      const actor = getActorForUser(userId);
      if (!actor) continue;
      const current = actor.system?.currency?.gp ?? 0;
      await actor.update({ "system.currency.gp": current + payoutAmount });
      await showFloatingGold(userId, payoutAmount);
    }
  }
}

/**
 * Deduct gold from a single player's actor.
 * Returns true if successful, false if they can't afford it.
 */
export async function deductFromActor(userId, amount, stateOverride = null) {
  const amountValue = Number(amount);
  if (!Number.isFinite(amountValue) || amountValue <= 0) return true;
  const state = stateOverride ?? getState();
  const user = game.users.get(userId);
  const playerData = state?.players?.[userId];
  const isHouse = user?.isGM && !playerData?.playingAsNpc;
  if (isHouse) return true;
  if (isNpcPlayer(userId, state)) {
    const wallet = getNpcWallet(userId);
    if (wallet < amountValue) return false;
    await updateNpcWallet(userId, -amountValue);
    await showFloatingGold(userId, -amountValue);

    return true;
  }

  const actor = getActorForUser(userId);
  if (!actor) return false;

  const current = actor.system?.currency?.gp ?? 0;
  if (current < amountValue) return false;

  await actor.update({ "system.currency.gp": current - amountValue });
  await showFloatingGold(userId, -amountValue);

  return true;
}

export function getNpcCashOutSummary(userId) {
  const state = getState();
  const playerData = state?.players?.[userId];

  if (!isNpcPlayer(userId, state)) return null;

  const currentWallet = getNpcWallet(userId);
  const initialWallet = playerData?.initialWallet ?? 0;
  const netChange = currentWallet - initialWallet;

  return {
    name: playerData?.npcName ?? "NPC",
    initial: initialWallet,
    current: currentWallet,
    netChange,
    netChangeDisplay: netChange >= 0 ? `+${netChange}` : `${netChange}`,
  };
}



