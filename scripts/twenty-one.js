import { MODULE_ID, getState, updateState, addHistoryEntry } from "./state.js";
import { canAffordAnte, deductAnteFromActors, deductFromActor, payOutWinners } from "./wallet.js";
import { createChatCard } from "./ui/chat.js";
import { showPublicRoll } from "./dice.js";
import { playSound } from "./sounds.js";
import { tavernSocket } from "./socket.js";

const VALID_DICE = [20, 12, 10, 8, 6, 4];
const OPENING_ROLLS_REQUIRED = 2;

/**
 * Get all GM user IDs for whispered notifications
 */
function getGMUserIds() {
  return game.users.filter(u => u.isGM).map(u => u.id);
}

function emptyTableData() {
  return {
    totals: {},
    holds: {},
    busts: {},
    rolls: {},
    currentPlayer: null,
    phase: "opening", // "opening" = everyone rolls 2 dice, "betting" = roll costs ante or hold
    // Cheating system: track each cheat with its Deception roll
    // cheaters: { [userId]: { deceptionRolls: [{ dieIndex, oldValue, newValue, deception, isNat1, isNat20 }] } }
    cheaters: {},
    // Bluffers: { [userId]: { deceptionRoll, isNat1, isNat20 } }
    bluffers: {},
    // Track who was caught cheating (forfeits the round)
    caught: {},
    // Targeted accusation tracking: { accuserId, targetId, success }
    accusation: null,
    // Track who made a false accusation (forfeits winnings)
    failedInspector: null,
    // Intimidation tracking
    intimidatedThisRound: {},  // { [oderId]: true } - who has used their intimidation this round
    intimidationBackfire: {},  // { [oderId]: true } - disadvantage on next cheat/accuse from failed intimidation
  };
}

function getNextActivePlayer(state, tableData) {
  const order = state.turnOrder;
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
  return state.turnOrder.every((id) => tableData.holds[id] || tableData.busts[id]);
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

  const tableData = state.tableData ?? emptyTableData();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  const isOpeningPhase = tableData.phase === "opening";

  if (tableData.currentPlayer !== userId) {
    ui.notifications.warn("It's not your turn.");
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

  // In betting phase, rolling costs the ante (except for GM/house)
  let newPot = state.pot;
  if (!isOpeningPhase) {
    const user = game.users.get(userId);
    if (!user?.isGM) {
      // Check if player can afford to roll
      const canAfford = await deductFromActor(userId, ante);
      if (!canAfford) {
        ui.notifications.warn(`You need ${ante}gp to roll another die.`);
        return state;
      }
      newPot = state.pot + ante;
      await playSound("coins");
    }
  }

  const roll = await new Roll(`1d${die}`).evaluate();
  const result = roll.total ?? 0;

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

  rolls[userId] = [...(rolls[userId] ?? []), { die, result }];
  totals[userId] = (totals[userId] ?? 0) + result;

  const busts = { ...tableData.busts };
  const isBust = totals[userId] > 21;
  if (isBust) {
    busts[userId] = true;
  }

  const userName = game.users.get(userId)?.name ?? "Unknown";
  const rollCostMsg = !isOpeningPhase && !game.users.get(userId)?.isGM ? ` (${ante}gp)` : "";
  await addHistoryEntry({
    type: isBust ? "bust" : "roll",
    player: userName,
    die: `d${die}`,
    result,
    total: totals[userId],
    message: isBust
      ? `${userName} rolled d${die} and BUSTED with ${totals[userId]}!`
      : `${userName} rolled a d${die}${rollCostMsg}...`,
  });

  const updatedTable = {
    ...tableData,
    rolls,
    totals,
    busts,
  };

  // Determine next player based on phase
  if (isOpeningPhase) {
    const myRolls = rolls[userId] ?? [];
    // If player has completed opening rolls (2) or busted, move to next
    if (myRolls.length >= OPENING_ROLLS_REQUIRED || isBust) {
      // Check if all players done with opening
      if (allPlayersCompletedOpening(state, updatedTable)) {
        // Transition to betting phase
        updatedTable.phase = "betting";
        updatedTable.currentPlayer = getNextActivePlayer(state, updatedTable);
        
        await createChatCard({
          title: "Betting Round",
          subtitle: "Opening complete!",
          message: `All players have their opening hands. Roll to push your luck (costs ${ante}gp) or hold!`,
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
    ui.notifications.warn("It's not your turn.");
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

  // Check for nat 1 cheaters who weren't caught by accusation
  const caught = { ...tableData.caught };
  const nat1CaughtNames = [];
  for (const [cheaterId, cheaterData] of Object.entries(tableData.cheaters)) {
    if (caught[cheaterId]) continue; // Already caught
    for (const cheatRecord of cheaterData.deceptionRolls) {
      if (cheatRecord.isNat1) {
        caught[cheaterId] = true;
        const cheaterName = getActorForUser(cheaterId)?.name ?? game.users.get(cheaterId)?.name ?? "Unknown";
        nat1CaughtNames.push(cheaterName);
        break;
      }
    }
  }

  if (nat1CaughtNames.length > 0) {
    await createChatCard({
      title: "Fumbled!",
      subtitle: "A clumsy cheater exposed!",
      message: `<strong>${nat1CaughtNames.join(", ")}</strong> fumbled their sleight of hand and got caught red-handed!`,
      icon: "fa-solid fa-hand-fist",
    });
  }

  // If an accusation was made, reveal the outcome now
  if (tableData.accusation) {
    const { accuserId, targetId, success } = tableData.accusation;
    const accuserName = getActorForUser(accuserId)?.name ?? game.users.get(accuserId)?.name ?? "Unknown";
    const targetName = getActorForUser(targetId)?.name ?? game.users.get(targetId)?.name ?? "Unknown";

    // Brief pause for tension
    await new Promise(r => setTimeout(r, 1000));

    if (success) {
      await playSound("reveal");
      await createChatCard({
        title: "Cheater Caught!",
        subtitle: `${accuserName} was right!`,
        message: `<strong>${targetName}</strong> was caught cheating and forfeits the round.`,
        icon: "fa-solid fa-gavel",
      });

      await addHistoryEntry({
        type: "cheat_caught",
        accuser: accuserName,
        caught: targetName,
        message: `${accuserName} caught ${targetName} cheating!`,
      });
    } else {
      await playSound("lose");
      await createChatCard({
        title: "False Accusation!",
        subtitle: `${targetName} is innocent.`,
        message: `<strong>${accuserName}</strong> was wrong and forfeits their claim to the pot.`,
        icon: "fa-solid fa-face-frown",
      });

      await addHistoryEntry({
        type: "accusation_failed",
        accuser: accuserName,
        target: targetName,
        message: `${accuserName} falsely accused ${targetName} and forfeits their winnings.`,
      });
    }

    // Another pause after accusation result
    await new Promise(r => setTimeout(r, 500));
  }

  // Get the failed inspector (if any) - they forfeit their winnings
  const failedInspector = tableData.failedInspector;

  // Calculate winners - exclude caught cheaters AND failed inspectors!
  const totals = tableData.totals ?? {};
  let best = 0;
  state.turnOrder.forEach((id) => {
    // Caught cheaters cannot win
    if (caught[id]) return;
    // Failed inspectors cannot win
    if (failedInspector === id) return;
    const total = totals[id] ?? 0;
    if (total <= 21 && total > best) best = total;
  });

  // Winners are those with best score who weren't caught cheating or failed inspection
  const winners = state.turnOrder.filter((id) => {
    if (caught[id]) return false;
    if (failedInspector === id) return false;
    return (totals[id] ?? 0) === best && best > 0;
  });

  // Calculate payouts with Natural 21 Bonus (Blackjack!)
  // Players who hit exactly 21 WITHOUT cheating get 1.5x their share
  const payouts = {};
  const blackjackWinners = [];
  
  if (winners.length) {
    // Determine who gets the blackjack bonus
    let totalShares = 0;
    const winnerMultipliers = {};
    
    for (const id of winners) {
      const total = totals[id] ?? 0;
      const didCheat = tableData.cheaters[id]?.deceptionRolls?.length > 0;
      
      // Natural 21 (no cheating) = 1.5x multiplier
      if (total === 21 && !didCheat) {
        winnerMultipliers[id] = 1.5;
        blackjackWinners.push(id);
      } else {
        winnerMultipliers[id] = 1.0;
      }
      totalShares += winnerMultipliers[id];
    }
    
    // Calculate each winner's payout
    const baseShare = state.pot / totalShares;
    for (const id of winners) {
      payouts[id] = Math.floor(baseShare * winnerMultipliers[id]);
    }
    
    await payOutWinners(payouts);
    await playSound("win");
  } else {
    await playSound("lose");
  }

  // Build winner names with blackjack indicator
  const winnerNames = winners.map(id => {
    const name = game.users.get(id)?.name ?? "Unknown";
    return blackjackWinners.includes(id) ? `${name} (BLACKJACK!)` : name;
  }).join(", ");
  
  const resultsMsg = state.turnOrder.map(id => {
    const name = game.users.get(id)?.name ?? "Unknown";
    const total = totals[id] ?? 0;
    const busted = tableData.busts[id];
    const wasCaught = caught[id];
    const wasFailedInspector = failedInspector === id;
    let suffix = "";
    if (wasCaught) suffix = " (CHEATER!)";
    else if (wasFailedInspector) suffix = " (FALSE ACCUSER!)";
    else if (busted) suffix = " (BUST)";
    if (winners.includes(id)) {
      if (blackjackWinners.includes(id)) {
        suffix += " ★ BLACKJACK!";
      } else {
        suffix += " ★";
      }
    }
    return `${name}: ${total}${suffix}`;
  }).join(" | ");

  // Build payout message
  let payoutMsg = "";
  if (winners.length) {
    if (blackjackWinners.length > 0) {
      // Show individual payouts when there's a blackjack bonus
      const payoutDetails = winners.map(id => {
        const name = game.users.get(id)?.name ?? "Unknown";
        const amount = payouts[id] ?? 0;
        const isBlackjack = blackjackWinners.includes(id);
        return `${name}: <strong>${amount}gp</strong>${isBlackjack ? " (1.5x)" : ""}`;
      }).join(", ");
      payoutMsg = `<div class="tavern-payout">Payouts: ${payoutDetails}</div>`;
    } else {
      const flatShare = Object.values(payouts)[0] ?? 0;
      payoutMsg = `<div class="tavern-payout">Payout: <strong>${flatShare}gp</strong> each</div>`;
    }
  }

  await addHistoryEntry({
    type: "round_end",
    winners: winnerNames || "None",
    winningTotal: best,
    payout: Object.values(payouts)[0] ?? 0,
    message: winners.length
      ? `${winnerNames} wins with ${best}!`
      : "Everyone busted, got caught, or made false accusations! House wins.",
    results: resultsMsg,
  });

  await createChatCard({
    title: "Round Complete!",
    subtitle: winners.length ? `Winner${winners.length > 1 ? "s" : ""}: ${winnerNames}` : "House Wins!",
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
 * Cheat: Modify a die result. Rolls chosen skill to see if they get away with it.
 * - Nat 1: Instant caught (revealed at reveal phase)
 * - Nat 20: Cannot be caught by any accusation
 * - Otherwise: Skill roll is stored for later comparison
 * 
 * Player chooses between Deception (CHA) or Sleight of Hand (DEX).
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

  const tableData = state.tableData ?? emptyTableData();
  const { dieIndex, newValue, skill = "dec" } = payload;

  // Skill name mapping
  const skillNames = {
    dec: "Deception",
    slt: "Sleight of Hand",
  };
  const skillName = skillNames[skill] ?? "Deception";

  // Validate die index
  const rolls = tableData.rolls[userId] ?? [];
  if (dieIndex < 0 || dieIndex >= rolls.length) {
    ui.notifications.warn("Invalid die selection.");
    return state;
  }

  const targetDie = rolls[dieIndex];
  const maxValue = targetDie.die;

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

  // Roll the chosen skill check for the player
  const actor = getActorForUser(userId);
  let skillRoll = 10; // Default if no actor (flat d20)
  let isNat1 = false;
  let isNat20 = false;
  let skillMod = 0;
  let d20Result = 10;

  // Check for disadvantage from failed intimidation
  const hasDisadvantage = tableData.intimidationBackfire?.[userId] ?? false;

  // Roll d20 regardless of actor (with disadvantage if applicable)
  let roll;
  let roll2 = null;
  if (hasDisadvantage) {
    roll = await new Roll("1d20").evaluate();
    roll2 = await new Roll("1d20").evaluate();
    d20Result = Math.min(roll.total, roll2.total);
  } else {
    roll = await new Roll("1d20").evaluate();
    d20Result = roll.total;
  }
  isNat1 = d20Result === 1;
  isNat20 = d20Result === 20;

  // Clear the disadvantage flag after use
  const updatedIntimidationBackfire = { ...tableData.intimidationBackfire };
  if (hasDisadvantage) {
    delete updatedIntimidationBackfire[userId];
  }

  if (actor) {
    // Get the chosen skill modifier from D&D 5e actor
    skillMod = actor.system?.skills?.[skill]?.total ?? 0;
    skillRoll = d20Result + skillMod;

    // Whisper the skill roll to the player
    const disadvantageMsg = hasDisadvantage ? ` <span style='color: orange;'>(Disadvantage: ${roll.total}, ${roll2.total})</span>` : "";
    await roll.toMessage({
      speaker: { alias: skillName },
      flavor: `<em>${actor.name} attempts to cheat...</em><br>${skillName}: ${d20Result} + ${skillMod} = <strong>${skillRoll}</strong>${disadvantageMsg}${isNat20 ? " <span style='color: gold;'>(Untouchable!)</span>" : ""}${isNat1 ? " <span style='color: red;'>(Fumbled!)</span>" : ""}`,
      whisper: [userId],
    });
  } else {
    // No actor - flat d20 roll
    skillRoll = d20Result;
    
    const disadvantageMsg = hasDisadvantage ? ` <span style='color: orange;'>(Disadvantage: ${roll.total}, ${roll2.total})</span>` : "";
    await roll.toMessage({
      speaker: { alias: skillName },
      flavor: `<em>Attempting to cheat...</em><br>${skillName}: <strong>${skillRoll}</strong>${disadvantageMsg}${isNat20 ? " <span style='color: gold;'>(Untouchable!)</span>" : ""}${isNat1 ? " <span style='color: red;'>(Fumbled!)</span>" : ""}`,
      whisper: [userId],
    });
  }

  // Update the die value
  const updatedRolls = { ...tableData.rolls };
  updatedRolls[userId] = [...rolls];
  const oldValue = updatedRolls[userId][dieIndex].result;
  updatedRolls[userId][dieIndex] = { ...targetDie, result: newValue };

  // Update total
  const updatedTotals = { ...tableData.totals };
  updatedTotals[userId] = (updatedTotals[userId] ?? 0) - oldValue + newValue;

  // Check for bust after cheating
  const updatedBusts = { ...tableData.busts };
  
  // Nat 1 on cheat = auto-bust (fumbled so badly everyone notices)
  if (isNat1) {
    updatedBusts[userId] = true;
  } else if (updatedTotals[userId] > 21) {
    updatedBusts[userId] = true;
  } else if (updatedTotals[userId] <= 21 && tableData.busts[userId]) {
    // Un-bust if they cheated down from a bust
    updatedBusts[userId] = false;
  }

  // Track this cheat (store as "deception" for backwards compat with accusation logic)
  const cheaters = { ...tableData.cheaters };
  if (!cheaters[userId]) {
    cheaters[userId] = { deceptionRolls: [] };
  }
  cheaters[userId].deceptionRolls.push({
    dieIndex,
    oldValue,
    newValue,
    deception: skillRoll, // Keep as "deception" for accusation comparison
    isNat1,
    isNat20,
  });

  const updatedTable = {
    ...tableData,
    rolls: updatedRolls,
    totals: updatedTotals,
    busts: updatedBusts,
    cheaters,
    intimidationBackfire: updatedIntimidationBackfire,
  };

  const userName = game.users.get(userId)?.name ?? "Unknown";
  const characterName = actor?.name ?? userName;
  
  // Notify the GM with cheat details so they can narrate tells
  const gmIds = getGMUserIds();
  if (gmIds.length > 0) {
    const natStatus = isNat1 ? " (NAT 1 - FUMBLED! AUTO-BUST)" : isNat20 ? " (NAT 20 - UNTOUCHABLE!)" : "";
    await ChatMessage.create({
      content: `<div class="tavern-gm-alert tavern-gm-cheat">
        <strong>CHEAT DETECTED</strong><br>
        <em>${characterName}</em> changed their d${targetDie.die} from <strong>${oldValue}</strong> to <strong>${newValue}</strong><br>
        ${skillName}: <strong>${skillRoll}</strong>${natStatus}<br>
        <small>${isNat1 ? "They fumbled and busted!" : "Narrate a tell to the table if appropriate."}</small>
      </div>`,
      whisper: gmIds,
      speaker: { alias: "Tavern Twenty-One" },
    });
  }

  // If nat 1, also notify the player they busted
  if (isNat1) {
    await createChatCard({
      title: "Clumsy Hands!",
      subtitle: `${characterName} fumbles`,
      message: `${characterName} tried to cheat but fumbled badly - Loss of Trust! (Bust)`,
      icon: "fa-solid fa-hand-fist",
    });
    await playSound("lose");
  }

  // Check if any other players' Passive Perception beats the cheat roll
  // They get a whispered "gut feeling" hint about the cheater
  if (!isNat1 && !isNat20) {
    await checkPassivePerception(state, userId, characterName, skillRoll);
  }

  console.log(`Tavern Twenty-One | ${userName} cheated: d${targetDie.die} ${oldValue} → ${newValue}, ${skillName}: ${skillRoll} (nat1: ${isNat1}, nat20: ${isNat20})`);

  return updateState({ tableData: updatedTable });
}

/**
 * Accuse: Target a specific player and accuse them of cheating.
 * Costs half the pot. If target cheated AND skill roll beats their skill roll, they're caught.
 * If target didn't cheat OR skill roll fails, accuser forfeits their winnings.
 * 
 * Player chooses between Perception (WIS) or Insight (WIS).
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
  const { targetId, skill = "prc" } = payload;

  // Skill name mapping
  const skillNames = {
    prc: "Perception",
    ins: "Insight",
  };
  const skillName = skillNames[skill] ?? "Perception";

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

  // Calculate accusation cost: half the pot
  const accusationCost = Math.floor(state.pot / 2);
  
  // Check if player can afford it (GM doesn't pay - but GM already blocked above)
  if (!user?.isGM) {
    const canAfford = await deductFromActor(userId, accusationCost);
    if (!canAfford) {
      ui.notifications.warn(`You need ${accusationCost}gp (half the pot) to make an accusation.`);
      return state;
    }
    await playSound("coins");
  }

  const accuserActor = getActorForUser(userId);
  const accuserName = accuserActor?.name ?? game.users.get(userId)?.name ?? "Unknown";
  const targetName = getActorForUser(targetId)?.name ?? game.users.get(targetId)?.name ?? "Unknown";

  // Check for disadvantage from failed intimidation
  const hasDisadvantage = tableData.intimidationBackfire?.[userId] ?? false;

  // Roll the chosen skill
  let skillRoll = 10;
  let skillMod = 0;
  let d20Result = 10;

  // Roll d20 regardless of actor (with disadvantage if applicable)
  let roll;
  let roll2 = null;
  if (hasDisadvantage) {
    roll = await new Roll("1d20").evaluate();
    roll2 = await new Roll("1d20").evaluate();
    d20Result = Math.min(roll.total, roll2.total);
  } else {
    roll = await new Roll("1d20").evaluate();
    d20Result = roll.total;
  }

  // Clear the disadvantage flag after use
  const clearedIntimidationBackfire = { ...tableData.intimidationBackfire };
  if (hasDisadvantage) {
    delete clearedIntimidationBackfire[userId];
  }

  const disadvantageNote = hasDisadvantage ? ` <span style="color: orange;">(Disadvantage: ${roll.total}, ${roll2.total})</span>` : "";

  if (accuserActor) {
    skillMod = accuserActor.system?.skills?.[skill]?.total ?? 0;
    skillRoll = d20Result + skillMod;

    // Show the skill roll publicly (not as GM whisper)
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: accuserActor }),
      flavor: `<em>${accuserName} stares down ${targetName}...</em><br>${skillName}${disadvantageNote}`,
      content: `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">1d20 + ${skillMod}</div><div class="dice-tooltip"><section class="tooltip-part"><div class="dice"><ol class="dice-rolls"><li class="roll die d20">${d20Result}</li></ol></div></section></div><h4 class="dice-total">${skillRoll}</h4></div></div>`,
      rolls: [roll],
    });
  } else {
    // No actor - flat d20 roll
    skillRoll = d20Result;
    
    await ChatMessage.create({
      speaker: { alias: game.users.get(userId)?.name ?? "Unknown" },
      flavor: `<em>Staring down ${targetName}...</em><br>${skillName}${disadvantageNote}`,
      content: `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">1d20</div><div class="dice-tooltip"><section class="tooltip-part"><div class="dice"><ol class="dice-rolls"><li class="roll die d20">${d20Result}</li></ol></div></section></div><h4 class="dice-total">${skillRoll}</h4></div></div>`,
      rolls: [roll],
    });
  }

  // Check if target actually cheated
  const targetCheaterData = tableData.cheaters[targetId];
  const caught = { ...tableData.caught };
  let success = false;

  if (targetCheaterData) {
    // Target did cheat - check if skill roll beats their deception/sleight of hand
    for (const cheatRecord of targetCheaterData.deceptionRolls) {
      // Nat 20 cannot be caught
      if (cheatRecord.isNat20) continue;
      // Nat 1 will be caught at reveal regardless, but accusation can still catch them
      
      // If skill roll beats their cheat roll, caught!
      if (skillRoll > cheatRecord.deception) {
        caught[targetId] = true;
        success = true;
        break;
      }
    }
  }
  // If target didn't cheat at all, success remains false

  // Track the accusation
  const updatedTableData = {
    ...tableData,
    caught,
    accusation: {
      accuserId: userId,
      targetId: targetId,
      success: success,
    },
    failedInspector: success ? null : userId,
    intimidationBackfire: clearedIntimidationBackfire,
  };

  await addHistoryEntry({
    type: "accusation",
    accuser: accuserName,
    target: targetName,
    skill: skillName,
    skillRoll: skillRoll,
    cost: accusationCost,
    success: success,
    message: `${accuserName} accused ${targetName} of cheating! (${accusationCost}gp, ${skillName}: ${skillRoll})`,
  });

  // Don't reveal the result yet - just show that an accusation was made
  // The GM will trigger the reveal when ready for dramatic effect
  await createChatCard({
    title: "Accusation!",
    subtitle: `${accuserName} accuses ${targetName}`,
    message: `The accusation has been made. Awaiting judgment...`,
    icon: "fa-solid fa-hand-point-right",
  });

  // Update state but stay in INSPECTION - GM will trigger reveal
  return updateState({ tableData: updatedTableData });
}

/**
 * Intimidate: Try to force another player to hold.
 * - Only during betting phase
 * - Once per round per player
 * - Attacker rolls Intimidation (CHA)
 * - Defender chooses Wisdom Save or Insight
 * - If attacker wins: target forced to hold
 * - If attacker loses: attacker forced to hold + disadvantage on next cheat/accuse
 */
export async function intimidate(payload, userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    ui.notifications.warn("Cannot intimidate outside of an active round.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();

  // Must be in betting phase
  if (tableData.phase !== "betting") {
    ui.notifications.warn("Intimidation can only be used during the betting phase.");
    return state;
  }

  // GM cannot intimidate - they're the house
  const user = game.users.get(userId);
  if (user?.isGM) {
    ui.notifications.warn("The house does not intimidate.");
    return state;
  }

  // Player must not have busted or held
  if (tableData.busts?.[userId]) {
    ui.notifications.warn("You busted - you can't intimidate anyone!");
    return state;
  }
  if (tableData.holds?.[userId]) {
    ui.notifications.warn("You've already held - you can't intimidate anyone!");
    return state;
  }

  // Player can only intimidate once per round
  if (tableData.intimidatedThisRound?.[userId]) {
    ui.notifications.warn("You've already used your intimidation this round.");
    return state;
  }

  const { targetId, defenderSkill = "wis" } = payload;

  // Validate target
  if (!targetId || !state.turnOrder.includes(targetId)) {
    ui.notifications.warn("Invalid intimidation target.");
    return state;
  }

  // Can't intimidate yourself
  if (targetId === userId) {
    ui.notifications.warn("You can't intimidate yourself!");
    return state;
  }

  // Can't intimidate the GM
  const targetUser = game.users.get(targetId);
  if (targetUser?.isGM) {
    ui.notifications.warn("You can't intimidate the house!");
    return state;
  }

  // Target must not have busted or held
  if (tableData.busts?.[targetId]) {
    ui.notifications.warn("That player has already busted.");
    return state;
  }
  if (tableData.holds?.[targetId]) {
    ui.notifications.warn("That player has already held.");
    return state;
  }

  // Get actors
  const attackerActor = getActorForUser(userId);
  const defenderActor = getActorForUser(targetId);
  const attackerName = attackerActor?.name ?? game.users.get(userId)?.name ?? "Unknown";
  const defenderName = defenderActor?.name ?? game.users.get(targetId)?.name ?? "Unknown";

  // Defender skill names
  const defenderSkillNames = {
    wis: "Wisdom Save",
    ins: "Insight",
  };
  const defenderSkillName = defenderSkillNames[defenderSkill] ?? "Wisdom Save";

  // Roll attacker's Intimidation (CHA)
  const attackRoll = await new Roll("1d20").evaluate();
  const attackD20 = attackRoll.total;
  const attackMod = attackerActor?.system?.skills?.itm?.total ?? 0;
  const attackTotal = attackD20 + attackMod;

  // Roll defender's chosen skill
  const defendRoll = await new Roll("1d20").evaluate();
  const defendD20 = defendRoll.total;
  let defendMod = 0;
  
  if (defenderActor) {
    if (defenderSkill === "wis") {
      // Wisdom saving throw
      defendMod = defenderActor.system?.abilities?.wis?.save ?? 0;
    } else {
      // Insight skill
      defendMod = defenderActor.system?.skills?.ins?.total ?? 0;
    }
  }
  const defendTotal = defendD20 + defendMod;

  // Determine winner: attacker must beat (not tie) defender
  const attackerWins = attackTotal > defendTotal;

  // Post the public intimidation roll
  await ChatMessage.create({
    content: `<div class="tavern-intimidation-card">
      <div class="intimidation-header">
        <i class="fa-solid fa-comment-dots"></i>
        <span class="intimidation-title">${attackerName} glares at ${defenderName}...</span>
      </div>
      <div class="intimidation-rolls">
        <div class="intimidation-roll attacker">
          <span class="roll-label">${attackerName} (Intimidation)</span>
          <span class="roll-result">${attackD20} + ${attackMod} = <strong>${attackTotal}</strong></span>
        </div>
        <div class="intimidation-vs">VS</div>
        <div class="intimidation-roll defender">
          <span class="roll-label">${defenderName} (${defenderSkillName})</span>
          <span class="roll-result">${defendD20} + ${defendMod} = <strong>${defendTotal}</strong></span>
        </div>
      </div>
      <div class="intimidation-result ${attackerWins ? "success" : "failure"}">
        ${attackerWins 
          ? `<i class="fa-solid fa-face-fearful"></i> ${defenderName} backs down and holds!`
          : `<i class="fa-solid fa-face-meh"></i> ${defenderName} stands firm! ${attackerName} loses their nerve and holds.`
        }
      </div>
    </div>`,
    speaker: { alias: "Tavern Twenty-One" },
    rolls: [attackRoll, defendRoll],
  });

  // Apply results
  const updatedHolds = { ...tableData.holds };
  const updatedIntimidatedThisRound = { ...tableData.intimidatedThisRound, [userId]: true };
  const updatedIntimidationBackfire = { ...tableData.intimidationBackfire };

  if (attackerWins) {
    // Target is forced to hold
    updatedHolds[targetId] = true;
    await playSound("reveal");
  } else {
    // Attacker is forced to hold AND gets disadvantage on next cheat/accuse
    updatedHolds[userId] = true;
    updatedIntimidationBackfire[userId] = true;
    await playSound("lose");
  }

  // Update current player if needed (someone just held)
  let updatedCurrentPlayer = tableData.currentPlayer;
  const forcedHoldId = attackerWins ? targetId : userId;
  if (tableData.currentPlayer === forcedHoldId) {
    // The person whose turn it was just held, advance to next player
    const tempTableData = { ...tableData, holds: updatedHolds };
    updatedCurrentPlayer = getNextActivePlayer(state, tempTableData);
  }

  const updatedTableData = {
    ...tableData,
    holds: updatedHolds,
    intimidatedThisRound: updatedIntimidatedThisRound,
    intimidationBackfire: updatedIntimidationBackfire,
    currentPlayer: updatedCurrentPlayer,
  };

  await addHistoryEntry({
    type: "intimidation",
    attacker: attackerName,
    defender: defenderName,
    attackRoll: attackTotal,
    defendRoll: defendTotal,
    success: attackerWins,
    message: attackerWins
      ? `${attackerName} intimidated ${defenderName} into holding!`
      : `${attackerName} failed to intimidate ${defenderName} and held instead.`,
  });

  const next = await updateState({ tableData: updatedTableData });

  // Check if all players are now finished
  if (allPlayersFinished(state, updatedTableData)) {
    return revealDice();
  }

  return next;
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
