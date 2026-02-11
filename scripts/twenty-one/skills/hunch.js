/**
 * Tavern Twenty-One - Hunch Skill
 * 
 * WIS check to predict high/low before choosing die.
 * - Success: Learn if each die will be high or low
 * - Failure: Locked into taking a Hit
 * - Nat 20: Learn exact values
 * - Nat 1: Locked into d20 Hit
 */

import { getState, updateState, addPrivateLog, addLogToAll, addHistoryEntry } from "../../state.js";
import { showPublicRoll } from "../../dice.js";
import { HUNCH_DC, HUNCH_THRESHOLDS, TIMING, getAllowedDice, emptyTableData } from "../constants.js";
import { classifyHunchPrediction } from "../rules/pure-rules.js";
import { getActorForUser, getActorName, getSafeActorName } from "../utils/actors.js";
import { notifyUser, validateSkillPrerequisites } from "../utils/game-logic.js";
import { delay } from "../utils/runtime.js";
import { announceSkillBannerToUser, announceSkillCutIn } from "../utils/skill-announcements.js";


export async function hunch(userId) {
    const state = getState();
    const tableData = state.tableData ?? emptyTableData();
    const canUseHunch = await validateSkillPrerequisites({
        state,
        tableData,
        userId,
        skillName: "Foresight",
        requireMyTurn: true,
        requireBettingPhase: true,
        disallowInGoblin: true,
        disallowHouse: true,
        disallowIfSkillUsedThisTurn: true,
        disallowIfBusted: true,
        disallowIfFolded: true,
        disallowIfHeld: true,
        oncePerMatchSkill: "hunch",
        messages: {
            outsideRound: "Cannot use Foresight outside of an active round.",
            goblinDisabled: "Foresight is disabled in Goblin Rules.",
            notYourTurn: "You can only use Foresight on your turn.",
            wrongPhase: "Foresight can only be used during the betting phase.",
            houseBlocked: "The house does not guess.",
            alreadyUsedThisTurn: "You have already used a skill this turn.",
            alreadyUsedMatch: "You can only use Foresight once per match.",
            selfCannotAct: "You can't use Foresight right now."
        }
    });
    if (!canUseHunch) return state;
    announceSkillCutIn("FORESIGHT", userId, null, "Could not show foresight cut-in");
    const userName = getActorName(userId);
    const safeUserName = getSafeActorName(userId);
    const actor = getActorForUser(userId); // Definition restored for stat access
    const wisMod = actor?.system?.abilities?.wis?.mod ?? 0;

    // Roll Wisdom check (Sloppy = disadvantage)
    const isSloppy = tableData.sloppy?.[userId] ?? false;
    const roll = await new Roll(isSloppy ? "2d20kl1" : "1d20").evaluate();
    const d20Raw = roll.dice[0]?.results?.[0]?.result ?? roll.total;
    const d20 = roll.total;
    const isNat20 = d20Raw === 20;
    const isNat1 = d20Raw === 1;
    let predictions = {};
    let exactRolls = {};

    showPublicRoll(roll, userId);
    await delay(TIMING.SKILL_DRAMATIC_PAUSE);

    const rollTotal = d20 + wisMod;
    const success = !isNat1 && rollTotal >= HUNCH_DC;
    const gameMode = state.tableData?.gameMode ?? "standard";
    const allowedDice = getAllowedDice(gameMode);

    if (isNat20) {
        // Nat 20 = Learn exact value for each die type
        predictions = {};
        exactRolls = {};
        for (const die of allowedDice) {
            const preRoll = await new Roll(`1d${die}`).evaluate();
            predictions[die] = preRoll.total;
            exactRolls[die] = preRoll.total;
        }
        // Private Log for details (replacing socket feedback AND keeping persistent record)
        await addPrivateLog(userId, {
            title: "Foresight (Nat 20)",
            message: `Exact Values: ${Object.entries(predictions).map(([d, v]) => `d${d}: <strong>${v}</strong>`).join(", ")}`,
            icon: "fa-solid fa-eye",
            type: "hunch",
            cssClass: "success"
        });

        await announceSkillBannerToUser(userId, {
            title: "Foresight - Nat 20",
            message: `Exact values: ${Object.entries(predictions).map(([d, v]) => `d${d} ${v}`).join(", ")}`,
            tone: "success",
            icon: "fa-solid fa-eye"
        }, "Could not show foresight nat20 banner");

        // Public Log for Effect
        await addLogToAll({
            title: "Foresight",
            message: `<strong>${safeUserName}</strong> gets a perfect read on the future!<br><em>They know exactly what is coming.</em>`,
            icon: "fa-solid fa-eye",
            type: "hunch",
            cssClass: "success"
        }, [], userId);

    } else if (isNat1) {
        // Nat 1 = Locked into Hit with d20
        await addPrivateLog(userId, {
            title: "Foresight (Nat 1)",
            message: "Locked into a BLIND d20 roll!",
            icon: "fa-solid fa-eye-slash",
            type: "hunch",
            cssClass: "failure"
        });

        await announceSkillBannerToUser(userId, {
            title: "Foresight Backfire",
            message: "Locked into a blind d20.",
            tone: "failure",
            icon: "fa-solid fa-eye-slash"
        }, "Could not show foresight backfire banner");

        await addLogToAll({
            title: "Foresight Backfire",
            message: `<strong>${safeUserName}</strong> spirals into doubt!<br>Locked into a <strong>Blind d20</strong>!`,
            icon: "fa-solid fa-eye-slash",
            type: "hunch",
            cssClass: "failure"
        }, [], userId);

    } else if (success) {
        // Success = Learn high/low for each die type
        predictions = {};
        exactRolls = {};
        for (const die of allowedDice) {
            const preRoll = await new Roll(`1d${die}`).evaluate();
            predictions[die] = classifyHunchPrediction(die, preRoll.total, HUNCH_THRESHOLDS);
            exactRolls[die] = preRoll.total;
        }
        await addPrivateLog(userId, {
            title: "Foresight Success",
            message: `Predictions: ${Object.entries(predictions).map(([d, v]) => `d${d}: ${v}`).join(", ")}`,
            icon: "fa-solid fa-eye",
            type: "hunch",
            cssClass: "success"
        });

        await announceSkillBannerToUser(userId, {
            title: "Foresight",
            message: `Predictions: ${Object.entries(predictions).map(([d, v]) => `d${d} ${v}`).join(", ")}`,
            tone: "success",
            icon: "fa-solid fa-eye"
        }, "Could not show foresight prediction banner");

        await addLogToAll({
            title: "Foresight",
            message: `<strong>${safeUserName}</strong> senses the flow of probability.<br><em>They have a hunch...</em>`,
            icon: "fa-solid fa-eye",
            type: "hunch",
            cssClass: "success"
        }, [], userId);

    } else {
        // Failure = Blind State
        await addPrivateLog(userId, {
            title: "Foresight Failed",
            message: "Next roll will be BLIND (Hidden).",
            icon: "fa-solid fa-eye-slash",
            type: "hunch",
            cssClass: "failure"
        });

        await announceSkillBannerToUser(userId, {
            title: "Foresight Failed",
            message: "Next roll is blind.",
            tone: "failure",
            icon: "fa-solid fa-eye-slash"
        }, "Could not show foresight failed banner");

        await addLogToAll({
            title: "Foresight Failed",
            message: `<strong>${safeUserName}'s</strong> intuition fails them.<br>Next roll is <strong>Blind</strong>!`,
            icon: "fa-solid fa-eye-slash",
            type: "hunch",
            cssClass: "failure"
        }, [], userId);
    }

    await addHistoryEntry({
        type: "hunch",
        player: userName,
        roll: rollTotal,
        dc: HUNCH_DC,
        success: success || isNat20,
        nat20: isNat20,
        nat1: isNat1,
        message: isNat20 ? `${userName} got a perfect foresight! (Nat 20)`
            : isNat1 ? `${userName}'s foresight locked them into a d20! (Nat 1)`
                : success ? `${userName} successfully used Foresight.`
                    : `${userName}'s foresight failed - locked into a Hit.`,
    });
    return updateState((current) => {
        const latestTable = current.tableData ?? emptyTableData();
        const updates = {};

        if (isNat20) {
            updates.hunchExact = { ...latestTable.hunchExact, [userId]: predictions };
            updates.hunchRolls = { ...latestTable.hunchRolls, [userId]: exactRolls };
        } else if (isNat1) {
            updates.hunchLocked = { ...latestTable.hunchLocked, [userId]: true };
            updates.hunchLockedDie = { ...latestTable.hunchLockedDie, [userId]: 20 };
        } else if (success) {
            updates.hunchPrediction = { ...latestTable.hunchPrediction, [userId]: predictions };
            updates.hunchRolls = { ...latestTable.hunchRolls, [userId]: exactRolls };
        } else {
            updates.blindNextRoll = { ...latestTable.blindNextRoll, [userId]: true };
        }

        const currentUsedSkills = latestTable.usedSkills ?? {};
        const myUsedSkills = currentUsedSkills[userId] ?? {};

        updates.skillUsedThisTurn = true;
        updates.lastSkillUsed = "hunch";
        updates.usedSkills = {
            ...currentUsedSkills,
            [userId]: { ...myUsedSkills, hunch: true }
        };
        updates.hasActed = { ...latestTable.hasActed, [userId]: true };

        return { tableData: updates };
    });
}


