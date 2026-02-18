#!/usr/bin/env node
/**
 * Tavern Twenty-One — Headless Simulation CLI
 * 
 * Run simulations from the command line:
 *   node simulations/run.mjs                    # Default: 3 players, 100 games
 *   node simulations/run.mjs --games 1000       # Run 1000 games
 *   node simulations/run.mjs --verbose          # Print every event
 *   node simulations/run.mjs --mode goblin      # Goblin mode
 *   node simulations/run.mjs --matchup rogue-vs-fighter
 *   node simulations/run.mjs --strategies balanced,aggressive,conservative
 *   node simulations/run.mjs --tournament       # All strategies face off
 *   node simulations/run.mjs --preset stress    # Stress test preset
 */

import { SimulationRunner, STAT_TEMPLATES } from "./simulation-runner.mjs";
import { listStrategies, STRATEGIES } from "./ai-players.mjs";
import { generateBalanceReport, generateStrategyComparison, generateDesignInsights, calculateFunScore } from "./analysis.mjs";

// ─── Argument Parsing ──────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    games: 100,
    rounds: 10,
    ante: 5,
    mode: "standard",
    gamesSet: false,
    roundsSet: false,
    anteSet: false,
    modeSet: false,
    verbose: false,
    strategies: null,
    tournament: false,
    preset: null,
    matchup: null,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--games": case "-g":
        opts.games = parseInt(args[++i]) || 100;
        opts.gamesSet = true;
        break;
      case "--rounds": case "-r":
        opts.rounds = parseInt(args[++i]) || 10;
        opts.roundsSet = true;
        break;
      case "--ante": case "-a":
        opts.ante = parseInt(args[++i]) || 5;
        opts.anteSet = true;
        break;
      case "--mode": case "-m":
        opts.mode = args[++i] || "standard";
        opts.modeSet = true;
        break;
      case "--verbose": case "-v": opts.verbose = true; break;
      case "--strategies": case "-s": opts.strategies = args[++i]; break;
      case "--tournament": case "-t": opts.tournament = true; break;
      case "--preset": case "-p": opts.preset = args[++i]; break;
      case "--matchup": opts.matchup = args[++i]; break;
      case "--json": opts.json = true; break;
      case "--help": case "-h": opts.help = true; break;
    }
  }

  return opts;
}

// ─── Preset Configurations ─────────────────────────────────────────
const PRESETS = {
  quick: {
    description: "Quick test — 3 players, 50 games",
    playerConfigs: [
      { name: "Alice", strategy: "balanced", statTemplate: "rogue" },
      { name: "Bob", strategy: "aggressive", statTemplate: "fighter" },
      { name: "Charlie", strategy: "conservative", statTemplate: "cleric" },
    ],
    games: 50,
    rounds: 5,
  },
  stress: {
    description: "Stress test — 5 players, 500 games, high skill usage",
    playerConfigs: [
      { name: "Rogue", strategy: "cardCounter", statTemplate: "rogue" },
      { name: "Bard", strategy: "balanced", statTemplate: "bard" },
      { name: "Fighter", strategy: "aggressive", statTemplate: "fighter" },
      { name: "Wizard", strategy: "cardCounter", statTemplate: "wizard" },
      { name: "Barbarian", strategy: "bully", statTemplate: "barbarian" },
    ],
    games: 500,
    rounds: 10,
  },
  balance: {
    description: "Balance test — same strategy, different classes",
    playerConfigs: [
      { name: "Rogue", strategy: "balanced", statTemplate: "rogue" },
      { name: "Fighter", strategy: "balanced", statTemplate: "fighter" },
      { name: "Bard", strategy: "balanced", statTemplate: "bard" },
      { name: "Wizard", strategy: "balanced", statTemplate: "wizard" },
      { name: "Cleric", strategy: "balanced", statTemplate: "cleric" },
    ],
    games: 300,
    rounds: 10,
  },
  skillTest: {
    description: "Skill balance test — bully vs normal players",
    playerConfigs: [
      { name: "Bully", strategy: "bully", statTemplate: "rogue" },
      { name: "Normal1", strategy: "balanced", statTemplate: "average" },
      { name: "Normal2", strategy: "balanced", statTemplate: "average" },
      { name: "Normal3", strategy: "conservative", statTemplate: "average" },
    ],
    games: 300,
    rounds: 10,
  },
  depth: {
    description: "Depth test — mixed archetypes with tavern chaos",
    playerConfigs: [
      { name: "Swashbuckler", strategy: "swashbuckler", statTemplate: "bard" },
      { name: "Schemer", strategy: "balanced", statTemplate: "rogue" },
      { name: "Bruiser", strategy: "aggressive", statTemplate: "fighter" },
      { name: "Oracle", strategy: "cardCounter", statTemplate: "wizard" },
      { name: "Warden", strategy: "conservative", statTemplate: "cleric" },
    ],
    games: 300,
    rounds: 12,
  },
  chaos: {
    description: "Chaos test — all wildcards for edge case discovery",
    playerConfigs: [
      { name: "Chaos1", strategy: "chaotic", statTemplate: "barbarian" },
      { name: "Chaos2", strategy: "chaotic", statTemplate: "rogue" },
      { name: "Chaos3", strategy: "chaotic", statTemplate: "bard" },
      { name: "Chaos4", strategy: "chaotic", statTemplate: "fighter" },
    ],
    games: 200,
    rounds: 15,
  },
  goblin: {
    description: "Goblin mode test — high stakes Russian roulette",
    playerConfigs: [
      { name: "Bold", strategy: "aggressive", statTemplate: "fighter" },
      { name: "Careful", strategy: "conservative", statTemplate: "cleric" },
      { name: "Wild", strategy: "chaotic", statTemplate: "barbarian" },
      { name: "Smart", strategy: "cardCounter", statTemplate: "wizard" },
    ],
    games: 200,
    rounds: 10,
    mode: "goblin",
  },
};

// ─── Main ──────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs();

  if (opts.help) {
    printHelp();
    return;
  }

  console.log("");
  console.log("🎲 TAVERN TWENTY-ONE — HEADLESS SIMULATOR");
  console.log("─".repeat(50));

  // Tournament mode: every strategy plays against every other
  if (opts.tournament) {
    runTournament(opts);
    return;
  }

  // Use preset if specified
  let config;
  if (opts.preset && PRESETS[opts.preset]) {
    const preset = PRESETS[opts.preset];
    console.log(`Using preset: ${opts.preset} — ${preset.description}`);
    const effectiveMode = opts.modeSet ? opts.mode : (preset.mode ?? opts.mode);
    const effectiveRounds = opts.roundsSet ? opts.rounds : (preset.rounds ?? opts.rounds);
    const effectiveAnte = opts.anteSet ? opts.ante : (preset.ante ?? opts.ante);
    config = {
      playerConfigs: preset.playerConfigs,
      ante: effectiveAnte,
      gameMode: effectiveMode,
      roundsPerGame: effectiveRounds,
      verbose: opts.verbose,
    };
    opts.games = opts.gamesSet ? opts.games : (preset.games ?? opts.games);
  } else if (opts.strategies) {
    // Custom strategy list
    const strats = opts.strategies.split(",").map(s => s.trim());
    config = {
      playerConfigs: strats.map((s, i) => ({
        name: `Player${i + 1}(${s})`,
        strategy: s,
        statTemplate: "average",
      })),
      ante: opts.ante,
      gameMode: opts.mode,
      roundsPerGame: opts.rounds,
      verbose: opts.verbose,
    };
  } else if (opts.matchup) {
    config = buildMatchup(opts.matchup, opts);
  } else {
    // Default config
    config = {
      playerConfigs: [
        { name: "Alice (Rogue)", strategy: "balanced", statTemplate: "rogue" },
        { name: "Bob (Fighter)", strategy: "aggressive", statTemplate: "fighter" },
        { name: "Charlie (Cleric)", strategy: "conservative", statTemplate: "cleric" },
      ],
      ante: opts.ante,
      gameMode: opts.mode,
      roundsPerGame: opts.rounds,
      verbose: opts.verbose,
    };
  }

  console.log(`Mode: ${config.gameMode ?? opts.mode} | Games: ${opts.games} | Rounds/Game: ${config.roundsPerGame}`);
  console.log(`Players: ${config.playerConfigs.map(p => p.name).join(", ")}`);
  console.log("");

  const runner = new SimulationRunner(config);
  const results = runner.runBatch(opts.games);

  if (opts.json) {
    // JSON output for programmatic consumption
    console.log(JSON.stringify({
      aggregated: results.aggregated,
      funScore: calculateFunScore(results.aggregated),
    }, null, 2));
  } else {
    console.log(generateBalanceReport(results.aggregated));
    console.log(generateStrategyComparison(results));
    console.log(generateDesignInsights(results.aggregated));
  }
}

// ─── Tournament Mode ───────────────────────────────────────────────
function runTournament(opts) {
  const stratNames = Object.keys(STRATEGIES);
  console.log(`Tournament: ${stratNames.length} strategies compete`);
  console.log(`Strategies: ${stratNames.join(", ")}`);
  console.log("");

  const overallWins = {};
  const overallGold = {};
  for (const s of stratNames) {
    overallWins[s] = 0;
    overallGold[s] = 0;
  }

  // Round-robin: every pair of strategies plays against each other
  let matchCount = 0;
  for (let i = 0; i < stratNames.length; i++) {
    for (let j = i + 1; j < stratNames.length; j++) {
      const s1 = stratNames[i];
      const s2 = stratNames[j];
      matchCount++;

      const runner = new SimulationRunner({
        playerConfigs: [
          { name: s1, strategy: s1, statTemplate: "average", id: "p1" },
          { name: s2, strategy: s2, statTemplate: "average", id: "p2" },
        ],
        ante: opts.ante,
        gameMode: opts.mode,
        roundsPerGame: opts.rounds,
        verbose: false,
      });

      const results = runner.runBatch(Math.max(20, Math.floor(opts.games / 10)));
      const stats = results.aggregated.playerStats;

      const s1wins = stats.p1?.wins ?? 0;
      const s2wins = stats.p2?.wins ?? 0;
      overallWins[s1] += s1wins;
      overallWins[s2] += s2wins;
      overallGold[s1] += stats.p1?.totalNetGold ?? 0;
      overallGold[s2] += stats.p2?.totalNetGold ?? 0;

      const winner = s1wins > s2wins ? s1 : s2wins > s1wins ? s2 : "TIE";
      console.log(`  Match ${matchCount}: ${s1} vs ${s2} → ${winner} (${s1wins} vs ${s2wins} round wins)`);
    }
  }

  console.log("");
  console.log("═══ TOURNAMENT RESULTS ═══");
  console.log("");

  const ranked = stratNames
    .map(s => ({ strategy: s, wins: overallWins[s], gold: overallGold[s] }))
    .sort((a, b) => b.wins - a.wins);

  ranked.forEach((r, i) => {
    const goldStr = r.gold >= 0 ? `+${r.gold}` : String(r.gold);
    console.log(`  #${i + 1}  ${r.strategy.padEnd(14)}  Wins: ${String(r.wins).padEnd(5)}  Gold: ${goldStr}gp`);
  });

  console.log("");
  console.log(`Best strategy: ${ranked[0].strategy} 🏆`);
}

// ─── Matchup Builder ───────────────────────────────────────────────
function buildMatchup(matchupStr, opts) {
  const parts = matchupStr.split("-vs-");
  if (parts.length < 2) {
    console.log("Invalid matchup format. Use: --matchup strategy1-vs-strategy2");
    console.log("Example: --matchup rogue-vs-fighter or --matchup balanced-vs-aggressive");
    process.exit(1);
  }

  return {
    playerConfigs: parts.map((p, i) => {
      // Check if it's a stat template or strategy name
      const isTemplate = !!STAT_TEMPLATES[p.trim()];
      const isStrategy = !!STRATEGIES[p.trim()];
      return {
        name: `${p.trim()}`,
        strategy: isStrategy ? p.trim() : "balanced",
        statTemplate: isTemplate ? p.trim() : "average",
        id: `p${i + 1}`,
      };
    }),
    ante: opts.ante,
    gameMode: opts.mode,
    roundsPerGame: opts.rounds,
    verbose: opts.verbose,
  };
}

// ─── Help ──────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
🎲 TAVERN TWENTY-ONE — HEADLESS SIMULATOR
═════════════════════════════════════════

USAGE:
  node simulations/run.mjs [options]

OPTIONS:
  --games, -g <n>        Number of games to simulate (default: 100)
  --rounds, -r <n>       Rounds per game (default: 10)
  --ante, -a <n>         Ante amount in GP (default: 5)
  --mode, -m <mode>      Game mode: "standard" or "goblin" (default: standard)
  --verbose, -v          Print every game event
  --strategies, -s <list> Comma-separated strategy names
  --tournament, -t       Run round-robin tournament of all strategies
  --preset, -p <name>    Use a preset configuration
  --matchup <a-vs-b>     Head-to-head strategy matchup
  --json                 Output raw JSON for programmatic use
  --help, -h             Show this help

PRESETS:
  quick      Quick test — 3 players, 50 games
  stress     Stress test — 5 players, 500 games  
  balance    Balance test — same strategy, different classes
  skillTest  Skill balance — bully vs normal players
  depth      Depth test — mixed archetypes with tavern chaos
  chaos      Edge case discovery — all wildcards
  goblin     Goblin mode test — high stakes

STRATEGIES:
${listStrategies().map(s => `  ${s.name.padEnd(14)} ${s.description}`).join("\n")}

STAT TEMPLATES:
  fighter, rogue, bard, wizard, cleric, barbarian, average

EXAMPLES:
  node simulations/run.mjs --preset quick
  node simulations/run.mjs --games 1000 --strategies balanced,aggressive,cardCounter
  node simulations/run.mjs --tournament --games 500
  node simulations/run.mjs --matchup balanced-vs-aggressive --games 200
  node simulations/run.mjs --preset goblin --verbose
  node simulations/run.mjs --json > results.json
  `);
}

// ─── Entry Point ───────────────────────────────────────────────────
main();
