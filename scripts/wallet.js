import { MODULE_ID } from "./state.js";

function getActorForUser(userId) {
  const user = game.users.get(userId);
  if (!user) return null;
  const actorId = user.character?.id;
  if (!actorId) return null;
  return game.actors.get(actorId) ?? null;
}

export function canAffordAnte(state, ante) {
  for (const userId of state.turnOrder) {
    const user = game.users.get(userId);
    
    // GM can always play as "the house" - no gold check required
    if (user?.isGM) continue;
    
    const actor = getActorForUser(userId);
    if (!actor) {
      return { ok: false, name: user?.name ?? "Unknown", reason: "no character" };
    }
    const gp = actor.system?.currency?.gp ?? 0;
    if (gp < ante) {
      return { ok: false, name: actor.name, reason: "insufficient gold" };
    }
  }
  return { ok: true };
}

export async function deductAnteFromActors(state, ante) {
  for (const userId of state.turnOrder) {
    const user = game.users.get(userId);
    
    // GM plays as "the house" - don't deduct gold
    if (user?.isGM) continue;
    
    const actor = getActorForUser(userId);
    if (!actor) continue;
    const current = actor.system?.currency?.gp ?? 0;
    await actor.update({ "system.currency.gp": current - ante });
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

  for (const [oderId, amount] of Object.entries(payouts)) {
    const user = game.users.get(oderId);
    
    // GM doesn't receive gold payouts (house money)
    if (user?.isGM) continue;
    
    const actor = getActorForUser(oderId);
    if (!actor) continue;
    const current = actor.system?.currency?.gp ?? 0;
    await actor.update({ "system.currency.gp": current + amount });
  }
}

/**
 * Deduct gold from a single player's actor.
 * Returns true if successful, false if they can't afford it.
 */
export async function deductFromActor(userId, amount) {
  const user = game.users.get(userId);
  
  // GM doesn't pay gold
  if (user?.isGM) return true;
  
  const actor = getActorForUser(userId);
  if (!actor) return false;
  
  const current = actor.system?.currency?.gp ?? 0;
  if (current < amount) return false;
  
  await actor.update({ "system.currency.gp": current - amount });
  return true;
}
