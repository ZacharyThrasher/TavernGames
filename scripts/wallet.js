import { MODULE_ID, getState, updateState } from "./state.js";

// V3.5: Updated to return NPC actor for GM-as-NPC
export function getActorForUser(userId) {
  const user = game.users.get(userId);
  if (!user) return null;

  // V3.5: Check if this is a GM playing as NPC
  const state = getState();
  const playerData = state?.players?.[userId];
  if (playerData?.playingAsNpc && playerData?.npcActorId) {
    return game.actors.get(playerData.npcActorId) ?? null;
  }

  // Regular behavior - use assigned character
  const actorId = user.character?.id;
  if (!actorId) return null;
  return game.actors.get(actorId) ?? null;
}

/**
 * V4: Check if a player is an NPC (GM playing as NPC)
 */
function isNpcPlayer(userId) {
  const state = getState();
  const playerData = state?.players?.[userId];
  return playerData?.playingAsNpc ?? false;
}

/**
 * V4: Get NPC wallet balance from module state
 */
export function getNpcWallet(userId) {
  const state = getState();
  return state.npcWallets?.[userId] ?? 0;
}

/**
 * V4: Set NPC wallet balance in module state
 */
export async function setNpcWallet(userId, amount) {
  const state = getState();
  const npcWallets = { ...state.npcWallets, [userId]: amount };
  await updateState({ npcWallets });
}

/**
 * V4: Update NPC wallet by delta (positive for add, negative for deduct)
 */
export async function updateNpcWallet(userId, delta) {
  const current = getNpcWallet(userId);
  const newAmount = Math.max(0, current + delta);
  await setNpcWallet(userId, newAmount);
  return newAmount;
}

/**
 * V4: Get gold balance for a player (uses NPC wallet for NPCs, actor sheet for PCs)
 */
export function getPlayerGold(userId) {
  if (isNpcPlayer(userId)) {
    return getNpcWallet(userId);
  }
  const actor = getActorForUser(userId);
  return actor?.system?.currency?.gp ?? 0;
}

export function canAffordAnte(state, ante) {
  for (const userId of state.turnOrder) {
    const user = game.users.get(userId);

    // V3.5: Only house doesn't pay - GM-as-NPC pays like regular players
    const playerData = state.players?.[userId];
    const isHouse = user?.isGM && !playerData?.playingAsNpc;
    if (isHouse) continue;

    // V4: NPCs use module wallet, PCs use actor sheet
    if (isNpcPlayer(userId)) {
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

    // V3.5: Only house doesn't pay - GM-as-NPC pays like regular players
    const playerData = state.players?.[userId];
    const isHouse = user?.isGM && !playerData?.playingAsNpc;
    if (isHouse) continue;

    // V4: NPCs use module wallet
    if (isNpcPlayer(userId)) {
      await updateNpcWallet(userId, -ante);
    } else {
      const actor = getActorForUser(userId);
      if (!actor) continue;
      const current = actor.system?.currency?.gp ?? 0;
      await actor.update({ "system.currency.gp": current - ante });
    }
  }
}

/**
 * Pay out winnings to winners.
 * @param {Object} payouts - Map of { oderId: amount } for variable payouts
 *                          OR array of winner userIds with flat share amount as second param (legacy support)
 * @param {number} [flatShare] - If payouts is an array, this is the flat amount each winner receives
 */
export async function payOutWinners(payouts, flatShare) {
  // Legacy support: if payouts is an array, convert to map with flat share
  if (Array.isArray(payouts)) {
    const payoutMap = {};
    for (const oderId of payouts) {
      payoutMap[oderId] = flatShare;
    }
    payouts = payoutMap;
  }

  const state = getState();

  for (const [oderId, amount] of Object.entries(payouts)) {
    const user = game.users.get(oderId);

    // V3.5: House doesn't receive gold payouts, but GM-as-NPC does
    const isHouse = user?.isGM && !state?.players?.[oderId]?.playingAsNpc;
    if (isHouse) continue;

    // V4: NPCs use module wallet
    if (isNpcPlayer(oderId)) {
      await updateNpcWallet(oderId, amount);
    } else {
      const actor = getActorForUser(oderId);
      if (!actor) continue;
      const current = actor.system?.currency?.gp ?? 0;
      await actor.update({ "system.currency.gp": current + amount });
    }
  }
}

/**
 * Deduct gold from a single player's actor.
 * Returns true if successful, false if they can't afford it.
 */
export async function deductFromActor(userId, amount, stateOverride = null) {
  const state = stateOverride ?? getState();
  const user = game.users.get(userId);

  // V3.5: Only house doesn't pay - GM-as-NPC pays like regular players
  const playerData = state?.players?.[userId];
  const isHouse = user?.isGM && !playerData?.playingAsNpc;
  if (isHouse) return true;

  // V4: NPCs use module wallet
  if (isNpcPlayer(userId)) {
    const wallet = getNpcWallet(userId);
    if (wallet < amount) return false;
    await updateNpcWallet(userId, -amount);
    return true;
  }

  const actor = getActorForUser(userId);
  if (!actor) return false;

  const current = actor.system?.currency?.gp ?? 0;
  if (current < amount) return false;

  await actor.update({ "system.currency.gp": current - amount });
  return true;
}

/**
 * V4: Generate NPC cash-out summary for GM
 */
export function getNpcCashOutSummary(userId) {
  const state = getState();
  const playerData = state?.players?.[userId];

  if (!isNpcPlayer(userId)) return null;

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

