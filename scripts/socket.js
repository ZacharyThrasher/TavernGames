import { MODULE_ID } from "./state.js";
import { handleJoinTable, handleLeaveTable, handleStartRound, handlePlayerAction, handleResetTable } from "./tavern-actions.js";
import { showRollToUser } from "./dice.js";
import TavernApp from "./app/tavern-app.js";

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

  // V3.5: Juice & Drama Effects
  tavernSocket.register("triggerShake", TavernApp.triggerShake);
  tavernSocket.register("showWinnerBanner", TavernApp.showWinnerBanner);
}
