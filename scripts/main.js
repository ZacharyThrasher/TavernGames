import { TavernApp } from "./app/tavern-app.js";
import { LogsWindow } from "./app/dialogs/logs-window.js"; // V5.11.5
import { CinematicOverlay } from "./ui/cinematic-overlay.js";
import { MODULE_ID, STATE_MACRO_NAME, preloadTemplates, registerSettings, ensureStateMacro } from "./state.js";
import { setupSockets } from "./socket.js";
import { runDiagnostics } from "./diagnostics.js";
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
    await ensureStateMacro();
  }

  const app = new TavernApp();
  const logs = new LogsWindow(); // V5.11.5

  game.tavernDiceMaster = {
    app,
    logsWindow: logs, // V5.13: Renamed for clarity and consistency
    open: () => app.render(true),
    close: () => app.close(),
    toggleLogs: () => { // Helper for button
      if (logs.rendered) logs.close();
      else logs.render(true);
    },
    runDiagnostics
  };

  // V13 Premium Pattern: Expose module API for interoperability
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

  // V4: Watch for state changes via World Settings (replaces Macro hook)
  Hooks.on("updateSetting", (setting) => {
    if (setting.key === `${MODULE_ID}.gameState`) {
      if (app.rendered) {
        // console.log("Tavern Twenty-One | State changed, re-rendering App");
        app.render();
      }
      if (logs.rendered) {
        logs.render(); // Re-render logs if open
      }
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
