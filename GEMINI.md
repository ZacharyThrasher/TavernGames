# Tavern Games (Twenty-One) - Module Memory

## Architecture Overview
- **Type:** FoundryVTT Module (v11+ ApplicationV2).
- **System:** Designed for `dnd5e` but architecturally distinct.
- **State Management:** **V4 Architecture (Current)**
    -   Global state is stored in **World Settings** (`game.settings.get('tavern-dice-master', 'gameState')`).
    -   State updates trigger standard Foundry `updateSetting` hooks, causing all clients to re-render.
- **Networking:** Uses `socketlib` for client-server interaction.

## Core Game Mechanics: "Twenty-One"
A Blackjack-style dice game with RPG skill integration.

### Phases
1.  **Opening:** Ante up. Dealt 2d10 (1 Public, 1 Hole).
2.  **The Cut:** Lowest visible die can reroll Hole die.
3.  **Betting / Turns:**
    -   **Actions:** Hit (Buy d4-d20), Hold, Fold, **Skills**.
    -   **Skills (V4):**
        -   **Bump:** STR contest. Immune if target Held.
        -   **Goad:** CHA contest. Backfire = "Dared" (Must hit d20 or Fold).
        -   **Hunch:** Predict next roll. Failure = Blind Hit.
        -   **Cheat:** Sleight/Magic to mod die. GM alerted on success.
        -   **Profile:** Investigation vs Deception. Reveals IF target cheated (Yes/No).
    -   **Side Bets:** Back a player to win for 2:1 payout.
4.  **Reveal:** All dice shown.
5.  **Inspection / Staredown:** Accuse cheaters (Specific Die targeting).
6.  **Duel (Tie-Breaker):** 1d20 + 1d4 per Hit. Highest total wins. Ties trigger re-duel.
7.  **Payout:** Winner takes pot.

### Economy
-   **PC:** Uses `actor.system.currency.gp`.
-   **NPC/GM:** **V4 NPC Bank**
    -   Funds stored in `state.npcWallets`.
    -   GM Join Dialog allows setting "Buy-In".
    -   App Header displays NPC Wallet balance.
    -   "Cash Out" summary posted to GM on leave.
-   **Liquid Mode:** Pay with CON saves (Liver) instead of Gold.

## Codebase Structure
-   **Entry:** `scripts/main.js` (Includes Handlebars helper registration)
-   **UI:** `scripts/app/tavern-app.js`
-   **State:** `scripts/state.js`
-   **Logic:** `scripts/twenty-one/`
    -   `phases/`: `core.js`, `turn.js`, `special.js`, `side-bets.js`.
    -   `skills/`: Individual skill logic.

## Current Status (V4 Refactor Complete)
- [x] State Migration to World Settings.
- [x] NPC Bank System (Wallet, UI, Cash-Out).
- [x] Skill Reworks (Profile, Bump, Goad, Hunch).
- [x] Accuse Rework (Specific die targeting).
- [x] Duel Rework (Hits-based only).
- [x] Side Bets Implementation.
- [x] Cleanup of Scan & Legacy files.
