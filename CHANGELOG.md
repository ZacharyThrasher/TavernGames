# Changelog

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
