import { MODULE_ID, getState, updateState, addHistoryEntry } from "./state.js";
import { canAffordAnte, deductAnteFromActors, deductFromActor, payOutWinners } from "./wallet.js";
import { createChatCard } from "./ui/chat.js";
import { showPublicRoll } from "./dice.js";
import { playSound } from "./sounds.js";
import { tavernSocket } from "./socket.js";

const VALID_DICE = [20, 12, 10, 8, 6, 4];
const OPENING_ROLLS_REQUIRED = 2;

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
    // Track who has already called for inspection this round
    inspected: {},
    // Track who was caught cheating (forfeits the round)
    caught: {},
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
 */
export async function startInspection() {
  const state = getState();
  const tableData = state.tableData ?? emptyTableData();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");

  // Check if anyone cheated this round
  const hasCheaters = Object.keys(tableData.cheaters).length > 0;

  await createChatCard({
    title: "Showdown",
    subtitle: hasCheaters ? "Something seems off..." : "Time to reveal!",
    message: hasCheaters
      ? `Before the reveal, anyone may <strong>call for inspection</strong> (costs ${ante}gp). Roll Perception to catch cheaters!<br><em>Or skip inspection to proceed to reveal.</em>`
      : "All hands are in. Preparing to reveal...",
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

  // Calculate winners - exclude caught cheaters!
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
    let suffix = "";
    if (wasCaught) suffix = " (CHEATER!)";
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
      : "Everyone busted or got caught! House wins.",
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
function getActorForCheat(userId) {
  const user = game.users.get(userId);
  if (!user) return null;
  const actorId = user.character?.id;
  if (!actorId) return null;
  return game.actors.get(actorId) ?? null;
}

/**
 * Cheat: Modify a die result. Rolls Deception to see if they get away with it.
 * - Nat 1: Instant caught (revealed at reveal phase)
 * - Nat 20: Cannot be caught by any inspection
 * - Otherwise: Deception score is stored for later comparison
 */
export async function cheat(payload, userId) {
  const state = getState();
  if (state.status !== "PLAYING") {
    ui.notifications.warn("Cannot cheat outside of an active round.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
  const { dieIndex, newValue } = payload;

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

  // Roll Deception check for the player
  const actor = getActorForCheat(userId);
  let deceptionRoll = 10; // Default if no actor
  let isNat1 = false;
  let isNat20 = false;
  let deceptionMod = 0;
  let d20Result = 10;

  if (actor) {
    // Get the deception skill modifier from D&D 5e actor
    deceptionMod = actor.system?.skills?.dec?.total ?? 0;
    const roll = await new Roll("1d20").evaluate();
    d20Result = roll.total;
    isNat1 = d20Result === 1;
    isNat20 = d20Result === 20;
    deceptionRoll = d20Result + deceptionMod;

    // Whisper the Deception roll to the player only
    await roll.toMessage({
      speaker: { alias: "Sleight of Hand" },
      flavor: `<em>${actor.name} attempts to cheat...</em><br>Deception: ${d20Result} + ${deceptionMod} = <strong>${deceptionRoll}</strong>${isNat20 ? " <span style='color: gold;'>(Untouchable!)</span>" : ""}${isNat1 ? " <span style='color: red;'>(Fumbled!)</span>" : ""}`,
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
  if (updatedTotals[userId] > 21) {
    updatedBusts[userId] = true;
  } else if (updatedTotals[userId] <= 21 && tableData.busts[userId]) {
    // Un-bust if they cheated down from a bust
    updatedBusts[userId] = false;
  }

  // Track this cheat
  const cheaters = { ...tableData.cheaters };
  if (!cheaters[userId]) {
    cheaters[userId] = { deceptionRolls: [] };
  }
  cheaters[userId].deceptionRolls.push({
    dieIndex,
    oldValue,
    newValue,
    deception: deceptionRoll,
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
  console.log(`Tavern Twenty-One | ${userName} cheated: d${targetDie.die} ${oldValue} → ${newValue}, Deception: ${deceptionRoll} (nat1: ${isNat1}, nat20: ${isNat20})`);

  return updateState({ tableData: updatedTable });
}

/**
 * Call for inspection: Pay ante, roll Perception, catch cheaters with lower Deception.
 */
export async function inspect(userId) {
  const state = getState();
  if (state.status !== "INSPECTION") {
    ui.notifications.warn("Inspection can only be called at showdown.");
    return state;
  }

  const tableData = state.tableData ?? emptyTableData();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");

  // Check if already inspected
  if (tableData.inspected[userId]) {
    ui.notifications.warn("You've already called for inspection this round.");
    return state;
  }

  // Deduct gold for inspection
  const canAfford = await deductFromActor(userId, ante);
  if (!canAfford) {
    ui.notifications.warn(`You need ${ante}gp to call for inspection.`);
    return state;
  }

  await playSound("coins");

  // Roll Perception
  const actor = getActorForCheat(userId);
  let perceptionRoll = 10;
  let perceptionMod = 0;
  let d20Result = 10;

  if (actor) {
    perceptionMod = actor.system?.skills?.prc?.total ?? 0;
    const roll = await new Roll("1d20").evaluate();
    d20Result = roll.total;
    perceptionRoll = d20Result + perceptionMod;

    // Show the Perception roll publicly
    await roll.toMessage({
      speaker: { alias: actor.name },
      flavor: `<em>${actor.name} scrutinizes the table...</em><br>Perception: ${d20Result} + ${perceptionMod} = <strong>${perceptionRoll}</strong>`,
    });
  }

  // Check against all cheaters
  const caught = { ...tableData.caught };
  const newlyCaughtNames = [];

  for (const [cheaterId, cheaterData] of Object.entries(tableData.cheaters)) {
    if (caught[cheaterId]) continue; // Already caught (previous inspection)

    // Check each deception roll - catch if ANY of their cheats are detected
    for (const cheatRecord of cheaterData.deceptionRolls) {
      // Nat 20 cannot be caught
      if (cheatRecord.isNat20) continue;
      // Nat 1 will be caught at reveal regardless
      if (cheatRecord.isNat1) continue;

      // If perception beats deception, caught!
      if (perceptionRoll > cheatRecord.deception) {
        caught[cheaterId] = true;
        const cheaterName = game.users.get(cheaterId)?.name ?? "Unknown";
        newlyCaughtNames.push(cheaterName);
        break; // Once caught, no need to check other cheats
      }
    }
  }

  // Mark this user as having inspected
  const inspected = { ...tableData.inspected, [userId]: true };

  const inspectorName = game.users.get(userId)?.name ?? "Unknown";

  await addHistoryEntry({
    type: "inspection",
    inspector: inspectorName,
    perception: perceptionRoll,
    message: `${inspectorName} called for inspection (Perception: ${perceptionRoll}).`,
  });

  if (newlyCaughtNames.length > 0) {
    await playSound("reveal");
    await createChatCard({
      title: "Cheater Caught!",
      subtitle: `${inspectorName} spotted something!`,
      message: `<strong>${newlyCaughtNames.join(", ")}</strong> ${newlyCaughtNames.length > 1 ? "were" : "was"} caught cheating and will forfeit the round!`,
      icon: "fa-solid fa-gavel",
    });

    await addHistoryEntry({
      type: "cheat_caught",
      inspector: inspectorName,
      caught: newlyCaughtNames.join(", "),
      message: `${inspectorName} caught ${newlyCaughtNames.join(", ")} cheating!`,
    });
  } else {
    await createChatCard({
      title: "Nothing Found",
      subtitle: `${inspectorName} found nothing suspicious.`,
      message: "The inspection revealed no foul play... or did it?",
      icon: "fa-solid fa-magnifying-glass",
    });
  }

  return updateState({
    tableData: { ...tableData, caught, inspected },
  });
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
