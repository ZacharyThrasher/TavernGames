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
import { getActorForUser, getGMUserIds, notifyUser } from "../utils/actors.js";
import { createChatCard, addHistoryEntry, playSound } from "../../ui/chat.js";

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
    if (targetUser?.isGM) {
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

    const invMod = actor?.system?.skills?.inv?.total ?? 0;
    const attackTotal = d20 + invMod;

    // Target's passive Deception
    const decMod = targetActor?.system?.skills?.dec?.total ?? 0;
    const defenseTotal = 10 + decMod;

    const success = !isNat1 && attackTotal >= defenseTotal;

    // Get hole dice info
    const targetRolls = tableData.rolls[targetId] ?? [];
    const targetHoleDie = targetRolls.find(r => !r.public);
    const targetHoleValue = targetHoleDie?.result ?? "?";

    const myRolls = tableData.rolls[userId] ?? [];
    const myHoleDie = myRolls.find(r => !r.public);
    const myHoleValue = myHoleDie?.result ?? "?";

    // Cheat info
    const targetCheated = !!tableData.cheaters?.[targetId];
    const targetCheatDice = tableData.cheaters?.[targetId]?.cheats?.map(c => c.dieIndex + 1) ?? [];
    const myCheated = !!tableData.cheaters?.[userId];

    const gmIds = getGMUserIds();

    if (isNat20) {
        let message = `${targetName}'s hole die: <strong>${targetHoleValue}</strong>`;
        if (targetCheated) {
            message += `<br><span style="color: #ff6666;">They've CHEATED! (Die ${targetCheatDice.join(", ")})</span>`;
        } else {
            message += `<br><span style="color: #88ff88;">They appear clean.</span>`;
        }

        await ChatMessage.create({
            content: `<div class="tavern-skill-result success">
        <strong>Perfect Read!</strong><br>${message}
      </div>`,
            flavor: `${userName} rolled ${d20} + ${invMod} = ${attackTotal} vs passive ${defenseTotal} — <strong style="color: gold;">NAT 20!</strong>`,
            whisper: [userId, ...gmIds],
            rolls: [roll],
        });

        await createChatCard({
            title: "Profile",
            subtitle: `${userName} stares down ${targetName}`,
            message: `An intense read! ${userName} sees everything.`,
            icon: "fa-solid fa-user-secret",
        });
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
            whisper: [targetId, ...gmIds],
            rolls: [roll],
        });

        await ChatMessage.create({
            content: `<div class="tavern-skill-result failure">
        <strong>Exposed!</strong><br>
        Your poker face cracked. ${targetName} read YOU instead!
      </div>`,
            flavor: `${userName} rolled ${d20} + ${invMod} = ${attackTotal} — <strong style="color: #ff4444;">NAT 1!</strong>`,
            whisper: [userId, ...gmIds],
            rolls: [roll],
        });

        await createChatCard({
            title: "Profile",
            subtitle: `${userName} overreaches`,
            message: `The tables turned! ${targetName} read ${userName} instead!`,
            icon: "fa-solid fa-face-flushed",
        });
        await playSound("lose");
    } else if (success) {
        await ChatMessage.create({
            content: `<div class="tavern-skill-result success">
        <strong>Profile Success</strong><br>
        ${targetName}'s hole die: <strong>${targetHoleValue}</strong>
      </div>`,
            flavor: `${userName} rolled ${d20} + ${invMod} = ${attackTotal} vs passive ${defenseTotal} — Success!`,
            whisper: [userId, ...gmIds],
            rolls: [roll],
        });

        await createChatCard({
            title: "Profile",
            subtitle: `${userName} studies ${targetName}`,
            message: `A solid read. Information gathered.`,
            icon: "fa-solid fa-user-secret",
        });
    } else {
        await ChatMessage.create({
            content: `<div class="tavern-skill-result success">
        <strong>Counter-Read!</strong><br>
        ${userName}'s hole die: <strong>${myHoleValue}</strong>
      </div>`,
            flavor: `Investigation vs Deception — ${userName} got read!`,
            whisper: [targetId, ...gmIds],
            rolls: [roll],
        });

        await ChatMessage.create({
            content: `<div class="tavern-skill-result failure">
        <strong>Failed Read</strong><br>
        Your attempt to read them revealed yourself instead!
      </div>`,
            flavor: `${userName} rolled ${d20} + ${invMod} = ${attackTotal} vs passive ${defenseTotal} — Failed!`,
            whisper: [userId, ...gmIds],
            rolls: [roll],
        });

        await createChatCard({
            title: "Profile",
            subtitle: `${userName} overreaches`,
            message: `${targetName} saw right through the attempt!`,
            icon: "fa-solid fa-eye",
        });
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

    return updateState({ tableData });
}
