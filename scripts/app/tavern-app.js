import { MODULE_ID, getState, updateState } from "../state.js";
import { tavernSocket } from "../socket.js";
import { getDieCost } from "../twenty-one/constants.js";
import { getNpcWallet } from "../wallet.js"; // V4: Import NPC wallet helper
import {
  getValidProfileTargets,
  getValidGoadTargets,
  getValidBumpTargets,
  getValidAccuseTargets,
  isActingAsHouse,
  getAccusationCost,
  getInspectionCost
} from "../twenty-one/utils/game-logic.js";

// Import Dialog Classes
import { CheatDialog } from "./dialogs/cheat-dialog.js";
import { ProfileDialog } from "./dialogs/profile-dialog.js";
import { GoadDialog } from "./dialogs/goad-dialog.js";
import { BumpDialog } from "./dialogs/bump-dialog.js";
import { AccuseDialog } from "./dialogs/accuse-dialog.js";
import { SideBetDialog } from "./dialogs/side-bet-dialog.js";
import { PaymentDialog } from "./dialogs/payment-dialog.js";
import { HelpDialog } from "./dialogs/help-dialog.js";

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
      toggleLogs: TavernApp.onToggleLogs, // V5.11.5
    },
    classes: ["tavern-dice-master"],
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/tavern-app.hbs`,
    },
  };

  // ... (Dice Icons preserved via simple re-declaration if needed, or just skipping lines)

  static DICE_ICONS = {
    2: "circle-dollar",
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
    const isInGame = Boolean(state.players?.[userId]);
    const isGM = game.user.isGM;

    // Check NPC/House status
    const playerData = state.players?.[userId];
    const isPlayingAsNpc = isGM && playerData?.playingAsNpc;
    const isHouse = isActingAsHouse(userId, state);

    const players = Object.values(state.players ?? {});
    const tableData = state.tableData ?? {};
    const gameMode = tableData.gameMode ?? "standard";
    const isGoblinMode = gameMode === "goblin";
    const ante = game.settings.get(MODULE_ID, "fixedAnte");
    const liquidModeSetting = game.settings.get(MODULE_ID, "liquidMode");
    const isSloppy = tableData.sloppy?.[userId] ?? false;
    const liquidMode = liquidModeSetting && !isSloppy;

    // Build rich player data for display
    const playerSeats = players.map((player) => {
      const rolls = tableData.rolls?.[player.id] ?? [];
      const total = tableData.totals?.[player.id] ?? 0;
      const isHolding = tableData.holds?.[player.id] ?? false;
      const isBusted = tableData.busts?.[player.id] ?? false;
      const isCaught = tableData.caught?.[player.id] ?? false;
      const isCurrent = tableData.currentPlayer === player.id;
      const isMe = player.id === userId;
      const isSideBetWinner = tableData.sideBetWinners?.[player.id] ?? false;
      // V3.5: Check for folded status
      const isFolded = tableData.folded?.[player.id] ?? false;

      // Determine status
      let status = "waiting";
      let statusLabel = "Waiting";
      if (state.status === "PLAYING") {
        if (isBusted) {
          status = "busted";
          statusLabel = "BUST!";
        } else if (isFolded) {
          status = "folded";
          statusLabel = "Folded";
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
      } else if (state.status === "INSPECTION") {
        if (isBusted) {
          status = "busted";
          statusLabel = "BUST!";
        } else if (isCaught) {
          status = "caught";
          statusLabel = "CAUGHT!";
        } else if (isFolded) {
          status = "folded";
          statusLabel = "Folded";
        } else if (isHolding) {
          status = "holding";
          statusLabel = "Holding";
        } else {
          status = "waiting";
          statusLabel = "Waiting";
        }
      } else if (state.status === "REVEALING" || state.status === "PAYOUT") {
        if (isCaught) {
          status = "caught";
          statusLabel = `CHEATER! (${total})`;
        } else if (isFolded) {
          status = "folded";
          statusLabel = "Folded";
        } else if (isBusted) {
          status = "busted";
          statusLabel = `BUST (${total})`;
        } else {
          status = "revealed";
          statusLabel = `Total: ${total}`;
        }
      }

      // Dice Visibility Logic
      const isRevealPhase = state.status === "REVEALING" || state.status === "PAYOUT" || state.status === "INSPECTION";
      const diceDisplay = rolls.map((r, idx) => {
        const isPublicDie = r.public ?? false;
        const isBlindDie = r.blind ?? false;
        const canSeeThisDie = isMe || isRevealPhase || isPublicDie;
        const isOmen = isMe && !isBlindDie && (r.result === 1);

        if (isBlindDie && !isRevealPhase) {
          return {
            die: r.die,
            result: "?",
            icon: TavernApp.DICE_ICONS[r.die] || "d6",
            index: idx,
            isPublic: isPublicDie,
            isHole: !isPublicDie,
            isBlind: true,
            isOmen: false,
          };
        }

        if (canSeeThisDie) {
          return {
            die: r.die,
            result: r.result,
            icon: TavernApp.DICE_ICONS[r.die] || "d6",
            index: idx,
            isPublic: isPublicDie,
            isHole: !isPublicDie,
            isOmen,
          };
        } else {
          return { hidden: true, isHole: true, isOmen: false };
        }
      });

      const visibleTotal = tableData.visibleTotals?.[player.id] ?? 0;
      const showFullTotal = isMe || isRevealPhase;

      // V4: For my view, hide blind dice values from the total until reveal
      let displayTotal = "?";
      if (showFullTotal) {
        if (isMe && !isRevealPhase) {
          // Sum only non-blind dice
          let nonBlindTotal = 0;
          let hasBlind = false;

          if (isGoblinMode) {
            ({ total: nonBlindTotal, hasBlind } = this._computeGoblinTotal(rolls, false));
          } else {
            nonBlindTotal = rolls
              .filter(r => !r.blind)
              .reduce((acc, r) => acc + (r.result || 0), 0);
            hasBlind = rolls.some(r => r.blind);
          }

          displayTotal = hasBlind ? `${nonBlindTotal}+?` : `${nonBlindTotal}`;
        } else {
          displayTotal = `${total}`;
        }
      } else {
        displayTotal = visibleTotal > 0 ? `${visibleTotal}+?` : "?";
      }

      return {
        ...player,
        rolls,
        diceDisplay,
        total,
        visibleTotal,
        displayTotal,
        isHolding,
        isBusted,
        isCaught,
        isCurrent,
        isMe,
        status,
        statusLabel,
        canAct: isCurrent && isMe && state.status === "PLAYING" && !isHolding && !isBusted && !tableData.pendingAction,
        // Status Badges (V5.3.0)
        isDared: tableData.dared?.[player.id] ?? false,
        isBumpLocked: tableData.pendingBumpRetaliation?.attackerId === player.id,
        isProfiled: (tableData.profiledBy?.[player.id] ?? []).length > 0,
        isSideBetWinner,
        // For cheating: can cheat if it's playing, you're in the game, have at least 1 die, and haven't busted
      };
    });

    // Current Player & Turn
    const currentPlayer = players.find(p => p.id === tableData.currentPlayer);
    const myTurn = tableData.currentPlayer === userId;

    // Phase Tracking
    const phase = tableData.phase ?? "opening";
    const isOpeningPhase = phase === "opening";
    const isBettingPhase = phase === "betting";
    const isCutPhase = phase === "cut";

    // The Cut
    const theCutPlayer = tableData.theCutPlayer;
    const isTheCutPlayer = theCutPlayer === userId;
    const theCutPlayerName = theCutPlayer
      ? (game.users.get(theCutPlayer)?.character?.name ?? game.users.get(theCutPlayer)?.name ?? "Unknown")
      : null;

    // Action Constraints
    const myRolls = tableData.rolls?.[userId] ?? [];
    const isFolded = tableData.folded?.[userId] ?? false;
    const hasActed = tableData.hasActed?.[userId] ?? false;
    const canHold = myTurn && isBettingPhase && !isCutPhase && !tableData.hunchLocked?.[userId];
    const openingRollsRemaining = Math.max(0, 2 - myRolls.length);
    const myTotal = tableData.totals?.[userId] ?? 0;
    let riskLevel = null;
    if (myTurn && isBettingPhase) {
      if (myTotal >= 20) riskLevel = "critical";
      else if (myTotal >= 18) riskLevel = "hot";
      else if (myTotal >= 16) riskLevel = "warm";
    }

    // Hunch
    const hunchLocked = tableData.hunchLocked?.[userId] ?? false;
    const hunchLockedDie = tableData.hunchLockedDie?.[userId] ?? null;

    // Goad context updated (remove resist)
    const hasGoadedThisRound = tableData.goadedThisRound?.[userId] ?? tableData.usedSkills?.[userId]?.goad ?? false;
    const canGoad = !isGoblinMode && isBettingPhase && !isCutPhase && myTurn && isInGame && !(tableData.busts?.[userId]) && !isFolded && !isHouse && !hasGoadedThisRound && !tableData.skillUsedThisTurn;
    const goadTargets = canGoad ? getValidGoadTargets(state, userId) : [];

    // Cheating Context
    const canCheat = !isGoblinMode && state.status === "PLAYING" && state.players?.[userId] && myRolls.length > 0 && !tableData.busts?.[userId] && !isHouse;
    const myDiceForCheat = canCheat ? myRolls.map((r, idx) => ({
      index: idx,
      die: r.die,
      result: r.result,
      maxValue: r.die,
    })) : [];

    // Inspection Context
    const isInspection = state.status === "INSPECTION";
    const accusedThisRound = tableData.accusedThisRound?.[userId] ?? false;
    const accusationCost = getAccusationCost(ante);
    const isBusted = tableData.busts?.[userId] ?? false;

    // Centralized Targeting Logic
    const accuseTargets = !accusedThisRound ? getValidAccuseTargets(state, userId, accusedThisRound) : [];

    // V4.8.20: Improved Accuse visibility - show during all active phases if you have targets
    const isRoundPhase = ["PLAYING", "INSPECTION", "REVEALING", "DUEL"].includes(state.status);
    const canAccuse = !isGoblinMode && isInGame && !accusedThisRound && !isBusted && accuseTargets.length > 0 && isRoundPhase && !isHouse;

    // Hunch Context
    const isHolding = tableData.holds?.[userId] ?? false;
    const hasHunched = tableData.usedSkills?.[userId]?.hunch ?? false;
    const canHunch = !isGoblinMode && isBettingPhase && !isCutPhase && myTurn && isInGame && !isBusted && !isFolded && !isHolding && !isHouse && !hunchLocked && !tableData.skillUsedThisTurn && !hasHunched;

    // Profile Context
    const hasProfiled = tableData.usedSkills?.[userId]?.profile ?? false;
    const profileTargets = (!isGoblinMode && isBettingPhase && !isCutPhase && myTurn && !isBusted && !isFolded && !isHouse && !tableData.skillUsedThisTurn && !hasProfiled)
      ? getValidProfileTargets(state, userId) : [];
    const canProfile = profileTargets.length > 0;

    // Bump Context
    const hasBumpedThisRound = tableData.bumpedThisRound?.[userId] ?? tableData.usedSkills?.[userId]?.bump ?? false;
    const canBump = !isGoblinMode && isBettingPhase && !isCutPhase && myTurn && isInGame && !isBusted && !isHolding && !isHouse && !hasBumpedThisRound && !tableData.skillUsedThisTurn;
    const bumpTargets = canBump ? getValidBumpTargets(state, userId) : [];

    // Retaliation Context
    const pendingRetaliation = tableData.pendingBumpRetaliation;
    const isRetaliationTarget = pendingRetaliation?.targetId === userId;
    const canRetaliate = isRetaliationTarget || (isGM && pendingRetaliation);
    const retaliationAttackerName = pendingRetaliation
      ? (state.players?.[pendingRetaliation.attackerId]?.name ?? "Unknown")
      : null;

    const retaliationAttackerDice = pendingRetaliation
      ? (tableData.rolls?.[pendingRetaliation.attackerId] ?? []).map((r, idx) => {
        const isPublic = r.public ?? true;
        const isBlind = r.blind ?? false;
        const showValue = isPublic && !isBlind;
        return {
          index: idx,
          die: r.die,
          result: showValue ? r.result : "?",
          isHole: !isPublic || isBlind
        };
      })
      : [];

    // Bump Lock Context
    const isBumpLocked = tableData.pendingBumpRetaliation?.attackerId === userId;
    const retaliationTargetName = tableData.pendingBumpRetaliation
      ? (state.players?.[tableData.pendingBumpRetaliation.targetId]?.name ?? "Unknown")
      : null;

    // History
    const history = (state.history ?? []).slice().reverse().map(entry => {
      const chipMap = {
        roll: { label: "ROLL", class: "roll" },
        hold: { label: "HOLD", class: "hold" },
        fold: { label: "FOLD", class: "fold" },
        bust: { label: "BUST", class: "bust" },
        round_start: { label: "START", class: "start" },
        round_end: { label: "END", class: "end" },
        duel_start: { label: "DUEL", class: "duel" },
        side_bet: { label: "BET", class: "bet" },
        cheat_caught: { label: "CAUGHT", class: "caught" },
      };
      const chip = chipMap[entry.type] ?? null;
      return {
        ...entry,
        timeAgo: this._formatTimeAgo(entry.timestamp),
        icon: this._getHistoryIcon(entry.type),
        chipLabel: chip?.label ?? null,
        chipClass: chip?.class ?? null,
      };
    });

    // V5.8: Private Logs Context
    // Only show MY logs. GM cannot see others logs here.
    const myPrivateLogs = (state.privateLogs?.[userId] ?? []).slice().reverse().map(entry => ({
      ...entry,
      timeAgo: this._formatTimeAgo(entry.timestamp)
    }));

    // V5.13: Unread Logs
    const logWindow = game.tavernDiceMaster?.logsWindow;
    const isLogsOpen = logWindow && logWindow.rendered;
    const unreadCount = (state.privateLogs?.[userId] ?? []).filter(l => !l.seen).length;
    const hasUnreadLogs = unreadCount > 0 && !isLogsOpen;

    // Trigger read state if window is open and there are unread logs
    // Use a timeout to avoid render-cycle loops
    if (isLogsOpen && unreadCount > 0) {
      setTimeout(() => {
        if (game.user.isGM) {
          import("../state.js").then(({ markLogsAsSeen }) => {
            markLogsAsSeen(userId);
          });
        } else {
          tavernSocket.executeAsGM("markLogsAsSeen", userId);
        }
      }, 500);
    }

    return {
      moduleId: MODULE_ID,
      state,
      isPlayingAsNpc,
      // ... existing props ...
      npcWallet: isPlayingAsNpc ? getNpcWallet(userId) : 0,
      players: playerSeats,
      isGM,
      userId,
      ante,
      liquidMode,
      isSloppy,
      pot: state.pot,
      accusationCost,
      status: state.status,
      isLobby: state.status === "LOBBY",
      isPlaying: state.status === "PLAYING",
      isInspection,
      isRevealing: state.status === "REVEALING",
      isPayout: state.status === "PAYOUT",
      canJoin: !state.players?.[userId] && (state.status === "LOBBY" || state.status === "PAYOUT"),
      isInGame: Boolean(state.players?.[userId]),
      hasGM: Boolean(game.users.activeGM),
      hasPlayers: players.length > 0,
      currentPlayer,
      myTurn,
      canHold,
      canCheat,
      myDiceForCheat,
      canAccuse,
      accuseTargets,
      canGoad,
      goadTargets,
      canBump,
      bumpTargets,
      canRetaliate,
      isRetaliationTarget,
      retaliationAttackerName,
      retaliationAttackerDice,
      isBumpLocked,
      retaliationTargetName,
      isOpeningPhase,
      isBettingPhase,
      openingRollsRemaining,
      riskLevel,
      history,
      privateLogs: myPrivateLogs, // V5.8
      unreadLogsCount: unreadCount, // V5.13
      hasUnreadLogs, // V5.13 (Computed with window state)
      isDuel: state.status === "DUEL",
      duel: tableData.duel ?? null,
      isMyDuel: (tableData.duel?.pendingRolls ?? []).includes(userId),
      duelParticipants: (tableData.duel?.participants ?? []).map(id => ({
        id,
        name: game.users.get(id)?.character?.name ?? game.users.get(id)?.name ?? "Unknown",
        hasRolled: !!tableData.duel?.rolls?.[id],
        roll: tableData.duel?.rolls?.[id]?.total ?? null,
      })),
      isCutPhase,
      isTheCutPlayer,
      theCutPlayerName,
      isFolded,
      hasActed,
      lastSkillUsed: tableData.lastSkillUsed ?? null,
      canHunch,
      hunchLocked,
      hunchLockedDie,
      canProfile,
      profileTargets,
      isDared: tableData.dared?.[userId] ?? false,
      startingHeat: tableData.houseRules?.startingHeat ?? 10,
      uiLocked: TavernApp.uiLocked, // V4.8.56: UI Lock State
      gameMode, // V5.14.1: Game Mode for UI
      isGoblinMode, // V5.14.0
      // Pass usedDice for Goblin Mode
      dice: this._buildDiceArray(
        ante,
        isBettingPhase || isCutPhase,
        tableData.dared?.[userId] ?? false,
        state.tableData?.gameMode === "goblin",
        tableData.usedDice?.[userId] ?? [],
        tableData.hunchPrediction?.[userId] ?? null,
        tableData.hunchExact?.[userId] ?? null,
        liquidMode
      )
    };
  }

  // V4.8.56: UI Lock State
  static uiLocked = false;

  _computeGoblinTotal(rolls, includeBlind = true) {
    let total = 0;
    let hasBlind = false;
    for (const roll of rolls) {
      if (roll.blind && !includeBlind) {
        hasBlind = true;
        continue;
      }
      if (roll.die === 2) {
        if (roll.result === 2) {
          total *= 2;
        } else if (roll.result === 1) {
          total = 1;
        }
      } else {
        total += roll.result || 0;
      }
    }
    return { total, hasBlind };
  }

  _buildDiceArray(
    ante,
    isBettingPhase,
    isDared,
    isGoblinMode = false,
    usedDice = [],
    hunchPrediction = null,
    hunchExact = null,
    liquidMode = false
  ) {
    const diceConfig = [
      { value: 20, label: "d20", icon: "d20-grey", strategy: "Hail Mary" },
      { value: 10, label: "d10", icon: "d10-grey", strategy: "Builder" },
      { value: 8, label: "d8", icon: "d8-grey", strategy: "Standard" },
      { value: 6, label: "d6", icon: "d6-grey", strategy: "Standard" },
      { value: 4, label: "d4", icon: "d4-grey", strategy: "Precision" },
    ];

    if (isGoblinMode) {
      // Add Coin
      diceConfig.push({ value: 2, label: "Coin", icon: "circle-dollar", strategy: "Double or Nothing" });
    }

    return diceConfig.map(d => {
      let cost = getDieCost(d.value, ante);
      let costLabel = this._formatCostLabel(cost, ante, isBettingPhase);
      let disabled = false;

      // Goblin Mode Logic
      if (isGoblinMode) {
        cost = 0;
        costLabel = "FREE";

        if (d.value !== 2 && usedDice.includes(d.value)) {
          disabled = true;
        }
      } else {
        // Dared Mechanic (Standard Mode)
        if (isDared && d.value === 8) {
          cost = 0;
          costLabel = "FREE";
        }
        // Liquid Mode: all dice are free on the tab
        if (liquidMode) {
          cost = 0;
          costLabel = "FREE";
        }
      }

      const prediction = hunchPrediction?.[d.value];
      const exactValue = hunchExact?.[d.value];
      const hunchDirection = prediction === "HIGH" ? "up" : (prediction === "LOW" ? "down" : null);

      const isUsed = isGoblinMode && d.value !== 2 && usedDice.includes(d.value);
      return {
        ...d,
        cost,
        costLabel,
        disabled,
        isUsed,
        isCoin: d.value === 2, // Flag for template icon
        hunchDirection,
        hunchExactValue: Number.isFinite(exactValue) ? exactValue : null
      };
    });
  }

  _formatCostLabel(cost, ante, isBettingPhase) {
    if (!isBettingPhase) return "";
    if (cost === 0) return "FREE";
    return `${cost}gp`;
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
      case "accusation": return "fa-solid fa-hand-point-right";
      case "cheat_caught": return "fa-solid fa-gavel";
      case "accusation_failed": return "fa-solid fa-face-frown";
      case "goad": return "fa-solid fa-comments";
      default: return "fa-solid fa-circle";
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);

    if (this._diceHoverHandlers) {
      this.element.removeEventListener("pointerover", this._diceHoverHandlers.over, true);
      this.element.removeEventListener("pointerout", this._diceHoverHandlers.out, true);
    }

    this._diceHoverHandlers = {
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

    this.element.addEventListener("pointerover", this._diceHoverHandlers.over, true);
    this.element.addEventListener("pointerout", this._diceHoverHandlers.out, true);

    // Handle ante input changes (GM only)
    const anteInput = this.element.querySelector('#ante-input');
    if (anteInput) {
      anteInput.addEventListener('change', async (e) => {
        const newAnte = parseInt(e.target.value);
        if (newAnte >= 1 && newAnte <= 1000) {
          await game.settings.set(MODULE_ID, "fixedAnte", newAnte);
          ui.notifications.info(`Ante set to ${newAnte}gp`);
        } else {
          e.target.value = game.settings.get(MODULE_ID, "fixedAnte");
          ui.notifications.warn("Ante must be between 1 and 1000 gp");
        }
      });
    }

    // Handle Game Mode Change (GM only) - V5.14.1
    const modeSelect = this.element.querySelector('#game-mode-select');
    if (modeSelect) {
      modeSelect.addEventListener('change', async (e) => {
        if (!game.user.isGM) {
          ui.notifications.warn("Only the GM can change game mode.");
          e.target.value = game.settings.get(MODULE_ID, "gameMode");
          return;
        }
        const newMode = e.target.value;
        const state = getState();
        const currentTable = state.tableData ?? {};

        // Update setting + state via helper to keep sources in sync
        const updatedTable = { ...currentTable, gameMode: newMode };
        await game.settings.set(MODULE_ID, "gameMode", newMode);
        await updateState({ tableData: updatedTable });

        ui.notifications.info(`Game Mode changed to ${newMode === "goblin" ? "Goblin Rules" : "Standard Twenty-One"}`);
      });
    }

    // Handle Starting Heat changes (GM only)
    const heatInput = this.element.querySelector('#starting-heat');
    if (heatInput) {
      heatInput.addEventListener('change', async (e) => {
        if (!game.user.isGM) {
          ui.notifications.warn("Only the GM can change starting heat.");
          const state = getState();
          e.target.value = state.tableData?.houseRules?.startingHeat ?? 10;
          return;
        }
        const newHeat = parseInt(e.target.value) || 10;
        if (newHeat >= 5 && newHeat <= 30) {
          // Direct State Update as GM
          const state = getState();
          const houseRules = state.tableData?.houseRules || {};
          houseRules.startingHeat = newHeat;

          await updateState({ tableData: { ...state.tableData, houseRules } });
          // ui.notifications.info(`Starting Heat set to DC ${newHeat}`);
        } else {
          ui.notifications.warn("Heat must be between 5 and 30");
        }
      });
    }

    // Accuse selection handling
    const accusePortraits = this.element.querySelectorAll('.accuse-portrait');
    const accuseBtn = this.element.querySelector('.btn-accuse');

    accusePortraits.forEach(p => {
      p.addEventListener('click', () => {
        accusePortraits.forEach(attr => attr.classList.remove('selected'));
        p.classList.add('selected');
        if (accuseBtn) accuseBtn.disabled = false;
      });
    });

    // V5.11.5: Resizer logic removed. Chat is now a separate window.
  }

  static onToggleLogs() {
    game.tavernDiceMaster?.toggleLogs();

    // V5.13: Mark as seen
    if (game.user.isGM) {
      import("../state.js").then(({ markLogsAsSeen }) => {
        markLogsAsSeen(game.user.id);
      });
    } else {
      tavernSocket.executeAsGM("markLogsAsSeen", game.user.id);
    }
  }

  static async onJoin() {
    if (!game.users.activeGM) {
      return ui.notifications.warn("A GM must be connected to play.");
    }
    if (game.user.isGM) {
      const choice = await TavernApp._showGMJoinDialog();
      if (!choice) return;
      if (choice.playAsNpc) {
        await tavernSocket.executeAsGM("joinTable", game.user.id, {
          playingAsNpc: true,
          npcActorId: choice.actorId,
          npcName: choice.actorName,
          npcImg: choice.actorImg,
        });
      } else {
        await tavernSocket.executeAsGM("joinTable", game.user.id, { playingAsNpc: false });
      }
    } else {
      await tavernSocket.executeAsGM("joinTable", game.user.id);
    }
  }

  static async _showGMJoinDialog() {
    const selectedToken = canvas.tokens?.controlled?.[0];
    const selectedActor = selectedToken?.actor;
    if (selectedActor && selectedActor.type === "npc") {
      const ante = game.settings.get(MODULE_ID, "fixedAnte");
      const defaultWallet = ante * 20;
      return new Promise((resolve) => {
        const dialog = new Dialog({
          title: "Join the Game",
          content: `
            <div class="tavern-gm-join-dialog">
              <p>How would you like to join?</p>
              <div class="selected-npc" style="display: flex; align-items: center; gap: 12px; margin: 12px 0; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
                <img src="${selectedActor.img || 'icons/svg/mystery-man.svg'}" alt="${selectedActor.name}" style="width: 64px; height: 64px; border-radius: 8px; object-fit: cover;">
                <div>
                  <strong style="font-size: 1.1em;">${selectedActor.name}</strong>
                  <div style="font-size: 0.9em; color: #888; margin-top: 4px;">NPC Gambler</div>
                </div>
              </div>
              <div class="npc-wallet-section" style="margin: 12px 0; padding: 12px; background: rgba(255, 215, 0, 0.1); border: 1px solid rgba(255, 215, 0, 0.3); border-radius: 8px;">
                <label style="display: block; margin-bottom: 8px; font-weight: bold;">
                  <i class="fa-solid fa-coins" style="color: gold;"></i> Starting Wallet
                </label>
                <input type="number" name="npcWallet" value="${defaultWallet}" min="1" step="${ante}" 
                  style="width: 100%; padding: 8px; font-size: 1.1em; text-align: center;">
                <div style="font-size: 0.85em; color: #888; margin-top: 4px; text-align: center;">
                  This is tracked by the module (not the actor sheet)
                </div>
              </div>
            </div>
          `,
          buttons: {
            house: {
              icon: '<i class="fa-solid fa-building-columns"></i>',
              label: "Play as House",
              callback: () => resolve({ playAsNpc: false }),
            },
            npc: {
              icon: '<i class="fa-solid fa-user-secret"></i>',
              label: `Play as ${selectedActor.name}`,
              callback: (html) => {
                const walletAmount = parseInt(html.find('[name="npcWallet"]').val()) || defaultWallet;
                resolve({
                  playAsNpc: true,
                  actorId: selectedActor.id,
                  actorName: selectedActor.name,
                  actorImg: selectedActor.img || "icons/svg/mystery-man.svg",
                  initialWallet: walletAmount,
                });
              },
            },
          },
          default: "npc",
          close: () => resolve(null),
        }, { width: 350, classes: ["tavern-gm-join"] });
        dialog.render(true);
      });
    }
    return new Promise((resolve) => {
      const dialog = new Dialog({
        title: "Join the Game",
        content: `
          <div class="tavern-gm-join-dialog">
            <p>How would you like to join?</p>
            <p class="hint"><em>Tip: Select an NPC token on the canvas first to play as that character.</em></p>
          </div>
        `,
        buttons: {
          house: {
            icon: '<i class="fa-solid fa-building-columns"></i>',
            label: "Play as House",
            callback: () => resolve({ playAsNpc: false }),
          },
        },
        default: "house",
        close: () => resolve(null),
      }, { width: 350, classes: ["tavern-gm-join"] });
      dialog.render(true);
    });
  }

  static async onLeave() {
    await tavernSocket.executeAsGM("leaveTable", game.user.id);
  }

  static async onStart() {
    // V5: Use configured Starting Heat
    const state = getState();
    const startingHeat = state.tableData?.houseRules?.startingHeat ?? 10;
    await tavernSocket.executeAsGM("startRound", startingHeat);
  }

  static async onRoll(event, target) {
    const die = target?.dataset?.die;
    if (!die) return;

    const state = getState();

    // V4: Bump Retaliation Lock (Client Side)
    if (state.tableData?.pendingBumpRetaliation?.attackerId === game.user.id) {
      ui.notifications.warn("You were caught bumping! Wait for retaliation.");
      return;
    }

    // V4: Dared Client-Side Validation
    if (state.tableData?.dared?.[game.user.id] && die !== "8") {
      ui.notifications.warn("You are Dared! You forced to roll a d8 (Free) or Fold.");
      return;
    }

    // V4.9: Hunch Lock Client-Side Validation
    if (state.tableData?.hunchLocked?.[game.user.id] && die !== "20") {
      ui.notifications.warn("Foresight locked you into rolling a d20!");
      return;
    }

    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();

    try {

      // Payment Logic (Iron Liver)
      const liquidModeSetting = game.settings.get(MODULE_ID, "liquidMode");
      // const state = getState(); // Reuse existing state variable from above
      const ante = game.settings.get(MODULE_ID, "fixedAnte");
      const isBettingPhase = state.tableData?.phase === "betting";
      const isGoblinMode = state.tableData?.gameMode === "goblin";
      const isSloppy = state.tableData?.sloppy?.[game.user.id] ?? false;
      const isHouse = isActingAsHouse(game.user.id, state);

      const isPlayingAsNpc = state.players?.[game.user.id]?.playingAsNpc;
      const isNpc = isPlayingAsNpc;

      const cost = (isBettingPhase && !isHouse && !isGoblinMode) ? getDieCost(parseInt(die), ante) : 0;
      let payWithDrink = false;

      if (liquidModeSetting && isSloppy) {
        await game.settings.set(MODULE_ID, "liquidMode", false);
      }

      if (liquidModeSetting && !isSloppy) {
        payWithDrink = true;
      } else {
        let currentGold = 0;
        if (isNpc) {
          currentGold = state.npcWallets?.[game.user.id] ?? 0;
        } else {
          currentGold = game.user.character?.system?.currency?.gp ?? 0;
        }

        if (cost > 0 && currentGold < cost) {
          if (isSloppy) {
            ui.notifications.warn("You're cut off and can't put it on the tab.");
            TavernApp.uiLocked = false;
            if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
            return;
          }
          // Should we allow NPC to put on tab? Maybe.
          const confirm = await Dialog.confirm({
            title: "Insufficient Gold",
            content: `<p>You don't have enough gold (${cost}gp).</p><p><strong>Put it on the Tab?</strong></p>`
          });
          if (!confirm) {
            TavernApp.uiLocked = false; // Early unlock if cancelled
            if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
            return;
          }
          payWithDrink = true;
        }
      }

      const updatedState = await tavernSocket.executeAsGM("playerAction", "roll", { die, payWithDrink }, game.user.id);

      if (updatedState.tableData?.gameMode === "goblin") {
        return;
      }

      // Quick Cheat Opportunity
      await new Promise(resolve => setTimeout(resolve, 1500)); // Animation delay

      const myRolls = updatedState.tableData?.rolls?.[game.user.id] ?? [];
      const lastDieIndex = myRolls.length - 1;
      const cheatPlayerData = updatedState.players?.[game.user.id];
      // Check using helper for house status (GM-as-NPC support)
      const cheatIsHouse = isActingAsHouse(game.user.id, updatedState);
      const lastDie = myRolls[lastDieIndex];
      // V5.8: Anti-Cheat Blindness - Cannot cheat if you can't see the die!
      const isBlind = lastDie?.blind ?? false;

      const canCheat = lastDieIndex >= 0 && !cheatIsHouse && !isBlind && updatedState.tableData?.gameMode !== "goblin";

    if (canCheat) {
      const heatDC = updatedState.tableData?.playerHeat?.[game.user.id]
        ?? updatedState.tableData?.heatDC
        ?? 10;

        try {
          const result = await CheatDialog.show({
            myRolls,
            actor: game.user.character,
            heatDC
          });

          if (result) {
            await tavernSocket.executeAsGM("playerAction", "cheat", result, game.user.id);
          } else if (updatedState.tableData?.phase === "betting") {
            await tavernSocket.executeAsGM("playerAction", "finishTurn", {}, game.user.id);
          }
        } catch (err) {
          console.error("Tavern | Cheat Dialog Failed:", err);
          // Ensure turn finishes if dialog crashes to prevent lock
          if (updatedState.tableData?.phase === "betting") {
            await tavernSocket.executeAsGM("playerAction", "finishTurn", {}, game.user.id);
          }
        }
    } else {
      if (updatedState.tableData?.phase === "betting") {
        await tavernSocket.executeAsGM("playerAction", "finishTurn", {}, game.user.id);
      }
    }
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onToggleLiquidMode() {
    const current = game.settings.get(MODULE_ID, "liquidMode");
    await game.settings.set(MODULE_ID, "liquidMode", !current);
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
  }

  static async onHold() {
    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    try {
      await tavernSocket.executeAsGM("playerAction", "hold", {}, game.user.id);
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onHelp() {
    new HelpDialog().render(true);
  }

  static async onFold() {
    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    try {
      await tavernSocket.executeAsGM("playerAction", "fold", {}, game.user.id);
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onUseCut(event, target) {
    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    try {
      const reroll = target?.dataset?.reroll === "true";
      await tavernSocket.executeAsGM("playerAction", "useCut", { reroll }, game.user.id);
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onHunch() {
    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    try {
      await tavernSocket.executeAsGM("playerAction", "hunch", {}, game.user.id);
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onProfile() {
    const state = getState();
    const userId = game.user.id;
    const targets = getValidProfileTargets(state, userId);

    if (targets.length === 0) return ui.notifications.warn("No valid targets to profile.");

    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();

    try {
      const result = await ProfileDialog.show({
        targets,
        actor: game.user.character,
        invMod: game.user.character?.system?.skills?.inv?.total ?? 0
      });

      if (result) {
        await tavernSocket.executeAsGM("playerAction", "profile", result, game.user.id);
      }
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onCheat() {
    const state = getState();
    const userId = game.user.id;
    const myRolls = state.tableData?.rolls?.[userId] ?? [];

    if (myRolls.length === 0) return ui.notifications.warn("You have no dice to cheat with!");

    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();

    try {
      const result = await CheatDialog.show({
        myRolls,
        actor: game.user.character,
        heatDC: state.tableData?.playerHeat?.[userId]
          ?? state.tableData?.heatDC
          ?? 10
      });

      if (result) {
        await tavernSocket.executeAsGM("playerAction", "cheat", result, game.user.id);
      }
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onAccuse() {
    const state = getState();
    const userId = game.user.id;
    const ante = game.settings.get(MODULE_ID, "fixedAnte");

    // Get target from UI selection
    const selectedPortrait = document.querySelector('.accuse-portrait.selected');
    const targetId = selectedPortrait?.dataset?.targetId;

    if (!targetId) return ui.notifications.warn("Select a player to accuse.");

    const targetName = selectedPortrait.dataset.targetName ?? "Unknown";
    const targetRolls = state.tableData?.rolls?.[targetId] ?? [];

    if (targetRolls.length === 0) return ui.notifications.warn("That player has no dice to accuse.");

    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();

    try {
      const result = await AccuseDialog.show({
        targetName,
        targetId,
        rolls: targetRolls,
        ante
      });

      if (result) {
        await tavernSocket.executeAsGM("playerAction", "accuse", result, game.user.id);
      }
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onGoad() {
    const state = getState();
    const userId = game.user.id;
    const targets = getValidGoadTargets(state, userId);

    if (targets.length === 0) return ui.notifications.warn("No valid targets to goad.");

    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();

    try {
      const actor = game.user.character;
      const result = await GoadDialog.show({
        targets,
        actor,
        itmMod: actor?.system?.skills?.itm?.total ?? 0,
        perMod: actor?.system?.skills?.per?.total ?? 0
      });

      if (result) {
        await tavernSocket.executeAsGM("playerAction", "goad", result, game.user.id);
      }
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onBumpTable() {
    const state = getState();
    const userId = game.user.id;
    const targets = getValidBumpTargets(state, userId);

    if (targets.length === 0) return ui.notifications.warn("No valid targets to bump.");

    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();

    try {
      const result = await BumpDialog.show({
        targets,
        actor: game.user.character,
        athMod: game.user.character?.system?.skills?.ath?.total ?? 0
      });

      if (result) {
        await tavernSocket.executeAsGM("playerAction", "bumpTable", result, game.user.id);
      }
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onBumpRetaliation(event, target) {
    const dieIndex = parseInt(target?.dataset?.dieIndex);
    if (isNaN(dieIndex)) return ui.notifications.warn("Invalid die selection.");

    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();

    try {
      await tavernSocket.executeAsGM("playerAction", "bumpRetaliation", { dieIndex }, game.user.id);
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onInspect() {
    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();

    try {
      const state = getState();
      const inspectionCost = getInspectionCost(state.pot);
      const confirm = await Dialog.confirm({
        title: "Call for Inspection",
        content: `
        <p><strong>Cost:</strong> ${inspectionCost}gp (half the pot)</p>
        <p>Roll Perception to try to catch cheaters.</p>
        <hr>
        <p style="color: #c44; font-weight: bold;">WARNING: If you find no cheaters, you forfeit your winnings!</p>
        <p class="hint" style="font-size: 0.9em; color: #666;">Only call if you're confident someone cheated.</p>
      `,
      });
      if (confirm) {
        await tavernSocket.executeAsGM("playerAction", "inspect", {}, game.user.id);
      }
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onSkipInspection() {
    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    try {
      await tavernSocket.executeAsGM("playerAction", "skipInspection", {}, game.user.id);
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onReveal() {
    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    try {
      await tavernSocket.executeAsGM("playerAction", "reveal", {}, game.user.id);
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onNewRound() {
    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    try {
      await tavernSocket.executeAsGM("playerAction", "newRound", {}, game.user.id);
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onReset() {
    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();

    try {
      const confirm = await Dialog.confirm({
        title: "Reset Table",
        content: "<p>Clear all players and reset the table?</p>",
      });
      if (confirm) {
        await tavernSocket.executeAsGM("resetTable");
      }
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async onDuelRoll() {
    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    try {
      await tavernSocket.executeAsGM("playerAction", "duelRoll", {}, game.user.id);
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }

  static async promptPayment(cost, ante, purpose) {
    if (cost <= 0) return "gold";

    const actor = game.user.character;
    const gp = actor?.system?.currency?.gp ?? 0;
    const canAffordGold = gp >= cost;
    const isHouse = isActingAsHouse(game.user.id, getState());

    if (isHouse) return "gold";
    if (!event.shiftKey && canAffordGold) return "gold";

    return PaymentDialog.show({
      cost,
      purpose,
      gp,
      canAffordGold,
      drinksNeeded: Math.ceil(cost / ante)
    });
  }

  static async onSideBet() {
    const state = getState();
    const tableData = state.tableData ?? {};
    const ante = game.settings.get(MODULE_ID, "fixedAnte");

    // Valid Champions: Active players not busted/caught
    const champions = state.turnOrder
      .filter(id => !tableData.busts?.[id] && !tableData.caught?.[id])
      .map(id => {
        const actor = game.users.get(id)?.character;
        const img = actor?.img || game.users.get(id)?.avatar || "icons/svg/mystery-man.svg";
        const name = state.players?.[id]?.name ?? game.users.get(id)?.name ?? "Unknown";
        const visibleTotal = tableData.visibleTotals?.[id] ?? 0;
        return { id, name, img, visibleTotal };
      });

    if (champions.length === 0) return ui.notifications.warn("No valid players to bet on.");

    if (TavernApp.uiLocked) return;
    TavernApp.uiLocked = true;
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();

    try {
      const result = await SideBetDialog.show({ champions, ante });

      if (result) {
        await tavernSocket.executeAsGM("playerAction", "sideBet", result, game.user.id);
      }
    } finally {
      TavernApp.uiLocked = false;
      if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
    }
  }
}
