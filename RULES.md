# Tavern Twenty-One V5.5.0 - Comprehensive Rules Manual

**Tavern Twenty-One** is a high-stakes dice gambling game for D&D 5e, played within Foundry VTT. It combines blackjack-style risk management with RPG skill checks.

---

## 1. Core Concepts

### The Goal
Reach a **Total of 21** or as close as possible without exceeding it ("Busting").
- **Highest Total ≤ 21 Wins.**
- Ties are settled by a **Duel**.

### The Pot & Economy
- **Ante**: The buy-in cost (Default: 10gp).
- **The Pot**: Holds all antes, die costs, fines, and side bets.
- **Winner Takes All**: The winner claims the entire pot.

---

## 2. Game Flow

### Phase 1: The Lobby
- **Join**: Players take a seat.
- **GM Start**: Everyone pays the **Ante** automatically.

### Phase 2: The Opening
- **Deal**: Every player rolls **2d10** (1 Visible, 1 Hole).
- **Turn Order**: Lowest visible total goes first.
- **The Cut**: The player with the *lowest* visible die may **Re-roll** their Hole Die once (optional).

### Phase 3: The Betting Phase
Players take turns. On your turn, you must perform **One Main Action** and may use **One Skill**.

#### Main Actions
1.  **Hit (Buy a Die)**: Add a die to your total.
    - **d20** (½ Ante): High risk. **Nat 20** = Instant 21.
    - **d10** (½ Ante): Balanced.
    - **d8** (1× Ante): Standard.
    - **d6** (1× Ante): Low variance.
    - **d4** (2× Ante): Precision.
2.  **Hold**: Lock in your total. Stop rolling.
3.  **Fold**: Leave the round.
    - **Early Fold** (No actions taken): Refund **50% Ante**.
    - **Late Fold**: No refund.

#### The "Bust"
If Total > 21, you **BUST**. You lose your ante and cannot win.

### Phase 4: The Showdown
1.  **Reveal**: All Hole Dice are revealed.
2.  **Staredown**: Players may **Accuse** cheaters (2.5s window).

### Phase 5: The Duel (Tie-Breaker)
If players tie for the highest score:
1.  **Hit Count**: `Total Dice - 2` (Opening Hand).
2.  **Duel Roll**: **1d20 + (1d4 × Hit Count)**.
3.  **Result**: Highest total wins the pot.

---

## 3. Skills (Bonus Actions)
**Limit**: One skill per turn. Each skill once per round per player.

### Goad (CHA)
*Force a timid opponent to act.*
- **Check**: **Intimidation** or **Persuasion** vs Target's **Insight**.
- **Success**: Target **MUST Hit** (any die) or **Fold** next turn. (Cannot Hold).
- **Backfire**: You pay **1× Ante** + become **DARED**.
  - **DARED**: You MUST Hit a **d8 (Free)** or Fold.
- **Nat 20**: Irresistible Goad.
- **Nat 1**: Backfire + Become Dared.

### Bump the Table (STR)
*Physically disrupt a roll.*
- **Check**: **Strength Check** (d20 + STR) vs Target's **Strength Check**.
- **Success**: Re-roll Target's specific die (Old value -> New value).
- **Failure**: **Retaliation**. Target chooses one of *your* dice to re-roll.
- **Nat 1**: Failure + Pay **1× Ante**.

### Cheat (DEX)
*Secretly fudge the numbers.*
- **Check**: **Sleight of Hand** vs **Heat DC**.
- **Heat DC**: Starts at **10**. Increases by **+2** per attempt (Personal).
- **Effect**: Modify die by **±1, ±2, or ±3**.
- **Nat 20**: **Invisible Cheat**. Heat does not increase.
- **Nat 1**: **FUMBLED!** Auto-caught. Pay **2× Ante**. Immediate Bust.

### Foresight (WIS)
*Predict the flow of luck.*
- **Check**: **Wisdom** vs **DC 12**.
- **Success**: Learn if next roll of *each* die type will be **High** or **Low**.
- **Failure**: **Blind Hit**. Forced to roll a **d4** (Value Hidden).
- **Nat 20**: Learn **Exact Values** of next rolls.
- **Nat 1**: **Locked**. Forced to roll a **d20**.

### Profile (INT)
*Read an opponent's tells.*
- **Check**: **Investigation** vs Target's **Passive Deception** (10 + Mod).
- **Success**: Reveal **Cheat Status** (Yes/No).
- **Failure**: No info.
- **Nat 20**: Reveal Cheat Status + **Specific Die**.
- **Nat 1**: **Counter-Read**. Target learns *your* Cheat Status & Hole Die.

### Iron Liver (CON)
*Pay with your liver.*
- **Trigger**: "Put it on the Tab".
- **Check**: **CON Save** vs **DC 10 + (2 × Drinks Taken)**.
- **Success**: Action is Free. Drink Count +1.
- **Failure**: **SLOPPY**. Disadvantage on INT/WIS/CHA/DEX checks.
- **Nat 1**: **Pass Out**. Instant **BUST**.


---

## 4. Skill Mechanics Summary

| Skill | Success Effect | Failure / Backfire | Nat 20 (Crit Success) | Nat 1 (Crit Fail) |
| :--- | :--- | :--- | :--- | :--- |
| **Goad** (CHA) | Target **MUST Hit** or **Fold**. | You pay **1× Ante** + become **DARED** (Must Hit d8/Fold). | Target cannot resist. | Backfire + **DARED** confirmed. |
| **Bump** (STR) | Target re-rolls specific die. | **Retaliation**: Target re-rolls *your* die. | Re-roll theirs + **Free re-roll** for you. | Retaliation + Pay **1× Ante**. |
| **Cheat** (DEX) | Die value changes (±1 to ±3). | Cheat fails (Value unchanged). Heat +2. | **Invisible Cheat** (No Heat increase). | **CAUGHT!** Pay **2× Ante**. **BUST**. |
| **Foresight** (WIS) | Predict **High/Low** for next roll. | **Blind Hit** (Roll d4, value hidden). | Predict **Exact Value**. | **Locked** into **d20** Hit. |
| **Profile** (INT) | Reveal **Cheat Status** (Yes/No). | No information. | Reveal **Specific Die** cheated. | **Counter-Read** (Target learns your Hole Die + Cheat Status). |
| **Iron Liver** (CON) | Free Action. Drink count +1. | **SLOPPY** (Disadvantage on mental/dex checks). | **Chain Drink** (Free drink + another action). | **Pass Out** (**BUST**). |

---

## 5. Justice System

### Accusations
- **Cost**: **2× Ante**.
- **Action**: Select a player and a **Specific Die**.
- **Mechanic**: **Pure Deduction**. (No Roll).
- **Correct**: Refund 2× Ante + Reward (5× Ante or Wallet). Target Busts.
- **Incorrect**: Lose 2× Ante. You Accuser Busts (Disqualified).

---

## 5. Side Bets
- **Timing**: Anytime during betting phase.
- **Payout**: **1:1** (Pays 2× Stake).
- **Condition**: If Champion wins, you get paid. If Champion loses, house keeps stake.
