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

        await ChatMessage.create({
            content: `<div class="tavern-skill-result success">
        <strong>Perfect Foresight!</strong><br>
        Your senses sharpen completely. You know exactly what each die will show:<br>
        <em>d4: ${predictions[4]}, d6: ${predictions[6]}, d8: ${predictions[8]}, 
        d10: ${predictions[10]}, d20: ${predictions[20]}</em>
      </div>`,
            flavor: `${userName} rolled ${d20} + ${wisMod} = ${rollTotal} (DC ${HUNCH_DC}) — <strong style="color: gold;">NAT 20!</strong>`,
            whisper: [userId],
            blind: true, // V3.5.2: Hide from GMs not in whisper list
            rolls: [roll],
        });

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

        await ChatMessage.create({
            content: `<div class="tavern-skill-result failure">
        <strong>Tunnel Vision!</strong><br>
        Your instincts betray you. You're compelled to take a risky gamble!
        <br><em>You MUST roll a d20 before your turn ends.</em>
      </div>`,
            flavor: `${userName} rolled ${d20} + ${wisMod} = ${rollTotal} — <strong style="color: #ff4444;">NAT 1!</strong>`,
            whisper: [userId],
            blind: true, // V3.5.2: Hide from GMs not in whisper list
            rolls: [roll],
        });

        await createChatCard({
            title: "Foresight",
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
        <strong>Foresight</strong><br>
        A feeling washes over you...<br>
        <em>d4: ${predictions[4]}, d6: ${predictions[6]}, d8: ${predictions[8]}, 
        d10: ${predictions[10]}, d20: ${predictions[20]}</em>
      </div>`,
            flavor: `${userName} rolled ${d20} + ${wisMod} = ${rollTotal} vs DC ${HUNCH_DC} — Success!`,
            whisper: [userId],
            blind: true, // V3.5.2: Hide from GMs not in whisper list
            rolls: [roll],
        });

        await createChatCard({
            title: "Foresight",
            subtitle: `${userName} gets a feeling...`,
            message: `Something tells them what's coming. Choose wisely!`,
            icon: "fa-solid fa-eye",
        });
    } else {
        // V4: Failure = Forced "Blind Hit" - roll a d4 (balance: small die for punishment)
        // V4.6.1: Fixed to d4 instead of random die for balance reasons
        const blindDieType = 4;
        const blindRoll = await new Roll(`1d${blindDieType}`).evaluate();
        const blindValue = blindRoll.total;

        // Update totals (internally tracked, but not shown to player)
        const currentTotal = tableData.totals?.[userId] ?? 0;
        const newTotal = currentTotal + blindValue;
        const updatedTotals = { ...tableData.totals, [userId]: newTotal };

        // Track blind dice for reveal phase
        const currentRolls = tableData.rolls?.[userId] ?? [];
        const currentBlindDice = tableData.blindDice?.[userId] ?? [];

        // V4.6.1: Check if bust BEFORE creating the roll entry
        const isBust = newTotal > 21;

        // Create the die entry - if bust, NOT blind; if not bust, IS blind
        const newDie = {
            die: blindDieType,
            result: blindValue,
            public: true, // It's visible, but the VALUE may be hidden
            blind: !isBust,  // V4.6.1: If bust, reveal immediately; otherwise hide
        };
        const updatedRolls = { ...tableData.rolls, [userId]: [...currentRolls, newDie] };

        // Only track as blind dice if NOT busting
        const updatedBlindDice = isBust
            ? tableData.blindDice
            : { ...tableData.blindDice, [userId]: [...currentBlindDice, currentRolls.length] };

        // Update busts
        const updatedBusts = { ...tableData.busts };
        if (isBust) {
            updatedBusts[userId] = true;
        }

        // Update tableData now
        tableData = {
            ...tableData,
            rolls: updatedRolls,
            totals: updatedTotals,
            blindDice: updatedBlindDice,
            busts: updatedBusts,
        };

        // V4.6: If blind die causes bust, reveal it immediately and trigger bust fanfare
        if (isBust) {
            await ChatMessage.create({
                content: `<div class="tavern-skill-result failure">
            <strong>Bad Read - BUST!</strong><br>
            Your instincts betray you - you rolled a <strong>d${blindDieType}: ${blindValue}</strong>!<br>
            <em>Total: ${newTotal} - BUST!</em>
          </div>`,
                flavor: `${userName} rolled ${d20} + ${wisMod} = ${rollTotal} vs DC ${HUNCH_DC} — Failed!`,
                whisper: [userId],
                rolls: [roll],
            });

            await createChatCard({
                title: "Foresight",
                subtitle: `${userName}'s intuition fails`,
                message: `A <strong>Blind Die</strong> reveals their doom! d${blindDieType}: ${blindValue} - BUST!`,
                icon: "fa-solid fa-skull",
            });

            // Trigger bust fanfare for everyone
            try {
                // tavernSocket is now imported statically
                await tavernSocket.executeForEveryone("showBustFanfare", userId);
            } catch (e) { console.warn("Could not show bust fanfare:", e); }
        } else {
            await ChatMessage.create({
                content: `<div class="tavern-skill-result failure">
        <strong>Bad Read</strong><br>
        Your instincts betray you - you commit to a blind gamble!
        <br><em>A d${blindDieType} has been rolled... but you can't see the result!</em>
      </div>`,
                flavor: `${userName} rolled ${d20} + ${wisMod} = ${rollTotal} vs DC ${HUNCH_DC} — Failed!`,
                whisper: [userId],
                blind: true,
                rolls: [roll],
            });

            await createChatCard({
                title: "Foresight",
                subtitle: `${userName}'s intuition fails`,
                message: `Committed to a <strong>Blind Die</strong>! A d${blindDieType} was rolled but the result is hidden...`,
                icon: "fa-solid fa-question",
            });
        }
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

    return updateState({ tableData });
}
