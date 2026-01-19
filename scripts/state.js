export const MODULE_ID = "tavern-dice-master";
export const STATE_MACRO_NAME = "TavernState";

export const TAVERN_GAMES = {
  LIARS_DICE: "liars-dice",
  TWENTY_ONE: "twenty-one",
};

export function registerSettings() {
  game.settings.register(MODULE_ID, "fixedAnte", {
    name: "Fixed Ante (GP)",
    hint: "Fixed ante amount for tavern games.",
    scope: "world",
    config: true,
    type: Number,
    default: 5,
    min: 1,
  });
}

export async function preloadTemplates() {
  return loadTemplates([
    "templates/tavern-app.hbs",
    "templates/parts/lobby.hbs",
    "templates/parts/game.hbs",
    "templates/parts/status.hbs",
  ]);
}

export function defaultState() {
  return {
    version: 1,
    status: "LOBBY",
    activeGame: TAVERN_GAMES.LIARS_DICE,
    pot: 0,
    turnOrder: [],
    turnIndex: 0,
    players: {},
    tableData: {},
  };
}

export async function ensureStateMacro() {
  const existing = game.macros.getName(STATE_MACRO_NAME);
  if (existing) {
    const current = existing.getFlag(MODULE_ID, "state");
    if (!current) {
      await existing.setFlag(MODULE_ID, "state", defaultState());
    }
    return existing;
  }

  const macro = await Macro.create({
    name: STATE_MACRO_NAME,
    type: "script",
    command: "",
    img: "icons/dice/d20black.svg",
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
