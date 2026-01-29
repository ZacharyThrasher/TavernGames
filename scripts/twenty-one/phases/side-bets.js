import { MODULE_ID, getState, updateState, addHistoryEntry, addLogToAll, addPrivateLog } from "../../state.js"; // V5.8
import { deductFromActor, getPlayerGold, payOutWinners } from "../../wallet.js";
// import { createChatCard } from "../../ui/chat.js"; // Removed

import { getActorName, getSafeActorName } from "../utils/actors.js"; // V5.9
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

    // Lock window: allow first two full betting rounds
    const sideBetRound = tableData.sideBetRound ?? 1;
    if (sideBetRound > 2) {
        await notifyUser(userId, "Side bets are locked after two betting rounds.");
        return state;
    }

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
    const sideBetPool = (tableData.sideBetPool ?? 0) + amount;

    // V5.9: Use getActorName
    const betterName = getActorName(userId);
    const championName = getActorName(championId);
    const safeBetterName = getSafeActorName(userId);
    const safeChampionName = getSafeActorName(championId);

    await addLogToAll({
        title: "Side Bet",
        message: `<strong>${safeBetterName}</strong> placed a side bet of <strong>${amount}gp</strong> on <strong>${safeChampionName}</strong>!`,
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

    return updateState({ tableData: { ...tableData, sideBets, sideBetPool } });
}

/**
 * V4: Process side bet payouts (called from finishRound)
 * Winners get 2:1 payout on their bets
 */
export async function processSideBetPayouts(winnerId) {
    const state = getState();
    const tableData = state.tableData ?? {};
    const sideBets = tableData.sideBets ?? {};
    const pool = tableData.sideBetPool ?? 0;
    const rawMultiplier = Number(game.settings.get(MODULE_ID, "sideBetPayout") ?? 2.0);
    const payoutMultiplier = Number.isFinite(rawMultiplier) ? rawMultiplier : 2.0;
    const effectivePool = Math.floor(pool * payoutMultiplier);

    const payouts = [];
    const losses = [];

    if (!winnerId || pool <= 0) {
        return [];
    }

    // Aggregate winner bets
    const winnerBets = [];
    let totalWinnerBet = 0;
    for (const [betterId, bets] of Object.entries(sideBets)) {
        const totalBetOnWinner = bets
            .filter(b => b.championId === winnerId)
            .reduce((sum, b) => sum + b.amount, 0);
        if (totalBetOnWinner > 0) {
            winnerBets.push({ betterId, amount: totalBetOnWinner });
            totalWinnerBet += totalBetOnWinner;
        }
    }

    if (totalWinnerBet <= 0) {
        return [];
    }

    for (const { betterId, amount } of winnerBets) {
        const betterName = getActorName(betterId);
        const safeBetterName = getSafeActorName(betterId);
        const payout = Math.floor((amount / totalWinnerBet) * effectivePool);
        await payOutWinners({ [betterId]: payout });
        payouts.push({ name: betterName, safeName: safeBetterName, payout, bet: amount, userId: betterId });
    }

    for (const [betterId, bets] of Object.entries(sideBets)) {
        const betterName = getActorName(betterId);
        const safeBetterName = getSafeActorName(betterId);
        const totalBet = bets.reduce((sum, b) => sum + b.amount, 0);
        const betOnWinner = bets
            .filter(b => b.championId === winnerId)
            .reduce((sum, b) => sum + b.amount, 0);
        const lost = totalBet - betOnWinner;
        if (lost > 0) losses.push({ name: betterName, safeName: safeBetterName, amount: lost });
    }

    const payoutMsg = payouts.map(p => `${p.safeName}: +${p.payout}gp (bet ${p.bet}gp)`).join("<br>");
    const lossMsg = losses.map(l => `${l.safeName}: -${l.amount}gp`).join("<br>");
    const poolLabel = payoutMultiplier !== 1
        ? `${pool}gp (x${payoutMultiplier.toFixed(1)} = ${effectivePool}gp)`
        : `${pool}gp`;

    await addLogToAll({
        title: "Side Bet Results",
        message: `${payouts.length > 0 ? `<strong>Pool Winners:</strong><br>${payoutMsg}<br>` : ""}${losses.length > 0 ? `<strong>Losses:</strong><br>${lossMsg}` : ""}<em>Side Bet Pool: ${poolLabel}</em>`,
        icon: "fa-solid fa-coins",
        type: "system",
        cssClass: payouts.length > 0 ? "success" : "failure"
    });

    // Winner flair (private)
    for (const p of payouts) {
        await addPrivateLog(p.userId, {
            title: "Side Bet Win!",
            message: `You won <strong>${p.payout}gp</strong> from the side‑bet pool.`,
            icon: "fa-solid fa-sack-dollar",
            type: "system",
            cssClass: "success"
        });
    }

    return payouts.map(p => p.userId);
}
