import { MODULE_ID, getState, updateState, addHistoryEntry, addLogToAll, addPrivateLog } from "../../state.js"; // V5.8
import { deductFromActor, getPlayerGold } from "../../wallet.js";
// import { createChatCard } from "../../ui/chat.js"; // Removed

import { getActorForUser, getActorName } from "../utils/actors.js"; // V5.9
import { notifyUser } from "../utils/game-logic.js";

/**
 * V4: Place a side bet on a player to win the round
 * @param {Object} payload - { championId, amount }
 * @param {string} userId - The betting user (spectator, folded, busted, or active player)
 */
export async function placeSideBet(payload, userId) {
    const state = getState();

    // Can only place side bets during active play (not staredown/inspection)
    if (state.status !== "PLAYING") {
        await notifyUser(userId, "Side bets can only be placed during active betting rounds.");
        return state;
    }

    const tableData = state.tableData ?? {};
    const { championId, amount } = payload;
    const ante = game.settings.get(MODULE_ID, "fixedAnte");

    // Validate amount (minimum 1 ante)
    if (!amount || amount < ante) {
        await notifyUser(userId, `Minimum side bet is ${ante}gp (1x ante).`);
        return state;
    }

    // Validate champion
    if (!championId || !state.players?.[championId]) {
        await notifyUser(userId, "Invalid champion selection.");
        return state;
    }

    // V4.1: Double Down allowed (can bet on self)
    // if (championId === userId && state.players?.[userId]) { ... } removed


    // Can't bet on busted or caught players
    if (tableData.busts?.[championId] || tableData.caught?.[championId]) {
        await notifyUser(userId, "That player has already busted or been caught.");
        return state;
    }

    // Check if user can afford the bet
    const currentGold = getPlayerGold(userId);
    if (currentGold < amount) {
        await notifyUser(userId, `You need ${amount}gp to place this bet. You have ${currentGold}gp.`);
        return state;
    }

    // Deduct the bet amount
    const success = await deductFromActor(userId, amount);
    if (!success) {
        await notifyUser(userId, "Could not deduct gold for side bet.");
        return state;
    }



    // Record the side bet
    const sideBets = { ...tableData.sideBets };
    if (!sideBets[userId]) {
        sideBets[userId] = [];
    }
    sideBets[userId].push({ championId, amount });

    // V5.9: Use getActorName
    const betterName = getActorName(userId);
    const championName = getActorName(championId);

    await addLogToAll({
        title: "Side Bet",
        message: `<strong>${betterName}</strong> placed a side bet of <strong>${amount}gp</strong> on <strong>${championName}</strong>!`,
        icon: "fa-solid fa-sack-dollar",
        type: "system"
    }, [], userId);

    await addHistoryEntry({
        type: "side_bet",
        better: betterName,
        champion: championName,
        amount,
        message: `${betterName} bet ${amount}gp on ${championName}.`,
    });

    return updateState({ tableData: { ...tableData, sideBets } });
}

/**
 * V4: Process side bet payouts (called from finishRound)
 * Winners get 2:1 payout on their bets
 */
export async function processSideBetPayouts(winnerId) {
    const state = getState();
    const tableData = state.tableData ?? {};
    const sideBets = tableData.sideBets ?? {};

    const payouts = [];
    const losses = [];

    for (const [betterId, bets] of Object.entries(sideBets)) {
        for (const bet of bets) {
            const betterName = getActorName(betterId); // V5.9

            if (bet.championId === winnerId) {
                // Winner! Configurable payout (Default 2:1)
                const multiplier = game.settings.get(MODULE_ID, "sideBetPayout");
                const payout = Math.floor(bet.amount * multiplier);
                await deductFromActor(betterId, -payout); // Negative deduction = add
                payouts.push({ name: betterName, amount: payout, bet: bet.amount });
            } else {
                // Loser - bet was already deducted
                losses.push({ name: betterName, amount: bet.amount });
            }
        }
    }

    if (payouts.length > 0 || losses.length > 0) {
        const payoutMsg = payouts.map(p => `${p.name}: +${p.payout}gp (bet ${p.bet}gp)`).join("<br>");
        const lossMsg = losses.map(l => `${l.name}: -${l.amount}gp`).join("<br>");

        await addLogToAll({
            title: "Side Bet Results",
            message: `${payouts.length > 0 ? `<strong>Big Winners:</strong><br>${payoutMsg}<br>` : ""}${losses.length > 0 ? `<strong>Losses:</strong><br>${lossMsg}` : ""}`,
            icon: "fa-solid fa-coins",
            type: "system",
            cssClass: payouts.length > 0 ? "success" : "failure"
        });
    }
}
