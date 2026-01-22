# Changelog

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

## [4.7.9] - 2026-01-22
### Mechanics & Visuals Refinement
- **Visuals Check**: Fixed issue where Intro avatars didn't match Table avatars (prioritized state over token). Suppressed duplicate 3D dice rolls in Chat Cards.
- **Mechanics**: 
  - Cheat Heat now increases on *every* attempt (even Nat 20/Failures) as requested.
  - Failed Foresight (Blind Hit) now automatically ends the player's turn to streamline flow.

## [4.7.8] - 2026-01-22
### Dice So Nice & Visibility Fixes
- **Dice So Nice Integration**: Added 3D dice rolling during the "Cinematic Pause" of skill cut-ins! Rolls for Goad, Bump, Profile, and Foresight now appear dramatically alongside the cinematic.
- **Avatar Visibility**: Fixed a CSS issue where portraits were pushed off-screen in the Intro Cut-In. Avatars are now correctly centered and visible.
- **Polish**: Forced opacity overrides to prevent "ghost" cut-ins if animations lag.

## [4.7.7] - 2026-01-22
### Dramatic Timing Update
- **Showdown Sequencing**: Implemented a cinematic pause (3-4 seconds) between the "Action" cut-in (e.g., "GOADED!", "BUMP!") and the "Result" overlay. This allows the action to "breathe" and builds suspense before the outcome is revealed.
- **Affected Skills**: Goad, Table Bump, Profile, and Foresight.
- **Feel**: Matches the "Video Game" aesthetic (Persona/Ace Attorney style) where the declaration of an action is distinct from its resolution.

## [4.7.6] - 2026-01-22
### Premium Visuals Update
- **Result Overlays**: Replaced standard chat cards for Goad, Bump, and Profile with dramatic **Result Cinematic Cut-Ins**. These show the roll outcome directly on screen in the Showdown layout.
  - Success/Failure states are clearly marked.
  - Rolls are displayed under the portraits (for Bump/Goad).
- **Cinematic Timing**: Slowed down cut-in entrance animations (from 0.5s to 1.5s) and extended duration (to 5s) for maximum dramatic effect.
- **Showdown Layout Fix**: Fine-tuned avatar positioning (padding 28%) to ensure they are fully visible on screen.

## [4.7.5] - 2026-01-22
### Hotfix
- **Showdown UI Layout**: Fixed broken layout in Versus Cut-Ins. Portraits now correctly appear at the diagonal edges (Top-Left/Bottom-Right) inside the stripe, and text is properly centered and visible.

## [4.7.4] - 2026-01-22
### Showdown Mode & Privacy Fixes
- **Versus Cinematic Mode**: Skills involving two players (Goad, Profile, Bump) now trigger a **Split-Screen Showdown** cut-in, showing both the user and the target face-off!
- **Bump Cut-In**: Replaced the flaky "screen shake" effect with a dedicated **Table Bump** cut-in (Amber colored).
- **GM Privacy**: Cheat results are now correctly blinded/whispered to prevent GM-side spoilers (privileged info leak fixed).

## [4.7.3] - 2026-01-22
### High Drama Update
- **Cinematic Skills**: Added dramatic cinematic cut-ins for **Foresight**, **Goad**, and **Profile** skills to heighten tension. Each has unique colors and text.
- **Cheat Logic Overhaul**: Failing a cheat check (rolling below the Heat DC) now **prevents** the die manipulation from happening. You must beat the heat to change fate!
  - You still accrue Heat for the attempt.
  - Fumbling (Nat 1) still results in getting caught immediately.
- **Visuals**: Further tuned visual effect triggers.

## [4.7.2] - 2026-01-22
### Fixed
- **Bust Cut-In Triggers**: Fixed an issue where the new Bust Cut-In/Fanfare wasn't triggering for normal gameplay busts (only triggered on Hunch fails). Now it consistently plays for any bust event.

## [4.7.1] - 2026-01-22
### Improvements & Fixes
- **Nat 20 Mechanic**: Rolling a Natural 20 on a d20 now instantly sets your total to 21 (instead of adding 21), allowing for clutch saves.
- **Cinematic Cut-Ins**:
  - Now correctly uses the active Token's image and name if available, ensuring consistency with the scene.
  - Falls back to `state.players` avatar (which supports GM-playing-as-NPC) if no token is found.
  - Improved consistency of Bust cut-ins.
- **Visual Effects**:
  - Fixed "Bump Shake Missing" issue by correcting the application window selector for V13 AppV2.
  - Removed debounce lag from shake effects for snappier feedback.

## [4.7.0] - 2026-01-22
### V13 "Premium Sauce" Upgrade
- **Architecture**: Full compliance with Foundry V13 Module Development Guide.
  - Replaced legacy jQuery usage with native DOM in core visual effects.
  - Implemented CSS Layers (`@layer components, utilities, animations`) for robust styling.
  - Exposed module API via `game.modules.get('tavern-dice-master').api`.
  - Added `performanceMode` setting to disable heavy effects on low-end hardware.
- **Cinematic Cut-Ins**: New "Persona-style" full-screen overlays for dramatic moments (Victory, Bust).
  - Uses V13 Frameless Application pattern (`window: { frame: false }`).
  - Features dynamic diagonal stripes, sliding character portraits, and impact text.
  - Properly handles `pointer-events` to allow interaction with the canvas below.
- **Visual Enhancements**:
  - Glassmorphism panels for UI.
  - Particle sparkle effects on victory banners.
  - Enhanced, multi-stage screen shake animations.
  - Pop-in entrance animations for banners.
  - Fonts now consume system variables (`--dnd5e-font-modesto`, etc.) for seamless theming.

## [4.0.2] - 2026-01-21
### Architecture (V4 Refactor)
- **State Migration**: Moved game state from Macro to World Settings for better persistence and stability.
- **NPC Bank System**: Added session-based NPC wallets, GM Join Dialog with "Buy-In", and real-time wallet display.
- **Sound System**: Removed legacy sound system (`scripts/sounds.js`) in preparation for a future audio overhaul.

### Core Mechanics
- **Duel Rework**: Removed stat-based tiebreakers. Now uses a pure "Hit" system (1d20 + 1d4 per hit) with support for re-duels on ties.
- **Cheat Rework**: Removed passive perception. Cheats now trigger a GM whisper.
- **Profile Rework**: Now reveals "Has Cheated: Yes/No" instead of specific die values (Nat 20 reveals exact die).
- **Bump Rework**: Added immunity for players who have Held or Folded.
- **Goad Rework**: "Backfire" now enforces a "Dared" condition (must hit d20 or Fold).
- **Hunch Rework**: Failure now results in a "Blind Hit" (value hidden until reveal).

### UI & Interaction
- **Accuse Rework**: Implemented specific die targeting (Click-to-Accuse) available anytime during the round.
- **Side Bets**: Spectators and folded players can now bet on a champion (2:1 payout).
- **Rules Display**: Updated lobby rules summary.

### Cleanup
- Removed V2 "Scan" code and legacy files.

## [3.0.4] - 2026-01-20
### Fixed
- **App Crash**: Fixed `ReferenceError: accusationMade` by removing obsolete logic for delayed accusations.

## [3.0.3] - 2026-01-20
### Fixed
- **App Crash**: Fixed a critical `ReferenceError: isInGame` that prevented the app from rendering.

## [3.0.2] - 2026-01-20
### Improved
- **Accuse Anytime**: Accusations can now be made at any time during the round (not just Inspection).
- **Accuse Resolution**: Accusations resolve immediately with instant refunds/bounties.
- **Faster Gameplay**: Opening dice rolls (2d10) now happen simultaneously for all players to speed up round start.

### Fixed
- **Bump Turn Restriction**: "Bump the Table" button is now correctly disabled when it's not your turn.
- **Accusation Limit**: Fixed global lockout; accusations are now limited to once per player per round.

## [2.1.3]2026-01-19
### Fixed
- **Cheat Fumble**: Fumbling a cheat roll (rolling < 10 on physical cheat) now correctly results in an immediate Bust, as intended.
- **Table Bump**: Added additional validation to bump actions to ensure the correct die is targeted.

## [2.1.2]2026-01-19
### Fixed
- **Accusation Error**: Fixed "Yes is not a function" error when making an accusation (updated Dialog logic).
- **GM Roll Cost**: GM clients no longer get "Insufficient Gold" prompts when rolling (House plays for free).
- **Cheat Privacy**: Fixed issue where cheat rolls would notify other players of a "Private Roll".

## [2.1.1]2026-01-19
### Fixed
- **GM Payments**: GM clients no longer see the "Put it on the Tab" payment toggle (House plays for free).
- **Cheat Visibility**: Cheating rolls now properly trigger 3D dice (Dice So Nice) visible to the GM and the cheater, but hidden from others.
- **Retaliation**: Fixed a socket exception crash when handling bump retaliation.
- **Disadvantage**: Fixed disadvantage roll formula for Sloppy condition (now correctly keeps lowest die).

## [2.1.0] - Iron Liver Patch

### Added
- **Liquid Currency ("Put it on the Tab")**: Players can now choose to pay for **Dice** using "Drinks" instead of gold. Requires a Constitution Save (DC 10 + 2 per drink). Failure results in "Sloppy" condition. High failure causes a Bust.
- **Dedicated Toggle Button**: Added a "Put it on the Tab" toggle button to the main controls.
- **Sloppy Condition**: Being drunk gives disadvantage on INT, WIS, CHA, and DEX checks (affecting Cheating, Scanning, and Goading).
- **Immovable Object**: "Bump the Table" defense now automatically uses the higher of Dexterity or Constitution saves.
- **Themed Duels**: Duel announcements now include flavor text based on the ability score used (e.g., "Arm Wrestling" for Strength).

### Changed
- **Scan & Accuse Costs**: Scan and Accuse actions now strictly require Gold. You cannot use the Tab for them.
- **UI Improvements**: Updated controls layout and added premium styles for the new toggle button.

### Fixed
- Fixed bug where goaded players could still chose to Hold.
- Fixed accusation cost display and logic.
- Fixed Cheat visibility issue (GM dice visible).
- Fixed Scan vagueness (now gives type/location, not value).