import { getState } from "../../state.js";
import { tavernSocket } from "../../socket.js";
import { MODULE_ID } from "../../twenty-one/constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const STRATEGIES = ["balanced", "aggressive", "conservative", "duelist", "tactician", "bully", "chaotic"];
const DIFFICULTIES = ["easy", "normal", "hard", "legendary"];

const DEFAULT_STRATEGY = "balanced";
const DEFAULT_DIFFICULTY = "normal";

function normalizeStrategy(value) {
  return STRATEGIES.includes(value) ? value : DEFAULT_STRATEGY;
}

function normalizeDifficulty(value) {
  return DIFFICULTIES.includes(value) ? value : DEFAULT_DIFFICULTY;
}

function parseIntegerInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function canManageSeats(state) {
  return state.status === "LOBBY" || state.status === "PAYOUT";
}

export class AICrewWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tavern-ai-crew-window",
    tag: "div",
    window: {
      title: "AI Tavern Crew Manager",
      icon: "fa-solid fa-robot",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 760,
      height: 720
    },
    classes: ["tavern-dialog-window", "tavern-ai-crew-window"]
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/dialogs/ai-crew-window.hbs`
    }
  };

  async _prepareContext() {
    const state = getState();
    const isGM = game.user.isGM;
    const ante = Number(game.settings.get(MODULE_ID, "fixedAnte") ?? 5);
    const defaultAiWallet = Math.max(ante, ante * 20);
    const autoplayState = state.autoplay ?? {};
    const players = Object.values(state.players ?? {});
    const canManageAiSeats = isGM && canManageSeats(state);

    const npcActorOptions = game.actors
      .filter((actor) => actor?.type === "npc")
      .map((actor) => ({ id: actor.id, name: actor.name ?? "Unnamed NPC", img: actor.img || "icons/svg/mystery-man.svg" }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const autoplayRows = players.map((player) => {
      const raw = autoplayState[player.id] ?? {};
      return {
        id: player.id,
        name: player.name ?? player.userName ?? "Unknown",
        enabled: raw.enabled === true,
        strategy: normalizeStrategy(raw.strategy),
        difficulty: normalizeDifficulty(raw.difficulty),
        isAi: player.isAi === true,
        canRemove: player.isAi === true && canManageAiSeats
      };
    });

    autoplayRows.sort((a, b) => {
      if (a.isAi !== b.isAi) return a.isAi ? -1 : 1;
      return String(a.name).localeCompare(String(b.name));
    });

    this._npcActorOptions = npcActorOptions;

    return {
      isGM,
      status: state.status,
      canManageAiSeats,
      ante,
      defaultAiWallet,
      npcActorOptions,
      hasNpcActorOptions: npcActorOptions.length > 0,
      autoplayRows,
      hasRows: autoplayRows.length > 0,
      aiSeatCount: autoplayRows.filter((row) => row.isAi).length,
      autoplayEnabledCount: autoplayRows.filter((row) => row.enabled).length
    };
  }

  _refreshMainApp() {
    if (game.tavernDiceMaster?.app?.rendered) {
      game.tavernDiceMaster.app.render();
    }
  }

  _bindNpcSearch() {
    const searchInput = this.element.querySelector(".ai-crew-npc-search");
    const actorSelect = this.element.querySelector(".ai-crew-actor-select");
    if (!searchInput || !actorSelect) return;

    const allActors = Array.isArray(this._npcActorOptions) ? this._npcActorOptions : [];

    const renderOptions = () => {
      const query = String(searchInput.value ?? "").trim().toLowerCase();
      const selected = actorSelect.value;
      const filtered = query
        ? allActors.filter((actor) => String(actor.name).toLowerCase().includes(query))
        : allActors;

      actorSelect.innerHTML = "";
      const randomOpt = document.createElement("option");
      randomOpt.value = "";
      randomOpt.textContent = "Random NPC";
      actorSelect.appendChild(randomOpt);

      for (const actor of filtered) {
        const opt = document.createElement("option");
        opt.value = actor.id;
        opt.textContent = actor.name;
        actorSelect.appendChild(opt);
      }

      if (selected) {
        const stillVisible = filtered.some((actor) => actor.id === selected);
        if (!stillVisible) {
          const fullActor = allActors.find((actor) => actor.id === selected);
          if (fullActor) {
            const opt = document.createElement("option");
            opt.value = fullActor.id;
            opt.textContent = `${fullActor.name} (selected)`;
            actorSelect.appendChild(opt);
          }
        }
        actorSelect.value = selected;
      }
    };

    searchInput.addEventListener("input", renderOptions);
    renderOptions();
  }

  _bindGlobalActions() {
    const addButton = this.element.querySelector(".btn-ai-crew-add");
    if (addButton) {
      addButton.addEventListener("click", async () => {
        const state = getState();
        if (!game.user.isGM) return;
        if (!canManageSeats(state)) {
          ui.notifications.warn("AI seats can only be added in Lobby or Payout.");
          return;
        }
        if (!tavernSocket) return;

        const actorId = this.element.querySelector(".ai-crew-actor-select")?.value?.trim() || null;
        const name = this.element.querySelector(".ai-crew-name-input")?.value?.trim() || null;
        const strategy = normalizeStrategy(this.element.querySelector(".ai-crew-default-strategy")?.value);
        const difficulty = normalizeDifficulty(this.element.querySelector(".ai-crew-default-difficulty")?.value);
        const walletRaw = this.element.querySelector(".ai-crew-wallet-input")?.value;
        const ante = Number(game.settings.get(MODULE_ID, "fixedAnte") ?? 5);
        const initialWallet = parseIntegerInRange(walletRaw, Math.max(ante, ante * 20), 1, 999999);

        await tavernSocket.executeAsGM("addAiSeat", {
          actorId,
          name,
          strategy,
          difficulty,
          initialWallet,
          enabled: true
        });
        this._refreshMainApp();
      });
    }

    const summonButton = this.element.querySelector(".btn-ai-crew-summon");
    if (summonButton) {
      summonButton.addEventListener("click", async () => {
        const state = getState();
        if (!game.user.isGM) return;
        if (!canManageSeats(state)) {
          ui.notifications.warn("AI seats can only be added in Lobby or Payout.");
          return;
        }
        if (!tavernSocket) return;

        const countRaw = this.element.querySelector(".ai-crew-party-count")?.value;
        const count = parseIntegerInRange(countRaw, 3, 1, 8);
        const styleMode = this.element.querySelector(".ai-crew-party-style")?.value;
        const strategy = styleMode === "mixed"
          ? "mixed"
          : normalizeStrategy(this.element.querySelector(".ai-crew-default-strategy")?.value);
        const difficulty = normalizeDifficulty(this.element.querySelector(".ai-crew-default-difficulty")?.value);
        const walletRaw = this.element.querySelector(".ai-crew-wallet-input")?.value;
        const ante = Number(game.settings.get(MODULE_ID, "fixedAnte") ?? 5);
        const initialWallet = parseIntegerInRange(walletRaw, Math.max(ante, ante * 20), 1, 999999);

        await tavernSocket.executeAsGM("summonAiParty", {
          count,
          strategy,
          difficulty,
          initialWallet,
          enabled: true
        });
        this._refreshMainApp();
      });
    }
  }

  _bindSeatActions() {
    const setAutoplayConfig = async (playerId, patch) => {
      if (!playerId || !tavernSocket) return;
      await tavernSocket.executeAsGM("setAutoplayConfig", { playerId, ...patch });
    };

    this.element.querySelectorAll(".ai-crew-autoplay-toggle").forEach((toggle) => {
      toggle.addEventListener("change", async (event) => {
        const target = event.currentTarget;
        const playerId = target?.dataset?.playerId;
        if (!playerId) return;
        if (!game.user.isGM) return;

        const row = target.closest(".ai-crew-seat-row");
        const enabled = target.checked === true;
        const strategyField = row?.querySelector(".ai-crew-strategy");
        const difficultyField = row?.querySelector(".ai-crew-difficulty");
        const strategy = normalizeStrategy(strategyField?.value);
        const difficulty = normalizeDifficulty(difficultyField?.value);

        if (strategyField) strategyField.disabled = !enabled;
        if (difficultyField) difficultyField.disabled = !enabled;

        await setAutoplayConfig(playerId, { enabled, strategy, difficulty });
      });
    });

    this.element.querySelectorAll(".ai-crew-strategy").forEach((select) => {
      select.addEventListener("change", async (event) => {
        const target = event.currentTarget;
        const playerId = target?.dataset?.playerId;
        if (!playerId) return;
        if (!game.user.isGM) return;

        const row = target.closest(".ai-crew-seat-row");
        const enabled = row?.querySelector(".ai-crew-autoplay-toggle")?.checked === true;
        const strategy = normalizeStrategy(target.value);
        const difficulty = normalizeDifficulty(row?.querySelector(".ai-crew-difficulty")?.value);

        await setAutoplayConfig(playerId, { enabled, strategy, difficulty });
      });
    });

    this.element.querySelectorAll(".ai-crew-difficulty").forEach((select) => {
      select.addEventListener("change", async (event) => {
        const target = event.currentTarget;
        const playerId = target?.dataset?.playerId;
        if (!playerId) return;
        if (!game.user.isGM) return;

        const row = target.closest(".ai-crew-seat-row");
        const enabled = row?.querySelector(".ai-crew-autoplay-toggle")?.checked === true;
        const strategy = normalizeStrategy(row?.querySelector(".ai-crew-strategy")?.value);
        const difficulty = normalizeDifficulty(target.value);

        await setAutoplayConfig(playerId, { enabled, strategy, difficulty });
      });
    });

    this.element.querySelectorAll(".btn-ai-crew-remove").forEach((button) => {
      button.addEventListener("click", async (event) => {
        const playerId = event.currentTarget?.dataset?.playerId;
        if (!playerId) return;
        if (!game.user.isGM) return;
        if (!tavernSocket) return;

        await tavernSocket.executeAsGM("removeAiSeat", playerId);
        this._refreshMainApp();
      });
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!game.user.isGM) return;

    this._bindNpcSearch();
    this._bindGlobalActions();
    this._bindSeatActions();
  }
}
