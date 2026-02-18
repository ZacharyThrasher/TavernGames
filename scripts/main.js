import { TavernApp } from "./app/tavern-app.js";
import { LogsWindow } from "./app/dialogs/logs-window.js";
import { AICrewWindow } from "./app/dialogs/ai-crew-window.js";
import { CinematicOverlay } from "./ui/cinematic-overlay.js";
import { preloadTemplates, registerSettings, initializeState } from "./state.js";
import { MODULE_ID } from "./twenty-one/constants.js";
import { setupSockets } from "./socket.js";
import { runDiagnostics } from "./diagnostics.js";
import { requestAutoplayTick } from "./ai/autoplay.js";
import {
  showVictoryFanfare,
  showBustFanfare,
  playBumpEffect,
  showFloatingText,
  showScoreSurge,
  showPotPulse,
  showJackpotInlay,
  showVignetteFlash,
  showSkillCutIn,
  showSkillResult,
  isPerformanceMode
} from "./ui/fx.js";

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

const REVEAL_ACTIVE_SELECTOR = ".dice-reveal-overlay, .dice-reveal-quick";
const UI_REFRESH_DEFER_MS = 60;
const UI_REFRESH_MAX_DEFERRALS = 120;

function hasActiveDiceReveal() {
  return Boolean(document.querySelector(REVEAL_ACTIVE_SELECTOR));
}

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
  Handlebars.registerHelper("formatMod", function (mod) {
    const val = Number(mod);
    if (isNaN(val)) return mod;
    return val >= 0 ? `+${val}` : val;
  });
});

Hooks.once("socketlib.ready", () => {
  console.log("Tavern Twenty-One | Setting up sockets");
  setupSockets();
});

Hooks.once("ready", async () => {
  console.log("Tavern Twenty-One | Module ready");

  if (game.user.isGM) {
    await initializeState();
    requestAutoplayTick(250);
  }

  const app = new TavernApp();
  const logs = new LogsWindow();
  const aiCrew = new AICrewWindow();
  let renderScheduled = false;
  let refreshDeferrals = 0;

  const scheduleUiRefresh = () => {
    if (renderScheduled) return;
    renderScheduled = true;
    setTimeout(() => {
      if (hasActiveDiceReveal() && refreshDeferrals < UI_REFRESH_MAX_DEFERRALS) {
        refreshDeferrals += 1;
        renderScheduled = false;
        setTimeout(scheduleUiRefresh, UI_REFRESH_DEFER_MS);
        return;
      }
      refreshDeferrals = 0;
      renderScheduled = false;
      if (app.rendered) {
        app.render();
      }
      if (logs.rendered) logs.render();
      if (aiCrew.rendered) aiCrew.render();
    }, 0);
  };

  game.tavernDiceMaster = {
    app,
    logsWindow: logs,
    aiCrewWindow: aiCrew,
    open: () => app.render(true),
    close: () => app.close(),
    toggleLogs: () => { // Helper for button
      if (logs.rendered) logs.close();
      else logs.render(true);
    },
    toggleAiCrew: () => {
      if (aiCrew.rendered) aiCrew.close();
      else aiCrew.render(true);
    },
    runDiagnostics
  };
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      showVictoryFanfare,
      showBustFanfare,
      playBumpEffect,
      showFloatingText,
      showScoreSurge,
      showPotPulse,
      showJackpotInlay,
      showVignetteFlash,
      // Utility access for other modules
      isPerformanceMode,
      runDiagnostics,
    };
  }
  Hooks.on("updateSetting", (setting) => {
    if (setting.key === `${MODULE_ID}.gameState`) {
      scheduleUiRefresh();
      requestAutoplayTick();
    }
  });
});

