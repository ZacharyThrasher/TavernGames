/**
 * Tavern Twenty-One - Actor Utilities
 * V3.0
 */

import { MODULE_ID } from "../constants.js";

/**
 * Get actor for a user (for skill checks)
 */
export function getActorForUser(userId) {
    const user = game.users.get(userId);
    if (!user) return null;
    const actorId = user.character?.id;
    if (!actorId) return null;
    return game.actors.get(actorId) ?? null;
}

/**
 * Get all GM user IDs for whispered messages
 */
export function getGMUserIds() {
    return game.users.filter(u => u.isGM).map(u => u.id);
}

/**
 * Deduct gold from an actor's inventory
 * Returns false if insufficient funds, true if successful
 */
export async function deductFromActor(userId, amount) {
    if (amount <= 0) return true;

    const actor = getActorForUser(userId);
    if (!actor) return true; // No actor = free pass

    const currentGP = actor.system?.currency?.gp ?? 0;
    if (currentGP < amount) return false;

    await actor.update({
        "system.currency.gp": currentGP - amount,
    });
    return true;
}

/**
 * Add gold to an actor's inventory
 */
export async function addToActor(userId, amount) {
    if (amount <= 0) return;

    const actor = getActorForUser(userId);
    if (!actor) return;

    const currentGP = actor.system?.currency?.gp ?? 0;
    await actor.update({
        "system.currency.gp": currentGP + amount,
    });
}

/**
 * Pay out winnings to players
 * @param {Object} payouts - Map of userId to amount
 */
export async function payOutWinners(payouts) {
    for (const [userId, amount] of Object.entries(payouts)) {
        await addToActor(userId, amount);
    }
}

/**
 * Notify a specific user with a whispered message
 */
export async function notifyUser(userId, message) {
    await ChatMessage.create({
        content: `<div class="tavern-notification">${message}</div>`,
        whisper: [userId],
        speaker: { alias: "Tavern Twenty-One" },
    });
}
