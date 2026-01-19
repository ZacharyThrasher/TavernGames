import { TavernApp } from "./app/tavern-app.js";
import { MODULE_ID, preloadTemplates, registerSettings, ensureStateMacro } from "./state.js";
import { setupSockets } from "./socket.js";

Hooks.once("init", async () => {
  registerSettings();
  await preloadTemplates();

  Hooks.on("getSceneControlButtons", (controls) => {
    const tool = {
      name: "tavern-dice-master",
      title: "Tavern Dice Master",
      icon: "fa-solid fa-dice-d20",
      button: true,
      onClick: () => {
        if (game.tavernDiceMaster?.open) {
          game.tavernDiceMaster.open();
          return;
        }
        const app = new TavernApp();
        game.tavernDiceMaster = {
          app,
          open: () => app.render(true),
          close: () => app.close(),
        };
        app.render(true);
      },
    };

    const tokenControls = controls.find((control) => control.name === "token");
    if (tokenControls) {
      tokenControls.tools.push(tool);
      return;
    }

    controls.push({
      name: "tavern",
      title: "Tavern",
      icon: "fa-solid fa-dice-d20",
      layer: "TokenLayer",
      tools: [tool],
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
