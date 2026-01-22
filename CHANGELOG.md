# Changelog

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
