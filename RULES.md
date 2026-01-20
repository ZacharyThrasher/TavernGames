# Tavern Twenty-One V3.0 - Rules

A dice gambling game for your D&D tavern scenes. Roll polyhedral dice to reach 21 without going over!

---

## Basic Rules

### Goal
Roll polyhedral dice to get as close to **21** as possible without going over.

### Setup
1. Players join the table and pay an **ante** (default: 5gp)
2. The GM starts the round

### Dice & Costs
| Die | Cost | Strategy |
|-----|------|----------|
| **d20** | ½ ante | High risk, high reward |
| **d10** | ½ ante | Balanced play |
| **d8** | 1× ante | Standard play |
| **d6** | 1× ante | Standard play |
| **d4** | 2× ante | Precision play, low variance |

---

## Gameplay

### Opening Round
- Each player automatically rolls **2d10** (free)
- First die is **visible** to all, second is a **hole die** (hidden until reveal)
- **The Cut**: The player with the **lowest visible die** may re-roll their hole die once (free)

### Turn Order
- Players take turns **sorted by visible total** (lowest goes first)
- Turn order is recalculated at the **end of each round**

### On Your Turn

**Main Action** (required — choose one):
- **Hit**: Roll another die (pay the die's cost)
- **Hold**: Keep your current total and stop rolling
- **Fold**: Exit the round (see Folding rules)

**Bonus Action** (optional — one per turn):
- Use a Skill: Goad, Bump, Cheat, Iron Liver, Hunch, or Profile

*You must Hit, Hold, or Fold every turn. Skills are used in addition to your main action.*

### Special Rolls
- **Natural 20**: Instant 21! (Automatic win condition)
- **Natural 1**: Spilled drink! Pay 1× ante cleaning fee at round end

### Busting
- If your total exceeds 21, you **bust** and are out of the round
- Your dice are revealed immediately when you bust

### Folding
- **Early Fold** (no Hits or Skills used): Receive **50% ante** back
- **Late Fold** (after any Hit or Skill): No refund
- **Benefit**: Folded players become **untargetable** — cannot be Goaded, Bumped, or Accused

### Winning
- After all players hold, fold, or bust, dice are revealed (**The Showdown**)
- Highest total **21 or under** wins the pot
- **Ties → The Duel** (see below)

---

## Skills (One Per Ability)

Each skill has special outcomes for Natural 20 and Natural 1 rolls.

---

### Goad (CHA)
*Intimidate or persuade another player into rolling.*

- **When**: Your turn only
- **Roll**: Your Intimidation/Persuasion vs their Insight
- **Success**: Target must choose:
  - **Comply**: Roll a die (forced Hit)
  - **Resist**: Pay **1× ante** to the pot and ignore the Goad
- **Backfire**: You pay **1× ante** to the pot
- **Nat 20**: Target **cannot pay to resist** — must roll
- **Nat 1**: Backfire + you must also roll (forced Hit)
- **Limit**: Once per round, per player
- **Note**: Sloppy and Folded players cannot be Goaded

---

### Bump the Table (STR)
*Jostle the table to force an opponent to re-roll one of their dice.*

- **When**: Your turn only
- **Roll**: Your Strength vs their Strength
- **Success**: You choose which of their dice gets re-rolled
- **Failure**: They choose which of YOUR dice gets re-rolled
- **Nat 20**: Re-roll one of theirs + re-roll one of YOUR dice (your choice)
- **Nat 1**: They re-roll one of yours + you pay **1× ante**
- **Limit**: Once per round, per player
- **Can target**: Anyone with dice (including holders, but not folded players)

---

### Cheat (DEX)
*Secretly adjust one of your dice by up to ±3.*

- **When**: Your turn only, immediately after rolling (before reveal)
- **Adjustment**: Add or subtract up to 3 from the die's value
  - *Values are clamped to the die's range (d6 can't become 0 or 7)*
- **Roll**: Sleight of Hand vs **Heat DC**
- **Success**: Adjustment applied secretly
- **Fumble** (roll below DC): Caught immediately — you **bust**!
- **Nat 20**: No Heat added (the perfect crime)
- **Nat 1**: Caught + pay **2× ante** fine to the pot

#### Heat Mechanic
The table gets "hotter" as more cheating occurs:
- **Starting DC**: 10
- **First cheat of the round**: No DC increase (but still roll)
- **Each subsequent cheat**: DC increases by **+2**
- **Each new round**: DC decreases by **-1**

*The Heat DC is hidden from players.*

---

### Iron Liver (CON)
*Pay for dice with drinks instead of gold.*

- **When**: Toggle "Put it on the Tab" before rolling
- **Cost**: 1 Drink per ante required
- **Roll**: Constitution Save
  - **DC**: 10 + (2 × Drinks taken this round)
- **Success**: Drink goes down smooth — action is free!
- **Failure**: Gain the **Sloppy** condition
- **Nat 20**: Chain drink — immediately take another free drink action
- **Nat 1**: Pass out — instant **bust**!

#### The Sloppy Condition
- **Cannot be Goaded** (too drunk to care)
- **Reveal your hole die** to all players
- **Disadvantage** on all skill checks
- **Duration**: Lasts until end of round

---

### Hunch (WIS)
*Trust your gut about your next roll.*

- **When**: Your turn only
- **Roll**: Wisdom check (DC set by GM, typically 12-15)
- **Success**: Learn if your next Hit will be **high or low** (above/below median)
  - *You learn this BEFORE choosing which die to roll*
- **Failure**: Locked into a Hit — you MUST roll before your turn ends
- **Nat 20**: Learn the **exact value** of your next Hit before rolling
- **Nat 1**: Locked into a Hit with a **d20** specifically

#### High/Low Thresholds
| Die | Low | High |
|-----|-----|------|
| d4 | 1-2 | 3-4 |
| d6 | 1-3 | 4-6 |
| d8 | 1-4 | 5-8 |
| d10 | 1-5 | 6-10 |
| d20 | 1-10 | 11-20 |

---

### Profile (INT)
*Read your opponent to learn their secrets.*

- **When**: Your turn only
- **Roll**: Your Investigation vs their Deception
- **Success**: Learn their **hole die** value
- **Failure**: They learn YOUR hole die value
- **Nat 20**: Learn their hole die + whether they've **cheated** (and which die)
- **Nat 1**: They learn your hole die + whether YOU've cheated

---

## Accuse

*Point the finger at someone you suspect of cheating.*

- **When**: Any time before the Showdown (not just your turn)
- **Cost**: 2× ante (paid upfront)
- **How**: Specify the player AND which die you believe was cheated
- **Correct Accusation**:
  - Refund your 2× ante
  - Receive **5× ante** from the cheater (or all their gold if they can't afford it)
  - The cheater **busts**
- **Wrong Accusation**:
  - Lose your 2× ante
  - You are **disqualified** from the round (cannot win)
- **Limit**: One accusation per player, per round

---

## Side Bet

*Even spectators can join the action!*

- **When**: Any time during the round
- **Who**: Any player (including folded players and spectators)
- **Cost**: 1× ante
- **How**: Bet on which active player will win the round
- **Correct**: Receive **2× ante** return
- **Wrong**: Lose your bet

---

## The Duel

When two or more players tie for the winning total:

1. Each tied player counts their **total Hits** taken this round
2. Each tied player rolls **1d20 + 1d4 per Hit**
3. **Highest total wins** the pot
4. If still tied → Re-duel until resolved!

*Example: Player A took 3 Hits → rolls 1d20 + 3d4. Player B took 5 Hits → rolls 1d20 + 5d4.*

---

## Game Phases

| Phase | What Happens |
|-------|--------------|
| **Lobby** | Players join, GM sets ante |
| **Opening** | Everyone rolls 2d10 (1 visible, 1 hole), The Cut |
| **Betting** | Take turns: Hit, Hold, Fold, or use Skills |
| **Showdown** | Dice revealed, Accusations resolved |
| **Duel** | Hits-based tiebreaker (if tied) |
| **Payout** | Winner(s) collect the pot |

---

## Quick Reference

### Actions
| Action | Cost | When | Limit |
|--------|------|------|-------|
| Hit (d20/d10) | ½ ante | Your turn | — |
| Hit (d6/d8) | 1× ante | Your turn | — |
| Hit (d4) | 2× ante | Your turn | — |
| Hold | — | Your turn | — |
| Fold | — | Your turn | — |
| Accuse | 2× ante | Any time | 1/round |
| Side Bet | 1× ante | Any time | — |

### Skills
| Skill | Ability | Nat 20 | Nat 1 |
|-------|---------|--------|-------|
| Goad | CHA | Can't pay to resist | Backfire + forced Hit |
| Bump | STR | Also re-roll your die | They re-roll yours + 1× ante |
| Cheat | DEX | No Heat added | Caught + 2× ante fine |
| Iron Liver | CON | Chain drink | Pass out (bust) |
| Hunch | WIS | Exact value | Locked into d20 Hit |
| Profile | INT | + Cheat detection | They learn if you cheated |

### Conditions
| Condition | Effects |
|-----------|---------|
| **Sloppy** | Can't be Goaded, hole die revealed, disadvantage on skills |
| **Folded** | Untargetable, can't win, can place Side Bets |

---

## Tips

- **Opening Cut** — If you rolled low visible, take the free hole re-roll
- **d20 is cheap but dangerous** — Great for desperation plays
- **d4 costs double but is precise** — Perfect for finishing near 21
- **Watch visible totals** — Turn order tells you who's ahead
- **Profile before you Accuse** — Information is cheaper than being wrong
- **Goad can force holders to bust** — Powerful late-game disruption
- **First cheat is safest** — Heat builds fast after that
- **The Duel favors active players** — More Hits = more d4s in tiebreakers

---

*May fortune favor the bold... and the clever.*
