### Standard Roll Reveal Reliability Hotfix
- Restored Standard-mode betting roll animation reliability after the cheat window.
- Hardened end-of-turn reveal selection in `scripts/twenty-one/phases/turn.js` to reveal the most recent unrevealed non-blind roll while `pendingAction` is `cheat_decision`.
- Added table-area wait/retry logic in `scripts/ui/dice-reveal.js` so reveal FX survive transient Application rerenders.
- Added safer app root fallback lookup in `scripts/ui/dice-reveal.js` for render timing edge cases.
- Result: Goblin mode remains stable, and Standard mode now consistently plays the roll reveal animation.
