# Tavern Twenty-One — Rules (Current)

This document reflects the **current behavior of the code**.

---

## 1) Core Concepts

### Goal (Standard Mode)
- Reach the **highest total ≤ 21** without busting.
- Ties are settled by a **Duel**.

### The Pot & Economy
- **Ante**: Buy‑in paid by each player at round start.
- **House match**:
  - If the GM is acting as **House** (not playing as an NPC), the House matches all non‑GM antes.
  - If the GM is **playing as an NPC**, there is **no house match** — everyone antes equally.
- **Cleaning fee**: Any **natural 1** (standard mode) adds **1gp** to your cleaning fees. Fees are collected at payout and **added to the pot**.

---

## 2) Standard Mode — Round Flow

### Phase A: Lobby → Start Round
- Players join; GM starts the round.
- Ante is collected and the pot is created (including any house match).

### Phase B: Opening (Standard Only)
- Each player rolls **2d10**: one **visible** and one **hole**.
- **Turn order** is sorted by **lowest visible total** first.
- **The Cut**: the player with the **lowest visible die** may **re‑roll their hole die once** (optional).

### Phase C: Betting
On your turn, choose **one main action** and you may use **one skill**.

**Roll (Buy a Die)**
- Costs (multiplier of ante):
  - **d20 = 0.5×**, **d10 = 0.5×**, **d8 = 1×**, **d6 = 1×**, **d4 = 2×**.
- **d20 natural 20** sets your roll to **exactly hit 21** (it becomes `21 - current total`).
- **Natural 1** adds a **1gp cleaning fee**.
- If your total exceeds 21, you **bust** (resolved after any cheat decision).

**Hold**
- Lock your total and stop rolling.
- Not allowed if you are **goaded**, **foresight‑locked**, or **pending bump retaliation**.

**Fold**
- Leave the round.
- **Early fold** (no actions taken yet) refunds **50% of ante**.
- **After any action** (roll or skill), no refund.

### Phase D: Reveal → Staredown
- Hole dice are revealed.
- **Accusations** are available during active round phases (the UI shows valid targets).

### Phase E: Duel (Tie‑Breaker)
If multiple players tie for the highest valid total:
- **Duel roll** = **1d20 + (1d4 × Hit Count)**.
- **Hit Count** = `total dice rolled - 2` (opening dice).
- Ties repeat until a single winner remains.

### Phase F: Payout
- Winner receives the **final pot** (including cleaning fees).
- Side‑bet payouts are processed.

---

## 3) Skills (Bonus Actions)
**Limits**
- **One skill per turn** and **once per round** per player.
- Skills are **betting‑phase only**, **on your turn**.
- If you are **Sloppy**, all skill checks are at **disadvantage**.

### Goad (CHA)
- **Check**: Intimidation **or** Persuasion vs target’s **Insight**.
- **Success**: Target **must roll** (cannot hold).
- **Failure/Backfire**: **You** must roll.
- **Nat 20**: Target is **forced to roll a d20**.
- **Nat 1**: You are **forced to roll a d20**.
- **Ties** count as defender wins.

### Bump the Table (STR)
- **Check**: STR vs target’s STR.
- **Success**: Re‑roll **a chosen target die** (visibility is preserved).
- **Failure**: **Retaliation** — target chooses one of your dice to re‑roll.
- **Nat 1**: Auto‑fail **and pay 1× ante** into the pot.

### Cheat (DEX)
- **Check**: **Sleight of Hand** vs your **Personal Heat DC**.
- **Heat** starts at **Starting Heat** (default 10) and **+2 per cheat** (unless Nat 20).
- **Effect**: Modify one of your dice by **±1, ±2, or ±3** (clamped to valid die range).
- **Nat 20**: **Invisible cheat** (no heat increase).
- **Nat 1**: **Caught**, pay **1× ante**, and you are **disqualified** (caught).
- **Requires at least 2 non‑house players** to attempt.
- **Cannot cheat** if your roll is **blind**.

### Foresight (WIS)
- **Check**: WIS vs **DC 12**.
- **Success**: Learn **HIGH/LOW** for the next roll of **each die type** (private).
- **Nat 20**: Learn **exact values** for each die type (private).
- **Failure**: Your **next roll is blind** (hidden, even to you, until reveal).
- **Nat 1**: Locked into a **blind d20** roll.

### Profile (INT)
- **Check**: Investigation vs target **Passive Deception** (10 + mod).
- **Success**: Learn if the target **has cheated** (any attempt).
- **Nat 20**: Also reveals **which die indices** they cheated.
- **Failure**: No info.
- **Nat 1**: **Backfire** — target learns **your hole die value** and **whether you cheated**.

### Bump Retaliation
- If your bump is caught, the target selects **one of your dice** to re‑roll.

---

## 4) Accusations (Justice System)
- **Cost**: **2× ante**.
- **Action**: Choose a **target** and a **specific die**.
- **Correct**: Accuser gets **refund + bounty** (5× ante taken from target if possible). Target is **caught**.
- **Incorrect**: Fee is **added to the pot**; no bust.

Caught players are **disqualified from winning**.

---

## 5) “Put It on the Tab” (Iron Liver)
When paying roll costs, you can choose to drink instead of paying gold (if Liquid Mode is enabled and you are not Sloppy).

- **Drinks needed** = `ceil(cost / ante)`.
- **CON save** vs **DC 10 + 2×(total drinks this round)**.
- **Success**: Cost waived.
- **Failure**: **Sloppy** (disadvantage on checks) and **hole die is revealed**.
- **Nat 1**: **Pass out** → **Bust**.
- If you become Sloppy, the tab is **cut off** for the rest of the round.

---

## 6) Side Bets
- Allowed during **active betting** for the **first two full betting rounds**.
- **Minimum bet**: **1× ante**.
- You may bet on **yourself**.
- **Pool payout**: Winners split the pool **proportionally** to their bet size.

---

## 7) Goblin Mode (New Section)
Goblin mode is a high‑variance ruleset with no skill use and no 21 cap.

### Core Rules
- **No Opening / Cut**: The round starts directly in betting order.
- **No Skills**: Goad, Bump, Cheat, Foresight, Profile, Accuse are disabled.
- **No Tab**: All rolls are free; no drink payments.
- **Multiple Rolls per Turn**: You may roll **multiple dice on your turn**.
- **Die Usage**:
  - **d4, d6, d8, d10, d20** can each be rolled **once per full set**.
  - **Full Set Reset**: After rolling **all non‑coin dice** once, your used‑dice lock resets.
  - **Every die can explode** on its **maximum value** (you may roll that die again).
- **Rolling a 1**:
  - A **1 does not bust** you.
  - Rolling a **1 ends your turn immediately**.
- **Coin (d2)**:
  - **Heads (2)** → **double** your total.
  - **Tails (1)** → **set your score to 1** (and end your turn).
- **Hold Countdown**:
  - When a player **Holds**, a **final‑round countdown** starts.
  - **Each player gets one more turn** to beat the held score.
- **Winner**: **Highest total wins** (no 21 cap).

---

If you want this rules doc to match a specific public release version label, tell me which version number you want in the title.
