# MEMORY.md — TavernGames

Project
- FoundryVTT module: Tavern Dice Master (Twenty-One + Goblin mode). Repo: `G:\Poneglyph\TavernGames`.
- User wants premium polish, high-stakes goblin mode, no audio, lots of UI flair.

Release Flow
- Bump `module.json` version + download URL.
- Update `CHANGELOG.md` and `release_notes.md`.
- Rebuild `module.zip`:
  - `Compress-Archive -Path module.json, scripts, styles, templates, languages -DestinationPath module.zip`
- `git add …`, `git commit -m "Release vX.Y.Z"`, `git tag -a vX.Y.Z -m "vX.Y.Z"`.
Push/release:
- `git push origin HEAD` and `git push origin vX.Y.Z`
- `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file release_notes.md module.zip module.json`

Current local release tag/commit history
- Latest local release performed: v5.17.5 (commit 9ad24ed) with score surge visibility fix. Tag created.
- Prior local releases: v5.17.4 (score surge), v5.17.3 (UI clarity), v5.17.2 (skill success power), v5.17.1 (skill banners), v5.17.0 (flair pass), v5.16.1 (foresight UI), v5.16.0 (ruleset extraction + stability).

Important fixes/features implemented
- Goblin mode rules:
  - Coin (d2) unlimited rolls; heads = 2x multiplier, tails/nat1 = bust.
  - Each die (d4/6/8/10/20) once per full set; d20 nat20 explodes (roll again).
  - Highest total wins (not closest to 21).
  - Nat1 on any die/coin busts.
  - Players take turns; hold = done unless goaded.
  - No skills, no accuse, no staredown in goblin.
  - Use single public roll (avoid double visuals).
  - Full-set reset tracking fixed with `goblinSetProgress` (prevents infinite resets).
- Goblin score surge effect: pulse + pop text on total increases; now also pulses seat so others see it.
- Coin flip pizzazz: banner + particles, no audio.

UI polish (flair pass)
- Turn halo on current player seat/avatar.
- Risk heat glow on dice tray by total (16/18/20+).
- Bust omen crack on die value 1 (owner sees).
- Skill sigils on last used skill (per turn), even if disabled; skills hidden in goblin.
- Goad/Bump impact ring on target seat.
- Goblin used dice: red "USED" stamp only (removed costLabel text).
- Full-set reset arcane burst on dice tray.
- Side-bet winner laurel icon by player name.
- Pot pulse animation.
- History chips (ROLL/HOLD/BUST/etc) in log.
- Dice stagger animation on your turn; Hold/Fold shake.
- “Put it on the Tab” active state glow/pulse (green).

Skill banners (private, outside logs)
- Added `showSkillBanner` in `scripts/ui/fx.js` + socket registration. Shows stylized banner for:
  - Foresight (success/failed/nat20/nat1) with predictions/values.
  - Profile (success/fail/nat20/nat1) to profiler; nat1 counter-read shown to target.
  - Goad (success/backfire) to attacker + target.
  - Bump (success/backfire) to attacker + target.
- Cheat: `showCheatResult` banner (success/fail) private to cheater.
- Skill success banners now have power glow + arcane burst.
- Banner duration set to ~3.2s; if needed, move lower to avoid cut-in overlap.

State & rules refactor
- Ruleset extraction:
  - `scripts/twenty-one/rulesets/standard.js`
  - `scripts/twenty-one/rulesets/goblin.js`
  - `scripts/twenty-one/rulesets/index.js`
  - `scripts/twenty-one/phases/turn.js` delegates to rulesets.
- `normalizeTableData` in `scripts/state.js` now coalesces missing map fields and validates gameMode.
- Added GM-only guard to `updateState` to avoid permission errors.
- Added diagnostics helper `scripts/diagnostics.js` (exposed via `game.tavernDiceMaster.runDiagnostics`).
- Added `sideBetRound` / `sideBetRoundStart` for two betting rounds; pooled payout.
- Side-bet payout returns winners list for laurel; used in finishRound/duel.
- Private logs mark-seen via socket to avoid non-GM setting writes.

Specific bug fixes
- `emptyTableData` import error in state; added normalization.
- cheat.js duplicate `rolls` declaration fixed earlier.
- `gameMode` duplicate declaration fixed in turn.js.
- `getActorForUser` missing import in turn.js fixed.
- `turn.js` indentation corrected.
- `showScoreSurge` initially only hit totals; now also adds class to seat.
- Heat system:
  - Per-player heat tracked in `tableData.playerHeat`.
  - Cheat dialog now uses per-player heat for DC (instead of global `heatDC`).

Goblin mode mechanics & UI behavior
- Skills hidden in goblin mode (controls template).
- Accuse disabled in goblin (UI + server).
- Staredown skipped in goblin (core.js revealDice -> finishRound).
- Goad/cheat/profile/hunch disabled in goblin (skills check).

Files of interest
- Logic: `scripts/twenty-one/phases/turn.js`, `core.js`, `special.js`, `side-bets.js`.
- Rulesets: `scripts/twenty-one/rulesets/*`.
- Skills: `scripts/twenty-one/skills/*.js`.
- UI: `scripts/app/tavern-app.js`, templates in `templates/parts/*`.
- FX: `scripts/ui/fx.js`, `scripts/ui/particle-fx.js`.
- State: `scripts/state.js`, `scripts/socket.js`.

Current open items to remember
- CODEBASE_REPORT.md exists but should NOT be committed.
- Performance mode skips FX; verify if effects appear.

Quick manual checks
- Run in Foundry console: `game.tavernDiceMaster.runDiagnostics({ verbose: true })`.
- Skill banners should appear without checking logs.
- Goblin score surge should pulse seat and show +N/x2 pop.
