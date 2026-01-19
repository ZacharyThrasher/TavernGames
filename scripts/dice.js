/**
 * Show a roll to a specific user using Dice So Nice.
 * This should be called on the user's client, not the GM's.
 * @param {Object} rollData - { formula, total, die, result }
 */
export async function showRollToUser(rollData) {
  if (!game.dice3d) return;
  
  // Create a roll object from the data
  const roll = Roll.fromData({
    formula: rollData.formula,
    terms: [{
      class: "Die",
      options: {},
      evaluated: true,
      number: 1,
      faces: rollData.die,
      results: [{ result: rollData.result, active: true }]
    }],
    total: rollData.result,
    evaluated: true
  });
  
  // Show to current user (this function runs on their client)
  await game.dice3d.showForRoll(roll, game.user, true);
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
