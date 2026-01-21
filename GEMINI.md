# Tavern Games (Twenty-One) - Module Memory

## Architecture Overview
- **Type:** FoundryVTT Module (v11+ ApplicationV2).
- **System:** Designed for `dnd5e` but architecturally distinct.
- **State Management:** Unique "GM-Server" pattern.
    -   Global state is stored in a **Foundry Macro** document named `"TavernState"` within `flags['tavern-dice-master']`.
    -   State updates trigger standard Foundry `updateMacro` hooks, causing all clients to re-render.
- **Networking:** Uses `socketlib`.
    -   Clients interact via `tavernSocket.executeAsGM(action, payload)`.
    -   GM executes logic, updates State (Macro), and changes propagate.

## Core Game Mechanics: "Twenty-One"
A Blackjack-style dice game with RPG skill integration. Goal: Closest to 21 without going over.

### Phases
1.  **Opening:**
    -   Players pay **Ante** (Configurable).
    -   Dealt **2d10**: 1 Public (Visible), 1 Hole (Hidden).
2.  **The Cut (V3):**
    -   Player with the lowest visible die gets option to re-roll their Hole die.
3.  **Betting / Turns:**
    -   Turn-based loop.
    -   **Actions:**
        -   **Roll/Hit:** Buy a die (d4, d6, d8, d10, d20). Costs vary (d4=2x Ante, d20=Free/Cheap).
        -   **Hold:** Stop rolling.
        -   **Fold:** Quit round (Partial refund if early).
        -   **Skills:** Use character skills (see below).
4.  **Reveal:** All dice shown.
5.  **Inspection / Staredown:**
    -   Opportunity to **Accuse** cheaters (Cost: 2x Ante).
    -   Success: Refund + Bounty (5x Ante).
    -   Fail: Lose fee.
6.  **Payout:** Winner(s) split pot.
    -   **Duel:** If tied, entering a "Duel" sub-game (Roll d20 + Stat vs Opponent).

### Economy
-   Directly integrates with `actor.system.currency.gp`.
-   **Liquid Mode (Iron Liver):** Players can pay for actions by "Drinking" (Con Save) instead of Gold.
-   **NPC Support:** Supports GM playing as NPC (uses NPC actor currency/skills).

### Cheating & Skills
**Cheating:**
-   **Mechanic:** Modify a just-rolled die by ±1 to ±3.
-   **Types:** Physical (Sleight of Hand/Deception) or Magical (Int/Wis/Cha).
-   **Detection:** Checks vs **Heat DC** (Starts 10, +2 per cheat).
    -   **Nat 20:** Invisible Cheat (No Heat increase).
    -   **Nat 1:** Auto-Caught (Fumble).
    -   **Failure:** Not immediately caught, but whispers "Gut Feeling" to high-perception players.

**Active Skills (Limit 1 per turn):**
1.  **Bump (Athletics):** Bonus Action. Contest STR vs STR.
    -   Win: Force reroll of target's die.
    -   Lose: Target chooses one of *your* dice to reroll.
2.  **Profile (Investigation):** Contest vs Passive Deception.
    -   Win: Learn value of target's Hole die.
    -   Lose: Target learns *your* Hole die.
3.  **Goad (Intimidation/Persuasion):** Contest vs Insight.
    -   Win: Force target to Hit (Roll).
    -   Lose: You must Hit.
4.  **Hunch:** Predict next roll for bonuses.

## Codebase Structure
-   **Entry:** `scripts/main.js`
-   **UI:** `scripts/app/tavern-app.js` (Handlebars Application)
-   **State:** `scripts/state.js`
-   **Logic:** `scripts/twenty-one/`
    -   `phases/core.js`: Round lifecycle (Start/Reveal/End).
    -   `phases/turn.js`: Player actions (Roll, Hold, Fold).
    -   `phases/special.js`: Cut, Duel, Accuse.
    -   `skills/`: Individual skill files (`cheat.js`, `bump.js`, `profile.js`, etc).
-   **Constants:** `scripts/twenty-one/constants.js` (DCs, Die Costs).

## Known Issues / Vestigial Code
-   **Scan:** The "Scan" mechanic (V2) is present in `scripts/app/tavern-app.js` (methods `onScan`, `_prepareContext` logic) and `styles/tavern.css` but is functionally deprecated/replaced by **Profile** (V3). It is not registered in the UI actions map, effectively making it dead code.
-   **Backup File:** `scripts/twenty-one.js.bak` exists as a legacy artifact.
