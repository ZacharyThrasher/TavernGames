/**
 * Tavern Twenty-One - Goad Skill Module
 * 
 * Goad (CHA): Try to force another player to ROLL.
 * - Only during betting phase, on your turn (bonus action)
 * - Once per round per player
 * - Attacker: Intimidation OR Persuasion vs Defender: Insight
 * - Success: Target must roll
 * - Backfire: Attacker is forced to roll
 * - Nat 20: Target is locked into d20
 * - Nat 1: Backfire + attacker locked into d20
 * - Sloppy/Folded players cannot be goaded
 */

import { getState, updateState, addHistoryEntry, addLogToAll } from "../../state.js";
import { getActorForUser, getActorName, getSafeActorName } from "../utils/actors.js";
import { notifyUser, validateSkillPrerequisites } from "../utils/game-logic.js";
import { TIMING, emptyTableData } from "../constants.js";
import { resolveContest } from "../rules/pure-rules.js";
import { tavernSocket } from "../../socket.js";
import { showPublicRoll } from "../../dice.js";
import { delay, withWarning } from "../utils/runtime.js";
import { announceSkillBannerToUser, announceSkillCutIn, announceSkillResultOverlay } from "../utils/skill-announcements.js";

function buildGoadOutcomeTable({
  tableData,
  affectedId,
  goadedBy,
  forceD20,
  updatedGoadedThisRound,
  updatedUsedSkills,
  updatedHasActed,
  clearDaredId = null
}) {
  const updatedHolds = { ...tableData.holds };
  if (updatedHolds[affectedId]) delete updatedHolds[affectedId];

  const updatedGoadBackfire = { ...tableData.goadBackfire };
  updatedGoadBackfire[affectedId] = {
    mustRoll: true,
    goadedBy,
    forceD20
  };

  const next = {
    ...tableData,
    holds: updatedHolds,
    goadedThisRound: updatedGoadedThisRound,
    usedSkills: updatedUsedSkills,
    goadBackfire: updatedGoadBackfire,
    hasActed: updatedHasActed,
    skillUsedThisTurn: true,
    lastSkillUsed: "goad",
  };

  if (clearDaredId) {
    const updatedDared = { ...tableData.dared };
    if (updatedDared[clearDaredId]) delete updatedDared[clearDaredId];
    next.dared = updatedDared;
  }

  return next;
}

/**
 * Goad another player during the betting phase.
 * @param {object} payload - { targetId, attackerSkill }
 * @param {string} userId - The goading player
 */
export async function goad(payload, userId) {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();
  const canUseGoad = await validateSkillPrerequisites({
    state,
    tableData,
    userId,
    skillName: "Goad",
    requireMyTurn: true,
    requireBettingPhase: true,
    disallowInGoblin: true,
    disallowHouse: true,
    disallowIfSkillUsedThisTurn: true,
    disallowIfBusted: true,
    disallowIfFolded: true,
    oncePerMatchSkill: "goad",
    messages: {
      outsideRound: "Cannot goad outside of an active round.",
      goblinDisabled: "Goad is disabled in Goblin Rules.",
      notYourTurn: "You can only Goad on your turn.",
      wrongPhase: "Goading can only be used during the betting phase.",
      houseBlocked: "The house does not goad.",
      alreadyUsedThisTurn: "You have already used a skill this turn.",
      alreadyUsedMatch: "You've already used your goad this round.",
      selfCannotAct: "You can't goad anyone!"
    }
  });
  if (!canUseGoad) return state;

  // Player can only goad once per round.
  if (tableData.goadedThisRound?.[userId]) {
    await notifyUser(userId, "You've already used your goad this round.");
    return state;
  }

  const targetId = payload?.targetId;
  const attackerSkill = payload?.attackerSkill ?? "itm";

    // Validate attacker skill choice (Intimidation or Persuasion)
    if (!["itm", "per"].includes(attackerSkill)) {
        await notifyUser(userId, "Invalid skill choice. Use Intimidation or Persuasion.");
        return state;
    }

    // Validate target
    if (!targetId || !state.turnOrder.includes(targetId)) {
        await notifyUser(userId, "Invalid goad target.");
        return state;
    }

    // Can't goad yourself
    if (targetId === userId) {
        await notifyUser(userId, "You can't goad yourself!");
        return state;
    }
    const targetUser = game.users.get(targetId);
    const isTargetHouse = targetUser?.isGM && !state.players?.[targetId]?.playingAsNpc;
    if (isTargetHouse) {
        await notifyUser(userId, "You can't goad the house!");
        return state;
    }
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
        await notifyUser(userId, "That player has already busted.");
        return state;
    }
    const updatedHasActed = { ...tableData.hasActed, [userId]: true };
    announceSkillCutIn("GOAD", userId, targetId, "Could not show goad cut-in");

    // Get actors
    const attackerName = getActorName(userId);
    const defenderName = getActorName(targetId);
    const safeAttackerName = getSafeActorName(userId);
    const safeDefenderName = getSafeActorName(targetId);
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
    showPublicRoll(attackRoll, userId);
    const isNat20 = attackD20Raw === 20;
    const isNat1 = attackD20Raw === 1;

    // Roll defender's Insight (Iron Liver: Sloppy = disadvantage)
    const isDefenderSloppy = tableData.sloppy?.[targetId] ?? false;
    const defendRoll = await new Roll(isDefenderSloppy ? "2d20kl1" : "1d20").evaluate();
    const defendD20 = defendRoll.total;
    const defendMod = defenderActor?.system?.skills?.ins?.total ?? 0;
    const defendTotal = defendD20 + defendMod;
    showPublicRoll(defendRoll, targetId);
    await delay(TIMING.GOAD_DRAMATIC_PAUSE);

    // Determine winner: attacker must beat (not tie) defender
    const { success: attackerWins } = resolveContest({
        attackerTotal: attackTotal,
        defenderTotal: defendTotal,
        isNat1
    });
    const resultData = {
        attackerRoll: attackTotal,
        defenderRoll: defendTotal,
        outcome: attackerWins ? "SUCCESS" : "RESISTED",
        outcomeClass: attackerWins ? "success" : "failure",
        // Detail for 5.3.0
        detail: attackerWins
            ? `${safeDefenderName} is DARED! Must Hit or Fold!`
            : `${safeDefenderName} shrugged off the goad!`
    };
    announceSkillResultOverlay("GOAD", userId, targetId, resultData, "Could not show goad result overlay");

    // Track that this player has goaded this round
    const updatedGoadedThisRound = { ...tableData.goadedThisRound, [userId]: true };
    const updatedUsedSkills = {
        ...tableData.usedSkills,
        [userId]: { ...tableData.usedSkills?.[userId], goad: true }
    };
    if (attackerWins) {
        const isForceD20 = isNat20;
        const updatedTableData = buildGoadOutcomeTable({
            tableData,
            affectedId: targetId,
            goadedBy: userId,
            forceD20: isForceD20,
            updatedGoadedThisRound,
            updatedUsedSkills,
            updatedHasActed
        });
        await addLogToAll({
            title: "Goad Successful!",
            message: `<strong>${safeAttackerName}</strong> goaded <strong>${safeDefenderName}</strong>!<br>Target is <strong>${isForceD20 ? "LOCKED into d20" : "DARED"}</strong> (Must Hit or Fold).`,
            icon: "fa-solid fa-comments",
            type: "goad",
            cssClass: "success"
        });

        await announceSkillBannerToUser(userId, {
            title: "Goad Success",
            message: isForceD20 ? `${safeDefenderName} must roll d20.` : `${safeDefenderName} is dared.`,
            tone: "success",
            icon: "fa-solid fa-comments"
        }, "Could not show goad success banner to attacker");
        await announceSkillBannerToUser(targetId, {
            title: "You Were Goaded",
            message: isForceD20 ? "Forced to roll d20." : "Must roll or fold.",
            tone: "failure",
            icon: "fa-solid fa-comments"
        }, "Could not show goad success banner to target");

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

        await withWarning("Could not show goad impact ring", () => tavernSocket.executeForEveryone("showImpactRing", targetId, "goad"));

        return updateState({ tableData: updatedTableData });

    } else {
        const isForceD20 = isNat1;
        const updatedTableData = buildGoadOutcomeTable({
            tableData,
            affectedId: userId,
            goadedBy: targetId,
            forceD20: isForceD20,
            updatedGoadedThisRound,
            updatedUsedSkills,
            updatedHasActed,
            clearDaredId: userId
        });
        await addLogToAll({
            title: "Goad Backfired!",
            message: `<strong>${safeAttackerName}</strong> tried to goad <strong>${safeDefenderName}</strong> but failed!<br>Attacker is <strong>${isForceD20 ? "LOCKED into d20" : "forced to Roll"}</strong>!`,
            icon: "fa-solid fa-comments",
            type: "goad",
            cssClass: "failure"
        });

        await announceSkillBannerToUser(userId, {
            title: "Goad Backfire",
            message: isForceD20 ? "You must roll d20." : "You must roll.",
            tone: "failure",
            icon: "fa-solid fa-comments"
        }, "Could not show goad backfire banner to attacker");
        await announceSkillBannerToUser(targetId, {
            title: "Goad Resisted",
            message: `You resisted ${safeAttackerName}.`,
            tone: "success",
            icon: "fa-solid fa-comments"
        }, "Could not show goad resisted banner to target");

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

        await withWarning("Could not show goad backfire impact ring", () => tavernSocket.executeForEveryone("showImpactRing", userId, "goad"));

        return updateState({ tableData: updatedTableData }); // No pot change
    }
}


