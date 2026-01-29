import { MODULE_ID } from "../state.js";
import { CinematicOverlay } from "./cinematic-overlay.js";
import { ParticleFactory } from "./particle-fx.js";

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
    if (window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return true;
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
/**
 * V4.1: Visual Victory Fanfare
 * Shows celebratory banner with winner name and screen shake
 * @param {string} winnerId - User ID of the winner
 * @param {number} [amount] - Gold amount won
 */
export function showVictoryFanfare(winnerId, amount) {
  try {
    // V13: Skip heavy effects in performance mode
    if (isPerformanceMode()) return;

    const winnerName = game.users.get(winnerId)?.name ?? "Winner";

    // 1. Screen shake - using debounced version
    const appWindow = game.tavernDiceMaster?.app?.element;
    if (appWindow) shake(appWindow, "tavern-shake-victory", 600);

    // 2. Cinematic Cut-In (V13 Frameless Overlay)
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

  } catch (error) {
    console.error("Tavern Twenty-One | Bust fanfare error:", error);
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
    setTimeout(() => fadeOutAndRemove(banner, 500), 1200);

    const particleLayer = createElement("div", { className: "cinematic-particles" });
    appWindow.appendChild(particleLayer);
    ParticleFactory.spawnCoinShower(particleLayer, isHeads ? 40 : 20);
    setTimeout(() => particleLayer.remove(), 2500);

    // Add a little tension: light shake on tails, celebratory shake on heads
    if (isHeads) {
      shake(appWindow, "tavern-shake-victory", 450);
      showImpactFrame();
    } else {
      shake(appWindow, "tavern-shake", 350);
    }

  } catch (error) {
    console.error("Tavern Twenty-One | Coin flip effect error:", error);
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
    setTimeout(() => fadeOutAndRemove(banner, 500), 1400);
  } catch (error) {
    console.error("Tavern Twenty-One | Cheat banner error:", error);
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

    setTimeout(() => fadeOutAndRemove(banner, 500), 3200);
  } catch (error) {
    console.error("Tavern Twenty-One | Skill banner error:", error);
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

    setTimeout(() => fadeOutAndRemove(banner, 500), 2800);
  } catch (error) {
    console.error("Tavern Twenty-One | Drink banner error:", error);
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
    setTimeout(() => glare.remove(), 700);

    setTimeout(() => fadeOutAndRemove(banner, 500), 2600);
  } catch (error) {
    console.error("Tavern Twenty-One | Cut off banner error:", error);
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
    setTimeout(() => ring.remove(), 700);
  } catch (error) {
    console.error("Tavern Twenty-One | Impact ring error:", error);
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
      showImpactRing(targetId, "bump");

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
    console.error("Tavern Twenty-One | Full-set burst error:", error);
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
    console.error("Tavern Twenty-One | Score surge error:", error);
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
    }, 60);
  } catch (error) {
    console.error("Tavern Twenty-One | Pot pulse error:", error);
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
    console.error("Tavern Twenty-One | Jackpot inlay error:", error);
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
    setTimeout(() => frame.remove(), 260);
  } catch (error) {
    console.error("Tavern Twenty-One | Impact frame error:", error);
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
      setTimeout(() => flash.remove(), 350);
    }, 60);
  } catch (error) {
    console.error("Tavern Twenty-One | Vignette flash error:", error);
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
    else if (type === "ACCUSE") text = "ACCUSATION!"; // V4.8.47
    else if (type === "STAREDOWN") text = "THE STAREDOWN"; // V4.8.47
    else if (type === "DUEL") text = "DUEL!"; // V4.8.47
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

/**
 * V4.9: Secret Private Feedback (Client-Side Dialog)
 * Shows private result only to the player (hiding it from GM chat logs)
 * @param {string} userId - User ID to show this to
 * @param {string} title - Title of the dialog
 * @param {string} content - HTML content of the result card
 */
export function showPrivateFeedback(userId, title, content) {
  // Security check: Only show if this is meant for me
  // Also, GMs *can* receive this if they are playing as NPC and sent it to themselves
  if (game.user.id !== userId) return;

  new Dialog({
    title: title,
    content: content,
    buttons: {
      ok: {
        icon: '<i class="fa-solid fa-check"></i>',
        label: "OK",
      }
    },
    default: "ok",
    close: () => { }
  }, { classes: ["tavern-cheat-feedback"] }).render(true);
}
