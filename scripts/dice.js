export async function showSecretRoll(roll, userId) {
  if (!game.dice3d) return;
  const user = game.users.get(userId);
  if (!user) return;
  await game.dice3d.showForRoll(roll, user, true, [userId]);
}

export async function showPublicRoll(roll, userId) {
  if (!game.dice3d) return;
  const user = game.users.get(userId);
  if (!user) return;
  await game.dice3d.showForRoll(roll, user, true);
}
