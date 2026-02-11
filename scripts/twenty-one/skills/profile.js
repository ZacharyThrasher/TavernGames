/**
 * Tavern Twenty-One - Profile Skill
 * 
 * INT vs passive Deception to learn opponent's hole die.
 * - Success: Learn their hole die value
 * - Failure: They learn YOUR hole die value
 * - Nat 20: Learn hole die + whether they cheated
 * - Nat 1: They learn your hole die + whether YOU cheated
 */

import { getState, updateState, addPrivateLog, addLogToAll, addHistoryEntry } from "../../state.js";
import { emptyTableData, TIMING } from "../constants.js";
import { getActorForUser, getActorName, getSafeActorName } from "../utils/actors.js";
import { notifyUser, validateSkillPrerequisites } from "../utils/game-logic.js";
import { showPublicRoll } from "../../dice.js";
import { delay } from "../utils/runtime.js";
import { announceSkillBannerToUser, announceSkillCutIn, announceSkillResultOverlay } from "../utils/skill-announcements.js";

export async function profile(payload, userId) {
    const state = getState();
    const tableData = state.tableData ?? emptyTableData();
    const targetId = payload?.targetId;
    const canUseProfile = await validateSkillPrerequisites({
        state,
        tableData,
        userId,
        skillName: "Profile",
        requireMyTurn: true,
        requireBettingPhase: true,
        disallowInGoblin: true,
        disallowHouse: true,
        disallowIfSkillUsedThisTurn: true,
        disallowIfBusted: true,
        disallowIfFolded: true,
        oncePerMatchSkill: "profile",
        messages: {
            outsideRound: "Cannot Profile outside of an active round.",
            goblinDisabled: "Profile is disabled in Goblin Rules.",
            notYourTurn: "You can only Profile on your turn.",
            wrongPhase: "Profile can only be used during the betting phase.",
            houseBlocked: "The house knows all.",
            alreadyUsedThisTurn: "You have already used a skill this turn.",
            alreadyUsedMatch: "You can only use Profile once per match.",
            selfCannotAct: "You can't Profile right now."
        }
    });
    if (!canUseProfile) return state;

    // Can't profile yourself
    if (targetId === userId) {
        await notifyUser(userId, "You can't Profile yourself!");
        return state;
    }

    // Validate target
    if (!targetId || !state.turnOrder.includes(targetId)) {
        await notifyUser(userId, "Invalid Profile target.");
        return state;
    }
    const targetUser = game.users.get(targetId);
    const isTargetHouse = targetUser?.isGM && !state.players?.[targetId]?.playingAsNpc;
    if (isTargetHouse) {
        await notifyUser(userId, "You can't read the house!");
        return state;
    }

    // Can't profile busted or folded players
    if (tableData.busts?.[targetId]) {
        await notifyUser(userId, "That player has busted.");
        return state;
    }
    if (tableData.folded?.[targetId]) {
        await notifyUser(userId, "That player has folded - they're untargetable!");
        return state;
    }
    announceSkillCutIn("PROFILE", userId, targetId, "Could not show profile cut-in");

    const actor = getActorForUser(userId);
    const targetActor = getActorForUser(targetId);
    const userName = getActorName(userId);
    const targetName = getActorName(targetId);
    const safeUserName = getSafeActorName(userId);
    const safeTargetName = getSafeActorName(targetId);

    // Roll Investigation (Sloppy = disadvantage)
    const isSloppy = tableData.sloppy?.[userId] ?? false;
    const roll = await new Roll(isSloppy ? "2d20kl1" : "1d20").evaluate();
    const d20Raw = roll.dice[0]?.results?.[0]?.result ?? roll.total;
    const d20 = roll.total;
    const isNat20 = d20Raw === 20;
    const isNat1 = d20Raw === 1;
    showPublicRoll(roll, userId);
    await delay(TIMING.SKILL_DRAMATIC_PAUSE);

    const invMod = actor?.system?.skills?.inv?.total ?? 0;
    const attackTotal = d20 + invMod;

    // Target's passive Deception
    const decMod = targetActor?.system?.skills?.dec?.total ?? 0;
    const defenseTotal = 10 + decMod;

    const success = !isNat1 && attackTotal >= defenseTotal;

    // Cheat info
    const targetCheated = !!tableData.cheaters?.[targetId];
    const targetCheatDice = tableData.cheaters?.[targetId]?.cheats?.map(c => c.dieIndex + 1) ?? [];
    const myCheated = !!tableData.cheaters?.[userId];

    // Counter-intelligence info (for failure)
    const myRolls = tableData.rolls[userId] ?? [];
    const myHoleDie = myRolls.find(r => !r.public);
    const myHoleValue = myHoleDie?.result ?? "?";
    let outcomeText = "FAILED";
    let outcomeClass = "failure";
    if (isNat20) { outcomeText = "CRITICAL!"; outcomeClass = "success"; }
    else if (isNat1) { outcomeText = "BACKFIRE!"; outcomeClass = "failure"; }
    else if (success) { outcomeText = "SUCCESS"; outcomeClass = "success"; }

    announceSkillResultOverlay("PROFILE", userId, targetId, {
        attackerRoll: attackTotal,
        defenderRoll: defenseTotal,
        outcome: outcomeText,
        outcomeClass: outcomeClass,
        detail: success
            ? `${userName} is reading ${targetName}'s poker face...`
            : `${targetName}'s poker face is unreadable!`
    }, "Could not show profile result overlay");

    if (isNat20) {
        await addPrivateLog(userId, {
            title: "Profile: Perfect (Nat 20)",
            message: targetCheated
                ? `CHEATER: YES (Die ${targetCheatDice.join(", ")})`
                : `CHEATER: NO (Clean)`,
            icon: "fa-solid fa-user-secret",
            type: "profile",
            cssClass: "success"
        });

        await announceSkillBannerToUser(userId, {
            title: "Profile - Nat 20",
            message: targetCheated
                ? `Cheater: YES (die ${targetCheatDice.join(", ")})`
                : "Cheater: NO",
            tone: "success",
            icon: "fa-solid fa-user-secret"
        }, "Could not show profile nat20 banner");

        // Public Log
        await addLogToAll({
            title: "Perfect Profile",
            message: `<strong>${safeUserName}</strong> sees right through <strong>${safeTargetName}</strong>!<br><em>(Result is hidden)</em>`,
            icon: "fa-solid fa-user-secret",
            type: "profile",
            cssClass: "success"
        }, [], userId);

    } else if (isNat1) {
        // Nat 1 Backfire - Target learns info
        await addPrivateLog(targetId, {
            title: `Counter-Read on ${userName}`,
            message: `Hole Die: ${myHoleValue} | Cheated: ${myCheated ? "YES" : "NO"}`,
            icon: "fa-solid fa-user-shield",
            type: "profile",
            cssClass: "success" // Good for target
        });

        await announceSkillBannerToUser(targetId, {
            title: "Counter-Profile",
            message: `Hole: ${myHoleValue} | Cheated: ${myCheated ? "YES" : "NO"}`,
            tone: "success",
            icon: "fa-solid fa-eye"
        }, "Could not show counter-profile banner");

        // Log failure to self
        await addPrivateLog(userId, {
            title: "Profile: BACKFIRE",
            message: `Exposed! ${safeTargetName} read your hole die.`,
            icon: "fa-solid fa-user-injured",
            type: "profile",
            cssClass: "failure"
        });

        await announceSkillBannerToUser(userId, {
            title: "Profile Backfire",
            message: `${safeTargetName} read you.`,
            tone: "failure",
            icon: "fa-solid fa-user-injured"
        }, "Could not show profile backfire banner");

        // Public Log
        await addLogToAll({
            title: "Profile Backfire",
            message: `<strong>${safeUserName}</strong> tried to read <strong>${safeTargetName}</strong> but was EXPOSED!<br><em>Target countered the read!</em>`,
            icon: "fa-solid fa-user-injured",
            type: "profile",
            cssClass: "failure"
        }, [], userId);

    } else if (success) {
        // Standard Success
        await addPrivateLog(userId, {
            title: `Profile: ${targetName}`,
            message: `Cheated: ${targetCheated ? "YES" : "NO"}`,
            icon: "fa-solid fa-user-secret",
            type: "profile",
            cssClass: "success"
        });

        await announceSkillBannerToUser(userId, {
            title: "Profile",
            message: `Cheater: ${targetCheated ? "YES" : "NO"}`,
            tone: "success",
            icon: "fa-solid fa-user-secret"
        }, "Could not show profile success banner");

        // Public Log
        await addLogToAll({
            title: "Profile Success",
            message: `<strong>${safeUserName}</strong> gets a read on <strong>${safeTargetName}</strong>.<br><em>(Result is hidden)</em>`,
            icon: "fa-solid fa-user-secret",
            type: "profile",
            cssClass: "success"
        }, [], userId);

    } else {
        // Failure: No info
        await addPrivateLog(userId, {
            title: "Profile Failed",
            message: `No read on ${safeTargetName}.`,
            icon: "fa-solid fa-question",
            type: "profile",
            cssClass: "failure"
        });

        await announceSkillBannerToUser(userId, {
            title: "Profile Failed",
            message: `No read on ${safeTargetName}.`,
            tone: "failure",
            icon: "fa-solid fa-question"
        }, "Could not show profile failed banner");

        // Public Log
        await addLogToAll({
            title: "Profile Failed",
            message: `<strong>${safeUserName}</strong> fails to read <strong>${safeTargetName}</strong>.`,
            icon: "fa-solid fa-question",
            type: "profile",
            cssClass: "failure"
        }, [], userId);
    }

    await addHistoryEntry({
        type: "profile",
        profiler: userName,
        target: targetName,
        roll: attackTotal,
        defense: defenseTotal,
        success: success || isNat20,
        nat20: isNat20,
        nat1: isNat1,
        message: isNat20 ? `${userName} perfectly profiled ${targetName}! (Nat 20)`
            : isNat1 ? `${userName}'s profile backfired! ${targetName} read them! (Nat 1)`
                : success ? `${userName} successfully profiled ${targetName}.`
                    : `${userName} failed to profile ${targetName} - got counter-read!`,
    });

    return updateState((current) => {
        const latestTable = current.tableData ?? emptyTableData();
        const profiledBy = { ...latestTable.profiledBy };
        const existingProfilers = Array.isArray(profiledBy[targetId]) ? [...profiledBy[targetId]] : [];
        if (!existingProfilers.includes(userId)) existingProfilers.push(userId);
        profiledBy[targetId] = existingProfilers;

        const currentUsedSkills = latestTable.usedSkills ?? {};
        const myUsedSkills = currentUsedSkills[userId] ?? {};

        return {
            tableData: {
                profiledBy,
                skillUsedThisTurn: true,
                lastSkillUsed: "profile",
                hasActed: { ...latestTable.hasActed, [userId]: true },
                usedSkills: {
                    ...currentUsedSkills,
                    [userId]: { ...myUsedSkills, profile: true }
                }
            }
        };
    });
}


