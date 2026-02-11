/**
 * Fortune's Reveal — Cinematic Dice Reveal System
 * for table rolls, keeping all drama inside the game window.
 *
 * Phases:
 *   1. DIM     — Vignette overlay darkens the table
 *   2. SLAM    — Die icon drops into center with impact ring
 *   3. REEL    — Decelerating number reel cycles through values
 *   4. LOCK-IN — Result slams into place with flash + particles
 *   5. FLIGHT  — Number flies from center to the player's seat
 *   6. CLEANUP — Overlay fades, DOM removed
 *
 * Queued: If multiple reveals fire (e.g., rapid turns),
 * subsequent ones play with compressed timing.
 */

import { MODULE_ID } from "../twenty-one/constants.js";
import { createElement, isPerformanceMode, shake, reportEffectError } from "./fx.js";
import { ParticleFactory } from "./particle-fx.js";
import { spawnTableRipple } from "./premium-fx.js";
import { FX_CONFIG } from "./fx-config.js";

/* ============================================
   CONSTANTS
   ============================================ */

/** Total duration (ms) of a full reveal — used for sleep pauses on the server side. */
export const REVEAL_DURATION = FX_CONFIG.reveal.fullDuration;

/** Compressed duration when reveals are queued back-to-back. */
export const REVEAL_DURATION_COMPRESSED = FX_CONFIG.reveal.compressedDuration;

/** Theme → spark particle color */
const THEME_SPARK = {
  "sword-coast": "gold",
  "goblin-den": "ember",
  "underdark": "arcane",
  "gilded-dragon": "gold",
  "feywild": "mint",
};

/** Die type → FontAwesome icon class */
const DIE_ICON = {
  2:  "fa-solid fa-coins",
  4:  "fa-solid fa-diamond",
  6:  "fa-solid fa-dice-six",
  8:  "fa-solid fa-dice-d20",
  10: "fa-solid fa-dice-d20",
  20: "fa-solid fa-dice-d20",
};

/* ============================================
   QUEUE SYSTEM
   ============================================ */

const _queue = [];
let _playing = false;

/**
 * Public entry point — pushes a reveal onto the queue.
 * Returns a Promise that resolves when THIS reveal's animation completes.
 * Registered via socketlib for multi-player broadcast.
 *
 * @param {string} userId  — Who rolled
 * @param {number} dieType — Die faces (e.g. 20)
 * @param {number|string} result — Roll result (number, or "?" for blind)
 * @param {Object} context — { isBust, isJackpot, isNat20, isExplode, isCoinDeath, isBlind }
 */
export function queueDiceReveal(userId, dieType, result, context = {}) {
  return new Promise((resolve) => {
    _queue.push({ userId, dieType, result, context, resolve });
    if (!_playing) _playNext();
  });
}

async function _playNext() {
  if (_queue.length === 0) {
    _playing = false;
    return;
  }

  _playing = true;
  const item = _queue.shift();
  const compressed = _queue.length > 0;

  try {
    await _performReveal(item.userId, item.dieType, item.result, item.context, compressed);
  } catch (error) {
    reportEffectError("Dice reveal", error);
  }

  item.resolve();
  _playNext();
}

/* ============================================
   HELPERS
   ============================================ */

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function _getTheme() {
  try {
    return game.settings.get(MODULE_ID, "tableTheme") ?? "sword-coast";
  } catch {
    return "sword-coast";
  }
}

function _getApp() {
  return document.querySelector(".tavern-dice-master.application");
}

function _getTableArea() {
  return _getApp()?.querySelector(".tavern-table-area");
}

function _getSeat(userId) {
  return _getApp()?.querySelector(`.player-seat[data-user-id="${userId}"]`);
}

function _contextClass(ctx) {
  if (ctx.isBust || ctx.isCoinDeath) return "reveal-bust";
  if (ctx.isJackpot) return "reveal-jackpot";
  if (ctx.isNat20 || ctx.isExplode) return "reveal-nat20";
  return "reveal-normal";
}

/* ============================================
   PERFORMANCE MODE (quick flash)
   ============================================ */

async function _performQuick(userId, dieType, result, context) {
  const tableArea = _getTableArea();
  if (!tableArea) return;

  const ctxClass = _contextClass(context);
  const displayValue = context.isBlind ? "?" : result;

  const el = createElement("div", {
    className: `dice-reveal-quick ${ctxClass}`,
    innerHTML: `<span class="dice-reveal-quick-number">${displayValue}</span>`,
  });
  tableArea.appendChild(el);

  // Entrance
  requestAnimationFrame(() => el.classList.add("active"));
  await _sleep(600);

  // Exit
  el.classList.add("dice-reveal-exit");
  await _sleep(300);
  el.remove();
}

/* ============================================
   MAIN REVEAL SEQUENCE
   ============================================ */

async function _performReveal(userId, dieType, result, context, compressed) {
  // Performance mode → quick flash
  if (isPerformanceMode()) {
    return _performQuick(userId, dieType, result, context);
  }

  const tableArea = _getTableArea();
  if (!tableArea) return;

  const theme = _getTheme();
  const sparkTheme = THEME_SPARK[theme] ?? "gold";
  const ctxClass = _contextClass(context);
  const isBlind = context.isBlind === true;
  const displayValue = isBlind ? "?" : result;
  const maxVal = Number(dieType);

  // --- Timing ---
  const T = {
    dim: compressed ? FX_CONFIG.reveal.timings.dim.compressed : FX_CONFIG.reveal.timings.dim.full,
    slam: compressed ? FX_CONFIG.reveal.timings.slam.compressed : FX_CONFIG.reveal.timings.slam.full,
    reel: compressed ? FX_CONFIG.reveal.timings.reel.compressed : FX_CONFIG.reveal.timings.reel.full,
    lock: compressed ? FX_CONFIG.reveal.timings.lock.compressed : FX_CONFIG.reveal.timings.lock.full,
    flight: compressed ? FX_CONFIG.reveal.timings.flight.compressed : FX_CONFIG.reveal.timings.flight.full,
    cleanup: compressed ? FX_CONFIG.reveal.timings.cleanup.compressed : FX_CONFIG.reveal.timings.cleanup.full,
  };

  // ======================
  // Phase 1: DIM
  // ======================
  const overlay = createElement("div", {
    className: `dice-reveal-overlay ${ctxClass}`,
  });
  tableArea.appendChild(overlay);

  // Force reflow then activate
  overlay.offsetWidth;
  overlay.classList.add("active");
  await _sleep(T.dim);

  // ======================
  // Phase 2: SLAM
  // ======================
  const dieIcon = DIE_ICON[dieType] ?? "fa-solid fa-dice-d20";
  const dieEl = createElement("div", {
    className: `dice-reveal-die ${ctxClass}`,
    innerHTML: `<i class="${dieIcon}"></i><span class="dice-reveal-die-label">d${dieType}</span>`,
  });
  overlay.appendChild(dieEl);

  // Trigger slam animation
  dieEl.offsetWidth;
  dieEl.classList.add("slam");

  // Impact ring
  const ring = createElement("div", { className: "dice-reveal-ring" });
  overlay.appendChild(ring);
  spawnTableRipple();

  // Screen shake
  try {
    const appWindow = _getApp();
    if (appWindow) shake(appWindow, "tavern-shake", 400);
  } catch (error) {
    reportEffectError("Dice reveal shake", error);
  }

  await _sleep(T.slam);

  // ======================
  // Phase 3: NUMBER REEL
  // ======================
  dieEl.classList.add("fade-die");

  const reelEl = createElement("div", {
    className: `dice-reveal-reel ${ctxClass}`,
    innerHTML: `<span class="dice-reveal-reel-number">—</span>`,
  });
  overlay.appendChild(reelEl);

  const numberEl = reelEl.querySelector(".dice-reveal-reel-number");

  if (isBlind) {
    // Blind roll: show scrambled symbols then lock on "?"
    const glyphs = ["✦", "◆", "?", "◇", "★", "✧", "?", "◈"];
    let gIdx = 0;
    const blindInterval = setInterval(() => {
      numberEl.textContent = glyphs[gIdx % glyphs.length];
      gIdx++;
    }, 60);
    await _sleep(T.reel);
    clearInterval(blindInterval);
    numberEl.textContent = "?";
  } else {
    // Normal reel: decelerating cycle through die values
    const reelStart = performance.now();
    await new Promise((resolve) => {
      function tick() {
        const elapsed = performance.now() - reelStart;
        if (elapsed >= T.reel) {
          numberEl.textContent = displayValue;
          resolve();
          return;
        }
        // Quadratic deceleration: 30ms → ~150ms
        const progress = elapsed / T.reel;
        const interval = 30 + progress * progress * 120;
        numberEl.textContent = Math.floor(Math.random() * maxVal) + 1;
        setTimeout(tick, interval);
      }
      tick();
    });
  }

  // ======================
  // Phase 4: LOCK-IN
  // ======================
  numberEl.textContent = displayValue;
  reelEl.classList.add("locked");

  // Flash burst
  const flash = createElement("div", { className: `dice-reveal-flash ${ctxClass}` });
  overlay.appendChild(flash);

  // Particles
  const particleContainer = createElement("div", {
    className: "dice-reveal-particles",
  });
  overlay.appendChild(particleContainer);

  if (context.isBust || context.isCoinDeath) {
    ParticleFactory.spawnSparkBurst(particleContainer, 22, "blood");
  } else if (context.isJackpot || context.isNat20 || context.isExplode) {
    ParticleFactory.spawnSparkBurst(particleContainer, 26, "gold");
    ParticleFactory.spawnCoinShower(particleContainer, 18);
  } else {
    ParticleFactory.spawnSparkBurst(particleContainer, 16, sparkTheme);
  }

  await _sleep(T.lock);

  // ======================
  // Phase 5: FLIGHT to seat
  // ======================
  const seat = _getSeat(userId);
  if (seat && !isBlind) {
    const seatRect = seat.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();

    const targetX = (seatRect.left + seatRect.width / 2) - (overlayRect.left + overlayRect.width / 2);
    const targetY = (seatRect.top + seatRect.height / 2) - (overlayRect.top + overlayRect.height / 2);

    reelEl.style.setProperty("--flight-x", `${targetX}px`);
    reelEl.style.setProperty("--flight-y", `${targetY}px`);
    reelEl.classList.add("flight");

    await _sleep(T.flight);

    // Brief glow on the target seat
    seat.classList.add("dice-reveal-seat-glow");
    setTimeout(() => seat.classList.remove("dice-reveal-seat-glow"), 700);
  } else {
    // No seat found or blind — just hold briefly
    await _sleep(T.flight * 0.5);
  }

  // ======================
  // Phase 6: CLEANUP
  // ======================
  overlay.classList.add("exit");
  await _sleep(T.cleanup);
  overlay.remove();
}


