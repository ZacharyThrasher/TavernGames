# Tavern Games (Twenty-One) - Codebase Report
**Generated for AI Assistant Context (v5.14.4)**

## 1. Architecture Overview
This module implements a multiplayer dice game ("Twenty-One") within **FoundryVTT**. It uses a **State-Driven Architecture**.

### Core Principles
1.  **Single Source of Truth:** `game.settings.get('tavern-dice-master', 'gameState')`
    *   This is a World Setting (synced to all clients/server).
    *   All game logic updates this setting.
    *   Updates trigger a hook `updateSetting` which re-renders the UI on all clients.
2.  **SocketLib:** Used for secure GM-only actions or broadcasting visuals.
    *   Players request actions (e.g., "Roll Die") via Socket to GM (usually) OR direct state update if allowed.
    *   Currently, **most logic is Client-Side** but validated, then updates the State via `updateState` helper (which handles the socket/setting write).
3.  **ApplicationV2:** The UI (`TavernApp`) extends `ApplicationV2` and renders via Handlebars.

---

## 2. State & Data Model
The `gameState` object contains:
*   `status`: "LOBBY", "PLAYING", "INSPECTION", "REVEALING", "PAYOUT", "DUEL"
*   `players`: Map of `{ userId: { id, name, playingAsNpc, ... } }`
*   `pot`: Current GP in the pot.
*   `tableData`: The core round data (reset every round).

### `tableData` Schema
```javascript
{
  phase: "opening" | "betting" | "cut",
  gameMode: "standard" | "goblin", // v5.14.0
  currentPlayer: "userId",
  
  // Game State Maps (Key: userId)
  rolls: { "userId": [ { die: "20", result: 5, public: boolean, blind: boolean } ] },
  totals: { "userId": 15 },       // Current score
  visibleTotals: { "userId": 5 }, // Score visible to others
  
  // Flags
  busts: { "userId": true },      // Did they go over 21 (or Nat 1 in Goblin)?
  holds: { "userId": true },      // Did they stop rolling?
  folded: { "userId": true },     // Did they quit?
  hasActed: { "userId": true },   // Have they done anything this phase?
  
  // Special Tracking
  usedDice: { "userId": [20, 10] }, // Goblin Mode: Allowed dice tracking
  dared: { "userId": true },        // Goad/Dare mechanic
  hunchLocked: { "userId": true },  // Foresight failure lock
}
```

---

## 3. Key Logic Flows

### Turn Logic (`scripts/twenty-one/phases/turn.js`)
*   **`submitRoll(payload, userId)`**: The heart of the game.
    *   Validates turn, funds, and rules.
    *   **Standard Mode:** Checks cost, deducts gold, rolls dice, adds to total.
    *   **Goblin Mode:** Checks `usedDice`, rolls (free), checks for **Nat 1 Bust**, **Coin Double**, or **Exploding d20**.
    *   Updates `state.tableData` and saves.
*   **`finishTurn(userId)`**: Called after `submitRoll` completes (and cheat dialogs resolved).
    *   Passes turn to `getNextActivePlayer`.

### Cheat System (`scripts/twenty-one/skills/cheat.js`)
*   When a player rolls, they see a **Cheat Dialog** (Client-side).
*   Options: *Keep*, *Sleight (Reroll)*, *Arcane (Set value)*.
*   Success updates the roll value in state.
*   Failure marks them as "Caught" (visible in Inspection phase).

### Skills
Located in `scripts/twenty-one/skills/`.
*   **Bump:** Force table re-roll (STR check).
*   **Goad:** Force opponent action (CHA check).
*   **Hunch:** Predict roll (WIS check).
*   **Profile:** Reveal hidden dice (INT check).

---

## 4. File Structure & Manifest

### Core
*   `scripts/main.js`: Initialization, Hooks, Handlebars helpers.
*   `scripts/state.js`: State manager. getters/setters for `gameState`, `addHistoryEntry`.
*   `scripts/socket.js`: Socketlib registration (`executeAsGM`, etc).
*   `scripts/tavern-actions.js`: Central handler mapping UI actions (`data-action`) to logic functions.

### Application (UI)
*   `scripts/app/tavern-app.js`: Main ApplicationV2 class.
    *   `_prepareContext()`: Builds data for Handlebars (dice config, player status).
    *   `onRoll()`, `onJoin()`: Event listeners.
*   `templates/tavern-app.hbs`: Main shell.
*   `templates/parts/controls.hbs`: The actionable buttons (Dice, Skills, Join).
*   `templates/parts/table.hbs`: The visual table (Player cards, dice visuals).
*   `styles/tavern.css`: Extensive CSS variables, diegetic UI styling.

### Logic (`scripts/twenty-one/`)
*   `index.js`: Exports.
*   `constants.js`: Magic numbers (Ante, Valid Dice).
*   `phases/`:
    *   `core.js`: Round lifecycle (Start, Reset).
    *   `turn.js`: Rolling, Holding, Folding.
    *   `special.js`: The Cut, Duels.
*   `skills/`: Individual skill logic files.
*   `utils/`:
    *   `game-logic.js`: Helpers for turn order, targeting, phase transitions.
    *   `actors.js`: Actor data retrieval.

---

## 5. Recent Features (v5.14.x)
### Goblin Rules Mode
*   **Config:** Toggled via UI in "House Rules". stored in `tableData.gameMode`.
*   **Mechanics:**
    *   Dice cost 0 GP.
    *   Can use each die (`d20, d10, d8, d6, d4`) once.
    *   **Coin (d2):** Heads = Double Score, Tails = Bust.
    *   **Nat 1:** Instant Bust.
    *   **Nat 20 (d20):** Explodes (add 20, roll d20 again).

---

## 6. Development Tips for AI
1.  **State Updates:** Always use `updateState(currentState => modification)`. Avoid direct setting writes unless necessary.
2.  **UI Updates:** Modifying `gameState` *automatically* refreshes the UI. You do not need to call `.render()` manually.
3.  **Logs:** Use `addLogToAll` for game events.
4.  **Formatting:** Keep `turn.js` clean. Note the complex branching in `submitRoll` for game modes.
