/**
 * Tavern Twenty-One - Actor Utilities
 */

import { getState } from "../../state.js";

function escapeHtml(value) {
    const text = value === null || value === undefined ? "" : String(value);
    if (foundry?.utils?.escapeHTML) {
        return foundry.utils.escapeHTML(text);
    }
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Get actor for a user (for skill checks)
 */
export function getActorForUser(userId) {
    const user = game.users.get(userId);
    if (!user) return null;
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

export function getActorName(userId) {
    const actor = getActorForUser(userId);
    return actor?.name ?? game.users.get(userId)?.name ?? "Unknown";
}

export function getSafeActorName(userId) {
    return escapeHtml(getActorName(userId));
}

export function escapeHtmlString(value) {
    return escapeHtml(value);
}



