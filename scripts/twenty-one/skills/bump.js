/**
 * Tavern Twenty-One - Bump Skill Module
 * V3.0
 * 
 * Bump the Table: Try to force another player to re-roll one of their dice.
 * - Only during betting phase, on your turn (bonus action)
 * - Once per round per player
 * - V3: STR vs STR (was Athletics vs DEX save)
 * - If attacker wins: target's chosen die is re-rolled
 * - If attacker loses: target chooses one of attacker's dice to re-roll
 * - Nat 20: Bonus reroll
 * - Nat 1: Backfire + pay 1× ante
 */

import { MODULE_ID, getState, updateState, addHistoryEntry } from "../../state.js";
import { deductFromActor, getActorForUser, notifyUser } from "../utils/actors.js";
import { createChatCard } from "../../ui/chat.js";
import { emptyTableData } from "../constants.js";
import { tavernSocket } from "../../socket.js";
import { showPublicRoll } from "../../dice.js";

/**
 * Bump the table to force a die reroll.
 * @param {object} payload - { targetId, dieIndex }
 * @param {string} userId - The bumping player
 */
export async function bumpTable(payload, userId) {
    const state = getState();
    if (state.status !== "PLAYING") {
        ui.notifications.warn("Cannot bump the table outside of an active round.");
        return state;
    }

    const tableData = state.tableData ?? emptyTableData();

    // Must be in betting phase
    if (tableData.phase !== "betting") {
        ui.notifications.warn("You can only bump the table during the betting phase.");
        return state;
    }

    // V3.5: House cannot bump (but GM-as-NPC can)
    const user = game.users.get(userId);
    const playerData = state.players?.[userId];
    const isHouse = user?.isGM && !playerData?.playingAsNpc;
    if (isHouse) {
        ui.notifications.warn("The house does not bump the table.");
        return state;
    }

    // Player must not have busted or held
    if (tableData.busts?.[userId]) {
        ui.notifications.warn("You busted - you can't bump the table!");
        return state;
    }
    if (tableData.holds?.[userId]) {
        ui.notifications.warn("You've already held - you can't bump the table!");
        return state;
    }

    // Player can only bump once per round
    if (tableData.bumpedThisRound?.[userId]) {
        ui.notifications.warn("You've already bumped the table this round.");
        return state;
    }

    // Limit: One skill per turn
    if (tableData.skillUsedThisTurn) {
        await notifyUser(userId, "You have already used a skill this turn.");
        return state;
    }

    const { targetId } = payload;
    const dieIndex = Number(payload.dieIndex);

    // Validate target
    if (!targetId || targetId === userId) {
        ui.notifications.warn("You can't bump your own dice!");
        return state;
    }

    const targetUser = game.users.get(targetId);
    // V3.5: Allow targeting GM-as-NPC, only block house
    const isTargetHouse = targetUser?.isGM && !state.players?.[targetId]?.playingAsNpc;
    if (isTargetHouse) {
        ui.notifications.warn("You can't bump the house's dice!");
        return state;
    }

    if (tableData.busts?.[targetId]) {
        ui.notifications.warn("That player has already busted.");
        return state;
    }

    // Validate target has dice and dieIndex is valid
    const targetRolls = tableData.rolls?.[targetId] ?? [];
    if (targetRolls.length === 0) {
        ui.notifications.warn("That player has no dice to bump.");
        return state;
    }

    if (Number.isNaN(dieIndex) || dieIndex < 0 || dieIndex >= targetRolls.length) {
        ui.notifications.warn("Invalid die selection.");
        return state;
    }

    // V3: Must be your turn (skill is bonus action)
    if (tableData.currentPlayer !== userId) {
        await notifyUser(userId, "You can only Bump on your turn.");
        return state;
    }

    // V3: Can't bump Folded players
    if (tableData.folded?.[targetId]) {
        await notifyUser(userId, "That player has folded - they're untargetable!");
        return state;
    }

    // V4: Can't bump Held players (locked in their position)
    if (tableData.holds?.[targetId]) {
        await notifyUser(userId, "That player has held - they're locked in!");
        return state;
    }

    // V3: Mark as acted (affects Fold refund)
    tableData.hasActed = { ...tableData.hasActed, [userId]: true };

    // V4.7.4: Bump Showdown Cut-In
    tavernSocket.executeForEveryone("showSkillCutIn", "BUMP", userId, targetId);

    // V4.7.7: Impact Pause (Moved below rolls for Dice3D sync)
    // await new Promise(resolve => setTimeout(resolve, 3000));

    const ante = game.settings.get(MODULE_ID, "fixedAnte");

    // Get actor info
    const actualAttackerActor = getActorForUser(userId);
    const attackerName = actualAttackerActor?.name ?? game.users.get(userId)?.name ?? "Unknown";
    const targetActor = getActorForUser(targetId);
    const targetName = targetActor?.name ?? game.users.get(targetId)?.name ?? "Unknown";

    // V3: Roll STR vs STR (not Athletics vs DEX save)
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

    // V4.7.8: Dice So Nice & Sync Pause
    showPublicRoll(attackerRoll, userId);
    showPublicRoll(defenderRoll, targetId);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // V3: Check for Nat 20/Nat 1
    const isNat20 = attackerD20Raw === 20;
    const isNat1 = attackerD20Raw === 1;

    // Determine winner (Nat 1 always fails)
    const success = !isNat1 && attackerTotal > defenderTotal;

    // Build nat effect messages
    let nat20Effect = "";
    let nat1Effect = "";
    if (isNat20 && success) {
        nat20Effect = "<br><strong style='color: gold;'>NAT 20! Bonus reroll!</strong>";
    }
    if (isNat1) {
        nat1Effect = "<br><strong style='color: #ff4444;'>NAT 1! Backfire + pay 1× ante!</strong>";
    }

    // V4.7.6: Result Overlay
    const resultData = {
        attackerRoll: attackerTotal,
        defenderRoll: defenderTotal,
        outcome: success ? "SUCCESS" : "FAIL",
        outcomeClass: success ? "success" : "failure"
    };
    tavernSocket.executeForEveryone("showSkillResult", "BUMP", userId, targetId, resultData);

    // Post the bump card
    // V4.7.6: Suppressed in favor of Result Overlay
    /*
    await ChatMessage.create({
        content: `<div class="tavern-bump-card">
         ... (omitted for brevity) ...
    </div>`,
        speaker: { alias: "Tavern Twenty-One" },
        // rolls: [attackerRoll, defenderRoll], // V4.7.9: Removed to prevent DSN dupe
    });
    */

    // Mark that attacker has bumped this round
    const updatedBumpedThisRound = { ...tableData.bumpedThisRound, [userId]: true };
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

        // Keep the same visibility status - bumped hole die stays hidden!
        const newTargetRolls = [...targetRolls];
        newTargetRolls[dieIndex] = { ...targetDie, result: newValue, public: wasPublic };

        // Calculate new total
        const newTotal = newTargetRolls.reduce((sum, r) => sum + r.result, 0);
        const oldTotal = tableData.totals?.[targetId] ?? 0;
        const targetBusted = newTotal > 21;

        // Update visible total if the bumped die was public
        const updatedVisibleTotals = { ...tableData.visibleTotals };
        if (wasPublic) {
            updatedVisibleTotals[targetId] = (updatedVisibleTotals[targetId] ?? 0) - oldValue + newValue;
        }

        // Update state
        const updatedRolls = { ...tableData.rolls, [targetId]: newTargetRolls };
        const updatedTotals = { ...tableData.totals, [targetId]: newTotal };
        const updatedBusts = { ...tableData.busts };
        if (targetBusted) {
            updatedBusts[targetId] = true;
            // V4.1: Explicitly log the bust
            await addHistoryEntry({
                type: "bust",
                player: targetName,
                total: newTotal,
                message: `${targetName} BUSTED with ${newTotal} after being bumped!`,
            });
        }

        const updatedTableData = {
            ...tableData,
            rolls: updatedRolls,
            totals: updatedTotals,
            visibleTotals: updatedVisibleTotals,
            busts: updatedBusts,
            bumpedThisRound: updatedBumpedThisRound,
        };

        // V4.2: Bump Impact
        try {
            await tavernSocket.executeForEveryone("playBumpEffect", targetId);
        } catch (e) { console.warn(e); }

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
                : `${attackerName} bumped ${targetName}'s hole die (d${dieSides})!`,
        });

        // Create success chat card
        const oldVisibleTotal = tableData.visibleTotals?.[targetId] ?? 0;
        const newVisibleTotal = updatedVisibleTotals[targetId] ?? 0;

        let resultMessage = wasPublic
            ? `<strong>${targetName}'s</strong> d${dieSides} (was ${oldValue}) → <strong>${newValue}</strong><br>Visible Total: ${oldVisibleTotal} → <strong>${newVisibleTotal}</strong>`
            : `<strong>${targetName}'s</strong> hole die (d${dieSides}) was bumped!<br><em>The new value remains hidden...</em>`;

        if (targetBusted && wasPublic) {
            resultMessage += `<br><span style="color: #ff6666; font-weight: bold;">BUST!</span>`;
        }

        await createChatCard({
            title: "Table Bump!",
            subtitle: `${attackerName} vs ${targetName}`,
            message: `
        <div style="text-align: center; padding: 8px; background: rgba(74, 124, 78, 0.3); border: 1px solid #4a7c4e; border-radius: 4px; margin-top: 8px;">
          <div style="color: #aaffaa; font-weight: bold;">SUCCESS!${!wasPublic ? ' (Hole Die)' : ''}</div>
          <div style="margin-top: 4px;">${resultMessage}</div>
        </div>
      `,
            icon: "fa-solid fa-hand-fist",
        });



        return updateState({ tableData: { ...updatedTableData, skillUsedThisTurn: true } });

    } else {
        // FAILURE: Set pending retaliation state - target chooses attacker's die
        // V3: Nat 1 also pays 1× ante
        if (isNat1) {
            await deductFromActor(userId, ante);
            newPot = state.pot + ante;
        }

        const updatedTableData = {
            ...tableData,
            bumpedThisRound: updatedBumpedThisRound,
            pendingBumpRetaliation: {
                attackerId: userId,
                targetId: targetId,
            },
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

        // Create failure chat card (awaiting retaliation)
        await createChatCard({
            title: "Table Bump!",
            subtitle: `${attackerName} vs ${targetName}`,
            message: `
        <div style="text-align: center; padding: 8px; background: rgba(139, 58, 58, 0.3); border: 1px solid #8b3a3a; border-radius: 4px; margin-top: 8px;">
          <div style="color: #ffaaaa; font-weight: bold;">CAUGHT!</div>
          <div style="margin-top: 4px;"><strong>${targetName}</strong> catches their dice!</div>
          <div style="margin-top: 4px; font-style: italic; color: #ffcc88;">Awaiting retaliation...</div>
        </div>
      `,
            icon: "fa-solid fa-hand-fist",
        });

        return updateState({ tableData: { ...updatedTableData, skillUsedThisTurn: true }, pot: newPot });
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
        ui.notifications.warn("Cannot complete retaliation outside of an active round.");
        return state;
    }

    const tableData = state.tableData ?? emptyTableData();
    const pending = tableData.pendingBumpRetaliation;

    if (!pending) {
        ui.notifications.warn("No pending bump retaliation.");
        return state;
    }

    // Only the target or GM can complete retaliation
    const user = game.users.get(userId);
    const isTarget = userId === pending.targetId;
    const isGM = user?.isGM;

    if (!isTarget && !isGM) {
        ui.notifications.warn("Only the target or GM can choose the retaliation die.");
        return state;
    }

    const dieIndex = Number(payload?.dieIndex);
    const attackerId = pending.attackerId;
    const targetId = pending.targetId;

    // Validate attacker has dice and dieIndex is valid
    const attackerRolls = tableData.rolls?.[attackerId] ?? [];
    if (attackerRolls.length === 0) {
        ui.notifications.warn("Attacker has no dice to re-roll.");
        return state;
    }

    if (Number.isNaN(dieIndex) || dieIndex < 0 || dieIndex >= attackerRolls.length) {
        ui.notifications.warn("Invalid die selection.");
        return state;
    }

    // Get names
    const attackerActor = game.users.get(attackerId)?.character;
    const attackerName = attackerActor?.name ?? game.users.get(attackerId)?.name ?? "Unknown";
    const targetActor = game.users.get(targetId)?.character;
    const targetName = targetActor?.name ?? game.users.get(targetId)?.name ?? "Unknown";

    // Re-roll attacker's die
    const attackerDie = attackerRolls[dieIndex];
    const oldValue = attackerDie.result;
    const dieSides = attackerDie.die;
    const wasPublic = attackerDie.public ?? true;

    const reroll = await new Roll(`1d${dieSides}`).evaluate();
    const newValue = reroll.total;

    // Update attacker's rolls - preserve visibility
    const newAttackerRolls = [...attackerRolls];
    newAttackerRolls[dieIndex] = { ...attackerDie, result: newValue, public: wasPublic };

    // Calculate new total
    const newTotal = newAttackerRolls.reduce((sum, r) => sum + r.result, 0);
    const oldTotal = tableData.totals?.[attackerId] ?? 0;
    const attackerBusted = newTotal > 21;

    // Update visible total if the die was public
    const updatedVisibleTotals = { ...tableData.visibleTotals };
    if (wasPublic) {
        updatedVisibleTotals[attackerId] = (updatedVisibleTotals[attackerId] ?? 0) - oldValue + newValue;
    }

    // Update state
    const updatedRolls = { ...tableData.rolls, [attackerId]: newAttackerRolls };
    const updatedTotals = { ...tableData.totals, [attackerId]: newTotal };
    const updatedBusts = { ...tableData.busts };
    if (attackerBusted) {
        updatedBusts[attackerId] = true;
    }

    const updatedTableData = {
        ...tableData,
        rolls: updatedRolls,
        totals: updatedTotals,
        visibleTotals: updatedVisibleTotals,
        busts: updatedBusts,
        pendingBumpRetaliation: null, // Clear the pending state
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

    // Create retaliation result chat card
    // Don't reveal values if it was a hole die
    let resultMessage;
    if (wasPublic) {
        const oldVisibleTotal = tableData.visibleTotals?.[attackerId] ?? 0;
        const newVisibleTotal = updatedVisibleTotals[attackerId] ?? 0;

        resultMessage = `<strong>${attackerName}'s</strong> d${dieSides} (was ${oldValue}) → <strong>${newValue}</strong><br>`;
        resultMessage += `Visible Total: ${oldVisibleTotal} → <strong>${newVisibleTotal}</strong>`;
        if (attackerBusted) {
            resultMessage += `<br><span style="color: #ff6666; font-weight: bold;">BUST!</span>`;
        }
    } else {
        resultMessage = `<strong>${attackerName}'s</strong> hole die (d${dieSides}) was re-rolled!<br>`;
        resultMessage += `<em>The new value remains hidden...</em>`;
    }

    await createChatCard({
        title: "Retaliation!",
        subtitle: `${targetName} strikes back`,
        message: `
      <div style="text-align: center; padding: 8px; background: rgba(139, 107, 58, 0.3); border: 1px solid #8b6b3a; border-radius: 4px;">
        <div style="color: #ffcc88; font-weight: bold;">${targetName} chose ${attackerName}'s d${dieSides}</div>
        <div style="margin-top: 8px;">${resultMessage}</div>
      </div>
    `,
        icon: "fa-solid fa-hand-back-fist",
    });



    return updateState({ tableData: updatedTableData });
}
