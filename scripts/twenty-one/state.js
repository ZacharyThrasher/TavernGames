/**
 * Tavern Twenty-One - State Management
 * V3.0
 */

import { MODULE_ID } from "./constants.js";

/**
 * Create empty table data for a new round
 */
export function emptyTableData() {
    return {
        totals: {},
        visibleTotals: {},
        bettingOrder: null,
        holds: {},
        busts: {},
        rolls: {},
        currentPlayer: null,
        phase: "opening",
        cheaters: {},
        caught: {},
        accusation: null,
        disqualified: {},
        goadedThisRound: {},
        goadBackfire: {},
        bumpedThisRound: {},
        pendingBumpRetaliation: null,
        cleaningFees: {},
        profiledBy: {},
        duel: null,
        drinkCount: {},
        sloppy: {},
        // V3: Heat mechanic
        heatDC: 10,
        cheatsThisRound: 0,
        // V3: Fold tracking
        folded: {},
        foldedEarly: {},
        hasActed: {},
        // V3: Hunch tracking
        hunchPrediction: {},
        hunchLocked: {},
        hunchLockedDie: {},
        hunchExact: {},
        // V3: Side bets
        sideBets: {},
        // V3: Hit tracking for Duel
        hitCount: {},
        // V3: The Cut
        theCutPlayer: null,
        theCutUsed: false,
    };
}

/**
 * Get the current game state from Foundry settings
 */
export function getState() {
    return game.settings.get(MODULE_ID, "gameState");
}

/**
 * Update game state (merges with existing)
 */
export function updateState(partial) {
    const current = getState();
    const newState = { ...current, ...partial };
    game.settings.set(MODULE_ID, "gameState", newState);
    return newState;
}
