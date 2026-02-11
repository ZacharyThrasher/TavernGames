export function calculateBettingOrderByVisibleTotals(turnOrder = [], visibleTotals = {}) {
  return [...turnOrder].sort((a, b) => {
    const totalA = Number(visibleTotals?.[a] ?? 0);
    const totalB = Number(visibleTotals?.[b] ?? 0);
    return totalA - totalB;
  });
}
