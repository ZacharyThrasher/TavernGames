/**
 * Tavern Twenty-One — Simulation Runner
 * 
 * Orchestrates automated games between AI players. Handles the game loop,
 * feeds game state to strategy functions, and executes their decisions.
 * 
 * Usage:
 *   const runner = new SimulationRunner({ ... });
 *   const results = runner.runBatch(1000);
 */

import { HeadlessEngine, SimPlayer } from "./headless-engine.mjs";
import { getStrategy, STRATEGIES } from "./ai-players.mjs";

// ─── Default Player Stat Templates ────────────────────────────────
const STAT_TEMPLATES = {
  fighter: {
    str: 3, dex: 1, con: 2, int: 0, wis: 0, cha: 1,
    sleightOfHand: 0, intimidation: 3, persuasion: 0,
    insight: 0, investigation: 0, deception: 0,
  },
  rogue: {
    str: 0, dex: 3, con: 1, int: 1, wis: 1, cha: 2,
    sleightOfHand: 5, intimidation: 0, persuasion: 2,
    insight: 2, investigation: 2, deception: 4,
  },
  bard: {
    str: 0, dex: 2, con: 1, int: 1, wis: 1, cha: 3,
    sleightOfHand: 2, intimidation: 2, persuasion: 5,
    insight: 1, investigation: 1, deception: 3,
  },
  wizard: {
    str: -1, dex: 1, con: 0, int: 4, wis: 2, cha: 0,
    sleightOfHand: 1, intimidation: 0, persuasion: 0,
    insight: 3, investigation: 5, deception: 0,
  },
  cleric: {
    str: 1, dex: 0, con: 2, int: 1, wis: 3, cha: 1,
    sleightOfHand: 0, intimidation: 0, persuasion: 2,
    insight: 5, investigation: 2, deception: 0,
  },
  barbarian: {
    str: 4, dex: 1, con: 3, int: -1, wis: 0, cha: 0,
    sleightOfHand: 0, intimidation: 4, persuasion: 0,
    insight: 0, investigation: 0, deception: 0,
  },
  average: {
    str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1,
    sleightOfHand: 2, intimidation: 2, persuasion: 2,
    insight: 2, investigation: 2, deception: 2,
  },
};

export { STAT_TEMPLATES };

// ─── Create Players from Config ───────────────────────────────────
export function createPlayers(configs) {
  return configs.map((cfg, i) => {
    const stats = {
      ...(STAT_TEMPLATES[cfg.statTemplate ?? "average"] ?? STAT_TEMPLATES.average),
      ...(cfg.stats ?? {}),
      startingGold: cfg.startingGold ?? 100,
    };
    return new SimPlayer(
      cfg.id ?? `player_${i + 1}`,
      cfg.name ?? `Player ${i + 1}`,
      stats
    );
  });
}

// ════════════════════════════════════════════════════════════════════
//  SIMULATION RUNNER
// ════════════════════════════════════════════════════════════════════
export class SimulationRunner {
  /**
   * @param {Object} options
   * @param {Array} options.playerConfigs - Array of player config objects:
   *   { id, name, strategy: "balanced", statTemplate: "rogue", startingGold: 100 }
   * @param {number} options.ante - Ante per round (default 5)
   * @param {string} options.gameMode - "standard" or "goblin"
   * @param {number} options.roundsPerGame - Rounds per game session (default 10)
   * @param {boolean} options.verbose - Print each event
   * @param {number} options.maxTurnsPerRound - Safety limit (default 200)
   * @param {number} options.startingHeat - Initial heat DC (default 10)
   */
  constructor(options = {}) {
    this.playerConfigs = options.playerConfigs ?? [
      { name: "Alice", strategy: "balanced", statTemplate: "rogue" },
      { name: "Bob", strategy: "aggressive", statTemplate: "fighter" },
      { name: "Charlie", strategy: "conservative", statTemplate: "cleric" },
    ];
    this.ante = options.ante ?? 5;
    this.gameMode = options.gameMode ?? "standard";
    this.roundsPerGame = options.roundsPerGame ?? 10;
    this.verbose = options.verbose ?? false;
    this.maxTurnsPerRound = options.maxTurnsPerRound ?? 200;
    this.startingHeat = options.startingHeat ?? 10;
  }

  /**
   * Run a single game (multiple rounds)
   * @returns {Object} Game results and metrics
   */
  runGame() {
    const players = createPlayers(this.playerConfigs);
    const strategies = new Map(
      this.playerConfigs.map((cfg, i) => [
        players[i].id,
        getStrategy(cfg.strategy ?? "balanced")
      ])
    );

    const engine = new HeadlessEngine({
      players,
      ante: this.ante,
      gameMode: this.gameMode,
      verbose: this.verbose,
      startingHeat: this.startingHeat,
    });

    const gameLog = [];
    let totalTurns = 0;

    for (let round = 0; round < this.roundsPerGame; round++) {
      // Check if anyone can still afford to play
      const canPlay = players.every(p => p.wallet.canAfford(this.ante));
      if (!canPlay) {
        if (this.verbose) console.log(`  Round ${round + 1}: Someone can't afford ante. Game over.`);
        break;
      }

      engine.startRound();
      let turnCount = 0;

      // Game loop for this round
      while (engine.status === "PLAYING" && turnCount < this.maxTurnsPerRound) {
        const currentId = engine.tableData.currentPlayer;
        if (!currentId) break;

        const strategy = strategies.get(currentId);
        const info = engine.getGameInfo(currentId);

        if (info.availableActions.length === 0) {
          // No actions available — force advance
          engine._advanceTurn();
          turnCount++;
          continue;
        }

        const decision = strategy(info, engine);
        this._executeAction(engine, currentId, decision);
        turnCount++;
        totalTurns++;
      }

      // Handle inspection phase (staredown)
      if (engine.status === "INSPECTION") {
        for (const player of players) {
          const strategy = strategies.get(player.id);
          const info = engine.getGameInfo(player.id);
          if (info.availableActions.includes("accuse")) {
            const decision = strategy(info, engine);
            if (decision.action === "accuse") {
              engine.accuse(player.id, decision.targetId, decision.dieIndex ?? -1);
            }
          }
        }
        engine.finishRound();
      }

      // If still playing (shouldn't happen), force finish
      if (engine.status === "PLAYING") {
        engine.finishBetting();
        engine.finishRound();
      }

      // Return to lobby
      if (engine.status === "PAYOUT" || engine.status === "REVEALING") {
        engine.returnToLobby();
      }

      gameLog.push({
        round: round + 1,
        turns: turnCount,
        goldAfter: Object.fromEntries(players.map(p => [p.id, p.wallet.gold])),
      });
    }

    return {
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        strategy: this.playerConfigs.find(c => (c.id ?? `player_${players.indexOf(p) + 1}`) === p.id)?.strategy ?? "balanced",
        finalGold: p.wallet.gold,
        netGold: p.wallet.net,
        totalWon: p.wallet.totalWon,
        totalLost: p.wallet.totalLost,
      })),
      metrics: engine.metrics,
      totalTurns,
      roundsPlayed: gameLog.length,
      gameLog,
      events: engine.log.entries,
    };
  }

  /**
   * Run many games and aggregate results
   * @param {number} count - Number of games to simulate
   * @returns {Object} Aggregated statistics
   */
  runBatch(count = 100) {
    const startTime = Date.now();
    const allResults = [];
    const aggregated = {
      gamesPlayed: count,
      playerStats: {},
      overallMetrics: {
        avgRoundsPerGame: 0,
        avgTurnsPerGame: 0,
        avgPotSize: 0,
        totalBusts: 0,
        totalHolds: 0,
        totalFolds: 0,
        totalDuels: 0,
        totalNat20s: 0,
        totalNat1s: 0,
        totalCheatsAttempted: 0,
        totalCheatsSucceeded: 0,
        totalCheatsCaught: 0,
        totalAccusations: 0,
        totalAccusationsCorrect: 0,
        totalDrinks: 0,
        totalHeroicSaves: 0,
        tavernEvents: {},
        skillUsage: { goad: 0, bump: 0, cheat: 0, hunch: 0, profile: 0 },
        closestFinish: Infinity,
      },
    };

    // Initialize player stats
    for (const cfg of this.playerConfigs) {
      const id = cfg.id ?? `player_${this.playerConfigs.indexOf(cfg) + 1}`;
      aggregated.playerStats[id] = {
        name: cfg.name ?? id,
        strategy: cfg.strategy ?? "balanced",
        wins: 0,
        totalNetGold: 0,
        totalWon: 0,
        totalLost: 0,
        bestGame: -Infinity,
        worstGame: Infinity,
        goldHistory: [],
      };
    }

    for (let i = 0; i < count; i++) {
      // Reset player wallets between games
      const result = this.runGame();
      allResults.push(result);

      // Aggregate
      aggregated.overallMetrics.avgRoundsPerGame += result.roundsPlayed;
      aggregated.overallMetrics.avgTurnsPerGame += result.totalTurns;
      aggregated.overallMetrics.avgPotSize += result.metrics.biggestPot;
      aggregated.overallMetrics.totalBusts += result.metrics.busts;
      aggregated.overallMetrics.totalHolds += result.metrics.holds;
      aggregated.overallMetrics.totalFolds += result.metrics.folds;
      aggregated.overallMetrics.totalDuels += result.metrics.duels;
      aggregated.overallMetrics.totalNat20s += result.metrics.nat20s;
      aggregated.overallMetrics.totalNat1s += result.metrics.nat1s;
      aggregated.overallMetrics.totalCheatsAttempted += result.metrics.cheatsAttempted;
      aggregated.overallMetrics.totalCheatsSucceeded += result.metrics.cheatsSucceeded;
      aggregated.overallMetrics.totalCheatsCaught += result.metrics.cheatsCaught;
      aggregated.overallMetrics.totalAccusations += result.metrics.accusations;
      aggregated.overallMetrics.totalAccusationsCorrect += result.metrics.accusationsCorrect;
      aggregated.overallMetrics.totalDrinks += result.metrics.drinks ?? 0;
      aggregated.overallMetrics.totalHeroicSaves += result.metrics.heroicSaves ?? 0;
      aggregated.overallMetrics.closestFinish = Math.min(
        aggregated.overallMetrics.closestFinish, result.metrics.closestFinish
      );
      for (const [eventId, eventCount] of Object.entries(result.metrics.tavernEvents ?? {})) {
        aggregated.overallMetrics.tavernEvents[eventId] = (aggregated.overallMetrics.tavernEvents[eventId] ?? 0) + eventCount;
      }
      for (const [skill, count] of Object.entries(result.metrics.skillsUsed)) {
        aggregated.overallMetrics.skillUsage[skill] += count;
      }

      for (const p of result.players) {
        const stats = aggregated.playerStats[p.id];
        if (!stats) continue;
        stats.totalNetGold += p.netGold;
        stats.totalWon += p.totalWon;
        stats.totalLost += p.totalLost;
        stats.bestGame = Math.max(stats.bestGame, p.netGold);
        stats.worstGame = Math.min(stats.worstGame, p.netGold);
        stats.goldHistory.push(p.finalGold);
        // Count wins (positive net gold = "won" the session)
        if (result.metrics.winsByPlayer[p.id] > 0) {
          stats.wins += result.metrics.winsByPlayer[p.id];
        }
      }
    }

    // Average out metrics
    aggregated.overallMetrics.avgRoundsPerGame /= count;
    aggregated.overallMetrics.avgTurnsPerGame /= count;
    aggregated.overallMetrics.avgPotSize /= count;

    const elapsed = Date.now() - startTime;
    aggregated.elapsed = elapsed;
    aggregated.gamesPerSecond = Math.round(count / (elapsed / 1000));

    return { aggregated, allResults };
  }

  // ─── Execute an AI decision ─────────────────────────────────────
  _executeAction(engine, userId, decision) {
    if (!decision || !decision.action) return;

    switch (decision.action) {
      case "roll":
        engine.submitRoll(userId, decision.die);
        break;
      case "roll_goblin":
        engine.submitRoll(userId, engine.tableData.goblinStageDie);
        break;
      case "hold":
        engine.hold(userId);
        break;
      case "fold":
        engine.fold(userId);
        break;
      case "drink":
        engine.drink(userId);
        break;
      case "cut_reroll":
        engine.useCut(userId, true);
        break;
      case "cut_pass":
        engine.useCut(userId, false);
        break;
      case "cheat":
        engine.cheat(userId, decision.dieIndex ?? 0, decision.adjustment ?? 1);
        break;
      case "goad":
        engine.goad(userId, decision.targetId, decision.skill ?? "intimidation");
        break;
      case "bump":
        engine.bump(userId, decision.targetId, decision.dieIndex ?? 0);
        break;
      case "hunch":
        engine.hunch(userId);
        // After hunch, the player still needs to take their main action
        // Re-query strategy for the actual play
        {
          const info = engine.getGameInfo(userId);
          const strategy = this._getStrategyForPlayer(userId);
          const followUp = strategy(info, engine);
          if (followUp && followUp.action !== "hunch") {
            this._executeAction(engine, userId, followUp);
          }
        }
        break;
      case "profile":
        engine.profile(userId, decision.targetId);
        // Profile doesn't advance turn, so we need a follow-up action
        {
          const info = engine.getGameInfo(userId);
          const strategy = this._getStrategyForPlayer(userId);
          const followUp = strategy(info, engine);
          if (followUp && followUp.action !== "profile") {
            this._executeAction(engine, userId, followUp);
          }
        }
        break;
      case "accuse":
        engine.accuse(userId, decision.targetId, decision.dieIndex ?? -1);
        break;
      case "skip_inspection":
        // No-op, handled in the round loop
        break;
      case "side_bet":
        engine.placeSideBet(userId, decision.championId, decision.amount);
        break;
      case "roll_d20_forced":
        engine.submitRoll(userId, 20);
        break;
      case "roll_forced":
        engine.submitRoll(userId, decision.die ?? 6);
        break;
      default:
        // Unknown action, try to roll a safe die
        engine.submitRoll(userId, 6);
        break;
    }
  }

  _getStrategyForPlayer(userId) {
    const idx = this.playerConfigs.findIndex(
      (cfg, i) => (cfg.id ?? `player_${i + 1}`) === userId
    );
    if (idx === -1) return getStrategy("balanced");
    return getStrategy(this.playerConfigs[idx].strategy ?? "balanced");
  }
}
