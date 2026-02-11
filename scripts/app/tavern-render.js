import { getState, updateState } from "../state.js";
import { applyJuicePress, showClickBurst, isPerformanceMode, showTurnStinger } from "../ui/fx.js";
import { getRandomStinger } from "../ui/theme-flavor.js";
import { initPremiumEffects, teardownPremiumEffects, refreshPremiumEffects, GoldOdometer } from "../ui/premium-fx.js";
import { MODULE_ID } from "../twenty-one/constants.js";
import { localizeOrFallback } from "../twenty-one/utils/i18n.js";

const t = (key, fallback, data = {}) => localizeOrFallback(key, fallback, data);

export function renderTavernApp(app, context) {
  if (app._diceHoverHandlers) {
    app.element.removeEventListener("pointerover", app._diceHoverHandlers.over, true);
    app.element.removeEventListener("pointerout", app._diceHoverHandlers.out, true);
  }

  app._diceHoverHandlers = {
    over: (event) => {
      const button = event.target.closest(".btn-die-premium");
      if (!button || button.disabled) return;
      button.classList.add("is-hovered");
    },
    out: (event) => {
      const button = event.target.closest(".btn-die-premium");
      if (!button) return;
      button.classList.remove("is-hovered");
    }
  };

  app.element.addEventListener("pointerover", app._diceHoverHandlers.over, true);
  app.element.addEventListener("pointerout", app._diceHoverHandlers.out, true);

  const currentTheme = game.settings.get(MODULE_ID, "tableTheme") ?? "sword-coast";
  app.element.dataset.theme = currentTheme;

  if (context.myTurn && context.isPlaying && !app._lastStingerShown) {
    app._lastStingerShown = true;
    setTimeout(() => showTurnStinger(getRandomStinger(currentTheme)), 200);
  }
  if (!context.myTurn) {
    app._lastStingerShown = false;
  }

  if (!app._juiceIntroPlayed) {
    app.element.classList.add("tavern-app-intro");
    setTimeout(() => app.element.classList.remove("tavern-app-intro"), 900);
    app._juiceIntroPlayed = true;
  }

  if (app._juiceHandlers) {
    app.element.removeEventListener("pointerdown", app._juiceHandlers.down, true);
    app.element.removeEventListener("pointerover", app._juiceHandlers.enter, true);
    app.element.removeEventListener("pointerout", app._juiceHandlers.leave, true);
  }

  app._juiceHandlers = {
    down: (event) => {
      const target = event.target.closest(".btn, .btn-die-premium, .btn-retaliation-die, .accuse-portrait, .duel-participant");
      if (!target) return;
      if (target.disabled || target.classList.contains("disabled")) return;
      if (target.closest(".tavern-controls.locked")) return;

      applyJuicePress(target);

      let tone = "gold";
      if (target.classList.contains("btn-fold")) tone = "blood";
      else if (target.classList.contains("btn-hold")) tone = "mint";
      else if (target.classList.contains("btn-skill") || target.classList.contains("btn-hunch") || target.classList.contains("btn-profile")) tone = "arcane";
      else if (target.classList.contains("btn-bump") || target.classList.contains("btn-goad")) tone = "ember";
      else if (target.classList.contains("accuse-portrait") || target.classList.contains("btn-accuse")) tone = "blood";

      showClickBurst(target, tone);
    },
    enter: (event) => {
      const target = event.target.closest(".btn, .btn-die-premium, .accuse-portrait, .player-seat, .btn-retaliation-die");
      if (!target) return;
      target.classList.add("juice-hover");
    },
    leave: (event) => {
      const target = event.target.closest(".btn, .btn-die-premium, .accuse-portrait, .player-seat, .btn-retaliation-die");
      if (!target) return;
      target.classList.remove("juice-hover");
    }
  };

  app.element.addEventListener("pointerdown", app._juiceHandlers.down, true);
  app.element.addEventListener("pointerover", app._juiceHandlers.enter, true);
  app.element.addEventListener("pointerout", app._juiceHandlers.leave, true);

  if (!isPerformanceMode()) {
    if (app._parallaxHandlers) {
      app.element.removeEventListener("pointermove", app._parallaxHandlers.move);
      app.element.removeEventListener("pointerleave", app._parallaxHandlers.leave);
    }

    app._parallaxHandlers = {
      move: (event) => {
        const rect = app.element.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
        app.element.style.setProperty("--cursor-x", x.toFixed(3));
        app.element.style.setProperty("--cursor-y", y.toFixed(3));
      },
      leave: () => {
        app.element.style.setProperty("--cursor-x", "0.5");
        app.element.style.setProperty("--cursor-y", "0.5");
      }
    };

    app.element.addEventListener("pointermove", app._parallaxHandlers.move);
    app.element.addEventListener("pointerleave", app._parallaxHandlers.leave);
  } else if (app._parallaxHandlers) {
    app.element.removeEventListener("pointermove", app._parallaxHandlers.move);
    app.element.removeEventListener("pointerleave", app._parallaxHandlers.leave);
  }

  const anteInput = app.element.querySelector("#ante-input");
  if (anteInput) {
    anteInput.addEventListener("change", async (event) => {
      const newAnte = parseInt(event.target.value);
      if (newAnte >= 1 && newAnte <= 1000) {
        await game.settings.set(MODULE_ID, "fixedAnte", newAnte);
        ui.notifications.info(t("TAVERN.Notifications.AnteSet", "Ante set to {amount}gp", { amount: newAnte }));
      } else {
        event.target.value = game.settings.get(MODULE_ID, "fixedAnte");
        ui.notifications.warn(t("TAVERN.Notifications.AnteRange", "Ante must be between 1 and 1000 gp"));
      }
    });
  }

  const modeSelect = app.element.querySelector("#game-mode-select");
  if (modeSelect) {
    modeSelect.addEventListener("change", async (event) => {
      if (!game.user.isGM) {
        ui.notifications.warn(t("TAVERN.Notifications.GMOnlyModeChange", "Only the GM can change game mode."));
        event.target.value = game.settings.get(MODULE_ID, "gameMode");
        return;
      }
      const newMode = event.target.value;
      const state = getState();
      const currentTable = state.tableData ?? {};

      const updatedTable = { ...currentTable, gameMode: newMode };
      await game.settings.set(MODULE_ID, "gameMode", newMode);
      await updateState({ tableData: updatedTable });

      ui.notifications.info(
        t(
          "TAVERN.Notifications.GameModeChanged",
          "Game Mode changed to {mode}",
          { mode: newMode === "goblin" ? "Goblin Rules" : "Standard Twenty-One" }
        )
      );
    });
  }

  const heatInput = app.element.querySelector("#starting-heat");
  if (heatInput) {
    heatInput.addEventListener("change", async (event) => {
      if (!game.user.isGM) {
        ui.notifications.warn(t("TAVERN.Notifications.GMOnlyHeatChange", "Only the GM can change starting heat."));
        const state = getState();
        event.target.value = state.tableData?.houseRules?.startingHeat ?? 10;
        return;
      }
      const newHeat = parseInt(event.target.value) || 10;
      if (newHeat >= 5 && newHeat <= 30) {
        const state = getState();
        const houseRules = state.tableData?.houseRules || {};
        houseRules.startingHeat = newHeat;

        await updateState({ tableData: { ...state.tableData, houseRules } });
      } else {
        ui.notifications.warn(t("TAVERN.Notifications.HeatRange", "Heat must be between 5 and 30"));
      }
    });
  }

  const themeSelect = app.element.querySelector("#theme-select");
  if (themeSelect) {
    themeSelect.addEventListener("change", async (event) => {
      if (!game.user.isGM) {
        ui.notifications.warn(t("TAVERN.Notifications.GMOnlyThemeChange", "Only the GM can change the table theme."));
        event.target.value = game.settings.get(MODULE_ID, "tableTheme");
        return;
      }
      const newTheme = event.target.value;
      await game.settings.set(MODULE_ID, "tableTheme", newTheme);
      ui.notifications.info(
        t("TAVERN.Notifications.ThemeChanged", "Table theme changed to {theme}", {
          theme: event.target.selectedOptions[0]?.text ?? newTheme
        })
      );
    });
  }

  if (app._premiumEffectsRoot !== app.element) {
    if (app._premiumEffectsRoot) {
      teardownPremiumEffects(app._premiumEffectsRoot);
    }
    initPremiumEffects(app.element);
    app._premiumEffectsRoot = app.element;
  } else {
    refreshPremiumEffects(app.element);
  }

  const potAmountEl = app.element.querySelector(".pot-amount");
  if (potAmountEl && context.pot !== undefined) {
    GoldOdometer.update(potAmountEl, context.pot ?? 0, app._odometerInitialized ?? false);
    app._odometerInitialized = true;
  }

  const accusePortraits = app.element.querySelectorAll(".accuse-portrait");
  const accuseBtn = app.element.querySelector(".btn-accuse");

  const selectAccusePortrait = (portrait) => {
    accusePortraits.forEach(other => {
      other.classList.remove("selected");
      other.setAttribute("aria-pressed", "false");
    });
    portrait.classList.add("selected");
    portrait.setAttribute("aria-pressed", "true");
    if (accuseBtn) accuseBtn.disabled = false;
  };

  accusePortraits.forEach((portrait) => {
    portrait.addEventListener("click", () => selectAccusePortrait(portrait));
    portrait.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectAccusePortrait(portrait);
      }
    });
  });
}
