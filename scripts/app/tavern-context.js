import { getState } from "../state.js";
import { tavernSocket } from "../socket.js";
import { MODULE_ID, getDieCost } from "../twenty-one/constants.js";
import { getNpcWallet } from "../wallet.js";
import {
  getValidAccuseTargets,
  getValidBootTargets,
  getValidBumpTargets,
  getValidGoadTargets,
  getValidProfileTargets,
  getAccusationCost,
  isActingAsHouse
} from "../twenty-one/utils/game-logic.js";
import { getThemeFlavor, getAtmosphereLine, getRiskWarning } from "../ui/theme-flavor.js";
import { fireAndForget } from "../twenty-one/utils/runtime.js";
import { formatRelativeTime } from "../twenty-one/utils/time.js";

export function computeGoblinTotal(rolls, includeBlind = true) {
  let total = 0;
  let hasBlind = false;
  for (const roll of rolls) {
    if (roll.blind && !includeBlind) {
      hasBlind = true;
      continue;
    }
    if (roll.die === 2) {
      if (roll.result === 2) {
        total += roll.coinValue ?? 2;
      } else if (roll.result === 1) {
        total = 0;
        break;
      }
    } else {
      total += roll.result || 0;
    }
  }
  return { total, hasBlind };
}

export function formatCostLabel(cost, isBettingPhase) {
  if (!isBettingPhase) return "";
  if (cost === 0) return "FREE";
  return `${cost}gp`;
}

export function buildDiceArray({
  ante,
  isBettingPhase,
  isDared,
  isGoblinMode = false,
  hunchPrediction = null,
  hunchExact = null,
  liquidMode = false,
  goblinStageDie = null,
  goblinSuddenDeathActive = false
}) {
  const diceConfig = [
    { value: 20, label: "d20", icon: "d20-grey", strategy: "Hail Mary" },
    { value: 10, label: "d10", icon: "d10-grey", strategy: "Builder" },
    { value: 8, label: "d8", icon: "d8-grey", strategy: "Standard" },
    { value: 6, label: "d6", icon: "d6-grey", strategy: "Standard" },
    { value: 4, label: "d4", icon: "d4-grey", strategy: "Precision" },
  ];

  if (isGoblinMode) {
    diceConfig.splice(1, 0, { value: 12, label: "d12", icon: "d12-grey", strategy: "Wildcard" });
    diceConfig.push({ value: 2, label: "Coin", icon: "circle-dollar", strategy: "Coin Stage" });
  }

  const workingConfig = isGoblinMode && goblinStageDie
    ? diceConfig.filter(d => d.value === goblinStageDie)
    : diceConfig;

  return workingConfig.map(d => {
    let cost = getDieCost(d.value, ante);
    let costLabel = formatCostLabel(cost, isBettingPhase);
    let disabled = false;

    if (isGoblinMode) {
      cost = 0;
      costLabel = goblinSuddenDeathActive ? "COIN" : "CHAMBER";
    } else {
      if (isDared && d.value === 8) {
        cost = 0;
        costLabel = "FREE";
      }
      if (liquidMode) {
        cost = 0;
        costLabel = "FREE";
      }
    }

    const prediction = hunchPrediction?.[d.value];
    const exactValue = hunchExact?.[d.value];
    const hunchDirection = prediction === "HIGH" ? "up" : (prediction === "LOW" ? "down" : null);

    return {
      ...d,
      cost,
      costLabel,
      disabled,
      isUsed: false,
      isCoin: d.value === 2,
      hunchDirection,
      hunchExactValue: Number.isFinite(exactValue) ? exactValue : null
    };
  });
}

export function formatTimeAgo(timestamp) {
  return formatRelativeTime(timestamp);
}

export function getHistoryIcon(type) {
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

export async function prepareTavernContext(app, appClass) {
  const state = getState();
  const userId = game.user.id;
  const isInGame = Boolean(state.players?.[userId]);
  const isGM = game.user.isGM;

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

  const activeTotals = Object.entries(tableData.totals ?? {})
    .filter(([id]) => !tableData.busts?.[id] && !tableData.folded?.[id] && !tableData.caught?.[id])
    .map(([, t]) => Number(t ?? 0));
  const maxActiveTotal = activeTotals.length ? Math.max(...activeTotals) : 0;
  const autoplayState = state.autoplay ?? {};
  const strategySet = new Set(["balanced", "aggressive", "conservative", "chaotic", "duelist", "tactician", "bully"]);
  const difficultySet = new Set(["easy", "normal", "hard", "legendary"]);
  const defaultStrategy = "balanced";
  const defaultDifficulty = "normal";
  const canManageAiSeats = isGM && (state.status === "LOBBY" || state.status === "PAYOUT");
  const defaultAiWallet = Math.max(ante, ante * 20);
  const npcActorOptions = game.actors
    .filter((actor) => actor?.type === "npc")
    .map((actor) => ({ id: actor.id, name: actor.name, img: actor.img }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const playerSeats = players.map((player) => {
    const rawAutoplay = autoplayState[player.id] ?? {};
    const isAutoplayEnabled = rawAutoplay.enabled === true;
    const autoplayStrategy = strategySet.has(rawAutoplay.strategy) ? rawAutoplay.strategy : defaultStrategy;
    const autoplayDifficulty = difficultySet.has(rawAutoplay.difficulty) ? rawAutoplay.difficulty : defaultDifficulty;
    const isAi = player.isAi === true;
    const rolls = tableData.rolls?.[player.id] ?? [];
    const total = tableData.totals?.[player.id] ?? 0;
    const isHolding = tableData.holds?.[player.id] ?? false;
    const isBusted = tableData.busts?.[player.id] ?? false;
    const isCaught = tableData.caught?.[player.id] ?? false;
    const isCurrent = tableData.currentPlayer === player.id;
    const isMe = player.id === userId;
    const isSideBetWinner = tableData.sideBetWinners?.[player.id] ?? false;
    const isFolded = tableData.folded?.[player.id] ?? false;

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
          icon: appClass.DICE_ICONS[r.die] || "d6",
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
          icon: appClass.DICE_ICONS[r.die] || "d6",
          index: idx,
          isPublic: isPublicDie,
          isHole: !isPublicDie,
          isOmen,
        };
      }
      return { hidden: true, isHole: true, isOmen: false };
    });

    const visibleTotal = tableData.visibleTotals?.[player.id] ?? 0;
    const showFullTotal = isMe || isRevealPhase;

    let displayTotal = "?";
    if (showFullTotal) {
      if (isMe && !isRevealPhase) {
        let nonBlindTotal = 0;
        let hasBlind = false;

        if (isGoblinMode) {
          ({ total: nonBlindTotal, hasBlind } = computeGoblinTotal(rolls, false));
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

    let seatRiskLevel = null;
    if (isMe && state.status === "PLAYING" && !isGoblinMode && !isBusted && !isFolded && !isHolding) {
      if (total >= 20) seatRiskLevel = "critical";
      else if (total >= 18) seatRiskLevel = "hot";
      else if (total >= 16) seatRiskLevel = "warm";
    }

    const isLeading = state.status === "PLAYING" && !isGoblinMode
      && isHolding && !isBusted && !isFolded && !isCaught
      && total > 0 && total === maxActiveTotal;

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
      seatRiskLevel,
      isLeading,
      canAct: isCurrent && isMe && state.status === "PLAYING" && !isHolding && !isBusted && !tableData.pendingAction,
      isDared: tableData.dared?.[player.id] ?? false,
      isBumpLocked: tableData.pendingBumpRetaliation?.attackerId === player.id,
      isProfiled: (tableData.profiledBy?.[player.id] ?? []).length > 0,
      isAi,
      isAutoplayEnabled,
      autoplayStrategy,
      autoplayDifficulty,
      isSideBetWinner,
    };
  });

  const autoplayRows = players.map((player) => {
    const raw = autoplayState[player.id] ?? {};
    return {
      id: player.id,
      name: player.name ?? player.userName ?? "Unknown",
      enabled: raw.enabled === true,
      strategy: strategySet.has(raw.strategy) ? raw.strategy : defaultStrategy,
      difficulty: difficultySet.has(raw.difficulty) ? raw.difficulty : defaultDifficulty,
      isAi: player.isAi === true,
      canRemove: player.isAi === true && canManageAiSeats
    };
  });
  autoplayRows.sort((a, b) => {
    if (a.isAi !== b.isAi) return a.isAi ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
  const autoplayEnabledCount = autoplayRows.filter((row) => row.enabled).length;
  const aiSeatCount = autoplayRows.filter((row) => row.isAi).length;

  const currentPlayer = players.find(p => p.id === tableData.currentPlayer);
  const myTurn = tableData.currentPlayer === userId;

  const phase = tableData.phase ?? "opening";
  const isOpeningPhase = phase === "opening";
  const isBettingPhase = phase === "betting";
  const isCutPhase = phase === "cut";

  const goblinStageDie = isGoblinMode ? (tableData.goblinStageDie ?? 20) : null;
  const goblinStageIndex = isGoblinMode ? (tableData.goblinStageIndex ?? 0) : null;
  const goblinSuddenDeathActive = tableData.goblinSuddenDeathActive ?? false;
  const goblinStageLabel = isGoblinMode
    ? (goblinSuddenDeathActive ? "Chamber: Coin" : `Chamber: d${goblinStageDie}`)
    : null;

  const theCutPlayer = tableData.theCutPlayer;
  const isTheCutPlayer = theCutPlayer === userId;
  const theCutPlayerName = theCutPlayer
    ? (state.players?.[theCutPlayer]?.name ?? game.users.get(theCutPlayer)?.character?.name ?? game.users.get(theCutPlayer)?.name ?? "Unknown")
    : null;

  const myRolls = tableData.rolls?.[userId] ?? [];
  const isFolded = tableData.folded?.[userId] ?? false;
  const isBusted = tableData.busts?.[userId] ?? false;
  const hasActed = tableData.hasActed?.[userId] ?? false;
  let canHold = myTurn && isBettingPhase && !isCutPhase && !tableData.hunchLocked?.[userId];
  let holdDisabledReason = "You cannot hold right now.";
  if (isGoblinMode) {
    const myRollCount = (tableData.rolls?.[userId] ?? []).length;
    const activeIds = state.turnOrder.filter(id => !tableData.busts?.[id] && !tableData.folded?.[id] && !tableData.caught?.[id]);
    const maxTotal = activeIds.length
      ? Math.max(...activeIds.map(id => Number(tableData.totals?.[id] ?? 0)))
      : 0;
    const myTotal = Number(tableData.totals?.[userId] ?? 0);
    const isLeader = myTotal >= maxTotal;
    canHold = myTurn
      && isBettingPhase
      && !isCutPhase
      && !tableData.hunchLocked?.[userId]
      && myRollCount > 0
      && isLeader
      && !isFolded
      && !isBusted;

    if (myRollCount === 0) holdDisabledReason = "You must roll before holding.";
    else if (!isLeader) holdDisabledReason = "Only the current leader can Hold.";
  }
  const openingRollsRemaining = Math.max(0, 2 - myRolls.length);
  const myTotal = tableData.totals?.[userId] ?? 0;
  let riskLevel = null;
  if (myTurn && isBettingPhase && !isGoblinMode) {
    if (myTotal >= 20) riskLevel = "critical";
    else if (myTotal >= 18) riskLevel = "hot";
    else if (myTotal >= 16) riskLevel = "warm";
  }

  const hunchLocked = tableData.hunchLocked?.[userId] ?? false;
  const hunchLockedDie = tableData.hunchLockedDie?.[userId] ?? null;

  const hasGoadedThisRound = tableData.goadedThisRound?.[userId] ?? tableData.usedSkills?.[userId]?.goad ?? false;
  const canGoad = !isGoblinMode && isBettingPhase && !isCutPhase && myTurn && isInGame && !(tableData.busts?.[userId]) && !isFolded && !isHouse && !hasGoadedThisRound && !tableData.skillUsedThisTurn;
  const goadTargets = canGoad ? getValidGoadTargets(state, userId) : [];

  const canCheat = !isGoblinMode && state.status === "PLAYING" && state.players?.[userId] && myRolls.length > 0 && !tableData.busts?.[userId] && !isHouse;
  const myDiceForCheat = canCheat ? myRolls.map((r, idx) => ({
    index: idx,
    die: r.die,
    result: r.result,
    maxValue: r.die,
  })) : [];

  const isInspection = state.status === "INSPECTION";
  const accusedThisRound = tableData.accusedThisRound?.[userId] ?? false;
  const accusationCost = getAccusationCost(ante);
  const accuseTargets = !accusedThisRound ? getValidAccuseTargets(state, userId, accusedThisRound) : [];

  const isRoundPhase = ["PLAYING", "INSPECTION"].includes(state.status);
  const canAccuse = !isGoblinMode && isInGame && !accusedThisRound && !isBusted && accuseTargets.length > 0 && isRoundPhase && !isHouse;

  const isHolding = tableData.holds?.[userId] ?? false;
  const hasHunched = tableData.usedSkills?.[userId]?.hunch ?? false;
  const canHunch = !isGoblinMode && isBettingPhase && !isCutPhase && myTurn && isInGame && !isBusted && !isFolded && !isHolding && !isHouse && !hunchLocked && !tableData.skillUsedThisTurn && !hasHunched;

  const hasProfiled = tableData.usedSkills?.[userId]?.profile ?? false;
  const profileTargets = (!isGoblinMode && isBettingPhase && !isCutPhase && myTurn && !isBusted && !isFolded && !isHouse && !tableData.skillUsedThisTurn && !hasProfiled)
    ? getValidProfileTargets(state, userId) : [];
  const canProfile = profileTargets.length > 0;

  const hasBumpedThisRound = tableData.bumpedThisRound?.[userId] ?? tableData.usedSkills?.[userId]?.bump ?? false;
  const canBump = !isGoblinMode && isBettingPhase && !isCutPhase && myTurn && isInGame && !isBusted && !isHolding && !isHouse && !hasBumpedThisRound && !tableData.skillUsedThisTurn;
  const bumpTargets = canBump ? getValidBumpTargets(state, userId) : [];

  const goblinBoots = tableData.goblinBoots?.[userId] ?? 0;
  const bootTargets = (isGoblinMode && myTurn && isBettingPhase && !isHouse && !isBusted && !isFolded)
    ? getValidBootTargets(state, userId)
    : [];
  const canBoot = isGoblinMode && myTurn && isBettingPhase && goblinBoots > 0 && bootTargets.length > 0 && !isHouse && !isBusted && !isFolded;

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

  const isBumpLocked = tableData.pendingBumpRetaliation?.attackerId === userId;
  const retaliationTargetName = tableData.pendingBumpRetaliation
    ? (state.players?.[tableData.pendingBumpRetaliation.targetId]?.name ?? "Unknown")
    : null;

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
      timeAgo: formatTimeAgo(entry.timestamp),
      icon: getHistoryIcon(entry.type),
      chipLabel: chip?.label ?? null,
      chipClass: chip?.class ?? null,
    };
  });

  const myPrivateLogs = (state.privateLogs?.[userId] ?? []).slice().reverse().map(entry => ({
    ...entry,
    timeAgo: formatTimeAgo(entry.timestamp)
  }));

  const logWindow = game.tavernDiceMaster?.logsWindow;
  const isLogsOpen = logWindow && logWindow.rendered;
  const unreadCount = (state.privateLogs?.[userId] ?? []).filter(l => !l.seen).length;
  const hasUnreadLogs = unreadCount > 0 && !isLogsOpen;

  if (isLogsOpen && unreadCount > 0) {
    setTimeout(() => {
      if (game.user.isGM) {
        import("../state.js").then(({ markLogsAsSeen }) => {
          markLogsAsSeen(userId);
        });
      } else {
        fireAndForget("Could not mark logs as seen", tavernSocket.executeAsGM("markLogsAsSeen", userId));
      }
    }, 500);
  }

  const currentTheme = game.settings.get(MODULE_ID, "tableTheme") ?? "sword-coast";
  const flavor = getThemeFlavor(currentTheme);

  let potTier = "calm";
  const isActiveRound = ["PLAYING", "INSPECTION", "DUEL", "REVEALING"].includes(state.status);
  const potRatio = state.pot / Math.max(ante, 1);
  if (isActiveRound && state.pot > 0) {
    if (potRatio > 8) potTier = "blazing";
    else if (potRatio > 4) potTier = "heated";
    else if (potRatio > 0) potTier = "warm";
  }

  return {
    moduleId: MODULE_ID,
    state,
    isPlayingAsNpc,
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
    holdDisabledReason,
    canCheat,
    myDiceForCheat,
    canAccuse,
    accuseTargets,
    canGoad,
    goadTargets,
    canBump,
    bumpTargets,
    canBoot,
    bootTargets,
    goblinBoots,
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
    privateLogs: myPrivateLogs,
    unreadLogsCount: unreadCount,
    hasUnreadLogs,
    isDuel: state.status === "DUEL",
    duel: tableData.duel ?? null,
    isMyDuel: (tableData.duel?.pendingRolls ?? []).includes(userId),
    duelParticipants: (tableData.duel?.participants ?? []).map(id => ({
      id,
      name: state.players?.[id]?.name ?? game.users.get(id)?.character?.name ?? game.users.get(id)?.name ?? "Unknown",
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
    autoplayRows,
    autoplayEnabledCount,
    aiSeatCount,
    canManageAiSeats,
    npcActorOptions,
    hasNpcActorOptions: npcActorOptions.length > 0,
    defaultAiWallet,
    uiLocked: appClass.uiLocked,
    tableTheme: currentTheme,

    flavorSubtitle: flavor.subtitle,
    flavorIcon: flavor.icon,
    flavorEmptyTitle: flavor.emptyTitle,
    flavorEmptyText: flavor.emptyText,
    flavorEmptyIcon: flavor.emptyIcon,
    potTier,
    atmosphereLine: getAtmosphereLine(currentTheme, state.status),
    riskWarningText: getRiskWarning(currentTheme, riskLevel),

    gameMode,
    isGoblinMode,
    goblinStageDie,
    goblinStageIndex,
    goblinStageLabel,
    goblinSuddenDeathActive,
    dice: buildDiceArray({
      ante,
      isBettingPhase: isBettingPhase || isCutPhase,
      isDared: tableData.dared?.[userId] ?? false,
      isGoblinMode: state.tableData?.gameMode === "goblin",
      hunchPrediction: tableData.hunchPrediction?.[userId] ?? null,
      hunchExact: tableData.hunchExact?.[userId] ?? null,
      liquidMode,
      goblinStageDie,
      goblinSuddenDeathActive
    })
  };
}
