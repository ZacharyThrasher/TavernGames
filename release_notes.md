### Refactor + Stability
- **Rulesets**: Standard and Goblin roll logic now live in dedicated ruleset modules for easier maintenance.
- **Goblin**: Full‑set reset tracking fixed to prevent infinite rolls after a reset.
- **Side Bets**: Two‑round betting window with pooled payouts and winner flair.
- **State**: Stronger tableData normalization + GM‑only state writes to prevent permission errors.
- **Diagnostics**: Added `runDiagnostics` helper for quick integrity checks.
