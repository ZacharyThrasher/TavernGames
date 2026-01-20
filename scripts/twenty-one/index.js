/**
 * Tavern Twenty-One - Main Module Index
 * V3.0
 * 
 * This file re-exports functions from the main twenty-one.js
 * for cleaner import paths.
 * 
 * Note: Skill modules in the skills/ directory are reference implementations
 * for future full modularization. The actual game uses twenty-one.js directly.
 */

// Re-export everything from the main game file
export {
    startRound,
    submitRoll,
    hold,
    useCut,
    fold,
    revealDice,
    finishRound,
    returnToLobby,
    submitDuelRoll,
    resolveDuel,
    cheat,
    scan,
    accuse,
    goad,
    resistGoad,
    hunch,
    profile,
    bumpTable,
    bumpRetaliation,
    skipInspection,
} from "../twenty-one.js";

// Re-export constants for convenience
export {
    MODULE_ID,
    VALID_DICE,
    OPENING_ROLLS_REQUIRED,
    HUNCH_DC,
    HUNCH_THRESHOLDS,
    DIE_COST_MULTIPLIERS,
    getDieCost,
    DUEL_CHALLENGES,
    emptyTableData,
} from "./constants.js";
