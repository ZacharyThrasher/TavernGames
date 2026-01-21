# Tavern Games - Refactor Log

## Completed Changes (V4)

### 1. Technical Architecture
- [x] **State Migration:** Moved game state from Macro to World Settings.
- [x] **NPC Bank System:**
    - [x] Session-based wallet storage in `gameState`.
    - [x] GM Join Dialog with "Buy-In".
    - [x] Real-time NPC Wallet display in App Header.
    - [x] "Cash Out" summary chat message on Leave.
- [x] **Sound Nuke:** Removed `scripts/sounds.js` and all `playSound()` calls.

### 2. Core Mechanics & Balance
- [x] **Cheat Rework:** Removed passive perception checks. GM now receives a whisper on successful cheats.
- [x] **Profile Rework:** Now reveals **"Has Cheated: Yes/No"** instead of the Hole Die value. Nat 20 reveals exact die index.
- [x] **Bump Rework:** Added immunity for players who have **Held** or **Folded**.
- [x] **Goad Rework:** Enforced "Dared" condition (must buy d20 or Fold) on backfire.
- [x] **Duel Rework:** Nuked stat-based tiebreakers. Now uses **1d20 + 1d4 per Hit** exclusively. Stalemate results in a re-duel using the same mechanic.
- [x] **Hunch Rework:** Failure results in a **Blind Hit** (Question mark icon, value hidden until reveal).

### 3. Interaction & UI
- [x] **Accuse Rework:** "Click-to-Accuse" specific die targeting implemented. Available anytime during round.
- [x] **Side Bets:** UI and logic implemented. Spectators and folded players can back a "Champion" for a 2:1 payout.
- [x] **Handlebars Helpers:** Registered `or` and `and` helpers in `main.js`.
- [x] **Rules Display:** Updated lobby rules summary to reflect V4 mechanics.

### 4. Cleanup
- [x] **Scan Removal:** Completely removed all V2 "Scan" code and CSS.
- [x] **Legacy Files:** Deleted `scripts/twenty-one.js.bak`.
- [x] **Constants:** Removed unused `DUEL_CHALLENGES`.

## Future / Planned (V4.1+)

### The Sauce (Visual FX)
- [ ] **Floating Text Engine (`scripts/ui/fx.js`):**
    - [ ] Create a system to spawn floating text elements over specific DOM elements.
    - [ ] Utilize GSAP (GreenSock) for smooth animation (float up + fade out).
- [ ] **Screenshake:**
    - [ ] Add CSS keyframes for `shake` effects.
    - [ ] Implement JS helper to apply shake classes temporarily.
- [ ] **Integration:**
    - [ ] **Bust:** Trigger heavy shake + Red "BUST!" text.
    - [ ] **Gold Changes:** Float "-X gp" (Red) or "+X gp" (Green) over player avatars when wallet changes.
    - [ ] **Nat 20:** Golden pulse/glow effect.
    - [ ] **Nat 1:** "Cracked" effect or shake.
    - [ ] **Win:** Confetti or gold particle effect (optional/stretch).
