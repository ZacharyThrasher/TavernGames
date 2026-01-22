import { TavernApp } from "./app/tavern-app.js";
import { CinematicOverlay } from "./ui/cinematic-overlay.js";
import { MODULE_ID, STATE_MACRO_NAME, preloadTemplates, registerSettings, ensureStateMacro } from "./state.js";
import { setupSockets } from "./socket.js";

/* ============================================
   V13 Best Practices: Utility Functions
   ============================================ */

/**
 * V13: Debounce utility to prevent rapid-fire effect calls
 * Prevents performance issues when multiple effects trigger simultaneously
 */
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * V13: Check if performance mode is enabled (skip heavy effects)
 */
function isPerformanceMode() {
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
function createElement(tag, options = {}) {
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
function fadeOutAndRemove(element, duration = 500) {
  if (!element) return;
  element.style.transition = `opacity ${duration}ms ease-out`;
  element.style.opacity = "0";
  setTimeout(() => element.remove(), duration);
}

/* ============================================
   Application Control
   ============================================ */

const openTavern = () => {
  if (game.tavernDiceMaster?.app?.rendered) {
    game.tavernDiceMaster.app.bringToFront();
    return;
  }
  game.tavernDiceMaster?.open();
};

/* ============================================
   Hook Registrations
   ============================================ */

Hooks.on("getSceneControlButtons", (controls) => {
  const tool = {
    name: "tavern-twenty-one",
    title: "Tavern Twenty-One",
    icon: "fa-solid fa-dice-d20",
    button: true,
    visible: true,
    onClick: openTavern,
  };

  // V13: controls is an object keyed by control name
  const tokenControls = controls.tokens;
  if (tokenControls) {
    tokenControls.tools["tavern-twenty-one"] = tool;
  }
});

Hooks.once("init", async () => {
  console.log("Tavern Twenty-One | Initializing module");
  registerSettings();
  await preloadTemplates();

  // Register Handlebars helpers
  Handlebars.registerHelper("or", function (...args) {
    args.pop(); // Remove Handlebars options
    return args.some(v => !!v);
  });
  Handlebars.registerHelper("and", function (...args) {
    args.pop(); // Remove Handlebars options
    return args.every(v => !!v);
  });
});

Hooks.once("socketlib.ready", () => {
  console.log("Tavern Twenty-One | Setting up sockets");
  setupSockets();
});

Hooks.once("ready", async () => {
  console.log("Tavern Twenty-One | Module ready");

  if (game.user.isGM) {
    await ensureStateMacro();
  }

  const app = new TavernApp();
  game.tavernDiceMaster = {
    app,
    open: () => app.render(true),
    close: () => app.close(),
  };

  // V13 Premium Pattern: Expose module API for interoperability
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      showVictoryFanfare,
      showBustFanfare,
      playBumpEffect,
      showFloatingText,
      // Utility access for other modules
      isPerformanceMode,
    };
  }

  // V4: Watch for state changes via World Settings (replaces Macro hook)
  Hooks.on("updateSetting", (setting) => {
    if (setting.key === `${MODULE_ID}.gameState` && app.rendered) {
      console.log("Tavern Twenty-One | State changed, re-rendering UI");
      app.render();
    }
  });

  // V4: Legacy Macro hook for backwards compatibility during migration
  const macro = game.macros.getName(STATE_MACRO_NAME);
  if (macro) {
    Hooks.on("updateMacro", (updated) => {
      if (updated.id === macro.id && app.rendered) {
        app.render();
      }
    });
  }
});

/* ============================================
   Visual Effects - V13 Best Practices
   All effects use native DOM, error handling,
   and respect performance mode.
   ============================================ */

// Direct shake with reflow force (Instant feedback)
const shake = (element, className, duration) => {
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
    shake(appWindow, "tavern-shake-victory", 600);

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
    shake(appWindow, "tavern-shake", 500);

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

    // Shake main window for everyone
    shake(appWindow, "tavern-shake", 300);

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
