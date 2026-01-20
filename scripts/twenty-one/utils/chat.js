/**
 * Tavern Twenty-One - Chat Utilities
 * V3.0
 */

import { getState, updateState } from "../state.js";
import { playSound } from "../../sounds.js";

// Re-export playSound for convenience
export { playSound };

/**
 * Create a styled chat card for game events
 */
export async function createChatCard({ title, subtitle, message, icon = "fa-solid fa-dice" }) {
    const content = `
    <div class="tavern-chat-card">
      <div class="tavern-card-header">
        <i class="${icon}"></i>
        <span class="tavern-card-title">${title}</span>
      </div>
      ${subtitle ? `<div class="tavern-card-subtitle">${subtitle}</div>` : ""}
      <div class="tavern-card-content">${message}</div>
    </div>
  `;

    await ChatMessage.create({
        content,
        speaker: { alias: "Tavern Twenty-One" },
    });
}

/**
 * Add an entry to the game history
 */
export async function addHistoryEntry(entry) {
    const state = getState();
    const history = [...(state.history ?? []), {
        ...entry,
        timestamp: Date.now(),
    }];

    // Keep only last 50 entries
    if (history.length > 50) {
        history.shift();
    }

    await updateState({ history });
}
