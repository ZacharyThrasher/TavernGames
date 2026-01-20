import { MODULE_ID, getState, updateState, addHistoryEntry } from "./state.js";
import { canAffordAnte, deductAnteFromActors, deductFromActor, payOutWinners } from "./wallet.js";
import { createChatCard } from "./ui/chat.js";
import { showPublicRoll } from "./dice.js";
import { playSound } from "./sounds.js";
import { tavernSocket } from "./socket.js";

// V2.0: d12 removed, variable costs
const VALID_DICE = [20, 10, 8, 6, 4];
const OPENING_ROLLS_REQUIRED = 2;

// Iron Liver Patch: Themed duel challenges
const DUEL_CHALLENGES = {
  str: { name: "Arm Wrestling", desc: "Lock hands and slam 'em down!", icon: "fa-solid fa-hand-fist" },
  dex: { name: "Quick-Draw Dice Catch", desc: "Fastest hand on the table wins!", icon: "fa-solid fa-hand" },
  con: { name: "Iron Liver Shot Contest", desc: "Last one standing takes all!", icon: "fa-solid fa-wine-bottle" },
  int: { name: "Riddle-Off", desc: "Answer quick or lose your gold!", icon: "fa-solid fa-brain" },
  wis: { name: "Staring Contest", desc: "First to blink loses the pot!", icon: "fa-solid fa-eye" },
  cha: { name: "Crowd Cheering", desc: "Win the crowd, win the duel!", icon: "fa-solid fa-users" },
};

/**
 * V2.0 Economy: Get the cost for rolling a specific die
 * d20 = FREE, d10 = ½ ante, d6/d8 = 1x ante, d4 = 2x ante
 */
export function getDieCost(die, ante) {
  switch (die) {
    case 20: return 0;                        // FREE - Hail Mary
    case 10: return Math.floor(ante / 2);     // ½ Ante - The Builder
    case 8: return ante;                     // 1x Ante - Standard
    case 6: return ante;                     // 1x Ante - Standard
    case 4: return ante * 2;                 // 2x Ante - Precision
    default: return ante;
  }
}

/**
 * Get all GM user IDs for whispered notifications
 */
function getGMUserIds() {
  return game.users.filter(u => u.isGM).map(u => u.id);
}

/**
 * Send a notification to a specific user (routes via socket to their client)
 * This fixes notifications appearing on GM screen when actions run via executeAsGM
 */
async function notifyUser(userId, message, type = "warn") {
  try {
    await tavernSocket.executeAsUser("showNotification", userId, message, type);
  } catch (e) {
    // Fallback to local notification if socket fails
    ui.notifications[type]?.(message) ?? ui.notifications.warn(message);
  }
}

function emptyTableData() {
  return {
    totals: {},
    visibleTotals: {},         // V2.0: Sum of public dice only (for turn order)
    bettingOrder: null,        // V2.0: Player order for betting phase (sorted by visible total)
    holds: {},
    busts: {},
    rolls: {},                 // V2.0: [{ die, result, public: bool }]
    currentPlayer: null,
    phase: "opening", // "opening" = everyone rolls 2 dice, "betting" = roll costs ante or hold
    // V2.0 Cheating system: track each cheat with type (physical/magical) and DC
    // cheaters: { [userId]: { cheats: [{ dieIndex, oldValue, newValue, type, dc, fumbled }] } }
    cheaters: {},
    // Track who was caught cheating (forfeits the round)
    caught: {},
    // Targeted accusation tracking: { accuserId, targetId, success }
    accusation: null,
    // Track who made a false accusation (forfeits winnings)
    failedInspector: null,
    // V2.0: Goad tracking (replaces intimidation)
    goadedThisRound: {},       // { [userId]: true } - who has used their goad this round
    goadBackfire: {},          // { [userId]: true } - who must roll due to failed goad
    // Bump table tracking
    bumpedThisRound: {},       // { [userId]: true } - who has used their bump this round
    pendingBumpRetaliation: null,  // { attackerId, targetId } or null - awaiting target's choice
    // V2.0: Cleaning fees for Natural 1s (Spilled Drink)
    cleaningFees: {},          // { [userId]: number } - gp owed for spilled drinks
    // V2.0: Scan tracking
    scannedBy: {},             // { [targetId]: [scannerId, ...] } - who has been scanned by whom
    // V2.0: Duel state for ties
    duel: null,                // { participants: [], contestType, stat, rolls: {} } or null
    // Iron Liver: Liquid Currency - drink tracking
    drinkCount: {},            // { [userId]: number } - drinks taken this round
    sloppy: {},                // { [userId]: true } - has Sloppy condition (disadvantage)
  };
}

/**
 * Iron Liver: Liquid Currency - Attempt to pay a cost by drinking instead of paying gold.
 * @param {string} userId - The user attempting to drink
 * @param {number} drinksNeeded - Number of drinks (1 drink = 1 ante value)
 * @param {object} tableData - Current table data
 * @returns {object} { success: boolean, tableData: updated, bust: boolean, sloppy: boolean }
 */
async function drinkForPayment(userId, drinksNeeded, tableData) {
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
    success: true, // Payment always "succeeds" (they pay with their liver)
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

function getNextActivePlayer(state, tableData) {
  // V2.0: Use betting order if available (sorted by visible total), else use join order
  const order = tableData.bettingOrder ?? state.turnOrder;
  if (!order.length) return null;

  const currentIndex = tableData.currentPlayer
    ? order.indexOf(tableData.currentPlayer)
    : -1;

  // Find next player who hasn't held or busted
  for (let i = 1; i <= order.length; i++) {
    const nextIndex = (currentIndex + i) % order.length;
    const nextId = order[nextIndex];
    if (!tableData.holds[nextId] && !tableData.busts[nextId]) {
      return nextId;
    }
  }
  return null;
}

function allPlayersFinished(state, tableData) {
  // V2.0: Use betting order if available
  const order = tableData.bettingOrder ?? state.turnOrder;
  return order.every((id) => tableData.holds[id] || tableData.busts[id]);
}

/**
 * V2.0: Sort players by visible total (ascending) for betting phase turn order
 * Lowest visible total goes first
 */
function calculateBettingOrder(state, tableData) {
  const visibleTotals = tableData.visibleTotals ?? {};
  return [...state.turnOrder].sort((a, b) => {
    const totalA = visibleTotals[a] ?? 0;
    const totalB = visibleTotals[b] ?? 0;
    return totalA - totalB; // Ascending: lowest goes first
  });
}

// Check if all players have completed their opening rolls (2 dice each)
function allPlayersCompletedOpening(state, tableData) {
  return state.turnOrder.every((id) => {
    const rolls = tableData.rolls[id] ?? [];
    return rolls.length >= OPENING_ROLLS_REQUIRED || tableData.busts[id];
  });
}

// Get next player who needs to roll in opening phase
function getNextOpeningPlayer(state, tableData) {
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

export async function startRound() {
  const state = getState();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");

  if (!state.turnOrder.length) {
    ui.notifications.warn("No players at the table.");
    return state;
  }

  const affordability = canAffordAnte(state, ante);
  if (!affordability.ok) {
    ui.notifications.warn(`${affordability.name} cannot afford the ${ante}gp ante.`);
    return state;
  }

  await deductAnteFromActors(state, ante);
  await playSound("coins");

  const tableData = emptyTableData();

  // Calculate pot: each non-GM player antes, house matches non-GM players only
  const nonGMPlayers = state.turnOrder.filter(id => !game.users.get(id)?.isGM);
  const playerAntes = nonGMPlayers.length * ante;
  const houseMatch = playerAntes; // House matches player antes only
  const pot = playerAntes + houseMatch;

  state.turnOrder.forEach((id) => {
    tableData.totals[id] = 0;
    tableData.rolls[id] = [];
  });

  tableData.currentPlayer = state.turnOrder[0];
  tableData.phase = "opening";

  const next = await updateState({
    status: "PLAYING",
    pot,
    tableData,
    turnIndex: 0,
  });

  const playerNames = state.turnOrder.map(id => game.users.get(id)?.name).join(", ");
  await addHistoryEntry({
    type: "round_start",
    message: `New round started. Ante: ${ante}gp each. Pot: ${pot}gp.`,
    players: playerNames,
  });

  await createChatCard({
    title: "Twenty-One",
    subtitle: "A new round begins!",
    message: `Each player antes ${ante}gp. The house matches. Pot: <strong>${pot}gp</strong><br><em>Opening round: everyone rolls 2 dice!</em>`,
    icon: "fa-solid fa-coins",
  });

  return next;
}

export async function submitRoll(payload, userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    ui.notifications.warn("No active round.");
    return state;
  }

  let tableData = state.tableData ?? emptyTableData();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const isOpeningPhase = tableData.phase === "opening";

  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  if (tableData.holds[userId] || tableData.busts[userId]) {
    ui.notifications.warn("You've already finished this round.");
    return state;
  }

  const die = Number(payload?.die);
  if (!VALID_DICE.includes(die)) {
    ui.notifications.warn("Invalid die selection.");
    return state;
  }

  // V2.0: Variable dice costs in betting phase
  let newPot = state.pot;
  let rollCost = 0;
  if (!isOpeningPhase) {
    const user = game.users.get(userId);
    if (!user?.isGM) {
      // Get cost for this specific die
      rollCost = getDieCost(die, ante);

      if (rollCost > 0) {
        // Iron Liver: Check for drink payment
        if (payload.payWithDrink) {
          const drinksNeeded = Math.ceil(rollCost / ante);
          const drinkResult = await drinkForPayment(userId, drinksNeeded, tableData);
          tableData = drinkResult.tableData; // Update local state with drink/sloppy changes

          if (drinkResult.bust) {
            // Player passed out - end their turn immediately
            return updateState({ tableData });
          }
          // Payment successful (via liver). Pot does NOT increase.
        } else {
          // Check if player can afford to roll (Gold)
          const canAfford = await deductFromActor(userId, rollCost);
          if (!canAfford) {
            await notifyUser(userId, `You need ${rollCost}gp to roll a d${die}.`);
            return state;
          }
          newPot = state.pot + rollCost;
          await playSound("coins");
        }
      }
      // d20 is free, no deduction needed
    }
  }

  const roll = await new Roll(`1d${die}`).evaluate();
  let result = roll.total ?? 0;
  const naturalRoll = result; // Store the natural roll before any modifications

  // V2.0: Natural 20 = Instant 21!
  if (die === 20 && result === 20) {
    result = 21;
  }

  // Send the dice roll display to the player who rolled (via socket)
  try {
    await tavernSocket.executeAsUser("showRoll", userId, {
      formula: `1d${die}`,
      die: die,
      result: result
    });
  } catch (e) {
    console.warn("Tavern Twenty-One | Could not show dice to player:", e);
  }

  await playSound("dice");

  const rolls = { ...tableData.rolls };
  const totals = { ...tableData.totals };
  const cleaningFees = { ...tableData.cleaningFees };
  const visibleTotals = { ...tableData.visibleTotals };

  // V2.0: Determine visibility - Opening: 1st die public, 2nd die hole; Betting: all public
  const existingRolls = rolls[userId] ?? [];
  const isPublic = isOpeningPhase ? existingRolls.length === 0 : true; // First opening die is public, rest is hole; betting always public

  rolls[userId] = [...existingRolls, { die, result, public: isPublic }];
  totals[userId] = (totals[userId] ?? 0) + result;

  // V2.0: Track visible totals (sum of public dice only)
  if (isPublic) {
    visibleTotals[userId] = (visibleTotals[userId] ?? 0) + result;
  }

  // V2.0: Natural 1 = Spilled Drink (1gp cleaning fee)
  if (naturalRoll === 1) {
    cleaningFees[userId] = (cleaningFees[userId] ?? 0) + 1;
  }

  const busts = { ...tableData.busts };
  const isBust = totals[userId] > 21;
  if (isBust) {
    busts[userId] = true;
  }

  const userName = game.users.get(userId)?.name ?? "Unknown";

  // V2.0: Build cost message with variable costs
  let rollCostMsg = "";
  if (!isOpeningPhase && !game.users.get(userId)?.isGM) {
    if (rollCost === 0) {
      rollCostMsg = " (FREE)";
    } else {
      rollCostMsg = ` (${rollCost}gp)`;
    }
  }

  // V2.0: Special messages for Nat 20 and Nat 1
  let specialMsg = "";
  if (die === 20 && naturalRoll === 20) {
    specialMsg = " **NATURAL 20 = INSTANT 21!**";
  } else if (naturalRoll === 1) {
    specialMsg = " *Spilled drink! 1gp cleaning fee.*";
  }

  await addHistoryEntry({
    type: isBust ? "bust" : "roll",
    player: userName,
    die: `d${die}`,
    result,
    total: totals[userId],
    message: isBust
      ? `${userName} rolled d${die} and BUSTED with ${totals[userId]}!${specialMsg}`
      : `${userName} rolled a d${die}${rollCostMsg}...${specialMsg}`,
  });

  // V2.0: Clear goad backfire if this player was goaded (they fulfilled their forced roll)
  const goadBackfire = { ...tableData.goadBackfire };
  if (goadBackfire[userId]?.mustRoll) {
    delete goadBackfire[userId];
  }

  const updatedTable = {
    ...tableData,
    rolls,
    totals,
    busts,
    cleaningFees,
    visibleTotals,
    goadBackfire,
  };

  // Determine next player based on phase
  if (isOpeningPhase) {
    const myRolls = rolls[userId] ?? [];
    // If player has completed opening rolls (2) or busted, move to next
    if (myRolls.length >= OPENING_ROLLS_REQUIRED || isBust) {
      // Check if all players done with opening
      if (allPlayersCompletedOpening(state, updatedTable)) {
        // V2.0: Calculate betting order (sorted by visible total, lowest first)
        updatedTable.bettingOrder = calculateBettingOrder(state, updatedTable);

        // Transition to betting phase
        updatedTable.phase = "betting";

        // First player is the one with lowest visible total (who hasn't busted)
        updatedTable.currentPlayer = updatedTable.bettingOrder.find(id => !updatedTable.busts[id]) ?? null;

        // Build turn order message
        const orderNames = updatedTable.bettingOrder
          .filter(id => !updatedTable.busts[id])
          .map(id => {
            const name = game.users.get(id)?.name ?? "Unknown";
            const vt = updatedTable.visibleTotals[id] ?? 0;
            return `${name} (${vt})`;
          })
          .join(" → ");

        await createChatCard({
          title: "Betting Round",
          subtitle: "Opening complete!",
          message: `All players have their opening hands.<br><strong>Turn order (by visible total):</strong> ${orderNames}<br><em>d20: FREE | d10: ${Math.floor(ante / 2)}gp | d6/d8: ${ante}gp | d4: ${ante * 2}gp</em>`,
          icon: "fa-solid fa-hand-holding-dollar",
        });
      } else {
        updatedTable.currentPlayer = getNextOpeningPlayer(state, updatedTable);
      }
    }
    // Otherwise, player continues rolling their second opening die
  } else {
    // Betting phase: turn passes after each roll or bust
    if (isBust) {
      updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);
    } else {
      // In betting phase, turn passes after each action (roll or hold)
      updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);
    }
  }

  const next = await updateState({
    tableData: updatedTable,
    pot: newPot,
  });

  if (allPlayersFinished(state, updatedTable)) {
    return revealDice();
  }

  return next;
}

export async function hold(userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    ui.notifications.warn("No active round.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();

  if (tableData.currentPlayer !== userId) {
    await notifyUser(userId, "It's not your turn.");
    return state;
  }

  if (tableData.holds[userId] || tableData.busts[userId]) {
    ui.notifications.warn("You've already finished this round.");
    return state;
  }

  // Can't hold during opening phase
  if (tableData.phase === "opening") {
    const rollCount = (tableData.rolls[userId] ?? []).length;
    const remaining = OPENING_ROLLS_REQUIRED - rollCount;
    ui.notifications.warn(`Opening round: you must roll ${remaining} more ${remaining === 1 ? "die" : "dice"}.`);
    return state;
  }

  // Can't hold if goaded (must roll instead)
  if (tableData.goadBackfire?.[userId]?.mustRoll) {
    await notifyUser(userId, "You were goaded! You must roll instead.");
    return state;
  }

  const holds = { ...tableData.holds, [userId]: true };
  const updatedTable = { ...tableData, holds };
  updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);

  const userName = game.users.get(userId)?.name ?? "Unknown";
  await addHistoryEntry({
    type: "hold",
    player: userName,
    total: tableData.totals[userId],
    message: `${userName} holds at ${tableData.totals[userId]}.`,
  });

  const next = await updateState({ tableData: updatedTable });

  if (allPlayersFinished(state, updatedTable)) {
    return revealDice();
  }

  return next;
}

/**
 * Reveal all dice - called when all players finish playing.
 * After revealing, transitions to INSPECTION (The Staredown) where accusations can be made.
 */
export async function revealDice() {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();

  // Mark as revealing
  await updateState({ status: "REVEALING" });
  await playSound("reveal");

  // Show all rolls publicly - launch all dice animations in parallel for speed
  const rollPromises = [];
  for (const oduserId of state.turnOrder) {
    const playerRolls = tableData.rolls[oduserId] ?? [];
    for (const rollData of playerRolls) {
      rollPromises.push((async () => {
        const roll = await new Roll(`1d${rollData.die}`).evaluate();
        // Override the result to show the actual value
        if (roll.terms?.[0]?.results?.[0]) {
          roll.terms[0].results[0].result = rollData.result;
          roll._total = rollData.result;
        }
        await showPublicRoll(roll, oduserId);
      })());
    }
  }

  // Wait for all dice to finish rolling
  await Promise.all(rollPromises);

  // Brief pause for dramatic effect after all dice shown
  await new Promise(r => setTimeout(r, 500));

  // Now transition to The Staredown
  const accusationCost = Math.floor(state.pot / 2);

  await createChatCard({
    title: "The Staredown",
    subtitle: "All dice revealed. But can you trust what you see?",
    message: `<strong>Make an Accusation?</strong> (Costs <strong>${accusationCost}gp</strong> - half the pot)<br>` +
      `Point your finger at someone you suspect. If they cheated and you beat their skill, they're caught!<br>` +
      `<em>But accuse an innocent... and you forfeit your winnings.</em>`,
    icon: "fa-solid fa-eye",
  });

  return updateState({ status: "INSPECTION" });
}

/**
 * Finish the round - called from INSPECTION phase.
 * Resolves accusations and pays out winners.
 */
export async function finishRound() {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();

  // Mark as revealing (brief transition state)
  await updateState({ status: "REVEALING" });

  // V2.0: Check for fumbled cheaters (physical cheat < 10 = auto-caught)
  const caught = { ...tableData.caught };
  const fumbledCheaterNames = [];
  for (const [cheaterId, cheaterData] of Object.entries(tableData.cheaters)) {
    if (caught[cheaterId]) continue; // Already caught
    const cheats = cheaterData.cheats ?? cheaterData.deceptionRolls ?? [];
    for (const cheatRecord of cheats) {
      if (cheatRecord.fumbled) {
        caught[cheaterId] = true;
        const cheaterName = getActorForUser(cheaterId)?.name ?? game.users.get(cheaterId)?.name ?? "Unknown";
        fumbledCheaterNames.push(cheaterName);
        break;
      }
    }
  }

  if (fumbledCheaterNames.length > 0) {
    await createChatCard({
      title: "Fumbled!",
      subtitle: "A clumsy cheater exposed!",
      message: `<strong>${fumbledCheaterNames.join(", ")}</strong> fumbled their sleight of hand and got caught red-handed!`,
      icon: "fa-solid fa-hand-fist",
    });
  }

  // V2.0: If an accusation was made, reveal the outcome and handle bounty
  if (tableData.accusation) {
    const { accuserId, targetId, success, cost, bounty } = tableData.accusation;
    const accuserName = getActorForUser(accuserId)?.name ?? game.users.get(accuserId)?.name ?? "Unknown";
    const targetName = getActorForUser(targetId)?.name ?? game.users.get(targetId)?.name ?? "Unknown";

    // Brief pause for tension
    await new Promise(r => setTimeout(r, 1000));

    if (success) {
      await playSound("reveal");

      // V2.0: Refund the 2x ante accusation fee + pay 5x ante bounty from cheater
      const refund = cost ?? 0;
      const bountyAmount = bounty ?? 0;

      // Attempt to collect bounty from cheater
      let actualBounty = 0;
      if (bountyAmount > 0) {
        const collected = await deductFromActor(targetId, bountyAmount);
        if (collected) {
          actualBounty = bountyAmount;
        } else {
          // Cheater can't afford full bounty - they're broke
          actualBounty = 0;
        }
      }

      // Pay refund + whatever bounty was collected
      const totalReward = refund + actualBounty;
      if (totalReward > 0) {
        await payOutWinners({ [accuserId]: totalReward });
      }

      // Show message with actual bounty collected (may be less if cheater was broke)
      const bountyMsg = actualBounty > 0 ? `${actualBounty}gp bounty` : "no bounty (they're broke!)";

      await createChatCard({
        title: "Cheater Caught!",
        subtitle: `${accuserName} was right!`,
        message: `<strong>${targetName}</strong> was caught cheating and forfeits the round.<br>
          <em>${accuserName} receives ${refund}gp refund + ${bountyMsg} = <strong>${totalReward}gp</strong>!</em>`,
        icon: "fa-solid fa-gavel",
      });

      await addHistoryEntry({
        type: "cheat_caught",
        accuser: accuserName,
        caught: targetName,
        reward: totalReward,
        message: `${accuserName} caught ${targetName} cheating and earned ${totalReward}gp!`,
      });
    } else {
      await playSound("lose");

      // V2.0: False accusation - they just lose the fee, no forfeit of winnings
      await createChatCard({
        title: "False Accusation!",
        subtitle: `${targetName} is innocent.`,
        message: `<strong>${accuserName}</strong> was wrong and loses their ${cost ?? 0}gp accusation fee.`,
        icon: "fa-solid fa-face-frown",
      });

      await addHistoryEntry({
        type: "accusation_failed",
        accuser: accuserName,
        target: targetName,
        cost: cost ?? 0,
        message: `${accuserName} falsely accused ${targetName} and loses ${cost ?? 0}gp.`,
      });
    }

    // Another pause after accusation result
    await new Promise(r => setTimeout(r, 500));
  }

  // V2.0: No longer have failedInspector forfeit - false accusers just lose fee
  // Calculate winners - exclude caught cheaters only
  const totals = tableData.totals ?? {};
  let best = 0;
  state.turnOrder.forEach((id) => {
    // Caught cheaters cannot win
    if (caught[id]) return;
    const total = totals[id] ?? 0;
    if (total <= 21 && total > best) best = total;
  });

  // Winners are those with best score who weren't caught cheating
  const winners = state.turnOrder.filter((id) => {
    if (caught[id]) return false;
    return (totals[id] ?? 0) === best && best > 0;
  });

  // V2.0: If multiple winners → trigger The Duel instead of splitting
  if (winners.length > 1) {
    // Roll 1d6 to determine contest type
    const contestRoll = await new Roll("1d6").evaluate();
    const contestTypes = ["str", "dex", "con", "int", "wis", "cha"];
    const contestStats = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
    const contestIndex = contestRoll.total - 1;
    const contestType = contestTypes[contestIndex];
    const contestStat = contestStats[contestIndex];

    const duelParticipantNames = winners.map(id =>
      getActorForUser(id)?.name ?? game.users.get(id)?.name ?? "Unknown"
    ).join(" vs ");

    // Get themed challenge info
    const challenge = DUEL_CHALLENGES[contestType] ?? { name: contestStat, desc: "May the best player win!", icon: "fa-solid fa-crossed-swords" };

    await createChatCard({
      title: challenge.name,
      subtitle: "The Duel!",
      message: `<strong>${duelParticipantNames}</strong> are tied!<br>
        <em>${challenge.desc}</em><br>
        <span style="font-size: 0.9em; color: #888;">Roll 1d20 + ${contestStat} modifier</span>`,
      icon: challenge.icon,
    });

    await playSound("reveal");

    // Set up duel state
    const duel = {
      active: true,
      participants: [...winners],
      contestType,
      stat: contestStat,
      rolls: {},
      pendingRolls: [...winners],
      round: 1,
      pot: state.pot, // Store pot for payout
    };

    await addHistoryEntry({
      type: "duel_start",
      participants: duelParticipantNames,
      contestType: contestStat,
      message: `Duel! ${duelParticipantNames} compete in ${contestStat}!`,
    });

    return updateState({
      status: "DUEL",
      tableData: { ...tableData, caught, duel },
    });
  }

  // Single winner or no winners - normal payout
  const payouts = {};

  if (winners.length === 1) {
    payouts[winners[0]] = state.pot;
    await payOutWinners(payouts);
    await playSound("win");
  } else if (winners.length === 0) {
    await playSound("lose");
  }

  // V2.0: Deduct cleaning fees for Natural 1s (Spilled Drink)
  const cleaningFees = tableData.cleaningFees ?? {};
  const cleaningFeeMessages = [];
  for (const [odId, fee] of Object.entries(cleaningFees)) {
    if (fee > 0) {
      await deductFromActor(odId, fee);
      const userName = game.users.get(odId)?.name ?? "Unknown";
      cleaningFeeMessages.push(`${userName}: ${fee}gp`);
    }
  }

  if (cleaningFeeMessages.length > 0) {
    await createChatCard({
      title: "Spilled Drinks!",
      subtitle: "Clean up on aisle tavern...",
      message: `<em>Cleaning fees collected:</em><br>${cleaningFeeMessages.join("<br>")}`,
      icon: "fa-solid fa-beer-mug-empty",
    });
  }

  // Build winner names
  const winnerNames = winners.map(id => game.users.get(id)?.name ?? "Unknown").join(", ");

  const resultsMsg = state.turnOrder.map(id => {
    const name = game.users.get(id)?.name ?? "Unknown";
    const total = totals[id] ?? 0;
    const busted = tableData.busts[id];
    const wasCaught = caught[id];
    let suffix = "";
    if (wasCaught) suffix = " (CHEATER!)";
    else if (busted) suffix = " (BUST)";
    if (winners.includes(id)) {
      suffix += " ★";
    }
    return `${name}: ${total}${suffix}`;
  }).join(" | ");

  // Build payout message
  let payoutMsg = "";
  if (winners.length) {
    const flatShare = Object.values(payouts)[0] ?? 0;
    payoutMsg = `<div class="tavern-payout">Payout: <strong>${flatShare}gp</strong></div>`;
  }

  await addHistoryEntry({
    type: "round_end",
    winners: winnerNames || "None",
    winningTotal: best,
    payout: Object.values(payouts)[0] ?? 0,
    message: winners.length
      ? `${winnerNames} wins with ${best}!`
      : "Everyone busted or got caught! House wins.",
    results: resultsMsg,
  });

  await createChatCard({
    title: "Round Complete!",
    subtitle: winners.length ? `Winner: ${winnerNames}` : "House Wins!",
    message: `<div class="tavern-results">${resultsMsg}</div>${payoutMsg}`,
    icon: winners.length ? "fa-solid fa-trophy" : "fa-solid fa-skull",
  });

  return updateState({
    status: "PAYOUT",
    tableData: { ...tableData, caught },
  });
}

export async function returnToLobby() {
  return updateState({
    status: "LOBBY",
    pot: 0,
    tableData: emptyTableData(),
  });
}

/**
 * V2.0 Duel: Submit a duel roll.
 * Called by a duelist when they roll their ability check.
 */
export async function submitDuelRoll(userId) {
  const state = getState();
  if (state.status !== "DUEL") {
    ui.notifications.warn("No duel in progress.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
  const duel = tableData.duel;

  if (!duel || !duel.active) {
    ui.notifications.warn("No active duel.");
    return state;
  }

  // Check if this player is a participant
  if (!duel.participants.includes(userId)) {
    ui.notifications.warn("You're not in this duel!");
    return state;
  }

  // Check if already rolled
  if (duel.rolls[userId]) {
    ui.notifications.warn("You've already rolled in this duel.");
    return state;
  }

  // Get actor and ability modifier
  const actor = getActorForUser(userId);
  const userName = actor?.name ?? game.users.get(userId)?.name ?? "Unknown";
  const abilityMod = actor?.system?.abilities?.[duel.contestType]?.mod ?? 0;

  // Roll 1d20 + ability modifier
  const roll = await new Roll("1d20").evaluate();
  const d20Result = roll.total;
  const total = d20Result + abilityMod;

  // Post the roll publicly
  await ChatMessage.create({
    speaker: { alias: userName },
    flavor: `<em>${userName} rolls for the duel...</em><br>${duel.stat}`,
    content: `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">1d20 + ${abilityMod}</div><div class="dice-tooltip"><section class="tooltip-part"><div class="dice"><ol class="dice-rolls"><li class="roll die d20">${d20Result}</li></ol></div></section></div><h4 class="dice-total">${total}</h4></div></div>`,
    rolls: [roll],
  });

  // Update duel state
  const updatedDuel = {
    ...duel,
    rolls: { ...duel.rolls, [userId]: { total, d20: d20Result, mod: abilityMod } },
    pendingRolls: duel.pendingRolls.filter(id => id !== userId),
  };

  const updatedTableData = {
    ...tableData,
    duel: updatedDuel,
  };

  await updateState({ tableData: updatedTableData });

  // Check if all duelists have rolled
  if (updatedDuel.pendingRolls.length === 0) {
    return resolveDuel();
  }

  return getState();
}

/**
 * V2.0 Duel: Resolve the duel after all participants have rolled.
 * Determines winner or triggers re-duel on tie.
 */
async function resolveDuel() {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();
  const duel = tableData.duel;

  if (!duel || !duel.active) {
    return state;
  }

  // Find the highest roll
  let highestTotal = 0;
  const results = [];

  for (const [playerId, rollData] of Object.entries(duel.rolls)) {
    const playerName = getActorForUser(playerId)?.name ?? game.users.get(playerId)?.name ?? "Unknown";
    results.push({ playerId, playerName, ...rollData });
    if (rollData.total > highestTotal) {
      highestTotal = rollData.total;
    }
  }

  // Find all players with the highest roll (could be a tie)
  const winners = results.filter(r => r.total === highestTotal);

  if (winners.length > 1) {
    // Tie! Re-duel with new contest type
    const contestRoll = await new Roll("1d6").evaluate();
    const contestTypes = ["str", "dex", "con", "int", "wis", "cha"];
    const contestStats = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
    const contestIndex = contestRoll.total - 1;
    const newContestType = contestTypes[contestIndex];
    const newContestStat = contestStats[contestIndex];

    const tiedNames = winners.map(w => w.playerName).join(" vs ");

    // Get themed challenge info for re-duel
    const challenge = DUEL_CHALLENGES[newContestType] ?? { name: newContestStat, desc: "May the best player win!", icon: "fa-solid fa-repeat" };

    await createChatCard({
      title: "Still Tied!",
      subtitle: `Re-duel: ${challenge.name}`,
      message: `<strong>${tiedNames}</strong> are still tied at ${highestTotal}!<br>
        <em>${challenge.desc}</em>`,
      icon: challenge.icon,
    });

    await playSound("reveal");

    // Set up re-duel
    const updatedDuel = {
      ...duel,
      contestType: newContestType,
      stat: newContestStat,
      rolls: {},
      pendingRolls: winners.map(w => w.playerId),
      round: duel.round + 1,
    };

    await addHistoryEntry({
      type: "duel_tie",
      round: duel.round,
      tiedPlayers: tiedNames,
      newContest: newContestStat,
      message: `Duel tie! Re-duel in ${newContestStat}!`,
    });

    return updateState({
      tableData: { ...tableData, duel: updatedDuel },
    });
  }

  // Single winner - pay out and end
  const winner = winners[0];
  const potAmount = duel.pot;

  await payOutWinners({ [winner.playerId]: potAmount });
  await playSound("win");

  // Build results message
  const resultsMsg = results
    .sort((a, b) => b.total - a.total)
    .map(r => `${r.playerName}: ${r.total}`)
    .join(" | ");

  await createChatCard({
    title: "Duel Victory!",
    subtitle: `${winner.playerName} wins the duel!`,
    message: `<strong>${winner.playerName}</strong> claims the pot of <strong>${potAmount}gp</strong>!<br>
      <div class="tavern-results">${resultsMsg}</div>`,
    icon: "fa-solid fa-trophy",
  });

  await addHistoryEntry({
    type: "duel_end",
    winner: winner.playerName,
    payout: potAmount,
    round: duel.round,
    message: `${winner.playerName} wins the duel and ${potAmount}gp!`,
  });

  // Clear duel state and move to payout
  return updateState({
    status: "PAYOUT",
    tableData: { ...tableData, duel: null },
  });
}

/**
 * Get actor for a user (for skill checks)
 */
function getActorForUser(userId) {
  const user = game.users.get(userId);
  if (!user) return null;
  const actorId = user.character?.id;
  if (!actorId) return null;
  return game.actors.get(actorId) ?? null;
}

/**
 * Check if any other players' Passive Perception beats the cheat roll.
 * If so, whisper them a subtle "gut feeling" hint about the cheater.
 * 
 * Passive Perception = 10 + Perception modifier (D&D 5e standard)
 */
async function checkPassivePerception(state, cheaterId, cheaterName, cheatRoll) {
  const observerHints = [];

  for (const playerId of state.turnOrder) {
    // Skip the cheater themselves
    if (playerId === cheaterId) continue;

    // Skip GMs (they already get full info)
    const user = game.users.get(playerId);
    if (!user || user.isGM) continue;

    // Get the observer's actor and Passive Perception
    const actor = getActorForUser(playerId);
    if (!actor) continue;

    // Passive Perception = 10 + Perception skill total
    const perceptionMod = actor.system?.skills?.prc?.total ?? 0;
    const passivePerception = 10 + perceptionMod;

    // If their passive perception beats (or ties) the cheat roll, they notice something
    if (passivePerception >= cheatRoll) {
      observerHints.push({
        oderId: playerId,
        observerName: actor.name,
        passivePerception,
      });

      // Whisper the hint to this player
      await ChatMessage.create({
        content: `<div class="tavern-gut-feeling">
          <div class="gut-feeling-icon"><i class="fa-solid fa-eye"></i></div>
          <div class="gut-feeling-content">
            <span class="gut-feeling-label">Gut Feeling</span>
            <span class="gut-feeling-text">Something seems off about <strong>${cheaterName}</strong>'s dice...</span>
          </div>
        </div>`,
        whisper: [playerId],
        speaker: { alias: "Intuition" },
      });
    }
  }

  // Also notify GM how many people noticed (for their awareness)
  if (observerHints.length > 0) {
    const gmIds = getGMUserIds();
    if (gmIds.length > 0) {
      const observerList = observerHints.map(o => o.observerName).join(", ");
      await ChatMessage.create({
        content: `<div class="tavern-gm-alert tavern-gm-perception">
          <strong>PASSIVE PERCEPTION</strong><br>
          <em>${observerList}</em> noticed something off about ${cheaterName}'s cheat attempt.<br>
          <small>Cheat roll: ${cheatRoll} | They've been whispered a hint.</small>
        </div>`,
        whisper: gmIds,
        speaker: { alias: "Tavern Twenty-One" },
      });
    }
  }
}

/**
 * V2.0 Cheat: Modify one of your dice.
 * 
 * TWO TYPES:
 * - Physical: Sleight of Hand OR Deception → sets Tell DC
 *   - Fumble: Roll < 10 = auto-caught immediately!
 * - Magical: INT/WIS/CHA (spellcasting ability) → sets Residue DC
 * 
 * The GM is whispered with details so they can narrate tells to the table.
 */
export async function cheat(payload, userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    ui.notifications.warn("Cannot cheat outside of an active round.");
    return state;
  }

  // GM cannot cheat - they're the house
  const user = game.users.get(userId);
  if (user?.isGM) {
    ui.notifications.warn("The house doesn't cheat... or do they?");
    return state;
  }

  // V2.0.2: Prevent cheating in 1v1 with GM (no one to detect you)
  const nonGMPlayers = state.turnOrder.filter(id => !game.users.get(id)?.isGM);
  if (nonGMPlayers.length <= 1) {
    await notifyUser(userId, "Cheating requires at least 2 players (the GM always knows).");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
  const { dieIndex, newValue, cheatType = "physical", skill = "slt" } = payload;

  // V2.0: Determine cheat type and skill
  const isPhysical = cheatType === "physical";
  const skillNames = {
    // Physical skills
    slt: "Sleight of Hand",
    dec: "Deception",
    // Magical abilities
    int: "Intelligence",
    wis: "Wisdom",
    cha: "Charisma",
  };
  const skillName = skillNames[skill] ?? (isPhysical ? "Sleight of Hand" : "Intelligence");

  // Validate die index
  const rolls = tableData.rolls[userId] ?? [];
  if (dieIndex < 0 || dieIndex >= rolls.length) {
    ui.notifications.warn("Invalid die selection.");
    return state;
  }

  const targetDie = rolls[dieIndex];
  const maxValue = targetDie.die;
  const isHoleDie = !(targetDie.public ?? true);

  // Validate new value
  if (newValue < 1 || newValue > maxValue) {
    ui.notifications.warn(`Value must be between 1 and ${maxValue}.`);
    return state;
  }

  // Don't allow "cheating" to the same value
  if (newValue === targetDie.result) {
    ui.notifications.warn("That's already the value!");
    return state;
  }

  // Roll the check (Iron Liver: Sloppy = disadvantage)
  const actor = getActorForUser(userId);
  const isSloppy = tableData.sloppy?.[userId] ?? false;
  let rollTotal = 10;
  let modifier = 0;
  let d20Result = 10;

  // Roll with disadvantage if Sloppy
  const roll = await new Roll(isSloppy ? "2d20kl1" : "1d20").evaluate();
  d20Result = roll.total;

  if (actor) {
    if (isPhysical) {
      // Physical: use skill modifier (slt or dec)
      modifier = actor.system?.skills?.[skill]?.total ?? 0;
    } else {
      // Magical: use ability modifier (int, wis, or cha)
      modifier = actor.system?.abilities?.[skill]?.mod ?? 0;
    }
    rollTotal = d20Result + modifier;
  } else {
    rollTotal = d20Result;
  }

  // V2.0: Fumble rule for Physical cheats - roll < 10 = auto-caught!
  const fumbled = isPhysical && rollTotal < 10;
  const dcType = isPhysical ? "Tell DC" : "Residue DC";

  // Whisper the skill roll to the player
  const cheatTypeLabel = isPhysical ? "Physical" : "Magical";
  let flavorText = `<em>${actor?.name ?? "You"} attempt${actor ? "s" : ""} to cheat (${cheatTypeLabel})...</em><br>`;
  flavorText += `${skillName}: ${d20Result} + ${modifier} = <strong>${rollTotal}</strong>`;

  if (fumbled) {
    flavorText += ` <span style='color: red; font-weight: bold;'>FUMBLED! (< 10 = Auto-caught!)</span>`;
  } else {
    flavorText += ` <span style='color: #888;'>(${dcType}: ${rollTotal})</span>`;
  }

  // Whisper to player AND GM - use rolls array to trigger 3D dice (Dice So Nice)
  // But strictly whisper to keep it hidden from others.
  const gmIds = getGMUserIds();
  const whisperIds = [userId, ...gmIds];

  await ChatMessage.create({
    content: `<div class="dice-roll"><div class="dice-result">
      <div class="dice-formula">1d20 + ${modifier}</div>
      <h4 class="dice-total">${rollTotal}</h4>
    </div></div>`,
    flavor: flavorText,
    whisper: whisperIds,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
    speaker: { alias: skillName },
    rolls: [roll],
  });

  // Update the die value
  const updatedRolls = { ...tableData.rolls };
  updatedRolls[userId] = [...rolls];
  const oldValue = updatedRolls[userId][dieIndex].result;
  updatedRolls[userId][dieIndex] = { ...targetDie, result: newValue };

  // Update total
  const updatedTotals = { ...tableData.totals };
  updatedTotals[userId] = (updatedTotals[userId] ?? 0) - oldValue + newValue;

  // V2.0: Update visible total if it was a public die
  const updatedVisibleTotals = { ...tableData.visibleTotals };
  if (targetDie.public) {
    updatedVisibleTotals[userId] = (updatedVisibleTotals[userId] ?? 0) - oldValue + newValue;
  }

  // Check for bust after cheating
  const updatedBusts = { ...tableData.busts };
  const updatedCaught = { ...tableData.caught };

  if (fumbled) {
    // V2.0: Fumble = auto-caught immediately!
    updatedCaught[userId] = true;
  }

  if (updatedTotals[userId] > 21) {
    updatedBusts[userId] = true;
  } else if (updatedTotals[userId] <= 21 && tableData.busts[userId]) {
    // Un-bust if they cheated down from a bust
    updatedBusts[userId] = false;
  }

  // V2.0: Track cheat with new structure
  const cheaters = { ...tableData.cheaters };
  if (!cheaters[userId]) {
    cheaters[userId] = { cheats: [] };
  }
  // Also maintain backwards-compat deceptionRolls for accusation logic
  if (!cheaters[userId].deceptionRolls) {
    cheaters[userId].deceptionRolls = [];
  }

  const cheatRecord = {
    dieIndex,
    oldValue,
    newValue,
    type: cheatType, // "physical" or "magical"
    skill,
    dc: rollTotal,   // Tell DC or Residue DC
    fumbled,
    isHoleDie,
  };

  cheaters[userId].cheats.push(cheatRecord);
  // Backwards compat
  cheaters[userId].deceptionRolls.push({
    dieIndex,
    oldValue,
    newValue,
    deception: rollTotal,
    isNat1: false,
    isNat20: false,
  });

  const updatedTable = {
    ...tableData,
    rolls: updatedRolls,
    totals: updatedTotals,
    visibleTotals: updatedVisibleTotals,
    busts: updatedBusts,
    caught: updatedCaught,
    cheaters,
  };

  const userName = game.users.get(userId)?.name ?? "Unknown";
  const characterName = actor?.name ?? userName;

  // Notify the GM with cheat details
  if (gmIds.length > 0) {
    const fumbleStatus = fumbled ? " <span style='color: red;'>(FUMBLED - AUTO-CAUGHT!)</span>" : "";
    const dieLocation = isHoleDie ? " (Hole Die)" : " (Visible)";
    await ChatMessage.create({
      content: `<div class="tavern-gm-alert tavern-gm-cheat">
        <strong>${cheatTypeLabel.toUpperCase()} CHEAT DETECTED</strong><br>
        <em>${characterName}</em> changed their d${targetDie.die}${dieLocation} from <strong>${oldValue}</strong> to <strong>${newValue}</strong><br>
        ${skillName}: <strong>${rollTotal}</strong> (${dcType})${fumbleStatus}<br>
        <small>${fumbled ? "They fumbled and were caught!" : `Scan DC: ${rollTotal} (${isPhysical ? "Insight vs Tell" : "Arcana vs Residue"})`}</small>
      </div>`,
      whisper: gmIds,
      speaker: { alias: "Tavern Twenty-One" },
    });
  }

  // If fumbled, announce it publicly
  if (fumbled) {
    await createChatCard({
      title: "Clumsy Hands!",
      subtitle: `${characterName} fumbles`,
      message: `${characterName} tried to cheat but fumbled badly - everyone saw it!<br><em>They are caught and forfeit the round.</em>`,
      icon: "fa-solid fa-hand-fist",
    });
    await playSound("lose");
  }

  await addHistoryEntry({
    type: fumbled ? "cheat_caught" : "cheat",
    player: characterName,
    cheatType,
    skill: skillName,
    dc: rollTotal,
    fumbled,
    message: fumbled
      ? `${characterName} fumbled their cheat and was caught!`
      : `${characterName} attempted a ${cheatTypeLabel.toLowerCase()} cheat (${dcType}: ${rollTotal}).`,
  });

  console.log(`Tavern Twenty-One | ${userName} cheated: d${targetDie.die} ${oldValue} → ${newValue}, ${skillName}: ${rollTotal} (fumbled: ${fumbled})`);

  return updateState({ tableData: updatedTable });
}

/**
 * V2.0 Scan: Investigate a player for cheating during Staredown.
 * - Cost: 1x ante per target
 * - Skill: Insight (vs Tell DC) for Physical cheats, Arcana (vs Residue DC) for Magical
 * - Success: Whisper reveals cheat type + location (Public/Hole), NOT the actual number
 * - Can scan multiple targets (pay for each)
 */
export async function scan(payload, userId) {
  const state = getState();
  if (state.status !== "INSPECTION") {
    ui.notifications.warn("Scanning can only be done during the Staredown.");
    return state;
  }

  // GM cannot scan - they already know everything
  const user = game.users.get(userId);
  if (user?.isGM) {
    ui.notifications.warn("The house already knows all.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const { targetId, scanType = "insight" } = payload; // "insight" or "arcana"

  // Validate target
  if (!targetId || !state.turnOrder.includes(targetId)) {
    ui.notifications.warn("Invalid scan target.");
    return state;
  }

  // Can't scan yourself
  if (targetId === userId) {
    ui.notifications.warn("You can't scan yourself!");
    return state;
  }

  // Can't scan the GM
  const targetUser = game.users.get(targetId);
  if (targetUser?.isGM) {
    ui.notifications.warn("You can't scan the house!");
    return state;
  }

  // Check if already scanned this target
  const scannedBy = tableData.scannedBy ?? {};
  if (scannedBy[targetId]?.includes(userId)) {
    ui.notifications.warn("You've already scanned this player.");
    return state;
  }

  // Pay the scan cost (1x ante)
  const scanCost = ante;
  const canAfford = await deductFromActor(userId, scanCost);
  if (!canAfford) {
    ui.notifications.warn(`You need ${scanCost}gp to scan.`);
    return state;
  }
  await playSound("coins");

  const currentTableData = tableData;

  // Get actors and roll with disadvantage if Sloppy
  const scannerActor = getActorForUser(userId);
  const scannerName = scannerActor?.name ?? game.users.get(userId)?.name ?? "Unknown";
  const targetActor = getActorForUser(targetId);

  // Scan roll (Insight vs Tell DC // Arcana vs Residue DC)
  const isScannerSloppy = currentTableData.sloppy?.[userId] ?? false;
  const targetName = targetActor?.name ?? game.users.get(targetId)?.name ?? "Unknown";

  const skillName = scanType === "arcana" ? "Arcana" : "Insight";
  const skillKey = scanType === "arcana" ? "arc" : "ins";

  // Roll d20 (with disadvantage if sloppy)
  const roll = await new Roll(isScannerSloppy ? "2d20kl1" : "1d20").evaluate();
  const d20Result = roll.total;
  const skillMod = scannerActor?.system?.skills?.[skillKey]?.total ?? 0;
  const scanRoll = d20Result + skillMod;

  // Check if target cheated
  const targetCheaterData = tableData.cheaters?.[targetId];
  const cheats = targetCheaterData?.cheats ?? [];

  // Find cheats that match the scan type
  const relevantCheats = cheats.filter(c => {
    if (scanType === "insight") return c.type === "physical";
    if (scanType === "arcana") return c.type === "magical";
    return false;
  });

  // Check which cheats were detected
  const detectedCheats = relevantCheats.filter(c => scanRoll >= c.dc);
  const foundSomething = detectedCheats.length > 0;

  // Track that this player scanned this target
  const updatedScannedBy = { ...scannedBy };
  if (!updatedScannedBy[targetId]) {
    updatedScannedBy[targetId] = [];
  }
  updatedScannedBy[targetId].push(userId);

  // Build the result message (whispered to scanner)
  let whisperContent = `<div class="tavern-scan-result">
    <strong>Scan Results: ${targetName}</strong><br>
    <em>${skillName}: ${d20Result} + ${skillMod} = ${scanRoll}</em><br><hr>`;

  if (foundSomething) {
    whisperContent += `<span style="color: #ffaa00; font-weight: bold;">SOMETHING'S OFF!</span><br>`;
    detectedCheats.forEach(c => {
      const cheatTypeLabel = c.type === "physical" ? "Physical (Tell)" : "Magical (Residue)";
      const location = c.isHoleDie ? "Hole Die" : "Visible Die";
      whisperContent += `• ${cheatTypeLabel} cheat detected on <strong>${location}</strong><br>`;
    });
    whisperContent += `<br><em style="color: #888;">You don't know the exact value - but something was changed.</em>`;
  } else {
    // Same message whether they cheated (but failed DC) or didn't cheat - no info leak
    whisperContent += `<span style="color: #88ff88;">Nothing detected.</span><br>`;
    whisperContent += `<em>No ${scanType === "arcana" ? "magical residue" : "physical tells"} found.</em>`;
  }
  whisperContent += `</div>`;

  // Whisper results to scanner
  await ChatMessage.create({
    content: whisperContent,
    whisper: [userId],
    speaker: { alias: "Tavern Twenty-One" },
  });

  // Public message (just shows they scanned, not the result)
  await createChatCard({
    title: "Scanning...",
    subtitle: `${scannerName} studies ${targetName}`,
    message: `${scannerName} pays ${scanCost}gp to scrutinize ${targetName} with ${skillName}...`,
    icon: scanType === "arcana" ? "fa-solid fa-wand-magic-sparkles" : "fa-solid fa-eye",
  });

  await addHistoryEntry({
    type: "scan",
    scanner: scannerName,
    target: targetName,
    scanType,
    roll: scanRoll,
    cost: scanCost,
    found: foundSomething,
    message: `${scannerName} scanned ${targetName} with ${skillName} (${scanRoll}).`,
  });

  const updatedTableData = {
    ...tableData,
    scannedBy: updatedScannedBy,
  };

  return updateState({ tableData: updatedTableData });
}

/**
 * V2.0 Accuse: Target a specific player and accuse them of cheating.
 * 
 * CHANGES FROM V1:
 * - Cost: 2x ante (not half pot)
 * - No skill roll required - direct accusation
 * - If correct: Refund 2x ante + pay 5x ante bounty from cheater's winnings
 * - If incorrect: Just lose the 2x ante fee (no forfeit of winnings)
 */
export async function accuse(payload, userId) {
  const state = getState();
  if (state.status !== "INSPECTION") {
    ui.notifications.warn("Accusations can only be made during the showdown.");
    return state;
  }

  // GM cannot accuse - they're the house
  const user = game.users.get(userId);
  if (user?.isGM) {
    ui.notifications.warn("The house observes but does not accuse.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const { targetId } = payload;

  // Validate target
  if (!targetId || !state.turnOrder.includes(targetId)) {
    ui.notifications.warn("Invalid accusation target.");
    return state;
  }

  // Can't accuse yourself
  if (targetId === userId) {
    ui.notifications.warn("You can't accuse yourself!");
    return state;
  }

  // Can't accuse the GM
  const targetUser = game.users.get(targetId);
  if (targetUser?.isGM) {
    ui.notifications.warn("You can't accuse the house!");
    return state;
  }

  // Only one accusation allowed per round
  if (tableData.accusation) {
    ui.notifications.warn("An accusation has already been made this round.");
    return state;
  }

  // Busted players can't accuse
  if (tableData.busts?.[userId]) {
    ui.notifications.warn("You busted - you can't make accusations!");
    return state;
  }

  // V2.0: Accusation cost is 2x ante (not half pot)
  const accusationCost = ante * 2;

  // Check if player can afford it
  const canAfford = await deductFromActor(userId, accusationCost);
  if (!canAfford) {
    await notifyUser(userId, `You need ${accusationCost}gp (2x ante) to make an accusation.`);
    return state;
  }
  await playSound("coins");

  // V2.0: No skill roll - direct accusation
  // Simply check if target is in cheaters list
  const targetCheaterData = tableData.cheaters?.[targetId];
  const caught = { ...tableData.caught };

  const accuserActor = getActorForUser(userId);
  const accuserName = accuserActor?.name ?? game.users.get(userId)?.name ?? "Unknown";
  const targetName = getActorForUser(targetId)?.name ?? game.users.get(targetId)?.name ?? "Unknown";

  // V2.0: No skill roll - direct accusation
  // Simply check if target is in cheaters list
  const success = !!targetCheaterData; // If they have any cheat records, they cheated

  if (success) {
    caught[targetId] = true;
  }

  // V2.0: Track bounty info for payout phase
  // - If correct: refund 2x ante + 5x ante bounty from cheater
  // - If incorrect: just lose the fee (no additional forfeit)
  const bountyAmount = ante * 5;

  // Track the accusation with bounty info
  const updatedTableData = {
    ...tableData,
    caught,
    accusation: {
      accuserId: userId,
      targetId: targetId,
      success: success,
      cost: accusationCost,
      bounty: bountyAmount,
    },
    // V2.0: No longer forfeit winnings on false accusation - just lose the fee
    // Remove the failedInspector mechanic
  };

  await addHistoryEntry({
    type: "accusation",
    accuser: accuserName,
    target: targetName,
    cost: accusationCost,
    bounty: bountyAmount,
    success: success,
    message: `${accuserName} accused ${targetName} of cheating! (${accusationCost}gp)`,
  });

  // Show the accusation publicly
  await createChatCard({
    title: "Accusation!",
    subtitle: `${accuserName} accuses ${targetName}`,
    message: `<strong>${accuserName}</strong> points the finger at <strong>${targetName}</strong>!<br>
      <em>Cost: ${accusationCost}gp (2× ante)</em><br>
      The truth will be revealed...`,
    icon: "fa-solid fa-hand-point-right",
  });

  // Update state but stay in INSPECTION - GM will trigger reveal
  return updateState({ tableData: updatedTableData });
}

/**
 * Goad (V2.0): Try to force another player to ROLL.
 * - Only during betting phase
 * - Once per round per player
 * - Attacker chooses: Intimidation OR Persuasion
 * - Defender rolls: Insight
 * - If attacker wins: target MUST roll a die of their choice (even if holding!)
 * - If attacker loses (backfire): attacker MUST roll a die of their choice
 */
export async function goad(payload, userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    ui.notifications.warn("Cannot goad outside of an active round.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();

  // Must be in betting phase
  if (tableData.phase !== "betting") {
    ui.notifications.warn("Goading can only be used during the betting phase.");
    return state;
  }

  // GM cannot goad - they're the house
  const user = game.users.get(userId);
  if (user?.isGM) {
    ui.notifications.warn("The house does not goad.");
    return state;
  }

  // Player must not have busted
  if (tableData.busts?.[userId]) {
    ui.notifications.warn("You busted - you can't goad anyone!");
    return state;
  }

  // Player can goad even if holding (unlike old intimidate)
  // But they can only goad once per round
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

  // Can't goad the GM
  const targetUser = game.users.get(targetId);
  if (targetUser?.isGM) {
    ui.notifications.warn("You can't goad the house!");
    return state;
  }

  // Target must not have busted (but CAN be holding - that's the point!)
  if (tableData.busts?.[targetId]) {
    ui.notifications.warn("That player has already busted.");
    return state;
  }

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
  const attackD20 = attackRoll.total;
  const attackMod = attackerActor?.system?.skills?.[attackerSkill]?.total ?? 0;
  const attackTotal = attackD20 + attackMod;

  // Roll defender's Insight (Iron Liver: Sloppy = disadvantage)
  const isDefenderSloppy = tableData.sloppy?.[targetId] ?? false;
  const defendRoll = await new Roll(isDefenderSloppy ? "2d20kl1" : "1d20").evaluate();
  const defendD20 = defendRoll.total;
  const defendMod = defenderActor?.system?.skills?.ins?.total ?? 0;
  const defendTotal = defendD20 + defendMod;

  // Determine winner: attacker must beat (not tie) defender
  const attackerWins = attackTotal > defendTotal;

  // Post the premium goad card
  await ChatMessage.create({
    content: `<div class="tavern-goad-card">
      <div class="goad-banner">
        <i class="fa-solid fa-comments"></i>
        <span>${attackerName} goads ${defenderName}...</span>
      </div>
      <div class="goad-duel">
        <div class="goad-combatant ${attackerWins ? 'winner' : 'loser'}">
          <div class="combatant-name">${attackerName}</div>
          <div class="combatant-skill">${attackerSkillName}</div>
          <div class="combatant-roll">
            <span class="roll-total">${attackTotal}</span>
            <span class="roll-breakdown">${attackD20} + ${attackMod}</span>
          </div>
        </div>
        <div class="goad-versus">
          <span>VS</span>
        </div>
        <div class="goad-combatant ${!attackerWins ? 'winner' : 'loser'}">
          <div class="combatant-name">${defenderName}</div>
          <div class="combatant-skill">Insight</div>
          <div class="combatant-roll">
            <span class="roll-total">${defendTotal}</span>
            <span class="roll-breakdown">${defendD20} + ${defendMod}</span>
          </div>
        </div>
      </div>
      <div class="goad-outcome ${attackerWins ? 'success' : 'failure'}">
        <i class="fa-solid ${attackerWins ? 'fa-dice' : 'fa-face-smile-wink'}"></i>
        <span>${attackerWins
        ? `${defenderName} takes the bait! They must roll!`
        : `${defenderName} sees through it! ${attackerName} must roll!`
      }</span>
      </div>
    </div>`,
    speaker: { alias: "Tavern Twenty-One" },
    rolls: [attackRoll, defendRoll],
  });

  // Track that this player has goaded this round
  const updatedGoadedThisRound = { ...tableData.goadedThisRound, [userId]: true };
  const updatedGoadBackfire = { ...tableData.goadBackfire };

  // If attacker wins: target is marked as needing to roll (goadBackfire on TARGET means they must roll)
  // If attacker loses: attacker must roll (goadBackfire on ATTACKER)
  // We'll store who must roll in goadBackfire - they'll pick their die on their action
  if (attackerWins) {
    // Target must roll - remove their hold status if they were holding
    const updatedHolds = { ...tableData.holds };
    if (updatedHolds[targetId]) {
      delete updatedHolds[targetId];
    }
    updatedGoadBackfire[targetId] = { mustRoll: true, goadedBy: userId };
    await playSound("reveal");

    const updatedTableData = {
      ...tableData,
      holds: updatedHolds,
      goadedThisRound: updatedGoadedThisRound,
      goadBackfire: updatedGoadBackfire,
    };

    await addHistoryEntry({
      type: "goad",
      attacker: attackerName,
      defender: defenderName,
      skill: attackerSkillName,
      attackRoll: attackTotal,
      defendRoll: defendTotal,
      success: true,
      message: `${attackerName} goaded ${defenderName} into rolling again!`,
    });

    return updateState({ tableData: updatedTableData });
  } else {
    // Attacker must roll (backfire)
    updatedGoadBackfire[userId] = { mustRoll: true, goadedBy: targetId };
    await playSound("lose");

    const updatedTableData = {
      ...tableData,
      goadedThisRound: updatedGoadedThisRound,
      goadBackfire: updatedGoadBackfire,
    };

    await addHistoryEntry({
      type: "goad",
      attacker: attackerName,
      defender: defenderName,
      skill: attackerSkillName,
      attackRoll: attackTotal,
      defendRoll: defendTotal,
      success: false,
      message: `${attackerName}'s goad backfired! They must roll instead!`,
    });

    return updateState({ tableData: updatedTableData });
  }
}

/**
 * Skip inspection and proceed to payout
 */
export async function skipInspection() {
  const state = getState();
  if (state.status !== "INSPECTION") {
    return state;
  }
  return finishRound();
}

/**
 * Bump the Table: Try to force another player to re-roll one of their dice.
 * - Only during betting phase
 * - Once per round per player
 * - Attacker rolls Athletics (STR)
 * - Defender rolls Dexterity Save
 * - If attacker wins: target's chosen die is re-rolled
 * - If attacker loses: target chooses one of attacker's dice to re-roll (pending state)
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

  // GM cannot bump - they're the house
  const user = game.users.get(userId);
  if (user?.isGM) {
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

  const { targetId, dieIndex } = payload;

  // Validate target
  if (!targetId || targetId === userId) {
    ui.notifications.warn("You can't bump your own dice!");
    return state;
  }

  const targetUser = game.users.get(targetId);
  if (targetUser?.isGM) {
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

  if (dieIndex < 0 || dieIndex >= targetRolls.length) {
    ui.notifications.warn("Invalid die selection.");
    return state;
  }

  // Get actor info
  const attackerActor = game.user.character ? game.users.get(userId)?.character : null;
  const actualAttackerActor = game.users.get(userId)?.character;
  const attackerName = actualAttackerActor?.name ?? game.users.get(userId)?.name ?? "Unknown";
  const targetActor = game.users.get(targetId)?.character;
  const targetName = targetActor?.name ?? game.users.get(targetId)?.name ?? "Unknown";

  // Roll attacker's Athletics
  let athleticsRoll = 10;
  let athleticsMod = 0;
  let athleticsD20 = 10;

  const attackerRoll = await new Roll("1d20").evaluate();
  athleticsD20 = attackerRoll.total;

  if (actualAttackerActor) {
    athleticsMod = actualAttackerActor.system?.skills?.ath?.total ?? 0;
    athleticsRoll = athleticsD20 + athleticsMod;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: actualAttackerActor }),
      flavor: `<em>${attackerName} bumps the table...</em><br>Athletics`,
      content: `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">1d20 + ${athleticsMod}</div><div class="dice-tooltip"><section class="tooltip-part"><div class="dice"><ol class="dice-rolls"><li class="roll die d20">${athleticsD20}</li></ol></div></section></div><h4 class="dice-total">${athleticsRoll}</h4></div></div>`,
      rolls: [attackerRoll],
    });
  } else {
    athleticsRoll = athleticsD20;
    await ChatMessage.create({
      speaker: { alias: game.users.get(userId)?.name ?? "Unknown" },
      flavor: `<em>Bumping the table...</em><br>Athletics`,
      content: `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">1d20</div><div class="dice-tooltip"><section class="tooltip-part"><div class="dice"><ol class="dice-rolls"><li class="roll die d20">${athleticsD20}</li></ol></div></section></div><h4 class="dice-total">${athleticsRoll}</h4></div></div>`,
      rolls: [attackerRoll],
    });
  }

  // Iron Liver: Immovable Object - auto-select best save for defender
  // The defender's higher modifier between DEX and CON is used
  const dexMod = targetActor?.system?.abilities?.dex?.mod ?? 0;
  const conMod = targetActor?.system?.abilities?.con?.mod ?? 0;
  const defenderSaveType = conMod > dexMod ? "con" : "dex";
  const saveName = defenderSaveType === "con" ? "Constitution Save" : "Dexterity Save";
  const saveFlavorDex = `${targetName} tries to catch their dice...`;
  const saveFlavorCon = `${targetName} braces against the table...`;
  const saveFlavor = defenderSaveType === "con" ? saveFlavorCon : saveFlavorDex;

  // Roll defender's save (DEX or CON)
  let defenderSaveRoll = 10;
  let defenderSaveMod = 0;
  let defenderSaveD20 = 10;

  const defenderRoll = await new Roll("1d20").evaluate();
  defenderSaveD20 = defenderRoll.total;

  if (targetActor) {
    defenderSaveMod = targetActor.system?.abilities?.[defenderSaveType]?.mod ?? 0;
    defenderSaveRoll = defenderSaveD20 + defenderSaveMod;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: targetActor }),
      flavor: `<em>${saveFlavor}</em><br>${saveName}`,
      content: `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">1d20 + ${defenderSaveMod}</div><div class="dice-tooltip"><section class="tooltip-part"><div class="dice"><ol class="dice-rolls"><li class="roll die d20">${defenderSaveD20}</li></ol></div></section></div><h4 class="dice-total">${defenderSaveRoll}</h4></div></div>`,
      rolls: [defenderRoll],
    });
  } else {
    defenderSaveRoll = defenderSaveD20;
    await ChatMessage.create({
      speaker: { alias: game.users.get(targetId)?.name ?? "Unknown" },
      flavor: `<em>${saveFlavor}</em><br>${saveName}`,
      content: `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">1d20</div><div class="dice-tooltip"><section class="tooltip-part"><div class="dice"><ol class="dice-rolls"><li class="roll die d20">${defenderSaveD20}</li></ol></div></section></div><h4 class="dice-total">${defenderSaveRoll}</h4></div></div>`,
      rolls: [defenderRoll],
    });
  }

  // Determine winner: attacker must beat defender
  const success = athleticsRoll > defenderSaveRoll;

  // Mark that attacker has bumped this round
  const updatedBumpedThisRound = { ...tableData.bumpedThisRound, [userId]: true };

  if (success) {
    // SUCCESS: Re-roll target's specified die
    const targetDie = targetRolls[dieIndex];
    const oldValue = targetDie.result;
    const dieSides = targetDie.die;
    const wasPublic = targetDie.public ?? true; // V2.0: Preserve visibility

    // Roll new value
    const reroll = await new Roll(`1d${dieSides}`).evaluate();
    const newValue = reroll.total;

    // V2.0: Keep the same visibility status - bumped hole die stays hidden!
    const newTargetRolls = [...targetRolls];
    newTargetRolls[dieIndex] = { ...targetDie, result: newValue, public: wasPublic };

    // Calculate new total
    const newTotal = newTargetRolls.reduce((sum, r) => sum + r.result, 0);
    const oldTotal = tableData.totals?.[targetId] ?? 0;
    const targetBusted = newTotal > 21;

    // V2.0: Update visible total if the bumped die was public
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
    }

    const updatedTableData = {
      ...tableData,
      rolls: updatedRolls,
      totals: updatedTotals,
      visibleTotals: updatedVisibleTotals,
      busts: updatedBusts,
      bumpedThisRound: updatedBumpedThisRound,
    };

    // V2.0: Different message if bumped a hole die (don't reveal the value!)
    const visibilityLabel = wasPublic ? "" : " (Hole Die)";
    const valueDisplay = wasPublic ? `${oldValue} → <strong>${newValue}</strong>` : "??? → <strong>???</strong>";

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
    let resultMessage = wasPublic
      ? `<strong>${targetName}'s</strong> d${dieSides} (was ${oldValue}) → <strong>${newValue}</strong><br>Total: ${oldTotal} → <strong>${newTotal}</strong>`
      : `<strong>${targetName}'s</strong> hole die (d${dieSides}) was bumped!<br><em>The new value remains hidden...</em>`;

    if (targetBusted && wasPublic) {
      resultMessage += `<br><span style="color: #ff6666; font-weight: bold;">BUST!</span>`;
    }

    await createChatCard({
      title: "Table Bump!",
      subtitle: `${attackerName} vs ${targetName}`,
      message: `
        <div style="display: flex; justify-content: space-around; margin: 8px 0; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
          <div style="text-align: center;">
            <div style="font-size: 11px; color: #999; text-transform: uppercase;">Athletics</div>
            <div style="font-size: 20px; font-weight: bold; color: #ddc888;">${athleticsRoll}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 11px; color: #999; text-transform: uppercase;">Dex Save</div>
            <div style="font-size: 20px; font-weight: bold; color: #88ccdd;">${dexSaveRoll}</div>
          </div>
        </div>
        <div style="text-align: center; padding: 8px; background: rgba(74, 124, 78, 0.3); border: 1px solid #4a7c4e; border-radius: 4px; margin-top: 8px;">
          <div style="color: #aaffaa; font-weight: bold;">SUCCESS!${!wasPublic ? ' (Hole Die)' : ''}</div>
          <div style="margin-top: 4px;">${resultMessage}</div>
        </div>
      `,
      icon: "fa-solid fa-hand-fist",
    });

    await playSound("dice");

    return updateState({ tableData: updatedTableData });

  } else {
    // FAILURE: Set pending retaliation state - target chooses attacker's die
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
      message: `${attackerName} tried to bump ${targetName}'s dice but was caught!`,
    });

    // Create failure chat card (awaiting retaliation)
    await createChatCard({
      title: "Table Bump!",
      subtitle: `${attackerName} vs ${targetName}`,
      message: `
        <div style="display: flex; justify-content: space-around; margin: 8px 0; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
          <div style="text-align: center;">
            <div style="font-size: 11px; color: #999; text-transform: uppercase;">Athletics</div>
            <div style="font-size: 20px; font-weight: bold; color: #ddc888;">${athleticsRoll}</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 11px; color: #999; text-transform: uppercase;">Dex Save</div>
            <div style="font-size: 20px; font-weight: bold; color: #88ccdd;">${dexSaveRoll}</div>
          </div>
        </div>
        <div style="text-align: center; padding: 8px; background: rgba(139, 58, 58, 0.3); border: 1px solid #8b3a3a; border-radius: 4px; margin-top: 8px;">
          <div style="color: #ffaaaa; font-weight: bold;">CAUGHT!</div>
          <div style="margin-top: 4px;"><strong>${targetName}</strong> catches their dice!</div>
          <div style="margin-top: 4px; font-style: italic; color: #ffcc88;">Awaiting retaliation...</div>
        </div>
      `,
      icon: "fa-solid fa-hand-fist",
    });

    return updateState({ tableData: updatedTableData });
  }
}

/**
 * Bump Retaliation: Target (or GM override) chooses which of attacker's dice to re-roll.
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

  // V2.0: Update visible total if the die was public
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
    pendingBumpRetaliation: null,  // Clear the pending state
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
  // V2.0: Don't reveal values if it was a hole die
  let resultMessage;
  if (wasPublic) {
    resultMessage = `<strong>${attackerName}'s</strong> d${dieSides} (was ${oldValue}) → <strong>${newValue}</strong><br>`;
    resultMessage += `Total: ${oldTotal} → <strong>${newTotal}</strong>`;
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

  await playSound("dice");

  return updateState({ tableData: updatedTableData });
}
