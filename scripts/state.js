import { MODULE_ID, buildTableDataSections, emptyTableData, LIMITS } from "./twenty-one/constants.js";
import { isPlainObject, coercePlainObject } from "./twenty-one/utils/object.js";

/**
 * @typedef {Object} TableData
 * @property {Object<string, number>} totals
 * @property {Object<string, number>} visibleTotals
 * @property {Object<string, Array<Object>>} rolls
 * @property {Object<string, boolean>} holds
 * @property {Object<string, boolean>} busts
 * @property {"opening"|"betting"|"cut"} phase
 * @property {"standard"|"goblin"} gameMode
 */

/**
 * @typedef {Object} GameState
 * @property {number} version
 * @property {number} revision
 * @property {string} status
 * @property {number} pot
 * @property {string[]} turnOrder
 * @property {Object<string, Object>} players
 * @property {TableData} tableData
 * @property {Array<Object>} history
 * @property {Object<string, Array<Object>>} privateLogs
 */

export function registerSettings() {
  game.settings.register(MODULE_ID, "fixedAnte", {
    name: "Fixed Ante (GP)",
    hint: "Fixed ante amount for tavern games.",
    scope: "world",
    config: true,
    type: Number,
    default: 5,
    range: { min: 1, max: 1000, step: 1 },
  });
  game.settings.register(MODULE_ID, "sideBetPayout", {
    name: "Side Bet Payout Multiplier",
    hint: "Multiplier for side bet winnings (e.g. 2.0 = 2x payout). Default is 2.0 (2:1).",
    scope: "world",
    config: true,
    type: Number,
    default: 2.0,
    range: { min: 1.1, max: 10.0, step: 0.1 },
  });
  game.settings.register(MODULE_ID, "liquidMode", {
    name: "Liquid Mode",
    hint: "Pay with your liver instead of gold.",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
  });
  game.settings.register(MODULE_ID, "gameState", {
    name: "Game State",
    hint: "Internal game state storage.",
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });
  game.settings.register(MODULE_ID, "tableTheme", {
    name: "Table Theme",
    hint: "Choose a visual theme for the tavern table. Each theme changes the entire look and feel of the UI.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      "sword-coast": "Sword Coast Tavern (Classic)",
      "goblin-den": "Goblin's Den (Grimy & Chaotic)",
      "underdark": "Underdark Parlor (Bioluminescent)",
      "gilded-dragon": "Gilded Dragon (Opulent & Imperial)",
      "feywild": "Feywild Garden (Ethereal & Whimsical)"
    },
    default: "sword-coast",
    onChange: () => {
      game.tavernDiceMaster?.app?.render();
    }
  });
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
    `modules/${MODULE_ID}/templates/parts/header.hbs`,
    `modules/${MODULE_ID}/templates/parts/table.hbs`,
    `modules/${MODULE_ID}/templates/parts/controls.hbs`,
    `modules/${MODULE_ID}/templates/parts/footer.hbs`,
    `modules/${MODULE_ID}/templates/parts/history.hbs`,
    `modules/${MODULE_ID}/templates/cinematic-overlay.hbs`,
    `modules/${MODULE_ID}/templates/dialogs/gm-join-dialog.hbs`,
    `modules/${MODULE_ID}/templates/dialogs/goblin-hold-dialog.hbs`,
    `modules/${MODULE_ID}/templates/dialogs/confirm-dialog.hbs`,
    `modules/${MODULE_ID}/templates/dialogs/payment-dialog.hbs`,
    `modules/${MODULE_ID}/templates/dialogs/private-feedback-dialog.hbs`,
    `modules/${MODULE_ID}/templates/chat/npc-cashout.hbs`,
  ]);
}

export function defaultState() {
  return {
    version: 5,
    revision: 0,
    updatedAt: null,
    updatedBy: null,
    status: "LOBBY", // LOBBY, PLAYING, INSPECTION, REVEALING, PAYOUT
    pot: 0,
    turnOrder: [],
    turnIndex: 0,
    players: {},
    autoplay: {}, // { [userId]: { enabled: boolean, strategy: string, difficulty: "easy"|"normal"|"hard"|"legendary" } }
    tableData: emptyTableData(),
    history: [],
    npcWallets: {},
    privateLogs: {}, // { [userId]: [{ timestamp, text, type, icon }] }
  };
}

let cachedState = null;
let cachedRevision = null;
let cachedUpdatedAt = null;

function invalidateStateCache() {
  cachedState = null;
  cachedRevision = null;
  cachedUpdatedAt = null;
}

function hasGroupedTableSections(tableData) {
  if (!isPlainObject(tableData)) return false;
  return isPlainObject(tableData.coreState)
    && isPlainObject(tableData.skillState)
    && isPlainObject(tableData.sideBetState)
    && isPlainObject(tableData.goblinState)
    && isPlainObject(tableData.cutState);
}

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
      invalidateStateCache();
      console.log("Tavern Twenty-One | Migrated legacy world-setting state schema.");
    } else if (currentState.version < 5) {
      const migrated = {
        ...defaultState(),
        ...currentState,
        version: 5,
        revision: currentState.revision ?? 0,
        updatedAt: currentState.updatedAt ?? Date.now(),
        updatedBy: currentState.updatedBy ?? game.user.id
      };
      migrated.tableData = normalizeTableData(migrated.tableData);
      await game.settings.set(MODULE_ID, "gameState", migrated);
      invalidateStateCache();
      console.log("Tavern Twenty-One | Migrated state revision metadata.");
    }
    return;
  }

  // No existing state - create fresh
  if (!currentState || Object.keys(currentState).length === 0) {
    await game.settings.set(MODULE_ID, "gameState", defaultState());
    invalidateStateCache();
    console.log("Tavern Twenty-One | Initialized fresh state in World Settings");
  }
}

function resolveActorImage(userId, state) {
  if (!userId) return "icons/svg/mystery-man.svg";

  const user = game.users.get(userId);
  const playerData = state?.players?.[userId];

  if (playerData?.playingAsNpc && playerData?.npcActorId) {
    const npcActor = game.actors.get(playerData.npcActorId);
    return npcActor?.img ?? playerData.avatar ?? user?.avatar ?? "icons/svg/mystery-man.svg";
  }

  return user?.character?.img ?? playerData?.avatar ?? user?.avatar ?? "icons/svg/mystery-man.svg";
}

function normalizeLogText(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeLogEntry(entry) {
  if (!entry || typeof entry !== "object") return {};
  const normalized = { ...entry };
  if ("title" in normalized) normalized.title = normalizeLogText(normalized.title);
  if ("message" in normalized) normalized.message = normalizeLogText(normalized.message);
  return normalized;
}

export function normalizeTableData(tableData) {
  const base = emptyTableData();
  const incoming = isPlainObject(tableData) ? { ...tableData } : {};

  // Support grouped table schema input while remaining backward-compatible with flat keys.
  if (isPlainObject(incoming.coreState)) {
    const core = incoming.coreState;
    if (incoming.totals === undefined) incoming.totals = core.totals;
    if (incoming.visibleTotals === undefined) incoming.visibleTotals = core.visibleTotals;
    if (incoming.bettingOrder === undefined) incoming.bettingOrder = core.bettingOrder;
    if (incoming.holds === undefined) incoming.holds = core.holds;
    if (incoming.busts === undefined) incoming.busts = core.busts;
    if (incoming.rolls === undefined) incoming.rolls = core.rolls;
    if (incoming.rolling === undefined) incoming.rolling = core.rolling;
    if (incoming.currentPlayer === undefined) incoming.currentPlayer = core.currentPlayer;
    if (incoming.phase === undefined) incoming.phase = core.phase;
    if (incoming.duel === undefined) incoming.duel = core.duel;
    if (incoming.gameMode === undefined) incoming.gameMode = core.gameMode;
    if (incoming.houseRules === undefined) incoming.houseRules = core.houseRules;
    if (incoming.heatDC === undefined) incoming.heatDC = core.heatDC;
    if (incoming.pendingAction === undefined) incoming.pendingAction = core.pendingAction;
    if (incoming.pendingBust === undefined) incoming.pendingBust = core.pendingBust;
  }
  if (isPlainObject(incoming.skillState)) {
    const skills = incoming.skillState;
    if (incoming.cheaters === undefined) incoming.cheaters = skills.cheaters;
    if (incoming.caught === undefined) incoming.caught = skills.caught;
    if (incoming.disqualified === undefined) incoming.disqualified = skills.disqualified;
    if (incoming.goadedThisRound === undefined) incoming.goadedThisRound = skills.goadedThisRound;
    if (incoming.goadBackfire === undefined) incoming.goadBackfire = skills.goadBackfire;
    if (incoming.bumpedThisRound === undefined) incoming.bumpedThisRound = skills.bumpedThisRound;
    if (incoming.pendingBumpRetaliation === undefined) incoming.pendingBumpRetaliation = skills.pendingBumpRetaliation;
    if (incoming.cleaningFees === undefined) incoming.cleaningFees = skills.cleaningFees;
    if (incoming.profiledBy === undefined) incoming.profiledBy = skills.profiledBy;
    if (incoming.drinkCount === undefined) incoming.drinkCount = skills.drinkCount;
    if (incoming.sloppy === undefined) incoming.sloppy = skills.sloppy;
    if (incoming.playerHeat === undefined) incoming.playerHeat = skills.playerHeat;
    if (incoming.cheatsThisRound === undefined) incoming.cheatsThisRound = skills.cheatsThisRound;
    if (incoming.folded === undefined) incoming.folded = skills.folded;
    if (incoming.foldedEarly === undefined) incoming.foldedEarly = skills.foldedEarly;
    if (incoming.hasActed === undefined) incoming.hasActed = skills.hasActed;
    if (incoming.hunchPrediction === undefined) incoming.hunchPrediction = skills.hunchPrediction;
    if (incoming.hunchRolls === undefined) incoming.hunchRolls = skills.hunchRolls;
    if (incoming.hunchLocked === undefined) incoming.hunchLocked = skills.hunchLocked;
    if (incoming.hunchLockedDie === undefined) incoming.hunchLockedDie = skills.hunchLockedDie;
    if (incoming.hunchExact === undefined) incoming.hunchExact = skills.hunchExact;
    if (incoming.blindNextRoll === undefined) incoming.blindNextRoll = skills.blindNextRoll;
    if (incoming.dared === undefined) incoming.dared = skills.dared;
    if (incoming.blindDice === undefined) incoming.blindDice = skills.blindDice;
    if (incoming.accusedThisRound === undefined) incoming.accusedThisRound = skills.accusedThisRound;
    if (incoming.usedSkills === undefined) incoming.usedSkills = skills.usedSkills;
    if (incoming.skillUsedThisTurn === undefined) incoming.skillUsedThisTurn = skills.skillUsedThisTurn;
    if (incoming.lastSkillUsed === undefined) incoming.lastSkillUsed = skills.lastSkillUsed;
  }
  if (isPlainObject(incoming.sideBetState)) {
    const sideBetState = incoming.sideBetState;
    if (incoming.sideBets === undefined && sideBetState.sideBets !== undefined) incoming.sideBets = sideBetState.sideBets;
    if (incoming.sideBetPool === undefined && sideBetState.sideBetPool !== undefined) incoming.sideBetPool = sideBetState.sideBetPool;
    if (incoming.sideBetRound === undefined && sideBetState.sideBetRound !== undefined) incoming.sideBetRound = sideBetState.sideBetRound;
    if (incoming.sideBetRoundStart === undefined && sideBetState.sideBetRoundStart !== undefined) incoming.sideBetRoundStart = sideBetState.sideBetRoundStart;
    if (incoming.sideBetWinners === undefined && sideBetState.sideBetWinners !== undefined) incoming.sideBetWinners = sideBetState.sideBetWinners;
  }
  if (isPlainObject(incoming.goblinState)) {
    const goblin = incoming.goblinState;
    if (incoming.usedDice === undefined) incoming.usedDice = goblin.usedDice;
    if (incoming.goblinSetProgress === undefined) incoming.goblinSetProgress = goblin.goblinSetProgress;
    if (incoming.goblinFinalActive === undefined) incoming.goblinFinalActive = goblin.goblinFinalActive;
    if (incoming.goblinFinalTargetId === undefined) incoming.goblinFinalTargetId = goblin.goblinFinalTargetId;
    if (incoming.goblinFinalTargetScore === undefined) incoming.goblinFinalTargetScore = goblin.goblinFinalTargetScore;
    if (incoming.goblinFinalRemaining === undefined) incoming.goblinFinalRemaining = goblin.goblinFinalRemaining;
    if (incoming.goblinSuddenDeathActive === undefined) incoming.goblinSuddenDeathActive = goblin.goblinSuddenDeathActive;
    if (incoming.goblinSuddenDeathParticipants === undefined) incoming.goblinSuddenDeathParticipants = goblin.goblinSuddenDeathParticipants;
    if (incoming.goblinSuddenDeathRemaining === undefined) incoming.goblinSuddenDeathRemaining = goblin.goblinSuddenDeathRemaining;
    if (incoming.goblinStageIndex === undefined) incoming.goblinStageIndex = goblin.goblinStageIndex;
    if (incoming.goblinStageDie === undefined) incoming.goblinStageDie = goblin.goblinStageDie;
    if (incoming.goblinStageRemaining === undefined) incoming.goblinStageRemaining = goblin.goblinStageRemaining;
    if (incoming.goblinBoots === undefined) incoming.goblinBoots = goblin.goblinBoots;
    if (incoming.goblinHoldStage === undefined) incoming.goblinHoldStage = goblin.goblinHoldStage;
  }
  if (isPlainObject(incoming.cutState)) {
    const cut = incoming.cutState;
    if (incoming.hitCount === undefined) incoming.hitCount = cut.hitCount;
    if (incoming.theCutPlayer === undefined) incoming.theCutPlayer = cut.theCutPlayer;
    if (incoming.theCutUsed === undefined) incoming.theCutUsed = cut.theCutUsed;
  }

  const normalized = { ...base, ...incoming };

  const mapKeys = [
    "totals",
    "visibleTotals",
    "holds",
    "busts",
    "rolls",
    "rolling",
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
    "hunchRolls",
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
    "goblinSetProgress",
    "goblinBoots",
    "goblinHoldStage"
  ];

  for (const key of mapKeys) {
    normalized[key] = coercePlainObject(normalized[key]);
  }

  normalized.houseRules = coercePlainObject(normalized.houseRules);
  if (normalized.gameMode !== "standard" && normalized.gameMode !== "goblin") {
    normalized.gameMode = "standard";
  }
  if (typeof normalized.lastSkillUsed !== "string") {
    normalized.lastSkillUsed = null;
  }
  if (typeof normalized.skillUsedThisTurn !== "boolean") {
    normalized.skillUsedThisTurn = false;
  }
  if (typeof normalized.pendingAction !== "string") {
    normalized.pendingAction = null;
  }
  if (normalized.pendingBust !== null && typeof normalized.pendingBust !== "string") {
    normalized.pendingBust = null;
  }
  if (normalized.pendingBumpRetaliation !== null && !isPlainObject(normalized.pendingBumpRetaliation)) {
    normalized.pendingBumpRetaliation = null;
  }
  if (!Array.isArray(normalized.goblinStageRemaining)) {
    normalized.goblinStageRemaining = [];
  }
  if (!Array.isArray(normalized.goblinSuddenDeathParticipants)) {
    normalized.goblinSuddenDeathParticipants = [];
  }
  if (!Array.isArray(normalized.goblinSuddenDeathRemaining)) {
    normalized.goblinSuddenDeathRemaining = [];
  }

  const sections = buildTableDataSections(normalized);
  normalized.coreState = sections.coreState;
  normalized.skillState = sections.skillState;
  normalized.sideBetState = sections.sideBetState;
  normalized.goblinState = sections.goblinState;
  normalized.cutState = sections.cutState;

  return normalized;
}

export function getState() {
  const state = game.settings.get(MODULE_ID, "gameState");
  if (!state || Object.keys(state).length === 0) {
    const initial = defaultState();
    if (!hasGroupedTableSections(initial.tableData)) {
      initial.tableData = normalizeTableData(initial.tableData);
    }
    cachedState = initial;
    cachedRevision = initial.revision ?? 0;
    cachedUpdatedAt = initial.updatedAt ?? null;
    return initial;
  }

  const revision = Number.isInteger(state.revision) ? state.revision : 0;
  const updatedAt = state.updatedAt ?? null;
  if (cachedState && cachedRevision === revision && cachedUpdatedAt === updatedAt) {
    return cachedState;
  }

  const next = { ...state };
  if (!Number.isInteger(next.version)) next.version = defaultState().version;
  if (!Number.isInteger(next.revision)) next.revision = 0;
  if (!next.updatedAt) next.updatedAt = null;
  if (!next.updatedBy) next.updatedBy = null;
  if (!isPlainObject(next.autoplay)) next.autoplay = {};

  // Normalize only when tableData shape is missing grouped sections.
  if (!hasGroupedTableSections(next.tableData)) {
    next.tableData = normalizeTableData(next.tableData);
  }

  cachedState = next;
  cachedRevision = next.revision;
  cachedUpdatedAt = next.updatedAt;
  return next;
}

let stateUpdateQueue = Promise.resolve();

export function flushStateQueue() {
  return stateUpdateQueue;
}

/**
 * Update game state in world settings.
 * @param {Partial<GameState>|((current: GameState) => Partial<GameState>|null|undefined)} patchOrFn
 * @returns {Promise<GameState>}
 */
export async function updateState(patchOrFn) {
  if (!game.user.isGM) {
    console.warn("Tavern Twenty-One | updateState called by non-GM user. Skipping update.");
    return getState();
  }

  stateUpdateQueue = stateUpdateQueue.then(async () => {
    const current = getState();
    const rawPatch = typeof patchOrFn === "function" ? patchOrFn(current) : patchOrFn;
    const patch = rawPatch && typeof rawPatch === "object" ? rawPatch : null;

    if (!patch) {
      return current;
    }
    if (Object.keys(patch).length === 0) {
      return current;
    }

    const next = {
      ...current,
      ...patch,
      tableData: patch.tableData !== undefined
        ? { ...current.tableData, ...patch.tableData }
        : current.tableData,
      players: patch.players !== undefined
        ? { ...patch.players }
        : current.players,
      turnOrder: patch.turnOrder !== undefined
        ? [...patch.turnOrder]
        : current.turnOrder,
      npcWallets: patch.npcWallets !== undefined
        ? { ...patch.npcWallets }
        : current.npcWallets,
      privateLogs: patch.privateLogs !== undefined
        ? { ...patch.privateLogs }
        : current.privateLogs,
      autoplay: patch.autoplay !== undefined
        ? { ...coercePlainObject(patch.autoplay) }
        : coercePlainObject(current.autoplay),
    };

    next.tableData = normalizeTableData(next.tableData);
    next.revision = (current.revision ?? 0) + 1;
    next.updatedAt = Date.now();
    next.updatedBy = game.user.id;

    await game.settings.set(MODULE_ID, "gameState", next);
    cachedState = next;
    cachedRevision = next.revision;
    cachedUpdatedAt = next.updatedAt;
    return next;
  }).catch((error) => {
    console.error("Tavern Twenty-One | updateState failed:", error);
    invalidateStateCache();
    return getState();
  });

  return stateUpdateQueue;
}

export function getPlayerState(userId) {
  const state = getState();
  return state.players?.[userId] ?? null;
}

export async function addHistoryEntry(entry) {
  const safeEntry = entry && typeof entry === "object" ? entry : {};
  return updateState((current) => {
    const history = [...(current.history ?? []), { ...safeEntry, timestamp: Date.now() }];
    if (history.length > LIMITS.HISTORY_ENTRIES) {
      history.splice(0, history.length - LIMITS.HISTORY_ENTRIES);
    }
    return { history };
  });
}

export async function clearHistory() {
  return updateState({ history: [] });
}

/**
 * @param {string} userId 
 * @param {object} entry - { title, message, icon, type }
 */
export async function addPrivateLog(userId, entry) {
  if (!userId) return getState();
  const safeEntry = entry && typeof entry === "object" ? entry : {};

  return updateState((current) => {
    const { actorUserId, ...entryWithoutActorUser } = safeEntry;
    const normalizedEntry = normalizeLogEntry(entryWithoutActorUser);
    const sourceUserId = actorUserId ?? userId;
    const actorImg = normalizedEntry.actorImg ?? resolveActorImage(sourceUserId, current);
    const currentLogs = current.privateLogs?.[userId] ?? [];

    const newEntry = {
      ...normalizedEntry,
      actorImg,
      timestamp: Date.now(),
      id: foundry.utils.randomID(), // Unique ID for DOM keys.
      seen: false // For future unread badge logic.
    };

    const newLogs = [...currentLogs, newEntry];
    if (newLogs.length > LIMITS.PRIVATE_LOGS_PER_USER) {
      newLogs.splice(0, newLogs.length - LIMITS.PRIVATE_LOGS_PER_USER);
    }

    return {
      privateLogs: { ...(current.privateLogs ?? {}), [userId]: newLogs }
    };
  });
}

/**
 * @param {object} entry - Log entry
 * @param {string[]} excludeIds - Array of user IDs to exclude
 * @param {string|null} actorUserId - Optional actor source for log avatar resolution
 */
export async function addLogToAll(entry, excludeIds = [], actorUserId = null) {
  const safeEntry = entry && typeof entry === "object" ? entry : {};
  const excluded = Array.isArray(excludeIds) ? excludeIds : [];
  const state = getState();
  const allUsers = Object.keys(state.players || {});
  const targets = allUsers.length > 0 ? allUsers : game.users.map(u => u.id);
  const recipientIds = targets.filter(id => !excluded.includes(id));
  if (!recipientIds.length) return state;

  return updateState((current) => {
    const currentUsers = Object.keys(current.players || {});
    const currentTargets = currentUsers.length > 0 ? currentUsers : game.users.map(u => u.id);
    const liveRecipientIds = currentTargets.filter(id => !excluded.includes(id));
    if (!liveRecipientIds.length) return {};

    const timestamp = Date.now();
    const idBase = foundry.utils.randomID();
    const privateLogs = { ...(current.privateLogs ?? {}) };
    const { actorUserId: entryActorUserId, ...entryWithoutActorUser } = safeEntry;
    const normalizedEntry = normalizeLogEntry(entryWithoutActorUser);
    const sourceUserId = actorUserId ?? entryActorUserId ?? null;
    const actorImg = normalizedEntry.actorImg ?? (sourceUserId ? resolveActorImage(sourceUserId, current) : null);
    const baseEntry = actorImg ? { ...normalizedEntry, actorImg } : normalizedEntry;

    for (const userId of liveRecipientIds) {
      const currentLogs = privateLogs[userId] ?? [];
      const newEntry = {
        ...baseEntry,
        timestamp,
        id: `${idBase}-${userId}`,
        seen: false
      };
      const newLogs = [...currentLogs, newEntry];
      if (newLogs.length > LIMITS.PRIVATE_LOGS_PER_USER) {
        newLogs.splice(0, newLogs.length - LIMITS.PRIVATE_LOGS_PER_USER);
      }
      privateLogs[userId] = newLogs;
    }

    return { privateLogs };
  });
}

export async function markLogsAsSeen(userId) {
  if (!userId) return getState();
  return updateState((current) => {
    const currentLogs = current.privateLogs?.[userId] ?? [];
    if (!currentLogs.some(log => !log.seen)) {
      return {};
    }

    const updatedLogs = currentLogs.map(log => (log.seen ? log : { ...log, seen: true }));
    return {
      privateLogs: { ...(current.privateLogs ?? {}), [userId]: updatedLogs }
    };
  });
}



