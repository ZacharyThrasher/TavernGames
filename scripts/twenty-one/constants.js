/**
 * Tavern Twenty-One - Game Constants
 */

export const MODULE_ID = "tavern-dice-master";
export const ACCUSATION_COST_MULTIPLIER = 2;
export const ACCUSATION_BOUNTY_MULTIPLIER = 5;

export const LIMITS = {
    HISTORY_ENTRIES: 50,
    PRIVATE_LOGS_PER_USER: 20,
};

export const TIMING = {
    SKILL_DRAMATIC_PAUSE: 3000,
    GOAD_DRAMATIC_PAUSE: 3500,
    STAREDOWN_DELAY: 2500,
    POST_REVEAL_DELAY: 500,
    CHEAT_WINDOW_DELAY: 1500,
    DOM_SETTLE: 60,
};

// Valid dice types in the game
export const VALID_DICE = [4, 6, 8, 10, 20];
export const GOBLIN_STAGE_DICE = [20, 12, 10, 8, 6, 4];
export const GOBLIN_DICE = [...GOBLIN_STAGE_DICE, 2];

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

export function buildTableDataSections(tableData = {}) {
    return {
        coreState: {
            totals: tableData.totals ?? {},
            visibleTotals: tableData.visibleTotals ?? {},
            bettingOrder: tableData.bettingOrder ?? null,
            holds: tableData.holds ?? {},
            busts: tableData.busts ?? {},
            rolls: tableData.rolls ?? {},
            rolling: tableData.rolling ?? {},
            currentPlayer: tableData.currentPlayer ?? null,
            phase: tableData.phase ?? "opening",
            duel: tableData.duel ?? null,
            gameMode: tableData.gameMode ?? "standard",
            houseRules: tableData.houseRules ?? { startingHeat: 10 },
            heatDC: tableData.heatDC ?? 10,
            pendingAction: tableData.pendingAction ?? null,
            pendingBust: tableData.pendingBust ?? null,
        },
        skillState: {
            cheaters: tableData.cheaters ?? {},
            caught: tableData.caught ?? {},
            disqualified: tableData.disqualified ?? {},
            goadedThisRound: tableData.goadedThisRound ?? {},
            goadBackfire: tableData.goadBackfire ?? {},
            bumpedThisRound: tableData.bumpedThisRound ?? {},
            pendingBumpRetaliation: tableData.pendingBumpRetaliation ?? null,
            cleaningFees: tableData.cleaningFees ?? {},
            profiledBy: tableData.profiledBy ?? {},
            drinkCount: tableData.drinkCount ?? {},
            sloppy: tableData.sloppy ?? {},
            playerHeat: tableData.playerHeat ?? {},
            cheatsThisRound: tableData.cheatsThisRound ?? 0,
            folded: tableData.folded ?? {},
            foldedEarly: tableData.foldedEarly ?? {},
            hasActed: tableData.hasActed ?? {},
            hunchPrediction: tableData.hunchPrediction ?? {},
            hunchRolls: tableData.hunchRolls ?? {},
            hunchLocked: tableData.hunchLocked ?? {},
            hunchLockedDie: tableData.hunchLockedDie ?? {},
            hunchExact: tableData.hunchExact ?? {},
            blindNextRoll: tableData.blindNextRoll ?? {},
            dared: tableData.dared ?? {},
            blindDice: tableData.blindDice ?? {},
            accusedThisRound: tableData.accusedThisRound ?? {},
            usedSkills: tableData.usedSkills ?? {},
            skillUsedThisTurn: tableData.skillUsedThisTurn ?? false,
            lastSkillUsed: tableData.lastSkillUsed ?? null,
        },
        sideBetState: {
            sideBets: tableData.sideBets ?? {},
            sideBetPool: tableData.sideBetPool ?? 0,
            sideBetRound: tableData.sideBetRound ?? 1,
            sideBetRoundStart: tableData.sideBetRoundStart ?? null,
            sideBetWinners: tableData.sideBetWinners ?? {},
        },
        goblinState: {
            usedDice: tableData.usedDice ?? {},
            goblinSetProgress: tableData.goblinSetProgress ?? {},
            goblinFinalActive: tableData.goblinFinalActive ?? false,
            goblinFinalTargetId: tableData.goblinFinalTargetId ?? null,
            goblinFinalTargetScore: tableData.goblinFinalTargetScore ?? null,
            goblinFinalRemaining: tableData.goblinFinalRemaining ?? [],
            goblinSuddenDeathActive: tableData.goblinSuddenDeathActive ?? false,
            goblinSuddenDeathParticipants: tableData.goblinSuddenDeathParticipants ?? [],
            goblinSuddenDeathRemaining: tableData.goblinSuddenDeathRemaining ?? [],
            goblinStageIndex: tableData.goblinStageIndex ?? 0,
            goblinStageDie: tableData.goblinStageDie ?? 20,
            goblinStageRemaining: tableData.goblinStageRemaining ?? [],
            goblinBoots: tableData.goblinBoots ?? {},
            goblinHoldStage: tableData.goblinHoldStage ?? {},
        },
        cutState: {
            hitCount: tableData.hitCount ?? {},
            theCutPlayer: tableData.theCutPlayer ?? null,
            theCutUsed: tableData.theCutUsed ?? false,
        },
    };
}

/**
 * Create empty table data for a new round
 */
export function emptyTableData() {
    const flat = {
        totals: {},
        visibleTotals: {},
        bettingOrder: null,
        holds: {},
        busts: {},
        rolls: {},
        rolling: {},
        currentPlayer: null,
        phase: "opening",
        cheaters: {},
        caught: {},
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
        playerHeat: {}, // { [userId]: number }
        cheatsThisRound: 0,
        folded: {},
        foldedEarly: {},
        hasActed: {},
        hunchPrediction: {},
        hunchRolls: {},
        hunchLocked: {},
        hunchLockedDie: {},
        hunchExact: {},
        blindNextRoll: {},
        sideBets: {},
        sideBetPool: 0,
        sideBetRound: 1,
        sideBetRoundStart: null,
        sideBetWinners: {}, // { [userId]: true }
        hitCount: {},
        theCutPlayer: null,
        theCutUsed: false,
        dared: {},
        blindDice: {},
        accusedThisRound: {},
        usedSkills: {}, // { [userId]: { bump: true, goad: true, hunch: true, profile: true } }
        skillUsedThisTurn: false,
        lastSkillUsed: null,
        usedDice: {}, // { [userId]: [4, 6, 8] } - tracks used dice types
        goblinSetProgress: {}, // { [userId]: [4, 6, 8, 10, 20] } - full-set tracking
        goblinFinalActive: false,
        goblinFinalTargetId: null,
        goblinFinalTargetScore: null,
        goblinFinalRemaining: [], // [userId] players who still get a final turn
        goblinSuddenDeathActive: false,
        goblinSuddenDeathParticipants: [],
        goblinSuddenDeathRemaining: [],
        goblinStageIndex: 0,
        goblinStageDie: 20,
        goblinStageRemaining: [],
        goblinBoots: {}, // { [userId]: number }
        goblinHoldStage: {}, // { [userId]: die }
        gameMode: "standard",
        houseRules: { startingHeat: 10 },
        heatDC: 10,
        pendingAction: null,
        pendingBust: null,
    };
    return { ...flat, ...buildTableDataSections(flat) };
}


