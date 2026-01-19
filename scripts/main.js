import { TavernApp } from "./app/tavern-app.js";
import { MODULE_ID, preloadTemplates, registerSettings, ensureStateMacro } from "./state.js";
import { setupSockets } from "./socket.js";

const openTavern = () => {
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
};

Hooks.on("getSceneControlButtons", (controls) => {
  const tool = {
    name: "tavern-dice-master",
    title: "Tavern Dice Master",
    icon: "fa-solid fa-dice-d20",
    button: true,
    visible: true,
    onClick: openTavern,
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
    activeTool: "tavern-dice-master",
    visible: true,
  });
});

const injectSidebarButton = (root) => {
  if (!root?.length) return false;
  if (root.find(".tavern-sidebar-button").length) return true;

  const header = root.find(".header-actions, .header-buttons, .directory-header .header-actions").first();
  if (!header.length) return false;

  const button = $(
    `<button type="button" class="tavern-sidebar-button" title="Tavern Dice Master">
      <i class="fa-solid fa-dice-d20"></i>
    </button>`
  );
  button.on("click", openTavern);
  header.prepend(button);
  return true;
};

const ensureFloatingButton = () => {
  if (document.querySelector(".tavern-floating-button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tavern-floating-button";
  button.title = "Tavern Dice Master";
  button.innerHTML = "<i class=\"fa-solid fa-dice-d20\"></i>";
  button.addEventListener("click", openTavern);
  document.body.appendChild(button);
};

Hooks.on("renderSidebarTab", (app, html) => {
  if (app?.options?.id !== "chat") return;
  const injected = injectSidebarButton(html);
  if (!injected) {
    ensureFloatingButton();
  }
});

Hooks.once("init", async () => {
  registerSettings();
  await preloadTemplates();
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
