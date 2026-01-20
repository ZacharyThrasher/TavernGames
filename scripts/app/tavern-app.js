import { MODULE_ID, getState } from "../state.js";
import { tavernSocket } from "../socket.js";
import { getDieCost } from "../twenty-one.js";

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
      scan: TavernApp.onScan,
      goad: TavernApp.onGoad,
      bumpTable: TavernApp.onBumpTable,
      bumpRetaliation: TavernApp.onBumpRetaliation,
      duelRoll: TavernApp.onDuelRoll,
      skipInspection: TavernApp.onSkipInspection,
      reveal: TavernApp.onReveal,
      newRound: TavernApp.onNewRound,
      reset: TavernApp.onReset,
      toggleLiquidMode: TavernApp.onToggleLiquidMode,
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
    const liquidMode = game.settings.get(MODULE_ID, "liquidMode");

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

      // V2.0: Show dice based on visibility (public vs hole)
      // During play: Show public dice to everyone, hole dice only to owner/GM
      // During reveal/inspection/payout: Show all dice
      const isRevealPhase = state.status === "REVEALING" || state.status === "PAYOUT" || state.status === "INSPECTION";
      const diceDisplay = rolls.map((r, idx) => {
        const isPublicDie = r.public ?? false;
        const canSeeThisDie = isMe || isGM || isRevealPhase || isPublicDie;

        if (canSeeThisDie) {
          return {
            die: r.die,
            result: r.result,
            icon: TavernApp.DICE_ICONS[r.die] || "d6",
            index: idx,
            isPublic: isPublicDie,
            isHole: !isPublicDie,
          };
        } else {
          return { hidden: true, isHole: true };
        }
      });

      // V2.0: Calculate visible total for display to other players
      const visibleTotal = tableData.visibleTotals?.[player.id] ?? 0;
      const showFullTotal = isMe || isGM || isRevealPhase;

      return {
        ...player,
        rolls,
        diceDisplay,
        total,
        visibleTotal,
        displayTotal: showFullTotal ? total : (visibleTotal > 0 ? `${visibleTotal}+?` : "?"),
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
    // V2.0: Accusation cost is 2x ante (not half pot)
    const accusationCost = ante * 2;

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
    const isHolding = tableData.holds?.[userId] ?? false;
    const canAccuse = isInspection && state.players?.[userId] && !accusationMade && !isBusted && accuseTargets.length > 0 && !isGM;

    // V2.0: Scan context - can scan during staredown if you're in the game and not busted
    // Cost: 1x ante per target, cannot scan same target twice
    const scannedBy = tableData.scannedBy ?? {};
    const canScan = isInspection && state.players?.[userId] && !isBusted && !isGM;
    const scanCost = ante;

    // Build scan targets - players you haven't already scanned
    const scanTargets = canScan ? players
      .filter(p => p.id !== userId && !tableData.busts?.[p.id] && !game.users.get(p.id)?.isGM)
      .filter(p => !scannedBy[p.id]?.includes(userId)) // Not already scanned by this player
      .map(p => {
        const user = game.users.get(p.id);
        const actor = user?.character;
        const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
        return { id: p.id, name: p.name, img };
      }) : [];

    // V2.0: Goad context - can goad during betting phase if not busted, and haven't used it this round
    // NOTE: You CAN goad even if you're holding! (Unlike old intimidate)
    const hasGoadedThisRound = tableData.goadedThisRound?.[userId] ?? false;
    const isInGame = Boolean(state.players?.[userId]);
    const canGoad = isBettingPhase && isInGame && !isBusted && !isGM && !hasGoadedThisRound;

    // V2.0: Valid goad targets: other players not busted, not GM
    // HOLDERS ARE VALID TARGETS - that's the whole point of goad!
    const goadTargets = canGoad ? players
      .filter(p => p.id !== userId && !tableData.busts?.[p.id] && !game.users.get(p.id)?.isGM)
      .map(p => {
        const user = game.users.get(p.id);
        const actor = user?.character;
        const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
        const isTargetHolding = tableData.holds?.[p.id] ?? false;
        return { id: p.id, name: p.name, img, isHolding: isTargetHolding };
      }) : [];

    // Bump table context - can bump during betting phase if not busted/held, and haven't used it this round
    const hasBumpedThisRound = tableData.bumpedThisRound?.[userId] ?? false;
    const canBump = isBettingPhase && isInGame && !isBusted && !isHolding && !isGM && !hasBumpedThisRound;

    // Valid bump targets: other players with dice, not self, not busted, not GM (holders ARE valid targets!)
    const bumpTargets = canBump ? players
      .filter(p => p.id !== userId && !tableData.busts?.[p.id] && !game.users.get(p.id)?.isGM)
      .filter(p => (tableData.rolls?.[p.id]?.length ?? 0) > 0)
      .map(p => {
        const user = game.users.get(p.id);
        const actor = user?.character;
        const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
        const dice = (tableData.rolls?.[p.id] ?? []).map((r, idx) => ({ index: idx, die: r.die, result: r.result }));
        return { id: p.id, name: p.name, img, dice };
      }) : [];

    // Pending bump retaliation context
    const pendingRetaliation = tableData.pendingBumpRetaliation;
    const isRetaliationTarget = pendingRetaliation?.targetId === userId;
    const canRetaliate = isRetaliationTarget || (isGM && pendingRetaliation);
    const retaliationAttackerName = pendingRetaliation
      ? (state.players?.[pendingRetaliation.attackerId]?.name ?? "Unknown")
      : null;
    const retaliationAttackerDice = pendingRetaliation
      ? (tableData.rolls?.[pendingRetaliation.attackerId] ?? []).map((r, idx) => ({ index: idx, die: r.die, result: r.result }))
      : [];

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
      liquidMode,
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
      canScan,
      scanCost,
      scanTargets,
      canGoad,
      goadTargets,
      canBump,
      bumpTargets,
      canRetaliate,
      isRetaliationTarget,
      retaliationAttackerName,
      retaliationAttackerDice,
      isOpeningPhase,
      isBettingPhase,
      openingRollsRemaining,
      history,
      // V2.0: Dice with variable costs (d12 removed)
      dice: this._buildDiceArray(ante, isBettingPhase),
      // V2.0: Duel state
      isDuel: state.status === "DUEL",
      duel: tableData.duel ?? null,
      isMyDuel: (tableData.duel?.pendingRolls ?? []).includes(userId),
      duelParticipants: (tableData.duel?.participants ?? []).map(id => ({
        id,
        name: game.users.get(id)?.character?.name ?? game.users.get(id)?.name ?? "Unknown",
        hasRolled: !!tableData.duel?.rolls?.[id],
        roll: tableData.duel?.rolls?.[id]?.total ?? null,
      })),
    };
  }

  /**
   * V2.0: Build dice array with costs
   * d20=FREE, d10=½ ante, d6/d8=1x ante, d4=2x ante
   */
  _buildDiceArray(ante, isBettingPhase) {
    const diceConfig = [
      { value: 20, label: "d20", icon: "d20-grey", strategy: "Hail Mary" },
      { value: 10, label: "d10", icon: "d10-grey", strategy: "Builder" },
      { value: 8, label: "d8", icon: "d8-grey", strategy: "Standard" },
      { value: 6, label: "d6", icon: "d6-grey", strategy: "Standard" },
      { value: 4, label: "d4", icon: "d4-grey", strategy: "Precision" },
    ];

    return diceConfig.map(d => ({
      ...d,
      cost: getDieCost(d.value, ante),
      costLabel: this._formatCostLabel(getDieCost(d.value, ante), ante, isBettingPhase),
    }));
  }

  /**
   * Format cost label for display
   */
  _formatCostLabel(cost, ante, isBettingPhase) {
    if (!isBettingPhase) return ""; // No cost shown during opening
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

    // Iron Liver: Check payment
    // Check toggle setting first
    const liquidMode = game.settings.get(MODULE_ID, "liquidMode");

    const state = getState();
    const ante = game.settings.get(MODULE_ID, "fixedAnte");
    const isBettingPhase = state.tableData?.phase === "betting";

    // Cost only applies during betting phase
    const cost = isBettingPhase ? getDieCost(parseInt(die), ante) : 0;

    let payWithDrink = false;

    // Check liquid mode or Fallback to prompt if broke
    if (liquidMode) {
      payWithDrink = true;
    } else {
      // Check if broke - prompt if necessary
      const actor = game.user.character;
      const gp = actor?.system?.currency?.gp ?? 0;
      if (cost > 0 && gp < cost) {
        const confirm = await Dialog.confirm({
          title: "Insufficient Gold",
          content: `<p>You don't have enough gold (${cost}gp).</p><p><strong>Put it on the Tab?</strong></p>`
        });
        if (!confirm) return;
        payWithDrink = true;
      }
    }

    await tavernSocket.executeAsGM("playerAction", "roll", { die, payWithDrink }, game.user.id);
  }

  static async onToggleLiquidMode(event, target) {
    const current = game.settings.get(MODULE_ID, "liquidMode");
    await game.settings.set(MODULE_ID, "liquidMode", !current);
    if (game.tavernDiceMaster?.app) game.tavernDiceMaster.app.render();
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

    // Get skill/ability modifiers from character sheet
    const actor = game.user.character;
    const hasActor = !!actor;

    // Physical skills
    const sltMod = actor?.system?.skills?.slt?.total ?? 0;
    const decMod = actor?.system?.skills?.dec?.total ?? 0;

    // Magical abilities (use modifier, not total)
    const intMod = actor?.system?.abilities?.int?.mod ?? 0;
    const wisMod = actor?.system?.abilities?.wis?.mod ?? 0;
    const chaMod = actor?.system?.abilities?.cha?.mod ?? 0;

    // Build a dialog for selecting which die to cheat and the new value
    const diceOptions = myRolls.map((r, idx) => {
      const visibility = r.public ? "Visible" : "Hole";
      return `<option value="${idx}" data-max="${r.die}">Die ${idx + 1}: d${r.die} (${visibility}, current: ${r.result})</option>`;
    }).join("");

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
        <hr>
        <div class="form-group">
          <label style="font-weight: bold;">Cheat Type:</label>
          <div style="display: flex; gap: 16px; margin-top: 8px;">
            <label style="cursor: pointer;">
              <input type="radio" name="cheatType" value="physical" checked />
              <strong>Physical</strong>
              <div style="font-size: 0.85em; color: #888;">Sleight of Hand / Deception</div>
            </label>
            <label style="cursor: pointer;">
              <input type="radio" name="cheatType" value="magical" />
              <strong>Magical</strong>
              <div style="font-size: 0.85em; color: #888;">INT / WIS / CHA</div>
            </label>
          </div>
        </div>
        <div class="form-group" id="physical-skill-group">
          <label>Physical Skill:</label>
          <select name="physicalSkill" style="width: 100%;">
            <option value="slt" ${sltMod >= decMod ? "selected" : ""}>Sleight of Hand (DEX) ${hasActor ? `(+${sltMod})` : ""}</option>
            <option value="dec" ${decMod > sltMod ? "selected" : ""}>Deception (CHA) ${hasActor ? `(+${decMod})` : ""}</option>
          </select>
        </div>
        <div class="form-group" id="magical-skill-group" style="display: none;">
          <label>Spellcasting Ability:</label>
          <select name="magicalSkill" style="width: 100%;">
            <option value="int" ${intMod >= wisMod && intMod >= chaMod ? "selected" : ""}>Intelligence ${hasActor ? `(+${intMod})` : ""}</option>
            <option value="wis" ${wisMod > intMod && wisMod >= chaMod ? "selected" : ""}>Wisdom ${hasActor ? `(+${wisMod})` : ""}</option>
            <option value="cha" ${chaMod > intMod && chaMod > wisMod ? "selected" : ""}>Charisma ${hasActor ? `(+${chaMod})` : ""}</option>
          </select>
        </div>
        <hr>
        <div id="cheat-warning-physical">
          <p class="hint" style="font-size: 0.9em; color: #c44; margin-top: 10px;">
            <i class="fa-solid fa-warning"></i> <strong>FUMBLE:</strong> Roll < 10 = auto-caught immediately!
          </p>
          <p class="hint" style="font-size: 0.85em; color: #888;">Sets Tell DC (detected by Insight during Scan)</p>
        </div>
        <div id="cheat-warning-magical" style="display: none;">
          <p class="hint" style="font-size: 0.9em; color: #88f; margin-top: 10px;">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Magical cheats cannot fumble.
          </p>
          <p class="hint" style="font-size: 0.85em; color: #888;">Sets Residue DC (detected by Arcana during Scan)</p>
        </div>
      </form>
      <script>
        document.getElementById('cheat-die-select')?.addEventListener('change', (e) => {
          const max = e.target.selectedOptions[0]?.dataset?.max ?? 20;
          document.getElementById('cheat-new-value').max = max;
          document.getElementById('cheat-max-label').textContent = '(1-' + max + ')';
        });
        document.querySelectorAll('[name="cheatType"]').forEach(radio => {
          radio.addEventListener('change', (e) => {
            const isPhysical = e.target.value === 'physical';
            document.getElementById('physical-skill-group').style.display = isPhysical ? 'block' : 'none';
            document.getElementById('magical-skill-group').style.display = isPhysical ? 'none' : 'block';
            document.getElementById('cheat-warning-physical').style.display = isPhysical ? 'block' : 'none';
            document.getElementById('cheat-warning-magical').style.display = isPhysical ? 'none' : 'block';
          });
        });
      </script>
    `;

    const result = await Dialog.prompt({
      title: "Cheat - V2.0",
      content,
      label: "Attempt Cheat",
      callback: (html) => {
        const dieIndex = parseInt(html.find('[name="dieIndex"]').val());
        const newValue = parseInt(html.find('[name="newValue"]').val());
        const cheatType = html.find('[name="cheatType"]:checked').val();
        const skill = cheatType === "physical"
          ? html.find('[name="physicalSkill"]').val()
          : html.find('[name="magicalSkill"]').val();
        return { dieIndex, newValue, cheatType, skill };
      },
      rejectClose: false,
    });

    if (result) {
      await tavernSocket.executeAsGM("playerAction", "cheat", result, game.user.id);
    }
  }

  static async onAccuse(event, target) {
    const state = getState();
    const ante = game.settings.get(MODULE_ID, "fixedAnte");
    const accusationCost = ante * 2;

    // Get selected target from portrait
    const selectedPortrait = document.querySelector('.accuse-portrait.selected');
    const targetId = selectedPortrait?.dataset?.targetId;

    if (!targetId) {
      return ui.notifications.warn("Select a player to accuse.");
    }

    const targetName = selectedPortrait.dataset.targetName ?? "Unknown";

    // V2.0: No skill selection - direct accusation
    const content = `
      <form>
        <p>Accuse <strong>${targetName}</strong> of cheating?</p>
        <p><strong>Cost:</strong> ${accusationCost}gp (2× ante)</p>
        <hr>
        <p style="color: #4a4; font-weight: bold;">✓ If correct: Refund + ${ante * 5}gp bounty!</p>
        <p style="color: #c44; font-weight: bold;">✗ If wrong: Lose ${accusationCost}gp fee</p>
      </form>
    `;

    const result = await Dialog.confirm({
      title: "Make Accusation",
      content,
      yes: { label: "Accuse!", icon: '<i class="fa-solid fa-hand-point-right"></i>' },
      no: { label: "Cancel", icon: '<i class="fa-solid fa-times"></i>' },
      defaultYes: false,
    });

    if (result) {
      await tavernSocket.executeAsGM("playerAction", "accuse", { targetId }, game.user.id);
    }
  }

  /**
   * V2.0: Scan - Investigate a player for cheating during Staredown.
   * - Cost: 1x ante per target
   * - Skill: Insight (vs Tell DC) for Physical cheats, Arcana (vs Residue DC) for Magical
   * - Success: Whisper reveals cheat type + location (Public/Hole), NOT the actual number
   */
  static async onScan(event, target) {
    const state = getState();
    const tableData = state.tableData ?? {};
    const userId = game.user.id;
    const players = Object.values(state.players ?? {});
    const ante = game.settings.get(MODULE_ID, "fixedAnte");
    const scannedBy = tableData.scannedBy ?? {};

    // Build list of valid targets (not self, not busted, not GM, not already scanned by this user)
    const validTargets = players
      .filter(p => p.id !== userId && !tableData.busts?.[p.id] && !game.users.get(p.id)?.isGM)
      .filter(p => !scannedBy[p.id]?.includes(userId))
      .map(p => {
        const user = game.users.get(p.id);
        const actor = user?.character;
        const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
        return { id: p.id, name: p.name, img };
      });

    if (validTargets.length === 0) {
      return ui.notifications.warn("No valid targets to scan.");
    }

    // Get skill modifiers
    const actor = game.user.character;
    const insMod = actor?.system?.skills?.ins?.total ?? 0;
    const arcMod = actor?.system?.skills?.arc?.total ?? 0;
    const hasActor = !!actor;

    // Build target selection with portraits
    const targetOptions = validTargets.map(t =>
      `<div class="scan-portrait" data-target-id="${t.id}" data-target-name="${t.name}" tabindex="0" style="display: inline-block; text-align: center; padding: 8px; margin: 4px; border: 2px solid transparent; border-radius: 8px; cursor: pointer;">
        <img src="${t.img}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;" />
        <div style="font-size: 0.85em; margin-top: 4px;">${t.name}</div>
      </div>`
    ).join("");

    const content = `
      <form>
        <p style="font-weight: bold; margin-bottom: 8px;">Select a player to scan:</p>
        <p><strong>Cost:</strong> ${ante}gp (1x ante)</p>
        <div class="scan-targets" style="display: flex; flex-wrap: wrap; justify-content: center; margin-bottom: 12px;">
          ${targetOptions}
        </div>
        <hr>
        <div class="form-group">
          <label style="font-weight: bold;">What are you looking for?</label>
          <div style="display: flex; gap: 16px; margin-top: 8px;">
            <label style="cursor: pointer; flex: 1; padding: 8px; border: 2px solid #555; border-radius: 8px; text-align: center;" class="scan-type-option" data-type="insight">
              <input type="radio" name="scanType" value="insight" checked style="display: none;" />
              <i class="fa-solid fa-eye" style="font-size: 1.5em; color: #a0a0ff;"></i>
              <div><strong>Physical Tells</strong></div>
              <div style="font-size: 0.85em; color: #888;">Insight ${hasActor ? `(+${insMod})` : ""}</div>
              <div style="font-size: 0.75em; color: #666; margin-top: 4px;">Sleight of Hand / Deception</div>
            </label>
            <label style="cursor: pointer; flex: 1; padding: 8px; border: 2px solid #555; border-radius: 8px; text-align: center;" class="scan-type-option" data-type="arcana">
              <input type="radio" name="scanType" value="arcana" style="display: none;" />
              <i class="fa-solid fa-wand-magic-sparkles" style="font-size: 1.5em; color: #a080ff;"></i>
              <div><strong>Magical Residue</strong></div>
              <div style="font-size: 0.85em; color: #888;">Arcana ${hasActor ? `(+${arcMod})` : ""}</div>
              <div style="font-size: 0.75em; color: #666; margin-top: 4px;">INT / WIS / CHA magic</div>
            </label>
          </div>
        </div>
        <hr>
        <p style="color: #aaf; font-size: 0.9em;">
          <i class="fa-solid fa-info-circle"></i> Success reveals cheat <strong>type</strong> and <strong>location</strong> (visible/hole), but NOT the actual number.
        </p>
      </form>
      <style>
        .scan-portrait:hover { border-color: #666; background: rgba(255,255,255,0.1); }
        .scan-portrait.selected { border-color: #4a6b8b; background: rgba(74,107,139,0.2); }
        .scan-type-option:hover { border-color: #777; }
        .scan-type-option.selected { border-color: #4a6b8b; background: rgba(74,107,139,0.2); }
      </style>
    `;

    let selectedTargetId = null;

    const result = await Dialog.prompt({
      title: "Scan for Cheating",
      content,
      label: "Scan",
      render: (html) => {
        // Portrait selection
        const portraits = html.find('.scan-portrait');
        portraits.on('click', function () {
          portraits.removeClass('selected');
          $(this).addClass('selected');
          selectedTargetId = $(this).data('target-id');
        });
        portraits.on('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            $(this).click();
          }
        });

        // Scan type selection
        const typeOptions = html.find('.scan-type-option');
        typeOptions.on('click', function () {
          typeOptions.removeClass('selected');
          $(this).addClass('selected');
          $(this).find('input[type="radio"]').prop('checked', true);
        });
        // Set initial selection
        html.find('.scan-type-option[data-type="insight"]').addClass('selected');
      },
      callback: (html) => {
        if (!selectedTargetId) return null;
        const scanType = html.find('[name="scanType"]:checked').val();
        return { targetId: selectedTargetId, scanType };
      },
      rejectClose: false,
    });

    if (result) {
      await tavernSocket.executeAsGM("playerAction", "scan", result, game.user.id);
    }
  }

  /**
   * V2.0: Goad - Force someone to ROLL (even if they held!)
   * Attacker chooses: Intimidation OR Persuasion
   * Defender rolls: Insight
   * Success: Target must roll a die of their choice
   * Backfire: Attacker must roll a die of their choice
   */
  static async onGoad(event, target) {
    const state = getState();
    const tableData = state.tableData ?? {};
    const userId = game.user.id;
    const players = Object.values(state.players ?? {});

    // V2.0: Valid goad targets - not self, not busted, not GM
    // HOLDERS ARE VALID TARGETS - that's the whole point!
    const validTargets = players
      .filter(p => p.id !== userId && !tableData.busts?.[p.id] && !game.users.get(p.id)?.isGM)
      .map(p => {
        const user = game.users.get(p.id);
        const actor = user?.character;
        const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
        const isHolding = tableData.holds?.[p.id] ?? false;
        return { id: p.id, name: p.name, img, isHolding };
      });

    if (validTargets.length === 0) {
      return ui.notifications.warn("No valid targets to goad.");
    }

    // Get skill modifiers
    const actor = game.user.character;
    const itmMod = actor?.system?.skills?.itm?.total ?? 0;
    const perMod = actor?.system?.skills?.per?.total ?? 0;
    const hasActor = !!actor;

    // Default to whichever skill is higher
    const defaultSkill = itmMod >= perMod ? "itm" : "per";

    // Build target selection with portraits (mark holders!)
    const targetOptions = validTargets.map(t =>
      `<div class="goad-portrait${t.isHolding ? ' is-holding' : ''}" data-target-id="${t.id}" data-target-name="${t.name}" tabindex="0" style="display: inline-block; text-align: center; padding: 8px; margin: 4px; border: 2px solid transparent; border-radius: 8px; cursor: pointer;">
        <img src="${t.img}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; ${t.isHolding ? 'box-shadow: 0 0 8px #4a7c4e;' : ''}" />
        <div style="font-size: 0.85em; margin-top: 4px;">${t.name}</div>
        ${t.isHolding ? '<div style="font-size: 0.75em; color: #4a7c4e; font-weight: bold;">HOLDING</div>' : ''}
      </div>`
    ).join("");

    const content = `
      <form>
        <p style="font-weight: bold; margin-bottom: 8px;">Select a target to goad into rolling:</p>
        <div class="goad-targets" style="display: flex; flex-wrap: wrap; justify-content: center; margin-bottom: 12px;">
          ${targetOptions}
        </div>
        <div class="form-group">
          <label>Your Skill:</label>
          <select name="attackerSkill" style="width: 100%;">
            <option value="itm" ${defaultSkill === "itm" ? "selected" : ""}>Intimidation (CHA) ${hasActor ? `(+${itmMod})` : ""}</option>
            <option value="per" ${defaultSkill === "per" ? "selected" : ""}>Persuasion (CHA) ${hasActor ? `(+${perMod})` : ""}</option>
          </select>
        </div>
        <div class="form-group">
          <label style="color: #666;">Target defends with: <strong>Insight (WIS)</strong></label>
        </div>
        <hr>
        <p style="color: #4a7c4e; font-weight: bold;">SUCCESS: Target must roll a die of their choice!</p>
        <p style="color: #c44; font-weight: bold;">BACKFIRE: YOU must roll a die of your choice!</p>
      </form>
      <style>
        .goad-portrait:hover { border-color: #666; background: rgba(255,255,255,0.1); }
        .goad-portrait.selected { border-color: #4a7c4e; background: rgba(74,124,78,0.2); }
        .goad-portrait.is-holding { border-color: #4a7c4e; border-style: dashed; }
      </style>
    `;

    let selectedTargetId = null;

    const result = await Dialog.prompt({
      title: "Goad",
      content,
      label: "Goad!",
      render: (html) => {
        const portraits = html.find('.goad-portrait');
        portraits.on('click', function () {
          portraits.removeClass('selected');
          $(this).addClass('selected');
          selectedTargetId = $(this).data('target-id');
        });
        portraits.on('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            $(this).click();
          }
        });
      },
      callback: (html) => {
        if (!selectedTargetId) return null;
        const attackerSkill = html.find('[name="attackerSkill"]').val();
        return { targetId: selectedTargetId, attackerSkill };
      },
      rejectClose: false,
    });

    if (result) {
      await tavernSocket.executeAsGM("playerAction", "goad", result, game.user.id);
    }
  }

  static async onBumpTable(event, target) {
    const state = getState();
    const tableData = state.tableData ?? {};
    const userId = game.user.id;
    const players = Object.values(state.players ?? {});

    // Build list of valid targets (not self, not busted, not GM, has dice)
    const validTargets = players
      .filter(p => p.id !== userId && !tableData.busts?.[p.id] && !game.users.get(p.id)?.isGM)
      .filter(p => (tableData.rolls?.[p.id]?.length ?? 0) > 0)
      .map(p => {
        const user = game.users.get(p.id);
        const actor = user?.character;
        const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
        // V2.0: Include visibility info for each die
        const dice = (tableData.rolls?.[p.id] ?? []).map((r, idx) => ({
          index: idx,
          die: r.die,
          result: r.result,
          isPublic: r.public ?? true,
          isHole: idx === 1 && tableData.phase !== "betting" ? false : !r.public // 2nd opening die is hole
        }));
        const isHolding = tableData.holds?.[p.id] ?? false;
        return { id: p.id, name: p.name, img, dice, isHolding };
      });

    if (validTargets.length === 0) {
      return ui.notifications.warn("No valid targets to bump.");
    }

    // Get Athletics modifier
    const actor = game.user.character;
    const athMod = actor?.system?.skills?.ath?.total ?? 0;
    const hasActor = !!actor;

    // Build target selection with portraits
    const targetOptions = validTargets.map(t =>
      `<div class="bump-portrait" data-target-id="${t.id}" data-target-name="${t.name}" tabindex="0" style="display: inline-block; text-align: center; padding: 8px; margin: 4px; border: 2px solid transparent; border-radius: 8px; cursor: pointer;">
        <img src="${t.img}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;" />
        <div style="font-size: 0.85em; margin-top: 4px;">${t.name}${t.isHolding ? ' <span style="color: #4a7c4e;">(Holding)</span>' : ''}</div>
      </div>`
    ).join("");

    const content = `
      <form>
        <p style="font-weight: bold; margin-bottom: 8px;">Select a target to bump:</p>
        <div class="bump-targets" style="display: flex; flex-wrap: wrap; justify-content: center; margin-bottom: 12px;">
          ${targetOptions}
        </div>
        <div class="form-group">
          <label>Your Skill: Athletics (STR) ${hasActor ? `(+${athMod})` : ""}</label>
        </div>
        <div class="form-group" id="bump-die-selection" style="display: none;">
          <label>Select which die to bump:</label>
          <p class="hint" style="font-size: 0.8em; color: #888; margin: 4px 0;">V2.0: You can target visible dice OR the hole die!</p>
          <div id="bump-dice-container" style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 8px;"></div>
        </div>
        <hr>
        <p style="color: #c44; font-weight: bold;">WARNING: If you fail, they choose one of YOUR dice to re-roll!</p>
      </form>
      <style>
        .bump-portrait:hover { border-color: #666; background: rgba(255,255,255,0.1); }
        .bump-portrait.selected { border-color: #7a6a3a; background: rgba(122, 106, 58, 0.2); }
        .bump-die-btn { padding: 8px 12px; border: 2px solid #555; border-radius: 4px; background: #333; color: #fff; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .bump-die-btn:hover { border-color: #7a6a3a; background: #444; }
        .bump-die-btn.selected { border-color: #ddc888; background: #5a4a2a; }
        .bump-die-btn.hole-die { border-style: dashed; border-color: #666; }
        .bump-die-btn.hole-die .die-label { color: #888; font-style: italic; }
        .bump-die-btn .die-visibility { font-size: 0.7em; color: #888; }
      </style>
    `;

    let selectedTargetId = null;
    let selectedDieIndex = null;

    const result = await Dialog.prompt({
      title: "Bump the Table",
      content,
      label: "Bump!",
      render: (html) => {
        const portraits = html.find('.bump-portrait');
        const dieSelection = html.find('#bump-die-selection');
        const diceContainer = html.find('#bump-dice-container');

        portraits.on('click', function () {
          portraits.removeClass('selected');
          $(this).addClass('selected');
          selectedTargetId = $(this).data('target-id');
          selectedDieIndex = null;

          // Find target's dice and show selection with V2.0 visibility info
          const targetData = validTargets.find(t => t.id === selectedTargetId);
          if (targetData && targetData.dice.length > 0) {
            diceContainer.empty();
            targetData.dice.forEach((d, idx) => {
              const isHole = !d.isPublic;
              const visLabel = isHole ? "HOLE" : "Visible";
              const holeClass = isHole ? "hole-die" : "";
              const btn = $(`<button type="button" class="bump-die-btn ${holeClass}" data-die-index="${idx}">
                <img src="icons/svg/d${d.die}-grey.svg" style="width: 24px; height: 24px;" />
                <span class="die-label">d${d.die}</span>
                <span class="die-visibility">${visLabel}</span>
              </button>`);
              btn.on('click', function (e) {
                e.preventDefault();
                diceContainer.find('.bump-die-btn').removeClass('selected');
                $(this).addClass('selected');
                selectedDieIndex = idx;
              });
              diceContainer.append(btn);
            });
            dieSelection.show();
          }
        });

        portraits.on('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            $(this).click();
          }
        });
      },
      callback: (html) => {
        if (!selectedTargetId || selectedDieIndex === null) return null;
        return { targetId: selectedTargetId, dieIndex: selectedDieIndex };
      },
      rejectClose: false,
    });

    if (result) {
      await tavernSocket.executeAsGM("playerAction", "bumpTable", result, game.user.id);
    }
  }

  static async onBumpRetaliation(event, target) {
    const dieIndex = parseInt(target?.dataset?.dieIndex);
    if (isNaN(dieIndex)) {
      return ui.notifications.warn("Invalid die selection.");
    }
    await tavernSocket.executeAsGM("playerAction", "bumpRetaliation", { dieIndex }, game.user.id);
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

  // V2.0: Handle duel roll submission
  static async onDuelRoll() {
    await tavernSocket.executeAsGM("playerAction", "duelRoll", {}, game.user.id);
  }

  /**
   * Iron Liver: Liquid Currency - Prompt for payment method (Gold or Drink)
   * @param {number} cost - The cost in GP
   * @param {number} ante - The current ante size
   * @param {string} purpose - Label for what is being bought (e.g. "Buy d8", "Scan")
   * @returns {Promise<string|null>} "gold", "drink", or null (cancel)
   */
  static async promptPayment(cost, ante, purpose) {
    if (cost <= 0) return "gold"; // Free actions don't need payment

    const drinksNeeded = Math.ceil(cost / ante);

    // Check gold
    const actor = game.user.character;
    const gp = actor?.system?.currency?.gp ?? 0;
    const canAffordGold = gp >= cost;
    const isGM = game.user.isGM;

    // GM always "pays" with gold (house money)
    if (isGM) return "gold";

    // If holding Shift, force prompt even if they can afford it
    // Or if they can't afford it, force prompt
    if (!event.shiftKey && canAffordGold) return "gold";

    // Build dialog
    const content = `
      <div class="tavern-payment-dialog">
        <p class="payment-title">Payment Required: <strong>${cost}gp</strong></p>
        <p class="payment-purpose">${purpose}</p>
        <hr>
        <div class="payment-options">
          <button type="button" class="btn-payment gold ${!canAffordGold ? 'disabled' : ''}" data-method="gold" ${!canAffordGold ? 'disabled' : ''}>
            <div class="payment-icon"><i class="fa-solid fa-coins"></i></div>
            <div class="payment-details">
              <span class="payment-label">Pay Gold</span>
              <span class="payment-cost">${cost} gp</span>
              <span class="payment-balance ${!canAffordGold ? 'insufficient' : ''}">(Have: ${gp} gp)</span>
            </div>
          </button>
          
          <button type="button" class="btn-payment drink" data-method="drink">
            <div class="payment-icon"><i class="fa-solid fa-beer-mug-empty"></i></div>
            <div class="payment-details">
              <span class="payment-label">Put it on the Tab</span>
              <span class="payment-cost">${drinksNeeded} Drink${drinksNeeded > 1 ? 's' : ''}</span>
              <span class="payment-desc">Roll CON Save (DC 10+)</span>
            </div>
          </button>
        </div>
        <p class="hint" style="text-align: center; margin-top: 8px; font-size: 0.85em; color: #888;">
          <i class="fa-solid fa-info-circle"></i> Hold SHIFT to show this menu when you have gold.
        </p>
      </div>
      <style>
        .tavern-payment-dialog .payment-options { display: flex; gap: 10px; margin: 10px 0; }
        .btn-payment { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 10px; border: 2px solid #444; border-radius: 8px; background: rgba(0,0,0,0.2); cursor: pointer; transition: all 0.2s; }
        .btn-payment:hover:not(.disabled) { border-color: #aaa; background: rgba(255,255,255,0.1); }
        .btn-payment.gold:hover:not(.disabled) { border-color: #ffd700; box-shadow: 0 0 10px rgba(255, 215, 0, 0.2); }
        .btn-payment.drink:hover { border-color: #ffaa00; box-shadow: 0 0 10px rgba(255, 170, 0, 0.2); }
        .btn-payment.disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }
        .payment-icon { font-size: 2em; margin-bottom: 5px; }
        .payment-label { font-weight: bold; font-size: 1.1em; }
        .payment-cost { font-size: 1.2em; color: #fff; margin: 2px 0; }
        .payment-balance { font-size: 0.85em; color: #888; }
        .payment-balance.insufficient { color: #ff4444; }
      </style>
    `;

    return new Promise((resolve) => {
      const d = new Dialog({
        title: "Payment Method",
        content,
        buttons: {},
        render: (html) => {
          html.find('.btn-payment').on('click', function () {
            const method = $(this).data('method');
            d.close();
            resolve(method);
          });
        },
        close: () => resolve(null)
      });
      d.render(true);
    });
  }
}
