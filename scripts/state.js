export const MODULE_ID = "tavern-dice-master";
export const STATE_MACRO_NAME = "TavernState";

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
    version: 3,
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
  };
}

export async function ensureStateMacro() {
  const existing = game.macros.getName(STATE_MACRO_NAME);
  if (existing) {
    const current = existing.getFlag(MODULE_ID, "state");
    if (!current) {
      // No state at all, create fresh
      await existing.setFlag(MODULE_ID, "state", defaultState());
    } else if (current.version < 3) {
      // Migrate old state - preserve players if any
      const migrated = {
        ...defaultState(),
        players: current.players ?? {},
        turnOrder: current.turnOrder ?? [],
        status: "LOBBY",
      };
      await existing.setFlag(MODULE_ID, "state", migrated);
    }
    return existing;
  }

  const macro = await Macro.create({
    name: STATE_MACRO_NAME,
    type: "script",
    command: "",
    img: "icons/sundries/gaming/dice-runed-brown.webp",
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
  });
  await macro.setFlag(MODULE_ID, "state", defaultState());
  return macro;
}

export function getStateMacro() {
  return game.macros.getName(STATE_MACRO_NAME);
}

export function getState() {
  return getStateMacro()?.getFlag(MODULE_ID, "state") ?? defaultState();
}

export async function updateState(patch) {
  const macro = getStateMacro();
  if (!macro) {
    throw new Error("Tavern state macro not found.");
  }
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
  };

  console.log("Tavern Twenty-One | Updating state:", { current, patch, next });
  console.log("Tavern Twenty-One | turnOrder after update:", next.turnOrder);

  // IMPORTANT: Foundry's setFlag uses mergeObject which merges arrays by index.
  // To ensure clean replacement, unset the flag first, then set the new state.
  await macro.unsetFlag(MODULE_ID, "state");
  await macro.setFlag(MODULE_ID, "state", next);
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
