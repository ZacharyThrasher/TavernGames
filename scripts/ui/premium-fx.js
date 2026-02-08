/**
 * PREMIUM EFFECTS ENGINE — Tavern Twenty-One
 * V5.26: "ADDICTED TO THE TABLE" Interactive Effects
 *
 * JS-driven effects that complement premium-fx.css:
 * 1. Holographic 3D Tilt on Dice Buttons
 * 2. Odometer-Style Tumbling Gold Counter
 * 3. Enchanted Gold Dust Cursor Trail
 * 4. Table Ripple on Dice Roll
 * 5. Crown Jewel Element Injection
 * 6. Table Enchantment Element Injection
 * 7. Pot Coin Flip Animation
 *
 * All effects respect performanceMode.
 * Designed to be initialized in _onRender and torn down cleanly.
 */

import { isPerformanceMode, createElement } from "./fx.js";

/* ============================================
   1. HOLOGRAPHIC 3D TILT
   Makes dice buttons tilt toward the cursor
   like premium holographic trading cards.
   ============================================ */

export class HolographicTilt {
  static _handler = null;

  /**
   * Attach tilt tracking to all premium dice buttons within container.
   * Uses the existing --cursor-x / --cursor-y CSS vars for the holo gradient,
   * but adds per-button 3D transform based on pointer position.
   * @param {HTMLElement} container — The app element
   */
  static attach(container) {
    if (isPerformanceMode()) return;

    // Clean up previous
    HolographicTilt.detach(container);

    const handler = (event) => {
      const button = event.target.closest(".btn-die-premium");
      if (!button || button.disabled) return;

      const rect = button.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;  // 0–1
      const y = (event.clientY - rect.top) / rect.height;   // 0–1

      // Convert to tilt angles (-12 to +12 degrees)
      const tiltX = (y - 0.5) * -16;
      const tiltY = (x - 0.5) * 16;

      // Specular highlight position
      button.style.setProperty("--holo-x", x.toFixed(3));
      button.style.setProperty("--holo-y", y.toFixed(3));

      button.style.transform = `
        perspective(800px)
        rotateX(${tiltX.toFixed(1)}deg)
        rotateY(${tiltY.toFixed(1)}deg)
        translateY(-4px)
        scale(1.05)
      `;
    };

    const resetHandler = (event) => {
      const button = event.target.closest(".btn-die-premium");
      if (!button) return;
      button.style.transform = "";
      button.style.removeProperty("--holo-x");
      button.style.removeProperty("--holo-y");
    };

    container.addEventListener("pointermove", handler, { passive: true });
    container.addEventListener("pointerout", resetHandler, true);

    HolographicTilt._handler = { move: handler, out: resetHandler };
  }

  static detach(container) {
    if (HolographicTilt._handler) {
      container.removeEventListener("pointermove", HolographicTilt._handler.move);
      container.removeEventListener("pointerout", HolographicTilt._handler.out, true);
      HolographicTilt._handler = null;
    }
  }
}


/* ============================================
   2. ODOMETER GOLD COUNTER
   Individual digits cascade like a slot machine.
   Replaces a static number with tumbling reels.
   ============================================ */

export class GoldOdometer {
  static _lastValues = new WeakMap();

  /**
   * Initialize or update the odometer display for a pot amount element.
   * @param {HTMLElement} potEl — The .pot-amount element
   * @param {number} value — Current gold value
   * @param {boolean} animate — Whether to animate the transition
   */
  static update(potEl, value, animate = true) {
    if (!potEl || isPerformanceMode()) return;

    const lastVal = GoldOdometer._lastValues.get(potEl) ?? -1;
    if (lastVal === value) return;

    GoldOdometer._lastValues.set(potEl, value);

    const digits = String(value).split("");
    const container = potEl.querySelector(".pot-odometer") || GoldOdometer._createOdometer(potEl);

    // Ensure correct number of digit slots
    const existingDigits = container.querySelectorAll(".odo-digit");
    const existingCommas = container.querySelectorAll(".odo-comma");

    // Clear and rebuild if digit count changed
    const needsComma = value >= 1000;
    const formattedDigits = digits.length;
    const currentSlots = existingDigits.length;

    if (currentSlots !== formattedDigits) {
      GoldOdometer._rebuildDigits(container, digits, animate);
    } else {
      // Update existing digits with animation
      digits.forEach((d, i) => {
        const slot = existingDigits[i];
        if (!slot) return;
        const inner = slot.querySelector(".odo-digit-inner");
        if (!inner) return;

        const targetOffset = parseInt(d) * -1.4; // each digit is 1.4em tall
        inner.style.transform = `translateY(${targetOffset}em)`;
      });
    }

    if (animate && lastVal >= 0) {
      container.classList.add("odo-changing");
      setTimeout(() => container.classList.remove("odo-changing"), 800);
    }
  }

  static _createOdometer(potEl) {
    // Hide original text content, create odometer wrapper
    const odometer = createElement("span", { className: "pot-odometer" });

    // Preserve the " gp" suffix
    const suffix = createElement("span", {
      className: "odo-suffix",
      innerHTML: "gp"
    });
    odometer.appendChild(suffix);

    // Replace text content
    potEl.textContent = "";
    potEl.appendChild(odometer);

    return odometer;
  }

  static _rebuildDigits(container, digits, animate) {
    // Remove existing digits and commas (keep suffix)
    const suffix = container.querySelector(".odo-suffix");
    container.innerHTML = "";

    digits.forEach((d, i) => {
      // Add comma separator for thousands
      if (digits.length > 3 && i > 0 && (digits.length - i) % 3 === 0) {
        const comma = createElement("span", {
          className: "odo-comma",
          innerHTML: ","
        });
        container.appendChild(comma);
      }

      const slot = createElement("div", { className: "odo-digit" });
      const inner = createElement("div", { className: "odo-digit-inner" });

      // Create all 10 digit positions (0-9)
      for (let n = 0; n <= 9; n++) {
        const digitSpan = createElement("span", { innerHTML: String(n) });
        inner.appendChild(digitSpan);
      }

      slot.appendChild(inner);
      container.appendChild(slot);

      // Animate to target digit
      const targetOffset = parseInt(d) * -1.4;
      if (animate) {
        // Start from random position for slot-machine feel
        inner.style.transform = `translateY(${(Math.random() * -12.6).toFixed(1)}em)`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            inner.style.transform = `translateY(${targetOffset}em)`;
          });
        });
      } else {
        inner.style.transform = `translateY(${targetOffset}em)`;
      }
    });

    // Re-add suffix
    if (suffix) {
      container.appendChild(suffix);
    } else {
      container.appendChild(createElement("span", {
        className: "odo-suffix",
        innerHTML: "gp"
      }));
    }
  }

  /**
   * Read the current numeric value from a pot element (strip non-digits)
   */
  static readValue(potEl) {
    if (!potEl) return 0;
    return parseInt(potEl.textContent.replace(/[^\d]/g, "")) || 0;
  }
}


/* ============================================
   3. ENCHANTED GOLD DUST CURSOR TRAIL
   Spawns magical dust motes that follow the
   cursor inside the tavern table area.
   ============================================ */

export class GoldDustTrail {
  static _handler = null;
  static _lastSpawn = 0;
  static _moteCount = 0;
  static MAX_MOTES = 30;
  static SPAWN_INTERVAL = 60; // ms between spawns

  static attach(container) {
    if (isPerformanceMode()) return;

    GoldDustTrail.detach(container);

    const tableArea = container.querySelector(".tavern-table-area");
    if (!tableArea) return;

    const handler = (event) => {
      const now = Date.now();
      if (now - GoldDustTrail._lastSpawn < GoldDustTrail.SPAWN_INTERVAL) return;
      if (GoldDustTrail._moteCount >= GoldDustTrail.MAX_MOTES) return;

      GoldDustTrail._lastSpawn = now;
      GoldDustTrail._moteCount++;

      const rect = tableArea.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const mote = document.createElement("div");
      mote.classList.add("tavern-dust-mote");
      mote.style.left = `${x}px`;
      mote.style.top = `${y}px`;

      // Random drift direction
      const driftX = (Math.random() - 0.5) * 24;
      const driftY = -(Math.random() * 20 + 8); // Always drift upward
      mote.style.setProperty("--dust-dx", `${driftX}px`);
      mote.style.setProperty("--dust-dy", `${driftY}px`);

      tableArea.appendChild(mote);

      // Cleanup
      const lifetime = 900 + Math.random() * 600;
      setTimeout(() => {
        mote.remove();
        GoldDustTrail._moteCount--;
      }, lifetime);
    };

    tableArea.addEventListener("pointermove", handler, { passive: true });
    GoldDustTrail._handler = handler;
    GoldDustTrail._tableArea = tableArea;
  }

  static detach(container) {
    if (GoldDustTrail._handler && GoldDustTrail._tableArea) {
      GoldDustTrail._tableArea.removeEventListener("pointermove", GoldDustTrail._handler);
      GoldDustTrail._handler = null;
      GoldDustTrail._tableArea = null;
    }
  }
}


/* ============================================
   4. TABLE RIPPLE EFFECT
   Spawns an expanding ring on the table when
   a die is rolled, like a stone dropped in water.
   ============================================ */

export function spawnTableRipple() {
  try {
    if (isPerformanceMode()) return;

    const tableArea = document.querySelector(".tavern-dice-master .tavern-table-area");
    if (!tableArea) return;

    const ripple = createElement("div", { className: "table-ripple" });
    tableArea.appendChild(ripple);

    setTimeout(() => ripple.remove(), 1300);
  } catch (e) {
    console.warn("Tavern | Table ripple error:", e);
  }
}


/* ============================================
   5. CROWN JEWEL INJECTION
   Adds an animated crown icon above the
   leading player's avatar.
   ============================================ */

export function injectCrownJewels(container) {
  if (isPerformanceMode()) return;
  if (!container) return;

  // Remove existing crowns
  container.querySelectorAll(".crown-jewel").forEach(el => el.remove());

  // Find the leading player seat
  const leadingSeat = container.querySelector('.player-seat[data-leading="true"]');
  if (!leadingSeat) return;

  const avatar = leadingSeat.querySelector(".player-avatar");
  if (!avatar) return;

  // Skip if crown already exists (rare edge case)
  if (avatar.querySelector(".crown-jewel")) return;

  const crown = createElement("div", {
    className: "crown-jewel",
    innerHTML: '<i class="fa-solid fa-crown"></i>'
  });
  avatar.appendChild(crown);
}


/* ============================================
   6. TABLE ENCHANTMENT INJECTION
   Adds the sacred geometry / warding circle
   element to the table surface.
   ============================================ */

export function injectTableEnchantment(container) {
  if (isPerformanceMode()) return;
  if (!container) return;

  const tableArea = container.querySelector(".tavern-table-area");
  if (!tableArea) return;

  // Skip if already exists
  if (tableArea.querySelector(".table-enchantment")) return;

  const enchantment = createElement("div", { className: "table-enchantment" });
  tableArea.appendChild(enchantment);
}


/* ============================================
   7. POT COIN FLIP ANIMATION
   Spawns a flipping coin icon when the pot
   value increases.
   ============================================ */

export function spawnPotCoinFlip(potDisplay) {
  try {
    if (isPerformanceMode()) return;
    if (!potDisplay) return;

    // Ensure pot-display has relative positioning
    potDisplay.style.position = "relative";

    const coin = createElement("div", {
      className: "pot-coin-flip",
      innerHTML: '<i class="fa-solid fa-coins"></i>'
    });
    potDisplay.appendChild(coin);

    setTimeout(() => coin.remove(), 900);
  } catch (e) {
    console.warn("Tavern | Pot coin flip error:", e);
  }
}


/* ============================================
   7b. ARCANE RING INJECTION
   Injects a rotating dashed ring element
   on the current turn player's avatar.
   Uses a DOM element instead of ::before
   to avoid collision with streak flame auras.
   ============================================ */

export function injectArcaneRing(container) {
  if (isPerformanceMode()) return;
  if (!container) return;

  // Remove existing rings (handles turn changes)
  container.querySelectorAll(".arcane-ring").forEach(el => el.remove());

  const currentSeat = container.querySelector(".player-seat.is-current .player-avatar");
  if (!currentSeat) return;

  const ring = createElement("div", { className: "arcane-ring" });
  currentSeat.appendChild(ring);
}


/* ============================================
   8. WIN STREAK TRACKER
   Tracks consecutive wins per player and
   sets data-streak attribute on their seat.
   ============================================ */

export class StreakTracker {
  static _streaks = {};

  /**
   * Record a win for a player. Increments their streak.
   * @param {string} userId
   */
  static recordWin(userId) {
    if (!userId) return;
    StreakTracker._streaks[userId] = (StreakTracker._streaks[userId] || 0) + 1;
  }

  /**
   * Record a loss for a player. Resets their streak.
   * @param {string} userId
   */
  static recordLoss(userId) {
    if (!userId) return;
    StreakTracker._streaks[userId] = 0;
  }

  /**
   * Reset all streaks (new table).
   */
  static resetAll() {
    StreakTracker._streaks = {};
  }

  /**
   * Get the current streak for a player.
   * @param {string} userId
   * @returns {number}
   */
  static getStreak(userId) {
    return StreakTracker._streaks[userId] || 0;
  }

  /**
   * Apply data-streak attributes to all player seats in the container.
   * @param {HTMLElement} container
   */
  static applyToSeats(container) {
    if (isPerformanceMode()) return;
    if (!container) return;

    const seats = container.querySelectorAll(".player-seat[data-user-id]");
    seats.forEach(seat => {
      const userId = seat.dataset.userId;
      const streak = StreakTracker.getStreak(userId);

      if (streak >= 3) {
        seat.dataset.streak = "3"; // Max visual tier
      } else if (streak >= 2) {
        seat.dataset.streak = "2";
      } else if (streak >= 1) {
        seat.dataset.streak = "1";
      } else {
        delete seat.dataset.streak;
      }
    });
  }
}


/* ============================================
   9. MASTER INITIALIZER
   Single entry point to set up all premium
   effects. Called from _onRender in tavern-app.js
   ============================================ */

export function initPremiumEffects(appElement) {
  if (!appElement) return;

  try {
    // Holographic tilt on dice buttons
    HolographicTilt.attach(appElement);

    // Gold dust trail on table area
    GoldDustTrail.attach(appElement);

    // Inject table enchantment (sacred geometry)
    injectTableEnchantment(appElement);

    // Inject crown on leading player
    injectCrownJewels(appElement);

    // Inject arcane ring on current turn player (uses element, not ::before, to avoid streak collision)
    injectArcaneRing(appElement);

    // Apply streak auras
    StreakTracker.applyToSeats(appElement);

    // Odometer on pot display
    const potEl = appElement.querySelector(".pot-amount");
    if (potEl) {
      const value = parseInt(potEl.textContent?.replace(/[^\d]/g, "")) || 0;
      GoldOdometer.update(potEl, value, false);
    }
  } catch (e) {
    console.warn("Tavern | Premium Effects init error:", e);
  }
}

/**
 * Teardown handler — call before re-render or close.
 */
export function teardownPremiumEffects(appElement) {
  if (!appElement) return;

  try {
    HolographicTilt.detach(appElement);
    GoldDustTrail.detach(appElement);
  } catch (e) {
    console.warn("Tavern | Premium Effects teardown error:", e);
  }
}
