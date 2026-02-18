/**
 * Tavern Twenty-One — AI Player Strategies
 * 
 * Each strategy is a function that receives game info and returns an action.
 * AI agents can modify these strategies, create new ones, and pit them against
 * each other to discover optimal play and evaluate game balance.
 * 
 * Strategy function signature:
 *   (gameInfo, engine) => { action: string, ...params }
 * 
 * Available actions (returned as objects):
 *   { action: "roll", die: 4|6|8|10|20 }
 *   { action: "hold" }
 *   { action: "fold" }
 *   { action: "cheat", dieIndex, adjustment }
 *   { action: "goad", targetId, skill }
 *   { action: "bump", targetId, dieIndex }
 *   { action: "hunch" }
 *   { action: "profile", targetId }
 *   { action: "drink" }
 *   { action: "cut_reroll" }
 *   { action: "cut_pass" }
 *   { action: "accuse", targetId, dieIndex }
 *   { action: "skip_inspection" }
 *   { action: "side_bet", championId, amount }
 *   { action: "roll_goblin" }  (for goblin mode — die is automatic)
 */

import { getDieCost, VALID_DICE } from "./headless-engine.mjs";

// ─── Utility Helpers ───────────────────────────────────────────────
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedChoice(options) {
  // options = [{ value, weight }, ...]
  const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);
  let r = Math.random() * totalWeight;
  for (const opt of options) {
    r -= opt.weight;
    if (r <= 0) return opt.value;
  }
  return options[options.length - 1].value;
}

function bestDieForTarget(currentTotal, targetTotal = 21) {
  const gap = targetTotal - currentTotal;
  if (gap <= 0) return null; // should hold or is busted

  // d20 is free and gives instant 21 on nat 20, but risky
  // d4 (1-4) costs 2x ante but is safest for small gaps
  // d6/d8 (1-6, 1-8) cost 1x ante, moderate
  // d10 (1-10) costs 0.5x ante, moderate-high variance
  // d20 (1-20) is free but extremely high variance

  if (gap <= 4) return 4;
  if (gap <= 6) return 6;
  if (gap <= 8) return 8;
  if (gap <= 10) return 10;
  return 20; // big gap, go for d20
}

function bustRisk(currentTotal, die, bustLimit = 21) {
  // Probability of going over the current bust limit
  const gap = bustLimit - currentTotal;
  if (gap <= 0) return 1;
  const overValues = Math.max(0, die - gap);
  return overValues / die;
}

function getOpponentArray(info) {
  return Object.entries(info.opponents).map(([id, data]) => ({ id, ...data }));
}

function getLiveOpponents(info) {
  return getOpponentArray(info).filter(o => !o.isBusted && !o.isFolded);
}

function getHighestVisibleOpponent(info) {
  const live = getLiveOpponents(info);
  if (live.length === 0) return null;
  return live.reduce((best, o) => o.visibleTotal > best.visibleTotal ? o : best, live[0]);
}

function isGoblinTurn(info) {
  // Goblin action surface has no fold/skills; standard always exposes fold.
  return info.availableActions.includes("roll") && !info.availableActions.includes("fold");
}

function shouldTakeDrink(info) {
  if (!info.availableActions.includes("drink")) return false;
  if (info.isSloppy) return false;
  if ((info.liquidCourage ?? 0) > 0) return false;
  if ((info.drinkCount ?? 0) >= 2) return false;
  const bustLimit = info.bustLimit ?? 21;
  if (info.myTotal < 13 || info.myTotal >= bustLimit) return false;
  const die = bestDieForTarget(info.myTotal, bustLimit) ?? 6;
  const risk = bustRisk(info.myTotal, die, bustLimit);
  return risk >= 0.6;
}

// ════════════════════════════════════════════════════════════════════
//  STRATEGY: Conservative ("The Careful Gambler")
//  - Plays it safe, holds at 17+, avoids risky dice
//  - Rarely uses skills, never cheats
// ════════════════════════════════════════════════════════════════════
export function conservativeStrategy(info, engine) {
  const { myTotal, myVisible, availableActions } = info;
  const bustLimit = info.bustLimit ?? 21;
  const highestOpp = getHighestVisibleOpponent(info);

  // Cut phase
  if (availableActions.includes("cut_reroll")) {
    // Reroll if hole die is low
    const holeRoll = info.myRolls?.[1];
    if (holeRoll && holeRoll.result <= 4) return { action: "cut_reroll" };
    return { action: "cut_pass" };
  }

  // Inspection phase
  if (availableActions.includes("skip_inspection")) {
    return { action: "skip_inspection" };
  }

  // Forced roll
  if (availableActions.includes("roll_d20_forced")) {
    return { action: "roll", die: 20 };
  }
  if (availableActions.includes("roll_forced")) {
    const die = bestDieForTarget(myTotal, bustLimit) ?? 4;
    return { action: "roll", die };
  }

  // Goblin mode
  if (isGoblinTurn(info)) {
    if (availableActions.includes("hold")) {
      const highestOpp = getHighestVisibleOpponent(info);
      const aheadOrTied = !highestOpp || myTotal >= highestOpp.visibleTotal;
      if (myTotal >= 18 && aheadOrTied) return { action: "hold" };
      if (myTotal >= 21) return { action: "hold" };
    }
    return { action: "roll_goblin" };
  }

  if (shouldTakeDrink(info) && Math.random() < 0.25) return { action: "drink" };

  if (availableActions.includes("hunch") && info.myRolls.length === 2 && myTotal <= bustLimit - 6 && Math.random() < 0.45) {
    return { action: "hunch" };
  }

  if (availableActions.includes("profile") && highestOpp && highestOpp.visibleTotal >= bustLimit - 5 && Math.random() < 0.2) {
    return { action: "profile", targetId: highestOpp.id };
  }

  if (
    availableActions.includes("goad") &&
    highestOpp &&
    highestOpp.isHolding &&
    highestOpp.visibleTotal > myVisible + 1 &&
    Math.random() < 0.15
  ) {
    return { action: "goad", targetId: highestOpp.id, skill: "persuasion" };
  }

  // Standard mode
  if (myTotal >= bustLimit - 2) return { action: "hold" };
  if (myTotal >= bustLimit - 3 && (!highestOpp || myTotal >= highestOpp.visibleTotal)) return { action: "hold" };

  // Pick mostly safe die, but do not auto-lock into tiny dice when behind.
  const die = bestDieForTarget(myTotal, bustLimit) ?? (myTotal < 12 ? 8 : 6);
  const risk = bustRisk(myTotal, die, bustLimit);
  if (risk > 0.65) return { action: "hold" };
  if (risk > 0.5 && myTotal >= bustLimit - 4 && (!highestOpp || myTotal >= highestOpp.visibleTotal)) {
    return { action: "hold" };
  }

  return { action: "roll", die };
}

// ════════════════════════════════════════════════════════════════════
//  STRATEGY: Aggressive ("The Risk Taker")
//  - Pushes to 20+, loves d20 for the nat 20 chance
//  - Uses goad to force opponents to bust
//  - Cheats frequently
// ════════════════════════════════════════════════════════════════════
export function aggressiveStrategy(info, engine) {
  const { myTotal, availableActions, phase, pot, myGold } = info;
  const bustLimit = info.bustLimit ?? 21;

  // Cut phase
  if (availableActions.includes("cut_reroll")) return { action: "cut_reroll" };

  // Inspection - accuse if we profiled a cheater
  if (availableActions.includes("accuse") && info.profileResults?.length > 0) {
    const cheater = info.profileResults.find(r => r.cheated);
    if (cheater) return { action: "accuse", targetId: cheater.targetId, dieIndex: -1 };
  }
  if (availableActions.includes("skip_inspection")) return { action: "skip_inspection" };

  // Forced roll
  if (availableActions.includes("roll_d20_forced")) return { action: "roll", die: 20 };
  if (availableActions.includes("roll_forced")) return { action: "roll", die: 10 };

  // Goblin mode
  if (isGoblinTurn(info)) {
    if (availableActions.includes("hold")) {
      const highestOpp = getHighestVisibleOpponent(info);
      if (myTotal >= 24) return { action: "hold" };
      if (highestOpp && myTotal >= highestOpp.visibleTotal + 1 && myTotal >= 20 && Math.random() < 0.55) {
        return { action: "hold" };
      }
    }
    return { action: "roll_goblin" };
  }

  if (shouldTakeDrink(info) && Math.random() < 0.35) {
    return { action: "drink" };
  }

  // Goad opponents who are holding
  if (availableActions.includes("goad") && Math.random() < 0.4) {
    const holdingOpps = getLiveOpponents(info).filter(o => o.isHolding);
    if (holdingOpps.length > 0) {
      const target = pickRandom(holdingOpps);
      return { action: "goad", targetId: target.id, skill: "intimidation" };
    }
  }

  // Cheat if heat is low and we have room
  if (availableActions.includes("cheat") && info.heat <= 12 && info.myRolls.length > 0 && Math.random() < 0.5) {
    const gap = bustLimit - myTotal;
    if (gap > 0 && gap <= 3) {
      // Try to bump a die up to hit 21
      const lastDieIdx = info.myRolls.length - 1;
      return { action: "cheat", dieIndex: lastDieIdx, adjustment: Math.min(gap, 3) };
    }
  }

  // Push for high totals
  if (myTotal >= bustLimit) return { action: "hold" };
  if (myTotal === bustLimit) return { action: "hold" };

  // Love the d20 for nat 20 plays
  if (myTotal <= 10 && Math.random() < 0.3) return { action: "roll", die: 20 };

  const die = bestDieForTarget(myTotal, bustLimit) ?? 8;
  const risk = bustRisk(myTotal, die, bustLimit);
  if (risk > 0.7 && myTotal >= bustLimit - 4) return { action: "hold" };

  return { action: "roll", die };
}

// ════════════════════════════════════════════════════════════════════
//  STRATEGY: Balanced ("The Strategist")
//  - Adapts based on opponent states
//  - Uses hunch for information advantage
//  - Calculated cheat/goad use
// ════════════════════════════════════════════════════════════════════
export function balancedStrategy(info, engine) {
  const { myTotal, myVisible, availableActions, phase, pot, opponents } = info;
  const bustLimit = info.bustLimit ?? 21;
  const live = getLiveOpponents(info);
  const highestOpp = getHighestVisibleOpponent(info);

  // Cut phase — reroll if hole die is mediocre
  if (availableActions.includes("cut_reroll")) {
    const holeRoll = info.myRolls?.[1];
    if (holeRoll && holeRoll.result <= 5) return { action: "cut_reroll" };
    return { action: "cut_pass" };
  }

  // Inspection
  if (availableActions.includes("accuse") && info.profileResults?.length > 0) {
    const cheater = info.profileResults.find(r => r.cheated);
    if (cheater) return { action: "accuse", targetId: cheater.targetId, dieIndex: -1 };
  }
  if (availableActions.includes("skip_inspection")) return { action: "skip_inspection" };

  // Forced roll
  if (availableActions.includes("roll_d20_forced")) return { action: "roll", die: 20 };
  if (availableActions.includes("roll_forced")) {
    return { action: "roll", die: bestDieForTarget(myTotal, bustLimit) ?? 6 };
  }

  // Goblin mode
  if (isGoblinTurn(info)) {
    if (availableActions.includes("hold") && myTotal >= 20) return { action: "hold" };
    return { action: "roll_goblin" };
  }

  if (shouldTakeDrink(info) && Math.random() < 0.3) {
    return { action: "drink" };
  }

  // Use Hunch early for info advantage
  if (availableActions.includes("hunch") && info.myRolls.length === 2 && Math.random() < 0.6) {
    return { action: "hunch" };
  }

  // Use hunch predictions if available
  if (info.hunchPredictions && availableActions.includes("roll")) {
    const gap = bustLimit - myTotal;
    // Find best die based on predictions
    for (const die of [4, 6, 8, 10, 20]) {
      const pred = info.hunchPredictions[die];
      if (info.hunchExact) {
        const exact = info.hunchExact[die];
        if (exact + myTotal <= bustLimit && exact + myTotal >= bustLimit - 3) {
          return { action: "roll", die };
        }
      } else if (pred === "LOW" && gap <= die / 2) {
        return { action: "roll", die };
      }
    }
  }

  // Profile an opponent who might be cheating (high visible total)
  if (availableActions.includes("profile") && live.length > 0) {
    const suspicious = live.filter(o => o.visibleTotal >= 15);
    if (suspicious.length > 0 && Math.random() < 0.3) {
      return { action: "profile", targetId: pickRandom(suspicious).id };
    }
  }

  // Goad a holding opponent if we're behind
  if (availableActions.includes("goad") && highestOpp && highestOpp.isHolding) {
    if (highestOpp.visibleTotal > myVisible && Math.random() < 0.35) {
      return { action: "goad", targetId: highestOpp.id, skill: "persuasion" };
    }
  }

  // Calculated cheat use
  if (availableActions.includes("cheat") && info.heat <= 14) {
    const gap = bustLimit - myTotal;
    if (gap > 0 && gap <= 2 && Math.random() < 0.4) {
      // Try small adjustments
      const bestDie = info.myRolls.length - 1;
      return { action: "cheat", dieIndex: bestDie, adjustment: gap };
    }
  }

  // Hold decisions based on opponent visible totals
  if (myTotal >= bustLimit) return { action: "hold" };
  if (myTotal >= 17 && highestOpp && highestOpp.visibleTotal <= myVisible) {
    return { action: "hold" }; // we're winning visibly
  }
  if (myTotal >= bustLimit - 3 && live.every(o => o.isHolding || o.isBusted)) {
    return { action: "hold" }; // everyone else is done
  }

  // Roll selection
  const die = bestDieForTarget(myTotal, bustLimit) ?? 6;
  const risk = bustRisk(myTotal, die, bustLimit);
  if (risk > 0.45 && myTotal >= bustLimit - 5) return { action: "hold" };

  return { action: "roll", die };
}

// ════════════════════════════════════════════════════════════════════
//  STRATEGY: Chaotic ("The Wildcard")
//  - Random decisions, loves big dice
//  - Goads and bumps frequently
//  - Great for testing edge cases
// ════════════════════════════════════════════════════════════════════
export function chaoticStrategy(info, engine) {
  const { myTotal, availableActions } = info;
  const bustLimit = info.bustLimit ?? 21;

  if (availableActions.includes("cut_reroll")) {
    return Math.random() < 0.5 ? { action: "cut_reroll" } : { action: "cut_pass" };
  }
  if (availableActions.includes("skip_inspection")) {
    // Randomly accuse people
    if (availableActions.includes("accuse") && Math.random() < 0.3) {
      const live = getLiveOpponents(info);
      if (live.length > 0) {
        return { action: "accuse", targetId: pickRandom(live).id, dieIndex: -1 };
      }
    }
    return { action: "skip_inspection" };
  }

  if (availableActions.includes("roll_d20_forced")) return { action: "roll", die: 20 };
  if (availableActions.includes("roll_forced")) return { action: "roll", die: pickRandom(VALID_DICE) };

  // Goblin mode
  if (isGoblinTurn(info)) {
    if (availableActions.includes("hold")) {
      if (myTotal >= 23 && Math.random() < 0.15) return { action: "hold" };
      if (myTotal >= 18 && Math.random() < 0.03) return { action: "hold" };
      if (Math.random() < 0.01) return { action: "hold" };
    }
    return { action: "roll_goblin" };
  }

  // Random skill use
  const skillActions = availableActions.filter(a =>
    ["goad", "bump", "cheat", "hunch", "profile", "drink"].includes(a)
  );
  if (skillActions.length > 0 && Math.random() < 0.4) {
    const skill = pickRandom(skillActions);
    const live = getLiveOpponents(info);
    switch (skill) {
      case "goad": return live.length > 0
        ? { action: "goad", targetId: pickRandom(live).id, skill: pickRandom(["intimidation", "persuasion"]) }
        : { action: "roll", die: pickRandom(VALID_DICE) };
      case "bump": {
        const bumpable = live.filter(o => o.rollCount > 0);
        return bumpable.length > 0
          ? { action: "bump", targetId: pickRandom(bumpable).id, dieIndex: 0 }
          : { action: "roll", die: pickRandom(VALID_DICE) };
      }
      case "cheat":
        if (info.myRolls.length > 0) {
          const adj = pickRandom([-3, -2, -1, 1, 2, 3]);
          return { action: "cheat", dieIndex: Math.floor(Math.random() * info.myRolls.length), adjustment: adj };
        }
        break;
      case "hunch": return { action: "hunch" };
      case "drink": return { action: "drink" };
      case "profile":
        return live.length > 0
          ? { action: "profile", targetId: pickRandom(live).id }
          : { action: "roll", die: pickRandom(VALID_DICE) };
    }
  }

  if (availableActions.includes("drink") && Math.random() < 0.15) {
    return { action: "drink" };
  }

  // Random fold
  if (Math.random() < 0.05 && availableActions.includes("fold")) return { action: "fold" };

  // Roll or hold randomly, biased toward rolling
  if (myTotal >= bustLimit) return { action: "hold" };
  if (myTotal >= 19 && Math.random() < 0.4) return { action: "hold" };
  if (myTotal >= 15 && Math.random() < 0.15) return { action: "hold" };

  return { action: "roll", die: pickRandom(VALID_DICE) };
}

// ════════════════════════════════════════════════════════════════════
//  STRATEGY: Card Counter ("The Mathematician")
//  - Optimal EV-based decisions
//  - Always calculates bust probability
//  - Uses cheat surgically at key moments
//  - Uses profile to inform accusations
// ════════════════════════════════════════════════════════════════════
export function cardCounterStrategy(info, engine) {
  const { myTotal, myVisible, availableActions, pot, myGold } = info;
  const bustLimit = info.bustLimit ?? 21;
  const live = getLiveOpponents(info);
  const highestOpp = getHighestVisibleOpponent(info);

  // Cut phase
  if (availableActions.includes("cut_reroll")) {
    const holeRoll = info.myRolls?.[1];
    // Reroll if expected value is higher (hole < 5.5 average of d10)
    if (holeRoll && holeRoll.result <= 5) return { action: "cut_reroll" };
    return { action: "cut_pass" };
  }

  // Inspection — only accuse with evidence
  if (availableActions.includes("accuse")) {
    const cheater = info.profileResults?.find(r => r.cheated);
    if (cheater) return { action: "accuse", targetId: cheater.targetId, dieIndex: -1 };
  }
  if (availableActions.includes("skip_inspection")) return { action: "skip_inspection" };

  // Forced rolls
  if (availableActions.includes("roll_d20_forced")) return { action: "roll", die: 20 };
  if (availableActions.includes("roll_forced")) return { action: "roll", die: bestDieForTarget(myTotal, bustLimit) ?? 4 };

  // Goblin
  if (isGoblinTurn(info)) {
    if (availableActions.includes("hold")) {
      const bestOppVisible = live.reduce((best, o) => Math.max(best, o.visibleTotal), 0);
      const lead = myTotal - bestOppVisible;
      if (myTotal >= 31) return { action: "hold" };
      if (lead >= 8 && myTotal >= 26) return { action: "hold" };
      if (lead >= 6 && myTotal >= 27 && Math.random() < 0.4) return { action: "hold" };
    }
    return { action: "roll_goblin" };
  }

  if (shouldTakeDrink(info) && Math.random() < 0.2) {
    return { action: "drink" };
  }

  // Use hunch early to get perfect info
  if (availableActions.includes("hunch") && info.myRolls.length <= 3 && myTotal < 16) {
    return { action: "hunch" };
  }

  // With hunch exact values, make perfect decisions
  if (info.hunchExact && availableActions.includes("roll")) {
    for (const [dieStr, value] of Object.entries(info.hunchExact)) {
      const die = Number(dieStr);
      if (myTotal + value === bustLimit) return { action: "roll", die }; // perfect ceiling
      if (myTotal + value <= bustLimit && myTotal + value >= bustLimit - 2) return { action: "roll", die };
    }
  }

  // Use profile on high-scoring opponents
  if (availableActions.includes("profile")) {
    const threats = live.filter(o => o.visibleTotal >= 14 && o.isHolding);
    if (threats.length > 0) {
      return { action: "profile", targetId: threats[0].id };
    }
  }

  // Surgical cheat: only when it gets us to exactly 20 or 21
  if (availableActions.includes("cheat") && info.heat <= 12) {
    for (let i = info.myRolls.length - 1; i >= 0; i--) {
      const roll = info.myRolls[i];
      for (const adj of [1, 2, 3, -1, -2, -3]) {
        const newVal = Math.max(1, Math.min(roll.die, roll.result + adj));
        const newTotal = myTotal - roll.result + newVal;
        if (newTotal === bustLimit || newTotal === bustLimit - 1) {
          return { action: "cheat", dieIndex: i, adjustment: adj };
        }
      }
    }
  }

  // EV-optimal die selection
  const gap = bustLimit - myTotal;
  if (gap <= 0) return { action: "hold" };

  // Calculate EV for each die
  let bestDie = 4, bestEV = -Infinity;
  const ante = engine?.ante ?? 5;
  for (const die of VALID_DICE) {
    const eventDelta = Number(info.roundEvent?.dieCostDelta?.[die] ?? 0);
    const cost = Math.max(0, getDieCost(die, ante) + eventDelta);
    if (cost > info.myGold) continue;

    let ev = 0;
    for (let val = 1; val <= die; val++) {
      let effective = val;
      if (die === 20 && val === 20) effective = gap; // nat 20 = instant bust-limit
      const newTotal = myTotal + effective;
      if (newTotal > bustLimit) {
        ev -= (pot * 0.8) / die; // bust penalty
      } else if (newTotal === bustLimit) {
        ev += (pot * 1.0) / die; // jackpot value
      } else {
        ev += (newTotal / bustLimit * pot * 0.5) / die; // proportional value
      }
    }
    ev -= cost; // subtract die cost

    if (ev > bestEV) {
      bestEV = ev;
      bestDie = die;
    }
  }

  // Should we hold instead?
  const holdEV = (myTotal / bustLimit) * pot * 0.4; // rough hold value
  if (holdEV > bestEV && myTotal >= 19) return { action: "hold" };

  // Goad if opponent is holding with higher visible
  if (availableActions.includes("goad") && highestOpp && highestOpp.isHolding) {
    if (highestOpp.visibleTotal > myVisible + 3) {
      return { action: "goad", targetId: highestOpp.id, skill: "intimidation" };
    }
  }

  return { action: "roll", die: bestDie };
}

// ════════════════════════════════════════════════════════════════════
//  STRATEGY: Bully ("The Skill Abuser")
//  - Maximizes skill usage every turn
//  - Goads, bumps, profiles aggressively
//  - Tests whether skills are overpowered
// ════════════════════════════════════════════════════════════════════
export function bullyStrategy(info, engine) {
  const { myTotal, availableActions } = info;
  const bustLimit = info.bustLimit ?? 21;
  const live = getLiveOpponents(info);
  const highestOpp = getHighestVisibleOpponent(info);

  if (availableActions.includes("cut_reroll")) return { action: "cut_reroll" };
  if (availableActions.includes("skip_inspection")) {
    if (availableActions.includes("accuse") && info.profileResults?.length > 0) {
      const c = info.profileResults.find(r => r.cheated);
      if (c) return { action: "accuse", targetId: c.targetId, dieIndex: -1 };
    }
    return { action: "skip_inspection" };
  }
  if (availableActions.includes("roll_d20_forced")) return { action: "roll", die: 20 };
  if (availableActions.includes("roll_forced")) return { action: "roll", die: bestDieForTarget(myTotal, bustLimit) ?? 6 };

  // Goblin
  if (isGoblinTurn(info)) {
    if (availableActions.includes("hold") && myTotal >= 27) return { action: "hold" };
    return { action: "roll_goblin" };
  }

  if (shouldTakeDrink(info) && Math.random() < 0.4) {
    return { action: "drink" };
  }

  // Always use skills if available
  if (availableActions.includes("bump") && live.length > 0 && Math.random() < 0.5) {
    const target = live.filter(o => o.rollCount > 0 && !o.isHolding);
    if (target.length > 0) {
      return { action: "bump", targetId: pickRandom(target).id, dieIndex: 0 };
    }
  }

  if (availableActions.includes("goad") && live.length > 0 && Math.random() < 0.55) {
    const holdingOpps = live.filter(o => o.isHolding);
    const target = holdingOpps.length > 0 ? pickRandom(holdingOpps) : pickRandom(live);
    return { action: "goad", targetId: target.id, skill: "intimidation" };
  }

  if (availableActions.includes("profile") && live.length > 0 && Math.random() < 0.35) {
    return { action: "profile", targetId: pickRandom(live).id };
  }

  if (availableActions.includes("hunch") && myTotal <= bustLimit - 4 && Math.random() < 0.6) {
    return { action: "hunch" };
  }

  if (availableActions.includes("cheat") && info.myRolls.length > 0 && info.heat <= 11 && Math.random() < 0.35) {
    const gap = bustLimit - myTotal;
    if (gap > 0 && gap <= 3) {
      return { action: "cheat", dieIndex: info.myRolls.length - 1, adjustment: gap };
    }
  }

  // Standard play
  if (myTotal >= bustLimit) return { action: "hold" };
  if (myTotal >= bustLimit - 1 && highestOpp && myTotal >= highestOpp.visibleTotal + 1 && Math.random() < 0.6) {
    return { action: "hold" };
  }

  if (myTotal <= 10 && Math.random() < 0.2) return { action: "roll", die: 20 };
  const die = bestDieForTarget(myTotal, bustLimit) ?? 8;
  return { action: "roll", die };
}

// ════════════════════════════════════════════════════════════════════
//  STRATEGY: Swashbuckler ("The Tavern Duelist")
//  - Leans into drinks + social pressure
//  - Uses goad/bump to create chaos around the lead
//  - Plays for dramatic finishes near bust limit
// ════════════════════════════════════════════════════════════════════
export function swashbucklerStrategy(info, engine) {
  const { myTotal, myVisible, availableActions } = info;
  const bustLimit = info.bustLimit ?? 21;
  const live = getLiveOpponents(info);
  const highestOpp = getHighestVisibleOpponent(info);

  if (availableActions.includes("cut_reroll")) {
    const hole = info.myRolls?.[1]?.result ?? 0;
    return hole <= 6 ? { action: "cut_reroll" } : { action: "cut_pass" };
  }

  if (availableActions.includes("accuse")) {
    const cheater = info.profileResults?.find(r => r.cheated);
    if (cheater) return { action: "accuse", targetId: cheater.targetId, dieIndex: -1 };
  }
  if (availableActions.includes("skip_inspection")) return { action: "skip_inspection" };

  if (availableActions.includes("roll_d20_forced")) return { action: "roll", die: 20 };
  if (availableActions.includes("roll_forced")) return { action: "roll", die: bestDieForTarget(myTotal, bustLimit) ?? 8 };

  if (isGoblinTurn(info)) {
    if (availableActions.includes("hold") && myTotal >= 24) return { action: "hold" };
    return { action: "roll_goblin" };
  }

  if (shouldTakeDrink(info) && (info.liquidCourage ?? 0) === 0 && Math.random() < 0.35) {
    return { action: "drink" };
  }

  if (availableActions.includes("goad")) {
    const holdingThreat = live.find(o => o.isHolding && o.visibleTotal >= myVisible);
    if (holdingThreat && Math.random() < 0.45) {
      return { action: "goad", targetId: holdingThreat.id, skill: "persuasion" };
    }
  }

  if (availableActions.includes("bump")) {
    const bumpTargets = live.filter(o => o.rollCount > 0 && o.visibleTotal >= myVisible);
    if (bumpTargets.length > 0 && Math.random() < 0.35) {
      return { action: "bump", targetId: bumpTargets[0].id, dieIndex: 0 };
    }
  }

  if (availableActions.includes("hunch") && myTotal < bustLimit - 4) {
    return { action: "hunch" };
  }

  if (availableActions.includes("profile") && highestOpp && highestOpp.visibleTotal >= bustLimit - 5) {
    return { action: "profile", targetId: highestOpp.id };
  }

  if (availableActions.includes("cheat") && info.myRolls.length > 0 && info.heat <= 13 && (info.liquidCourage ?? 0) > 0) {
    const gap = bustLimit - myTotal;
    if (gap > 0 && gap <= 3) {
      return { action: "cheat", dieIndex: info.myRolls.length - 1, adjustment: gap };
    }
  }

  if (myTotal >= bustLimit - 2) return { action: "hold" };
  if (myTotal >= bustLimit - 4 && highestOpp && highestOpp.visibleTotal < myVisible) return { action: "hold" };

  const die = bestDieForTarget(myTotal, bustLimit) ?? 8;
  const risk = bustRisk(myTotal, die, bustLimit);
  if (risk > 0.55 && myTotal >= bustLimit - 5) return { action: "hold" };
  return { action: "roll", die };
}

// ─── Strategy Registry ─────────────────────────────────────────────
export const STRATEGIES = {
  conservative: { fn: conservativeStrategy, description: "Plays safe, holds early (17+), avoids risks" },
  aggressive: { fn: aggressiveStrategy, description: "Pushes to 20+, goads opponents, cheats often" },
  balanced: { fn: balancedStrategy, description: "Adapts to opponents, uses hunch & profile strategically" },
  chaotic: { fn: chaoticStrategy, description: "Random/wild decisions, great for edge case testing" },
  cardCounter: { fn: cardCounterStrategy, description: "EV-optimal math-based decisions, surgical cheats" },
  bully: { fn: bullyStrategy, description: "Maximizes skill usage every turn to test skill balance" },
  swashbuckler: { fn: swashbucklerStrategy, description: "Duelist style: drinks, goads, and dramatic pressure plays" },
};

export function getStrategy(name) {
  return STRATEGIES[name]?.fn ?? balancedStrategy;
}

export function listStrategies() {
  return Object.entries(STRATEGIES).map(([name, { description }]) => ({ name, description }));
}
