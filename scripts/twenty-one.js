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
    return startInspection();
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
    return startInspection();
  }

  return next;
}

/**
 * Start the inspection phase - called when all players finish playing
 * This is now the "Staredown" phase where players can make targeted accusations
 */
export async function startInspection() {
  const state = getState();

  // Calculate what accusation would cost
  const accusationCost = Math.floor(state.pot / 2);

  await createChatCard({
    title: "The Staredown",
    subtitle: "A hush falls over the table...",
    message: `All hands are in. The moment of truth approaches.<br><br>` +
      `<strong>Make an Accusation?</strong> (Costs <strong>${accusationCost}gp</strong> - half the pot)<br>` +
      `Point your finger at someone you suspect. If they cheated and you beat their Deception, they're caught!<br>` +
      `<em>But accuse an innocent... and you forfeit your winnings.</em>`,
    icon: "fa-solid fa-eye",
  });

  return updateState({ status: "INSPECTION" });
}

export async function revealResults() {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();

  // Mark as revealing
  await updateState({ status: "REVEALING" });
  await playSound("reveal");

  // Check for nat 1 cheaters who weren't caught by inspection - reveal them now
  const caught = { ...tableData.caught };
  const nat1CaughtNames = [];
  for (const [cheaterId, cheaterData] of Object.entries(tableData.cheaters)) {
    if (caught[cheaterId]) continue; // Already caught
    for (const cheatRecord of cheaterData.deceptionRolls) {
      if (cheatRecord.isNat1) {
        caught[cheaterId] = true;
        nat1CaughtNames.push(game.users.get(cheaterId)?.name ?? "Unknown");
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

  // Show all rolls publicly - launch all dice animations in parallel for speed
  const rollPromises = [];
  for (const userId of state.turnOrder) {
    const playerRolls = tableData.rolls[userId] ?? [];
    for (const rollData of playerRolls) {
      rollPromises.push((async () => {
        const roll = await new Roll(`1d${rollData.die}`).evaluate();
        // Override the result to show the actual value
        if (roll.terms?.[0]?.results?.[0]) {
          roll.terms[0].results[0].result = rollData.result;
          roll._total = rollData.result;
        }
        await showPublicRoll(roll, userId);
      })());
    }
  }
  
  // Wait for all dice to finish rolling
  await Promise.all(rollPromises);
  
  // Brief pause for dramatic effect after all dice shown
  await new Promise(r => setTimeout(r, 500));

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
  const potShare = winners.length ? Math.floor(state.pot / winners.length) : 0;

  if (winners.length) {
    await payOutWinners(winners, potShare);
    await playSound("win");
  } else {
    await playSound("lose");
  }

  const winnerNames = winners.map(id => game.users.get(id)?.name).join(", ");
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
    if (winners.includes(id)) suffix += " ★";
    return `${name}: ${total}${suffix}`;
  }).join(" | ");

  await addHistoryEntry({
    type: "round_end",
    winners: winnerNames || "None",
    winningTotal: best,
    payout: potShare,
    message: winners.length
      ? `${winnerNames} wins with ${best}! Payout: ${potShare}gp each.`
      : "Everyone busted, got caught, or made false accusations! House wins.",
    results: resultsMsg,
  });

  await createChatCard({
    title: "Results Revealed!",
    subtitle: winners.length ? `Winner${winners.length > 1 ? "s" : ""}: ${winnerNames}` : "House Wins!",
    message: `<div class="tavern-results">${resultsMsg}</div>${winners.length ? `<div class="tavern-payout">Payout: <strong>${potShare}gp</strong> each</div>` : ""}`,
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

  // Roll d20 regardless of actor
  const roll = await new Roll("1d20").evaluate();
  d20Result = roll.total;
  isNat1 = d20Result === 1;
  isNat20 = d20Result === 20;

  if (actor) {
    // Get the chosen skill modifier from D&D 5e actor
    skillMod = actor.system?.skills?.[skill]?.total ?? 0;
    skillRoll = d20Result + skillMod;

    // Whisper the skill roll to the player
    await roll.toMessage({
      speaker: { alias: skillName },
      flavor: `<em>${actor.name} attempts to cheat...</em><br>${skillName}: ${d20Result} + ${skillMod} = <strong>${skillRoll}</strong>${isNat20 ? " <span style='color: gold;'>(Untouchable!)</span>" : ""}${isNat1 ? " <span style='color: red;'>(Fumbled!)</span>" : ""}`,
      whisper: [userId],
    });
  } else {
    // No actor - flat d20 roll
    skillRoll = d20Result;
    
    await roll.toMessage({
      speaker: { alias: skillName },
      flavor: `<em>Attempting to cheat...</em><br>${skillName}: <strong>${skillRoll}</strong>${isNat20 ? " <span style='color: gold;'>(Untouchable!)</span>" : ""}${isNat1 ? " <span style='color: red;'>(Fumbled!)</span>" : ""}`,
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
  
  // Check if player can afford it (GM doesn't pay)
  const user = game.users.get(userId);
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

  // Roll the chosen skill
  let skillRoll = 10;
  let skillMod = 0;
  let d20Result = 10;

  // Roll d20 regardless of actor
  const roll = await new Roll("1d20").evaluate();
  d20Result = roll.total;

  if (accuserActor) {
    skillMod = accuserActor.system?.skills?.[skill]?.total ?? 0;
    skillRoll = d20Result + skillMod;

    // Show the skill roll publicly (not as GM whisper)
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: accuserActor }),
      flavor: `<em>${accuserName} stares down ${targetName}...</em><br>${skillName}`,
      content: `<div class="dice-roll"><div class="dice-result"><div class="dice-formula">1d20 + ${skillMod}</div><div class="dice-tooltip"><section class="tooltip-part"><div class="dice"><ol class="dice-rolls"><li class="roll die d20">${d20Result}</li></ol></div></section></div><h4 class="dice-total">${skillRoll}</h4></div></div>`,
      rolls: [roll],
    });
  } else {
    // No actor - flat d20 roll
    skillRoll = d20Result;
    
    await ChatMessage.create({
      speaker: { alias: game.users.get(userId)?.name ?? "Unknown" },
      flavor: `<em>Staring down ${targetName}...</em><br>${skillName}`,
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
 * Skip inspection and proceed to reveal
 */
export async function skipInspection() {
  const state = getState();
  if (state.status !== "INSPECTION") {
    return state;
  }
  return revealResults();
}
