# Tavern Games - detailed Specification & To-Do

## 1. Technical Architecture & Stability
### State Migration
- [ ] **Migrate to World Settings:**
    -   **Current:** State is stored in a Macro document (`TavernState`).
    -   **Spec:** Move the entire game state object to `game.settings.get('tavern-dice-master', 'gameState')`.
    -   **Implementation:**
        -   Register a world setting `gameState` (scope: world, config: false, type: Object, default: {}).
        -   Update `scripts/state.js` getters/setters to read/write this setting.
        -   Ensure socket updates trigger a `setting` update instead of a `macro` update.

### NPC "Bank" System
- [ ] **Session-Based Wallet:**
    -   **Storage:** Store NPC session wallets inside the central `TavernState` object (e.g., `state.npcWallets = { [actorId]: amount }`).
    -   **Logic:**
        -   On NPC join: Prompt GM for "Buy-In" amount. Set `npcWallets[id] = buyIn`.
        -   `wallet.js`: If actor is NPC/GM, read/write to `state.npcWallets[id]` instead of `actor.system.currency`.
    -   **Cash Out:**
        -   When removing NPC from table: Calculate net change.
        -   **Action:** Do NOT auto-update actor sheet.
        -   **Output:** Post a Chat Message visible to GM: *"NPC Name Cash Out: [Final Amount] gp (Net: +50gp)"*.

## 2. Core Mechanics & Balance
### Remove Passive Perception
- [ ] **Cheat Detection:**
    -   **Remove:** Delete `checkPassivePerception` logic from `cheat.js`.
    -   **New Flow:** Cheating is ONLY caught via:
        -   **Nat 1 (Fumble):** Auto-caught.
        -   **Active Accusation:** Player uses Accuse action.
        -   **Profile Skill:** Player uses Profile skill.
    -   **GM Awareness:** If a cheat is successful (uncaught), send a **Whisper** to the GM: *"Player X successfully cheated (Result: +2)."*

### "Bump" Rework
- [ ] **Targeting Restrictions:**
    -   **Immunity:** Cannot target players who have **Held** or **Folded**.
    -   **Self-Target:** Cannot target self.
    -   **Availability:** If NO valid targets exist (all opponents Held/Folded), the Bump action/button is **Disabled** (greyed out) with a tooltip: *"All targets locked in."*

### "Goad" Rework ("The Dare")
- [ ] **Backfire Mechanic:**
    -   **Condition:** If Goad fails/backfires, Attacker receives **"Dared"** condition.
    -   **Duration:** Immediate (applies to current turn).
    -   **Effect:**
        -   **CANNOT** Buy "Safe" Dice (d4, d6, d8, d10, d12).
        -   **MUST** either:
            1.  **Hit with a d20:** The ONLY allowable purchase.
            2.  **Fold:** Quit the round immediately.

### "Hunch" Rework ("Blind Hit")
- [ ] **Failure Consequence:**
    -   **Mechanic:** On failure, player is forced to **Hit**, but the result is a **Blind Die**.
    -   **Blind Die:**
        -   Value is generated but **Hidden** from State (or flagged as `blind: true`).
        -   **UI:** Display a **"?" icon** or specific "Blind" graphic instead of the die face for EVERYONE (including owner).
        -   **Reveal:** Value is only shown during Phase 4 (Reveal).

## 3. Interaction & UI
### Accuse Rework ("Click-to-Accuse")
- [ ] **Timing:** Available **Anytime** during active play (Phases 2 & 3), not just Staredown.
- [ ] **Targeting Logic:**
    -   **Granularity:** Accusations now target a **Specific Die**.
    -   **Flow:**
        1.  User clicks "Accuse" (or activates Accuse mode).
        2.  UI highlights targetable dice on opponents' boards.
        3.  User clicks a specific die (e.g., Opponent's d8).
        4.  Validation: Check if *that specific die* has a `mod` (cheat flag).
- [ ] **Resolution:**
    -   **True Accusation:** If selected die was cheated -> Cheater pays penalty.
    -   **False Accusation:** If selected die is clean (even if player cheated on *another* die) -> Accuser pays penalty.

### Side Bets
- [ ] **Participants:**
    -   **Who:** Active Players, Folded Players, Busted Players, **Spectators** (Observers).
- [ ] **Wager Source:**
    -   **Funds:** Real Gold deducted from the User's assigned Actor (`wallet.js`).
- [ ] **UI:**
    -   Add a **"Side Bets" Tab** or Panel to the main UI.
    -   Allow selecting a "Champion" (Active Player) to win the pot.
    -   Payouts handled in Phase 6.

## 4. Cleanup
- [ ] **Vestigial Code:**
    -   Remove `scripts/twenty-one.js.bak`.
    -   Remove all "Scan" related code/CSS (replaced by Profile).