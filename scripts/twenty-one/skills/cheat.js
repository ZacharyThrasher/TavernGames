/**
 * Tavern Twenty-One - Cheat Skill Module
 * V3.0
 * 
 * Cheat: Modify one of your dice secretly.
 * - Physical: Sleight of Hand OR Deception → sets Tell DC
 * - Magical: INT/WIS/CHA (spellcasting ability) → sets Residue DC
 * - V3: Adjustment is ±1, ±2, or ±3
 * - V3: Heat DC starts at 10, increases by +2 per cheat (unless Nat 20)
 * - Nat 20: Invisible cheat (DC 0, no Heat increase)
 * - Nat 1: Auto-caught + pay 1× ante
 */

import { MODULE_ID, getState, updateState, addHistoryEntry, addLogToAll, addPrivateLog } from "../../state.js"; // V5.8
import { tavernSocket } from "../../socket.js";
import { deductFromActor, getActorForUser, notifyUser } from "../utils/actors.js";
import { createChatCard } from "../../ui/chat.js";
import { emptyTableData } from "../constants.js";

/**
 * Cheat to modify one of your dice.
 * @param {object} payload - { dieIndex, adjustment, cheatType, skill }
 * @param {string} userId - The cheating player
 */
export async function cheat(payload, userId) {
    const state = getState();
    if (state.status !== "PLAYING") {
        ui.notifications.warn("Cannot cheat outside of an active round.");
        return state;
    }

    // V3.5: House cannot cheat (but GM-as-NPC can)
    const user = game.users.get(userId);
    const playerData = state.players?.[userId];
    const isHouse = user?.isGM && !playerData?.playingAsNpc;
    if (isHouse) {
        ui.notifications.warn("The house doesn't cheat... or do they?");
        return state;
    }

    // Prevent cheating in 1v1 with House (no one to detect you)
    // V3.5.2: GM-as-NPC counts as a player, only exclude GM acting as house
    const nonHousePlayers = state.turnOrder.filter(id => {
        const u = game.users.get(id);
        if (!u?.isGM) return true; // Regular player
        // GM playing as NPC counts as a player
        return state.players?.[id]?.playingAsNpc;
    });
    if (nonHousePlayers.length <= 1) {
        await notifyUser(userId, "Cheating requires at least 2 players (the house always knows).");
        return state;
    }

    let tableData = state.tableData ?? emptyTableData();
    const ante = game.settings.get(MODULE_ID, "fixedAnte");

    // V3: dieIndex + adjustment (1-3, positive or negative)
    let { dieIndex, adjustment = 1 } = payload;

    // Strict Mode: ALWAYS Physical / Sleight of Hand
    const cheatType = "physical";
    const skill = "slt";

    // Auto-select last die if missing
    const rolls = tableData.rolls[userId] ?? [];
    if (dieIndex === undefined || dieIndex === null) {
        dieIndex = rolls.length - 1;
    }

    // V3: Validate adjustment is ±1 to ±3
    const absAdj = Math.abs(adjustment);
    if (absAdj < 1 || absAdj > 3) {
        ui.notifications.warn("Cheat adjustment must be ±1, ±2, or ±3.");
        return state;
    }

    // V3: Determine cheat type and skill
    const isPhysical = cheatType === "physical";
    const skillNames = {
        // Physical skills
        slt: "Sleight of Hand",
        dec: "Deception",
        // Magical abilities
        int: "Intelligence",
        wis: "Wisdom",
        cha: "Charisma",
    };
    const skillName = skillNames[skill] ?? (isPhysical ? "Sleight of Hand" : "Intelligence");

    // Validate die index
    if (dieIndex < 0 || dieIndex >= rolls.length) {
        ui.notifications.warn("Invalid die selection.");
        return state;
    }

    const targetDie = rolls[dieIndex];
    const maxValue = targetDie.die;
    const isHoleDie = !(targetDie.public ?? true);

    // V3: Calculate new value from adjustment
    const oldValue = targetDie.result;
    let newValue = oldValue + adjustment;

    // Clamp to valid range
    if (newValue < 1) newValue = 1;
    if (newValue > maxValue) newValue = maxValue;

    // Don't allow "cheating" to the same value
    if (newValue === oldValue) {
        ui.notifications.warn("That wouldn't change the value!");
        return state;
    }

    // V3: Mark as acted (affects Fold refund)
    tableData.hasActed = { ...tableData.hasActed, [userId]: true };

    // V5: Get Personal Heat DC (Defaults to 10 if missing)
    const heatDC = tableData.playerHeat?.[userId] ?? 10;

    // Roll the check (Iron Liver: Sloppy = disadvantage)
    const actor = getActorForUser(userId);
    const isSloppy = tableData.sloppy?.[userId] ?? false;

    const roll = await new Roll(isSloppy ? "2d20kl1" : "1d20").evaluate();
    const d20Raw = roll.dice[0]?.results?.[0]?.result ?? roll.total;
    const d20Result = roll.total;

    // V3: Check for Nat 20/Nat 1
    const isNat20 = d20Raw === 20;
    const isNat1 = d20Raw === 1;

    let modifier = 0;
    if (actor) {
        if (isPhysical) {
            modifier = actor.system?.skills?.[skill]?.total ?? 0;
        } else {
            modifier = actor.system?.abilities?.[skill]?.mod ?? 0;
        }
    }
    const rollTotal = d20Result + modifier;

    // V3: Determine success (Nat 1 always fails, otherwise beat Heat DC)
    const success = !isNat1 && rollTotal >= heatDC;

    // V3: Determine if caught
    // Nat 1 = auto-caught
    // Failure = not caught yet, but adds to Heat
    const fumbled = isNat1;
    const dcType = isPhysical ? "Tell DC" : "Residue DC";

    // Whisper the skill roll to the player
    const cheatTypeLabel = isPhysical ? "Physical" : "Magical";
    let flavorText = `<em>${actor?.name ?? "You"} attempt${actor ? "s" : ""} to cheat (${cheatTypeLabel})...</em><br>`;
    flavorText += `${skillName}: ${d20Result} + ${modifier} = <strong>${rollTotal}</strong> vs Personal Heat DC ${heatDC}`;

    if (isNat20) {
        flavorText += ` <span class="tavern-result-crit-success">NAT 20! Invisible cheat!</span>`;
    } else if (isNat1) {
        flavorText += ` <span class="tavern-result-crit-fail">NAT 1! Caught + pay 1× ante!</span>`;
    } else if (!success) {
        flavorText += ` <span class="tavern-result-fail">Failed (${dcType}: ${rollTotal})</span>`;
    } else {
        flavorText += ` <span class="tavern-result-success">Success (${dcType}: ${rollTotal})</span>`;
    }

    // V5.8: Logs (Replacing Private Feedback & Chat Cards)
    if (fumbled) {
        // Public Caught Log
        await addLogToAll({
            title: "Clumsy Hands!",
            message: `<strong>${characterName}</strong> fumbled a cheat attempt!<br><em>CAUGHT and forfeited the round.</em>`,
            icon: "fa-solid fa-hand-fist",
            type: "cheat",
            cssClass: "failure"
        });
    } else {
        // Private Log for Cheater
        await addPrivateLog(userId, {
            title: success ? "Cheat Success" : "Cheat Failed",
            message: `${skillName}: <strong>${rollTotal}</strong> vs Heath DC ${heatDC}<br>${isNat20 ? "NAT 20! Invisible!" : ""}`,
            icon: "fa-solid fa-mask",
            type: "cheat",
            cssClass: success ? "success" : "failure"
        });
    }


    await addHistoryEntry({
        type: fumbled ? "cheat_caught" : "cheat",
        player: characterName,
        cheatType,
        skill: skillName,
        dc: rollTotal,
        fumbled,
        message: fumbled
            ? `${characterName} fumbled their cheat and was caught!`
            : `${characterName} attempted a ${cheatTypeLabel.toLowerCase()} cheat (${dcType}: ${rollTotal}).`,
    });

    console.log(`Tavern Twenty-One | ${userName} cheated: d${targetDie.die} ${oldValue} → ${newValue}, ${skillName}: ${rollTotal} (fumbled: ${fumbled})`);

    return updateState({ tableData: updatedTable, pot: newPot });
}
