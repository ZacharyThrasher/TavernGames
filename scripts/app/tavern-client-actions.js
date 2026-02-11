import { getState } from "../state.js";
import { tavernSocket } from "../socket.js";
import { MODULE_ID, TIMING, getDieCost } from "../twenty-one/constants.js";
import {
  getValidAccuseTargets,
  getValidBootTargets,
  getValidBumpTargets,
  getValidGoadTargets,
  getValidProfileTargets,
  isActingAsHouse
} from "../twenty-one/utils/game-logic.js";
import { CheatDialog } from "./dialogs/cheat-dialog.js";
import { ProfileDialog } from "./dialogs/profile-dialog.js";
import { GoadDialog } from "./dialogs/goad-dialog.js";
import { BumpDialog } from "./dialogs/bump-dialog.js";
import { BootDialog } from "./dialogs/boot-dialog.js";
import { AccuseDialog } from "./dialogs/accuse-dialog.js";
import { SideBetDialog } from "./dialogs/side-bet-dialog.js";
import { HelpDialog } from "./dialogs/help-dialog.js";
import { GMJoinDialog } from "./dialogs/gm-join-dialog.js";
import { GoblinHoldDialog } from "./dialogs/goblin-hold-dialog.js";
import { ConfirmDialog } from "./dialogs/confirm-dialog.js";
import { delay, fireAndForget } from "../twenty-one/utils/runtime.js";
import { localizeOrFallback } from "../twenty-one/utils/i18n.js";

const t = (key, fallback, data = {}) => localizeOrFallback(key, fallback, data);
const REVEAL_ACTIVE_SELECTOR = ".dice-reveal-overlay, .dice-reveal-quick";
const APP_RENDER_DEFER_MS = 60;
const APP_RENDER_MAX_DEFERRALS = 120;
let renderDeferrals = 0;
let renderRetryHandle = null;

function hasActiveDiceReveal() {
  return Boolean(document.querySelector(REVEAL_ACTIVE_SELECTOR));
}

function requireAssignedCharacter(actionKey, fallbackActionName) {
  if (game.user.character) return true;
  ui.notifications.warn(t("TAVERN.Notifications.AssignedCharacterRequired", "Assign a character before using {action}.", {
    action: t(actionKey, fallbackActionName)
  }));
  return false;
}

export function renderAppIfPresent() {
  const app = game.tavernDiceMaster?.app;
  if (!app) return;

  if (hasActiveDiceReveal() && renderDeferrals < APP_RENDER_MAX_DEFERRALS) {
    renderDeferrals += 1;
    if (!renderRetryHandle) {
      renderRetryHandle = setTimeout(() => {
        renderRetryHandle = null;
        renderAppIfPresent();
      }, APP_RENDER_DEFER_MS);
    }
    return;
  }

  renderDeferrals = 0;
  if (renderRetryHandle) {
    clearTimeout(renderRetryHandle);
    renderRetryHandle = null;
  }
  app.render();
}

export async function withUiLock(AppClass, action) {
  if (AppClass.uiLocked) return undefined;
  AppClass.uiLocked = true;
  renderAppIfPresent();
  try {
    return await action();
  } finally {
    AppClass.uiLocked = false;
    renderAppIfPresent();
  }
}

async function showGMJoinDialog() {
  const selectedToken = canvas.tokens?.controlled?.[0];
  const selectedActor = selectedToken?.actor;
  const ante = game.settings.get(MODULE_ID, "fixedAnte");
  return GMJoinDialog.show({ selectedActor, ante });
}

async function showGoblinHoldDialog() {
  return GoblinHoldDialog.show();
}

export function onToggleLogs() {
  game.tavernDiceMaster?.toggleLogs();
  if (game.user.isGM) {
    import("../state.js").then(({ markLogsAsSeen }) => {
      markLogsAsSeen(game.user.id);
    });
  } else {
    fireAndForget("Could not mark logs as seen", tavernSocket.executeAsGM("markLogsAsSeen", game.user.id));
  }
}

export async function onJoin() {
  if (!game.users.activeGM) {
    return ui.notifications.warn(t("TAVERN.Notifications.GMRequired", "A GM must be connected to play."));
  }
  if (game.user.isGM) {
    const choice = await showGMJoinDialog();
    if (!choice) return;
    if (choice.playAsNpc) {
      await tavernSocket.executeAsGM("joinTable", game.user.id, {
        playingAsNpc: true,
        npcActorId: choice.actorId,
        npcName: choice.actorName,
        npcImg: choice.actorImg,
        initialWallet: choice.initialWallet,
      });
    } else {
      await tavernSocket.executeAsGM("joinTable", game.user.id, { playingAsNpc: false });
    }
  } else {
    await tavernSocket.executeAsGM("joinTable", game.user.id);
  }
}

export async function onLeave() {
  await tavernSocket.executeAsGM("leaveTable", game.user.id);
}

export async function onStart() {
  const state = getState();
  const startingHeat = state.tableData?.houseRules?.startingHeat ?? 10;
  await tavernSocket.executeAsGM("startRound", startingHeat);
}

export async function onRoll(AppClass, event, target) {
  const die = target?.dataset?.die;
  if (!die) return;

  const state = getState();
  const isGoblinMode = state.tableData?.gameMode === "goblin";

  if (!isGoblinMode && state.tableData?.pendingBumpRetaliation?.attackerId === game.user.id) {
    ui.notifications.warn(t("TAVERN.Notifications.CaughtBumping", "You were caught bumping! Wait for retaliation."));
    return;
  }
  if (!isGoblinMode && state.tableData?.dared?.[game.user.id] && die !== "8") {
    ui.notifications.warn(t("TAVERN.Notifications.DaredForced", "You are Dared! You forced to roll a d8 (Free) or Fold."));
    return;
  }
  if (!isGoblinMode && state.tableData?.hunchLocked?.[game.user.id] && die !== "20") {
    ui.notifications.warn(t("TAVERN.Notifications.HunchLockedD20", "Foresight locked you into rolling a d20!"));
    return;
  }

  await withUiLock(AppClass, async () => {
    const liquidModeSetting = game.settings.get(MODULE_ID, "liquidMode");
    const ante = game.settings.get(MODULE_ID, "fixedAnte");
    const isBettingPhase = state.tableData?.phase === "betting";
    const isSloppy = state.tableData?.sloppy?.[game.user.id] ?? false;
    const isHouse = isActingAsHouse(game.user.id, state);
    const isNpc = state.players?.[game.user.id]?.playingAsNpc;

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
          ui.notifications.warn(t("TAVERN.Notifications.CutOffNoTab", "You're cut off and can't put it on the tab."));
          return;
        }
        const confirm = await ConfirmDialog.show({
          icon: "fa-solid fa-coins",
          titleText: t("TAVERN.Dialogs.InsufficientGoldTitle", "Insufficient Gold"),
          lines: [
            t("TAVERN.Dialogs.InsufficientGoldBody", "You don't have enough gold ({cost}gp).", { cost }),
            t("TAVERN.Dialogs.PutOnTabPrompt", "Put it on the Tab?")
          ],
          tone: "warning",
          confirmLabel: t("TAVERN.Dialogs.PutOnTabConfirm", "Put It On The Tab"),
          cancelLabel: t("TAVERN.Cancel", "Cancel")
        });
        if (!confirm) return;
        payWithDrink = true;
      }
    }

    const updatedState = await tavernSocket.executeAsGM("playerAction", "roll", { die, payWithDrink }, game.user.id);

    if (updatedState.tableData?.gameMode === "goblin") {
      const pending = updatedState.tableData?.pendingAction;
      const isPendingHold = pending === "goblin_hold" && updatedState.tableData?.currentPlayer === game.user.id;
      if (isPendingHold) {
        const decision = await showGoblinHoldDialog();
        if (decision === "hold") {
          await tavernSocket.executeAsGM("playerAction", "hold", {}, game.user.id);
        } else {
          await tavernSocket.executeAsGM("playerAction", "goblinContinue", {}, game.user.id);
        }
      }
      return;
    }

    await delay(TIMING.CHEAT_WINDOW_DELAY);

    const myRolls = updatedState.tableData?.rolls?.[game.user.id] ?? [];
    const lastDieIndex = myRolls.length - 1;
    const cheatIsHouse = isActingAsHouse(game.user.id, updatedState);
    const lastDie = myRolls[lastDieIndex];
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
      } catch (error) {
        console.error("Tavern | Cheat Dialog Failed:", error);
        if (updatedState.tableData?.phase === "betting") {
          await tavernSocket.executeAsGM("playerAction", "finishTurn", {}, game.user.id);
        }
      }
    } else if (updatedState.tableData?.phase === "betting") {
      await tavernSocket.executeAsGM("playerAction", "finishTurn", {}, game.user.id);
    }
  });
}

export async function onToggleLiquidMode() {
  const current = game.settings.get(MODULE_ID, "liquidMode");
  await game.settings.set(MODULE_ID, "liquidMode", !current);
  renderAppIfPresent();
}

export async function onHold(AppClass) {
  await withUiLock(AppClass, async () => {
    await tavernSocket.executeAsGM("playerAction", "hold", {}, game.user.id);
  });
}

export async function onBoot(AppClass) {
  const state = getState();
  const userId = game.user.id;
  const targets = getValidBootTargets(state, userId);
  if (targets.length === 0) return ui.notifications.warn(t("TAVERN.Notifications.NoBootTargets", "No held players to boot."));

  await withUiLock(AppClass, async () => {
    const result = await BootDialog.show({
      targets,
      boots: state.tableData?.goblinBoots?.[userId] ?? 0
    });
    if (result) {
      await tavernSocket.executeAsGM("playerAction", "boot", result, game.user.id);
    }
  });
}

export async function onHelp() {
  new HelpDialog().render(true);
}

export async function onFold(AppClass) {
  await withUiLock(AppClass, async () => {
    await tavernSocket.executeAsGM("playerAction", "fold", {}, game.user.id);
  });
}

export async function onUseCut(AppClass, event, target) {
  await withUiLock(AppClass, async () => {
    const reroll = target?.dataset?.reroll === "true";
    await tavernSocket.executeAsGM("playerAction", "useCut", { reroll }, game.user.id);
  });
}

export async function onHunch(AppClass) {
  await withUiLock(AppClass, async () => {
    await tavernSocket.executeAsGM("playerAction", "hunch", {}, game.user.id);
  });
}

export async function onProfile(AppClass) {
  if (!requireAssignedCharacter("TAVERN.Actions.Profile", "Profile")) return;
  const state = getState();
  const userId = game.user.id;
  const targets = getValidProfileTargets(state, userId);
  if (targets.length === 0) return ui.notifications.warn(t("TAVERN.Notifications.NoProfileTargets", "No valid targets to profile."));

  await withUiLock(AppClass, async () => {
    const result = await ProfileDialog.show({
      targets,
      actor: game.user.character,
      invMod: game.user.character?.system?.skills?.inv?.total ?? 0
    });

    if (result) {
      await tavernSocket.executeAsGM("playerAction", "profile", result, game.user.id);
    }
  });
}

export async function onCheat(AppClass) {
  if (!requireAssignedCharacter("TAVERN.Actions.Cheat", "Cheat")) return;
  const state = getState();
  const userId = game.user.id;
  const myRolls = state.tableData?.rolls?.[userId] ?? [];
  const lastDie = myRolls[myRolls.length - 1];

  if (myRolls.length === 0) return ui.notifications.warn(t("TAVERN.Notifications.NoCheatDice", "You have no dice to cheat with!"));
  if (lastDie?.blind) return ui.notifications.warn(t("TAVERN.Notifications.CannotCheatBlind", "You cannot cheat a blind die."));

  await withUiLock(AppClass, async () => {
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
  });
}

export async function onAccuse(AppClass) {
  const state = getState();
  const ante = game.settings.get(MODULE_ID, "fixedAnte");

  const appElement = game.tavernDiceMaster?.app?.element;
  const selectedPortrait = appElement?.querySelector(".accuse-portrait.selected") ?? document.querySelector(".accuse-portrait.selected");
  const targetId = selectedPortrait?.dataset?.targetId;
  if (!targetId) return ui.notifications.warn(t("TAVERN.Notifications.SelectAccuseTarget", "Select a player to accuse."));

  const targetName = selectedPortrait.dataset.targetName ?? "Unknown";
  const targetRolls = state.tableData?.rolls?.[targetId] ?? [];
  if (targetRolls.length === 0) return ui.notifications.warn(t("TAVERN.Notifications.NoAccuseDice", "That player has no dice to accuse."));

  await withUiLock(AppClass, async () => {
    const result = await AccuseDialog.show({
      targetName,
      targetId,
      rolls: targetRolls,
      ante
    });

    if (result) {
      await tavernSocket.executeAsGM("playerAction", "accuse", result, game.user.id);
    }
  });
}

export async function onGoad(AppClass) {
  if (!requireAssignedCharacter("TAVERN.Actions.Goad", "Goad")) return;
  const state = getState();
  const userId = game.user.id;
  const targets = getValidGoadTargets(state, userId);
  if (targets.length === 0) return ui.notifications.warn(t("TAVERN.Notifications.NoGoadTargets", "No valid targets to goad."));

  await withUiLock(AppClass, async () => {
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
  });
}

export async function onBumpTable(AppClass) {
  if (!requireAssignedCharacter("TAVERN.Actions.Bump", "Bump")) return;
  const state = getState();
  const userId = game.user.id;
  const targets = getValidBumpTargets(state, userId);
  if (targets.length === 0) return ui.notifications.warn(t("TAVERN.Notifications.NoBumpTargets", "No valid targets to bump."));

  await withUiLock(AppClass, async () => {
    const result = await BumpDialog.show({
      targets,
      actor: game.user.character,
      athMod: game.user.character?.system?.skills?.ath?.total ?? 0
    });

    if (result) {
      await tavernSocket.executeAsGM("playerAction", "bumpTable", result, game.user.id);
    }
  });
}

export async function onBumpRetaliation(AppClass, event, target) {
  const dieIndex = parseInt(target?.dataset?.dieIndex);
  if (isNaN(dieIndex)) return ui.notifications.warn(t("TAVERN.Notifications.InvalidDieSelection", "Invalid die selection."));

  await withUiLock(AppClass, async () => {
    await tavernSocket.executeAsGM("playerAction", "bumpRetaliation", { dieIndex }, game.user.id);
  });
}

export async function onSkipInspection(AppClass) {
  await withUiLock(AppClass, async () => {
    await tavernSocket.executeAsGM("playerAction", "skipInspection", {}, game.user.id);
  });
}

export async function onReveal(AppClass) {
  await withUiLock(AppClass, async () => {
    await tavernSocket.executeAsGM("playerAction", "reveal", {}, game.user.id);
  });
}

export async function onNewRound(AppClass) {
  await withUiLock(AppClass, async () => {
    await tavernSocket.executeAsGM("playerAction", "newRound", {}, game.user.id);
  });
}

export async function onReset(AppClass) {
  await withUiLock(AppClass, async () => {
    const confirm = await ConfirmDialog.show({
      icon: "fa-solid fa-rotate-left",
      titleText: t("TAVERN.Dialogs.ResetTableTitle", "Reset Table"),
      lines: [t("TAVERN.Dialogs.ResetTableBody", "Clear all players and reset the table?")],
      tone: "danger",
      confirmLabel: t("TAVERN.Dialogs.ResetTableConfirm", "Reset Table"),
      cancelLabel: t("TAVERN.Cancel", "Cancel")
    });
    if (confirm) {
      await tavernSocket.executeAsGM("resetTable");
    }
  });
}

export async function onDuelRoll(AppClass) {
  await withUiLock(AppClass, async () => {
    await tavernSocket.executeAsGM("playerAction", "duelRoll", {}, game.user.id);
  });
}

export async function onSideBet(AppClass) {
  const state = getState();
  const tableData = state.tableData ?? {};
  const ante = game.settings.get(MODULE_ID, "fixedAnte");

  const champions = state.turnOrder
    .filter(id => !tableData.busts?.[id] && !tableData.caught?.[id])
    .map(id => {
      const actor = game.users.get(id)?.character;
      const img = actor?.img || game.users.get(id)?.avatar || "icons/svg/mystery-man.svg";
      const name = state.players?.[id]?.name ?? game.users.get(id)?.name ?? "Unknown";
      const visibleTotal = tableData.visibleTotals?.[id] ?? 0;
      return { id, name, img, visibleTotal };
    });

  if (champions.length === 0) return ui.notifications.warn(t("TAVERN.Notifications.NoSideBetTargets", "No valid players to bet on."));

  await withUiLock(AppClass, async () => {
    const result = await SideBetDialog.show({ champions, ante });
    if (result) {
      await tavernSocket.executeAsGM("playerAction", "sideBet", result, game.user.id);
    }
  });
}
