import { MODULE_ID } from "../twenty-one/constants.js";
import { CinematicOverlay } from "./cinematic-overlay.js";
import { ParticleFactory } from "./particle-fx.js";
import { StreakTracker, spawnPotCoinFlip } from "./premium-fx.js";
import { PrivateFeedbackDialog } from "../app/dialogs/private-feedback-dialog.js";
import { FX_CONFIG } from "./fx-config.js";

/* ============================================
   Utility Functions
   ============================================ */

/**
 * Prevents performance issues when multiple effects trigger simultaneously
 */
export function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function isPerformanceMode() {
  try {
    if (window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return true;
    return game.settings.get(MODULE_ID, "performanceMode") ?? false;
  } catch {
    return false;
  }
}

export function reportEffectError(name, error) {
  console.error(`Tavern Twenty-One | ${name} error:`, error);
  if (CONFIG?.debug?.tavern) throw error;
}

/**
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
 * @param {HTMLElement} element - Element to fade out
 * @param {number} duration - Fade duration in ms
 */
export function fadeOutAndRemove(element, duration = 500) {
  if (!element) return;
  element.style.transition = `opacity ${duration}ms ease-out`;
  element.style.opacity = "0";
  setTimeout(() => element.remove(), duration);
}

/**
 * Quick press animation helper
 * @param {HTMLElement} element
 */
export function applyJuicePress(element) {
  if (!element) return;
  element.classList.remove("juice-press");
  void element.offsetWidth;
  element.classList.add("juice-press");
  setTimeout(() => element.classList.remove("juice-press"), FX_CONFIG.clicks.pressDuration);
}

/**
 * Click burst (spark + ripple) for tactile feedback
 * @param {HTMLElement} element
 * @param {string} tone
 */
export function showClickBurst(element, tone = "gold") {
  try {
    if (!element || isPerformanceMode()) return;
    const burst = createElement("div", { className: `tavern-click-burst ${tone}` });
    const ripple = createElement("div", { className: "tavern-ripple" });
    burst.appendChild(ripple);
    element.appendChild(burst);

    ParticleFactory.spawnSparkBurst(burst, 14, tone);
    setTimeout(() => burst.remove(), FX_CONFIG.clicks.burstDuration);
  } catch (error) {
    reportEffectError("Click burst", error);
  }
}

/* ============================================
   Visual Effects
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
 * Shows celebratory banner with winner name and screen shake
 * @param {string} winnerId - User ID of the winner
 */
/**
 * Shows celebratory banner with winner name and screen shake
 * @param {string} winnerId - User ID of the winner
 * @param {number} [amount] - Gold amount won
 */
export function showVictoryFanfare(winnerId, amount) {
  try {
    if (isPerformanceMode()) return;

    const winnerName = game.users.get(winnerId)?.name ?? "Winner";

    // 1. Screen shake - using debounced version
    const appWindow = game.tavernDiceMaster?.app?.element;
    if (appWindow) shake(appWindow, "tavern-shake-victory", 600);
    // Pass gold amount as detail
    const detail = amount ? `Wins ${amount}gp!` : null;

    CinematicOverlay.show({
      type: "VICTORY",
      userId: winnerId,
      text: "VICTORY!",
      resultData: amount ? {
        outcome: "WINNER TAKE ALL",
        outcomeClass: "success", // gold styling
        detail: `Wins ${amount}gp!`, // Plain text fallback
        amount: amount // Pass raw amount for template
      } : undefined
    });
    StreakTracker.recordWin(winnerId);

  } catch (error) {
    reportEffectError("Victory fanfare", error);
  }
}

/**
 * Shows bust notification with screen shake
 * @param {string} userId - User ID of the player who busted
 */
export function showBustFanfare(userId) {
  try {
    if (isPerformanceMode()) return;

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

    // Vignette flash for impact
    showVignetteFlash();
    StreakTracker.recordLoss(userId);

  } catch (error) {
    reportEffectError("Bust fanfare", error);
  }
}

/**
 * Goblin Coin Flip Effect (No audio)
 * @param {string} userId
 * @param {number} result - 1 (tails) or 2 (heads)
 */
export function showCoinFlip(userId, result, bonus = 2) {
  try {
    if (isPerformanceMode()) return;

    const appWindow = document.querySelector(".tavern-dice-master.application");
    if (!appWindow) return;

    const isHeads = result === 2;
    const banner = createElement("div", {
      className: `coin-flip-banner ${isHeads ? "heads" : "tails"}`,
      innerHTML: isHeads ? `COIN FLIP: HEADS +${bonus}` : "COIN FLIP: TAILS — DEATH"
    });

    appWindow.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add("show"));
    setTimeout(() => fadeOutAndRemove(banner, FX_CONFIG.banners.fadeDuration), FX_CONFIG.banners.coinFlipDisplay);

    const particleLayer = createElement("div", { className: "cinematic-particles" });
    appWindow.appendChild(particleLayer);
    ParticleFactory.spawnCoinShower(particleLayer, isHeads ? 40 : 20);
    setTimeout(() => particleLayer.remove(), FX_CONFIG.banners.coinFlipParticlesCleanup);

    // Add a little tension: light shake on tails, celebratory shake on heads
    if (isHeads) {
      shake(appWindow, "tavern-shake-victory", FX_CONFIG.impacts.heavyShakeDuration - 50);
      showImpactFrame();
    } else {
      shake(appWindow, "tavern-shake", 350);
    }

  } catch (error) {
    reportEffectError("Coin flip effect", error);
  }
}

/**
 * Cheat result banner (private)
 * @param {string} userId
 * @param {boolean} success
 */
export function showCheatResult(success) {
  try {
    if (isPerformanceMode()) return;

    const appWindow = document.querySelector(".tavern-dice-master.application");
    if (!appWindow) return;

    const banner = createElement("div", {
      className: `cheat-result-banner ${success ? "success" : "failure"}`,
      innerHTML: success ? "CHEAT SUCCESS" : "CHEAT FAILED"
    });

    appWindow.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add("show"));
    setTimeout(() => fadeOutAndRemove(banner, FX_CONFIG.banners.fadeDuration), FX_CONFIG.banners.cheatDisplay);
  } catch (error) {
    reportEffectError("Cheat banner", error);
  }
}

/**
 * Skill result banner (private)
 * @param {string} userId
 * @param {object} payload - { title, message, tone, icon }
 */
export function showSkillBanner(payload = {}) {
  try {
    if (isPerformanceMode()) return;

    const appWindow = document.querySelector(".tavern-dice-master.application");
    if (!appWindow) return;

    const title = payload.title ?? "Skill Result";
    const message = payload.message ?? "";
    const tone = payload.tone ?? "info";
    const icon = payload.icon ? `<i class="${payload.icon}"></i>` : "";

    const banner = createElement("div", {
      className: `skill-banner ${tone} ${tone === "success" ? "power" : ""}`,
      innerHTML: `
        <div class="skill-banner-title">${icon}${title}</div>
        <div class="skill-banner-message">${message}</div>
      `
    });

    appWindow.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add("show"));

    if (tone === "success") {
      const particleLayer = createElement("div", { className: "cinematic-particles" });
      banner.appendChild(particleLayer);
      ParticleFactory.spawnArcaneBurst(particleLayer, 40);
      setTimeout(() => particleLayer.remove(), 1800);
    }

    setTimeout(() => fadeOutAndRemove(banner, FX_CONFIG.banners.fadeDuration), FX_CONFIG.banners.skillDisplay);
  } catch (error) {
    reportEffectError("Skill banner", error);
  }
}

/**
 * Drink result banner (private)
 * @param {object} payload - { title, message, tone, icon }
 */
export function showDrinkResult(payload = {}) {
  try {
    if (isPerformanceMode()) return;

    const appWindow = document.querySelector(".tavern-dice-master.application");
    if (!appWindow) return;

    const title = payload.title ?? "Put It On The Tab";
    const message = payload.message ?? "";
    const tone = payload.tone ?? "info";
    const icon = payload.icon ? `<i class="${payload.icon}"></i>` : `<i class="fa-solid fa-beer-mug-empty"></i>`;

    const banner = createElement("div", {
      className: `drink-banner ${tone}`,
      innerHTML: `
        <div class="drink-banner-title">${icon}${title}</div>
        <div class="drink-banner-message">${message}</div>
      `
    });

    appWindow.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add("show"));

    if (tone === "success") {
      const particleLayer = createElement("div", { className: "cinematic-particles" });
      banner.appendChild(particleLayer);
      ParticleFactory.spawnCoinShower(particleLayer, 18);
      setTimeout(() => particleLayer.remove(), 1400);
    } else if (tone === "warning") {
      const particleLayer = createElement("div", { className: "cinematic-particles" });
      banner.appendChild(particleLayer);
      ParticleFactory.spawnAleSplash(particleLayer, 26);
      setTimeout(() => particleLayer.remove(), 1200);
    }

    setTimeout(() => fadeOutAndRemove(banner, FX_CONFIG.banners.fadeDuration), FX_CONFIG.banners.drinkDisplay);
  } catch (error) {
    reportEffectError("Drink banner", error);
  }
}

/**
 * Cut off banner (private)
 * @param {object} payload - { message }
 */
export function showCutOffBanner(payload = {}) {
  try {
    if (isPerformanceMode()) return;

    const appWindow = document.querySelector(".tavern-dice-master.application");
    if (!appWindow) return;

    const message = payload.message ?? "The barkeep cuts you off. Pay in gold.";

    const banner = createElement("div", {
      className: "cutoff-banner",
      innerHTML: `
        <div class="cutoff-banner-title"><i class="fa-solid fa-mug-hot"></i> CUT OFF</div>
        <div class="cutoff-banner-message">${message}</div>
      `
    });

    appWindow.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add("show"));
    shake(appWindow, "tavern-shake", 350);

    const glare = createElement("div", { className: "tavern-cutoff-glare" });
    appWindow.appendChild(glare);
    requestAnimationFrame(() => glare.classList.add("show"));
    setTimeout(() => glare.remove(), FX_CONFIG.impacts.ringDuration);

    setTimeout(() => fadeOutAndRemove(banner, FX_CONFIG.banners.fadeDuration), FX_CONFIG.banners.cutoffDisplay);
  } catch (error) {
    reportEffectError("Cut off banner", error);
  }
}

/**
 * Impact ring for skill effects
 * @param {string} userId
 * @param {string} type - "goad" | "bump"
 */
export function showImpactRing(userId, type = "goad") {
  try {
    if (!game.tavernDiceMaster?.app?.rendered) return;
    if (isPerformanceMode()) return;

    const appWindow = document.querySelector(".tavern-dice-master.application");
    if (!appWindow) return;

    const seat = appWindow.querySelector(`.player-seat[data-user-id="${userId}"]`);
    if (!seat) return;

    const ring = createElement("div", { className: `impact-ring ${type}` });
    seat.appendChild(ring);
    setTimeout(() => ring.remove(), FX_CONFIG.impacts.ringDuration);
  } catch (error) {
    reportEffectError("Impact ring", error);
  }
}

/**
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
      showImpactRing(targetId, "bump");
      const flash = createElement("div", { className: "bump-impact" });
      seat.appendChild(flash);

      setTimeout(() => flash.remove(), FX_CONFIG.impacts.heavyShakeDuration);
      setTimeout(() => seat.classList.remove("tavern-shake-heavy"), FX_CONFIG.impacts.heavyShakeDuration);
    }
  } catch (error) {
    reportEffectError("Bump effect", error);
  }
}

/**
 * Goblin full-set reset burst
 * @param {string} userId
 */
export function showFullSetBurst(userId) {
  try {
    if (isPerformanceMode()) return;
    const appWindow = document.querySelector(".tavern-dice-master.application");
    if (!appWindow) return;

    const tray = appWindow.querySelector(".dice-buttons");
    if (!tray) return;

    const particleLayer = createElement("div", { className: "cinematic-particles" });
    tray.appendChild(particleLayer);
    ParticleFactory.spawnArcaneBurst(particleLayer, 30);
    setTimeout(() => particleLayer.remove(), 1200);
  } catch (error) {
    reportEffectError("Full-set burst", error);
  }
}

/**
 * Score surge effect for Goblin mode
 * @param {string} userId
 * @param {object} payload - { from, to, delta, multiplied }
 */
export function showScoreSurge(userId, payload = {}) {
  try {
    if (!game.tavernDiceMaster?.app?.rendered) return;
    if (isPerformanceMode()) return;
    setTimeout(() => {
      const appWindow = document.querySelector(".tavern-dice-master.application");
      if (!appWindow) return;

      const seat = appWindow.querySelector(`.player-seat[data-user-id="${userId}"]`);
      if (!seat) return;

      const totalEl = seat.querySelector(".player-total .total-value");
      const surgeClass = payload.multiplied ? "score-surge-multi" : "score-surge";

      seat.classList.remove("score-surge-seat", "score-surge-seat-multi");
      void seat.offsetWidth;
      seat.classList.add(payload.multiplied ? "score-surge-seat-multi" : "score-surge-seat");
      setTimeout(() => seat.classList.remove("score-surge-seat", "score-surge-seat-multi"), 900);

      if (totalEl) {
        totalEl.classList.remove("score-surge", "score-surge-multi");
        void totalEl.offsetWidth;
        totalEl.classList.add(surgeClass);
        setTimeout(() => totalEl.classList.remove(surgeClass), 800);
      }

      const totalPanel = seat.querySelector(".player-total");
      if (totalPanel) {
        totalPanel.classList.remove("total-slam");
        void totalPanel.offsetWidth;
        totalPanel.classList.add("total-slam");
        setTimeout(() => totalPanel.classList.remove("total-slam"), 450);
      }

      // Floating pop value
      const delta = payload.delta ?? 0;
      const popText = payload.multiplied ? "x2!" : (delta > 0 ? `+${delta}` : "");
      if (popText) {
        const absDelta = Math.abs(delta);
        const tier = absDelta >= 20 ? "ultra" : absDelta >= 12 ? "mega" : absDelta >= 6 ? "big" : "small";
        const popScale = Math.min(2.6, 1 + absDelta * 0.06);
        const popSize = Math.min(96, 32 + absDelta * 2.2);
        const popShake = Math.min(18, 2 + absDelta * 0.6);
        const popClasses = [
          "score-pop",
          payload.multiplied ? "multiplied" : "",
          tier
        ].filter(Boolean).join(" ");

        const pop = createElement("div", {
          className: popClasses,
          innerHTML: `<span class="score-pop-text">${popText}</span>`
        });
        pop.style.setProperty("--pop-scale", popScale.toFixed(2));
        pop.style.setProperty("--pop-size", `${popSize}px`);
        pop.style.setProperty("--pop-shake", `${popShake}px`);

        seat.appendChild(pop);
        requestAnimationFrame(() => pop.classList.add("show"));
        setTimeout(() => pop.remove(), 1100);

        if (absDelta >= 12) {
          const particleLayer = createElement("div", { className: "cinematic-particles" });
          seat.appendChild(particleLayer);
          ParticleFactory.spawnCoinShower(particleLayer, Math.min(40, 12 + absDelta));
          setTimeout(() => particleLayer.remove(), 1200);
        }

        if (absDelta >= 18) {
          seat.classList.add("tavern-shake-heavy");
          setTimeout(() => seat.classList.remove("tavern-shake-heavy"), 450);
        }
      }
    }, 60);
  } catch (error) {
    reportEffectError("Score surge", error);
  }
}

/**
 * Pot breathing pulse
 */
export function showPotPulse() {
  try {
    if (!game.tavernDiceMaster?.app?.rendered) return;
    if (isPerformanceMode()) return;
    setTimeout(() => {
      const appWindow = document.querySelector(".tavern-dice-master.application");
      if (!appWindow) return;
      const potEl = appWindow.querySelector(".pot-amount");
      if (!potEl) return;
      potEl.classList.remove("pot-breathe");
      void potEl.offsetWidth;
      potEl.classList.add("pot-breathe");
      setTimeout(() => potEl.classList.remove("pot-breathe"), 700);
      const potDisplay = appWindow.querySelector(".pot-display");
      spawnPotCoinFlip(potDisplay);
    }, 60);
  } catch (error) {
    reportEffectError("Pot pulse", error);
  }
}

/**
 * Jackpot inlay on pot
 */
export function showJackpotInlay() {
  try {
    if (!game.tavernDiceMaster?.app?.rendered) return;
    if (isPerformanceMode()) return;
    setTimeout(() => {
      const appWindow = document.querySelector(".tavern-dice-master.application");
      if (!appWindow) return;
      const potDisplay = appWindow.querySelector(".pot-display");
      if (!potDisplay) return;
      potDisplay.classList.remove("pot-jackpot");
      void potDisplay.offsetWidth;
      potDisplay.classList.add("pot-jackpot");
      showImpactFrame();
      setTimeout(() => potDisplay.classList.remove("pot-jackpot"), 1200);
    }, 60);
  } catch (error) {
    reportEffectError("Jackpot inlay", error);
  }
}

/**
 * Impact frame (RGB split feel without CRT)
 */
export function showImpactFrame() {
  try {
    if (isPerformanceMode()) return;
    const appWindow = document.querySelector(".tavern-dice-master.application");
    if (!appWindow) return;
    const frame = createElement("div", { className: "tavern-impact-frame" });
    appWindow.appendChild(frame);
    requestAnimationFrame(() => frame.classList.add("show"));
    setTimeout(() => frame.remove(), FX_CONFIG.impacts.frameDuration);
  } catch (error) {
    reportEffectError("Impact frame", error);
  }
}

/**
 * Vignette flash
 */
export function showVignetteFlash() {
  try {
    if (!game.tavernDiceMaster?.app?.rendered) return;
    if (isPerformanceMode()) return;
    setTimeout(() => {
      const appWindow = document.querySelector(".tavern-dice-master.application");
      if (!appWindow) return;
      const flash = createElement("div", { className: "tavern-vignette-flash" });
      appWindow.appendChild(flash);
      requestAnimationFrame(() => flash.classList.add("show"));
      setTimeout(() => flash.remove(), FX_CONFIG.impacts.vignetteDuration);
    }, FX_CONFIG.impacts.vignetteDelay);
  } catch (error) {
    reportEffectError("Vignette flash", error);
  }
}

/**
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
    const floatEl = createElement("div", {
      className: `floating-text ${colorClass}`,
      innerHTML: text
    });

    avatar.appendChild(floatEl);

    // Trigger animation then remove
    requestAnimationFrame(() => floatEl.classList.add("animate"));
    setTimeout(() => fadeOutAndRemove(floatEl, FX_CONFIG.floatingText.fadeDuration), FX_CONFIG.floatingText.displayDuration);

  } catch (error) {
    reportEffectError("Floating text", error);
  }
}

/**
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
    else if (type === "ACCUSE") text = "ACCUSATION!";
    else if (type === "STAREDOWN") text = "THE STAREDOWN";
    else if (type === "DUEL") text = "DUEL!";
    else if (type === "SUDDEN_DEATH") text = "SUDDEN DEATH!";
    else if (type === "COIN_STAGE") text = "THE COIN";
    else if (type === "BOOT_EARNED") text = "BOOT EARNED!";
    else if (type === "BOOT") text = "BOOT!";

    CinematicOverlay.show({
      type,
      userId,
      targetId,
      text
    });
  } catch (error) {
    reportEffectError("Skill CutIn", error);
  }
}

/**
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
    reportEffectError("Skill result", error);
  }
}

/**
 * Brief dramatic text that appears over the table when your turn begins.
 * Respects performance mode and auto-removes after animation.
 * @param {string} text - The stinger text to display
 */
export function showTurnStinger(text) {
  try {
    if (isPerformanceMode()) return;
    if (!text) return;

    const appWindow = document.querySelector(".tavern-dice-master.application");
    if (!appWindow) return;

    const tableArea = appWindow.querySelector(".tavern-table-area");
    if (!tableArea) return;

    // Remove any existing stinger
    const existing = tableArea.querySelector(".turn-stinger");
    if (existing) existing.remove();

    const stinger = createElement("div", {
      className: "turn-stinger",
      innerHTML: text
    });

    tableArea.appendChild(stinger);

    // Auto-remove after animation completes (matches CSS animation duration)
    setTimeout(() => stinger.remove(), FX_CONFIG.turnStinger.duration);
  } catch (error) {
    reportEffectError("Turn stinger", error);
  }
}

/**
 * Shows private result only to the current player's UI.
 * Note: GM users may still inspect world-state data directly.
 * @param {string} userId - User ID to show this to
 * @param {string} title - Title of the dialog
 * @param {string} content - HTML content of the result card
 */
export function showPrivateFeedback(userId, title, content) {
  // Security check: Only show if this is meant for me
  // Also, GMs *can* receive this if they are playing as NPC and sent it to themselves
  if (game.user.id !== userId) return;

  PrivateFeedbackDialog.show({ title, content });
}




