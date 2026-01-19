import { MODULE_ID } from "./state.js";

function getActorForUser(userId) {
  const user = game.users.get(userId);
  if (!user) return null;
  const actorId = user.character?.id;
  if (!actorId) return null;
  return game.actors.get(actorId) ?? null;
}

export function canAffordAnte(state, ante) {
  for (const userId of state.turnOrder) {
    const actor = getActorForUser(userId);
    if (!actor) {
      return { ok: false, name: game.users.get(userId)?.name ?? "Unknown" };
    }
    const gp = actor.system?.currency?.gp ?? 0;
    if (gp < ante) {
      return { ok: false, name: actor.name };
    }
  }
  return { ok: true };
}

export async function deductAnteFromActors(state, ante) {
  for (const userId of state.turnOrder) {
    const actor = getActorForUser(userId);
    if (!actor) continue;
    const current = actor.system?.currency?.gp ?? 0;
    await actor.update({ "system.currency.gp": current - ante });
  }

  if (game.user.isGM) {
    const gmActor = game.user.character;
    if (gmActor) {
      const current = gmActor.system?.currency?.gp ?? 0;
      await gmActor.update({ "system.currency.gp": current - ante });
    }
  }
}

export async function payOutWinners(winners, share) {
  for (const userId of winners) {
    const actor = getActorForUser(userId);
    if (!actor) continue;
    const current = actor.system?.currency?.gp ?? 0;
    await actor.update({ "system.currency.gp": current + share });
  }
}
