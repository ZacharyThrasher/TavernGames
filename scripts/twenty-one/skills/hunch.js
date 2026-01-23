/**
 * Tavern Twenty-One - Hunch Skill
 * V3.0
 * 
 * WIS check to predict high/low before choosing die.
 * - Success: Learn if each die will be high or low
 * - Failure: Locked into taking a Hit
 * - Nat 20: Learn exact values
 * - Nat 1: Locked into d20 Hit
 */

import { MODULE_ID, getState, updateState, addPrivateLog, addLogToAll } from "../../state.js"; // V5.8: Import addPrivateLog
import { tavernSocket } from "../../socket.js";
import { showPublicRoll } from "../../dice.js";
import { HUNCH_DC, HUNCH_THRESHOLDS, VALID_DICE, emptyTableData } from "../constants.js";
// import { createChatCard, addHistoryEntry } from "../../ui/chat.js"; // Removed
import { addHistoryEntry } from "../../state.js"; // History moved to state long ago? CHECK IMPORTS. 
// state.js DOES export addHistoryEntry.
// The file was importing it from `ui/chat.js` which was likely a re-export or legacy location?
// Let's standardise to state.js imports.

import { getActorForUser, notifyUser, getActorName } from "../utils/actors.js"; // V5.9
import { finishTurn } from "../phases/turn.js";


export async function hunch(userId) {
    const state = getState();
    if (state.status !== "PLAYING") {
        ui.notifications.warn("Cannot use Foresight outside of an active round.");
        return state;
    }

    let tableData = state.tableData ?? emptyTableData();

    // Must be your turn
    if (tableData.currentPlayer !== userId) {
        await notifyUser(userId, "You can only use Foresight on your turn.");
        return state;
    }

    // Must be in betting phase
    if (tableData.phase !== "betting") {
        await notifyUser(userId, "Foresight can only be used during the betting phase.");
        return state;
    }

    // Limit: One skill per turn
    if (tableData.skillUsedThisTurn) {
        await notifyUser(userId, "You have already used a skill this turn.");
        return state;
    }

    // V4.8.40: Once per round/match
    if (tableData.usedSkills?.[userId]?.hunch) {
        await notifyUser(userId, "You can only use Foresight once per match.");
        return state;
    }

    // Can't use if busted, folded, or holding
    if (tableData.busts?.[userId] || tableData.folded?.[userId] || tableData.holds?.[userId]) {
        await notifyUser(userId, "You can't use Foresight right now.");
        return state;
    }

    // V3.5: House cannot use skills (but GM-as-NPC can)
    const user = game.users.get(userId);
    const playerData = state.players?.[userId];
    const isHouse = user?.isGM && !playerData?.playingAsNpc;
    if (isHouse) {
        ui.notifications.warn("The house does not guess.");
        return state;
    }

    // Mark as acted
    tableData.hasActed = { ...tableData.hasActed, [userId]: true };

    // V4.7.1: Visual Cut-In
    tavernSocket.executeForEveryone("showSkillCutIn", "FORESIGHT", userId);

    // V4.7.7: Foresight Pause (Moved down)
    // await new Promise(resolve => setTimeout(resolve, 3000));

    // V5.9: Use getActorName
    const userName = getActorName(userId);
    const actor = getActorForUser(userId); // Definition restored for stat access
    const wisMod = actor?.system?.abilities?.wis?.mod ?? 0;

    // Roll Wisdom check (Sloppy = disadvantage)
    const isSloppy = tableData.sloppy?.[userId] ?? false;
    const roll = await new Roll(isSloppy ? "2d20kl1" : "1d20").evaluate();
    const d20Raw = roll.dice[0]?.results?.[0]?.result ?? roll.total;
    const d20 = roll.total;
    const isNat20 = d20Raw === 20;
    const isNat1 = d20Raw === 1;

    // V4.7.8: Dice So Nice & Sync Pause
    showPublicRoll(roll, userId);
    await new Promise(resolve => setTimeout(resolve, 3000));

    const rollTotal = d20 + wisMod;
    const success = !isNat1 && rollTotal >= HUNCH_DC;

    // Log the attempt Publicly?
    // "X used Foresight to predict the dice..."
    // Since we are replacing chat cards, we probably want a public log that they USED the skill.
    // The previous chat card was "Foresight: A perfect read!" etc. which revealed success/fail publicly?
    // Old Chat Cards:
    // "Foresight: A perfect read!" (Public)
    // "Foresight: Something tells them..." (Public)
    // "Foresight: Terrible intuition! Locked!" (Public)
    // So Success/Fail WAS public information. The *data* was private.

    // We will replicate this with addLogToAll.

    if (isNat20) {
        // Nat 20 = Learn exact value for each die type
        const predictions = {};
        const exactRolls = {};
        for (const die of VALID_DICE) {
            const preRoll = await new Roll(`1d${die}`).evaluate();
            predictions[die] = preRoll.total;
            exactRolls[die] = preRoll.total;
        }
        tableData.hunchExact = { ...tableData.hunchExact, [userId]: predictions };
        tableData.hunchRolls = { ...tableData.hunchRolls, [userId]: exactRolls };

        // Private Log for details (replacing socket feedback AND keeping persistent record)
        await addPrivateLog(userId, {
            title: "Foresight (Nat 20)",
            message: `Exact Values: ${Object.entries(predictions).map(([d, v]) => `d${d}: <strong>${v}</strong>`).join(", ")}`,
            icon: "fa-solid fa-eye",
            type: "hunch",
            cssClass: "success"
        });

        // Public Log for Effect
        await addLogToAll({
            title: "Foresight",
            message: `<strong>${userName}</strong> gets a perfect read on the future!<br><em>They know exactly what is coming.</em>`,
            icon: "fa-solid fa-eye",
            type: "hunch",
            cssClass: "success"
        }, [], userId);

    } else if (isNat1) {
        // Nat 1 = Locked into Hit with d20
        tableData.hunchLocked = { ...tableData.hunchLocked, [userId]: true };
        tableData.hunchLockedDie = { ...tableData.hunchLockedDie, [userId]: 20 };

        await addPrivateLog(userId, {
            title: "Foresight (Nat 1)",
            message: "Locked into a BLIND d20 roll!",
            icon: "fa-solid fa-eye-slash",
            type: "hunch",
            cssClass: "failure"
        });

        await addLogToAll({
            title: "Foresight Backfire",
            message: `<strong>${userName}</strong> spirals into doubt!<br>Locked into a <strong>Blind d20</strong>!`,
            icon: "fa-solid fa-eye-slash",
            type: "hunch",
            cssClass: "failure"
        }, [], userId);

    } else if (success) {
        // Success = Learn high/low for each die type
        const predictions = {};
        const exactRolls = {};
        for (const die of VALID_DICE) {
            const preRoll = await new Roll(`1d${die}`).evaluate();
            const threshold = HUNCH_THRESHOLDS[die];
            predictions[die] = preRoll.total > threshold ? "HIGH" : "LOW";
            exactRolls[die] = preRoll.total;
        }
        tableData.hunchPrediction = { ...tableData.hunchPrediction, [userId]: predictions };
        tableData.hunchRolls = { ...tableData.hunchRolls, [userId]: exactRolls };

        await addPrivateLog(userId, {
            title: "Foresight Success",
            message: `Predictions: ${Object.entries(predictions).map(([d, v]) => `d${d}: ${v}`).join(", ")}`,
            icon: "fa-solid fa-eye",
            type: "hunch",
            cssClass: "success"
        });

        await addLogToAll({
            title: "Foresight",
            message: `<strong>${userName}</strong> senses the flow of probability.<br><em>They have a hunch...</em>`,
            icon: "fa-solid fa-eye",
            type: "hunch",
            cssClass: "success"
        }, [], userId);

    } else {
        // Failure = Blind State
        const isLocked = isNat1; // Redundant but checked above logic flow separation
        // Wait, logic above handles Nat1 separately. This block is ONLY !Nat1 && !Success.
        // So just normal failure.

        tableData.blindNextRoll = { ...tableData.blindNextRoll, [userId]: true };

        await addPrivateLog(userId, {
            title: "Foresight Failed",
            message: "Next roll will be BLIND (Hidden).",
            icon: "fa-solid fa-eye-slash",
            type: "hunch",
            cssClass: "failure"
        });

        await addLogToAll({
            title: "Foresight Failed",
            message: `<strong>${userName}'s</strong> intuition fails them.<br>Next roll is <strong>Blind</strong>!`,
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



    tableData.skillUsedThisTurn = true;

    // V4.8.40: Mark usage
    const usedSkills = { ...tableData.usedSkills };
    if (!usedSkills[userId]) usedSkills[userId] = {};
    usedSkills[userId] = { ...usedSkills[userId], hunch: true };
    tableData.usedSkills = usedSkills;

    await updateState({ tableData });



    return getState();
}
