/**
 * Show a roll to the current user ONLY using Dice So Nice.
 * This should be called on the user's client via socketlib.
 * @param {Object} rollData - { formula, die, result }
 */
export async function showRollToUser(rollData) {
  if (!game.dice3d) return;
  
  // Create and evaluate a fresh roll on this client
  const roll = new Roll(`1d${rollData.die}`);
  await roll.evaluate();
  
  // Override the result to match the actual roll from the server
  if (roll.terms?.[0]?.results?.[0]) {
    roll.terms[0].results[0].result = rollData.result;
    roll._total = rollData.result;
  }
  
  // Show ONLY to this user (whisper to self, don't sync to others)
  // The 4th param is whisper targets - only show to current user
  // The 5th param is blind - set false so user can see
  await game.dice3d.showForRoll(roll, game.user, false, [game.user.id]);
}

/**
 * Show a roll publicly to everyone using Dice So Nice.
 * @param {Roll} roll - Foundry Roll object
 * @param {string} userId - User who made the roll
 */
export async function showPublicRoll(roll, userId) {
  if (!game.dice3d) return;
  const user = game.users.get(userId);
  if (!user) return;
  await game.dice3d.showForRoll(roll, user, true);
}
