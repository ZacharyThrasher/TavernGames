export const MODULE_ID = "tavern-dice-master";
export const STATE_MACRO_NAME = "TavernState"; // Keep for migration
import { emptyTableData } from "./twenty-one/constants.js";
export { emptyTableData };

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

  // V5.8.3: Configurable Side Bet Payout
  game.settings.register(MODULE_ID, "sideBetPayout", {
    name: "Side Bet Payout Multiplier",
    hint: "Multiplier for side bet winnings (e.g. 2.0 = 2x payout). Default is 2.0 (2:1).",
    scope: "world",
    config: true,
    type: Number,
    default: 2.0,
    range: { min: 1.1, max: 10.0, step: 0.1 },
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

  // V5.14.0: Game Mode Setting ("standard" or "goblin")
  game.settings.register(MODULE_ID, "gameMode", {
    name: "Game Mode",
    hint: "Choose between Standard (Twenty-One) or Goblin Rules (Highest wins, exploding dice).",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "standard": "Standard (Twenty-One)",
      "goblin": "Goblin Rules (Russian Roulette)"
    },
    default: "standard",
    onChange: value => {
      // Keep table state in sync with the setting
      const state = getState();
      const tableData = state.tableData ?? emptyTableData();
      updateState({ tableData: { ...tableData, gameMode: value } });
      game.tavernDiceMaster?.app?.render();
    }
  });

  // V13: Performance Mode - disable heavy visual effects for lower-end hardware
  game.settings.register(MODULE_ID, "performanceMode", {
    name: "Performance Mode",
    hint: "Disable heavy visual effects (screen shake, banners, floating text) for better performance on lower-end hardware.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });
}

export async function preloadTemplates() {
  return loadTemplates([
    `modules/${MODULE_ID}/templates/tavern-app.hbs`,
    `modules/${MODULE_ID}/templates/parts/table.hbs`,
    `modules/${MODULE_ID}/templates/parts/controls.hbs`,
    `modules/${MODULE_ID}/templates/parts/history.hbs`,
    `modules/${MODULE_ID}/templates/cinematic-overlay.hbs`,
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
    tableData: emptyTableData(),
    history: [],
    // V4: NPC Bank
    npcWallets: {},
    // V5.8: Private Logs (Client-side secrets)
    privateLogs: {}, // { [userId]: [{ timestamp, text, type, icon }] }
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
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function coerceObject(value) {
  return isPlainObject(value) ? value : {};
}

export function normalizeTableData(tableData) {
  const base = emptyTableData();
  const incoming = isPlainObject(tableData) ? tableData : {};
  const normalized = { ...base, ...incoming };

  const mapKeys = [
    "totals",
    "visibleTotals",
    "holds",
    "busts",
    "rolls",
    "cheaters",
    "caught",
    "disqualified",
    "goadedThisRound",
    "goadBackfire",
    "bumpedThisRound",
    "cleaningFees",
    "profiledBy",
    "drinkCount",
    "sloppy",
    "playerHeat",
    "folded",
    "foldedEarly",
    "hasActed",
    "hunchPrediction",
    "hunchLocked",
    "hunchLockedDie",
    "hunchExact",
    "blindNextRoll",
    "sideBets",
    "sideBetWinners",
    "hitCount",
    "dared",
    "blindDice",
    "accusedThisRound",
    "usedSkills",
    "usedDice",
    "goblinSetProgress"
  ];

  for (const key of mapKeys) {
    normalized[key] = coerceObject(normalized[key]);
  }

  normalized.houseRules = coerceObject(normalized.houseRules);
  if (normalized.gameMode !== "standard" && normalized.gameMode !== "goblin") {
    normalized.gameMode = "standard";
  }
  if (typeof normalized.lastSkillUsed !== "string") {
    normalized.lastSkillUsed = null;
  }

  return normalized;
}

export function getState() {
  const state = game.settings.get(MODULE_ID, "gameState");
  if (!state || Object.keys(state).length === 0) {
    return defaultState();
  }
  // Ensure tableData has all expected fields
  return { ...state, tableData: normalizeTableData(state.tableData) };
}

/**
 * V4: Update game state in World Settings
 */
export async function updateState(patchOrFn) {
  // Use a transaction-like pattern by fetching fresh state explicitly
  // Note: Foundry settings are not truly transactional, but this helps with async race conditions
  const current = getState();
  if (!game.user.isGM) {
    console.warn("Tavern Twenty-One | updateState called by non-GM user. Skipping update.");
    return current;
  }

  // Resolve patch if it's a function
  const patch = typeof patchOrFn === 'function' ? patchOrFn(current) : patchOrFn;

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
    // V5.8: Replace privateLogs entirely if present (deep merge too expensive/complex for this)
    privateLogs: patch.privateLogs !== undefined
      ? { ...patch.privateLogs }
      : current.privateLogs,
  };

  next.tableData = normalizeTableData(next.tableData);

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

/**
 * V5.8: Add a private log entry for a specific user
 * @param {string} userId 
 * @param {object} entry - { title, message, icon, type }
 */
export async function addPrivateLog(userId, entry) {
  const state = getState();
  const currentLogs = state.privateLogs?.[userId] ?? [];

  // V5.9: Resolve Actor Image if not provided
  let actorImg = entry.actorImg;
  if (!actorImg && userId) {
    const user = game.users.get(userId);
    const actor = user?.character; // Simple resolution
    actorImg = actor?.img ?? user?.avatar ?? "icons/svg/mystery-man.svg";
  }

  // Add timestamp
  const newEntry = {
    ...entry,
    actorImg,
    timestamp: Date.now(),
    id: foundry.utils.randomID(), // Unique ID for DOM keys
    seen: false // For future unread badge logic
  };

  const newLogs = [...currentLogs, newEntry];

  // Cap at 20 entries
  if (newLogs.length > 20) newLogs.shift();

  const updatedPrivateLogs = { ...state.privateLogs, [userId]: newLogs };

  return updateState({ privateLogs: updatedPrivateLogs });
}

// V4: Legacy aliases for backwards compatibility
export function getStateMacro() {
  console.warn("Tavern Twenty-One | getStateMacro() is deprecated. State is now stored in World Settings.");
  return null;
}


/**
 * V5.8: Add a log entry to ALL users (Public Event)
 * @param {object} entry - Log entry
 * @param {string[]} excludeIds - Array of user IDs to exclude
 */
export async function addLogToAll(entry, excludeIds = []) {
  const state = getState();
  const allUsers = Object.keys(state.players || {});
  // If no players array, fallback to active users? No, players map should exist.
  // If empty players map (fresh game), we can try game.users
  const targets = allUsers.length > 0 ? allUsers : game.users.map(u => u.id);

  // Filter exclusions
  const recipientIds = targets.filter(id => !excludeIds.includes(id));

  const timestamp = Date.now();
  const idBase = foundry.utils.randomID();

  let updatedPrivateLogs = { ...state.privateLogs };
  let hasChanges = false;

  for (const userId of recipientIds) {
    const currentLogs = updatedPrivateLogs[userId] ?? [];
    const newEntry = {
      ...entry,
      timestamp,
      id: idBase + "-" + userId,
      seen: false
    };
    const newLogs = [...currentLogs, newEntry];
    if (newLogs.length > 20) newLogs.shift();
    updatedPrivateLogs[userId] = newLogs;
    hasChanges = true;
  }

  if (!hasChanges) return state;

  return updateState({ privateLogs: updatedPrivateLogs });
}

/**
 * V5.13: Mark all private logs for a user as seen
 */
export async function markLogsAsSeen(userId) {
  const state = getState();
  const currentLogs = state.privateLogs?.[userId] ?? [];

  if (currentLogs.every(log => log.seen)) return state;

  const updatedLogs = currentLogs.map(log => ({ ...log, seen: true }));
  const updatedPrivateLogs = { ...state.privateLogs, [userId]: updatedLogs };

  return updateState({ privateLogs: updatedPrivateLogs });
}
