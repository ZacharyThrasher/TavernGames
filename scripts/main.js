import { TavernApp } from "./app/tavern-app.js";
import { MODULE_ID, preloadTemplates, registerSettings, ensureStateMacro } from "./state.js";
import { setupSockets } from "./socket.js";

Hooks.once("init", async () => {
  registerSettings();
  await preloadTemplates();

  Hooks.on("getSceneControlButtons", (controls) => {
    const tokenControls = controls.find((control) => control.name === "token");
    if (!tokenControls) return;

    tokenControls.tools.push({
      name: "tavern-dice-master",
      title: "Tavern Dice Master",
      icon: "fas fa-dice-d20",
      button: true,
      onClick: () => game.tavernDiceMaster?.open(),
    });
  });
});

Hooks.once("socketlib.ready", () => {
  setupSockets();
});

Hooks.once("ready", async () => {
  if (game.user.isGM) {
    await ensureStateMacro();
  }

  const app = new TavernApp();
  game.tavernDiceMaster = {
    app,
    open: () => app.render(true),
    close: () => app.close(),
  };

  const macro = game.macros.getName("TavernState");
  if (macro) {
    Hooks.on("updateMacro", (updated) => {
      if (updated.id === macro.id) {
        app.render({ parts: ["game", "lobby", "status"] });
      }
    });
  }
});
