/**
 * Tavern Twenty-One - Actor Utilities
 * V3.0
 */

import { MODULE_ID, getState } from "../../state.js";

/**
 * Get actor for a user (for skill checks)
 * V3.5: If GM is playing as NPC, return the NPC actor instead
 */
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
 * Get all GM user IDs for whispered messages
 * V3.5: Exclude GMs who are playing as NPC (they shouldn't see house-only info)
 */
export function getGMUserIds() {
    const state = getState();
    return game.users.filter(u => {
        if (!u.isGM) return false;
        // V3.5: Exclude GMs playing as NPC from house-only whispers
        const playerData = state?.players?.[u.id];
        if (playerData?.playingAsNpc) return false;
        return true;
    }).map(u => u.id);
}

/**
 * Deduct gold from an actor's inventory
 * Returns false if insufficient funds, true if successful
 */
export async function deductFromActor(userId, amount) {
    if (amount <= 0) return true;

    const actor = getActorForUser(userId);
    if (!actor) return true; // No actor = free pass

    // V3.5: Skip deduction for NPCs - trust the GM to manage their gold
    // This allows the game to proceed even if the NPC sheet has 0gp
    if (actor.type === "npc") return true;

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
