import { TavernApp } from "./app/tavern-app.js";
import { MODULE_ID, STATE_MACRO_NAME, preloadTemplates, registerSettings, ensureStateMacro } from "./state.js";
import { setupSockets } from "./socket.js";

const openTavern = () => {
  if (game.tavernDiceMaster?.app?.rendered) {
    game.tavernDiceMaster.app.bringToFront();
    return;
  }
  game.tavernDiceMaster?.open();
};

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

  // V4: Watch for state changes via World Settings (replaces Macro hook)
  // This hook fires when any setting is changed
  Hooks.on("updateSetting", (setting) => {
    // Check if this is our game state setting
    if (setting.key === `${MODULE_ID}.gameState` && app.rendered) {
      console.log("Tavern Twenty-One | State changed, re-rendering UI");
      app.render();
    }
  });

  // V4: Also keep legacy Macro hook for backwards compatibility during migration
  const macro = game.macros.getName(STATE_MACRO_NAME);
  if (macro) {
    Hooks.on("updateMacro", (updated) => {
      if (updated.id === macro.id && app.rendered) {
        app.render();
      }
    });
  }
});

/* V4.1: Visual Victory Fanfare */
export function showVictoryFanfare(winnerId) {
  const winnerName = game.users.get(winnerId)?.name ?? "Winner";

  // 1. Screenshake
  const appElement = document.getElementById("tavern-dice-master-app");
  if (appElement) {
    appElement.classList.add("tavern-shake");
    setTimeout(() => appElement.classList.remove("tavern-shake"), 500);
  }

  // 2. Victory Banner Overlay
  const banner = $(`<div class="tavern-victory-banner">
    <div class="banner-content">
      <div class="banner-title">VICTORY!</div>
      <div class="banner-subtitle">${winnerName} takes the pot!</div>
    </div>
  </div>`);

  $("body").append(banner);
  setTimeout(() => {
    banner.fadeOut(1000, () => banner.remove());
  }, 4000); // Show for 4s then fade
}

/* V4.2: Bump Impact Effect */
export function playBumpEffect(targetId) {
  if (!game.tavernDiceMaster?.app?.rendered) return;

  // Find the seat using the data attribute we added
  const appElement = document.getElementById("tavern-dice-master-app");
  if (!appElement) return;

  const seat = appElement.querySelector(`.player-seat[data-user-id="${targetId}"]`);
  if (seat) {
    seat.classList.add("tavern-shake-heavy");

    // Add visual impact flash
    const flash = $(`<div class="bump-impact"></div>`);
    $(seat).append(flash);

    setTimeout(() => flash.remove(), 500);
    setTimeout(() => seat.classList.remove("tavern-shake-heavy"), 500);
  }

  // Also shake the main window slightly for everyone to feel it
  appElement.classList.add("tavern-shake");
  setTimeout(() => appElement.classList.remove("tavern-shake"), 300);
}

/* V4.2: Floating Gold Text */
export function showFloatingText(userId, amount) {
  if (!game.tavernDiceMaster?.app?.rendered) return;

  const appElement = document.getElementById("tavern-dice-master-app");
  if (!appElement) return;

  const seat = appElement.querySelector(`.player-seat[data-user-id="${userId}"]`);
  if (!seat) return;

  // Format text: +10gp or -10gp
  const isPositive = amount > 0;
  const text = isPositive ? `+${amount}gp` : `${amount}gp`;
  const colorClass = isPositive ? "gain" : "loss";

  // Append to avatar container for positioning
  const avatar = seat.querySelector(".player-avatar");
  if (!avatar) return;

  const float = $(`<div class="floating-text ${colorClass}">${text}</div>`);
  $(avatar).append(float);

  // Animate and remove
  setTimeout(() => {
    float.fadeOut(500, () => float.remove());
  }, 1500);
}

