import { MODULE_ID } from "../state.js";
import { CinematicOverlay } from "./cinematic-overlay.js";

/* ============================================
   V13 Best Practices: Utility Functions
   ============================================ */

/**
 * V13: Debounce utility to prevent rapid-fire effect calls
 * Prevents performance issues when multiple effects trigger simultaneously
 */
export function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * V13: Check if performance mode is enabled (skip heavy effects)
 */
export function isPerformanceMode() {
  try {
    return game.settings.get(MODULE_ID, "performanceMode") ?? false;
  } catch {
    return false;
  }
}

/**
 * V13: Create element helper - replaces jQuery element creation
 * @param {string} tag - HTML tag name
 * @param {Object} options - { className, innerHTML, attributes }
 * @returns {HTMLElement}
 */
export function createElement(tag, options = {}) {
  const el = document.createElement(tag);
  if (options.className) el.className = options.className;
  if (options.innerHTML) el.innerHTML = options.innerHTML;
  if (options.attributes) {
    for (const [key, value] of Object.entries(options.attributes)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}

/**
 * V13: Fade out and remove element - native replacement for jQuery fadeOut
 * @param {HTMLElement} element - Element to fade out
 * @param {number} duration - Fade duration in ms
 */
export function fadeOutAndRemove(element, duration = 500) {
  if (!element) return;
  element.style.transition = `opacity ${duration}ms ease-out`;
  element.style.opacity = "0";
  setTimeout(() => element.remove(), duration);
}

/* ============================================
   Visual Effects - V13 Best Practices
   All effects use native DOM, error handling,
   and respect performance mode.
   ============================================ */

// Direct shake with reflow force (Instant feedback)
export const shake = (element, className, duration) => {
  if (!element) return console.warn("Tavern | Shake target missing");
  // Reset animation if needed
  element.classList.remove(className);
  // Force reflow
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), duration);
};

/**
 * V4.1: Visual Victory Fanfare
 * Shows celebratory banner with winner name and screen shake
 * @param {string} winnerId - User ID of the winner
 */
export function showVictoryFanfare(winnerId) {
  try {
    // V13: Skip heavy effects in performance mode
    if (isPerformanceMode()) {
      console.log("Tavern Twenty-One | Skipping victory fanfare (performance mode)");
      return;
    }

    const winnerName = game.users.get(winnerId)?.name ?? "Winner";

    // 1. Screen shake - using debounced version
    const appWindow = game.tavernDiceMaster?.app?.element;
    if (appWindow) shake(appWindow, "tavern-shake-victory", 600);

    // 2. Cinematic Cut-In (V13 Frameless Overlay)
    CinematicOverlay.show({
      type: "VICTORY",
      userId: winnerId,
      text: "VICTORY!"
    });

  } catch (error) {
    // V13: Graceful error handling - log but don't crash game logic
    console.error("Tavern Twenty-One | Victory fanfare error:", error);
  }
}

/**
 * V4.6: Visual Bust Fanfare
 * Shows bust notification with screen shake
 * @param {string} userId - User ID of the player who busted
 */
export function showBustFanfare(userId) {
  try {
    if (isPerformanceMode()) {
      console.log("Tavern Twenty-One | Skipping bust fanfare (performance mode)");
      return;
    }

    const userName = game.users.get(userId)?.name ?? "Player";

    // 1. Screen shake
    const appWindow = game.tavernDiceMaster?.app?.element;
    if (appWindow) shake(appWindow, "tavern-shake", 500);

    // 2. Cinematic Cut-In
    CinematicOverlay.show({
      type: "BUST",
      userId: userId,
      text: "BUST!"
    });

  } catch (error) {
    console.error("Tavern Twenty-One | Bust fanfare error:", error);
  }
}

/**
 * V4.2: Bump Impact Effect
 * Shows impact flash on target player's seat with shake
 * @param {string} targetId - User ID of bump target
 */
export function playBumpEffect(targetId) {
  try {
    if (!game.tavernDiceMaster?.app?.rendered) return;
    if (isPerformanceMode()) return;

    const appWindow = game.tavernDiceMaster?.app?.element;
    if (!appWindow) return;

    const seat = appWindow.querySelector(`.player-seat[data-user-id="${targetId}"]`);
    if (seat) {
      seat.classList.add("tavern-shake-heavy");

      // V13: Native DOM for impact flash
      const flash = createElement("div", { className: "bump-impact" });
      seat.appendChild(flash);

      setTimeout(() => flash.remove(), 500);
      setTimeout(() => seat.classList.remove("tavern-shake-heavy"), 500);
    }
  } catch (error) {
    console.error("Tavern Twenty-One | Bump effect error:", error);
  }
}

/**
 * V4.2: Floating Gold Text
 * Shows animated gold gain/loss text above player avatar
 * @param {string} userId - User ID
 * @param {number} amount - Gold amount (positive = gain, negative = loss)
 */
export function showFloatingText(userId, amount) {
  try {
    if (!game.tavernDiceMaster?.app?.rendered) return;
    if (isPerformanceMode()) return;

    const appWindow = document.querySelector(".tavern-dice-master.application");
    if (!appWindow) return;

    const seat = appWindow.querySelector(`.player-seat[data-user-id="${userId}"]`);
    if (!seat) return;

    const avatar = seat.querySelector(".player-avatar");
    if (!avatar) return;

    // Format text
    const isPositive = amount > 0;
    const text = isPositive ? `+${amount}gp` : `${amount}gp`;
    const colorClass = isPositive ? "gain" : "loss";

    // V13: Native DOM creation
    const floatEl = createElement("div", {
      className: `floating-text ${colorClass}`,
      innerHTML: text
    });

    avatar.appendChild(floatEl);

    // Trigger animation then remove
    requestAnimationFrame(() => floatEl.classList.add("animate"));
    setTimeout(() => fadeOutAndRemove(floatEl, 500), 1500);

  } catch (error) {
    console.error("Tavern Twenty-One | Floating text error:", error);
  }
}

/**
 * V4.7.1: Cinematic Skill Cut-In
 * Triggers a skill-specific cinematic overlay (now supports Versus mode)
 * @param {string} type - FORESIGHT, GOAD, PROFILE, BUMP
 * @param {string} userId - User ID performing the skill
 * @param {string} [targetId] - Target User ID (for Versus/Showdown)
 */
export function showSkillCutIn(type, userId, targetId) {
  try {
    if (isPerformanceMode()) return;

    // Map type to display text
    let text = type;
    if (type === "FORESIGHT") text = "FORESIGHT!";
    else if (type === "GOAD") text = "GOADED!";
    else if (type === "PROFILE") text = "ANALYSIS!";
    else if (type === "BUMP") text = "TABLE BUMP!";

    CinematicOverlay.show({
      type,
      userId,
      targetId,
      text
    });
  } catch (error) {
    console.error("Tavern Twenty-One | Skill CutIn error:", error);
  }
}

/**
 * V4.7.6: Skill Result Overlay
     * Shows the result of a skill showdown
     * @param {string} type - GOAD, BUMP, PROFILE
     * @param {string} userId - Attacker ID
     * @param {string} targetId - Defender ID
     * @param {object} resultData - { attackerRoll, defenderRoll, outcome, outcomeClass }
 */
export function showSkillResult(type, userId, targetId, resultData) {
  try {
    if (isPerformanceMode()) return;

    // Reuse Show logic but with result data
    CinematicOverlay.show({
      type,
      userId,
      targetId,
      resultData
    });
  } catch (error) {
    console.error("Tavern | Skill Result Error:", error);
  }
}
