import { getState, updateState } from "../state.js";
import { tavernSocket } from "../socket.js";
import { applyJuicePress, showClickBurst, isPerformanceMode, showTurnStinger } from "../ui/fx.js";
import { getRandomStinger } from "../ui/theme-flavor.js";
import { initPremiumEffects, teardownPremiumEffects, refreshPremiumEffects, GoldOdometer } from "../ui/premium-fx.js";
import { MODULE_ID } from "../twenty-one/constants.js";
import { localizeOrFallback } from "../twenty-one/utils/i18n.js";

const t = (key, fallback, data = {}) => localizeOrFallback(key, fallback, data);
const AUTOPLAY_STRATEGIES = new Set(["balanced", "aggressive", "conservative", "duelist", "tactician", "bully", "chaotic"]);
const normalizeAutoplayStrategy = (value) => (AUTOPLAY_STRATEGIES.has(value) ? value : "balanced");
const AUTOPLAY_DIFFICULTIES = new Set(["easy", "normal", "hard", "legendary"]);
const normalizeAutoplayDifficulty = (value) => (AUTOPLAY_DIFFICULTIES.has(value) ? value : "normal");

function parseIntegerInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

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

  const setAutoplayConfig = async (playerId, patch) => {
    if (!playerId) return;
    if (!tavernSocket) return;
    await tavernSocket.executeAsGM("setAutoplayConfig", { playerId, ...patch });
  };

  const autoplayToggles = app.element.querySelectorAll(".autoplay-toggle");
  autoplayToggles.forEach((toggle) => {
    toggle.addEventListener("change", async (event) => {
      const target = event.currentTarget;
      const playerId = target?.dataset?.playerId;
      if (!playerId) return;

      if (!game.user.isGM) {
        ui.notifications.warn(t("TAVERN.Notifications.GMOnlyAutoplay", "Only the GM can manage autoplay."));
        target.checked = !target.checked;
        return;
      }

      const row = target.closest(".autoplay-row");
      const strategy = normalizeAutoplayStrategy(row?.querySelector(".autoplay-strategy")?.value);
      const difficulty = normalizeAutoplayDifficulty(row?.querySelector(".autoplay-difficulty")?.value);
      const enabled = target.checked === true;

      const strategyField = row?.querySelector(".autoplay-strategy");
      const difficultyField = row?.querySelector(".autoplay-difficulty");
      if (strategyField) strategyField.disabled = !enabled;
      if (difficultyField) difficultyField.disabled = !enabled;

      try {
        await setAutoplayConfig(playerId, { enabled, strategy, difficulty });
      } catch (error) {
        target.checked = !enabled;
        if (strategyField) strategyField.disabled = enabled;
        if (difficultyField) difficultyField.disabled = enabled;
        console.warn("Tavern Twenty-One | Failed to set autoplay toggle:", error);
      }
    });
  });

  const autoplayStrategySelects = app.element.querySelectorAll(".autoplay-strategy");
  autoplayStrategySelects.forEach((select) => {
    select.addEventListener("change", async (event) => {
      const target = event.currentTarget;
      const playerId = target?.dataset?.playerId;
      if (!playerId) return;

      if (!game.user.isGM) {
        ui.notifications.warn(t("TAVERN.Notifications.GMOnlyAutoplay", "Only the GM can manage autoplay."));
        return;
      }

      const row = target.closest(".autoplay-row");
      const toggle = row?.querySelector(".autoplay-toggle");
      const enabled = toggle?.checked === true;
      const strategy = normalizeAutoplayStrategy(target.value);
      const difficulty = normalizeAutoplayDifficulty(row?.querySelector(".autoplay-difficulty")?.value);

      try {
        await setAutoplayConfig(playerId, { enabled, strategy, difficulty });
      } catch (error) {
        console.warn("Tavern Twenty-One | Failed to set autoplay strategy:", error);
      }
    });
  });

  const autoplayDifficultySelects = app.element.querySelectorAll(".autoplay-difficulty");
  autoplayDifficultySelects.forEach((select) => {
    select.addEventListener("change", async (event) => {
      const target = event.currentTarget;
      const playerId = target?.dataset?.playerId;
      if (!playerId) return;

      if (!game.user.isGM) {
        ui.notifications.warn(t("TAVERN.Notifications.GMOnlyAutoplay", "Only the GM can manage autoplay."));
        return;
      }

      const row = target.closest(".autoplay-row");
      const toggle = row?.querySelector(".autoplay-toggle");
      const enabled = toggle?.checked === true;
      const strategy = normalizeAutoplayStrategy(row?.querySelector(".autoplay-strategy")?.value);
      const difficulty = normalizeAutoplayDifficulty(target.value);

      try {
        await setAutoplayConfig(playerId, { enabled, strategy, difficulty });
      } catch (error) {
        console.warn("Tavern Twenty-One | Failed to set autoplay difficulty:", error);
      }
    });
  });

  const addAiSeatButton = app.element.querySelector(".btn-add-ai-seat");
  if (addAiSeatButton) {
    addAiSeatButton.addEventListener("click", async () => {
      if (!game.user.isGM) {
        ui.notifications.warn(t("TAVERN.Notifications.GMOnlyAutoplay", "Only the GM can manage autoplay."));
        return;
      }

      const actorId = app.element.querySelector(".ai-actor-select")?.value?.trim() || null;
      const name = app.element.querySelector(".ai-name-input")?.value?.trim() || null;
      const strategy = normalizeAutoplayStrategy(app.element.querySelector(".autoplay-default-strategy")?.value);
      const difficulty = normalizeAutoplayDifficulty(app.element.querySelector(".autoplay-default-difficulty")?.value);
      const walletRaw = app.element.querySelector(".ai-wallet-input")?.value;
      const initialWallet = parseIntegerInRange(walletRaw, game.settings.get(MODULE_ID, "fixedAnte") * 20, 1, 999999);
      if (!tavernSocket) return;

      try {
        await tavernSocket.executeAsGM("addAiSeat", {
          actorId,
          name,
          strategy,
          difficulty,
          initialWallet,
          enabled: true
        });
        const nameInput = app.element.querySelector(".ai-name-input");
        if (nameInput) nameInput.value = "";
      } catch (error) {
        console.warn("Tavern Twenty-One | Failed to add AI seat:", error);
      }
    });
  }

  const summonAiPartyButton = app.element.querySelector(".btn-summon-ai-party");
  if (summonAiPartyButton) {
    summonAiPartyButton.addEventListener("click", async () => {
      if (!game.user.isGM) {
        ui.notifications.warn(t("TAVERN.Notifications.GMOnlyAutoplay", "Only the GM can manage autoplay."));
        return;
      }

      const countRaw = app.element.querySelector(".ai-party-count")?.value;
      const count = parseIntegerInRange(countRaw, 3, 1, 8);
      const styleMode = app.element.querySelector(".ai-party-style")?.value;
      const strategy = styleMode === "mixed"
        ? "mixed"
        : normalizeAutoplayStrategy(app.element.querySelector(".autoplay-default-strategy")?.value);
      const difficulty = normalizeAutoplayDifficulty(app.element.querySelector(".autoplay-default-difficulty")?.value);
      const walletRaw = app.element.querySelector(".ai-wallet-input")?.value;
      const initialWallet = parseIntegerInRange(walletRaw, game.settings.get(MODULE_ID, "fixedAnte") * 20, 1, 999999);
      if (!tavernSocket) return;

      try {
        await tavernSocket.executeAsGM("summonAiParty", {
          count,
          strategy,
          difficulty,
          initialWallet,
          enabled: true
        });
      } catch (error) {
        console.warn("Tavern Twenty-One | Failed to summon AI party:", error);
      }
    });
  }

  const removeAiSeatButtons = app.element.querySelectorAll(".btn-remove-ai-seat");
  removeAiSeatButtons.forEach((button) => {
    button.addEventListener("click", async (event) => {
      if (!game.user.isGM) {
        ui.notifications.warn(t("TAVERN.Notifications.GMOnlyAutoplay", "Only the GM can manage autoplay."));
        return;
      }
      const playerId = event.currentTarget?.dataset?.playerId;
      if (!playerId) return;
      if (!tavernSocket) return;

      try {
        await tavernSocket.executeAsGM("removeAiSeat", playerId);
      } catch (error) {
        console.warn("Tavern Twenty-One | Failed to remove AI seat:", error);
      }
    });
  });

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
