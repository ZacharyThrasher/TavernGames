### Debt Reduction Closure + Architecture Stabilization
- Migrated remaining legacy confirmation dialogs to ApplicationV2 with a shared `ConfirmDialog`.
- Completed app decomposition and PARTS-driven render flow (`tavern-client-actions`, `tavern-context`, `tavern-render`).
- Added pure rules modules for Goblin stage progression, duel summary resolution, and betting order logic.
- Expanded test coverage for rulesets and state/table schema behavior.
- Hardened log safety: message normalization to plain text at write time + escaped rendering in logs UI.
- Centralized timing/FX config and improved error surfacing behavior for visual effects.
- Improved keyboard/ARIA support for portrait/target selection and status announcements.
- Added localization helpers/keys for dialog text, empty logs state, and relative-time formatting.
- Removed stale shims/artifacts and documented conventions in `CONTRIBUTING.md`.
