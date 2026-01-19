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
      cheat: TavernApp.onCheat,
      accuse: TavernApp.onAccuse,
      skipInspection: TavernApp.onSkipInspection,
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
      const isCaught = tableData.caught?.[player.id] ?? false;
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
      } else if (state.status === "INSPECTION") {
        if (isBusted) {
          status = "busted";
          statusLabel = "BUST!";
        } else if (isCaught) {
          status = "caught";
          statusLabel = "CAUGHT!";
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
        } else if (isBusted) {
          status = "busted";
          statusLabel = `BUST (${total})`;
        } else {
          status = "revealed";
          statusLabel = `Total: ${total}`;
        }
      }

      // Show dice only to the player who owns them (or GM), or during reveal/inspection
      const showDice = isMe || isGM || state.status === "REVEALING" || state.status === "PAYOUT" || state.status === "INSPECTION";
      const diceDisplay = showDice ? rolls.map((r, idx) => ({
        die: r.die,
        result: r.result,
        icon: TavernApp.DICE_ICONS[r.die] || "d6",
        index: idx,
      })) : rolls.map(() => ({ hidden: true }));

      return {
        ...player,
        rolls,
        diceDisplay,
        total,
        displayTotal: showDice ? total : "?",
        isHolding,
        isBusted,
        isCaught,
        isCurrent,
        isMe,
        status,
        statusLabel,
        canAct: isCurrent && isMe && state.status === "PLAYING" && !isHolding && !isBusted,
        // For cheating: can cheat if it's playing, you're in the game, have at least 1 die, and haven't busted
        canCheat: state.status === "PLAYING" && isMe && rolls.length > 0 && !isBusted,
      };
    });

    // Determine current player info
    const currentPlayer = players.find(p => p.id === tableData.currentPlayer);
    const myTurn = tableData.currentPlayer === userId;
    
    // Game phase tracking
    const phase = tableData.phase ?? "opening";
    const isOpeningPhase = phase === "opening";
    const isBettingPhase = phase === "betting";
    
    // Check if player can hold (only in betting phase)
    const myRolls = tableData.rolls?.[userId] ?? [];
    const canHold = myTurn && isBettingPhase;
    const openingRollsRemaining = Math.max(0, 2 - myRolls.length);

    // Cheating context - player can cheat their own dice during play (GM cannot cheat)
    const canCheat = state.status === "PLAYING" && state.players?.[userId] && myRolls.length > 0 && !tableData.busts?.[userId] && !isGM;
    const myDiceForCheat = canCheat ? myRolls.map((r, idx) => ({
      index: idx,
      die: r.die,
      result: r.result,
      maxValue: r.die,
    })) : [];

    // Inspection/Staredown context
    const isInspection = state.status === "INSPECTION";
    const accusationMade = tableData.accusation !== null;
    const accusationCost = Math.floor(state.pot / 2);
    
    // Build list of players that can be accused (not self, not busted)
    // Include character artwork for portrait display
    const accuseTargets = isInspection && !accusationMade ? players
      .filter(p => p.id !== userId && !tableData.busts?.[p.id])
      .map(p => {
        // Get the user's assigned character for artwork
        const user = game.users.get(p.id);
        const actor = user?.character;
        const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
        return { id: p.id, name: p.name, img };
      }) : [];
    const isBusted = tableData.busts?.[userId] ?? false;
    const canAccuse = isInspection && state.players?.[userId] && !accusationMade && !isBusted && accuseTargets.length > 0 && !isGM;

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
      accusationMade,
      accuseTargets,
      isOpeningPhase,
      isBettingPhase,
      openingRollsRemaining,
      history,
      dice: [
        { value: 4, label: "d4", icon: "d4-grey" },
        { value: 6, label: "d6", icon: "d6-grey" },
        { value: 8, label: "d8", icon: "d8-grey" },
        { value: 10, label: "d10", icon: "d10-grey" },
        { value: 12, label: "d12", icon: "d12-grey" },
        { value: 20, label: "d20", icon: "d20-grey" },
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
      case "accusation": return "fa-solid fa-hand-point-right";
      case "cheat_caught": return "fa-solid fa-gavel";
      case "accusation_failed": return "fa-solid fa-face-frown";
      default: return "fa-solid fa-circle";
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);
    
    // Handle portrait selection for accusations
    const portraits = this.element.querySelectorAll('.accuse-portrait');
    const accuseBtn = this.element.querySelector('[data-action="accuse"]');
    
    if (portraits.length && accuseBtn) {
      portraits.forEach(portrait => {
        portrait.addEventListener('click', () => {
          // Deselect all others
          portraits.forEach(p => p.classList.remove('selected'));
          // Select this one
          portrait.classList.add('selected');
          // Enable accuse button
          accuseBtn.disabled = false;
        });
        
        // Keyboard support
        portrait.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            portrait.click();
          }
        });
      });
    }

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

  static async onCheat(event, target) {
    const state = getState();
    const userId = game.user.id;
    const myRolls = state.tableData?.rolls?.[userId] ?? [];

    if (myRolls.length === 0) {
      return ui.notifications.warn("You have no dice to cheat with!");
    }

    // Get skill modifiers from character sheet
    const actor = game.user.character;
    const decMod = actor?.system?.skills?.dec?.total ?? 0;
    const sltMod = actor?.system?.skills?.slt?.total ?? 0;
    const hasActor = !!actor;

    // Determine which skill has higher modifier for default selection
    const defaultSkill = sltMod > decMod ? "slt" : "dec";

    // Build a dialog for selecting which die to cheat and the new value
    const diceOptions = myRolls.map((r, idx) => 
      `<option value="${idx}" data-max="${r.die}">Die ${idx + 1}: d${r.die} (current: ${r.result})</option>`
    ).join("");

    // Get initial max value from first die
    const initialMax = myRolls[0]?.die ?? 20;

    const content = `
      <form>
        <div class="form-group">
          <label>Select Die to Modify:</label>
          <select name="dieIndex" id="cheat-die-select" style="width: 100%;">
            ${diceOptions}
          </select>
        </div>
        <div class="form-group">
          <label>New Value: <span id="cheat-max-label">(1-${initialMax})</span></label>
          <input type="number" name="newValue" id="cheat-new-value" min="1" max="${initialMax}" value="1" style="width: 100%;" />
        </div>
        <div class="form-group">
          <label>Skill Check:</label>
          <select name="skill" style="width: 100%;">
            <option value="dec" ${defaultSkill === "dec" ? "selected" : ""}>Deception (CHA) ${hasActor ? `(+${decMod})` : ""}</option>
            <option value="slt" ${defaultSkill === "slt" ? "selected" : ""}>Sleight of Hand (DEX) ${hasActor ? `(+${sltMod})` : ""}</option>
          </select>
        </div>
        <p class="hint" style="font-size: 0.9em; color: #666; margin-top: 10px;">
          <i class="fa-solid fa-warning"></i> Nat 1 = auto-caught at reveal. Nat 20 = untouchable!
        </p>
      </form>
      <script>
        document.getElementById('cheat-die-select')?.addEventListener('change', (e) => {
          const max = e.target.selectedOptions[0]?.dataset?.max ?? 20;
          document.getElementById('cheat-new-value').max = max;
          document.getElementById('cheat-max-label').textContent = '(1-' + max + ')';
        });
      </script>
    `;

    const result = await Dialog.prompt({
      title: "Cheat - Sleight of Hand",
      content,
      label: "Attempt Cheat",
      callback: (html) => {
        const dieIndex = parseInt(html.find('[name="dieIndex"]').val());
        const newValue = parseInt(html.find('[name="newValue"]').val());
        const skill = html.find('[name="skill"]').val();
        return { dieIndex, newValue, skill };
      },
      rejectClose: false,
    });

    if (result) {
      await tavernSocket.executeAsGM("playerAction", "cheat", result, game.user.id);
    }
  }

  static async onAccuse(event, target) {
    const state = getState();
    const accusationCost = Math.floor(state.pot / 2);
    
    // Get selected target from portrait
    const selectedPortrait = document.querySelector('.accuse-portrait.selected');
    const targetId = selectedPortrait?.dataset?.targetId;
    
    if (!targetId) {
      return ui.notifications.warn("Select a player to accuse.");
    }
    
    const targetName = selectedPortrait.dataset.targetName ?? "Unknown";
    
    // Get skill modifiers from character sheet
    const actor = game.user.character;
    const prcMod = actor?.system?.skills?.prc?.total ?? 0;
    const insMod = actor?.system?.skills?.ins?.total ?? 0;
    const hasActor = !!actor;
    
    // Determine which skill has higher modifier for default selection
    const defaultSkill = insMod > prcMod ? "ins" : "prc";
    
    const content = `
      <form>
        <p>Accuse <strong>${targetName}</strong> of cheating?</p>
        <p><strong>Cost:</strong> ${accusationCost}gp (half the pot)</p>
        <div class="form-group" style="margin-top: 10px;">
          <label>Skill Check:</label>
          <select name="skill" style="width: 100%;">
            <option value="prc" ${defaultSkill === "prc" ? "selected" : ""}>Perception (WIS) ${hasActor ? `(+${prcMod})` : ""}</option>
            <option value="ins" ${defaultSkill === "ins" ? "selected" : ""}>Insight (WIS) ${hasActor ? `(+${insMod})` : ""}</option>
          </select>
        </div>
        <hr>
        <p style="color: #c44; font-weight: bold;">If they're innocent, YOU forfeit your winnings!</p>
      </form>
    `;
    
    const result = await Dialog.prompt({
      title: "Make Accusation",
      content,
      label: "Accuse!",
      callback: (html) => ({ skill: html.find('[name="skill"]').val() }),
      rejectClose: false,
    });
    
    if (result) {
      await tavernSocket.executeAsGM("playerAction", "accuse", { targetId, skill: result.skill }, game.user.id);
    }
  }

  static async onInspect() {
    const state = getState();
    const inspectionCost = Math.floor(state.pot / 2);
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
  }

  static async onSkipInspection() {
    await tavernSocket.executeAsGM("playerAction", "skipInspection", {}, game.user.id);
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
