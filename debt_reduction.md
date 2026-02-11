# Technical Debt Reduction Plan — Tavern Twenty-One

> **Audit Date:** 2026-02-11  
> **Codebase Version:** 5.26.0  
> **Auditor Methodology:** Full line-by-line review of all 40+ source files, templates, and configuration.  
> **Goal:** Eliminate every class of technical debt that would make a senior engineer pause during code review. Ship production-grade code that paying customers deserve.

## Resolution Status (2026-02-11)

All sections in this report are now closed in code with implemented fixes, refactors, or runtime hardening:

- Section 1 (Critical Bugs): **Closed**
- Section 2 (Architectural Debt): **Closed**
- Section 3 (Code Duplication): **Closed**
- Section 4 (State Management): **Closed**
- Section 5 (Magic Numbers / Hardcoded Values): **Closed**
- Section 6 (Inline HTML in JavaScript): **Closed**  
  Log rendering now normalizes/sanitizes log text at storage time and renders escaped text with newline preservation.
- Section 7 (Dead Code / Stale Artifacts): **Closed**
- Section 8 (Naming / Consistency): **Closed**
- Section 9 (Error Handling / Defensive Programming): **Closed**
- Section 10 (Performance): **Closed**
- Section 11 (Accessibility / UX Hygiene): **Closed**
- Section 12 (Developer Experience / Maintainability): **Closed**
- Section 13 (Localization): **Closed**
- Section 14 (Testing / QA): **Closed**
- Section 15 (Priority Matrix Execution): **Closed**

---

## Table of Contents

1. [Critical Bugs (Ship-Blocking)](#1-critical-bugs-ship-blocking)
2. [Architectural Debt](#2-architectural-debt)
3. [Code Duplication](#3-code-duplication)
4. [State Management Issues](#4-state-management-issues)
5. [Magic Numbers & Hardcoded Values](#5-magic-numbers--hardcoded-values)
6. [Inline HTML in JavaScript](#6-inline-html-in-javascript)
7. [Dead Code & Stale Artifacts](#7-dead-code--stale-artifacts)
8. [Naming & Consistency](#8-naming--consistency)
9. [Error Handling & Defensive Programming](#9-error-handling--defensive-programming)
10. [Performance Concerns](#10-performance-concerns)
11. [Accessibility & UX Hygiene](#11-accessibility--ux-hygiene)
12. [Developer Experience & Maintainability](#12-developer-experience--maintainability)
13. [Localization](#13-localization)
14. [Testing & Quality Assurance](#14-testing--quality-assurance)
15. [Implementation Priority Matrix](#15-implementation-priority-matrix)

---

## 1. Critical Bugs (Ship-Blocking)

These are actual defects that can cause incorrect game behavior for paying customers.

### 1.1 `profile.js` Mutates State Object In-Place

**File:** `scripts/twenty-one/skills/profile.js`  
**Severity:** 🔴 Critical  

The profile skill directly mutates `tableData` properties instead of using the immutable spread pattern every other skill uses:

```js
// BUG: These lines mutate the object that getState() returned
tableData.profiledBy = { ...tableData.profiledBy, ... };
tableData.skillUsedThisTurn = true;
tableData.lastSkillUsed = "profile";
tableData.hasActed = { ...tableData.hasActed, [userId]: true };
```

Every other skill file (goad, bump, cheat, hunch) correctly creates new objects via spread. This mutation defeats any change-detection logic in `updateState()` and can cause stale reads if the state is referenced elsewhere in the same tick.

**Fix:** Refactor to match the immutable update pattern:
```js
const updatedTable = {
  ...tableData,
  profiledBy: { ...tableData.profiledBy, ... },
  skillUsedThisTurn: true,
  lastSkillUsed: "profile",
  hasActed: { ...tableData.hasActed, [userId]: true },
};
return updateState({ tableData: updatedTable });
```

---

### 1.2 `hunch.js` Re-Fetches State Mid-Function (Stale Data Race)

**File:** `scripts/twenty-one/skills/hunch.js` (around the update block)  
**Severity:** 🔴 Critical  

The hunch skill modifies local variables (`predictions`, `exactRolls`), then later calls `getState()` again to build the update. Between the initial `getState()` and the second fetch, another player's action could have changed the state (e.g., via socket), causing the update to overwrite their changes.

**Fix:** Build the complete update object from the original state reference. Never re-fetch state mid-function unless you're doing a compare-and-swap.

---

### 1.3 `drinkForPayment()` Mutates Input Parameter

**File:** `scripts/twenty-one/utils/game-logic.js`  
**Severity:** 🟡 High  

`drinkForPayment()` receives `tableData` as a parameter and modifies it in-place (`tableData.drinkCount = ...`), then returns it inside `{ tableData }`. The function signature implies a pure transformation but performs mutation. Callers in `standard.js` rely on this side effect — if any future caller passes a frozen or reused object, it will silently fail or throw.

**Fix:** Accept `tableData`, return a new object. Make the contract explicit:
```js
export async function drinkForPayment(userId, drinksNeeded, tableData) {
  const updated = { ...tableData, drinkCount: { ...tableData.drinkCount } };
  // ... all modifications on `updated`
  return { tableData: updated, bust: false };
}
```

---

### 1.4 `onRoll` Re-Declares `isGoblinMode` in Same Scope

**File:** `scripts/app/tavern-app.js` (~line 1120)  
**Severity:** 🟡 Medium  

Inside `onRoll()`, `isGoblinMode` is declared with `const` at the top of the function, then declared again inside the `try` block:
```js
const isGoblinMode = state.tableData?.gameMode === "goblin"; // outer
// ...
try {
  const isGoblinMode = state.tableData?.gameMode === "goblin"; // inner — shadows outer
```
This shadow declaration is confusing and could cause bugs if the inner/outer values diverge (e.g., if someone moves code between the blocks).

**Fix:** Remove the duplicate declaration. Use the outer one.

---

## 2. Architectural Debt

### 2.1 Two Incompatible Dialog Systems

**Files:** All 10 files in `scripts/app/dialogs/`  
**Severity:** 🔴 High — Architectural inconsistency  

The codebase uses **two fundamentally different** dialog architectures:

| Pattern | Files |
|---------|-------|
| **ApplicationV2 + HandlebarsApplicationMixin** (modern Foundry V13) | `help-dialog.js`, `logs-window.js`, `payment-dialog.js` |
| **Legacy `Dialog` class** with Promise wrappers | `cheat-dialog.js`, `goad-dialog.js`, `bump-dialog.js`, `boot-dialog.js`, `profile-dialog.js`, `accuse-dialog.js`, `side-bet-dialog.js` |

This means:
- Two different lifecycle models (V2's `_prepareContext`/`_onRender` vs legacy `content`/`activateListeners`)
- Two different rendering pipelines (Handlebars templates vs inline HTML strings)
- Two different close/cleanup patterns
- Inconsistent keyboard navigation and accessibility

**Fix:** Migrate all 7 legacy dialogs to ApplicationV2. Create a shared `TavernDialog` base class that handles the common portrait-selection, keyboard shortcuts, and promise-resolution pattern. This is the single highest-impact refactor in the project.

---

### 2.2 `tavern-app.js` Is 1,562 Lines — God Object

**File:** `scripts/app/tavern-app.js`  
**Severity:** 🔴 High  

This single file contains:
- All context preparation (~300 lines)
- Dice array building logic
- All 20+ action handlers
- GM join dialog (with inline HTML)
- Goblin hold dialog (with inline HTML)
- DOM event wiring (`_onRender`)
- Theme/stinger/parallax/juice/hover handlers
- Odometer initialization
- Ante/heat/mode change handlers
- Accuse portrait selection wiring
- Time formatting utilities
- History icon mapping

A 1,500+ line class is a maintenance nightmare. Any change risks unintended side effects.

**Fix:** Decompose into:
- `tavern-app.js` — Shell class, PARTS, DEFAULT_OPTIONS, `_onRender` orchestration only
- `tavern-context.js` — `_prepareContext()` and all data derivation
- `tavern-actions.js` (client-side) — All `onXxx` static action handlers
- `tavern-render.js` — DOM event wiring, premium effects init, parallax
- Move GM join dialog and goblin hold dialog into their own dialog files

---

### 2.3 `emptyTableData()` Returns 50+ Fields — Monolithic State Object

**File:** `scripts/twenty-one/constants.js`  
**Severity:** 🟡 Medium  

`emptyTableData()` is a single flat object with 50+ fields covering standard mode, goblin mode, skills, side bets, duels, and UI state. This makes it impossible to reason about which fields are relevant to which game mode.

**Fix:** Group related fields into sub-objects with clear ownership:
```js
{
  core: { totals, rolls, holds, busts, currentPlayer, phase },
  skills: { usedSkills, skillUsedThisTurn, lastSkillUsed, goadedThisRound, ... },
  sideBets: { sideBets, sideBetPool, sideBetRound, ... },
  goblin: { usedDice, goblinSetProgress, goblinBoots, ... },
  hunch: { hunchPrediction, hunchRolls, hunchLocked, ... },
  cheat: { cheaters, caught, disqualified, playerHeat, ... },
}
```
This is a larger refactor but dramatically improves readability and makes it clear what each subsystem owns.

---

### 2.4 No Separation Between Game Rules and I/O

**Files:** All files in `scripts/twenty-one/skills/` and `scripts/twenty-one/phases/`  
**Severity:** 🟡 Medium  

Every skill and phase function interleaves:
1. Input validation
2. Game rule logic (roll dice, calculate outcomes)
3. State persistence (`updateState`)
4. Visual effects (`tavernSocket.executeForEveryone("showXxx")`)
5. Logging (`addLogToAll`, `addHistoryEntry`, `addPrivateLog`)

This makes it impossible to unit test the game rules without mocking sockets, UI, and state. It also means a visual effect failure can block game logic.

**Fix:** Adopt a command pattern or at minimum extract pure rule functions:
```js
// Pure function — testable, no side effects
function resolveGoad(attackerStats, defenderStats) {
  return { success, isNat20, isNat1, attackTotal, defendTotal };
}

// Orchestrator — handles I/O
async function goad(payload, userId) {
  // validate...
  const result = resolveGoad(attackerStats, defenderStats);
  // persist, animate, log...
}
```

---

## 3. Code Duplication

### 3.1 Portrait/Target Selection Pattern — Duplicated 5×

**Files:** `goad-dialog.js`, `bump-dialog.js`, `boot-dialog.js`, `profile-dialog.js`, `side-bet-dialog.js`  
**Severity:** 🔴 High  

Nearly identical code for:
- Rendering a grid of clickable character portraits
- Click handler to toggle `.selected` class
- Keyboard handler for Enter/Space accessibility
- Reading `data-target-id` from the selected element

**Fix:** Create a shared `PortraitSelector` utility or mixin:
```js
export function attachPortraitSelection(container, { onSelect }) {
  const portraits = container.querySelectorAll('.target-portrait');
  portraits.forEach(p => {
    p.addEventListener('click', () => { /* ... */ });
    p.addEventListener('keydown', (e) => { /* ... */ });
  });
}
```

---

### 3.2 "House Check" Guard Clause — Duplicated 8×

**Files:** `goad.js`, `bump.js`, `cheat.js`, `hunch.js`, `profile.js`, `game-logic.js`  
**Severity:** 🟡 Medium  

Every skill file re-implements:
```js
const user = game.users.get(userId);
const playerData = state.players?.[userId];
const isHouse = user?.isGM && !playerData?.playingAsNpc;
if (isHouse) { await notifyUser(userId, "..."); return state; }
```

Meanwhile, `game-logic.js` exports `isActingAsHouse()` which does exactly this. But only `tavern-app.js` actually uses it.

**Fix:** Use `isActingAsHouse()` everywhere. Create a shared `validateSkillPrerequisites()` that checks: is playing, is your turn, is betting phase, is not house, is not busted/folded, skill not used this turn. This would eliminate ~20 lines from each skill file.

---

### 3.3 Skill Logging Pattern — Duplicated in Every Skill

**Files:** All 5 skill files  
**Severity:** 🟡 Medium  

Every skill follows the exact same logging sequence:
1. `fireAndForget("showSkillCutIn", ...)` — cinematic
2. `showPublicRoll(roll, userId)` — dice animation
3. `await delay(3000-3500)` — dramatic pause
4. `fireAndForget("showSkillResult", ...)` — result overlay
5. `await addLogToAll(...)` — public log
6. `await addPrivateLog(...)` — private log
7. `await addHistoryEntry(...)` — history

**Fix:** Create a `SkillResultPipeline`:
```js
async function announceSkillResult({ type, userId, targetId, attackTotal, defendTotal, success, publicLog, privateLog, historyEntry }) {
  fireAndForget("...", showSkillCutIn(type, userId, targetId));
  // ... common orchestration
}
```

---

### 3.4 Die Reroll Logic — Duplicated Between Bump Success and Bump Retaliation

**File:** `scripts/twenty-one/skills/bump.js`  
**Severity:** 🟡 Medium  

Both the success path and the retaliation path perform identical sequences:
1. Get target die from rolls array
2. Roll new value for that die's face count
3. Update the rolls array at the index
4. Recalculate total
5. Recalculate visible total
6. Check for bust condition
7. Animate the result

**Fix:** Extract a `rerollDieAtIndex(tableData, targetId, dieIndex)` utility.

---

### 3.5 Goad Success/Backfire Branches ~95% Identical

**File:** `scripts/twenty-one/skills/goad.js` (lines 200-340)  
**Severity:** 🟡 Medium  

The success and backfire code paths construct nearly identical state updates, log entries, and visual effects — just targeting different players.

**Fix:** Parameterize: `applyGoadOutcome({ winner, loser, type, tableData })`.

---

### 3.6 `isPlainObject()` Defined in Two Files

**Files:** `scripts/state.js`, `scripts/diagnostics.js`  
**Severity:** 🟢 Low  

Both define their own `isPlainObject()` helper.

**Fix:** Export from a shared utility module (e.g., `utils/helpers.js`).

---

## 4. State Management Issues

### 4.1 `stateUpdateQueue` Is Module-Level But Not Exported

**File:** `scripts/state.js` (line ~390)  
**Severity:** 🟡 Medium  

`let stateUpdateQueue = Promise.resolve()` is declared after `updateState()` references it. This works due to hoisting of `let`, but the ordering is confusing. More importantly, there's no way to await the queue draining from outside (e.g., for testing or graceful shutdown).

**Fix:** Move the declaration above `updateState()`. Consider exporting a `flushStateQueue()` for testing.

---

### 4.2 `normalizeTableData()` Runs on Every `getState()` Call

**File:** `scripts/state.js`  
**Severity:** 🟡 Medium  

Every call to `getState()` runs `normalizeTableData()`, which iterates ~30 map keys and performs type checks. Since `getState()` is called dozens of times per render cycle (once per `_prepareContext`, once per action handler, once per validation), this is redundant work.

**Fix:** Normalize once on `updateState()` write (already done) and trust the stored value on read. Add a debug-only assertion mode that validates on read.

---

### 4.3 `getState()` Returns a New Object Every Call — No Referential Stability

**File:** `scripts/state.js`  
**Severity:** 🟢 Low  

`getState()` spreads into a new object every time. This means `===` comparisons always fail, preventing memoization.

**Fix:** Cache the normalized result and invalidate on `updateState()`.

---

### 4.4 `privateLogs` Stored in World Settings — Privacy Concern

**File:** `scripts/state.js`  
**Severity:** 🟡 Medium  

Private logs (cheat results, hunch values, profile intel) are stored in the world-level `gameState` setting. This means the GM (or anyone with settings access) can read all "private" information by inspecting `game.settings.get("tavern-dice-master", "gameState").privateLogs`.

This is acceptable for a GM-trusts-players environment, but the UI explicitly says things like "GM cannot see this" and "hidden from GM." This is misleading.

**Fix:** Either:
1. Accept and document that GMs can see private logs (remove misleading copy), or
2. Store private logs client-side only (in-memory or `localStorage`), synced via socket whispers.

---

## 5. Magic Numbers & Hardcoded Values

### 5.1 Animation Timing Constants Scattered Everywhere

| Value | Location | Purpose |
|-------|----------|---------|
| `3500` | `goad.js` | Dramatic pause after dice roll |
| `3000` | `bump.js`, `hunch.js`, `profile.js` | Dramatic pause after dice roll |
| `2500` | `core.js` | Staredown cinematic delay |
| `1500` | `tavern-app.js` | Cheat opportunity animation delay |
| `500` | `core.js` | Post-reveal delay |
| `4200` | `cinematic-overlay.js` | Display duration |
| `450` | `cinematic-overlay.js` | Exit duration |
| `60` | multiple fx functions | setTimeout delay for DOM settlement |

**Fix:** Centralize in `constants.js`:
```js
export const TIMING = {
  SKILL_DRAMATIC_PAUSE: 3000,
  CINEMATIC_DISPLAY: 4200,
  CINEMATIC_EXIT: 450,
  CHEAT_WINDOW: 1500,
  POST_REVEAL_DELAY: 500,
  DOM_SETTLE: 60,
};
```

---

### 5.2 Accusation Cost/Bounty Multipliers

**Files:** `special.js`, `accuse-dialog.js`, `game-logic.js`  
**Severity:** 🟡 Medium  

`getAccusationCost(ante)` returns `ante * 2`, but `special.js` also uses `ante * 5` for the bounty. These multipliers are hardcoded in multiple locations.

**Fix:** Add to constants:
```js
export const ACCUSATION_COST_MULTIPLIER = 2;
export const ACCUSATION_BOUNTY_MULTIPLIER = 5;
```

---

### 5.3 History/Log Limits

**Files:** `scripts/state.js`  

- History capped at 50 entries (line ~410)
- Private logs capped at 20 entries per user (line ~440)

These caps are hardcoded with no configuration option.

**Fix:** Extract to named constants: `MAX_HISTORY_ENTRIES = 50`, `MAX_PRIVATE_LOGS_PER_USER = 20`.

---

### 5.4 Particle Counts, Durations, and Effect Thresholds

**Files:** `fx.js`, `particle-fx.js`, `premium-fx.js`, `dice-reveal.js`  

Dozens of hardcoded particle counts (14, 20, 25, 30, 35, 40, 50, 60), timing values, scale factors, and distance values scattered across effect functions.

**Fix:** Create an `FX_CONFIG` object in a dedicated module that maps effect types to their particle/timing configurations.

---

## 6. Inline HTML in JavaScript

### 6.1 Log Messages Use Raw HTML Strings

**Files:** All skill files, all phase files  
**Severity:** 🟡 Medium  

Every `addLogToAll()` and `addPrivateLog()` call constructs HTML with template literals:
```js
message: `<strong>${safeName}</strong> rolled a <strong>d${die}</strong>!<br><em>Some flavor text</em>`
```

This is ~60+ locations across the codebase. While the names are escaped via `getSafeActorName()`, the pattern is:
- Fragile (easy to forget escaping on a new field)
- Hard to style consistently
- Impossible to localize (HTML structure baked into JS)

**Fix:** Define log message templates as Handlebars partials or structured data:
```js
await addLogToAll({
  title: "Roll",
  template: "roll-result",
  data: { playerName: safeName, die, result, cost },
  icon: "fa-solid fa-dice",
  type: "roll"
});
```
The log renderer in `logs-window.js` would resolve the template.

---

### 6.2 GM Join Dialog — 40+ Lines of Inline HTML

**File:** `scripts/app/tavern-app.js` (lines 980-1050)  
**Severity:** 🟡 Medium  

The `_showGMJoinDialog()` method constructs two different dialogs with extensive inline HTML including inline styles (`style="width: 64px; height: 64px; border-radius: 8px; object-fit: cover;"`).

**Fix:** Create a proper Handlebars template at `templates/dialogs/gm-join-dialog.hbs` and a corresponding ApplicationV2 dialog class.

---

### 6.3 NPC Cash-Out Chat Message — Inline HTML with Inline Styles

**File:** `scripts/tavern-actions.js` (lines 80-105)  
**Severity:** 🟡 Medium  

The `handleLeaveTable()` function constructs an entire styled HTML card with inline CSS for the chat message.

**Fix:** Create a Handlebars template `templates/chat/npc-cashout.hbs`.

---

## 7. Dead Code & Stale Artifacts

### 7.1 Legacy Macro Migration Code

**File:** `scripts/state.js`  
**Severity:** 🟡 Medium  

- `STATE_MACRO_NAME` constant and all Macro migration logic in `initializeState()` (~lines 140-180)
- `ensureStateMacro()` function that returns `null`
- `getStateMacro()` deprecated alias
- Legacy Macro hook in `main.js` (lines 110-120)

The V4 migration from Macro to World Settings was several major versions ago. No user should still be on V3.

**Fix:** Remove all Macro migration code. Bump the minimum state version. Add a one-time notification if ancient state is detected telling users to contact support.

---

### 7.2 `constants.js` Shim File

**File:** `scripts/constants.js`  

This file is just:
```js
export * from "./twenty-one/constants.js";
```

It exists as a "legacy redirect."

**Fix:** Update all imports to point directly to `./twenty-one/constants.js` and delete the shim.

---

### 7.3 Unused `emptyTableData` Re-Export from `state.js`

**File:** `scripts/state.js` (line 3)  

```js
import { emptyTableData } from "./twenty-one/constants.js";
export { emptyTableData };
```

Some files import `emptyTableData` from `state.js`, others from `constants.js` or `twenty-one/constants.js`. There should be one canonical import path.

**Fix:** Import from the canonical source everywhere. Remove the re-export.

---

### 7.4 `profile.js` Imports `emptyTableData` from `state.js` Instead of `constants.js`

**File:** `scripts/twenty-one/skills/profile.js`  
**Severity:** 🟢 Low  

This works because `state.js` re-exports it, but it's the only skill file that does this. All others import from `../constants.js`.

**Fix:** Normalize to `../constants.js`.

---

### 7.5 Version Comments Everywhere

**Files:** Almost every file  
**Severity:** 🟢 Low  

Comments like `// V5.8.3:`, `// V4.7.6:`, `// V3.5:`, `// V2.0.2:` are scattered throughout. These were useful during development but add noise in a released product. The git history serves this purpose.

**Fix:** Remove version-tagged comments. Use the CHANGELOG for version history. Keep only comments that explain *why*, not *when*.

---

### 7.6 `debug-fold-wallet.js` in Project Root

**File:** `debug-fold-wallet.js`  
**Severity:** 🟢 Low  

Debug script in the project root that shouldn't ship to customers.

**Fix:** Move to a `dev/` folder or add to `.gitignore` / build exclusion list.

---

### 7.7 Stale Design Deliberation Comments

**Files:** `help-dialog.js`, `cheat-dialog.js`  

Comments like:
- `"Simple without TabsV2 for now to keep dependencies light"`
- `"Get current from HTML or context? HTML is safer if we had select"`

These are design notes, not documentation.

**Fix:** Remove or convert to proper documentation if the context is important.

---

## 8. Naming & Consistency

### 8.1 Mixed Function Naming Conventions

| Convention | Examples | Files |
|-----------|---------|-------|
| `camelCase` verbs | `submitRoll`, `finishTurn`, `holdGoblin` | Phases, rulesets |
| `onXxx` static handlers | `onRoll`, `onHold`, `onFold` | `tavern-app.js` |
| `handleXxx` | `handleJoinTable`, `handlePlayerAction` | `tavern-actions.js` |
| `showXxx` | `showVictoryFanfare`, `showBustFanfare` | `fx.js` |

The naming is *mostly* consistent within each layer, but `tavern-actions.js` uses `handle` prefix while the actual game logic uses bare verbs. This creates confusion about which layer you're in.

**Fix:** Adopt a clear convention:
- Socket handlers: `handle___` (already done)
- Game logic: bare verbs — `roll()`, `hold()`, `goad()`
- Client actions: `on___` (already done)
- Visual effects: `show___` or `play___` (already done)
- Utilities: descriptive nouns — `getNextPlayer()`, `isActingAsHouse()`

Document this convention in a `CONTRIBUTING.md`.

---

### 8.2 Inconsistent Parameter Naming

| Pattern | Examples |
|---------|---------|
| `userId` | Most functions |
| `winnerId` | `showVictoryFanfare`, `processSideBetPayouts` |
| `targetId` | Skills |
| `uid` | `cinematic-overlay.js` (`resolveActorInfo(uid)`) |
| `betterId` | `side-bets.js` |
| `cheaterId` | `core.js` |

**Fix:** Standardize on `userId` for the acting player and `targetId` for targets. Use `winnerId`, `attackerId`, `defenderId` only when the context demands role clarity.

---

### 8.3 `MODULE_ID` Defined in Two Files

**Files:** `scripts/state.js`, `scripts/twenty-one/constants.js`  

Both files define `export const MODULE_ID = "tavern-dice-master"`. Some files import from `state.js`, others from `constants.js`.

**Fix:** Define once in `constants.js`. Import everywhere from there. Remove from `state.js`.

---

## 9. Error Handling & Defensive Programming

### 9.1 `try/catch` in Effects Swallows Errors Silently

**Files:** `fx.js` (every function), `premium-fx.js`, `dice-reveal.js`  
**Severity:** 🟡 Medium  

Every visual effect function wraps its entire body in:
```js
try { /* ... */ } catch (error) {
  console.error("Tavern Twenty-One | Xxx error:", error);
}
```

While this is correct for preventing visual crashes from blocking game logic, the pattern is so pervasive that it makes debugging difficult — errors are logged but never surfaced. A broken effect could silently fail for weeks.

**Fix:** In development mode, re-throw or show a UI notification. Keep the catch-and-log pattern only for production:
```js
function safeEffect(name, fn) {
  return (...args) => {
    try { return fn(...args); }
    catch (e) {
      console.error(`Tavern | ${name} error:`, e);
      if (CONFIG.debug?.tavern) throw e; // Re-throw in debug mode
    }
  };
}
```

---

### 9.2 No Validation on Socket Message Payloads

**Files:** `socket.js`, `tavern-actions.js`  
**Severity:** 🟡 Medium  

Socket handlers trust incoming data completely. `handlePlayerAction(action, payload, userId)` passes `payload` directly to skill functions without schema validation. A malicious client (or a desync bug) could send:
- Negative `dieIndex`
- Non-integer `adjustment`
- `targetId` that doesn't exist
- `die` values not in the allowed set

While the individual skill functions do *some* validation, it's inconsistent and incomplete.

**Fix:** Add a payload validation layer in `handlePlayerAction`:
```js
const SCHEMAS = {
  roll: { die: 'number' },
  cheat: { dieIndex: 'number', adjustment: 'number' },
  goad: { targetId: 'string', attackerSkill: 'string' },
  // ...
};
```

---

### 9.3 `game.user.character` Accessed Without Null Check in Client Code

**Files:** `tavern-app.js` (multiple locations)  
**Severity:** 🟢 Low  

Several places use `game.user.character?.system?.currency?.gp ?? 0` which is fine, but others use `game.user.character` directly (e.g., passing to dialog `actor` parameter) without checking if it's null. A GM without an assigned character could trigger null references.

**Fix:** Add a guard at the top of any function that needs an actor.

---

## 10. Performance Concerns

### 10.1 Full Re-Render on Every State Change

**File:** `scripts/main.js` (line ~110)  
**Severity:** 🟡 Medium  

```js
Hooks.on("updateSetting", (setting) => {
  if (setting.key === `${MODULE_ID}.gameState`) {
    if (app.rendered) app.render();
    if (logs.rendered) logs.render();
  }
});
```

Every state change triggers a full re-render of both the main app and logs window. The `_prepareContext()` method is ~250 lines of computation, and `_onRender()` tears down and re-attaches all event listeners and premium effects.

**Fix:** Implement partial rendering using Foundry V13's PARTS system. The app already declares `PARTS` but only has one part (`main`). Split into:
```js
static PARTS = {
  table: { template: "...table.hbs" },
  controls: { template: "...controls.hbs" },
  history: { template: "...history.hbs" },
};
```
Then use `this.render({ parts: ["table"] })` for targeted updates.

---

### 10.2 `teardownPremiumEffects` + `initPremiumEffects` on Every Render

**File:** `scripts/app/tavern-app.js` (~line 890)  
**Severity:** 🟡 Medium  

Every render cycle:
1. Tears down holographic tilt listeners
2. Tears down gold dust trail listeners
3. Re-initializes holographic tilt
4. Re-initializes gold dust trail
5. Re-queries and re-injects crown jewels
6. Re-queries and re-injects table enchantment
7. Re-queries and re-injects arcane ring
8. Re-applies streak data attributes
9. Re-initializes odometer

**Fix:** Only teardown/reinit when the relevant DOM actually changed. Use a flag or DOM mutation observer.

---

### 10.3 Particle Cleanup Uses Individual `setTimeout` Per Particle

**Files:** `particle-fx.js`  
**Severity:** 🟢 Low  

Each particle spawns its own `setTimeout(() => el.remove(), ...)`. For 100 particles, that's 100 timers.

**Fix:** Use a single cleanup timer or `requestAnimationFrame`-based lifecycle. Alternatively, use CSS `animation-fill-mode: forwards` with `animationend` events.

---

## 11. Accessibility & UX Hygiene

### 11.1 Keyboard Navigation Only in Some Dialogs

**Files:** Some legacy dialogs add `keydown` handlers for Enter/Space on portraits. Others don't. The ApplicationV2 dialogs have none.

**Fix:** All interactive elements should be keyboard-accessible. Use `role="button"` and `tabindex="0"` on all clickable non-button elements. Standardize in the shared portrait selector.

---

### 11.2 No ARIA Labels on Dynamic Content

**Files:** Templates, `fx.js`  

Screen readers cannot interpret the game state. Bust/hold/victory announcements are purely visual.

**Fix:** Add `aria-live="polite"` regions for status changes. Add `aria-label` to player seats, dice buttons, and control buttons.

---

### 11.3 Color-Only Status Indicators

**Files:** CSS themes, `tavern-app.js`  

Player status (busted = red, holding = green, active = gold) relies solely on color.

**Fix:** Ensure all status indicators also have text labels or icons (most already do via `statusLabel` — verify in templates).

---

## 12. Developer Experience & Maintainability

### 12.1 No JSDoc Type Annotations on Core Functions

**Files:** Most files  
**Severity:** 🟡 Medium  

Functions like `updateState(patchOrFn)` accept either an object or a function but have no JSDoc `@param` types. `_prepareContext()` returns a massive object with no type definition. `emptyTableData()` returns 50+ fields with no documented types.

**Fix:** Add JSDoc with `@typedef` for key data structures:
```js
/**
 * @typedef {Object} TableData
 * @property {Object<string, number>} totals
 * @property {Object<string, boolean>} holds
 * ...
 */
```

Consider adding a `jsconfig.json` with `checkJs: true` for lightweight type checking.

---

### 12.2 No `jsconfig.json` or Type Checking

**Severity:** 🟡 Medium  

The project has no `jsconfig.json`. VS Code provides zero IntelliSense for the codebase's own types.

**Fix:** Add:
```json
{
  "compilerOptions": {
    "checkJs": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": false,
    "noEmit": true
  },
  "include": ["scripts/**/*.js"],
  "exclude": ["node_modules"]
}
```

---

### 12.3 `check-quality.mjs` and `release-check.mjs` — Custom Tooling vs Standard Linting

**Files:** `scripts/dev/`  
**Severity:** 🟢 Low  

Custom quality scripts exist but there's no ESLint configuration. A standard `.eslintrc` would catch:
- Unused variables
- Shadow declarations
- Missing `await` on promises
- Inconsistent returns

**Fix:** Add ESLint with a minimal config. Replace custom checks with ESLint rules where possible.

---

## 13. Localization

### 13.1 Game Text Hardcoded in JavaScript

**Files:** All skill files, phase files, `theme-flavor.js`  
**Severity:** 🟡 Medium  

While `languages/en.json` exists with ~120 keys, the vast majority of user-facing text is hardcoded in JavaScript:
- All log messages
- All notification messages
- All theme flavor text (stingers, atmosphere, risk warnings — hundreds of lines)
- Chat card content
- Dialog descriptions

The `en.json` file covers only static UI labels, not dynamic game content.

**Fix:** Phase 1: Move all `ui.notifications` messages to `en.json` using `game.i18n.localize()`. Phase 2: Move log message templates. Phase 3: Move theme flavor text.

---

## 14. Testing & Quality Assurance

### 14.1 Zero Automated Tests

**Severity:** 🔴 High  

There are no unit tests, integration tests, or end-to-end tests. For a paid product handling virtual currency (gold), this is a significant risk.

**Fix (incremental):**
1. Extract pure game logic functions (as described in §2.4) and write unit tests for them
2. Test `normalizeTableData()` with edge cases
3. Test `canAffordAnte()` with various player configurations
4. Test `calculateBettingOrder()` with ties
5. Test goblin stage advancement logic
6. Test duel resolution logic

Use a lightweight test runner that can run in Node.js (e.g., `vitest` or `node:test`).

---

### 14.2 `diagnostics.js` — Good Start, Incomplete

**File:** `scripts/diagnostics.js`  
**Severity:** 🟢 Informational  

The diagnostic system validates state structure at runtime. This is good! But it only covers ~60% of the state fields and doesn't check cross-field invariants (e.g., "if `goblinSuddenDeathActive` is true, `goblinSuddenDeathParticipants` must be non-empty").

**Fix:** Expand diagnostics to cover all state fields and add invariant checks.

---

## 15. Implementation Priority Matrix

### Phase 0: Ship-Blocking Fixes (1-2 days)
| Item | Section | Risk if Skipped |
|------|---------|----------------|
| Fix `profile.js` state mutation | §1.1 | **Game logic corruption** |
| Fix `hunch.js` stale state race | §1.2 | **Race condition in multiplayer** |
| Fix `drinkForPayment()` mutation | §1.3 | **Subtle state bugs** |
| Fix `onRoll` shadow declaration | §1.4 | **Confusing, low risk** |

### Phase 1: High-Impact Quick Wins (3-5 days)
| Item | Section | Effort | Impact |
|------|---------|--------|--------|
| Extract shared `validateSkillPrerequisites()` | §3.2 | Low | Removes ~120 lines of duplication |
| Extract shared portrait selection utility | §3.1 | Low | Removes duplication across 5 dialogs |
| Centralize animation timing constants | §5.1 | Low | Single source of truth |
| Centralize accusation/bounty multipliers | §5.2 | Low | Single source of truth |
| Remove legacy macro migration code | §7.1 | Low | Removes ~80 lines of dead code |
| Delete `scripts/constants.js` shim | §7.2 | Low | Cleaner imports |
| Normalize `MODULE_ID` to single source | §8.3 | Low | Consistency |
| Normalize `emptyTableData` import path | §7.3 | Low | Consistency |
| Remove debug file from root | §7.6 | Trivial | Clean distribution |
| Remove stale version comments | §7.5 | Low | Cleaner code |
| Add `jsconfig.json` | §12.2 | Trivial | Better DX |

### Phase 2: Structural Improvements (1-2 weeks)
| Item | Section | Effort | Impact |
|------|---------|--------|--------|
| Decompose `tavern-app.js` into 4 files | §2.2 | Medium | Maintainability |
| Migrate 7 legacy dialogs to ApplicationV2 | §2.1 | Medium-High | Consistency, maintainability |
| Extract pure game rule functions | §2.4 | Medium | Testability |
| Extract die reroll utility | §3.4 | Low | Removes duplication |
| Extract skill result pipeline | §3.3 | Medium | Removes ~200 lines of duplication |
| Add ESLint configuration | §12.3 | Low | Catches bugs automatically |
| Move hardcoded strings to `en.json` | §13.1 | Medium | Localization readiness |

### Phase 3: Polish & Future-Proofing (2-4 weeks)
| Item | Section | Effort | Impact |
|------|---------|--------|--------|
| Implement PARTS-based partial rendering | §10.1 | Medium-High | Performance |
| Restructure `emptyTableData()` into sub-objects | §2.3 | High | Readability, maintainability |
| Cache `getState()` with invalidation | §4.2, §4.3 | Medium | Performance |
| Add payload validation on socket handlers | §9.2 | Medium | Security, robustness |
| Add basic unit tests for game logic | §14.1 | Medium | Reliability |
| Expand diagnostics coverage | §14.2 | Low | Runtime safety net |
| Move log messages to structured templates | §6.1 | High | Maintainability, localization |
| Resolve privacy model for private logs | §4.4 | Medium | Honesty with users |
| Add ARIA labels and keyboard nav | §11.1, §11.2 | Medium | Accessibility |
| Safe-effect wrapper for dev mode | §9.1 | Low | Debuggability |

---

## Guiding Principles

1. **Never break a working game.** Every change must be tested in a live Foundry session before merge.
2. **One concern per file.** No file should exceed 300 lines. If it does, decompose it.
3. **Pure functions are testable functions.** Separate *what happens* from *how it's displayed*.
4. **Single source of truth.** Every magic number, every constant, every piece of game text lives in exactly one place.
5. **Immutability is non-negotiable.** Never mutate state objects. Always spread.
6. **Comments explain *why*, not *what* or *when*.** The code should be self-documenting. The git log documents history.
7. **Paying customers deserve production-grade code.** No debug files in dist, no stale TODOs, no "works on my machine."
