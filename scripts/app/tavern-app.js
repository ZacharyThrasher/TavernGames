import { MODULE_ID, getState } from "../state.js";
import { tavernSocket } from "../socket.js";

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
      reveal: TavernApp.onReveal,
      newRound: TavernApp.onNewRound,
      reset: TavernApp.onReset,
    },
    classes: ["tavern-dice-master"],
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/tavern-app.hbs`,
    },
  };

  // Dice display helper
  static DICE_ICONS = {
    4: "d4",
    6: "d6", 
    8: "d8",
    10: "d10",
    12: "d12",
    20: "d20",
  };

  async _prepareContext() {
    const state = getState();
    const userId = game.user.id;
    const isGM = game.user.isGM;
    const players = Object.values(state.players ?? {});
    const tableData = state.tableData ?? {};
    const ante = game.settings.get(MODULE_ID, "fixedAnte");

    // Build rich player data for display
    const playerSeats = players.map((player) => {
      const rolls = tableData.rolls?.[player.id] ?? [];
      const total = tableData.totals?.[player.id] ?? 0;
      const isHolding = tableData.holds?.[player.id] ?? false;
      const isBusted = tableData.busts?.[player.id] ?? false;
      const isCurrent = tableData.currentPlayer === player.id;
      const isMe = player.id === userId;

      // Determine status
      let status = "waiting";
      let statusLabel = "Waiting";
      if (state.status === "PLAYING") {
        if (isBusted) {
          status = "busted";
          statusLabel = "BUST!";
        } else if (isHolding) {
          status = "holding";
          statusLabel = "Holding";
        } else if (isCurrent) {
          status = "active";
          statusLabel = "Rolling...";
        } else if (rolls.length > 0) {
          status = "rolled";
          statusLabel = "Rolled";
        }
      } else if (state.status === "REVEALING" || state.status === "PAYOUT") {
        if (isBusted) {
          status = "busted";
          statusLabel = `BUST (${total})`;
        } else {
          status = "revealed";
          statusLabel = `Total: ${total}`;
        }
      }

      // Show dice only to the player who owns them (or GM), or during reveal
      const showDice = isMe || isGM || state.status === "REVEALING" || state.status === "PAYOUT";
      const diceDisplay = showDice ? rolls.map(r => ({
        die: r.die,
        result: r.result,
        icon: TavernApp.DICE_ICONS[r.die] || "d6",
      })) : rolls.map(() => ({ hidden: true }));

      return {
        ...player,
        rolls,
        diceDisplay,
        total,
        displayTotal: showDice ? total : "?",
        isHolding,
        isBusted,
        isCurrent,
        isMe,
        status,
        statusLabel,
        canAct: isCurrent && isMe && state.status === "PLAYING" && !isHolding && !isBusted,
      };
    });

    // Determine current player info
    const currentPlayer = players.find(p => p.id === tableData.currentPlayer);
    const myTurn = tableData.currentPlayer === userId;
    
    // Check if player can hold (must have rolled at least 2 dice)
    const myRolls = tableData.rolls?.[userId] ?? [];
    const canHold = myTurn && myRolls.length >= 2;
    const rollsRemaining = Math.max(0, 2 - myRolls.length);

    // Build history entries with formatting
    const history = (state.history ?? []).slice().reverse().map(entry => ({
      ...entry,
      timeAgo: this._formatTimeAgo(entry.timestamp),
      icon: this._getHistoryIcon(entry.type),
    }));

    return {
      moduleId: MODULE_ID,
      state,
      players: playerSeats,
      isGM,
      userId,
      ante,
      pot: state.pot,
      status: state.status,
      isLobby: state.status === "LOBBY",
      isPlaying: state.status === "PLAYING",
      isRevealing: state.status === "REVEALING",
      isPayout: state.status === "PAYOUT",
      canJoin: !state.players?.[userId] && (state.status === "LOBBY" || state.status === "PAYOUT"),
      isInGame: Boolean(state.players?.[userId]),
      hasGM: Boolean(game.users.activeGM),
      hasPlayers: players.length > 0,
      currentPlayer,
      myTurn,
      canHold,
      rollsRemaining,
      history,
      dice: [
        { value: 4, label: "d4", risk: "Safe", color: "green" },
        { value: 6, label: "d6", risk: "Safe", color: "green" },
        { value: 8, label: "d8", risk: "Low", color: "yellow" },
        { value: 10, label: "d10", risk: "Medium", color: "orange" },
        { value: 12, label: "d12", risk: "High", color: "red" },
        { value: 20, label: "d20", risk: "Risky!", color: "crimson" },
      ],
    };
  }

  _formatTimeAgo(timestamp) {
    if (!timestamp) return "";
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  _getHistoryIcon(type) {
    switch (type) {
      case "round_start": return "fa-solid fa-play";
      case "roll": return "fa-solid fa-dice";
      case "hold": return "fa-solid fa-hand";
      case "bust": return "fa-solid fa-skull";
      case "round_end": return "fa-solid fa-flag-checkered";
      default: return "fa-solid fa-circle";
    }
  }

  static async onJoin() {
    if (!game.users.activeGM) {
      return ui.notifications.warn("A GM must be connected to play.");
    }
    await tavernSocket.executeAsGM("joinTable", game.user.id);
  }

  static async onLeave() {
    await tavernSocket.executeAsGM("leaveTable", game.user.id);
  }

  static async onStart() {
    await tavernSocket.executeAsGM("startRound");
  }

  static async onRoll(event, target) {
    const die = target?.dataset?.die;
    console.log("Tavern Twenty-One | Roll clicked, die:", die, "target:", target);
    if (!die) {
      console.warn("Tavern Twenty-One | No die value found on target");
      return;
    }
    await tavernSocket.executeAsGM("playerAction", "roll", { die }, game.user.id);
  }

  static async onHold() {
    await tavernSocket.executeAsGM("playerAction", "hold", {}, game.user.id);
  }

  static async onReveal() {
    await tavernSocket.executeAsGM("playerAction", "reveal", {}, game.user.id);
  }

  static async onNewRound() {
    await tavernSocket.executeAsGM("playerAction", "newRound", {}, game.user.id);
  }

  static async onReset() {
    const confirm = await Dialog.confirm({
      title: "Reset Table",
      content: "<p>Clear all players and reset the table?</p>",
    });
    if (confirm) {
      await tavernSocket.executeAsGM("resetTable");
    }
  }
}
