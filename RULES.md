# Tavern Twenty-One V2.0 - Rules

A dice gambling game for your D&D tavern scenes. Roll polyhedral dice to reach 21 without going over!

---

## Basic Rules

### Goal
Roll polyhedral dice to get as close to **21** as possible without going over.

### Setup
1. Players join the table and pay an **ante** (default: 5gp)
2. The GM starts the round

### Dice & Costs (V2.0)
| Die | Cost | Strategy |
|-----|------|----------|
| **d20** | FREE | High risk, high reward "Hail Mary" |
| **d10** | ½ ante | Balanced "Builder" |
| **d8** | 1× ante | Standard play |
| **d6** | 1× ante | Standard play |
| **d4** | 2× ante | Precision play, low variance |

*Note: d12 removed in V2.0 for balance*

### Gameplay

**Opening Round**
- Each player rolls **2 dice** of their choice (FREE)
- First die is **visible** to all, second is a **hole die** (hidden until reveal)

**Betting Round**
- Players take turns **sorted by visible total** (lowest goes first)
- On your turn, choose to:
  - **Roll** another die (pay the die's cost)
  - **Hold** and keep your current total

**Special Rolls**
- **Natural 20**: Instant 21! (Automatic win condition)
- **Natural 1**: Spilled drink! Pay 1× ante cleaning fee at round end

**Busting**
- If your total exceeds 21, you **bust** and are out of the round
- Your dice are revealed immediately when you bust

### Winning
- After all players hold or bust, dice are revealed (The Staredown)
- Highest total **21 or under** wins the pot
- **Ties → The Duel** (see below)

---

## Special Actions

### Cheat (V2.0)
*Secretly change one of your dice to any value*

**Two types:**
- **Physical**: Sleight of Hand OR Deception
  - Sets the **Tell DC** (detected by Insight)
  - **FUMBLE**: Roll < 10 = auto-caught immediately!
- **Magical**: INT/WIS/CHA (spellcasting ability)
  - Sets the **Residue DC** (detected by Arcana)
  - Cannot fumble

**Risk**: The GM is whispered your cheat details. Other players can Scan or Accuse you!

---

### Scan (V2.0)
*During the Staredown phase only*

Investigate a player for cheating.

- **Cost**: 1× ante per target
- **Skill**: Insight (vs Tell DC) or Arcana (vs Residue DC)
- **Success**: Whisper reveals cheat type + location (visible/hole), but NOT the value
- Can scan multiple targets (pay for each)

---

### Accuse (V2.0)
*During the Staredown phase only*

Point the finger at someone you suspect of cheating.

- **Cost**: 2× ante (paid upfront)
- **No skill roll required** - direct accusation
- **Correct**: Refund your 2× ante + receive **5× ante bounty**!
- **Wrong**: You lose your 2× ante fee

Only **one accusation** per round.

---

### Goad (V2.0)
*Replaces Intimidate*

Try to force another player to ROLL (even if they're holding!).

- **When**: Betting phase only
- **Attacker**: Intimidation OR Persuasion
- **Defender**: Insight
- **Success**: Target MUST roll a die (even if holding!)
- **Backfire**: Attacker must roll instead
- **Limit**: Once per round, per player
- **Can target**: Anyone not busted (including holders!)

---

### Bump the Table
*Athletics vs Dexterity Save*

Jostle the table to force an opponent to re-roll one of their dice.

- **Success**: You choose which of their dice gets re-rolled
- **Failure (Retaliation)**: THEY choose which of YOUR dice gets re-rolled
- **Limit**: Once per round, per player
- **Can target**: Anyone with dice (including holders!)
- **V2.0**: Can target a player's **hole die** by selecting it during the bump

---

## The Duel (V2.0)

When two or more players tie for the winning total:

1. **GM rolls 1d6** to determine contest type:
   - 1 = Strength, 2 = Dexterity, 3 = Constitution
   - 4 = Intelligence, 5 = Wisdom, 6 = Charisma
2. Each tied player rolls **1d20 + ability modifier**
3. **Highest total wins the pot**
4. If still tied → Re-duel with new contest type!

---

## Game Phases

| Phase | What Happens |
|-------|--------------|
| **Lobby** | Players join, GM sets ante |
| **Opening** | Everyone rolls 2 dice (1 visible, 1 hole) |
| **Betting** | Take turns rolling or holding (by visible total) |
| **Staredown** | Dice revealed, Scan and Accuse available |
| **Duel** | Tie-breaker ability contest (if tied) |
| **Payout** | Winner(s) collect the pot |

---

## Quick Reference

| Action | Cost | When | Limit |
|--------|------|------|-------|
| Roll d20 | FREE | Your turn | — |
| Roll d10 | ½ ante | Your turn | — |
| Roll d6/d8 | 1× ante | Your turn | — |
| Roll d4 | 2× ante | Your turn | — |
| Hold | — | Betting phase | — |
| Cheat | — | Have dice | — |
| Scan | 1× ante | Staredown | — |
| Accuse | 2× ante | Staredown | 1 per round |
| Goad | — | Betting phase | Once/round |
| Bump Table | — | Betting phase | Once/round |

---

## Iron Liver Rules (V2.0.2)

### Liquid Currency ("Put it on the Tab")
High-constitution characters can use their liver to pay for actions when gold is tight.

- **Action**: Toggle the **"Put it on the Tab"** button in your controls. When active, buying a die will charge your liver instead of gold.
- **Restriction**: You must pay **gold** for Scans and Accusations.
- **Cost**: 1 Drink per Ante required.
- **The Roll**: Make a **Constitution Save**.
  - **DC**: 10 + (2 × Drinks taken this round)
  - **Success**: The drink goes down smooth. The action is free!
  - **Failure**: You gain the **Sloppy** condition.
  - **Natural 1**: You pass out immediately! This counts as a **Bust**.

### The "Sloppy" Condition
Alcohol impairs your judgment and fine motor skills.
- **Effect**: You have **Disadvantage** on all Intelligence, Wisdom, Charisma, and Dexterity checks.
- **Impacts**:
  - **Cheating**: Roll 2d20 drop highest (harder to cheat).
  - **Scanning**: Roll 2d20 drop highest (harder to spot cheaters).
  - **Goading**: Roll 2d20 drop highest (harder to intimidate/persuade).
  - **Resisting Goad**: Roll 2d20 drop highest (easier to be goaded).
- **Duration**: Lasts until the end of the round.

### Immovable Object (Bump Defense)
When someone tries to **Bump the Table** against you:
- You may defend with **Constitution Save** OR **Dexterity Save** (whichever modifier is higher is automatically used).
- Being "Sloppy" gives disadvantage on Dexterity saves, but not Constitution saves!

---

## Tips

- **d20 is free but risky** - Use for opening or desperate plays
- **d4 costs double but is safe** - Great for precision finishing
- **Watch visible totals** - Turn order is based on what you can see
- **Hole dice hide your true total** - Use them strategically
- **Scan before you Accuse** - 1× ante is cheaper than 2× ante + being wrong
- **Goad can force holders to bust** - Powerful late-game move
- **The Duel favors high ability scores** - Choose your battles wisely

---

*May fortune favor the bold... and the clever.*
