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

  // Watch for state changes via the macro
  const macro = game.macros.getName(STATE_MACRO_NAME);
  if (macro) {
    Hooks.on("updateMacro", (updated) => {
      if (updated.id === macro.id && app.rendered) {
        app.render();
      }
    });
  }
});
