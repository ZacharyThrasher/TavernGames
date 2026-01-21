import { MODULE_ID, getState, updateState } from "../state.js";
import { getActorForUser } from "./actors.js";
import { createChatCard, playSound } from "./chat.js";
import { tavernSocket } from "../../socket.js";

// V2.0: d12 removed, variable costs
export const VALID_DICE = [20, 10, 8, 6, 4];
export const OPENING_ROLLS_REQUIRED = 2;
export const OPENING_DIE = 10;

/**
 * V3.0 Economy: Get the cost for rolling a specific die
 * d20 = ½ ante, d10 = ½ ante, d6/d8 = 1x ante, d4 = 2x ante
 */
export function getDieCost(die, ante) {
    switch (die) {
        case 20: return Math.floor(ante / 2);     // V3: ½ Ante (not free)
        case 10: return Math.floor(ante / 2);     // ½ Ante - The Builder
        case 8: return ante;                      // 1x Ante - Standard
        case 6: return ante;                      // 1x Ante - Standard
        case 4: return ante * 2;                  // 2x Ante - Precision
        default: return ante;
    }
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
    const actor = getActorForUser(userId);
    const playerName = actor?.name ?? game.users.get(userId)?.name ?? "Unknown";

    // Calculate DC: 10 + (2 per drink this round)
    const currentDrinks = tableData.drinkCount?.[userId] ?? 0;
    const newDrinkTotal = currentDrinks + drinksNeeded;
    const dc = 10 + (2 * newDrinkTotal);

    // Roll CON save
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
        await createChatCard({
            title: "Passed Out!",
            subtitle: `${playerName} had one too many...`,
            message: `<strong>${playerName}</strong> tried to drink ${drinksNeeded} ${drinksNeeded === 1 ? 'drink' : 'drinks'} (DC ${dc})<br>
        <span style="color: #ff6666;">Rolled: ${d20} + ${conMod} = ${total}</span><br>
        <strong style="color: #ff4444;">NAT 1! They pass out cold!</strong>`,
            icon: "fa-solid fa-skull",
        });
        await playSound("lose");
    } else if (!success) {
        // Failed save - gain Sloppy condition
        sloppy = true;
        updatedSloppy[userId] = true;
        await createChatCard({
            title: "Getting Sloppy...",
            subtitle: `${playerName} can't hold their liquor!`,
            message: `<strong>${playerName}</strong> tried to drink ${drinksNeeded} ${drinksNeeded === 1 ? 'drink' : 'drinks'} (DC ${dc})<br>
        <span style="color: #ffaa66;">Rolled: ${d20} + ${conMod} = ${total}</span><br>
        <em style="color: #ffaa66;">SLOPPY: Disadvantage on INT/WIS/CHA/DEX checks!</em>`,
            icon: "fa-solid fa-wine-glass",
        });
        await playSound("coins");
    } else {
        // Success - handled it like a champ
        await createChatCard({
            title: "Iron Liver!",
            subtitle: `${playerName} takes a drink...`,
            message: `<strong>${playerName}</strong> downed ${drinksNeeded} ${drinksNeeded === 1 ? 'drink' : 'drinks'} (DC ${dc})<br>
        <span style="color: #88ff88;">Rolled: ${d20} + ${conMod} = ${total}</span><br>
        <em>"Put it on my tab!"</em>`,
            icon: "fa-solid fa-beer-mug-empty",
        });
        await playSound("coins");
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

    // V3: Find next player who hasn't held, busted, or folded
    for (let i = 1; i <= order.length; i++) {
        const nextIndex = (currentIndex + i) % order.length;
        const nextId = order[nextIndex];
        if (!tableData.holds[nextId] && !tableData.busts[nextId] && !tableData.folded?.[nextId]) {
            return nextId;
        }
    }
    return null;
}

export function allPlayersFinished(state, tableData) {
    // V3: Use betting order if available, include folded players
    const order = tableData.bettingOrder ?? state.turnOrder;
    return order.every((id) => tableData.holds[id] || tableData.busts[id] || tableData.folded?.[id]);
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
