import { tavernSocket } from "../../socket.js";
import { fireAndForget, withWarning } from "./runtime.js";

export function announceSkillCutIn(type, userId, targetId = null, warning = "Could not show skill cut-in") {
  fireAndForget(warning, tavernSocket.executeForEveryone("showSkillCutIn", type, userId, targetId));
}

export function announceSkillResultOverlay(type, userId, targetId, resultData, warning = "Could not show skill result overlay") {
  fireAndForget(warning, tavernSocket.executeForEveryone("showSkillResult", type, userId, targetId, resultData));
}

export async function announceSkillBannerToUser(userId, payload, warning = "Could not show skill banner") {
  await withWarning(warning, () => tavernSocket.executeAsUser("showSkillBanner", userId, payload));
}
