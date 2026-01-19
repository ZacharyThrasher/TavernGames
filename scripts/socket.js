import { MODULE_ID } from "./state.js";
import { handleJoinTable, handleLeaveTable, handleStartRound, handlePlayerAction, handleResetTable } from "./tavern-actions.js";

export let tavernSocket;

export function setupSockets() {
  tavernSocket = socketlib.registerModule(MODULE_ID);
  tavernSocket.register("joinTable", handleJoinTable);
  tavernSocket.register("leaveTable", handleLeaveTable);
  tavernSocket.register("startRound", handleStartRound);
  tavernSocket.register("playerAction", handlePlayerAction);
  tavernSocket.register("resetTable", handleResetTable);
}
