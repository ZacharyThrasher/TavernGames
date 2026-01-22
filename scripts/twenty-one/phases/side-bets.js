import { MODULE_ID, getState, updateState, addHistoryEntry } from "../../state.js";
import { deductFromActor, getPlayerGold } from "../../wallet.js";
import { createChatCard } from "../../ui/chat.js";

import { getActorForUser } from "../utils/actors.js";
import { notifyUser } from "../utils/game-logic.js";

/**
 * V4: Place a side bet on a player to win the round
 * @param {Object} payload - { championId, amount }
 * @param {string} userId - The betting user (spectator, folded, busted, or active player)
 */
export async function placeSideBet(payload, userId) {
    const state = getState();

    // Can only place side bets during active play
    if (state.status !== "PLAYING" && state.status !== "INSPECTION") {
        await notifyUser(userId, "Side bets can only be placed during active rounds.");
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

    const betterActor = getActorForUser(userId);
    const betterName = betterActor?.name ?? game.users.get(userId)?.name ?? "Unknown";
    const championActor = getActorForUser(championId);
    const championName = championActor?.name ?? game.users.get(championId)?.name ?? "Unknown";

    await createChatCard({
        title: "Side Bet",
        subtitle: `${betterName} backs ${championName}`,
        message: `<strong>${betterName}</strong> placed a ${amount}gp side bet on <strong>${championName}</strong> to win!`,
        icon: "fa-solid fa-sack-dollar",
    });

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
            const betterActor = getActorForUser(betterId);
            const betterName = betterActor?.name ?? game.users.get(betterId)?.name ?? "Unknown";

            if (bet.championId === winnerId) {
                // Winner! 2:1 payout (original bet + winnings)
                const payout = bet.amount * 2;
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

        await createChatCard({
            title: "Side Bet Results",
            subtitle: winnerId ? "The bets are settled!" : "No winner - bets lost!",
            message: `${payouts.length > 0 ? `<strong>Winners:</strong><br>${payoutMsg}<br>` : ""}${losses.length > 0 ? `<strong>Losses:</strong><br>${lossMsg}` : ""}`,
            icon: "fa-solid fa-coins",
        });
    }
}
