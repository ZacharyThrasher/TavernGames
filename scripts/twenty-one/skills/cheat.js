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

import { MODULE_ID, getState, updateState, addHistoryEntry } from "../../state.js";
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
    const { dieIndex, adjustment = 1, cheatType = "physical", skill = "slt" } = payload;

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
    const rolls = tableData.rolls[userId] ?? [];
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

    // V3: Get current Heat DC and roll against it
    const heatDC = tableData.heatDC ?? 10;

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
    flavorText += `${skillName}: ${d20Result} + ${modifier} = <strong>${rollTotal}</strong> vs Heat DC ${heatDC}`;

    if (isNat20) {
        flavorText += ` <span style='color: gold; font-weight: bold;'>NAT 20! Invisible cheat!</span>`;
    } else if (isNat1) {
        flavorText += ` <span style='color: red; font-weight: bold;'>NAT 1! Caught + pay 1× ante!</span>`;
    } else if (!success) {
        flavorText += ` <span style='color: orange;'>Failed (${dcType}: ${rollTotal})</span>`;
    } else {
        flavorText += ` <span style='color: #888;'>Success (${dcType}: ${rollTotal})</span>`;
    }

    // V4.4: Send proper feedback to the cheating player via whispered chat
    const userName = game.users.get(userId)?.name ?? "Unknown";
    const characterName = actor?.name ?? userName;

    const cheatResultCard = `<div class="tavern-cheat-result ${success ? 'tavern-cheat-success' : 'tavern-cheat-fail'}">
      <strong>${cheatTypeLabel} Cheat</strong><br>
      <em>${skillName}:</em> ${d20Raw}${isSloppy ? ' (Disadvantage)' : ''} + ${modifier} = <strong>${rollTotal}</strong> vs Heat DC ${heatDC}<br>
      ${isNat20 ? '<span style="color: gold; font-weight: bold;">★ NAT 20 - INVISIBLE CHEAT! ★</span>' : ''}
      ${isNat1 ? '<span style="color: red; font-weight: bold;">✖ NAT 1 - FUMBLED & CAUGHT!</span>' : ''}
      ${!isNat20 && !isNat1 && success ? '<span style="color: #4ade80;">✓ Success! Cheat undetected.</span>' : ''}
      ${!isNat20 && !isNat1 && !success ? '<span style="color: #fbbf24;">⚠ Failed Heat check - Heat increased.</span>' : ''}
      <br><small>d${targetDie.die}: ${oldValue} → ${newValue}</small>
    </div>`;

    await ChatMessage.create({
        content: cheatResultCard,
        whisper: [userId],
        speaker: { alias: "Tavern Twenty-One" },
    });

    // Update the die value
    const updatedRolls = { ...tableData.rolls };
    updatedRolls[userId] = [...rolls];
    updatedRolls[userId][dieIndex] = { ...targetDie, result: newValue };

    // Update total
    const updatedTotals = { ...tableData.totals };
    updatedTotals[userId] = (updatedTotals[userId] ?? 0) - oldValue + newValue;

    // Update visible total if it was a public die
    const updatedVisibleTotals = { ...tableData.visibleTotals };
    if (targetDie.public) {
        updatedVisibleTotals[userId] = (updatedVisibleTotals[userId] ?? 0) - oldValue + newValue;
    }

    // V3: Update Heat DC (increases by 2 per cheat, unless Nat 20)
    let newHeatDC = heatDC;
    if (!isNat20) {
        newHeatDC = heatDC + 2;
    }
    const newCheatsThisRound = (tableData.cheatsThisRound ?? 0) + 1;

    // Check for bust after cheating
    const updatedBusts = { ...tableData.busts };
    const updatedCaught = { ...tableData.caught };
    let newPot = state.pot;

    if (fumbled) {
        // V3: Nat 1 = auto-caught + pay 1× ante
        updatedCaught[userId] = true;
        updatedBusts[userId] = true;
        await deductFromActor(userId, ante);
        newPot = state.pot + ante;
    }

    if (updatedTotals[userId] > 21) {
        updatedBusts[userId] = true;
    } else if (updatedTotals[userId] <= 21 && tableData.busts[userId]) {
        // Un-bust if they cheated down from a bust
        updatedBusts[userId] = false;
    }

    // V3: Track cheat with new structure (Nat 20 = no DC recorded, invisible)
    const cheaters = { ...tableData.cheaters };
    if (!cheaters[userId]) {
        cheaters[userId] = { cheats: [] };
    }
    // Also maintain backwards-compat deceptionRolls for accusation logic
    if (!cheaters[userId].deceptionRolls) {
        cheaters[userId].deceptionRolls = [];
    }

    const cheatRecord = {
        dieIndex,
        oldValue,
        newValue,
        adjustment,
        type: cheatType, // "physical" or "magical"
        skill,
        dc: isNat20 ? 0 : rollTotal, // Nat 20 = invisible (DC 0)
        fumbled,
        isHoleDie,
        isNat20,
        isNat1,
    };

    cheaters[userId].cheats.push(cheatRecord);
    // Backwards compat
    cheaters[userId].deceptionRolls.push({
        dieIndex,
        oldValue,
        newValue,
        deception: isNat20 ? 0 : rollTotal,
        isNat1,
        isNat20,
    });

    const updatedTable = {
        ...tableData,
        rolls: updatedRolls,
        totals: updatedTotals,
        visibleTotals: updatedVisibleTotals,
        busts: updatedBusts,
        caught: updatedCaught,
        cheaters,
        heatDC: newHeatDC,
        cheatsThisRound: newCheatsThisRound,
    };

    // If fumbled, announce it publicly
    if (fumbled) {
        await createChatCard({
            title: "Clumsy Hands!",
            subtitle: `${characterName} fumbles`,
            message: `${characterName} tried to cheat but fumbled badly - everyone saw it!<br><em>They are caught and forfeit the round.</em>`,
            icon: "fa-solid fa-hand-fist",
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
