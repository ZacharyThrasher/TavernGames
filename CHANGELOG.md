# Changelog

## [5.28.1] - 2026-02-18
### AI Crew Manager UX + Duel Autoplay Fix
- **Fix**: Autoplay now handles `DUEL` status and automatically submits `duelRoll` for autoplay-enabled participants (with AI-seat preference when multiple autoplay duelists are pending).
- **Feature**: Added a dedicated GM-only **AI Crew Manager** window to replace cramped sidebar controls:
  - Searchable NPC selection (live name filtering)
  - Full add/summon/remove seat management
  - Per-seat autoplay strategy/difficulty controls in a spacious layout
- **UI**: Sidebar AI section now acts as a compact launcher to open the manager window.
- **Infrastructure**: Added new dialog/template wiring for the AI manager and integrated refresh behavior with the main Tavern app render loop.

## [5.28.0] - 2026-02-18
### AI Tavern Crew Expansion + Simulation Sandbox
- **Feature**: Added a full GM-only AI Tavern Crew control panel with:
  - Add single AI NPC seats (actor pick, name override, wallet, playstyle, difficulty)
  - Summon multi-seat AI parties in one click (including mixed-style parties)
  - Per-seat autoplay toggle, playstyle, difficulty, and AI seat removal
- **Feature**: Added server-side AI seat orchestration and validation:
  - New socket handlers: `setAutoplayConfig`, `addAiSeat`, `summonAiParty`, `removeAiSeat`
  - Lobby/Payout-only AI seat management guardrails
  - AI seat cleanup now removes autoplay + wallet state safely
- **Feature**: Expanded autoplay behavior depth:
  - New playstyles: `duelist`, `tactician`, `bully`
  - Difficulty tiers: `easy`, `normal`, `hard`, `legendary`
  - Difficulty now affects pacing, risk thresholds, skill usage frequency, boot usage, cut choices, and cheat behavior
- **Feature**: Added AI-seat compatibility path for pseudo-user IDs:
  - Actor/name resolution now supports non-Foundry AI seat IDs
  - Dice display/public roll attribution now gracefully falls back for AI seats
- **UI**: Added AI metadata badges on seats (`AI <style> / <difficulty>`) and improved autoplay roster context (AI counts + enabled counts).
- **Tooling**: Added a headless simulation sandbox under `simulations/` for strategy iteration, stress testing, and fun-score analysis outside Foundry.

## [5.27.5] - 2026-02-11
### Standard Reveal Rerender Guard Hotfix
- **Fix**: Moved Standard-mode betting reveal execution ahead of log/history writes in `scripts/twenty-one/phases/turn.js` so reveal animations are not interrupted by state-write rerenders.
- **Fix**: Added reveal-active render deferral in `scripts/main.js` for `updateSetting`-driven full app refreshes while `.dice-reveal-overlay` / `.dice-reveal-quick` are active.
- **Fix**: Added matching reveal-active deferral in `scripts/app/tavern-client-actions.js` for direct `app.render()` calls during UI lock transitions.
- **Impact**: Aligns Standard reveal timing behavior closer to Goblin mode and prevents mid-reveal DOM replacement that can hide reel motion.

## [5.27.4] - 2026-02-11
### Reel Animation Visibility Hotfix
- **Fix**: Replaced wall-clock reel cutoff in `scripts/ui/dice-reveal.js` with a guaranteed multi-step spin sequence.
- **Fix**: Reel now always renders visible number-cycling frames before lock-in, even when the main thread is briefly blocked by render/state churn.
- **Fix**: Blind-roll glyph reel now uses deterministic stepped updates instead of an interval that could be starved under heavy rerenders.
- **Impact**: Standard mode now reliably shows the slot-machine style reel phase (not just slam/ring/flash/particles).

## [5.27.3] - 2026-02-11
### Standard Roll Reveal Reliability Hotfix
- **Fix**: Restored Standard-mode betting roll animation reliability by hardening end-of-turn reveal logic in `scripts/twenty-one/phases/turn.js`.
- **Fix**: Reveal dispatch now keys off `pendingAction === "cheat_decision"` and resolves the most recent unrevealed non-blind roll, preventing silent skips when cheat flow mutates state timing.
- **Fix**: Added DOM-settle resilience in `scripts/ui/dice-reveal.js` by waiting for `.tavern-table-area` to exist before playing reveal FX.
- **Fix**: Broadened app root lookup fallback in `scripts/ui/dice-reveal.js` to handle transient render states.
- **Impact**: Goblin mode behavior remains unchanged; Standard mode now consistently plays roll reveal animation after the cheat window/turn resolution.

## [5.27.2] - 2026-02-11
### UI Regression Hotfix (Post-PARTS Refactor)
- **Fix**: Restored stable full-app render path to resolve incomplete UI rendering introduced by partial PARTS updates.
- **Fix**: Reverted Tavern app PART definitions back to `main` only:
  - `scripts/app/tavern-app.js`
- **Fix**: Reverted update-setting refresh behavior to full render (`app.render()`), eliminating partial update desync:
  - `scripts/main.js`
- **Fix**: Removed PART markers from structural containers to prevent DOM replacement mismatches:
  - `templates/tavern-app.hbs`
- **Impact**: Restores expected visual framing (wood trim/layout), full control panel behavior, and dice/action interaction reliability.

## [5.27.1] - 2026-02-11
### Foundry PARTS Rendering Hotfix
- **Fix**: Resolved Foundry V13 ApplicationV2 PARTS render crash:
  - `Template part "header" must render a single HTML element.`
- **Fix**: Updated PART templates to comply with single-root requirement:
  - `templates/parts/header.hbs` now renders one root wrapper.
  - `templates/parts/footer.hbs` now renders one root wrapper.
- **Style**: Added wrapper layout rules to preserve prior header/footer alignment:
  - `styles/tavern.css` (`.tavern-header-part`, `.tavern-footer-part`).
- **Impact**: `tavern-dice-master` renders reliably again with PARTS-based updates enabled.

## [5.27.0] - 2026-02-11
### Debt Reduction Closure + Architecture Stabilization
- **Architecture**: Completed ApplicationV2 dialog migration with new `GMJoinDialog`, `GoblinHoldDialog`, `PrivateFeedbackDialog`, and shared `ConfirmDialog`; removed remaining legacy `Dialog.confirm` usage from client actions.
- **Refactor**: Finished decomposition around the app shell by routing behavior through `tavern-client-actions`, `tavern-context`, and `tavern-render` modules; retained PARTS-based rendering paths for targeted updates.
- **State**: Added cached `getState()` stability and queue flush support, centralized object coercion helpers, and tightened normalization paths for grouped table sections.
- **Rules Extraction**: Added pure rules modules for goblin stage progression, duel result summarization, and betting order calculation:
  - `scripts/twenty-one/rules/goblin-rules.js`
  - `scripts/twenty-one/rules/duel-rules.js`
  - `scripts/twenty-one/rules/turn-order.js`
- **Testing**: Expanded automated coverage with new `rulesets` spec cases for goblin stage transitions, duel tie/winner resolution, and betting order behavior.
- **Safety**: Hardened private/public log pipeline by normalizing messages to plain text at write time and rendering escaped content in UI; preserves multiline readability while removing HTML rendering coupling in the logs window.
- **FX Reliability**: Kept effect error isolation with debug surfacing support and centralized FX constants/configuration for timing/particle tunables.
- **Accessibility**: Standardized keyboard/ARIA behavior across portrait/target selectors and dynamic controls; added live-region status support in app layout.
- **Localization**: Added and reused fallback localization helpers for notifications, dialog labels, log empty state, and relative-time text.
- **Cleanup**: Removed stale legacy shims/artifacts (`scripts/constants.js`, root debug script moved under `dev/`) and added `CONTRIBUTING.md` conventions for layer naming and release quality gates.

## [5.26.0] - 2026-02-08
### Premium Effects Engine — "Addicted to the Table" 🎰✨
- **Feature**: Holographic 3D-Tilt Dice Buttons — Pokémon-card style prismatic rainbow refraction that follows the cursor across each die button, with `mix-blend-mode: overlay`, per-button perspective transforms (±16° rotateX/Y), and specular highlight tracking. Scoped to `:not(.is-used)` to coexist with the Goblin "USED" stamp.
- **Feature**: Odometer-Style Tumbling Gold Counter — pot display digits rebuild as individual slot-machine reels that cascade to their target value with cubic-bezier easing. Comma separators for thousands. Gold shimmer text-shadow on value change. First render skips animation; subsequent updates tumble.
- **Feature**: Heartbeat Tension Border — a living, breathing `::after` border on the game window that pulses with a realistic lub-DUB double-beat pattern at three risk tiers:
  - **Warm** (16+): Slow 2.5s amber pulse.
  - **Hot** (18+): Anxious 1.5s orange pulse.
  - **Critical** (20): Rapid 0.8s crimson alarm pulse.
- **Feature**: Win Streak Flame Aura — NBA Jam "HE'S ON FIRE!" tiered flame system on player avatars during consecutive wins:
  - **Streak 1**: Soft ember glow with radial gradient.
  - **Streak 2**: Medium flame aura with 🔥 emoji badge.
  - **Streak 3+**: Full inferno with multi-layer radial flames, blazing 🔥 icon, and "ON FIRE!" name badge.
- **Feature**: Enchanted Gold Dust Cursor Trail — magical particle motes that follow the cursor inside the table area with upward drift, fade, and per-theme color overrides (green for Goblin, purple for Underdark, teal for Feywild, bright gold for Gilded Dragon). Throttled to 60ms intervals, max 30 concurrent motes.
- **Feature**: Living Felt Table Surface — sacred geometry warding circles (nested rotating rings with cross-line patterns) that breathe in and out at ultra-low opacity. Intensity increases with pot escalation tiers (`heated` → `blazing`). Per-theme color overrides.
- **Feature**: Animated Crown on Leading Player — floating golden Font Awesome crown icon above the leading player's avatar with sparkle particles (`✦`) and multi-phase bob animation.
- **Feature**: Glass Morphism Pulse Band — frosted glass `backdrop-filter: blur(8px)` on pulse cards with `@property --border-angle` rotating gradient border that activates at `charged`/`volatile`/`critical` intensity. Includes a sweeping glass reflection highlight.
- **Feature**: "Your Turn" Spotlight — dramatic conic-gradient theatrical spotlight that sweeps across the controls panel when it's your turn, with a pulsing gold edge sparkle line.
- **Feature**: Premium Hover Orbs on Die Faces — rolled dice in player seats lift with `scale(1.25) translateY(-4px)` and glow with gold box-shadow on hover.
- **Feature**: Cinematic Seat Entrance Stagger — player seats cascade in with staggered animation (0.05s–0.4s delays), including 3D `rotateX(15deg)` entrance, blur fade, and overshoot bounce.
- **Feature**: Fortune's Shimmer Loading State — animated gold sweep that slides across waiting player seats during turn transitions.
- **Feature**: Sacred Geometry Background — subliminal rotating geometric pattern (concentric circles + cross/diagonal lines) behind the table at 1.5% opacity with 120s rotation. Per-theme color overrides for all 5 themes.
- **Feature**: Button Enchantment Trails — skewed light sweep that slides across action buttons on hover (`btn-primary`, `btn-success`, `btn-skill`, `btn-hold`).
- **Feature**: Avatar Ring of Power — rotating dashed arcane ring on the active player's avatar. Implemented as an injected DOM element (not `::before`) to coexist with streak flame auras.
- **Feature**: Natural 1 Omen Cracks — hairline CSS fracture overlay on die faces showing a Natural 1, with four intersecting crack lines in red and a 0.3s crack-appear entrance animation.
- **Feature**: Gold Coin Flip on Pot Changes — flipping coin icon (`fa-coins`) that appears above the pot display when gold is added, with 3D `rotateY` flip and upward drift.
- **Feature**: Table Ripple on Dice Roll — expanding ring effect on the table surface during the dice reveal SLAM phase, like a stone dropped in water.
- **Feature**: Win/Loss Streak Tracking — `StreakTracker` records consecutive wins/losses per player via `showVictoryFanfare`/`showBustFanfare`, applies `data-streak` attributes to seats for CSS flame auras, and resets on bust.
- **JS**: New `scripts/ui/premium-fx.js` — ~540 lines: 11 exported systems (`HolographicTilt`, `GoldOdometer`, `GoldDustTrail`, `spawnTableRipple`, `injectCrownJewels`, `injectTableEnchantment`, `spawnPotCoinFlip`, `injectArcaneRing`, `StreakTracker`, `initPremiumEffects`, `teardownPremiumEffects`).
- **CSS**: New `styles/premium-fx.css` — ~1,180 lines: 17 effect systems with per-theme overrides and full `prefers-reduced-motion` support.
- **Integration**: Wired into `tavern-app.js` `_onRender` (teardown/init cycle), `fx.js` (streak tracking in victory/bust fanfares, coin flip in pot pulse), and `dice-reveal.js` (table ripple on SLAM phase).
- **Fix**: Resolved `::after` pseudo-element collision between heartbeat tension border and sacred geometry background on `.tavern-container` — heartbeat rules now explicitly reset inherited geometry properties.
- **Fix**: Avoided `::before` collision between streak flame auras and arcane ring on `.player-avatar` — ring uses injected DOM element instead.
- **Fix**: Scoped holographic `::after` overlay to `.btn-die-premium:not(.is-used)` to preserve Goblin Mode "USED" stamp.
- **Perf**: All 17 CSS systems and 11 JS systems respect `isPerformanceMode()` and `prefers-reduced-motion: reduce`. Cursor-driven effects use passive event listeners and throttling.

## [5.25.0] - 2026-02-08
### Table Pulse Broadcast HUD
- **Feature**: Added a new cinematic top-of-table HUD strip (`tavern-pulseband`) with five live cards:
  - **Phase** (smart round/phase labeling with contextual hinting)
  - **Pot Heat** (dynamic meter driven by pot-to-ante ratio)
  - **Table Pressure** (computed volatility score using pot, eliminations, status, and risk)
  - **Spotlight** (current focus actor and action cue)
  - **Oracle** (live “safest die” bust-risk guidance during active betting turns)
- **Feature**: Added a real-time event feedline sourced from recent history entries with iconized chips and sanitized/truncated copy for readability.
- **UI/Style**: Introduced a bespoke premium visual language for the HUD/feedline:
  - angular clipped cards, shimmer sweep, animated meter fills, pressure-state border escalation (`charged`, `volatile`, `critical`), and responsive mobile breakpoints.
- **Accessibility/Perf**: Added reduced-motion fallbacks for all new HUD/feedline animation paths.
- **Fix**: Corrected an unclosed `@keyframes pulse-badge` block in `styles/tavern.css` that could invalidate/absorb trailing CSS in some parsers.

## [5.24.0] - 2026-02-07
### Cinematic Cut-In Overhaul — PIZAZZ Edition 🎬💥
- **Feature**: Complete visual redesign of all 14 cinematic cut-in types with anime/fighting-game inspired multi-layer presentation.
  - **Letterbox Bars**: Black cinematic bars slam in from top and bottom for instant movie-frame drama.
  - **Radial Flash**: Type-colored full-screen burst on entrance — gold for CRITICAL, crimson for BUST, purple for FORESIGHT, etc.
  - **Vignette Darken**: Per-type vignette overlays focus attention — blood-red for BUST/SUDDEN_DEATH, deep purple for FORESIGHT, cold blue for STAREDOWN.
  - **Speed Lines**: Rotating conic-gradient radial burst with per-type hue/saturation filters for directional energy.
  - **Dual Stripe + Echo**: Primary stripe with a trailing ghost echo that follows with blur and fade — doubles the sense of motion.
  - **Stripe Edge Sparks**: White-hot gradient lines on stripe borders for that razor-sharp slash feel.
- **Feature**: Emblem Watermark System — massive semi-transparent Font Awesome icon bursts in behind text for each type:
  - CRITICAL → ⭐ Star, BUST → 💀 Skull, VICTORY → 👑 Crown, DUEL → ⚔️ Khanda, SUDDEN_DEATH → ☠️ Skull & Crossbones, COIN_STAGE → 🪙 Coins, FORESIGHT → 👁️ Eye, GOAD → ✊ Fist, PROFILE → 🔍 Magnifying Glass, BUMP → 🤜 Back Fist, ACCUSE → ⚖️ Gavel, STAREDOWN → 👁️‍🗨️ Eye Low Vision, BOOT → 👢 Shoe Prints, BOOT_EARNED → 🏆 Trophy.
- **Feature**: Per-type particle effects on every cut-in — gold spark bursts for CRITICAL, blood sparks for BUST, coin showers for VICTORY/COIN_STAGE, arcane motes for FORESIGHT/STAREDOWN, ember bursts for GOAD/BUMP/DUEL, mint sparks for BOOT. Secondary particle waves for CRITICAL and BUST for extra intensity.
- **Feature**: Screen shake on impact types — BUST, BUMP, SUDDEN_DEATH, ACCUSE, BOOT, DUEL, and CRITICAL shake the entire viewport. SUDDEN_DEATH gets heavier intensity.
- **Feature**: Portrait overhaul — overshoot bounce entrance, radial energy aura pulse (`::before`), white flash on land (`::after`), name bar with type-colored accent underline. Target portraits now mirror in from the left.
- **Feature**: Title treatment upgrade — chromatic aberration text-shadow (red/blue color split), three-phase animation (slam → settle → chromatic snap), gradient underline stamp bar.
- **Feature**: 14 unique visual identities — each type has its own: stripe gradient, speed-line filter, title color + shadows, looping secondary animation, and vignette tint:
  - **CRITICAL**: Golden radiance with pulsing glow halo.
  - **BUST**: Crimson shatter with screen shake and blood-red vignette.
  - **VICTORY**: Grand gold with premium metallic stripe gradient and scale pulse.
  - **DUEL**: Red-gold crossed-energy stripe with subtle flicker.
  - **SUDDEN_DEATH**: Intensifying blood-red with dark vignette, shake, and death pulse.
  - **COIN_STAGE**: Golden spotlight with shimmer filter.
  - **FORESIGHT**: Arcane purple with mystic float and deep purple vignette.
  - **GOAD**: Aggressive orange-fire with taunting scale oscillation.
  - **PROFILE**: Digital teal with scan-line stripe, monospace font, and glitch jumps.
  - **BUMP**: Seismic red-amber with heavy impact bounce.
  - **ACCUSE**: Accusatory red with dark vignette and shake.
  - **STAREDOWN**: Cold blue intensity with slow pulse glow and muted speed lines.
  - **BOOT**: Goblin chaos green with dark-to-bright stripe and shake.
  - **BOOT_EARNED**: Goblin gold achievement with metallic stripe and victory pulse.
- **Feature**: Coordinated exit sequence — `.cin-exiting` class triggers staggered departure: stripe slides out, portrait slides off, text scales away, letterbox bars retract, effects fade. Display duration tuned to 4.2s entrance + 450ms exit (previously hard 5s cut).
- **CSS**: New `styles/cinematic-overlay.css` — ~530 lines: complete cinematic system with `@layer animations`, all entrance/exit keyframes, 14 type overrides, versus mode (preserved), results styling, reduced motion support.
- **CSS**: Removed ~600 lines of old cinematic overlay CSS from `styles/tavern.css` (old `@layer animations` block, versus mode, portrait results, dead `.single-mode-container` rules).
- **Template**: Redesigned `cinematic-overlay.hbs` (80 → 109 lines) — layered structure: letterbox → flash → vignette → speed lines → stripe + echo → emblem → content → particles → sparkles → victory overlay.
- **JS**: Enhanced `cinematic-overlay.js` (209 → 281 lines) — `EMBLEM_MAP`, `PARTICLE_MAP`, `SHAKE_TYPES` static configs; staggered particle spawning; secondary particle waves; self-contained screen shake; exit animation timing.
- **Perf**: All new animations respect `prefers-reduced-motion` (speed lines and sparkles fully hidden, all animations collapsed to 0.01ms).

## [5.23.0] - 2026-02-07
### Fortune's Reveal — Cinematic Dice System 🎲✨
- **Feature**: Fortune's Reveal — a multi-phase dramatic in-app dice animation that replaces Dice So Nice for all table rolls, keeping every moment of tension inside the game window.
  - **Phase 1 — Dim**: Vignette overlay darkens the table, focusing attention.
  - **Phase 2 — Impact Drop**: Die icon slams center-table from above with impact ring ripple + screen shake.
  - **Phase 3 — Number Reel**: Decelerating cycle through possible values (30ms → 150ms, quadratic easing) in dramatic font. Blind rolls show scrambled glyphs landing on "?".
  - **Phase 4 — Lock-In**: Result slams into place with context-colored flash burst + themed spark particles.
  - **Phase 5 — Flight**: Number CSS-animates from center to the rolling player's seat, landing with a brief golden glow.
  - **Phase 6 — Cleanup**: Overlay fades, all DOM removed.
- **Feature**: Queued reveals — rapid successive rolls queue with compressed timing (~1.2s vs ~2s) instead of stacking or conflicting.
- **Feature**: Context-aware visuals — bust (crimson shatter + blood sparks), jackpot/21 (gold explosion + coin shower), natural 20 (prismatic hue-rotate), normal (theme-accent sparks).
- **Feature**: Enhanced Player Seat Auras — radial gradient aura pseudo-elements on seats driven by risk level:
  - Warm (16+): Soft amber radial glow, slow 3s pulse.
  - Hot (18+): Orange glow with shimmer, 1.8s pulse.
  - Critical (20): Intense red aura with ember-like box-shadow particles, rapid 1s pulse.
  - Leading: Golden crown aura on players who hold with the highest score.
- **Theme**: All reveals and auras have per-theme color overrides — Goblin's Den (sickly green), Underdark (purple/faerzress), Gilded Dragon (molten gold), Feywild (iridescent color-shift).
- **DSN Coexistence**: Fortune's Reveal replaces DSN for table rolls (standard opening, betting reveals, goblin rolls). Skill checks (bump, goad, profile, hunch), duels, and the end-of-opening mass reveal continue using DSN. DSN remains a soft dependency.
- **Blind Roll Safety**: Blind rolls (from Foresight failure) show a scrambled glyph reel landing on "?" — no value is ever leaked. Previous DSN integration leaked blind values through 3D dice visuals; this is now fixed.
- **Fix**: Risk warnings no longer appear in Goblin Mode (where totals routinely exceed 21 and busting at 21 doesn't exist).
- **JS**: New `scripts/ui/dice-reveal.js` — ~270 lines: reveal engine with queue system, 6-phase animation, performance mode fallback, context coloring, seat targeting.
- **CSS**: New `styles/dice-reveal.css` — ~470 lines: overlay, die slam, impact ring, number reel, lock-in flash, flight animation, seat glow, per-theme overrides, reduced motion support.
- **CSS**: Enhanced `styles/atmosphere.css` — seat aura system with `::before` pseudo-elements, `data-leading` attribute styling, per-theme aura overrides.
- **Perf**: Performance mode collapses the full reveal to a single brief flash + instant number. All new animations respect `prefers-reduced-motion`.

## [5.22.0] - 2026-02-07
### Atmosphere & Immersion Layer 🎭
- **Feature**: Theme Flavor Engine — every theme now has a unique voice with dynamic subtitles, themed icons, turn stingers, risk warnings, and rotating atmosphere lines.
  - **Sword Coast**: *"A Game of Fortune & Folly"* — warm candlelit prose.
  - **Goblin's Den**: *"Cheat. Steal. Survive."* — crude, chaotic goblin screaming.
  - **Underdark**: *"Where Shadows Play for Keeps"* — whispers from the void.
  - **Gilded Dragon**: *"Where Fortunes Rise & Empires Fall"* — imperial opulence.
  - **Feywild**: *"A Whimsical Wager Under Starlight"* — playful fey charm.
- **Feature**: Pot Escalation Tiers — the pot display visually transforms as gold accumulates (warm glow → heated pulse → blazing fire aura with icon animation).
- **Feature**: Risk-Reactive Player Seats — your seat visually shifts as danger mounts (amber tint at 16+, pulsing orange at 18+, red glow + micro-tremble at 20).
- **Feature**: Risk-Reactive Dice Buttons — dice button borders and shadows shift to danger tones at hot/critical risk.
- **Feature**: Turn Stinger — cinematic one-shot text appears over the table when your turn begins (*"The dice are yours…"*, *"ROLL, MEAT!"*, etc.), unique per theme.
- **Feature**: Themed Risk Warnings — the controls panel shows color-coded thematic warnings (*"The void hungers for you."*, *"THE DRAGON WAKES!"*) instead of generic UI text.
- **Feature**: Atmosphere Line — the footer status text is replaced by rotating ambient flavor (*"The candle sputters. Someone at this table is lying."*), stable across re-renders.
- **UI**: Themed empty table states with unique icon, title, and flavor text per theme.
- **UI**: Themed logo icon per theme (d20, skull, spider, dragon, wand).
- **CSS**: New `styles/atmosphere.css` — pot tiers, risk seats, stinger animation, atmosphere line, empty table, performance overrides.
- **JS**: New `scripts/ui/theme-flavor.js` — 300+ lines of thematic creative text data with stable-rotation and per-theme accessor functions.
- **Perf**: All new effects respect `prefers-reduced-motion` and `performanceMode`.

## [5.21.1] - 2026-02-06
### Cheat + Turn Integrity Hotfix
- **Fix**: Prevented repeat rolls while a cheat decision is pending (`pendingAction: cheat_decision`).
- **Fix**: Restored reliable turn advancement after cheat resolution by fixing `finishTurn` game mode handling.
- **Rules**: Cheating a blind die is now blocked server-side.
- **UI**: Manual cheat action now warns and blocks on blind dice.

## [5.21.0] - 2026-02-05
### Table Themes 🎨
- **Feature**: 5 selectable UI themes — each transforms the entire look and feel of the tavern table.
  - **Sword Coast Tavern** (Classic) — Warm wood, parchment & candlelight. The original.
  - **Goblin's Den** — Grimy acid-green, swamp rot, tarnished copper. Sickly torchlight flicker. Perfect for Goblin Mode.
  - **Underdark Parlor** — Deep purple obsidian, amethyst accents, bioluminescent mushroom motes. Faerzress ambient pulse.
  - **Gilded Dragon** — Opulent imperial crimson & bright gold on obsidian. Ember glow. A high-roller dragon's hoard.
  - **Feywild Garden** — Ethereal teal & soft pink, iridescent shimmer, floating pixie motes. Moonlit enchantment.
- **UI**: Theme selector dropdown added to House Rules panel (GM-only, lobby).
- **Setting**: New `tableTheme` world setting (also available in Module Settings). All players see the host's chosen theme.
- **CSS**: New `styles/themes.css` — per-theme overrides for 40+ CSS variables, ambient glow animations, table surfaces, die-face palettes, mote particles, scrollbars, and smooth 0.4s transition on theme switch.
- **i18n**: Theme names and flavor descriptions added to `en.json`.

## [5.20.5] - 2026-02-02
### UI Juice Pass
- **UI**: Added tactile click bursts (spark + ripple) across core actions and dice buttons.
- **UI**: New hover lift + press animations for seats, dice, and action buttons.
- **FX**: Ambient parallax glow layers and table motes for a more alive tavern feel.
- **Perf**: Respects reduced-motion and performance mode for effects.

## [5.20.4] - 2026-01-31
### Goblin Last-Roll Win
- **Goblin**: If only one non-holding player remains and they are the sole leader, their successful roll immediately wins the round.

## [5.20.3] - 2026-01-29
### Score Pop Effects
- **UI**: Score pop numbers now scale with roll size, with heavier punch and shake for big gains.
- **FX**: Added extra coin-flair and glow layers for large pops.

## [5.20.2] - 2026-01-29
### Profile Skill Hotfix
- **Fix**: Resolved a syntax error in `Profile` caused by duplicate `safeUserName` declarations.

## [5.19.0] - 2026-01-28
### Goblin Mode: The Chamber Overhaul
- **Goblin**: Forced stage dice (d20 → d12 → d10 → d8 → d6 → d4), then Sudden Death coin.
- **Goblin**: Natural 1 = death (score 0); max roll earns a Boot to break a Hold.
- **Goblin**: Hold is leader‑only; Coward’s Tax (hold before d8) pays 50% of pot.
- **Goblin**: Sudden Death coin repeats until a clear winner; total wipeout keeps pot for House.
- **UI/Docs**: New Goblin controls, Boot dialog, and rules/help updates.

## [5.18.18] - 2026-01-26
### Goblin Sudden Death Fix (2)
- **Goblin**: Sudden‑death no longer ends after the first player’s roll.

## [5.18.17] - 2026-01-26
### Goblin Sudden Death Fix
- **Goblin**: Sudden‑death participants can roll even if they were previously holding.

## [5.18.16] - 2026-01-26
### Goblin UI + Sudden Death
- **Goblin**: Coin tails now sets score to 1 (visible total fixed) and banner updated.
- **Goblin**: Help dialog updated for new rules + hold countdown.
- **Goblin**: Sudden Death cut‑in replaces Duel for ties (custom styling).

## [5.18.15] - 2026-01-26
### Goblin Rules Update
- **Goblin**: Multi-roll turns, end-turn on 1, coin tail sets score to 1, final-round hold countdown.
- **Goblin**: Used-dice lockout + full-set reset preserved; max-value rolls can explode.
- **Docs**: RULES.md updated to match current behavior.

## [5.18.14] - 2026-01-26
### Dice Hover Fix
- **UI**: Force hover jitter/glow on dice buttons via JS class fallback.

## [5.18.13] - 2026-01-26
### Revert: Audio
- **Revert**: Removed recent sound effects and audio hooks.

## [5.18.10] - 2026-01-26
### Revert: POP Pack 2
- **Revert**: Removed the experimental POP Pack 2 visuals per feedback.

## [5.18.8] - 2026-01-26
### Visual POP Pack
- **Impact**: Added impact frame flashes on jackpots/coin heads.
- **Dice**: Hover charge jitter + glow on dice buttons.
- **Totals**: Slam animation on score surges.
- **Tab**: Ale splash particles and cut‑off glare.

## [5.18.7] - 2026-01-26
### Tab + Retaliation Polish
- **Tab**: Cut‑off banner now triggers the moment a player becomes sloppy.
- **Tab**: Rolls on the tab no longer add to the pot.
- **Retaliation**: Die values now overlay the die icons; labels are brighter.

## [5.18.6] - 2026-01-26
### Retaliation Clarity
- **UI**: Retaliation dice now show values; hole dice display as “?”.
- **UX**: Added visible value badges to the retaliation picker.

## [5.18.5] - 2026-01-26
### Tab Clarity
- **UI**: “Put it on the Tab” now displays a private banner with the CON check result.
- **Sockets**: Added client FX hook for drink checks.

## [5.18.4] - 2026-01-26
### Cheat Integrity
- **Bug Fix**: Failed cheat attempts no longer change the die value.
- **Rules**: Nat 20 on the cheat check now always succeeds (invisible cheat).
- **Telemetry**: Cheat records now distinguish proposed vs applied values.

## [5.18.3] - 2026-01-25
### Cut‑In V2
- **Cinematics**: Punch‑in + stomp, staggered timing, and stamped underline glow.
- **Portraits**: Type‑tinted rim lighting for extra pop.
- **Cheat Reveal**: Score surge now respects cheat reveal timing.
- **Liquid Mode**: Hidden in Goblin, “Cut Off” state when sloppy.
- **API**: Exposed new FX helpers for manual testing.

## [5.18.2] - 2026-01-25
### WOW Pass
- **Score Pop**: Big, flashy casino-style pop numbers + burst glow.
- **Surge Glow**: Stronger seat glow on score increases.
- **Skill Success**: Heavier arcane burst intensity.

## [5.18.1] - 2026-01-25
### Visual Timing Fix
- **Impact FX**: Delayed DOM effects slightly to apply after re-render (prevents missing animations).

## [5.18.0] - 2026-01-25
### Impact Pass (Visual Only)
- **Score Impact**: Squash/stretch + seat pulse on score increases.
- **Pot Pulse**: Breathing animation after rolls.
- **Jackpot Inlay**: Pot glow on big wins.
- **Bust Flash**: Red vignette impact on busts.

## [5.17.5] - 2026-01-25
### Goblin: Score Surge Visibility
- **Goblin Scores**: Score surge now also pulses the player seat so all clients can see it.

## [5.17.4] - 2026-01-25
### Goblin: Score Surge
- **Goblin Scores**: High roll increases now trigger a casino‑style score surge (pulse + pop text).

## [5.17.3] - 2026-01-25
### UI: Clarity Tweaks
- **Goblin Used Dice**: Removed redundant "USED" cost label (stamp only).
- **Put it on the Tab**: Stronger active-state glow and pulse for clarity.

## [5.17.2] - 2026-01-25
### UI: Skill Success Power
- **Skill Success**: Power glow + pulse and arcane burst for successful skill checks.

## [5.17.1] - 2026-01-25
### UI: Skill Result Banners
- **Skills**: Private, stylized result banners for Foresight, Profile, Goad, and Bump.
- **Cheat**: Added private success/failure banner for cheating results.

## [5.17.0] - 2026-01-25
### UI Polish: Flair Pass
- **Turn Halo**: Current player seat + avatar glow with pulse.
- **Risk Heat**: Dice tray glow intensifies at 16/18/20+ totals.
- **Omen Crack**: Subtle bust omen on any die showing a 1 (owner only).
- **Skill Sigils**: Glowing sigils show the last skill used this turn.
- **Impact Rings**: Goad/Bump targets get a quick impact ring.
- **Goblin Stamp**: Used dice get a stamped "USED" badge.
- **Full‑Set Burst**: Arcane particle burst on Goblin full‑set reset.
- **Side Bet Laurel**: Winner laurel icon on player name.
- **Pot Pulse**: Pot total gently pulses during play.
- **History Chips**: Outcome chips (ROLL/HOLD/BUST/etc) in the game log.
- **Dice Stagger**: Dice buttons stagger in on your turn.
- **Hold/Fold Shake**: Subtle shake on hover for high‑stakes buttons.

## [5.16.1] - 2026-01-25
### UI: Foresight Clarity
- **Foresight**: Added purple high/low arrow indicators on dice buttons.
- **Nat 20**: Added floating exact-value badges on dice buttons.

## [5.16.0] - 2026-01-25
### Refactor + Stability
- **Rulesets**: Split Standard and Goblin roll logic into dedicated ruleset modules for maintainability.
- **Goblin**: Full-set reset tracking fixed to prevent infinite rolls after reset.
- **Side Bets**: Two-round betting window + pooled payouts with winner flair.
- **State**: Stronger tableData normalization + GM-only state writes to prevent permissions errors.
- **Diagnostics**: Added a `runDiagnostics` helper for quick integrity checks.

## [5.15.2] - 2026-01-25
### Hotfix: Duplicate Dice Visuals
- **Fix**: Prevented double dice rolls in Goblin mode by using a single public DSN call.

## [5.15.1] - 2026-01-25
### Side Bets: Winner Flair
- **Payout Feedback**: Side‑bet winners now get floating gold text and a private win log.

## [5.15.0] - 2026-01-25
### UI: Goblin Rules Help Page
- **Help Dialog**: Added a dedicated Goblin Rules page to the in‑game help UI.

## [5.14.9] - 2026-01-25
### Hotfix: Duplicate Declaration
- **Fix**: Resolved duplicate `gameMode` declaration in `turn.js`.

## [5.14.8] - 2026-01-25
### Hotfix: Goblin Mode Rules + Log Permissions
- **Goblin Rules**: Skills disabled and roll visibility deferred until cheat resolution.
- **Fix**: Non-GM log updates now route through GM to avoid setting permission errors.

## [5.14.7] - 2026-01-25
### Hotfix: State Initialization
- **Fix**: Import `emptyTableData` in `state.js` to prevent startup crash.

## [5.14.6] - 2026-01-25
### Hotfix: Cheat Syntax Error
- **Fix**: Resolved duplicate `rolls` declaration in `cheat.js` causing a startup syntax error.

## [5.14.5] - 2026-01-25
### Hotfix + Refactor: Goblin Rules & Stability
- **Goblin Rules**: Start at 0, skip opening/cut, coin unlimited, Nat 1 bust, Nat 20 explode, highest total wins.
- **Cheat Fixes**: Restored cheat application, logs, heat tracking, and goblin-aware total recalculation.
- **Stability**: Normalized tableData schema defaults and reset behavior; fixed blind roll timing and UI duplication.

## [5.8.2] - 2026-01-23
### Hotfix: Missing Module Export (Game Log)
- **Fix**: Resolved `does not provide an export named 'addLogToAll'` error in `state.js`.

## [5.8.1] - 2026-01-23
### Hotfix: Syntax Error (Game Log)
- **Fix**: Resolved `Identifier 'orderNames' has already been declared` in `turn.js`.

## [5.8.0] - 2026-01-23
### Features: Private Game Log & Anti-Cheat
- **Game Log System**: Replaced all Chat Cards with a built-in "Private Log" panel in the sidebar.
    - **Public Events** (Rolls, Bumps, Busts) appear for everyone.
    - **Private Events** (Hunch, Cheat results) appear ONLY for you.
    - **Targeted Events**: You now receive specific alerts when Bumped or Goaded.
- **True Blindness**: Players who are in a "Blind State" (from Hunch failure) can no longer open the Cheat Dialog (preventing them from seeing the die value via UI).

## [5.7.2] - 2026-01-23
### Hotfix: Syntax Error
- **Breaking Change**: Fixed a critical syntax error in `turn.js` that broke the game loop upon roll submission.

## [5.7.1] - 2026-01-23
### Documentation: Polish
- **Skill Summary**: Refined the summary table in `RULES.md` for better readability, using line breaks and clearer terminology for success/failure states.

## [5.7.0] - 2026-01-23
### Mechanics: High Stakes Overhaul
- **Foresight (Hunch)**:
    - **Backfire**: Now puts you in **Blind State** (Next roll hidden), but lets you *choose* your die (paying standard costs).
    - **Nat 1**: Locked into **Blind d20** (High risk, hidden result).
- **Goad**:
    - **Symmetry**: Backfire now forces **YOU** to Hit or Fold (Same as target). Removed Ante cost.
    - **Nat 20**: Target locked into **d20**.
    - **Nat 1**: You locked into **d20**.
- **Iron Liver**:
    - **Sloppy**: Gaining the condition now **Reveals your Hole Die**.
- **Cheat**:
    - **Failure**: Heat increases by **+4** (Punitive) instead of +2.

## [5.6.0] - 2026-01-23
### Documentation: Skill Reference Table
- **Quick Reference**: Added a comprehensive table to `RULES.md` summarizing every skill's effect, failure state, Nat 20 bonus, and Nat 1 penalty.

## [5.5.0] - 2026-01-23
### Documentation: Truth in Rules Audit
- **Comprehensive Audit**: Reviewed the entire codebase to ensure `RULES.md` matches the *exact* runtime logic.
- **Clarifications**:
    - **Iron Liver**: Explicitly defined the DC formula (`10 + 2*Drinks`) and failure states (Sloppy vs Pass Out).
    - **Hunch**: Corrected DC (Code: 12, Old Rules: 15) and Nat 20/1 effects.
    - **Goad**: Clarified that the check is Intimidation/Persuasion vs Insight.
    - **Bump**: Clarified it uses a raw STR check (d20 + STR mod), not Athletics.
    - **Duel**: Documented the exact "Hit Count" tie-breaker formula.

## [5.4.0] - 2026-01-23
### Mechanics: Accusation Refactor
- **True Deduction**: Accusations no longer involve a "Tell DC" or skill check (Insight vs Deception).
- **Specific Die**: You must simply select the *specific die* you believe was tampered with. If the target used cheat logic on that die, you catch them. If not (even if they cheated on another die), you fail.
- **UI**: Simplified Accusation dialog to focus on die selection.

## [5.3.2] - 2026-01-23
### Refactor: Versus Style Overlay
- **Layout**: Completely redesigned the skill result overlay to use a "Versus Screen" style Diagonal Layout.
- **Visuals**: Portraits now appear on opposite sides of the diagonal stripe (Attacker Bottom-Left, Target Top-Right).
- **Juice**: Added a "Stamper" animation to the result text for maximum impact.

## [5.3.1] - 2026-01-23
### Polish: Visual Improvements
- **Cinematic Overlay**: Corrected layout issues in single-mode cut-ins where portraits were overlapping.
- **Typography**: Added premium styling to "Goaded", "Occupied", and other result messages for better impact.
- **CSS**: Fixed syntax errors affecting style rendering.

## [5.3.0] - 2026-01-23
### Feature: Visual Feedback & Events
- **Results**: Skill cut-ins now display detailed result messages (e.g., "Player X bumped your die to a 2!").
- **Badges**: Added persistent status icons to player cards:
    - **DARED**: 🔥 (When under the effect of Goad)
    - **LOCKED**: 🔒 (When locked into a Bump Retaliation interaction)
    - **PROFILED**: 👁️ (When your secret has been read by another player)
- **Single Mode**: Improved cinematic overlay for single-target events to show both standard and target portraits.

## [5.2.4] - 2026-01-23
### Hotfix: Bump Dialog
- **Bug Fix**: Resolved a "holeClass is not defined" error that prevented the Bump Dialog from rendering correctly.

## [5.2.3] - 2026-01-23
### Polish: Bump Dialog
- **Readability**: Fixed "dark text on dark background" issues in the Bump the Table dialog.
- **UX**: The die selection screen now explicitly shows the current value of Visible dice (e.g., "7"), helping you choose the best target.

## [5.2.2] - 2026-01-23
### Hotfix: Accuracy Audit
- **Cheat Update**: Fixed a discrepancy in the Cheat logic where a Fumble (Nat 1) was only fining 1x Ante instead of the stated 2x Ante. It now correctly fines 2x Ante to match the rules text.

## [5.2.1] - 2026-01-23
### Hotfix: Readability
- **Header Contrast**: Ante and Pot labels ("Ante:", "in the pot") are now light parchment color to read clearly against the dark wood header.
- **Turn Hint**: The "Betting Round: Choose your action!" hint text is now dark ink to read clearly against the light parchment alert box.

## [5.2.0] - 2026-01-23
### Feature Update: Polish & Persistence
- **Starting Heat Persist**: The "Starting Heat DC" is now a persistent House Rule setting in the sidebar, removing the need for a dialog popup every round.
- **Dared Logic**: Players who are "Dared" (forced action) will now see the cost of the required d8 as **"FREE"** in the UI.
- **Premium UI**: 
    - Buttons have been overhauled with the "Sword Coast Tavern" premium style (borders, textures, and hover glows).
    - NPC Wallet text is now highly legible with a dark background.
    - Skill Headers are now stylized and readable.

## [5.1.2] - 2026-01-23
### Hotfix: Readability
- **Contrast**: Fixed "Put it on the tab" button text being illegible (dark-on-dark). It is now light parchment.
- **Headers**: Updated window header and subtitle text to be light Gold/Parchment to contrast against the dark wood texture.
- **Eye Strain**: Slightly darkened the main parchment background to reduce harsh brightness.

## [5.1.1] - 2026-01-23
### Hotfix: Visual Fidelity
- **Textures**: Restored depth and texture to the UI using procedural SVG noise filters (parchment grain) and wood fiber patterns.
- **Lighting**: Enhanced "Candle Glow" effect to be more visible against the textured background.
- **Polish**: Darkened header wood tones and added stronger drop-shadows for better element separation.

## [5.1.0] - 2026-01-23
### Style Overhaul: Sword Coast Tavern
- **Diegetic UI**: Implemented "Sword Coast Tavern" design system (Style Guide V2) with diegetic parchment UI, iron gall ink typography, and premium wood/metal aesthetics.

## [5.0.0] - 2026-01-22
### Major Update: The "Heat" Refactor
- **Per-Player Heat**: Heat is now tracked individually for each player. One clumsy cheater no longer ruins it for the professionals.
- **Starting Heat Control**: The GM is now prompted to set the **Starting Heat DC** (Default 10) when starting a round.
- **UI Cleanup**: Removed the Game Log/History sidebar from the main window for a cleaner look.
- **Accessibility**: Improved color contrast for skill result popups (Red/Green/Gold on dark backgrounds).

## [4.8.61] - 2026-01-22
### Hotfix 61
- **Duel Fanfare**: Fixed an issue where the Victory Fanfare (Cinematic Cut-in) would not play after someone won a Duel.
- **Text Correction**: Updated the "Dared" warning prompt to correctly state that the player must roll a **d8** (not a d20).

## [4.8.60] - 2026-01-22
### Hotfix 60
- **Foresight Fix**: Restored the "Tunnel Vision" lock mechanic. Rolling a Nat 1 on Foresight now correctly forces the player to roll a d20 (as a penalty) and prevents them from selecting other dice.

## [4.8.59] - 2026-01-22
### Hotfix 59
- **Crash Fix**: Resolved a `ReferenceError: tavernSocket is not defined` that caused the game to crash when attempting to Cheat. Added the missing import to `cheat.js`.

## [4.8.58] - 2026-01-22
### Changed
- **Goad Balance**: Backfire now forces the attacker to roll a **d8** (Free) instead of a d20 or d4.
- **Private Feedback**: Cheat, Profile, Foresight, and Cut results are now displayed in a private local Dialog rather than a whispered Chat Message, ensuring GMs cannot see sensitive player information.

## [4.8.57] - 2026-01-22
- **UI Interaction Lock (Anti-Spam):**
  - Implemented comprehensive UI locking mechanism (`TavernApp.uiLocked`) for all player actions.
  - Wrapped `onRoll`, `onHold`, `onFold`, and all skill/dialog actions (`onCheat`, `onProfile`, etc.) to prevent double-clicks and race conditions.
  - Fixes "Infinite Roll" exploit where users could spam click before the server processed the previous request.
  - Fixes bypasses where users could ignore cheat dialogs by spamming other buttons.

## [4.8.56] - 2026-01-22
### Hotfix 56
- **Immediate UI Locking**: Addressed critical race conditions where players could double-click buttons or interact with the board while an action was processing suitable for the speed of the "Twenty-One" game loop. The interface now immediately locks (grays out + no clicks) when you perform an action like Rolling, Holding, or using a Skill, unlocking only when the action completes. This explicitly fixes the "Infinite Roll / Cheat Bypass" exploit.
- **Bump Style Fix**: Fixed the "Bump" cut-in unexpectedly using the Versus Mode layout. It now correctly uses the Standard (Single Portrait) layout like all other skills.

## [4.8.55] - 2026-01-22
### Hotfix 55
- **Cut Privacy**: Fixed an issue where the GM was able to see the private value of "The Cut" re-roll. Added the `blind: true` flag to the whispered chat message to ensure it remains secret between the player and the system.

## [4.8.54] - 2026-01-22
### Hotfix 54
- **Crash Fix**: Resolved a `ReferenceError` in the Foresight (Hunch) skill. Rolling a Nat 1 triggered a call to an undefined `playSound` function, crashing the logic. I removed the erroneous call.

## [4.8.53] - 2026-01-22
### Hotfix 53
- **Duel Visual Update**: Per request, the "Duel" cinematic has been updated to match the "Staredown" style. It no longer uses the Versus split-screen or shows character portraits. Instead, it displays a clean, stylized "DUEL!" splash screen (Yellow/Red) to dramatically announce the face-off.

## [4.8.52] - 2026-01-22
### Hotfix 52
- **Result Display Fix**: Fixed a regression where skill outcomes (SUCCESS/FAIL) were hidden because the Standard/Single layout didn't know how to display them. I updated the template to check for result data and display the outcome text correctly even when not in Versus mode. Now, Goad/Bump/Profile results will properly show "SUCCESS" or "FAIL" instead of just the skill name.

## [4.8.51] - 2026-01-22
### Hotfix 51
- **Simplified Visuals**: Per request, the "Versus Mode" (split-screen) layout has been scrapped for all skills (Bump, Goad, Profile) due to reliability issues. All skills now use the reliable "Standard" cut-in layout (Single Portrait + Stripe). The split-screen effect is now exclusive to "The Duel".
- **Stylization Confirmed**: Re-applied the Heavy Stylization CSS which was previously missing. Now `FORESIGHT` (Floating), `GOAD` (Shaking), `PROFILE` (Glitching), and `BUMP` (Slamming) will all display their unique animations correctly in the Standard layout.

## [4.8.50] - 2026-01-22
### Hotfix 50
- **Duel FX Fix**: The "DUEL" cinematic trigger was missing from the core game loop, which effectively made it "not work" despite the code existing in the effects module. It has been re-inserted so the Duel splash screen now plays correctly when a duel is triggered.
- **Heavy Stylization**: Implemented distinct, dramatic visual identities for all skill cut-ins. Each skill now has a unique animation and text effect:
    - **Foresight**: Floats with a mystical blur.
    - **Goad**: Aggressively pulses/shakes with a chunky font.
    - **Profile**: Glitches digitally with a monospace font.
    - **Bump**: Slams in with a rotated impact shockwave.

## [4.8.49] - 2026-01-22
### Hotfix 49
- **System Event Polish**: Updated the Cinematic Overlay to hide the default "Mystery Man" portrait for system-level events (like The Staredown). Now, events without a connected player will purely show the stylized text and color stripe, making for a cleaner, more dramatic presentation.

## [4.8.48] - 2026-01-22
### Hotfix 48
- **Staredown Crash Fix**: Resolved a `TypeError` that occurred when triggering the "The Staredown" cinematic. The system was crashing because it tried to fetch a player portrait for a global event (which has no specific player). It now correctly handles these "system events" by falling back to a safe default instead of crashing.

## [4.8.47] - 2026-01-22
### Hotfix 47
- **Bump Privacy**: Fixed an issue where Bumping a blind die (game logic) would accidentally reveal its value in the chat/history log. It now correctly masks the value as "?" or "Hidden".
- **Added DRAMA**: 
    - **Accuse Cut-In**: Making an accusation now triggers a dramatic red cut-in before the result is revealed.
    - **Staredown Cut-In**: The "The Staredown" phase change now has its own mysterious, pulsing cinematic title.
    - **Duel Cut-In**: Duels now trigger a "DUEL!" splash screen using the Versus Mode visuals.
- **Styling**: All new cut-ins have received "extremely stylized" CSS treatments (shakes, glows, and unique text shadows) to match the D&D tavern theme.

## [4.8.46] - 2026-01-22
### Hotfix 46
- **CSS Restoration**: Fixed a regression where standard Cinematic Cut-Ins (Bust, Victory, Critical) had their text misaligned (stuck in top-left). Restored the missing text container styles that were accidentally overwritten during the Versus Mode refactor. Now text should correctly slam into the center of the stripe.

## [4.8.45] - 2026-01-22
### Hotfix 45
- **Showdown Visibility Fix**: Modified the "Versus Mode" CSS to force the portraits to be visible by default (`opacity: 1`), rather than resolving to visible via animation. This ensures that even if the entrance animation fails to trigger (causing the strict "invisible" appearance seen in reports), the portraits will still appear on screen.

## [4.8.44] - 2026-01-22
### Hotfix 44
- **Critical Fix**: Resolved a `ReferenceError` in `turn.js` that caused rolling to crash under specific conditions.
- **CSS Repair**: Restored missing "Result Overlay" styles (`.portrait-result`, `.versus-outcome`) that were accidentally dropped in the previous CSS consolidation update. This restores the premium look of the skill showdown results.

## [4.8.43] - 2026-01-22
### Hotfix 43
- **CSS Repair**: Fixed broken "Showdown" (Versus mode) cinematic cut-ins. Consolidated multiple conflicting hotfixes in the CSS that were causing the portraits to be misaligned or hidden. The fetch logic for images remains unchanged (it works the same as the solo cut-ins), but the display logic is now unified and clean.

## [4.8.42] - 2026-01-22
### Hotfix 42
- **Dared Fix**: Fixed an issue where the "Dared" status (forced d20 buy) was not being removed after the player complied and rolled the d20. The status now correctly clears upon rolling, allowing the player to continue their turn normally.

## [4.8.41] - 2026-01-22
### Hotfix 41
- **Syntax Fix**: Fixed a syntax error in the Foresight (Hunch) skill that crashed the module on load. Apologies for the rapid-fire updates!

## [4.8.40] - 2026-01-22
### Hotfix 40
- **Skill Limits**: Implemented a "Once per Match" (Round) limit for **all** bonus skills. 
    - Previously, only Bump and Goad were limited to once per round.
    - Now, **Foresight** and **Profile** are also limited to once per round/match.
    - This ensures players cannot spam skills indefinitely during a long betting phase.

## [4.8.39] - 2026-01-22
### Hotfix 39
- **Critial Regresson Fix**: Fixed a "ReferenceError" in the rolling logic that prevented players from rolling dice. This was caused by the new Bump Lock check accessing the game state before it was fully initialized in the function. Rolling is now fully restored.

## [4.8.38] - 2026-01-22
### Hotfix 38
- **Lock Fix**: Fixed an issue where the Bump Retaliation Lock would persist even after the target retaliated, preventing the attacker from finishing their turn. This was due to the state update not fully clearing the pending flag.

## [4.8.37] - 2026-01-22
### Hotfix 37
- **Crash Fix**: Resolved a syntax error (`Unexpected token :`) in `tavern-app.js` that caused the application to crash. This was due to a malformed variable declaration introduced in the previous update. Retaliation interaction is now fully functional.

## [4.8.36] - 2026-01-22
### Hotfix 36
- **UI Update**: Added distinct visual styling for **Folded** players. They will now appear greyed out (grayscale + 50% opacity) with a "Folded" status label, making it immediately clear who has left the round.

## [4.8.35] - 2026-01-22
### Hotfix 35
- **Bump Mechanics**: Implemented "Retaliation Lock". If a player fails a Bump attempt, they are now completely locked out of taking further actions (Hit/Hold/Fold) until the target completes their retaliation. The UI will specifically indicated they are "Locked" and waiting for the target.

## [4.8.34] - 2026-01-22
### Hotfix 34
- **UI Polish**: Aligned the "Cinematic Cut-in" text to match the diagonal stripe angle (-15 degrees). The text is now perfectly centered and rotated to sit "on top" of the stripe for a cleaner look.
- **Versus Fix (Defensive)**: Further hardened the visibility rules for Versus Mode avatars by forcing `z-index: 100` and `display: block` on the images. This is aimed at resolving the persistent invisibility issue on certain displays.

## [4.8.33] - 2026-01-22
### Hotfix 33
- **Regression Fix**: Correctly applied the HTML template updates for the Cinematic Overlay refactor. The previous patch failed to update the template file, causing a mismatch between HTML (old structure) and CSS (new structure), which led to broken/huge single avatars and invisible versus avatars. This update synchronizes them, restoring proper sizing and visibility for all modes.

## [4.8.32] - 2026-01-22
### Hotfix 32
- **UI Overhaul**: Refactored the Cinematic Overlay CSS to completely decouple "Single" and "Versus" modes. This removes all inheritance conflicts that were causing invisible avatars in Versus mode.
- **Visual Fix**: Fixed the "VS" text disappearing by defaulting it to visible.

## [4.8.31] - 2026-01-22
### Hotfix 31
- **UI Fix**: Explicitly disabled the inherited `portrait-slide` animation for Versus Mode cut-ins. This animation was conflicting with the static positioning, likely keeping the avatars at `opacity: 0` or transformed off-screen despite other visibility settings.

## [4.8.30] - 2026-01-22
### Hotfix 30
- **Bug Fix**: Folded players are now correctly disqualified from the winner's pool, ensuring they cannot win the pot even if they had a high total before folding.
- **UI Fix**: Hardened the Versus Mode cut-in CSS with inline styles to forcefully ensure avatars are visible, overriding any potential layout or masking issues on high-resolution displays.

## [4.8.29] - 2026-01-22
### Hotfix 29
- **Bug Fix (Revert)**: Reverted the restriction preventing Dared players from using Cheat/Sleight of Hand. Dared players *can* now cheat on their forced roll, as intended.
- **Bug Fix**: Added strict client-side validation to prevent Dared players from attempting to roll non-d20 dice. This prevents the glitch where an invalid selection would incorrectly trigger a cheat opportunity on a previous die.

## [4.8.28] - 2026-01-22
### Hotfix 28
- **Bug Fix**: Players who are "Dared" (forced to roll d20) can no longer use the Cheat/Sleight of Hand skill on that roll. The prompt is now skipped, closing the loop on the "Dared" condition mechanics.
- **UI Fix**: Simplified the Versus Mode (Showdown) cut-in animation. Removed the sliding entrance effect which was causing avatars to remain invisible on some resolutions/browsers. Avatars now appear instantly to ensure visibility.

## [4.8.27] - 2026-01-22
### Hotfix 27
- **Bug Fix**: Added server-side validation to the `hold` action to forcefully reject Dared players, ensuring the rule is enforced even if the UI client is bypassed.
- **Deprecation Fix**: Replaced `Dialog.prompt` with `new Dialog()` in the Goad dialog to resolve V13 deprecation errors.

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
