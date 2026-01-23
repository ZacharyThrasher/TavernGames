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

import { MODULE_ID, getState, updateState } from "../../state.js";
import { tavernSocket } from "../../socket.js";
import { showPublicRoll } from "../../dice.js";
import { HUNCH_DC, HUNCH_THRESHOLDS, VALID_DICE, emptyTableData } from "../constants.js";
import { createChatCard, addHistoryEntry } from "../../ui/chat.js";

import { getActorForUser, notifyUser } from "../utils/actors.js";
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

    const actor = getActorForUser(userId);
    const userName = actor?.name ?? game.users.get(userId)?.name ?? "Unknown";
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

        const feedbackContent = `<div class="tavern-skill-result success">
        <strong>Perfect Foresight!</strong><br>
        Your senses sharpen completely. You know exactly what each die will show:<br>
        <em>d4: ${predictions[4]}, d6: ${predictions[6]}, d8: ${predictions[8]}, 
        d10: ${predictions[10]}, d20: ${predictions[20]}</em>
      </div>`;

        // V4.9: Private Feedback (Hidden from GM)
        await tavernSocket.executeForUsers("showPrivateFeedback", [userId], userId, "Foresight Result", feedbackContent);

        await createChatCard({
            title: "Foresight",
            subtitle: `${userName}'s eyes close...`,
            message: `A perfect read! They know exactly what's coming.`,
            icon: "fa-solid fa-eye",
        });
    } else if (isNat1) {
        // Nat 1 = Locked into Hit with d20
        tableData.hunchLocked = { ...tableData.hunchLocked, [userId]: true };
        tableData.hunchLockedDie = { ...tableData.hunchLockedDie, [userId]: 20 };

        const feedbackContent = `<div class="tavern-skill-result failure">
        <strong>Tunnel Vision!</strong><br>
        Your instincts betray you. You're compelled to take a risky gamble!
        <br><em>You MUST roll a d20 before your turn ends.</em>
      </div>`;

        // V4.9: Private Feedback (Hidden from GM)
        await tavernSocket.executeForUsers("showPrivateFeedback", [userId], userId, "Foresight Result", feedbackContent);

        await createChatCard({
            title: "Foresight",
            subtitle: `${userName} spirals into doubt`,
            message: `Terrible intuition! Locked into rolling a <strong>d20</strong>!`,
            icon: "fa-solid fa-dice-d20",
        });
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

        const feedbackContent = `<div class="tavern-skill-result success">
        <strong>Foresight</strong><br>
        A feeling washes over you...<br>
        <em>d4: ${predictions[4]}, d6: ${predictions[6]}, d8: ${predictions[8]}, 
        d10: ${predictions[10]}, d20: ${predictions[20]}</em>
      </div>`;

        // V4.9: Private Feedback (Hidden from GM)
        await tavernSocket.executeForUsers("showPrivateFeedback", [userId], userId, "Foresight Result", feedbackContent);

        await createChatCard({
            title: "Foresight",
            subtitle: `${userName} gets a feeling...`,
            message: `Something tells them what's coming. Choose wisely!`,
            icon: "fa-solid fa-eye",
        });
    } else {
        // V5.7: Failure = Enters "Blind State"
        // Player must choose their own die (paying costs), but result is hidden
        // Nat 1 = Locked into d20 (also blind)

        const isLocked = isNat1;

        // Update state to mark next roll as blind
        tableData.blindNextRoll = { ...tableData.blindNextRoll, [userId]: true };

        if (isLocked) {
            tableData.hunchLocked = { ...tableData.hunchLocked, [userId]: true };
            tableData.hunchLockedDie = { ...tableData.hunchLockedDie, [userId]: 20 };
        }

        const feedbackContent = `<div class="tavern-skill-result failure">
        <strong>${isLocked ? 'Tunnel Vision (Nat 1)' : 'Bad Read'}</strong><br>
        Your instincts fail you. The fog of probability descends.<br>
        <em>Your next roll will be BLIND (Hidden).${isLocked ? ' And you are locked into a d20!' : ''}</em>
        </div>`;

        // V4.9: Private Feedback
        await tavernSocket.executeForUsers("showPrivateFeedback", [userId], userId, "Foresight Failed", feedbackContent);

        await createChatCard({
            title: "Foresight",
            subtitle: `${userName}'s intuition fails`,
            message: isLocked
                ? `Terrible read! They are <strong>Locked into a Blind d20</strong>!`
                : `The future is cloudy. Their next roll will be <strong>Blind</strong>!`,
            icon: "fa-solid fa-eye-slash",
        });
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
