import { addLogToAll } from "../../state.js";
import { getActorForUser, getSafeActorName } from "./actors.js";
import { tavernSocket } from "../../socket.js";
import { ACCUSATION_COST_MULTIPLIER, OPENING_ROLLS_REQUIRED } from "../constants.js";
import { withWarning } from "./runtime.js";
import { calculateBettingOrderByVisibleTotals } from "../rules/turn-order.js";

/**
 * Returns true if the user is the GM AND they are NOT playing as an NPC.
 * Use this instead of raw `isGM` checks to support GM-as-NPC mode.
 */
export function isActingAsHouse(userId, state) {
    const user = game.users.get(userId);
    if (!user?.isGM) return false;

    // Check if GM is playing as an NPC
    const playerData = state?.players?.[userId];
    if (playerData?.playingAsNpc) return false;

    return true; // GM is acting as the house
}

/**
 * Alias for isActingAsHouse to match previous ad-hoc usage
 */
export const isPlayerHouse = isActingAsHouse;

/**
 * Helper to check if a player is an NPC (GM playing as NPC)
 */
export function isPlayerNpc(userId, state) {
    const user = game.users.get(userId);
    if (!user?.isGM) return false;
    const playerData = state?.players?.[userId];
    return !!playerData?.playingAsNpc;
}

/**
 * Calculate the cost of an accusation
 * @param {number} ante 
 * @returns {number}
 */
export function getAccusationCost(ante) {
    return ante * ACCUSATION_COST_MULTIPLIER;
}

/**
 * Shared guard for skill actions.
 * Returns true if the action can continue; sends user-facing notification on first failure.
 */
export async function validateSkillPrerequisites({
    state,
    tableData,
    userId,
    skillName,
    requireMyTurn = true,
    requireBettingPhase = true,
    disallowInGoblin = true,
    disallowHouse = true,
    disallowIfSkillUsedThisTurn = true,
    disallowIfBusted = true,
    disallowIfFolded = false,
    disallowIfHeld = false,
    oncePerMatchSkill = null,
    messages = {},
}) {
    const label = skillName ?? "this skill";

    if (state.status !== "PLAYING") {
        await notifyUser(userId, messages.outsideRound ?? `Cannot use ${label} outside of an active round.`);
        return false;
    }

    if (disallowInGoblin && tableData?.gameMode === "goblin") {
        await notifyUser(userId, messages.goblinDisabled ?? `${label} is disabled in Goblin Rules.`);
        return false;
    }

    if (requireMyTurn && tableData?.currentPlayer !== userId) {
        await notifyUser(userId, messages.notYourTurn ?? `You can only use ${label} on your turn.`);
        return false;
    }

    if (requireBettingPhase && tableData?.phase !== "betting") {
        await notifyUser(userId, messages.wrongPhase ?? `${label} can only be used during the betting phase.`);
        return false;
    }

    if (disallowHouse && isActingAsHouse(userId, state)) {
        await notifyUser(userId, messages.houseBlocked ?? "The house cannot use that skill.");
        return false;
    }

    if (disallowIfSkillUsedThisTurn && tableData?.skillUsedThisTurn) {
        await notifyUser(userId, messages.alreadyUsedThisTurn ?? "You have already used a skill this turn.");
        return false;
    }

    if (oncePerMatchSkill && tableData?.usedSkills?.[userId]?.[oncePerMatchSkill]) {
        await notifyUser(userId, messages.alreadyUsedMatch ?? `You can only use ${label} once per match.`);
        return false;
    }

    if (disallowIfBusted && tableData?.busts?.[userId]) {
        await notifyUser(userId, messages.selfCannotAct ?? `You can't use ${label} right now.`);
        return false;
    }

    if (disallowIfFolded && tableData?.folded?.[userId]) {
        await notifyUser(userId, messages.selfCannotAct ?? `You can't use ${label} right now.`);
        return false;
    }

    if (disallowIfHeld && tableData?.holds?.[userId]) {
        await notifyUser(userId, messages.selfCannotAct ?? `You can't use ${label} right now.`);
        return false;
    }

    return true;
}

/* ============================================
   Targeting Logic helpers (DRY)
   ============================================ */

/**
 * Get valid targets for the Profile skill
 */
export function getValidProfileTargets(state, userId) {
    const tableData = state.tableData ?? {};
    const players = Object.values(state.players ?? {});

    return players
        .filter(p => p.id !== userId && !tableData.busts?.[p.id] && !isActingAsHouse(p.id, state) && !tableData.folded?.[p.id])
        .map(p => {
            const user = game.users.get(p.id);
            const actor = user?.character;
            const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
            return { id: p.id, name: p.name, img };
        });
}

/**
 * Get valid targets for the Goad skill
 */
export function getValidGoadTargets(state, userId) {
    const tableData = state.tableData ?? {};
    const players = Object.values(state.players ?? {});

    return players
        .filter(p => p.id !== userId && !tableData.busts?.[p.id] && !isActingAsHouse(p.id, state))
        .filter(p => !tableData.sloppy?.[p.id] && !tableData.folded?.[p.id])
        .map(p => {
            const user = game.users.get(p.id);
            const actor = user?.character;
            const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
            const isHolding = tableData.holds?.[p.id] ?? false;
            return { id: p.id, name: p.name, img, isHolding };
        });
}

/**
 * Get valid targets for the Bump skill
 */
export function getValidBumpTargets(state, userId) {
    const tableData = state.tableData ?? {};
    const players = Object.values(state.players ?? {});

    return players
        .filter(p => {
            const isNotSelf = p.id !== userId;
            const isNotBusted = !tableData.busts?.[p.id];
            const isNotHouse = !isActingAsHouse(p.id, state);
            const isNotHeld = !tableData.holds?.[p.id];
            const isNotFolded = !tableData.folded?.[p.id];
            const hasRolls = (tableData.rolls?.[p.id]?.length ?? 0) > 0;
            return isNotSelf && isNotBusted && isNotHouse && isNotHeld && isNotFolded && hasRolls;
        })
        .map(p => {
            const user = game.users.get(p.id);
            const actor = user?.character;
            const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
            const dice = (tableData.rolls?.[p.id] ?? []).map((r, idx) => ({
                index: idx,
                die: r.die,
                result: r.result,
                isPublic: r.public ?? true
            }));
            const isHolding = tableData.holds?.[p.id] ?? false;
            return { id: p.id, name: p.name, img, dice, isHolding };
        });
}

/**
 * Get valid targets for the Goblin Boot action
 */
export function getValidBootTargets(state, userId) {
    const tableData = state.tableData ?? {};
    const players = Object.values(state.players ?? {});

    return players
        .filter(p => {
            const isNotSelf = p.id !== userId;
            const isHolding = tableData.holds?.[p.id];
            const isNotBusted = !tableData.busts?.[p.id];
            const isNotFolded = !tableData.folded?.[p.id];
            const isNotCaught = !tableData.caught?.[p.id];
            const isNotHouse = !isActingAsHouse(p.id, state);
            return isNotSelf && isHolding && isNotBusted && isNotFolded && isNotCaught && isNotHouse;
        })
        .map(p => {
            const user = game.users.get(p.id);
            const actor = user?.character;
            const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
            return { id: p.id, name: p.name, img, isHolding: true };
        });
}

/**
 * Get valid targets for Accusations
 */
export function getValidAccuseTargets(state, userId, accusedThisRound) {
    const tableData = state.tableData ?? {};
    const players = Object.values(state.players ?? {});

    if (accusedThisRound) return [];

    return players
        .filter(p => p.id !== userId && !tableData.busts?.[p.id] && !isActingAsHouse(p.id, state))
        .map(p => {
            const user = game.users.get(p.id);
            const actor = user?.character;
            const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
            return { id: p.id, name: p.name, img };
        });
}

/**
 * Send a notification to a specific user (routes via socket to their client)
 */
export async function notifyUser(userId, message, type = "warn") {
    try {
        await tavernSocket.executeAsUser("showNotification", userId, message, type);
    } catch (e) {
        // Fallback to local notification if socket fails
        ui.notifications[type]?.(message) ?? ui.notifications.warn(message);
    }
}

/**
 * Iron Liver: Liquid Currency - Attempt to pay a cost by drinking instead of paying gold.
 */
export async function drinkForPayment(userId, drinksNeeded, tableData) {
    const safePlayerName = getSafeActorName(userId);

    // Calculate DC: 10 + (2 per drink this round)
    const currentDrinks = tableData.drinkCount?.[userId] ?? 0;
    const newDrinkTotal = currentDrinks + drinksNeeded;
    const dc = 10 + (2 * newDrinkTotal);

    const actor = getActorForUser(userId);
    const conMod = actor?.system?.abilities?.con?.mod ?? 0;
    const roll = await new Roll("1d20").evaluate();
    const d20 = roll.total;
    const total = d20 + conMod;
    const isNat1 = d20 === 1;
    const success = !isNat1 && total >= dc;

    // Update drink count
    const updatedDrinkCount = { ...tableData.drinkCount, [userId]: newDrinkTotal };
    let updatedSloppy = { ...tableData.sloppy };
    let updatedBusts = { ...tableData.busts };
    let bust = false;
    let sloppy = false;

    // Determine result
    if (isNat1) {
        // Critical failure - pass out = bust
        bust = true;
        updatedBusts[userId] = true;

        await addLogToAll({
            title: "Passed Out!",
            message: `<strong>${safePlayerName}</strong> drank too much...<br>
                Attempt: ${drinksNeeded} ${drinksNeeded === 1 ? 'drink' : 'drinks'} (DC ${dc})<br>
                Rolled: <strong>${d20}</strong> + ${conMod} = ${total}<br>
                <strong style="color: #ff4444;">NAT 1! They pass out cold! (BUST)</strong>`,
            icon: "fa-solid fa-skull",
            type: "system",
            cssClass: "failure"
        }, [], userId);

        await withWarning("Could not show drink result banner", () => tavernSocket.executeAsUser("showDrinkResult", userId, {
            title: "Put It On The Tab",
            tone: "failure",
            message: `Con Save: ${d20} + ${conMod} = ${total} vs DC ${dc}<br><strong>Passed out.</strong>`
        }));

    } else if (!success) {
        // Failed save - gain Sloppy condition
        sloppy = true;
        updatedSloppy[userId] = true;
        const playerRolls = tableData.rolls?.[userId] ?? [];
        const holeDieIndex = playerRolls.findIndex(r => !r.public && !r.blind);
        let holeDieRevealedMsg = "";

        // Modify the rolls in tableData (we return tableData override)
        let updatedRolls = { ...tableData.rolls };

        if (holeDieIndex !== -1) {
            const newRolls = [...playerRolls];
            newRolls[holeDieIndex] = { ...newRolls[holeDieIndex], public: true };
            updatedRolls[userId] = newRolls;

            // Also update visible total
            const result = newRolls[holeDieIndex].result;
            const updatedVisibleTotals = { ...tableData.visibleTotals };
            updatedVisibleTotals[userId] = (updatedVisibleTotals[userId] ?? 0) + result;

            // Apply these changes to the tableData we are building
            // Note: We need to make sure we return this in the object below
            tableData = { ...tableData, rolls: updatedRolls, visibleTotals: updatedVisibleTotals };

            holeDieRevealedMsg = `<br><span style="color: #ffaa66;">HOLE DIE REVEALED! (Clumsy!)</span>`;
        }

        await addLogToAll({
            title: "Getting Sloppy...",
            message: `<strong>${safePlayerName}</strong> is stumbling around!<br>
                Attempt: ${drinksNeeded} drinks (DC ${dc})<br>
                Rolled: ${d20} + ${conMod} = ${total} (Fail)<br>
                <em>SLOPPY! Disadvantage on checks!</em>${holeDieRevealedMsg}`,
            icon: "fa-solid fa-wine-glass",
            type: "system",
            cssClass: "warning"
        }, [], userId);

        await withWarning("Could not show drink result banner", () => tavernSocket.executeAsUser("showDrinkResult", userId, {
            title: "Put It On The Tab",
            tone: "warning",
            message: `Con Save: ${d20} + ${conMod} = ${total} vs DC ${dc}<br><strong>Sloppy.</strong> Cut off.`
        }));

        await withWarning("Could not show cut-off banner", () => tavernSocket.executeAsUser("showCutOffBanner", userId, {
            message: "Barkeep slams the bar. You're done. Pay in gold."
        }));

    } else {
        // Success - handled it like a champ
        await addLogToAll({
            title: "Iron Liver!",
            message: `<strong>${safePlayerName}</strong> downs ${drinksNeeded} ${drinksNeeded === 1 ? 'drink' : 'drinks'} like water!<br>
                <em>"Put it on my tab!"</em> (DC ${dc} Success)`,
            icon: "fa-solid fa-beer-mug-empty",
            type: "system",
            cssClass: "success"
        }, [], userId);

        await withWarning("Could not show drink result banner", () => tavernSocket.executeAsUser("showDrinkResult", userId, {
            title: "Put It On The Tab",
            tone: "success",
            message: `Con Save: ${d20} + ${conMod} = ${total} vs DC ${dc}<br><strong>On the house.</strong>`
        }));

    }

    return {
        success: true,
        tableData: {
            ...tableData,
            drinkCount: updatedDrinkCount,
            sloppy: updatedSloppy,
            busts: updatedBusts,
        },
        bust,
        sloppy,
    };
}

export function getNextActivePlayer(state, tableData) {
    const order = tableData.bettingOrder ?? state.turnOrder;
    if (!order.length) return null;

    const currentIndex = tableData.currentPlayer
        ? order.indexOf(tableData.currentPlayer)
        : -1;
    for (let i = 1; i <= order.length; i++) {
        const nextIndex = (currentIndex + i) % order.length;
        const nextId = order[nextIndex];
        if (!tableData.holds[nextId] && !tableData.busts[nextId] && !tableData.folded?.[nextId] && !tableData.caught?.[nextId]) {
            return nextId;
        }
    }
    return null;
}

export function allPlayersFinished(state, tableData) {
    const order = tableData.bettingOrder ?? state.turnOrder;
    return order.every((id) => tableData.holds[id] || tableData.busts[id] || tableData.folded?.[id] || tableData.caught?.[id]);
}

/**
 * Lowest visible total goes first
 */
export function calculateBettingOrder(state, tableData) {
    return calculateBettingOrderByVisibleTotals(state.turnOrder, tableData.visibleTotals ?? {});
}

// Check if all players have completed their opening rolls (2 dice each)
export function allPlayersCompletedOpening(state, tableData) {
    return state.turnOrder.every((id) => {
        const rolls = tableData.rolls[id] ?? [];
        return rolls.length >= OPENING_ROLLS_REQUIRED || tableData.busts[id];
    });
}

// Get next player who needs to roll in opening phase
export function getNextOpeningPlayer(state, tableData) {
    const order = state.turnOrder;
    if (!order.length) return null;

    const currentIndex = tableData.currentPlayer
        ? order.indexOf(tableData.currentPlayer)
        : -1;

    // Find next player who hasn't finished opening rolls and hasn't busted
    for (let i = 1; i <= order.length; i++) {
        const nextIndex = (currentIndex + i) % order.length;
        const nextId = order[nextIndex];
        const rolls = tableData.rolls[nextId] ?? [];
        if (rolls.length < OPENING_ROLLS_REQUIRED && !tableData.busts[nextId]) {
            return nextId;
        }
    }
    return null;
}


