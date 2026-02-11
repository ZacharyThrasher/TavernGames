/**
 * Tavern Twenty-One - Cheat Skill Module
 * 
 * Cheat: Modify one of your dice secretly.
 * - Physical: Sleight of Hand OR Deception → sets Tell DC
 * - Magical: INT/WIS/CHA (spellcasting ability) → sets Residue DC
 * - Nat 20: Invisible cheat (DC 0, no Heat increase)
 * - Nat 1: Auto-caught + pay 1× ante
 */

import { getState, updateState, addHistoryEntry, addLogToAll, addPrivateLog } from "../../state.js";
import { deductFromActor } from "../../wallet.js";
import { getActorForUser, getActorName, getSafeActorName } from "../utils/actors.js";
import { notifyUser, validateSkillPrerequisites } from "../utils/game-logic.js";
import { tavernSocket } from "../../socket.js";
import { MODULE_ID, emptyTableData } from "../constants.js";
import { withWarning } from "../utils/runtime.js";

/**
 * Cheat to modify one of your dice.
 * @param {object} payload - { dieIndex, adjustment, cheatType, skill }
 * @param {string} userId - The cheating player
 */
export async function cheat(payload, userId) {
    const state = getState();
    const tableData = state.tableData ?? emptyTableData();
    const canUseCheat = await validateSkillPrerequisites({
        state,
        tableData,
        userId,
        skillName: "Cheat",
        requireMyTurn: true,
        requireBettingPhase: true,
        disallowInGoblin: true,
        disallowHouse: true,
        disallowIfSkillUsedThisTurn: false,
        disallowIfBusted: true,
        disallowIfFolded: true,
        disallowIfHeld: true,
        messages: {
            outsideRound: "Cannot cheat outside of an active round.",
            goblinDisabled: "Cheating is disabled in Goblin Rules.",
            houseBlocked: "The house doesn't cheat... or do they?",
            wrongPhase: "Cheat can only be used during the betting phase.",
            notYourTurn: "You can only Cheat on your turn.",
            selfCannotAct: "You can't cheat right now."
        }
    });
    if (!canUseCheat) return state;

    // Prevent cheating in 1v1 with House (no one to detect you)
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

    const ante = game.settings.get(MODULE_ID, "fixedAnte");
    let { dieIndex, adjustment = 1 } = payload ?? {};

    // Strict Mode: ALWAYS Physical / Sleight of Hand
    const cheatType = "physical";
    const skill = "slt";

    // Auto-select last die if missing
    const rolls = tableData.rolls[userId] ?? [];
    if (dieIndex === undefined || dieIndex === null) {
        dieIndex = rolls.length - 1;
    }
    const absAdj = Math.abs(adjustment);
    if (absAdj < 1 || absAdj > 3) {
        await notifyUser(userId, "Cheat adjustment must be ±1, ±2, or ±3.");
        return state;
    }
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
        await notifyUser(userId, "Invalid die selection.");
        return state;
    }

    const targetDie = rolls[dieIndex];
    if (targetDie?.blind) {
        await notifyUser(userId, "You cannot cheat a blind die.");
        return state;
    }
    const maxValue = targetDie.die;
    const isHoleDie = !(targetDie.public ?? true);
    const oldValue = targetDie.result;
    let newValue = oldValue + adjustment;

    // Clamp to valid range
    if (newValue < 1) newValue = 1;
    if (newValue > maxValue) newValue = maxValue;

    // Don't allow "cheating" to the same value
    if (newValue === oldValue) {
        await notifyUser(userId, "That wouldn't change the value!");
        return state;
    }
    const updatedHasActed = { ...tableData.hasActed, [userId]: true };
    const heatDC = tableData.playerHeat?.[userId] ?? 10;

    // Roll the check (Iron Liver: Sloppy = disadvantage)
    const actor = getActorForUser(userId);
    const isSloppy = tableData.sloppy?.[userId] ?? false;

    const roll = await new Roll(isSloppy ? "2d20kl1" : "1d20").evaluate();
    const d20Raw = roll.dice[0]?.results?.[0]?.result ?? roll.total;
    const d20Result = roll.total;
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
    const success = isNat20 || (!isNat1 && rollTotal >= heatDC);
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
    if (fumbled) {
        // Public Caught Log
        await addLogToAll({
            title: "Clumsy Hands!",
            message: `<strong>${getSafeActorName(userId)}</strong> fumbled a cheat attempt!<br><em>CAUGHT and forfeited the round.</em>`,
            icon: "fa-solid fa-hand-fist",
            type: "cheat",
            cssClass: "failure"
        }, [], userId);
    } else {
        // Private Log for Cheater
        await addPrivateLog(userId, {
            title: success ? "Cheat Success" : "Cheat Failed",
            message: `${skillName}: <strong>${rollTotal}</strong> vs Heat DC ${heatDC}<br>${isNat20 ? "NAT 20! Invisible!" : ""}`,
            icon: "fa-solid fa-mask",
            type: "cheat",
            cssClass: success ? "success" : "failure"
        });
    }

    // Private toast-like banner for cheat result (outside logs)
    await withWarning("Could not show cheat result banner", () => tavernSocket.executeAsUser("showCheatResult", userId, success));


    const userName = getActorName(userId);

    await addHistoryEntry({
        type: fumbled ? "cheat_caught" : "cheat",
        player: userName,
        cheatType,
        skill: skillName,
        dc: rollTotal,
        fumbled,
        message: fumbled
            ? `${userName} fumbled their cheat and was caught!`
            : `${userName} attempted a ${cheatTypeLabel.toLowerCase()} cheat (${dcType}: ${rollTotal}).`,
    });

    // Apply the cheat to state (only on success)
    const playerRolls = tableData.rolls?.[userId] ?? [];
    const updatedRolls = [...playerRolls];
    const didApply = success && !fumbled;
    const appliedValue = didApply ? newValue : oldValue;
    updatedRolls[dieIndex] = { ...targetDie, result: appliedValue };

    const rollDelta = appliedValue - oldValue;
    const totals = { ...tableData.totals };
    const visibleTotals = { ...tableData.visibleTotals };
    const gameMode = tableData.gameMode ?? "standard";

        if (gameMode === "goblin") {
            let total = 0;
            let visibleTotal = 0;
            for (const rollEntry of updatedRolls) {
                const isCoin = rollEntry.die === 2;
                const isPublic = rollEntry.public ?? true;
                if (isCoin) {
                    if (rollEntry.result === 2) {
                        const coinValue = rollEntry.coinValue ?? 2;
                        total += coinValue;
                        if (isPublic) visibleTotal += coinValue;
                    } else if (rollEntry.result === 1) {
                        total = 0;
                        if (isPublic) visibleTotal = 0;
                        break;
                    }
                } else {
                    total += rollEntry.result;
                    if (isPublic) visibleTotal += rollEntry.result;
                }
            }
            totals[userId] = total;
        visibleTotals[userId] = visibleTotal;
    } else {
        totals[userId] = (tableData.totals?.[userId] ?? 0) + rollDelta;
        if (targetDie.public ?? true) {
            visibleTotals[userId] = (visibleTotals[userId] ?? 0) + rollDelta;
        }
    }

    const cheaters = { ...tableData.cheaters };
    const existingCheater = cheaters[userId] ?? {};
    const existingCheats = existingCheater.cheats ?? existingCheater.deceptionRolls ?? [];
    const cheatRecord = {
        dieIndex,
        die: targetDie.die,
        oldValue,
        newValue: appliedValue,
        proposedValue: newValue,
        adjustment,
        skill: skillName,
        roll: rollTotal,
        success,
        fumbled,
        invisible: isNat20,
        changed: didApply
    };
    cheaters[userId] = {
        ...existingCheater,
        cheats: [...existingCheats, cheatRecord]
    };

    const playerHeat = { ...tableData.playerHeat };
    if (!isNat20) {
        const currentHeat = playerHeat[userId] ?? heatDC;
        playerHeat[userId] = currentHeat + 2;
    }

    const caught = { ...tableData.caught };
    const busts = { ...tableData.busts };
    let newPot = state.pot;
    if (fumbled) {
        caught[userId] = true;
        const paid = await deductFromActor(userId, ante);
        if (paid) newPot += ante;
    }

    if (gameMode === "goblin") {
        const anyBust = updatedRolls.some(r => r.result === 1);
        if (anyBust) busts[userId] = true;
        else delete busts[userId];
    }

    const pendingBust = gameMode === "goblin"
        ? null
        : (tableData.phase === "betting"
            ? ((totals[userId] ?? 0) > 21 ? userId : null)
            : tableData.pendingBust ?? null);

    const updatedTable = {
        ...tableData,
        rolls: { ...tableData.rolls, [userId]: updatedRolls },
        totals,
        visibleTotals,
        cheaters,
        caught,
        busts,
        playerHeat,
        pendingBust,
        hasActed: updatedHasActed
    };

    return updateState({ tableData: updatedTable, pot: newPot });
}



