import { MODULE_ID, getState, updateState, addLogToAll } from "../../state.js"; // V5.8
import { getActorForUser, getActorName } from "./actors.js"; // V5.9
// import { createChatCard } from "../../ui/chat.js"; // Removed
import { tavernSocket } from "../../socket.js";
import { getDieCost } from "../constants.js";

// V2.0: d12 removed, variable costs
export const VALID_DICE = [20, 10, 8, 6, 4];
export const OPENING_ROLLS_REQUIRED = 2;
export const OPENING_DIE = 10;

/**
 * V3.5: Check if a user is acting as "the house" (GM not playing as NPC)
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
 * V3.0 Economy: Get the cost for rolling a specific die
 * d20 = ½ ante, d10 = ½ ante, d6/d8 = 1x ante, d4 = 2x ante
 * @deprecated Use constants.js getDieCost instead
 */
export function getDieCostLegacy(die, ante) {
    return getDieCost(die, ante);
}

/**
 * Calculate the cost of an accusation
 * @param {number} ante 
 * @returns {number}
 */
export function getAccusationCost(ante) {
    return ante * 2;
}

/**
 * Calculate the cost of an inspection
 * @param {number} pot 
 * @returns {number}
 */
export function getInspectionCost(pot) {
    return Math.floor(pot / 2);
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
        .filter(p => !tableData.sloppy?.[p.id] && !tableData.folded?.[p.id]) // V3: Can't goad Sloppy or Folded
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
    // V5.9: Use getActorName
    const playerName = getActorName(userId);

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
            message: `<strong>${playerName}</strong> drank too much...<br>
                Attempt: ${drinksNeeded} ${drinksNeeded === 1 ? 'drink' : 'drinks'} (DC ${dc})<br>
                Rolled: <strong>${d20}</strong> + ${conMod} = ${total}<br>
                <strong style="color: #ff4444;">NAT 1! They pass out cold! (BUST)</strong>`,
            icon: "fa-solid fa-skull",
            type: "system",
            cssClass: "failure"
        }, [], userId);

    } else if (!success) {
        // Failed save - gain Sloppy condition
        sloppy = true;
        updatedSloppy[userId] = true;

        // V5.7: Sloppy reveals Hole Die!
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
            message: `<strong>${playerName}</strong> is stumbling around!<br>
                Attempt: ${drinksNeeded} drinks (DC ${dc})<br>
                Rolled: ${d20} + ${conMod} = ${total} (Fail)<br>
                <em>SLOPPY! Disadvantage on checks!</em>${holeDieRevealedMsg}`,
            icon: "fa-solid fa-wine-glass",
            type: "system",
            cssClass: "warning"
        }, [], userId);

    } else {
        // Success - handled it like a champ
        await addLogToAll({
            title: "Iron Liver!",
            message: `<strong>${playerName}</strong> downs ${drinksNeeded} ${drinksNeeded === 1 ? 'drink' : 'drinks'} like water!<br>
                <em>"Put it on my tab!"</em> (DC ${dc} Success)`,
            icon: "fa-solid fa-beer-mug-empty",
            type: "system",
            cssClass: "success"
        }, [], userId);

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
    // V2.0: Use betting order if available (sorted by visible total), else use join order
    const order = tableData.bettingOrder ?? state.turnOrder;
    if (!order.length) return null;

    const currentIndex = tableData.currentPlayer
        ? order.indexOf(tableData.currentPlayer)
        : -1;

    // V3.4: Find next player who hasn't held, busted, folded, or been caught
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
    // V3.4: Use betting order if available, include folded and caught players
    const order = tableData.bettingOrder ?? state.turnOrder;
    return order.every((id) => tableData.holds[id] || tableData.busts[id] || tableData.folded?.[id] || tableData.caught?.[id]);
}

/**
 * V2.0: Sort players by visible total (ascending) for betting phase turn order
 * Lowest visible total goes first
 */
export function calculateBettingOrder(state, tableData) {
    const visibleTotals = tableData.visibleTotals ?? {};
    return [...state.turnOrder].sort((a, b) => {
        const totalA = visibleTotals[a] ?? 0;
        const totalB = visibleTotals[b] ?? 0;
        return totalA - totalB; // Ascending: lowest goes first
    });
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

export function getGMUserIds() {
    return game.users.filter(u => u.isGM).map(u => u.id);
}