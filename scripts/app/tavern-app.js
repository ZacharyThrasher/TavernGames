import { MODULE_ID } from "../twenty-one/constants.js";
import {
  buildDiceArray,
  computeGoblinTotal,
  formatCostLabel,
  formatTimeAgo,
  getHistoryIcon,
  prepareTavernContext
} from "./tavern-context.js";
import { renderTavernApp } from "./tavern-render.js";
import {
  onAccuse,
  onBoot,
  onBumpRetaliation,
  onBumpTable,
  onCheat,
  onDuelRoll,
  onFold,
  onGoad,
  onHelp,
  onHold,
  onHunch,
  onJoin,
  onLeave,
  onNewRound,
  onProfile,
  onReset,
  onReveal,
  onRoll,
  onSideBet,
  onSkipInspection,
  onStart,
  onToggleLiquidMode,
  onToggleLogs,
  onUseCut,
  renderAppIfPresent,
  withUiLock
} from "./tavern-client-actions.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TavernApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tavern-dice-master",
    tag: "div",
    window: {
      title: "Tavern Twenty-One",
      icon: "fa-solid fa-dice-d20",
      resizable: true,
      minimizable: true,
    },
    position: {
      width: 800,
      height: 700,
    },
    actions: {
      join: TavernApp.onJoin,
      leave: TavernApp.onLeave,
      start: TavernApp.onStart,
      roll: TavernApp.onRoll,
      hold: TavernApp.onHold,
      fold: TavernApp.onFold,
      boot: TavernApp.onBoot,
      useCut: TavernApp.onUseCut,
      hunch: TavernApp.onHunch,
      profile: TavernApp.onProfile,
      cheat: TavernApp.onCheat,
      accuse: TavernApp.onAccuse,
      goad: TavernApp.onGoad,
      bumpTable: TavernApp.onBumpTable,
      bumpRetaliation: TavernApp.onBumpRetaliation,
      sideBet: TavernApp.onSideBet,
      duelRoll: TavernApp.onDuelRoll,
      skipInspection: TavernApp.onSkipInspection,
      reveal: TavernApp.onReveal,
      newRound: TavernApp.onNewRound,
      reset: TavernApp.onReset,
      toggleLiquidMode: TavernApp.onToggleLiquidMode,
      help: TavernApp.onHelp,
      toggleLogs: TavernApp.onToggleLogs,
    },
    classes: ["tavern-dice-master"],
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/tavern-app.hbs`,
    },
  };

  static DICE_ICONS = {
    2: "circle-dollar",
    4: "d4",
    6: "d6",
    8: "d8",
    10: "d10",
    12: "d12",
    20: "d20",
  };

  static uiLocked = false;

  async _prepareContext() {
    return prepareTavernContext(this, TavernApp);
  }

  _computeGoblinTotal(rolls, includeBlind = true) {
    return computeGoblinTotal(rolls, includeBlind);
  }

  _buildDiceArray(options) {
    return buildDiceArray(options);
  }

  _formatCostLabel(cost, ante, isBettingPhase) {
    void ante;
    return formatCostLabel(cost, isBettingPhase);
  }

  _formatTimeAgo(timestamp) {
    return formatTimeAgo(timestamp);
  }

  _getHistoryIcon(type) {
    return getHistoryIcon(type);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    renderTavernApp(this, context);
  }

  static _renderAppIfPresent() {
    renderAppIfPresent();
  }

  static async _withUiLock(action) {
    return withUiLock(TavernApp, action);
  }

  static onToggleLogs() { return onToggleLogs(); }
  static async onJoin() { return onJoin(); }
  static async onLeave() { return onLeave(); }
  static async onStart() { return onStart(); }
  static async onRoll(event, target) { return onRoll(TavernApp, event, target); }
  static async onToggleLiquidMode() { return onToggleLiquidMode(); }
  static async onHold() { return onHold(TavernApp); }
  static async onBoot() { return onBoot(TavernApp); }
  static async onHelp() { return onHelp(); }
  static async onFold() { return onFold(TavernApp); }
  static async onUseCut(event, target) { return onUseCut(TavernApp, event, target); }
  static async onHunch() { return onHunch(TavernApp); }
  static async onProfile() { return onProfile(TavernApp); }
  static async onCheat() { return onCheat(TavernApp); }
  static async onAccuse() { return onAccuse(TavernApp); }
  static async onGoad() { return onGoad(TavernApp); }
  static async onBumpTable() { return onBumpTable(TavernApp); }
  static async onBumpRetaliation(event, target) { return onBumpRetaliation(TavernApp, event, target); }
  static async onSkipInspection() { return onSkipInspection(TavernApp); }
  static async onReveal() { return onReveal(TavernApp); }
  static async onNewRound() { return onNewRound(TavernApp); }
  static async onReset() { return onReset(TavernApp); }
  static async onDuelRoll() { return onDuelRoll(TavernApp); }
  static async onSideBet() { return onSideBet(TavernApp); }
}
