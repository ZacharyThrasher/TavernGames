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
    version: 2,
    status: "LOBBY", // LOBBY, PLAYING, REVEALING, PAYOUT
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
      revealedTotals: {},
    },
    history: [],
  };
}

export async function ensureStateMacro() {
  const existing = game.macros.getName(STATE_MACRO_NAME);
  if (existing) {
    const current = existing.getFlag(MODULE_ID, "state");
    if (!current || current.version < 2) {
      await existing.setFlag(MODULE_ID, "state", defaultState());
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
  const next = foundry.utils.mergeObject(current, patch, { inplace: false });
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
