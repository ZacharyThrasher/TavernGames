function toSafeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function summarizeDuelRolls(
  duelRolls = {},
  {
    getNameForUserId = (userId) => userId,
    getSafeNameForUserId = (userId) => userId
  } = {}
) {
  const results = Object.entries(duelRolls ?? {}).map(([playerId, rollData]) => ({
    playerId,
    playerName: getNameForUserId(playerId),
    safePlayerName: getSafeNameForUserId(playerId),
    total: toSafeNumber(rollData?.total),
    d20: toSafeNumber(rollData?.d20),
    d4Bonus: toSafeNumber(rollData?.d4Bonus),
    hits: toSafeNumber(rollData?.hits)
  }));

  if (results.length === 0) {
    return {
      highestTotal: 0,
      results: [],
      winners: [],
      isTie: false
    };
  }

  const highestTotal = Math.max(...results.map((result) => result.total));
  const winners = results.filter((result) => result.total === highestTotal);

  return {
    highestTotal,
    results,
    winners,
    isTie: winners.length > 1
  };
}
