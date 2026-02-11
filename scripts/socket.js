import { MODULE_ID } from "./twenty-one/constants.js";
import { handleJoinTable, handleLeaveTable, handleStartRound, handlePlayerAction, handleResetTable, handleMarkLogsAsSeen } from "./tavern-actions.js";
import { showRollToUser, showPublicRollFromData } from "./dice.js";
import { showVictoryFanfare, showBustFanfare, showCoinFlip, playBumpEffect, showFloatingText, showSkillCutIn, showSkillResult, showPrivateFeedback, showImpactRing, showFullSetBurst, showCheatResult, showSkillBanner, showDrinkResult, showCutOffBanner, showScoreSurge, showPotPulse, showJackpotInlay, showVignetteFlash } from "./ui/fx.js";
import { queueDiceReveal } from "./ui/dice-reveal.js";

export let tavernSocket;

// Client-side function to show notification to specific user
function showNotification(message, type = "warn") {
  ui.notifications[type]?.(message) ?? ui.notifications.warn(message);
}

export function setupSockets() {
  tavernSocket = socketlib.registerModule(MODULE_ID);
  tavernSocket.register("joinTable", handleJoinTable);
  tavernSocket.register("leaveTable", handleLeaveTable);
  tavernSocket.register("startRound", handleStartRound);
  tavernSocket.register("playerAction", handlePlayerAction);
  tavernSocket.register("resetTable", handleResetTable);
  tavernSocket.register("markLogsAsSeen", handleMarkLogsAsSeen);

  // Register client-side function for showing dice rolls
  tavernSocket.register("showRoll", showRollToUser);
  tavernSocket.register("showPublicRollFromData", ({ die, result, userId }) => showPublicRollFromData(Number(die), Number(result), userId));

  // Register client-side function for showing notifications to specific users
  tavernSocket.register("showNotification", showNotification);
  tavernSocket.register("showVictoryFanfare", showVictoryFanfare);
  tavernSocket.register("showBustFanfare", showBustFanfare);
  tavernSocket.register("showCoinFlip", showCoinFlip);
  tavernSocket.register("showCheatResult", showCheatResult);
  tavernSocket.register("showSkillBanner", showSkillBanner);
  tavernSocket.register("showDrinkResult", showDrinkResult);
  tavernSocket.register("showCutOffBanner", showCutOffBanner);
  tavernSocket.register("showImpactRing", showImpactRing);
  tavernSocket.register("playBumpEffect", playBumpEffect);
  tavernSocket.register("showFullSetBurst", showFullSetBurst);
  tavernSocket.register("showScoreSurge", showScoreSurge);
  tavernSocket.register("showPotPulse", showPotPulse);
  tavernSocket.register("showJackpotInlay", showJackpotInlay);
  tavernSocket.register("showVignetteFlash", showVignetteFlash);
  tavernSocket.register("showFloatingText", showFloatingText);
  tavernSocket.register("showSkillCutIn", showSkillCutIn);
  tavernSocket.register("showSkillResult", showSkillResult);
  tavernSocket.register("showPrivateFeedback", showPrivateFeedback);
  tavernSocket.register("showDiceReveal", queueDiceReveal);
}

