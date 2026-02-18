# Tavern Twenty-One — Headless Simulator

## What Is This?

A complete headless simulation of the Tavern Twenty-One card game that runs **without Foundry VTT**. AI coding agents can use this to:

- **Play the game** through automated strategies
- **Evaluate game balance** across thousands of simulations
- **Test new mechanics** by modifying rules and re-running
- **Discover edge cases** with chaotic/stress-test modes
- **Iterate on game design** with measurable fun metrics

## Quick Start

```bash
# Run with defaults (3 players, 100 games, standard mode)
node simulations/run.mjs

# Quick test
node simulations/run.mjs --preset quick

# Stress test for balance
node simulations/run.mjs --preset stress

# Depth test with tavern mechanics
node simulations/run.mjs --preset depth

# Goblin mode
node simulations/run.mjs --preset goblin

# Tournament — all strategies face off
node simulations/run.mjs --tournament

# Custom matchup
node simulations/run.mjs --matchup balanced-vs-aggressive --games 500

# JSON output for analysis
node simulations/run.mjs --preset balance --json > results.json
```

## Architecture

```
simulations/
├── run.mjs               # CLI entry point
├── headless-engine.mjs   # Complete game engine (no Foundry deps)
├── ai-players.mjs        # AI strategy functions
├── simulation-runner.mjs # Orchestrates games + collects metrics
├── analysis.mjs          # Reports, fun scoring, design insights
└── README.md             # This file
```

### headless-engine.mjs
Reimplements the full Tavern 21 game loop:
- Opening phase (2×d10 deal, visible + hole die)
- The Cut (lowest visible rerolls hole)
- Betting phase (buy dice d4/d6/d8/d10/d20, with costs)
- Tavern Events (round-based world modifiers)
- Drink action (Liquid Courage vs Sloppy penalties)
- Heroic Save (clutch near-bust recovery)
- All 5 skills: Goad, Bump, Cheat, Hunch, Profile
- The Staredown (accusations)
- Duels (tied winner resolution)
- Side Bets
- Goblin Mode (stage dice d20→d12→...→d4→coin, sudden death)
- Wallet tracking, cleaning fees, heat system

### ai-players.mjs
Seven AI strategies that make decisions based on game state:

| Strategy | Play Style |
|----------|-----------|
| `conservative` | Holds at 17+, avoids risks, never cheats |
| `aggressive` | Pushes to 20+, goads opponents, cheats often |
| `balanced` | Adapts to opponents, uses hunch & profile |
| `chaotic` | Random decisions, great for edge case testing |
| `cardCounter` | EV-optimal math-based play, surgical cheats |
| `bully` | Maximizes skill usage every turn |
| `swashbuckler` | Duelist style: drinks, goads, and dramatic pressure plays |

### simulation-runner.mjs
Handles the game loop, feeds state to AI strategies, executes decisions.
Includes D&D stat templates (fighter, rogue, bard, wizard, cleric, barbarian).

### analysis.mjs
Generates reports including:
- **Player performance** (win rates, net gold, rankings)
- **Skill usage** breakdown
- **Cheat economy** (success rates, accusations)
- **Tavern depth** (drinks, heroic saves, event distribution)
- **Fun Score** (0-100) measuring competitive balance, decision density, comeback potential, drama factor, and bust excitement
- **Design insights** — automated suggestions for balance improvements

## For AI Agents: How to Iterate on Game Design

### 1. Establish a Baseline
```bash
node simulations/run.mjs --preset balance --games 500 --json > baseline.json
```

### 2. Modify a Game Rule
Edit `simulations/headless-engine.mjs`. For example, to test a new die cost:
```javascript
// Change d4 cost from 2x ante to 1.5x ante
export const DIE_COST_MULTIPLIERS = { 4: 1.5, 6: 1, 8: 1, 10: 0.5, 20: 0.5 };
```

### 3. Re-run and Compare
```bash
node simulations/run.mjs --preset balance --games 500 --json > modified.json
```

### 4. Analyze the Difference
Compare the Fun Score, win rates, bust rates, skill usage between baseline and modified.

### Key Metrics to Watch
- **Fun Score** > 60 is good, > 75 is great
- **Competitive Balance** — no strategy should dominate >40% win rate
- **Bust Rate** — sweet spot is 10-30%
- **Skill Usage** — >1.0 skills/round means skills are compelling
- **Cheat Success** — 40-60% is the sweet spot (risk/reward)
- **Duel Rate** — 5-15% of rounds ending in duels feels exciting
- **Drink Rate** — 0.1-0.4 drinks/round keeps tavern choices relevant
- **Heroic Save Rate** — should be uncommon; too frequent softens tension

### Creating a New Strategy
Add to `ai-players.mjs`:
```javascript
export function myNewStrategy(info, engine) {
  const { myTotal, availableActions, opponents } = info;
  
  // info.myTotal — your actual total (including hole die)
  // info.myVisible — what opponents can see
  // info.opponents — { id: { visibleTotal, isHolding, isBusted, ... } }
  // info.hunchPredictions — { die: "HIGH"|"LOW" } if hunch was used
  // info.availableActions — ["roll", "hold", "fold", "cheat", ...]
  // info.pot — current pot size
  // info.heat — your current heat DC for cheating
  // info.roundEvent — current tavern event object (or null)
  // info.bustLimit — bust cap for this round (usually 21, sometimes 22)
  // info.drinkCount / info.liquidCourage / info.isSloppy — tavern drink state
  
  // Return an action object:
  if (myTotal >= 19) return { action: "hold" };
  return { action: "roll", die: 6 };
}

// Register it:
export const STRATEGIES = {
  // ...existing strategies...
  myNew: { fn: myNewStrategy, description: "My new strategy" },
};
```

### Creating a New Mechanic
1. Add state to `emptyTableData()` in headless-engine.mjs
2. Implement the action method on `HeadlessEngine`
3. Add it to `getAvailableActions()` and `getGameInfo()`
4. Have AI strategies use it in ai-players.mjs
5. Run simulations to evaluate

### Programmatic Use (Import as Module)
```javascript
import { SimulationRunner } from "./simulations/simulation-runner.mjs";
import { generateBalanceReport, calculateFunScore } from "./simulations/analysis.mjs";

const runner = new SimulationRunner({
  playerConfigs: [
    { name: "Alice", strategy: "balanced", statTemplate: "rogue" },
    { name: "Bob", strategy: "aggressive", statTemplate: "fighter" },
  ],
  ante: 5,
  roundsPerGame: 10,
});

const { aggregated } = runner.runBatch(1000);
console.log(generateBalanceReport(aggregated));
console.log("Fun Score:", calculateFunScore(aggregated).total);
```

## Presets

| Preset | Description | Players | Games |
|--------|------------|---------|-------|
| `quick` | Fast smoke test | 3 | 50 |
| `stress` | Heavy load test | 5 | 500 |
| `balance` | Class balance check | 5 | 300 |
| `skillTest` | Skill power check | 4 | 300 |
| `depth` | Mixed archetypes + tavern systems | 5 | 300 |
| `chaos` | Edge case finder | 4 | 200 |
| `goblin` | Goblin mode test | 4 | 200 |

## Stat Templates (D&D Classes)

Each simulated player has ability modifiers and skill proficiencies that affect skill check outcomes:

| Template | Best At | Worst At |
|----------|---------|----------|
| `fighter` | Intimidation, STR bumps | Investigation, Sleight of Hand |
| `rogue` | Sleight of Hand, Deception | STR, Intimidation |
| `bard` | Persuasion, Deception | STR, Investigation |
| `wizard` | Investigation, Insight | STR, Intimidation |
| `cleric` | Insight, WIS checks | DEX, Deception |
| `barbarian` | STR bumps, Intimidation | INT, Sleight of Hand |
| `average` | Nothing outstanding | Nothing terrible |
