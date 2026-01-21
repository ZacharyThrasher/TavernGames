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
import { HUNCH_DC, HUNCH_THRESHOLDS, VALID_DICE, emptyTableData } from "../constants.js";
import { createChatCard, addHistoryEntry } from "../../ui/chat.js";
import { playSound } from "../../sounds.js";
import { getActorForUser, getGMUserIds, notifyUser } from "../utils/actors.js";


export async function hunch(userId) {
    const state = getState();
    if (state.status !== "PLAYING") {
        ui.notifications.warn("Cannot use Hunch outside of an active round.");
        return state;
    }

    let tableData = state.tableData ?? emptyTableData();

    // Must be your turn
    if (tableData.currentPlayer !== userId) {
        await notifyUser(userId, "You can only use Hunch on your turn.");
        return state;
    }

    // Must be in betting phase
    if (tableData.phase !== "betting") {
        await notifyUser(userId, "Hunch can only be used during the betting phase.");
        return state;
    }

    // Limit: One skill per turn
    if (tableData.skillUsedThisTurn) {
        await notifyUser(userId, "You have already used a skill this turn.");
        return state;
    }

    // Can't use if busted, folded, or holding
    if (tableData.busts?.[userId] || tableData.folded?.[userId] || tableData.holds?.[userId]) {
        await notifyUser(userId, "You can't use Hunch right now.");
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

    const rollTotal = d20 + wisMod;
    const success = !isNat1 && rollTotal >= HUNCH_DC;

    const gmIds = getGMUserIds();

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

        await ChatMessage.create({
            content: `<div class="tavern-skill-result success">
        <strong>Perfect Intuition!</strong><br>
        Your senses sharpen completely. You know exactly what each die will show:<br>
        <em>d4: ${predictions[4]}, d6: ${predictions[6]}, d8: ${predictions[8]}, 
        d10: ${predictions[10]}, d20: ${predictions[20]}</em>
      </div>`,
            flavor: `${userName} rolled ${d20} + ${wisMod} = ${rollTotal} (DC ${HUNCH_DC}) — <strong style="color: gold;">NAT 20!</strong>`,
            whisper: [userId, ...gmIds],
            blind: true, // V3.5.2: Hide from GMs not in whisper list
            rolls: [roll],
        });

        await createChatCard({
            title: "The Hunch",
            subtitle: `${userName}'s eyes close...`,
            message: `A perfect read! They know exactly what's coming.`,
            icon: "fa-solid fa-eye",
        });
    } else if (isNat1) {
        // Nat 1 = Locked into Hit with d20
        tableData.hunchLocked = { ...tableData.hunchLocked, [userId]: true };
        tableData.hunchLockedDie = { ...tableData.hunchLockedDie, [userId]: 20 };

        await ChatMessage.create({
            content: `<div class="tavern-skill-result failure">
        <strong>Tunnel Vision!</strong><br>
        Your instincts betray you. You're compelled to take a risky gamble!
        <br><em>You MUST roll a d20 before your turn ends.</em>
      </div>`,
            flavor: `${userName} rolled ${d20} + ${wisMod} = ${rollTotal} — <strong style="color: #ff4444;">NAT 1!</strong>`,
            whisper: [userId, ...gmIds],
            blind: true, // V3.5.2: Hide from GMs not in whisper list
            rolls: [roll],
        });

        await createChatCard({
            title: "The Hunch",
            subtitle: `${userName} spirals into doubt`,
            message: `Terrible intuition! Locked into rolling a <strong>d20</strong>!`,
            icon: "fa-solid fa-dice-d20",
        });
        await playSound("lose");
    } else if (success) {
        // Success = Learn high/low for each die type (and store exact values for enforcement)
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

        await ChatMessage.create({
            content: `<div class="tavern-skill-result success">
        <strong>The Hunch</strong><br>
        A feeling washes over you...<br>
        <em>d4: ${predictions[4]}, d6: ${predictions[6]}, d8: ${predictions[8]}, 
        d10: ${predictions[10]}, d20: ${predictions[20]}</em>
      </div>`,
            flavor: `${userName} rolled ${d20} + ${wisMod} = ${rollTotal} vs DC ${HUNCH_DC} — Success!`,
            whisper: [userId, ...gmIds],
            blind: true, // V3.5.2: Hide from GMs not in whisper list
            rolls: [roll],
        });

        await createChatCard({
            title: "The Hunch",
            subtitle: `${userName} gets a feeling...`,
            message: `Something tells them what's coming. Choose wisely!`,
            icon: "fa-solid fa-eye",
        });
    } else {
        // Failure = Locked into a Hit (any die)
        tableData.hunchLocked = { ...tableData.hunchLocked, [userId]: true };

        await ChatMessage.create({
            content: `<div class="tavern-skill-result failure">
        <strong>Bad Read</strong><br>
        You reach for intuition but grasp only doubt.
        <br><em>You MUST take a Hit before your turn ends.</em>
      </div>`,
            flavor: `${userName} rolled ${d20} + ${wisMod} = ${rollTotal} vs DC ${HUNCH_DC} — Failed!`,
            whisper: [userId, ...gmIds],
            blind: true, // V3.5.2: Hide from GMs not in whisper list
            rolls: [roll],
        });

        await createChatCard({
            title: "The Hunch",
            subtitle: `${userName}'s intuition fails`,
            message: `Committed to the gamble! Must Hit this turn.`,
            icon: "fa-solid fa-lock",
        });
        await playSound("lose");
    }

    await addHistoryEntry({
        type: "hunch",
        player: userName,
        roll: rollTotal,
        dc: HUNCH_DC,
        success: success || isNat20,
        nat20: isNat20,
        nat1: isNat1,
        message: isNat20 ? `${userName} got a perfect hunch! (Nat 20)`
            : isNat1 ? `${userName}'s hunch locked them into a d20! (Nat 1)`
                : success ? `${userName} successfully used Hunch.`
                    : `${userName}'s hunch failed - locked into a Hit.`,
    });

    tableData.skillUsedThisTurn = true;

    return updateState({ tableData });
}
