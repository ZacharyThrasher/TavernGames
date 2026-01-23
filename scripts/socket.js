import { MODULE_ID } from "./state.js";
import { handleJoinTable, handleLeaveTable, handleStartRound, handlePlayerAction, handleResetTable } from "./tavern-actions.js";
import { showRollToUser } from "./dice.js";
import { showVictoryFanfare, showBustFanfare, playBumpEffect, showFloatingText, showSkillCutIn, showSkillResult, showPrivateFeedback } from "./ui/fx.js";

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

  // Register client-side function for showing dice rolls
  tavernSocket.register("showRoll", showRollToUser);

  // Register client-side function for showing notifications to specific users
  tavernSocket.register("showNotification", showNotification);
  tavernSocket.register("showVictoryFanfare", showVictoryFanfare);
  tavernSocket.register("showBustFanfare", showBustFanfare);
  tavernSocket.register("playBumpEffect", playBumpEffect);
  tavernSocket.register("showFloatingText", showFloatingText);
  tavernSocket.register("showSkillCutIn", showSkillCutIn);
  // V4.7.6: Result Overlay
  tavernSocket.register("showSkillResult", showSkillResult);
  // V4.9: Secret Private Feedback
  tavernSocket.register("showPrivateFeedback", showPrivateFeedback);
}
