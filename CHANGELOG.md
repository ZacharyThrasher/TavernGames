# Changelog

## [4.8.26] - 2026-01-22
### Hotfix 26
- **Regression Fix**: Restored missing animation keyframes for standard (non-versus) Cinematic Cut-Ins. Avatars should now slide in correctly instead of remaining invisible.

## [4.8.25] - 2026-01-22
### Hotfix 25
- **Bug Fix**: Fixed `accusedThisRound` not clearing between rounds, which permanently hid the Accuse button after the first time.
- **Rules Enforcement**: The "Hold" button is now visually disabled in the UI when a player is "Dared", preventing accidental (or intentional) rule-breaking.

## [4.8.24] - 2026-01-22
### Hotfix 24
- **Bug Fix**: Fixed a crash when clicking the "Fold" button caused by a missing import (`createChatCard`).

## [4.8.23] - 2026-01-22
### Hotfix 23
- **Bug Fix**: NPCs now correctly pay for dice using the module's NPC wallet system instead of checking the GM's user character.
- **Rules Enforcement**: The "Hold" button is now disabled when a player is "Dared" (from a Goad), forcing them to roll a d20 or Fold.
- **Maintenance**: Added debug script `debug-fold-wallet.js` to root for diagnosing specific state issues.

## [4.8.22] - 2026-01-22
### Hotfix 22
- **Deprecation Fix**: Updated all dialog template rendering to use `foundry.applications.handlebars.renderTemplate` in compliance with Foundry V13 standards.
- **Debug**: Enhanced Accuse button logging to be unconditional, ensuring we can diagnose visibility issues even if specific conditions fail.

## [4.8.21] - 2026-01-22
### Hotfix 21
- **UI Fix**: Corrected CSS for "Versus Mode" cinematic cut-ins (e.g., Goad, Duel) to ensure player avatars are visible and correctly animated.
- **Debug**: Added logging to trace why the Accuse button might remain hidden for some users despite valid targets.

## [4.8.20] - 2026-01-22
### Hotfix 20
- **Bug Fix**: Fixed missing Accuse section in the sidebar. It now correctly appears during all active round phases (Playing, Inspection, Revealing, Duel) for eligible players.

## [4.8.19] - 2026-01-22
### Hotfix 19
- **Bug Fix**: Resolved a critical issue where "The Cut" phase could get stuck due to a strict ID check and UI state mismatch.
- **Regression Fix**: Restored `isBusted` variable in the UI context to fix broken skill button states.
- **Internal**: Added debug logging for "The Cut" player identification.

## [4.8.17] - 2026-01-22
### Hotfix 17
- **Mechanics**: Removed "Pay to Resist" option from Goad skill. Success now forces the target to roll.
- **UX**: Hunch (Foresight) failures now correctly hide the blind die value from the player's total display until reveal or bust.
- **Bug Fix**: Fixed Accuse button in the sidebar; it now correctly activates upon player portrait selection.

## [4.8.16] - 2026-01-22
### Hotfix 16
- **UI Polish**: Removed the manual "Cheat" button from the skills panel. Cheating is now exclusively handled via the automatic dialog pop-up after a roll to streamline the interface.
- **Push**: Consolidating all recent stabilization and UI fixes into a fresh release.

## [4.8.15] - 2026-01-22
### Hotfix 15
- **UI Fixes**: Added visual indicator for "Blind Dice" (failed Foresight). Added prominent "YOU ARE DARED" warning when Goad backfires.
- **Styling**: Added distinct CSS for blind dice (purple/dashed) and daring warnings (red pulse).

## [4.8.14] - 2026-01-22
### Hotfix 14
- **Critical Crash Fix**: Fixed the "Application Reload" bug when Cheating. The `CheatDialog` was creating nested HTML forms (Application container as `<form>` containing a template `<form>`), which caused the browser to reload the page on submission. The container is now a `<div>`.

## [4.8.13] - 2026-01-22
### Hotfix 13
- **Stability**: Hardened `CheatDialog` form submission logic to use native DOM APIs instead of Foundry helpers, reducing the risk of errors causing client crashes/reloads. Added explicit error trapping to the submit handler.

## [4.8.12] - 2026-01-22
### Hotfix 12
- **Critical Crash Fix**: Fixed a severe application crash caused by the missing `formatMod` Handlebars helper in dialog templates. Registered the helper globally in `main.js`. This resolves the "black screen/reload" issue when attempting to use skills like Cheat, Bump, or Goad.

## [4.8.11] - 2026-01-22
### Hotfix 11
- **Syntax Error**: Fixed `Identifier 'rolls' has already been declared` in `cheat.js` caused by the previous refactor to auto-select dice.

## [4.8.10] - 2026-01-22
### Hotfix 10
- **Mechanics Simplification**: Simplified Cheating mechanics. Players can no longer choose the skill (forced to Sleight of Hand) or the target die (defaults to the last rolled die).
- **UX Fix**: Simplified Cheat Dialog to only show Adjustment options, removing complex dropdowns that were causing confusion and crashes.

## [4.8.9] - 2026-01-22
### Hotfix 9
- **Crash Fix**: Fixed `Missing helper: "selected"` error that prevented `CheatDialog` and `GoadDialog` from rendering. Replaced custom Handlebars helper with standard conditional logic.
- **Cheat Dialog**: Ensured helper functions like `formatMod` are correctly passed to the template context.

## [4.8.8] - 2026-01-22
### Hotfix 8
- **Infinite Roll Fix**: Updated `canAct` logic to prevent players from rolling again while a decision (like Cheat or Retaliation) is pending.
- **Cheat Dialog Stability**: Added error handling to the Cheat Dialog trigger. If the dialog fails to render, the turn will now automatically finish to prevent a soft lock. Added debug logging for cheat flow.

## [4.8.7] - 2026-01-22
### Hotfix 7
- **Critical Fix**: Fixed logic error in `Foresight` (Hunch) skill that caused a crash when failing, and allowed skill spamming (bypassing "one skill per turn" lock) due to state update failure.
- **Cleanup**: Removed invalid socket call (`passTurn`) that didn't exist.

## [4.8.6] - 2026-01-22
### Hotfix 6
- **Localization**: Restored missing English localization keys for all dialogs (Cheat, Bump, Goad, Profile, Accuse, SideBet). This fixes the "broken menu" text strings.

## [4.8.5] - 2026-01-22
### Hotfix 5
- **Critical Fix**: Fixed `CheatDialog` crashing on submission due to incorrect static context handling in `ApplicationV2`. Now properly binds the submit handler to the instance.

## [4.8.4] - 2026-01-22
### Hotfix 4
- **App Crash**: Fixed `ReferenceError: isTheCutPlayer is not defined` in `tavern-app.js` caused by missing variable definitions.

## [4.8.3] - 2026-01-22
### Hotfix 3
- **Socket Error**: Fixed `Uncaught SyntaxError` in `socket.js` by correcting the import path for `playBumpEffect` (moved to `ui/fx.js`).
- **Circular Dependency**: Fixed circular dependency between `tavern-app.js` and `accuse-dialog.js`.

## [4.8.2] - 2026-01-22
### Hotfix 2
- **Import Error**: Fixed another `Uncaught SyntaxError` in `special.js` caused by incorrect import path for `getDieCost`.

## [4.8.1] - 2026-01-22
### Hotfix
- **Import Error**: Fixed `Uncaught SyntaxError` in `turn.js` caused by incorrect import path for `getDieCost`.

## [4.8.0] - 2026-01-22
### V13 AppV2 Refactor & Premium Polish
- **Codebase Modernization**: Refactored major dialogs (`Cheat`, `Profile`, `Goad`, `Bump`, `Accuse`, `SideBet`) into dedicated `ApplicationV2` classes (`scripts/app/dialogs/*.js`) with Handlebars templates. This eliminates inline HTML spaghetti and ensures future V13 compatibility.
- **Cinematic Overlays**: Improved avatar resolution in cut-ins. Now robustly falls back: State Avatar -> Token Image -> Actor Image -> User Avatar -> Mystery Man. This fixes missing avatars in "Showdown" cut-ins.
- **Logic Centralization**: Moved target filtering logic (e.g., `getValidBumpTargets`) to `game-logic.js` to adhere to DRY principles.
- **Visuals**: Standardized dialog styling in `tavern.css` using CSS variables and layers.