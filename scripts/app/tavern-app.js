import { MODULE_ID, TAVERN_GAMES, getState } from "../state.js";
import { tavernSocket } from "../socket.js";

export class TavernApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tavern-dice-master",
    tag: "div",
    window: {
      title: "Tavern Dice Master",
      resizable: true,
      minimizable: true,
      width: 720,
      height: 620,
    },
    actions: {
      open: TavernApp.onOpen,
      join: TavernApp.onJoin,
      leave: TavernApp.onLeave,
      setGame: TavernApp.onSetGame,
      start: TavernApp.onStart,
      roll: TavernApp.onRoll,
      hold: TavernApp.onHold,
      bid: TavernApp.onBid,
      call: TavernApp.onCall,
      resolve: TavernApp.onResolve,
    },
    classes: ["tavern-dice-master"],
  };

  static PARTS = {
    lobby: {
      template: "templates/parts/lobby.hbs",
    },
    game: {
      template: "templates/parts/game.hbs",
    },
    status: {
      template: "templates/parts/status.hbs",
    },
  };

  async _prepareContext() {
    const state = getState();
    const userId = game.user.id;
    const players = Object.values(state.players ?? {});
    const isGM = game.user.isGM;

    return {
      moduleId: MODULE_ID,
      state,
      players,
      isGM,
      userId,
      games: [
        {
          id: TAVERN_GAMES.LIARS_DICE,
          name: "Liar's Dice",
          active: state.activeGame === TAVERN_GAMES.LIARS_DICE,
        },
        {
          id: TAVERN_GAMES.TWENTY_ONE,
          name: "Twenty-One",
          active: state.activeGame === TAVERN_GAMES.TWENTY_ONE,
        },
      ],
      bidQuantities: [1, 2, 3, 4, 5],
      bidFaces: [2, 3, 4, 5, 6],
      canJoin: !state.players?.[userId],
      isInGame: Boolean(state.players?.[userId]),
      hasGM: Boolean(game.users.activeGM),
      ante: game.settings.get(MODULE_ID, "fixedAnte"),
      twentyOne: state.activeGame === TAVERN_GAMES.TWENTY_ONE,
      liarsDice: state.activeGame === TAVERN_GAMES.LIARS_DICE,
    };
  }

  static async onOpen() {
    game.tavernDiceMaster?.open();
  }

  static async onJoin() {
    if (!game.users.activeGM) {
      return ui.notifications.warn("A GM must be connected.");
    }
    await tavernSocket.executeAsGM("joinTable", game.user.id);
  }

  static async onLeave() {
    await tavernSocket.executeAsGM("leaveTable", game.user.id);
  }

  static async onSetGame(event) {
    const id = event.currentTarget?.dataset?.game;
    if (!id) return;
    await tavernSocket.executeAsGM("setGame", id);
  }

  static async onStart() {
    await tavernSocket.executeAsGM("startRound");
  }

  static async onRoll(event) {
    const die = event.currentTarget?.dataset?.die;
    if (!die) return;
    await tavernSocket.executeAsGM("playerAction", "roll", { die }, game.user.id);
  }

  static async onHold() {
    await tavernSocket.executeAsGM("playerAction", "hold", {}, game.user.id);
  }

  static async onResolve() {
    await tavernSocket.executeAsGM("playerAction", "resolve", {}, game.user.id);
  }

  static async onBid(event) {
    const quantity = Number(event.currentTarget?.dataset?.quantity ?? 0);
    const face = Number(event.currentTarget?.dataset?.face ?? 0);
    await tavernSocket.executeAsGM("playerAction", "bid", { quantity, face }, game.user.id);
  }

  static async onCall() {
    await tavernSocket.executeAsGM("playerAction", "call", {}, game.user.id);
  }
}
