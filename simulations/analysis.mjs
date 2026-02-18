/**
 * Tavern Twenty-One — Analysis & Reporting
 * 
 * Generates human-readable reports from simulation results.
 * Evaluates game balance, fun metrics, and strategy effectiveness.
 */

// ─── Fun Score Calculator ──────────────────────────────────────────
export function calculateFunScore(aggregated) {
  const m = aggregated.overallMetrics;
  const n = aggregated.gamesPlayed;
  const players = Object.values(aggregated.playerStats);

  // Fun is a composite of several factors:
  const scores = {};

  // 1. Closeness of competition (0-25 pts)
  //    Are games decided by narrow margins? Close games = more fun.
  const winRates = players.map(p => p.wins / Math.max(1, n * m.avgRoundsPerGame));
  const winVariance = variance(winRates);
  // Lower variance = more balanced = more fun.
  // Tuned for role-asymmetric tavern metas so minor archetype skew doesn't over-penalize.
  scores.competitiveBalance = Math.round(Math.max(0, 25 - winVariance * 15));

  // 2. Decision frequency (0-20 pts)
  //    More meaningful decisions per round = more engaging.
  //    Use per-round density so short presets don't get unfairly punished.
  const totalSkills = Object.values(m.skillUsage).reduce((a, b) => a + b, 0);
  const avgSkillsPerRound = totalSkills / Math.max(1, n * m.avgRoundsPerGame);
  if (totalSkills > 0) {
    scores.decisionDensity = Math.round(Math.min(20, avgSkillsPerRound * 14));
  } else {
    // Goblin/no-skill modes still have meaningful push-your-luck decisions.
    const tacticalPressure = (m.totalHolds + m.totalBusts + m.totalDuels * 5) / Math.max(1, n * m.avgRoundsPerGame);
    scores.decisionDensity = Math.round(Math.min(20, tacticalPressure * 5));
  }

  // 3. Comeback potential (0-20 pts)
  //    Can losing players recover? Measured by gold swing magnitude.
  const avgSwing = players.reduce((sum, p) => {
    return sum + Math.abs(p.bestGame - p.worstGame);
  }, 0) / Math.max(1, players.length);
  scores.comebackPotential = Math.round(Math.min(20, avgSwing / 5));

  // 4. Drama factor (0-20 pts)
  //    Nat 20s, duels, close busts, accusations
  const dramaEvents = (
    m.totalNat20s +
    m.totalDuels * 3 +
    m.totalAccusationsCorrect * 2 +
    (m.totalHeroicSaves ?? 0) * 2 +
    (m.totalDrinks ?? 0) * 0.2 +
    m.totalBusts * 0.25
  ) / Math.max(1, n);
  scores.dramaFactor = Math.round(Math.min(20, dramaEvents * 8));

  // 5. Meaningful bust rate (0-15 pts)
  //    Some busts are exciting, but too many = frustrating
  const bustRate = m.totalBusts / Math.max(1, n * m.avgRoundsPerGame * players.length);
  const heroicSaveRate = (m.totalHeroicSaves ?? 0) / Math.max(1, n * m.avgRoundsPerGame * players.length);
  const effectiveBustRate = Math.max(0, bustRate - heroicSaveRate * 0.5);

  // Sweet spot for this tavern ruleset is intentionally high-risk.
  if (effectiveBustRate >= 0.30 && effectiveBustRate <= 0.80) {
    scores.bustExcitement = 15;
  } else if (effectiveBustRate < 0.30) {
    scores.bustExcitement = Math.round(effectiveBustRate * 50); // too few busts = less tension
  } else {
    scores.bustExcitement = Math.round(Math.max(0, 15 - (effectiveBustRate - 0.80) * 75)); // too many = frustrating
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return { total, maxPossible: 100, breakdown: scores };
}

// ─── Balance Report ────────────────────────────────────────────────
export function generateBalanceReport(aggregated) {
  const players = Object.values(aggregated.playerStats);
  const m = aggregated.overallMetrics;
  const n = aggregated.gamesPlayed;

  const lines = [];
  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║          TAVERN TWENTY-ONE — SIMULATION REPORT             ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`Games: ${n} | Rounds/Game: ${m.avgRoundsPerGame.toFixed(1)} | Turns/Game: ${m.avgTurnsPerGame.toFixed(1)}`);
  lines.push(`Speed: ${aggregated.gamesPerSecond} games/sec | Elapsed: ${(aggregated.elapsed / 1000).toFixed(1)}s`);
  lines.push("");

  // Player Performance
  lines.push("┌──────────────────────────────────────────────────────────────┐");
  lines.push("│  PLAYER PERFORMANCE                                         │");
  lines.push("├──────────────────────────────────────────────────────────────┤");
  for (const p of players) {
    const avgNet = (p.totalNetGold / n).toFixed(1);
    const winRate = ((p.wins / Math.max(1, n * m.avgRoundsPerGame)) * 100).toFixed(1);
    const bar = makeBar(p.wins, Math.max(...players.map(pp => pp.wins)), 20);
    lines.push(`│  ${pad(p.name, 12)} [${pad(p.strategy, 12)}]  Win%: ${pad(winRate, 5)}  Net: ${pad(avgNet, 7)}gp  ${bar}`);
  }
  lines.push("└──────────────────────────────────────────────────────────────┘");
  lines.push("");

  // Game Events
  lines.push("┌──────────────────────────────────────────────────────────────┐");
  lines.push("│  GAME EVENTS (per game avg)                                 │");
  lines.push("├──────────────────────────────────────────────────────────────┤");
  lines.push(`│  Busts: ${(m.totalBusts / n).toFixed(1)}   Holds: ${(m.totalHolds / n).toFixed(1)}   Folds: ${(m.totalFolds / n).toFixed(1)}`);
  lines.push(`│  Nat 20s: ${(m.totalNat20s / n).toFixed(2)}   Nat 1s: ${(m.totalNat1s / n).toFixed(2)}   Duels: ${(m.totalDuels / n).toFixed(2)}`);
  lines.push(`│  Drinks: ${((m.totalDrinks ?? 0) / n).toFixed(1)}   Heroic Saves: ${((m.totalHeroicSaves ?? 0) / n).toFixed(2)}`);
  lines.push(`│  Avg Pot: ${m.avgPotSize.toFixed(0)}gp   Closest Finish: ${m.closestFinish === Infinity ? "N/A" : m.closestFinish}`);
  lines.push("└──────────────────────────────────────────────────────────────┘");
  lines.push("");

  // Skills
  lines.push("┌──────────────────────────────────────────────────────────────┐");
  lines.push("│  SKILL USAGE (total across all games)                       │");
  lines.push("├──────────────────────────────────────────────────────────────┤");
  for (const [skill, count] of Object.entries(m.skillUsage)) {
    const perGame = (count / n).toFixed(1);
    const bar = makeBar(count, Math.max(...Object.values(m.skillUsage)), 20);
    lines.push(`│  ${pad(skill, 10)} ${pad(String(count), 5)} (${perGame}/game) ${bar}`);
  }
  lines.push("└──────────────────────────────────────────────────────────────┘");
  lines.push("");

  // Cheat Economy
  if (m.totalCheatsAttempted > 0) {
    const cheatSuccess = ((m.totalCheatsSucceeded / m.totalCheatsAttempted) * 100).toFixed(1);
    const cheatCaught = ((m.totalCheatsCaught / m.totalCheatsAttempted) * 100).toFixed(1);
    lines.push("┌──────────────────────────────────────────────────────────────┐");
    lines.push("│  CHEAT ECONOMY                                              │");
    lines.push("├──────────────────────────────────────────────────────────────┤");
    lines.push(`│  Attempts: ${m.totalCheatsAttempted}  Success: ${cheatSuccess}%  Caught: ${cheatCaught}%`);
    if (m.totalAccusations > 0) {
      const accRate = ((m.totalAccusationsCorrect / m.totalAccusations) * 100).toFixed(1);
      lines.push(`│  Accusations: ${m.totalAccusations}  Correct: ${accRate}%`);
    }
    lines.push("└──────────────────────────────────────────────────────────────┘");
    lines.push("");
  }

  const tavernEvents = Object.entries(m.tavernEvents ?? {});
  if (tavernEvents.length > 0) {
    lines.push("┌──────────────────────────────────────────────────────────────┐");
    lines.push("│  TAVERN EVENTS (round frequency)                            │");
    lines.push("├──────────────────────────────────────────────────────────────┤");
    const totalEvents = tavernEvents.reduce((sum, [, count]) => sum + count, 0);
    const rankedEvents = [...tavernEvents].sort((a, b) => b[1] - a[1]);
    for (const [eventId, count] of rankedEvents) {
      const pct = totalEvents > 0 ? ((count / totalEvents) * 100).toFixed(1) : "0.0";
      lines.push(`│  ${pad(eventId, 18)} ${pad(String(count), 5)} (${pct}%)`);
    }
    lines.push("└──────────────────────────────────────────────────────────────┘");
    lines.push("");
  }

  // Fun Score
  const fun = calculateFunScore(aggregated);
  lines.push("┌──────────────────────────────────────────────────────────────┐");
  lines.push(`│  FUN SCORE: ${fun.total}/${fun.maxPossible}  ${funEmoji(fun.total)}${" ".repeat(Math.max(0, 40 - String(fun.total).length))}│`);
  lines.push("├──────────────────────────────────────────────────────────────┤");
  for (const [key, val] of Object.entries(fun.breakdown)) {
    const label = camelToTitle(key);
    const maxForKey = key === "bustExcitement" ? 15
      : key === "competitiveBalance" ? 25
      : 20;
    const pct = Math.round((val / maxForKey) * 100);
    lines.push(`│  ${pad(label, 22)} ${pad(String(val), 3)}/${maxForKey}  ${makeBar(val, maxForKey, 15)}  ${pct}%`);
  }
  lines.push("└──────────────────────────────────────────────────────────────┘");

  return lines.join("\n");
}

// ─── Strategy Comparison Report ────────────────────────────────────
export function generateStrategyComparison(batchResult) {
  const { aggregated } = batchResult;
  const players = Object.values(aggregated.playerStats);
  const n = aggregated.gamesPlayed;

  const lines = [];
  lines.push("");
  lines.push("═══ STRATEGY COMPARISON ═══");
  lines.push("");

  // Sort by total wins
  const sorted = [...players].sort((a, b) => b.wins - a.wins);

  lines.push(pad("Rank", 5) + pad("Strategy", 14) + pad("Player", 13) + pad("Wins", 7) + pad("Avg Net", 10) + pad("Best", 8) + pad("Worst", 8));
  lines.push("─".repeat(65));

  sorted.forEach((p, i) => {
    lines.push(
      pad(`#${i + 1}`, 5) +
      pad(p.strategy, 14) +
      pad(p.name, 13) +
      pad(String(p.wins), 7) +
      pad((p.totalNetGold / n).toFixed(0) + "gp", 10) +
      pad(p.bestGame + "gp", 8) +
      pad(p.worstGame + "gp", 8)
    );
  });

  return lines.join("\n");
}

// ─── Design Insights ───────────────────────────────────────────────
export function generateDesignInsights(aggregated) {
  const m = aggregated.overallMetrics;
  const n = aggregated.gamesPlayed;
  const players = Object.values(aggregated.playerStats);

  const insights = [];
  insights.push("");
  insights.push("═══ DESIGN INSIGHTS ═══");
  insights.push("");

  // Win rate analysis
  const winRates = players.map(p => ({
    name: p.name, strategy: p.strategy,
    rate: p.wins / Math.max(1, n * m.avgRoundsPerGame)
  }));
  const maxWinRate = Math.max(...winRates.map(w => w.rate));
  const minWinRate = Math.min(...winRates.map(w => w.rate));
  const spread = maxWinRate - minWinRate;

  if (spread > 0.45) {
    const dominant = winRates.find(w => w.rate === maxWinRate);
    insights.push(`⚠️  BALANCE CONCERN: "${dominant.strategy}" strategy dominates (${(maxWinRate * 100).toFixed(0)}% win rate vs ${(minWinRate * 100).toFixed(0)}% for weakest).`);
    insights.push(`   → Consider buffing counterplay options against this approach.`);
  } else if (spread < 0.2) {
    insights.push(`✅ WELL BALANCED: All strategies win at similar rates (spread: ${(spread * 100).toFixed(1)}%).`);
  }

  // Bust rate
  const bustRate = m.totalBusts / Math.max(1, n * m.avgRoundsPerGame * players.length);
  if (bustRate > 0.85) {
    insights.push(`⚠️  HIGH BUST RATE (${(bustRate * 100).toFixed(0)}%): Players bust too often. Game may feel punishing.`);
    insights.push(`   → Consider: larger d4 range, bust forgiveness mechanic, or lower die costs.`);
  } else if (bustRate < 0.15) {
    insights.push(`⚠️  LOW BUST RATE (${(bustRate * 100).toFixed(0)}%): Not enough tension. Players play too safely.`);
    insights.push(`   → Consider: forced roll mechanics, higher reward for risky play.`);
  }

  // Skill engagement
  const totalSkills = Object.values(m.skillUsage).reduce((a, b) => a + b, 0);
  const avgSkillsPerRound = totalSkills / Math.max(1, n * m.avgRoundsPerGame);
  const avgHoldsPerRound = m.totalHolds / Math.max(1, n * m.avgRoundsPerGame);
  if (avgSkillsPerRound < 0.5 && avgHoldsPerRound < 1) {
    insights.push(`⚠️  LOW SKILL USAGE (${avgSkillsPerRound.toFixed(1)}/round): Skills aren't compelling enough.`);
    insights.push(`   → Consider: lower skill costs, more obvious benefit, tutorial prompts.`);
  } else if (avgSkillsPerRound > 3) {
    insights.push(`✅ HIGH SKILL ENGAGEMENT (${avgSkillsPerRound.toFixed(1)}/round): Skills are used frequently. Good interaction!`);
  }

  // Cheat economy
  if (m.totalCheatsAttempted > 0) {
    const cheatSuccessRate = m.totalCheatsSucceeded / m.totalCheatsAttempted;
    if (cheatSuccessRate > 0.8) {
      insights.push(`⚠️  CHEATING TOO EASY (${(cheatSuccessRate * 100).toFixed(0)}% success): Heat system may be too lenient.`);
      insights.push(`   → Consider: faster heat scaling, lower base sleight of hand DCs.`);
    } else if (cheatSuccessRate < 0.3) {
      insights.push(`⚠️  CHEATING TOO HARD (${(cheatSuccessRate * 100).toFixed(0)}% success): Not worth the risk.`);
      insights.push(`   → Consider: lower initial heat DC, bigger cheat payoff.`);
    }
  }

  const drinkRate = (m.totalDrinks ?? 0) / Math.max(1, n * m.avgRoundsPerGame);
  if (totalSkills > 0 && drinkRate < 0.05) {
    insights.push(`⚠️  LOW TAVERN FLAVOR (${drinkRate.toFixed(2)} drinks/round): Drinking choices are being ignored.`);
    insights.push(`   → Consider increasing drink rewards or teaching more strategies to use it.`);
  }

  const heroicRate = (m.totalHeroicSaves ?? 0) / Math.max(1, n * m.avgRoundsPerGame);
  if (heroicRate > 0.5) {
    insights.push(`⚠️  HEROIC SAVES TOO COMMON (${heroicRate.toFixed(2)}/round): Bust punishment may now be too soft.`);
    insights.push(`   → Consider tightening save window (e.g., overshoot by 1 only).`);
  } else if (heroicRate > 0) {
    insights.push(`🛡️ Heroic Saves trigger ${heroicRate.toFixed(2)} times per round on average.`);
  }

  // Fold rate
  const foldRate = m.totalFolds / Math.max(1, n * m.avgRoundsPerGame * players.length);
  if (foldRate > 0.3) {
    insights.push(`⚠️  HIGH FOLD RATE (${(foldRate * 100).toFixed(0)}%): Players giving up too often.`);
    insights.push(`   → Consider: fold penalty, smaller ante, comeback mechanics.`);
  }

  // Duel excitement
  if (m.totalDuels > 0) {
    const duelRate = m.totalDuels / Math.max(1, n * m.avgRoundsPerGame);
    insights.push(`🎲 Duel rate: ${(duelRate * 100).toFixed(1)}% of rounds end in duels.`);
  }

  if (insights.length <= 3) {
    insights.push("✅ No major balance concerns detected. Game appears well-tuned!");
  }

  return insights.join("\n");
}

// ─── Helpers ───────────────────────────────────────────────────────
function pad(str, len) {
  return String(str).padEnd(len);
}

function makeBar(value, max, width) {
  const filled = Math.round((value / Math.max(1, max)) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function variance(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((sum, val) => sum + (val - mean) ** 2, 0) / arr.length;
}

function camelToTitle(str) {
  return str.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
}

function funEmoji(score) {
  if (score >= 85) return "🎉 Incredible!";
  if (score >= 70) return "😄 Great!";
  if (score >= 55) return "🙂 Good";
  if (score >= 40) return "😐 Okay";
  if (score >= 25) return "😕 Needs work";
  return "😬 Major issues";
}
