/**
 * Tavern Twenty-One - Profile Skill
 * V3.0
 * 
 * INT vs passive Deception to learn opponent's hole die.
 * - Success: Learn their hole die value
 * - Failure: They learn YOUR hole die value
 * - Nat 20: Learn hole die + whether they cheated
 * - Nat 1: They learn your hole die + whether YOU cheated
 */

import { MODULE_ID } from "../constants.js";
import { getState, updateState, emptyTableData } from "../../state.js";
import { getActorForUser, notifyUser } from "../utils/actors.js";
import { createChatCard, addHistoryEntry } from "../../ui/chat.js";
import { tavernSocket } from "../../socket.js";
import { showPublicRoll } from "../../dice.js";

export async function profile(payload, userId) {
    const state = getState();
    if (state.status !== "PLAYING") {
        ui.notifications.warn("Cannot Profile outside of an active round.");
        return state;
    }

    let tableData = state.tableData ?? emptyTableData();
    const { targetId } = payload;

    // Must be your turn
    if (tableData.currentPlayer !== userId) {
        await notifyUser(userId, "You can only Profile on your turn.");
        return state;
    }

    // Must be in betting phase
    if (tableData.phase !== "betting") {
        await notifyUser(userId, "Profile can only be used during the betting phase.");
        return state;
    }

    // V3.5: House cannot use skills (but GM-as-NPC can)
    const user = game.users.get(userId);
    const playerData = state.players?.[userId];
    const isHouse = user?.isGM && !playerData?.playingAsNpc;
    if (isHouse) {
        ui.notifications.warn("The house knows all.");
        return state;
    }

    // Limit: One skill per turn
    if (tableData.skillUsedThisTurn) {
        await notifyUser(userId, "You have already used a skill this turn.");
        return state;
    }

    // V4.8.40: Once per round/match
    if (tableData.usedSkills?.[userId]?.profile) {
        await notifyUser(userId, "You can only use Profile once per match.");
        return state;
    }

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
    // V3.5: Can't profile the house, but GM-as-NPC is a valid target
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

    // Can't use if busted or folded yourself
    if (tableData.busts?.[userId] || tableData.folded?.[userId]) {
        await notifyUser(userId, "You can't Profile right now.");
        return state;
    }

    // Mark as acted
    tableData.hasActed = { ...tableData.hasActed, [userId]: true };

    // V4.7.1: Visual Cut-In
    tavernSocket.executeForEveryone("showSkillCutIn", "PROFILE", userId, targetId);

    // V4.7.7: Analysis Pause (Moved down)
    // await new Promise(resolve => setTimeout(resolve, 3000));

    const actor = getActorForUser(userId);
    const targetActor = getActorForUser(targetId);
    const userName = actor?.name ?? game.users.get(userId)?.name ?? "Unknown";
    const targetName = targetActor?.name ?? game.users.get(targetId)?.name ?? "Unknown";

    // Roll Investigation (Sloppy = disadvantage)
    const isSloppy = tableData.sloppy?.[userId] ?? false;
    const roll = await new Roll(isSloppy ? "2d20kl1" : "1d20").evaluate();
    const d20Raw = roll.dice[0]?.results?.[0]?.result ?? roll.total;
    const d20 = roll.total;
    const isNat20 = d20Raw === 20;
    const isNat1 = d20Raw === 1;

    // V4.7.8: Dice So Nice & Sync Pause
    showPublicRoll(roll, userId);
    await new Promise(resolve => setTimeout(resolve, 3000));

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




    // V4.7.6: Result Overlay Logic
    let outcomeText = "FAILED";
    let outcomeClass = "failure";
    if (isNat20) { outcomeText = "CRITICAL!"; outcomeClass = "success"; }
    else if (isNat1) { outcomeText = "BACKFIRE!"; outcomeClass = "failure"; }
    else if (success) { outcomeText = "SUCCESS"; outcomeClass = "success"; }

    tavernSocket.executeForEveryone("showSkillResult", "PROFILE", userId, targetId, {
        attackerRoll: attackTotal,
        defenderRoll: defenseTotal,
        outcome: outcomeText,
        outcomeClass: outcomeClass
    });


    if (isNat20) {
        let message = `<span style="font-size: 1.2em;">Cheated: <strong>${targetCheated ? "YES" : "NO"}</strong></span>`;
        if (targetCheated) {
            message += `<br><span style="color: #ff6666;">Specifically: Die ${targetCheatDice.join(", ")}</span>`;
        } else {
            message += `<br><span style="color: #88ff88;">They are playing clean.</span>`;
        }

        await ChatMessage.create({
            content: `<div class="tavern-skill-result success">
        <strong>Perfect Read!</strong><br>${message}
      </div>`,
            flavor: `${userName} rolled ${d20} + ${invMod} = ${attackTotal} vs passive ${defenseTotal} — <strong style="color: gold;">NAT 20!</strong>`,
            whisper: [userId],
            blind: true, // V3.5.2: Hide from GM-as-NPC
            // rolls: [roll], // V4.7.9: Suppress DSN
        });

        /* Suppressed Public Card
        await createChatCard({
            title: "Profile",
            subtitle: `${userName} stares down ${targetName}`,
            message: `An intense read! ${userName} sees everything.`,
            icon: "fa-solid fa-user-secret",
        });
        */
    } else if (isNat1) {
        let message = `${userName}'s hole die: <strong>${myHoleValue}</strong>`;
        if (myCheated) {
            message += `<br><span style="color: #ff6666;">They've CHEATED!</span>`;
        }

        await ChatMessage.create({
            content: `<div class="tavern-skill-result success">
        <strong>Counter-Read!</strong><br>${message}
      </div>`,
            flavor: `Investigation vs Deception — ${userName} got exposed!`,
            whisper: [targetId],
            blind: true, // V3.5.2: Hide from GM-as-NPC
            // rolls: [roll], // V4.7.9: Suppress DSN
        });

        await ChatMessage.create({
            content: `<div class="tavern-skill-result failure">
        <strong>Exposed!</strong><br>
        Your poker face cracked. ${targetName} read YOU instead!
      </div>`,
            flavor: `${userName} rolled ${d20} + ${invMod} = ${attackTotal} — <strong style="color: #ff4444;">NAT 1!</strong>`,
            whisper: [userId],
            blind: true, // V3.5.2: Hide from GM-as-NPC
            // rolls: [roll], // V4.7.9: Suppress DSN
        });

        /* Suppressed Public Card
        await createChatCard({
            title: "Profile",
            subtitle: `${userName} overreaches`,
            message: `The tables turned! ${targetName} read ${userName} instead!`,
            icon: "fa-solid fa-face-flushed",
        });
        */

    } else if (success) {
        // Standard Success: Boolean Yes/No only
        const resultText = targetCheated
            ? `<span style="color: #ff6666; font-weight: bold;">YES</span>`
            : `<span style="color: #88ff88; font-weight: bold;">NO</span>`;

        await ChatMessage.create({
            content: `<div class="tavern-skill-result success">
        <strong>Profile Success</strong><br>
        Has ${targetName} cheated?<br>
        Answer: ${resultText}
      </div>`,
            flavor: `${userName} rolled ${d20} + ${invMod} = ${attackTotal} vs passive ${defenseTotal} — Success!`,
            whisper: [userId],
            blind: true, // V3.5.2: Hide from GM-as-NPC
            rolls: [roll],
        });

        /* Suppressed Public Card
        await createChatCard({
            title: "Profile",
            subtitle: `${userName} studies ${targetName}`,
            message: `A solid read. Information gathered.`,
            icon: "fa-solid fa-user-secret",
        });
        */
    } else {
        // Failure: No info
        await ChatMessage.create({
            content: `<div class="tavern-skill-result failure">
        <strong>Failed Read</strong><br>
        You can't get a read on them.
      </div>`,
            flavor: `${userName} rolled ${d20} + ${invMod} = ${attackTotal} vs passive ${defenseTotal} — Failed!`,
            whisper: [userId],
            blind: true, // V3.5.2: Hide from GM-as-NPC
            rolls: [roll],
        });

        /* Suppressed Public Card
        await createChatCard({
            title: "Profile",
            subtitle: `${userName} overreaches`,
            message: `${targetName} kept their composure.`,
            icon: "fa-solid fa-eye",
        });
        */
    }

    // Track profile
    const profiledBy = { ...tableData.profiledBy };
    if (!profiledBy[targetId]) profiledBy[targetId] = [];
    profiledBy[targetId].push(userId);
    tableData.profiledBy = profiledBy;

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

    tableData.skillUsedThisTurn = true;

    // V4.8.40: Mark usage
    const usedSkills = { ...tableData.usedSkills };
    if (!usedSkills[userId]) usedSkills[userId] = {};
    usedSkills[userId] = { ...usedSkills[userId], profile: true };
    tableData.usedSkills = usedSkills;

    return updateState({ tableData });
}
