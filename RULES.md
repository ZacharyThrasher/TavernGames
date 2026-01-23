# Tavern Twenty-One V3.0 - Comprehensive Rules Manual

**Tavern Twenty-One** is a high-stakes dice gambling game for D&D 5e, played within Foundry VTT. It combines blackjack-style risk management with RPG skill checks, allowing characters to use their stats to cheat, bully, and outwit opponents.

---

## 1. Core Concepts

### The Goal
Reach a **Total of 21** or as close as possible without exceeding it ("Busting").
- **Highest Total ≤ 21 Wins.**
- Ties are settled by a **Duel**.

### The Pot & Economy
- **Ante**: The buy-in cost (Default: 5gp).
- **The Pot**: Holds all antes, die costs, fines, and side bets.
- **Winner Takes All**: The winner claims the entire pot. If multiple winners tie after duels, they split it.

---

## 2. Game Flow

### Phase 1: The Lobby
- **Join**: Players take a seat at the table.
- **GM Start**: The GM initiates the round. Everyone pays the **Ante** automatically.

### Phase 2: The Opening
- **Deal**: Every player rolls **2d10** for free.
  - **Visible Die**: Public knowledge. Determines turn order.
  - **Hole Die**: Private. Only the player knows this value.
- **Turn Order**: Sorted by **Visible Total** (Lowest goes first).
- **The Cut**: The player with the *lowest* visible die gets a special option:
  - **Re-roll Hole Die**: They may freely re-roll their hidden die once to try for a better start.

### Phase 3: The Betting Phase (Main Game)
Players take turns in order. On your turn, you must perform **One Main Action** and may use **One Skill**.

#### Main Actions (Choose One)
1.  **Hit (Buy a Die)**: Add a die to your total.
    - **d20** (½ Ante): High risk. **Special Rule**: Nat 20 = **Instant 21** (Total becomes 21).
    - **d10** (½ Ante): Balanced.
    - **d8/d6** (1× Ante): Standard safety.
    - **d4** (2× Ante): Precision. Expensive but safe.
2.  **Hold**: Lock in your current total. You stop rolling for the round.
    - *You can still be targeted by skills (Bump, Profile).*
3.  **Fold**: Leave the round.
    - **Early Fold** (No actions taken yet): Refund **50% of Ante**.
    - **Late Fold**: No refund.
    - *Folded players are invulnerable (cannot be targeted).*

#### The "Bust"
If your total exceeds 21 at any point, you **BUST**.
- Your turn ends immediately.
- Your Hole Die is revealed.
- You lose your ante and bets.
- You cannot win the pot.

### Phase 4: The Showdown
Once all players have Held, Folded, or Busted:
1.  **Reveal**: All Hole Dice are flipped face-up.
2.  **Accusation Window**: Players have a final chance to **Accuse** cheaters before the winner is declared.

### Phase 5: The Duel (Tie-Breaker)
If two or more players tie for the winning score:
1.  **Hit Count**: The game counts how many times each player "Hit" (bought a die) this round.
2.  **Duel Roll**: Each tied player rolls **1d20 + (1d4 × Hit Count)**.
3.  **Result**: Highest total wins the pot.

---

## 3. Skills & Abilities
**Limit**: You may use **one skill per turn** (Bonus Action).
**Global Limit**: Each skill can be used **once per match/round** per player.

### Goad (CHA)
*Force a timid opponent to act.*
- **Check**: Your **Intimidation/Persuasion** vs Target's **Insight**.
- **Success**: Target becomes **GOADED**.
  - They **MUST Hit** (any die) or **Fold** on their next turn.
  - They *cannot* Hold.
- **Backfire**: You pay **1× Ante** to the pot + You become **DARED**.
  - **DARED Condition**: You **MUST Hit a d8 (Free)** or **Fold** on this turn.
- **Nat 20**: The target cannot pay to resist (Guaranteed effect).
- **Nat 1**: Backfire + Confirmed Dared status.

### Bump the Table (STR)
*Physically disrupt a roll.*
- **Check**: Your **Strength** vs Target's **Strength**.
- **Target**: Any player's die (Visible OR Hole Die).
- **Success**: You force a **Re-roll** of that specific die.
- **Failure**: **Retaliation Lock**.
  - You are locked out of all actions (Hit/Hold/Fold).
  - The Target chooses one of **YOUR** dice to re-roll.
  - Your turn resumes after retaliation.
- **Nat 20**: Re-roll theirs + You get a free re-roll of your own.
- **Nat 1**: Retaliation + You pay **1× Ante** fine.

### Cheat (DEX)
*Secretly fudge the numbers.*
- **Trigger**: Automatic prompt after buying a die.
- **Effect**: Adjust the die value by **±1, ±2, or ±3**.
- **Check**: **Sleight of Hand** vs **Heat DC**.
- **Heat DC**: Starts at **10**. Increases by **+2** for *every* cheat attempt by anyone at the table.
- **Success**: The die changes value secretly.
- **Failure** (Roll < Heat DC): **Modification Fails**.
  - The die does *not* change.
  - Heat still increases.
  - You are **NOT** caught.
- **Nat 20**: **Invisible Cheat**. The Heat DC does not increase.
- **Nat 1**: **CAUGHT!** (Fumble).
  - Instant **BUST** (Disqualified).
  - Lose all current bets.
  - Pay **2× Ante** fine to the pot.

### Hunch / Foresight (WIS)
*Predict the flow of luck.*
- **Check**: **Wisdom** vs DC 15.
- **Success**: You learn if your next roll will be **High** or **Low** *before* you pay for said die.
  - *High/Low Thresholds depend on die size (e.g., d20 median is 10).*
- **Failure**: **Blind Hit**.
  - You are forced to roll a **d4**.
  - The result is **Hidden** (Blind) from you until the end of the round.
- **Nat 20**: You learn the **Exact Value** of the next potential roll.
- **Nat 1**: You are **Locked** into buying a **d20**.

### Profile (INT)
*Read an opponent's tells.*
- **Check**: Your **Investigation** vs Target's **Passive Deception**.
- **Success**: Reveals **Cheat Status**.
  - "Has this player cheated this round? **YES/NO**"
- **Failure**: No information.
- **Nat 20**: Reveals **Specific Die** that was modified (if any).
- **Nat 1**: **Counter-Read**.
  - The Target learns **YOUR** Hole Die value.
  - The Target learns if **YOU** have cheated.

### Iron Liver (CON)
*Pay with your liver instead of gold.*
- **Trigger**: Toggle "Put it on the Tab" in the payment menu.
- **Cost**: 1 Drink per Ante worth of value.
- **Check**: **Constitution Save** vs DC (10 + 2 per drink taken).
- **Success**: The action is free.
- **Failure**: You gain the **SLOPPY** condition.
- **Nat 20**: **Chain Drink**. You assume a triumphant stance and can take another free drink action immediately.
- **Nat 1**: **Pass Out**. Instant **BUST**.

---

## 4. Conditions & Status Effects

### SLOPPY (Drunk)
- **Cause**: Failed Iron Liver check.
- **Effects**:
  1.  **Hole Die Revealed**: You knock over your dice cup. Everyone sees your hole die.
  2.  **Disadvantage**: All Skill Checks (Cheat, Goad, Bump, etc.) are rolled with disadvantage.
  3.  **Immune to Goad**: You are too drunk to be intimidated.

### FOLDED
- **Cause**: Choosing the "Fold" action.
- **Effects**:
  1.  **Untargetable**: Cannot be Goaded, Bumped, or Accused.
  2.  **Out of Round**: Cannot win the pot.
  3.  **Spectator**: Can still place Side Bets.

### DARED
- **Cause**: Failed Goad attempt (Backfire).
- **Effects**:
  1.  **Restricted Options**: You **cannot hold**. You **cannot buy standard dice**.
  2.  **Forced Action**: You must **Buy a d8 (Free)** OR **Fold**.
  3.  **Cleared**: Condition is removed after you roll the d8.

### LOCKED (Retaliation)
- **Cause**: Failed Bump attempt.
- **Effects**:
  1.  **Frozen**: You cannot perform any Main Action.
  2.  **vulnerable**: You must wait for the victim to re-roll one of your dice.
  3.  **Cleared**: Automatically removed after retaliation is resolved.

---

## 5. The Justice System

### Accusations
Any player can accuse another of cheating at any time before the final winner is declared.
- **Cost**: **2× Ante** (Paid upfront).
- **Action**: Select a player and a specific die.
- **Correct Accusation**:
  - You get your 2× Ante back.
  - You receive a **Bounty** (5× Ante or Cheater's entire wallet).
  - The Cheater **Busts** immediately.
- **False Accusation**:
  - You lose your 2× Ante.
  - You are **Disqualified** (Bust).

### Heat
The "Heat" represents the table's suspicion level.
- Starts at **DC 10**.
- Increases by **+2** every time anyone attempts to Cheat (Successful or not).
- Decreases by **-1** at the start of a new round.
- *Visible only to the GM (and via context clues).*

---

## 6. Dice Mechanics Summary

| Die | Cost | Risk Profile | Special Rule |
| :--- | :--- | :--- | :--- |
| **d20** | ½ Ante | Extreme | **Nat 20 = Instant 21** |
| **d10** | ½ Ante | High | Standard Opening Roll |
| **d8** | 1 Ante | Medium | — |
| **d6** | 1 Ante | Low | — |
| **d4** | 2 Ante | Minimal | Precision toll for finishing |
| **Nat 1** | — | — | **Spilled Drink**: Pay 1gp fine |

---

## 7. Edge Cases & FAQ

**Q: What happens if everyone busts?**
A: The pot carries over to the next round ("Rollover"). No one wins.

**Q: Can I cheat on a re-roll?**
A: Yes. Any time you roll, you get a cheat prompt (if you have the gold/resources).

**Q: Can the GM cheat?**
A: If the GM is playing as an NPC (Actor), yes. The "House" (System) does not cheat.

**Q: What if I have no gold?**
A: You can use **Iron Liver** to pay with drinks, or ask the GM for a loan.

**Q: Can I use multiple skills in a turn?**
A: No. One skill per turn.

**Q: Can I use skills when it's not my turn?**
A: No. All skills are actions taken during your turn, except **Accuse** and **Side Bet** which can be done anytime.
