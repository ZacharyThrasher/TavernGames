import { HUNCH_THRESHOLDS } from "../constants.js";

export function resolveContest({ attackerTotal, defenderTotal, isNat1 = false }) {
  const success = !isNat1 && attackerTotal > defenderTotal;
  return {
    success,
    outcome: success ? "success" : "failure"
  };
}

export function rerollDieAtIndex(rolls, dieIndex, newValue) {
  if (!Array.isArray(rolls)) {
    throw new TypeError("rolls must be an array");
  }
  if (!Number.isInteger(dieIndex) || dieIndex < 0 || dieIndex >= rolls.length) {
    throw new RangeError("dieIndex is out of bounds");
  }

  const targetDie = rolls[dieIndex];
  const oldValue = Number(targetDie?.result ?? 0);
  const dieSides = Number(targetDie?.die ?? 0);
  const clampedValue = Math.max(1, Math.min(dieSides || 1, Number(newValue)));

  const nextRolls = [...rolls];
  nextRolls[dieIndex] = {
    ...targetDie,
    result: clampedValue
  };

  return {
    rolls: nextRolls,
    oldValue,
    newValue: clampedValue,
    dieSides,
    wasPublic: targetDie?.public ?? true,
    wasBlind: targetDie?.blind ?? false
  };
}

export function calculateStandardTotal(rolls) {
  if (!Array.isArray(rolls)) return 0;
  return rolls.reduce((sum, roll) => sum + Number(roll?.result ?? 0), 0);
}

export function calculateVisibleTotal(rolls) {
  if (!Array.isArray(rolls)) return 0;
  return rolls.reduce((sum, roll) => {
    const isPublic = roll?.public ?? true;
    const isBlind = roll?.blind ?? false;
    return isPublic && !isBlind ? sum + Number(roll?.result ?? 0) : sum;
  }, 0);
}

export function applyStandardRerollToTable(tableData, playerId, dieIndex, newValue, bustLimit = 21) {
  const playerRolls = tableData?.rolls?.[playerId] ?? [];
  const reroll = rerollDieAtIndex(playerRolls, dieIndex, newValue);
  const total = calculateStandardTotal(reroll.rolls);
  const visibleTotal = calculateVisibleTotal(reroll.rolls);
  const busted = total > bustLimit;

  return {
    rolls: { ...(tableData?.rolls ?? {}), [playerId]: reroll.rolls },
    totals: { ...(tableData?.totals ?? {}), [playerId]: total },
    visibleTotals: { ...(tableData?.visibleTotals ?? {}), [playerId]: visibleTotal },
    busted,
    oldValue: reroll.oldValue,
    newValue: reroll.newValue,
    dieSides: reroll.dieSides,
    wasPublic: reroll.wasPublic
  };
}

export function classifyHunchPrediction(die, value, thresholds = HUNCH_THRESHOLDS) {
  const threshold = Number(thresholds?.[die] ?? Math.floor(Number(die) / 2));
  return Number(value) > threshold ? "HIGH" : "LOW";
}
