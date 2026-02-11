import { getState } from "./state.js";
import { getAllowedDice, VALID_DICE, GOBLIN_DICE } from "./twenty-one/constants.js";
import { isPlainObject } from "./twenty-one/utils/object.js";

function warn(list, message, detail) {
  list.push(detail ? `${message}: ${detail}` : message);
}

export function runDiagnostics({ verbose = false } = {}) {
  const warnings = [];
  const state = getState();

  if (!state || !isPlainObject(state)) {
    warn(warnings, "State missing or invalid");
    return warnings;
  }

  const tableData = state.tableData;
  if (!isPlainObject(tableData)) {
    warn(warnings, "tableData missing or invalid");
    return warnings;
  }

  const gameMode = tableData.gameMode ?? "standard";
  const allowedDice = new Set(getAllowedDice(gameMode));
  const fullDiceSet = new Set(gameMode === "goblin" ? GOBLIN_DICE : VALID_DICE);

  if (state.turnOrder?.length && tableData.currentPlayer && !state.turnOrder.includes(tableData.currentPlayer)) {
    warn(warnings, "currentPlayer not in turnOrder", tableData.currentPlayer);
  }

  const phase = tableData.phase ?? "opening";
  const validPhases = new Set(["opening", "betting", "cut"]);
  if (!validPhases.has(phase)) {
    warn(warnings, "Invalid phase", phase);
  }

  const rollsByPlayer = tableData.rolls ?? {};
  if (!isPlainObject(rollsByPlayer)) {
    warn(warnings, "rolls is not an object");
  } else {
    for (const [userId, rolls] of Object.entries(rollsByPlayer)) {
      if (!Array.isArray(rolls)) {
        warn(warnings, "rolls entry is not an array", userId);
        continue;
      }
      for (const [index, roll] of rolls.entries()) {
        if (!isPlainObject(roll)) {
          warn(warnings, "roll entry not an object", `${userId}#${index}`);
          continue;
        }
        const die = Number(roll.die);
        const result = Number(roll.result);
        if (!allowedDice.has(die)) {
          warn(warnings, "roll die not allowed for mode", `${userId} d${die}`);
        }
        if (Number.isNaN(result) || result < 1 || result > die) {
          warn(warnings, "roll result out of range", `${userId} d${die} => ${roll.result}`);
        }
      }
    }
  }

  if (gameMode === "goblin") {
    const usedDice = tableData.usedDice ?? {};
    if (isPlainObject(usedDice)) {
      for (const [userId, used] of Object.entries(usedDice)) {
        if (!Array.isArray(used)) {
          warn(warnings, "usedDice entry not array", userId);
          continue;
        }
        for (const die of used) {
          if (!fullDiceSet.has(die) || die === 2) {
            warn(warnings, "usedDice contains invalid die", `${userId} d${die}`);
          }
        }
      }
    }

    const progress = tableData.goblinSetProgress ?? {};
    if (isPlainObject(progress)) {
      for (const [userId, set] of Object.entries(progress)) {
        if (!Array.isArray(set)) {
          warn(warnings, "goblinSetProgress entry not array", userId);
          continue;
        }
        for (const die of set) {
          if (!fullDiceSet.has(die) || die === 2) {
            warn(warnings, "goblinSetProgress contains invalid die", `${userId} d${die}`);
          }
        }
      }
    }
  }

  if (tableData.sideBetRound !== null && tableData.sideBetRound !== undefined) {
    const round = Number(tableData.sideBetRound);
    if (Number.isNaN(round) || round < 1 || round > 2) {
      warn(warnings, "sideBetRound out of range", `${tableData.sideBetRound}`);
    }
  }

  if (phase === "cut") {
    if (!tableData.theCutPlayer || !state.turnOrder.includes(tableData.theCutPlayer)) {
      warn(warnings, "cut phase missing valid theCutPlayer");
    }
  }

  const retaliation = tableData.pendingBumpRetaliation;
  if (retaliation !== null && retaliation !== undefined) {
    if (!isPlainObject(retaliation)) {
      warn(warnings, "pendingBumpRetaliation is not an object");
    } else {
      if (!retaliation.attackerId || !state.turnOrder.includes(retaliation.attackerId)) {
        warn(warnings, "pendingBumpRetaliation attacker invalid", retaliation.attackerId);
      }
      if (!retaliation.targetId || !state.turnOrder.includes(retaliation.targetId)) {
        warn(warnings, "pendingBumpRetaliation target invalid", retaliation.targetId);
      }
    }
  }

  if (tableData.duel !== null && tableData.duel !== undefined) {
    const duel = tableData.duel;
    if (!isPlainObject(duel)) {
      warn(warnings, "duel is not an object");
    } else {
      const participants = Array.isArray(duel.participants) ? duel.participants : [];
      if (participants.length < 2) {
        warn(warnings, "duel participants too small", `${participants.length}`);
      }
      for (const duelUserId of participants) {
        if (!state.turnOrder.includes(duelUserId)) {
          warn(warnings, "duel participant not in turn order", duelUserId);
        }
      }
    }
  }

  if (gameMode === "goblin") {
    if (tableData.goblinSuddenDeathActive) {
      const participants = tableData.goblinSuddenDeathParticipants;
      if (!Array.isArray(participants) || participants.length === 0) {
        warn(warnings, "goblinSuddenDeathActive without participants");
      }
    }

    if (tableData.goblinFinalActive) {
      const finalTarget = tableData.goblinFinalTargetId;
      if (!finalTarget || !state.turnOrder.includes(finalTarget)) {
        warn(warnings, "goblinFinalActive without valid target");
      }
      const remaining = tableData.goblinFinalRemaining;
      if (!Array.isArray(remaining)) {
        warn(warnings, "goblinFinalRemaining is not an array");
      }
    }
  }

  if (verbose && warnings.length === 0) {
    console.log("Tavern Diagnostics | No issues detected.");
  }

  if (warnings.length > 0 && verbose) {
    console.warn("Tavern Diagnostics | Issues detected:", warnings);
  }

  return warnings;
}
