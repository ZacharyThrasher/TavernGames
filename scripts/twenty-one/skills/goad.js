/**
 * Tavern Twenty-One - Goad Skill Module
 * V3.0
 * 
 * Goad (CHA): Try to force another player to ROLL.
 * - Only during betting phase, on your turn (bonus action)
 * - Once per round per player
 * - Attacker: Intimidation OR Persuasion vs Defender: Insight
 * - Success: Target must roll
 * - Backfire: Attacker pays 1x ante to pot
 * - Nat 20: Target must roll (Nat 20 effect remains but 'resist' is gone)
 * - Nat 1: Backfire + attacker forced to roll
 * - Sloppy/Folded players cannot be goaded
 */

import { MODULE_ID, getState, updateState, addHistoryEntry, addLogToAll, addPrivateLog } from "../../state.js"; // V5.8
import { deductFromActor } from "../../wallet.js"; // V5.9: Use wallet.js for proper NPC support
import { getActorForUser, notifyUser, getActorName } from "../utils/actors.js"; // V5.9
// import { createChatCard } from "../../ui/chat.js"; // Removed
import { emptyTableData } from "../constants.js";
import { tavernSocket } from "../../socket.js";
import { showPublicRoll } from "../../dice.js";

/**
 * Goad another player during the betting phase.
 * @param {object} payload - { targetId, attackerSkill }
 * @param {string} userId - The goading player
 */
export async function goad(payload, userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    ui.notifications.warn("Cannot goad outside of an active round.");
    return state;
  }
  if (state.tableData?.gameMode === "goblin") {
    ui.notifications.warn("Goad is disabled in Goblin Rules.");
    return state;
  }

    let tableData = state.tableData ?? emptyTableData();
    const ante = game.settings.get(MODULE_ID, "fixedAnte");

    // V3: Must be your turn (skill is bonus action)
    if (tableData.currentPlayer !== userId) {
        await notifyUser(userId, "You can only Goad on your turn.");
        return state;
    }

    // Must be in betting phase
    if (tableData.phase !== "betting") {
        ui.notifications.warn("Goading can only be used during the betting phase.");
        return state;
    }

    // V3.5: House cannot goad (but GM-as-NPC can)
    const user = game.users.get(userId);
    const playerData = state.players?.[userId];
    const isHouse = user?.isGM && !playerData?.playingAsNpc;
    if (isHouse) {
        ui.notifications.warn("The house does not goad.");
        return state;
    }

    // Limit: One skill per turn
    if (tableData.skillUsedThisTurn) {
        await notifyUser(userId, "You have already used a skill this turn.");
        return state;
    }

    // Player must not have busted or folded
    if (tableData.busts?.[userId] || tableData.folded?.[userId]) {
        ui.notifications.warn("You can't goad anyone!");
        return state;
    }

    // Player can only goad once per round
    if (tableData.usedSkills?.[userId]?.goad || tableData.goadedThisRound?.[userId]) {
        ui.notifications.warn("You've already used your goad this round.");
        return state;
    }

    const { targetId, attackerSkill = "itm" } = payload;

    // Validate attacker skill choice (Intimidation or Persuasion)
    if (!["itm", "per"].includes(attackerSkill)) {
        ui.notifications.warn("Invalid skill choice. Use Intimidation or Persuasion.");
        return state;
    }

    // Validate target
    if (!targetId || !state.turnOrder.includes(targetId)) {
        ui.notifications.warn("Invalid goad target.");
        return state;
    }

    // Can't goad yourself
    if (targetId === userId) {
        ui.notifications.warn("You can't goad yourself!");
        return state;
    }

    // V3.5: Can't goad the house, but GM-as-NPC is a valid target
    const targetUser = game.users.get(targetId);
    const isTargetHouse = targetUser?.isGM && !state.players?.[targetId]?.playingAsNpc;
    if (isTargetHouse) {
        ui.notifications.warn("You can't goad the house!");
        return state;
    }

    // V3: Can't goad Sloppy or Folded players
    if (tableData.sloppy?.[targetId]) {
        await notifyUser(userId, "That player is Sloppy - too drunk to be goaded!");
        return state;
    }
    if (tableData.folded?.[targetId]) {
        await notifyUser(userId, "That player has folded - they're untargetable!");
        return state;
    }

    // Target must not have busted
    if (tableData.busts?.[targetId]) {
        ui.notifications.warn("That player has already busted.");
        return state;
    }

    // V3: Mark as acted (affects Fold refund)
    tableData.hasActed = { ...tableData.hasActed, [userId]: true };

    // V4.7.1: Visual Cut-In
    tavernSocket.executeForEveryone("showSkillCutIn", "GOAD", userId, targetId);

    // V4.7.7: Cinematic Pause (Moved below rolls)
    // await new Promise(resolve => setTimeout(resolve, 3500));

    // Get actors
    // V5.9: Use getActorName
    const attackerName = getActorName(userId);
    const defenderName = getActorName(targetId);

    // V5.10.1: Fix ReferenceError - Define actor objects
    const attackerActor = getActorForUser(userId);
    const defenderActor = getActorForUser(targetId);

    // Attacker skill names
    const attackerSkillNames = {
        itm: "Intimidation",
        per: "Persuasion",
    };
    const attackerSkillName = attackerSkillNames[attackerSkill] ?? "Intimidation";

    // Roll attacker's chosen skill (Iron Liver: Sloppy = disadvantage)
    const isAttackerSloppy = tableData.sloppy?.[userId] ?? false;
    const attackRoll = await new Roll(isAttackerSloppy ? "2d20kl1" : "1d20").evaluate();
    const attackD20Raw = attackRoll.dice[0]?.results?.[0]?.result ?? attackRoll.total;
    const attackD20 = attackRoll.total;
    const attackMod = attackerActor?.system?.skills?.[attackerSkill]?.total ?? 0;
    const attackTotal = attackD20 + attackMod;

    // V4.7.8: Dice So Nice
    showPublicRoll(attackRoll, userId);

    // V3: Check for Nat 20/Nat 1
    const isNat20 = attackD20Raw === 20;
    const isNat1 = attackD20Raw === 1;

    // Roll defender's Insight (Iron Liver: Sloppy = disadvantage)
    const isDefenderSloppy = tableData.sloppy?.[targetId] ?? false;
    const defendRoll = await new Roll(isDefenderSloppy ? "2d20kl1" : "1d20").evaluate();
    const defendD20 = defendRoll.total;
    const defendMod = defenderActor?.system?.skills?.ins?.total ?? 0;
    const defendTotal = defendD20 + defendMod;

    // V4.7.8: Dice So Nice
    showPublicRoll(defendRoll, targetId);

    // V4.7.7: Cinematic Pause (Sync with Dice3D)
    await new Promise(resolve => setTimeout(resolve, 3500));

    // Determine winner: attacker must beat (not tie) defender
    // V3: Nat 1 always fails regardless of total
    const attackerWins = !isNat1 && attackTotal > defendTotal;

    // Build outcome message for Nat effects
    let nat20Effect = "";
    let nat1Effect = "";
    if (isNat20 && attackerWins) {
        nat20Effect = "<br><strong style='color: gold;'>NAT 20! Cannot resist!</strong>";
    }
    if (isNat1) {
        nat1Effect = "<br><strong style='color: #ff4444;'>NAT 1! Backfire + forced roll!</strong>";
    }

    // V4.7.6: Result Overlay
    // V4.7.6: Result Overlay
    const resultData = {
        attackerRoll: attackTotal,
        defenderRoll: defendTotal,
        outcome: attackerWins ? "SUCCESS" : "RESISTED",
        outcomeClass: attackerWins ? "success" : "failure",
        // Detail for 5.3.0
        detail: attackerWins
            ? `${defenderName} is DARED! Must Hit or Fold!`
            : `${defenderName} shrugged off the goad!`
    };
    // Include target info manually if needed, but overlay resolves it via targetId
    tavernSocket.executeForEveryone("showSkillResult", "GOAD", userId, targetId, resultData);

    // V5.8: Log Goad Attempt
    // We log the result (Success/Fail) inside the Outcome blocks below to be specific, 
    // BUT we can also log a generic "XY used Goad on Z" here if we want?
    // Let's stick to logging the RESULT, as the prompt implies "What happened".
    // Wait, Result Overlay shows it ephemerally. The Log should persist it.

    // We'll log in the if/else blocks for Success/Backfire logic to capture the details.

    // Track that this player has goaded this round
    const updatedGoadedThisRound = { ...tableData.goadedThisRound, [userId]: true };
    const updatedUsedSkills = {
        ...tableData.usedSkills,
        [userId]: { ...tableData.usedSkills?.[userId], goad: true }
    };
    const updatedGoadBackfire = { ...tableData.goadBackfire };

    if (attackerWins) {
        // Target must roll
        const updatedHolds = { ...tableData.holds };
        if (updatedHolds[targetId]) delete updatedHolds[targetId];

        // V5.7: Nat 20 = Force d20
        const isForceD20 = isNat20;

        updatedGoadBackfire[targetId] = {
            mustRoll: true,
            goadedBy: userId,
            forceD20: isForceD20 // V5.7
        };

        const updatedTableData = {
            ...tableData,
            holds: updatedHolds,
            goadedThisRound: updatedGoadedThisRound,
            usedSkills: updatedUsedSkills,
            goadBackfire: updatedGoadBackfire,
            skillUsedThisTurn: true,
            lastSkillUsed: "goad",
        };

        // V5.7: Update Dared for target if Nat 20 (Forces d20)
        // Re-using "dared" state but with d20 constraint maybe? 
        // Actually, let's use the goadBackfire.forceD20 property in submitRoll directly.

        // V5.8: Log Goad Success
        await addLogToAll({
            title: "Goad Successful!",
            message: `<strong>${attackerName}</strong> goaded <strong>${defenderName}</strong>!<br>Target is <strong>${isForceD20 ? "LOCKED into d20" : "DARED"}</strong> (Must Hit or Fold).`,
            icon: "fa-solid fa-comments",
            type: "goad",
            cssClass: "success"
        });

        await addHistoryEntry({
            type: "goad",
            attacker: attackerName,
            defender: defenderName,
            skill: attackerSkillName,
            attackRoll: attackTotal,
            defendRoll: defendTotal,
            success: true,
            nat20: isNat20,
            message: isNat20
                ? `${attackerName} CRITICALLY goaded ${defenderName}! They MUST roll a d20!`
                : `${attackerName} goaded ${defenderName}! they must roll!`,
        });

        try {
            await tavernSocket.executeForEveryone("showImpactRing", targetId, "goad");
        } catch (e) { }

        return updateState({ tableData: updatedTableData });

    } else {
        // BACKFIRE
        // V5.7: Symmetrical Backfire - User must Roll or Fold
        // NO Ante Penalty anymore

        // Remove hold if present
        const updatedHolds = { ...tableData.holds };
        if (updatedHolds[userId]) delete updatedHolds[userId];

        // V5.7: Nat 1 = User Forced to roll d20
        const isForceD20 = isNat1;

        // Apply "Goaded" state to self (using goadBackfire structure for consistency)
        // Or we can keep using "dared", but let's align it.
        // The request says "make the effect ... the same".
        // Use goadBackfire on SELF.
        updatedGoadBackfire[userId] = {
            mustRoll: true,
            goadedBy: targetId, // "Goaded by target's resistance"
            forceD20: isForceD20
        };

        // Clear legacy Dared if it exists
        const updatedDared = { ...tableData.dared };
        if (updatedDared[userId]) delete updatedDared[userId];

        const updatedTableData = {
            ...tableData,
            holds: updatedHolds,
            goadedThisRound: updatedGoadedThisRound,
            usedSkills: updatedUsedSkills,
            goadBackfire: updatedGoadBackfire,
            dared: updatedDared,
            skillUsedThisTurn: true,
            lastSkillUsed: "goad",
        };

        // V5.8: Log Goad Backfire
        await addLogToAll({
            title: "Goad Backfired!",
            message: `<strong>${attackerName}</strong> tried to goad <strong>${defenderName}</strong> but failed!<br>Attacker is <strong>${isForceD20 ? "LOCKED into d20" : "forced to Roll"}</strong>!`,
            icon: "fa-solid fa-comments",
            type: "goad",
            cssClass: "failure"
        });

        await addHistoryEntry({
            type: "goad",
            attacker: attackerName,
            defender: defenderName,
            skill: attackerSkillName,
            attackRoll: attackTotal,
            defendRoll: defendTotal,
            success: false,
            nat1: isNat1,
            message: isNat1
                ? `${attackerName}'s goad CRITICALLY backfired! They MUST roll a d20!`
                : `${attackerName}'s goad backfired! They are forced to roll!`,
        });

        try {
            await tavernSocket.executeForEveryone("showImpactRing", userId, "goad");
        } catch (e) { }

        return updateState({ tableData: updatedTableData }); // No pot change
    }
}
