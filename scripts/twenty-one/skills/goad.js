/**
 * Tavern Twenty-One - Goad Skill Module
 * V3.0
 * 
 * Goad (CHA): Try to force another player to ROLL.
 * - Only during betting phase, on your turn (bonus action)
 * - Once per round per player
 * - Attacker: Intimidation OR Persuasion vs Defender: Insight
 * - Success: Target must roll or pay 1x ante to resist
 * - Backfire: Attacker pays 1x ante to pot
 * - Nat 20: Target cannot pay to resist
 * - Nat 1: Backfire + attacker forced to roll
 * - Sloppy/Folded players cannot be goaded
 */

import { MODULE_ID, getState, updateState, addHistoryEntry } from "../../state.js";
import { deductFromActor, getActorForUser, notifyUser } from "../utils/actors.js";
import { createChatCard } from "../../ui/chat.js";
import { emptyTableData } from "../constants.js";
import { tavernSocket } from "../../socket.js";

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
    if (tableData.goadedThisRound?.[userId]) {
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

    // V4.7.7: Cinematic Pause (Let the intro breathe!)
    await new Promise(resolve => setTimeout(resolve, 3500));

    // Get actors
    const attackerActor = getActorForUser(userId);
    const defenderActor = getActorForUser(targetId);
    const attackerName = attackerActor?.name ?? game.users.get(userId)?.name ?? "Unknown";
    const defenderName = defenderActor?.name ?? game.users.get(targetId)?.name ?? "Unknown";

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

    // V3: Check for Nat 20/Nat 1
    const isNat20 = attackD20Raw === 20;
    const isNat1 = attackD20Raw === 1;

    // Roll defender's Insight (Iron Liver: Sloppy = disadvantage)
    const isDefenderSloppy = tableData.sloppy?.[targetId] ?? false;
    const defendRoll = await new Roll(isDefenderSloppy ? "2d20kl1" : "1d20").evaluate();
    const defendD20 = defendRoll.total;
    const defendMod = defenderActor?.system?.skills?.ins?.total ?? 0;
    const defendTotal = defendD20 + defendMod;

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
    const resultData = {
        attackerRoll: attackTotal,
        defenderRoll: defendTotal,
        outcome: attackerWins ? "SUCCESS" : "RESISTED",
        outcomeClass: attackerWins ? "success" : "failure"
    };
    tavernSocket.executeForEveryone("showSkillResult", "GOAD", userId, targetId, resultData);

    // Post the premium goad card
    // V4.7.6: Suppressed in favor of Result Overlay
    /*
    await ChatMessage.create({
        content: `<div class="tavern-goad-card">
        ... (omitted for brevity) ...
    </div>`,
        speaker: { alias: "Tavern Twenty-One" },
        rolls: [attackRoll, defendRoll],
    });
    */

    // Track that this player has goaded this round
    const updatedGoadedThisRound = { ...tableData.goadedThisRound, [userId]: true };
    const updatedGoadBackfire = { ...tableData.goadBackfire };

    if (attackerWins) {
        // Target must roll - remove their hold status if they were holding
        const updatedHolds = { ...tableData.holds };
        if (updatedHolds[targetId]) {
            delete updatedHolds[targetId];
        }

        // V3: Target can pay to resist, unless Nat 20
        updatedGoadBackfire[targetId] = {
            mustRoll: true,
            goadedBy: userId,
            canPayToResist: !isNat20,
            resistCost: ante,
        };


        const updatedTableData = {
            ...tableData,
            holds: updatedHolds,
            goadedThisRound: updatedGoadedThisRound,
            goadBackfire: updatedGoadBackfire,
            skillUsedThisTurn: true,
        };

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
                ? `${attackerName} CRITICALLY goaded ${defenderName}! No escape!`
                : `${attackerName} goaded ${defenderName} (can resist for ${ante}gp)`,
        });

        return updateState({ tableData: updatedTableData });
    } else {
        // V3: Backfire = attacker pays 1x ante to pot
        const newPot = state.pot + ante;
        await deductFromActor(userId, ante);

        // V4: "Dared" condition - attacker can ONLY buy d20 or Fold
        // This applies immediately and overrides mustRoll
        const updatedDared = { ...tableData.dared, [userId]: true };

        // V3: Nat 1 = also forced to roll (d20 only due to Dared)
        if (isNat1) {
            updatedGoadBackfire[userId] = { mustRoll: true, goadedBy: targetId };
        }


        const updatedTableData = {
            ...tableData,
            goadedThisRound: updatedGoadedThisRound,
            goadBackfire: updatedGoadBackfire,
            dared: updatedDared, // V4: Add dared state
            skillUsedThisTurn: true,
        };

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
                ? `${attackerName}'s goad CRITICALLY backfired! Pays ${ante}gp AND must roll!`
                : `${attackerName}'s goad backfired! Pays ${ante}gp to the pot.`,
        });

        return updateState({ tableData: updatedTableData, pot: newPot });
    }
}

/**
 * V3: Resist a goad by paying 1x ante to the pot
 * @param {string} userId - The player resisting
 */
export async function resistGoad(userId) {
    const state = getState();
    if (state.status !== "PLAYING") return state;

    const tableData = state.tableData ?? emptyTableData();
    const ante = game.settings.get(MODULE_ID, "fixedAnte");

    const goadState = tableData.goadBackfire?.[userId];
    if (!goadState?.canPayToResist) {
        await notifyUser(userId, "You cannot pay to resist this goad.");
        return state;
    }

    const cost = goadState.resistCost ?? ante;
    const canAfford = await deductFromActor(userId, cost);
    if (!canAfford) {
        await notifyUser(userId, `You need ${cost}gp to resist the goad.`);
        return state;
    }

    // Add to pot
    const newPot = state.pot + cost;

    // Remove goad state
    const updatedGoadBackfire = { ...tableData.goadBackfire };
    delete updatedGoadBackfire[userId];

    const actor = getActorForUser(userId);
    const userName = actor?.name ?? game.users.get(userId)?.name ?? "Unknown";

    await createChatCard({
        title: "Goad Resisted",
        subtitle: `${userName} pays ${cost}gp`,
        message: `Ignoring the goad and staying composed.`,
        icon: "fa-solid fa-hand-holding-dollar",
    });

    await addHistoryEntry({
        type: "goad_resisted",
        player: userName,
        cost,
        message: `${userName} paid ${cost}gp to resist a goad.`,
    });

    return updateState({
        pot: newPot,
        tableData: { ...tableData, goadBackfire: updatedGoadBackfire },
    });
}
