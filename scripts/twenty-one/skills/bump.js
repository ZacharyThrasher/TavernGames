/**
 * Tavern Twenty-One - Bump Skill Module
 * 
 * Bump the Table: Try to force another player to re-roll one of their dice.
 * - Only during betting phase, on your turn (bonus action)
 * - Once per round per player
 * - If attacker wins: target's chosen die is re-rolled
 * - If attacker loses: target chooses one of attacker's dice to re-roll
 * - Nat 20: Bonus reroll
 * - Nat 1: Backfire + pay 1× ante
 */

import { getState, updateState, addHistoryEntry, addLogToAll, addPrivateLog } from "../../state.js";
import { deductFromActor } from "../../wallet.js";
import { getActorForUser, getActorName, getSafeActorName } from "../utils/actors.js";
import { notifyUser, validateSkillPrerequisites } from "../utils/game-logic.js";
import { MODULE_ID, TIMING, emptyTableData } from "../constants.js";
import { applyStandardRerollToTable, resolveContest } from "../rules/pure-rules.js";
import { tavernSocket } from "../../socket.js";
import { showPublicRoll } from "../../dice.js";
import { delay, withWarning } from "../utils/runtime.js";
import { announceSkillBannerToUser, announceSkillCutIn, announceSkillResultOverlay } from "../utils/skill-announcements.js";

/**
 * Bump the table to force a die reroll.
 * @param {object} payload - { targetId, dieIndex }
 * @param {string} userId - The bumping player
 */
export async function bumpTable(payload, userId) {
    const state = getState();
    const tableData = state.tableData ?? emptyTableData();
    const canUseBump = await validateSkillPrerequisites({
        state,
        tableData,
        userId,
        skillName: "Bump",
        requireMyTurn: true,
        requireBettingPhase: true,
        disallowInGoblin: true,
        disallowHouse: true,
        disallowIfSkillUsedThisTurn: true,
        disallowIfBusted: true,
        disallowIfFolded: true,
        disallowIfHeld: true,
        oncePerMatchSkill: "bump",
        messages: {
            outsideRound: "Cannot bump the table outside of an active round.",
            goblinDisabled: "Bump is disabled in Goblin Rules.",
            notYourTurn: "You can only Bump on your turn.",
            wrongPhase: "You can only bump the table during the betting phase.",
            houseBlocked: "The house does not bump the table.",
            alreadyUsedThisTurn: "You have already used a skill this turn.",
            alreadyUsedMatch: "You've already bumped the table this round.",
            selfCannotAct: "You can't bump the table right now."
        }
    });
    if (!canUseBump) return state;

    if (tableData.bumpedThisRound?.[userId]) {
        await notifyUser(userId, "You've already bumped the table this round.");
        return state;
    }

    const targetId = payload?.targetId;
    const dieIndex = Number(payload?.dieIndex);

    // Validate target
    if (!targetId || targetId === userId) {
        await notifyUser(userId, "You can't bump your own dice!");
        return state;
    }

    const targetUser = game.users.get(targetId);
    const isTargetHouse = targetUser?.isGM && !state.players?.[targetId]?.playingAsNpc;
    if (isTargetHouse) {
        await notifyUser(userId, "You can't bump the house's dice!");
        return state;
    }

    if (tableData.busts?.[targetId]) {
        await notifyUser(userId, "That player has already busted.");
        return state;
    }

    // Validate target has dice and dieIndex is valid
    const targetRolls = tableData.rolls?.[targetId] ?? [];
    if (targetRolls.length === 0) {
        await notifyUser(userId, "That player has no dice to bump.");
        return state;
    }

    if (Number.isNaN(dieIndex) || dieIndex < 0 || dieIndex >= targetRolls.length) {
        await notifyUser(userId, "Invalid die selection.");
        return state;
    }
    if (tableData.folded?.[targetId]) {
        await notifyUser(userId, "That player has folded - they're untargetable!");
        return state;
    }
    if (tableData.holds?.[targetId]) {
        await notifyUser(userId, "That player has held - they're locked in!");
        return state;
    }
    const updatedHasActed = { ...tableData.hasActed, [userId]: true };
    announceSkillCutIn("BUMP", userId, targetId, "Could not show bump cut-in");

    const ante = game.settings.get(MODULE_ID, "fixedAnte");

    // Get actor info
    const actualAttackerActor = getActorForUser(userId);
    const attackerName = actualAttackerActor?.name ?? game.users.get(userId)?.name ?? "Unknown";
    const targetActor = getActorForUser(targetId);
    const targetName = targetActor?.name ?? game.users.get(targetId)?.name ?? "Unknown";
    const safeAttackerName = getSafeActorName(userId);
    const safeTargetName = getSafeActorName(targetId);
    const isAttackerSloppy = tableData.sloppy?.[userId] ?? false;
    const isDefenderSloppy = tableData.sloppy?.[targetId] ?? false;

    const attackerRoll = await new Roll(isAttackerSloppy ? "2d20kl1" : "1d20").evaluate();
    const attackerD20Raw = attackerRoll.dice[0]?.results?.[0]?.result ?? attackerRoll.total;
    const attackerD20 = attackerRoll.total;
    const attackerStrMod = actualAttackerActor?.system?.abilities?.str?.mod ?? 0;
    const attackerTotal = attackerD20 + attackerStrMod;

    const defenderRoll = await new Roll(isDefenderSloppy ? "2d20kl1" : "1d20").evaluate();
    const defenderD20 = defenderRoll.total;
    const defenderStrMod = targetActor?.system?.abilities?.str?.mod ?? 0;
    const defenderTotal = defenderD20 + defenderStrMod;
    showPublicRoll(attackerRoll, userId);
    showPublicRoll(defenderRoll, targetId);
    await delay(TIMING.SKILL_DRAMATIC_PAUSE);
    const isNat1 = attackerD20Raw === 1;

    // Determine winner (Nat 1 always fails)
    const { success } = resolveContest({
        attackerTotal,
        defenderTotal,
        isNat1
    });
    const resultData = {
        attackerRoll: attackerTotal,
        defenderRoll: defenderTotal,
        outcome: success ? "SUCCESS" : "FAIL",
        outcomeClass: success ? "success" : "failure",
        detail: success
            ? `Bumping ${safeTargetName}'s die...`
            : `${safeTargetName} caught you! RETALIATION incoming!`
    };
    announceSkillResultOverlay("BUMP", userId, targetId, resultData, "Could not show bump result overlay");

    // Mark that attacker has bumped this round
    const updatedBumpedThisRound = { ...tableData.bumpedThisRound, [userId]: true };
    const updatedUsedSkills = {
        ...tableData.usedSkills,
        [userId]: { ...tableData.usedSkills?.[userId], bump: true }
    };
    let newPot = state.pot;

    if (success) {
        // SUCCESS: Re-roll target's specified die
        const targetDie = targetRolls[dieIndex];
        const oldValue = targetDie.result;
        const dieSides = targetDie.die;
        const wasPublic = targetDie.public ?? true;

        // Roll new value
        const reroll = await new Roll(`1d${dieSides}`).evaluate();
        const newValue = reroll.total;

        const rerollResult = applyStandardRerollToTable(tableData, targetId, dieIndex, newValue);
        const newTotal = rerollResult.totals[targetId] ?? 0;
        const targetBusted = rerollResult.busted;

        const updatedBusts = { ...tableData.busts };
        if (targetBusted) {
            updatedBusts[targetId] = true;
            await addHistoryEntry({
                type: "bust",
                player: targetName,
                total: newTotal,
                message: `${targetName} BUSTED with ${newTotal} after being bumped!`,
            });
        }

        const updatedTableData = {
            ...tableData,
            rolls: rerollResult.rolls,
            totals: rerollResult.totals,
            visibleTotals: rerollResult.visibleTotals,
            busts: updatedBusts,
            bumpedThisRound: updatedBumpedThisRound,
            usedSkills: updatedUsedSkills,
            hasActed: updatedHasActed,
        };
        await withWarning("Could not play bump effect", () => tavernSocket.executeForEveryone("playBumpEffect", targetId));

        await addHistoryEntry({
            type: "bump",
            attacker: attackerName,
            target: targetName,
            success: true,
            oldValue: wasPublic ? oldValue : "?",
            newValue: wasPublic ? newValue : "?",
            die: dieSides,
            isHoleDie: !wasPublic,
            message: wasPublic
                ? `${attackerName} bumped ${targetName}'s d${dieSides}: ${oldValue} → ${newValue}`
                : `${attackerName} bumped ${targetName}'s hole die (d${dieSides})! (Value hidden)`,
        });
        if (wasPublic) {
            // Public Die Bumped -> Log to Everyone
            await addLogToAll({
                title: "Table Bump!",
                message: `<strong>${safeAttackerName}</strong> bumped <strong>${safeTargetName}</strong>!<br>d${dieSides}: ${oldValue} → <strong>${newValue}</strong>${targetBusted ? " (BUST!)" : ""}`,
                icon: "fa-solid fa-hand-fist",
                type: "bump",
                cssClass: "success"
            });
        } else {
            // Public Log
            await addLogToAll({
                title: "Table Bump!",
                message: `<strong>${safeAttackerName}</strong> bumped <strong>${safeTargetName}'s</strong> Hole Die!<br><em>(Value remains hidden)</em>`,
                icon: "fa-solid fa-hand-fist",
                type: "bump",
                cssClass: "warning"
            });

            await announceSkillBannerToUser(userId, {
                title: "Bump Landed",
                message: `You bumped ${safeTargetName}'s die.`,
                tone: "success",
                icon: "fa-solid fa-hand-fist"
            }, "Could not show bump success banner to attacker");
            await announceSkillBannerToUser(targetId, {
                title: "You Were Bumped",
                message: `Your die was changed.`,
                tone: "failure",
                icon: "fa-solid fa-hand-fist"
            }, "Could not show bump success banner to target");

            // Target Private Log
            await addPrivateLog(targetId, {
                title: "You were Bumped!",
                message: `Your Hole Die (d${dieSides}) changed: ${oldValue} → <strong>${newValue}</strong>${targetBusted ? " (BUST!)" : ""}`,
                icon: "fa-solid fa-triangle-exclamation",
                type: "bump",
                cssClass: "failure"
            });
        }

        return updateState({ tableData: { ...updatedTableData, skillUsedThisTurn: true, lastSkillUsed: "bump" } });

    } else {
        // FAILURE: Set pending retaliation state - target chooses attacker's die
        if (isNat1) {
            await deductFromActor(userId, ante);
            newPot = state.pot + ante;
        }

        const updatedTableData = {
            ...tableData,
            bumpedThisRound: updatedBumpedThisRound,
            usedSkills: updatedUsedSkills,
            pendingBumpRetaliation: {
                attackerId: userId,
                targetId: targetId,
            },
            hasActed: updatedHasActed,
        };

        await addHistoryEntry({
            type: "bump",
            attacker: attackerName,
            target: targetName,
            success: false,
            nat1: isNat1,
            message: isNat1
                ? `${attackerName} tried to bump ${targetName}'s dice but was caught! Pays ${ante}gp!`
                : `${attackerName} tried to bump ${targetName}'s dice but was caught!`,
        });
        await addLogToAll({
            title: "Bump Caught!",
            message: `<strong>${safeAttackerName}</strong> tried to bump <strong>${safeTargetName}</strong> but was caught!`,
            icon: "fa-solid fa-hand-fist",
            type: "bump",
            cssClass: "failure"
        });

        await announceSkillBannerToUser(userId, {
            title: "Bump Caught",
            message: "Your bump was caught.",
            tone: "failure",
            icon: "fa-solid fa-hand-fist"
        }, "Could not show bump-failure banner to attacker");
        await announceSkillBannerToUser(targetId, {
            title: "Retaliation Ready",
            message: `Choose a die to reroll.`,
            tone: "info",
            icon: "fa-solid fa-hand-back-fist"
        }, "Could not show retaliation banner to target");

        // Log Retaliation Pending to Target
        await addPrivateLog(targetId, {
            title: "Retaliation Ready",
            message: `You caught ${safeAttackerName}! Select one of their dice to re-roll.`,
            icon: "fa-solid fa-hand-back-fist",
            type: "bump",
            cssClass: "success"
        });

        return updateState({ tableData: { ...updatedTableData, skillUsedThisTurn: true, lastSkillUsed: "bump" }, pot: newPot });
    }
}

/**
 * Bump Retaliation: Target (or GM override) chooses which of attacker's dice to re-roll.
 * @param {object} payload - { dieIndex }
 * @param {string} userId - The retaliating player (or GM)
 */
export async function bumpRetaliation(payload, userId) {
    const state = getState();
    if (state.status !== "PLAYING") {
        await notifyUser(userId, "Cannot complete retaliation outside of an active round.");
        return state;
    }

    const tableData = state.tableData ?? emptyTableData();
    const pending = tableData.pendingBumpRetaliation;

    if (!pending) {
        await notifyUser(userId, "No pending bump retaliation.");
        return state;
    }

    // Only the target or GM can complete retaliation
    const user = game.users.get(userId);
    const isTarget = userId === pending.targetId;
    const isGM = user?.isGM;

    if (!isTarget && !isGM) {
        await notifyUser(userId, "Only the target or GM can choose the retaliation die.");
        return state;
    }

    const dieIndex = Number(payload?.dieIndex);
    const attackerId = pending.attackerId;
    const targetId = pending.targetId;

    // Validate attacker has dice and dieIndex is valid
    const attackerRolls = tableData.rolls?.[attackerId] ?? [];
    if (attackerRolls.length === 0) {
        await notifyUser(userId, "Attacker has no dice to re-roll.");
        return state;
    }

    if (Number.isNaN(dieIndex) || dieIndex < 0 || dieIndex >= attackerRolls.length) {
        await notifyUser(userId, "Invalid die selection.");
        return state;
    }

    // Get names
    const attackerName = getActorName(attackerId);
    const targetName = getActorName(targetId);
    const safeAttackerName = getSafeActorName(attackerId);
    const safeTargetName = getSafeActorName(targetId);

    // Re-roll attacker's die
    const attackerDie = attackerRolls[dieIndex];
    const oldValue = attackerDie.result;
    const dieSides = attackerDie.die;
    const wasPublic = attackerDie.public ?? true;

    const reroll = await new Roll(`1d${dieSides}`).evaluate();
    const newValue = reroll.total;

    const rerollResult = applyStandardRerollToTable(tableData, attackerId, dieIndex, newValue);
    const newTotal = rerollResult.totals[attackerId] ?? 0;
    const attackerBusted = rerollResult.busted;

    const updatedBusts = { ...tableData.busts };
    if (attackerBusted) {
        updatedBusts[attackerId] = true;
    }

    const updatedTableData = {
        ...tableData,
        rolls: rerollResult.rolls,
        totals: rerollResult.totals,
        visibleTotals: rerollResult.visibleTotals,
        busts: updatedBusts,
        pendingBumpRetaliation: null,
    };

    await addHistoryEntry({
        type: "bump_retaliation",
        attacker: attackerName,
        target: targetName,
        oldValue,
        newValue,
        die: dieSides,
        message: `${targetName} chose ${attackerName}'s d${dieSides}: ${oldValue} → ${newValue}`,
    });
    if (wasPublic) {
        await addLogToAll({
            title: "Retaliation!",
            message: `<strong>${safeTargetName}</strong> re-rolled <strong>${safeAttackerName}'s</strong> d${dieSides}: ${oldValue} → <strong>${newValue}</strong>${attackerBusted ? " (BUST!)" : ""}`,
            icon: "fa-solid fa-hand-back-fist",
            type: "bump",
            cssClass: "warning"
        });
    } else {
        // Public generic
        await addLogToAll({
            title: "Retaliation!",
            message: `<strong>${safeTargetName}</strong> re-rolled <strong>${safeAttackerName}'s</strong> Hole Die!`,
            icon: "fa-solid fa-hand-back-fist",
            type: "bump",
            cssClass: "warning"
        });

        // Private to Attacker
        await addPrivateLog(attackerId, {
            title: "Retaliation!",
            message: `Your Hole Die (d${dieSides}) changed: ${oldValue} → <strong>${newValue}</strong>${attackerBusted ? " (BUST!)" : ""}`,
            icon: "fa-solid fa-triangle-exclamation",
            type: "bump",
            cssClass: "failure"
        });
    }



    return updateState({ tableData: updatedTableData });
}



