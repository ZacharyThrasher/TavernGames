/**
 * Tavern Twenty-One - Game Constants
 * V3.0
 */

export const MODULE_ID = "tavern-dice-master";

// Valid dice types in the game
export const VALID_DICE = [4, 6, 8, 10, 20];

// Opening phase requirements
export const OPENING_ROLLS_REQUIRED = 2;

// Hunch skill DCs: DC 10 = 1 die, DC 15 = half dice
export const HUNCH_DC_LOW = 10;
export const HUNCH_DC_HIGH = 15;
export const HUNCH_THRESHOLDS = {
    4: 2,
    6: 3,
    8: 4,
    10: 5,
    20: 10,
};

// Die costs (multiplier of ante)
// d20=0.5x, d10=0.5x, d8=1x, d6=1x, d4=2x
export const DIE_COST_MULTIPLIERS = {
    4: 2,
    6: 1,
    8: 1,
    10: 0.5,
    20: 0.5,
};

/**
 * Get the cost for a specific die during betting phase
 */
export function getDieCost(die, ante) {
    const multiplier = DIE_COST_MULTIPLIERS[die] ?? 1;
    return Math.floor(ante * multiplier);
}

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
        // V4: Dared condition (from Goad backfire)
        dared: {},
        // V4: Blind dice (from Hunch failure)
        blindDice: {},
    };
}

