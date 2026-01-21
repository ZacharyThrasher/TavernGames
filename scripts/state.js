export const MODULE_ID = "tavern-dice-master";
export const STATE_MACRO_NAME = "TavernState"; // Keep for migration
export { emptyTableData } from "./twenty-one/constants.js";

export function registerSettings() {
  game.settings.register(MODULE_ID, "fixedAnte", {
    name: "Fixed Ante (GP)",
    hint: "Fixed ante amount for tavern games.",
    scope: "world",
    config: true,
    type: Number,
    default: 5,
    range: { min: 1, max: 100, step: 1 },
  });

  game.settings.register(MODULE_ID, "enableSounds", {
    name: "Enable Sound Effects",
    hint: "Play sound effects for dice rolls, coins, and game events.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  // V2.0.2: Liquid Mode Toggle (Client setting, UI controlled)
  game.settings.register(MODULE_ID, "liquidMode", {
    name: "Liquid Mode",
    hint: "Pay with your liver instead of gold.",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });

  // V4: Game State (World setting, hidden from config UI)
  game.settings.register(MODULE_ID, "gameState", {
    name: "Game State",
    hint: "Internal game state storage.",
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });
}

export async function preloadTemplates() {
  return loadTemplates([
    `modules/${MODULE_ID}/templates/tavern-app.hbs`,
    `modules/${MODULE_ID}/templates/parts/table.hbs`,
    `modules/${MODULE_ID}/templates/parts/controls.hbs`,
    `modules/${MODULE_ID}/templates/parts/history.hbs`,
  ]);
}

export function defaultState() {
  return {
    version: 4, // V4: Bumped for World Settings migration
    status: "LOBBY", // LOBBY, PLAYING, INSPECTION, REVEALING, PAYOUT
    pot: 0,
    turnOrder: [],
    turnIndex: 0,
    players: {},
    tableData: {
      totals: {},
      holds: {},
      busts: {},
      rolls: {},
      currentPlayer: null,
      phase: "opening", // "opening" or "betting"
      cheaters: {},         // { [userId]: { deceptionRolls: [...] } }
      bluffers: {},         // { [userId]: true } - players who bluffed (faked a tell)
      tells: {},            // { [userId]: true } - players who triggered a tell (cheat OR bluff)
      caught: {},           // { [userId]: true } - caught cheaters
      accusation: null,     // { accuserId, targetId, success } - targeted accusation
      failedInspector: null,   // User who made false accusation (forfeits winnings)
    },
    history: [],
    // V4: NPC Bank
    npcWallets: {},
  };
}

/**
 * V4: Initialize state, migrating from Macro if needed
 */
export async function initializeState() {
  if (!game.user.isGM) return; // Only GM can initialize/migrate

  const currentState = game.settings.get(MODULE_ID, "gameState");

  // If we already have state in World Settings, check version
  if (currentState && currentState.version) {
    if (currentState.version < 4) {
      // Migrate from older World Settings version
      const migrated = {
        ...defaultState(),
        players: currentState.players ?? {},
        turnOrder: currentState.turnOrder ?? [],
        pot: currentState.pot ?? 0,
        history: currentState.history ?? [],
        status: "LOBBY", // Reset to lobby on migration
      };
      await game.settings.set(MODULE_ID, "gameState", migrated);
      console.log("Tavern Twenty-One | Migrated state to V4 (World Settings)");
    }
    return;
  }

  // Check for old Macro-based state and migrate
  const oldMacro = game.macros.getName(STATE_MACRO_NAME);
  if (oldMacro) {
    const macroState = oldMacro.getFlag(MODULE_ID, "state");
    if (macroState) {
      // Migrate from Macro to World Settings
      const migrated = {
        ...defaultState(),
        players: macroState.players ?? {},
        turnOrder: macroState.turnOrder ?? [],
        pot: macroState.pot ?? 0,
        history: macroState.history ?? [],
        status: "LOBBY", // Reset to lobby on migration
      };
      await game.settings.set(MODULE_ID, "gameState", migrated);

      // Clean up old macro (optional - keep for safety)
      // await oldMacro.delete();
      console.log("Tavern Twenty-One | Migrated state from Macro to World Settings");
      ui.notifications.info("Tavern Games: State migrated to new storage system.");
      return;
    }
  }

  // No existing state - create fresh
  if (!currentState || Object.keys(currentState).length === 0) {
    await game.settings.set(MODULE_ID, "gameState", defaultState());
    console.log("Tavern Twenty-One | Initialized fresh state in World Settings");
  }
}

/**
 * V4: Legacy function for backwards compatibility - no longer creates Macro
 */
export async function ensureStateMacro() {
  await initializeState();
  return null; // No longer returns a macro
}

/**
 * V4: Get current game state from World Settings
 */
export function getState() {
  const state = game.settings.get(MODULE_ID, "gameState");
  if (!state || Object.keys(state).length === 0) {
    return defaultState();
  }
  return state;
}

/**
 * V4: Update game state in World Settings
 */
export async function updateState(patch) {
  const current = getState();

  // Manual merge to ensure arrays are replaced, not merged by index
  const next = {
    ...current,
    ...patch,
    // Deep merge tableData if present in patch
    tableData: patch.tableData !== undefined
      ? { ...current.tableData, ...patch.tableData }
      : current.tableData,
    // Replace players entirely if present in patch (not merge)
    players: patch.players !== undefined
      ? { ...patch.players }
      : current.players,
    // Replace turnOrder entirely if present in patch (not merge)
    turnOrder: patch.turnOrder !== undefined
      ? [...patch.turnOrder]
      : current.turnOrder,
    // V4: Replace npcWallets entirely if present
    npcWallets: patch.npcWallets !== undefined
      ? { ...patch.npcWallets }
      : current.npcWallets,
  };

  console.log("Tavern Twenty-One | Updating state:", { current, patch, next });
  console.log("Tavern Twenty-One | turnOrder after update:", next.turnOrder);

  await game.settings.set(MODULE_ID, "gameState", next);
  return next;
}

export function getPlayerState(userId) {
  const state = getState();
  return state.players?.[userId] ?? null;
}

export async function addHistoryEntry(entry) {
  const state = getState();
  const history = [...(state.history ?? []), { ...entry, timestamp: Date.now() }];
  // Keep only last 50 entries
  if (history.length > 50) history.shift();
  return updateState({ history });
}

export async function clearHistory() {
  return updateState({ history: [] });
}

// V4: Legacy aliases for backwards compatibility
export function getStateMacro() {
  console.warn("Tavern Twenty-One | getStateMacro() is deprecated. State is now stored in World Settings.");
  return null;
}

