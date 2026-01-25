/**
 * Tavern Twenty-One - Game Constants
 * V3.0
 */

export const MODULE_ID = "tavern-dice-master";

// Valid dice types in the game
export const VALID_DICE = [4, 6, 8, 10, 20];
export const GOBLIN_DICE = [...VALID_DICE, 2];

export function getAllowedDice(gameMode = "standard") {
    return gameMode === "goblin" ? GOBLIN_DICE : VALID_DICE;
}

// Opening phase requirements
export const OPENING_ROLLS_REQUIRED = 2;

// Hunch skill DC and thresholds
export const HUNCH_DC = 12;
export const HUNCH_THRESHOLDS = {
    2: 1,
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

// Duel challenge types with flavor
export const DUEL_CHALLENGES = {
    str: {
        name: "Arm Wrestling",
        desc: "Lock arms and test your might!",
        icon: "fa-solid fa-hand-fist",
    },
    dex: {
        name: "Quick Draw",
        desc: "Fastest hands at the table!",
        icon: "fa-solid fa-hand",
    },
    con: {
        name: "Drinking Contest",
        desc: "Last one standing wins!",
        icon: "fa-solid fa-beer-mug-empty",
    },
    int: {
        name: "Riddle Challenge",
        desc: "Outwit your opponent!",
        icon: "fa-solid fa-brain",
    },
    wis: {
        name: "Staring Contest",
        desc: "First to blink loses!",
        icon: "fa-solid fa-eye",
    },
    cha: {
        name: "Crowd Appeal",
        desc: "Let the crowd decide!",
        icon: "fa-solid fa-users",
    },
};

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
        // V5: Per-Player Heat (User Request)
        playerHeat: {}, // { [userId]: number }
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
        blindNextRoll: {},
        // V3: Side bets
        sideBets: {},
        sideBetPool: 0,
        sideBetRound: 1,
        sideBetRoundStart: null,
        // V3: Hit tracking for Duel
        hitCount: {},
        // V3: The Cut
        theCutPlayer: null,
        theCutUsed: false,
        // V4: Dared condition (from Goad backfire)
        dared: {},
        // V4: Blind dice (from Hunch failure)
        blindDice: {},
        // V4.7.1: Track who has accused this round (one accusation per round)
        accusedThisRound: {},
        // V4.8.40: Unified skill usage tracking (Once per Round/Match limit)
        usedSkills: {}, // { [userId]: { bump: true, goad: true, hunch: true, profile: true } }
        // V5.14: Goblin Mode
        usedDice: {}, // { [userId]: [4, 6, 8] } - tracks used dice types
        goblinSetProgress: {}, // { [userId]: [4, 6, 8, 10, 20] } - full-set tracking
        gameMode: "standard",
        // V5.14: House Rules
        houseRules: { startingHeat: 10 },
        // V5: Default Heat DC (legacy)
        heatDC: 10,
        // V5.8: Pending action (cheat decision)
        pendingAction: null,
    };
}
