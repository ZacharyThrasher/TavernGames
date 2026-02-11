import assert from "node:assert/strict";

import {
  applyStandardRerollToTable,
  calculateStandardTotal,
  calculateVisibleTotal,
  classifyHunchPrediction,
  resolveContest,
  rerollDieAtIndex
} from "../scripts/twenty-one/rules/pure-rules.js";

export function runPureRulesSpec() {
  {
    const nat1Failure = resolveContest({ attackerTotal: 99, defenderTotal: 1, isNat1: true });
    const normalSuccess = resolveContest({ attackerTotal: 15, defenderTotal: 10, isNat1: false });
    const tieFailure = resolveContest({ attackerTotal: 10, defenderTotal: 10, isNat1: false });

    assert.equal(nat1Failure.success, false);
    assert.equal(normalSuccess.success, true);
    assert.equal(tieFailure.success, false);
  }

  {
    const rolls = [
      { die: 6, result: 2, public: true },
      { die: 10, result: 9, public: false }
    ];
    const rerolled = rerollDieAtIndex(rolls, 1, 42);

    assert.equal(rerolled.newValue, 10);
    assert.equal(rerolled.oldValue, 9);
    assert.equal(rerolled.rolls[0].result, 2);
    assert.equal(rerolled.rolls[1].result, 10);
  }

  {
    const rolls = [
      { die: 6, result: 5, public: true, blind: false },
      { die: 8, result: 4, public: false, blind: false },
      { die: 10, result: 7, public: true, blind: true }
    ];

    assert.equal(calculateStandardTotal(rolls), 16);
    assert.equal(calculateVisibleTotal(rolls), 5);
  }

  {
    const tableData = {
      rolls: {
        p1: [
          { die: 10, result: 4, public: true },
          { die: 6, result: 3, public: false }
        ]
      },
      totals: { p1: 7 },
      visibleTotals: { p1: 4 }
    };

    const updated = applyStandardRerollToTable(tableData, "p1", 0, 9);
    assert.equal(updated.totals.p1, 12);
    assert.equal(updated.visibleTotals.p1, 9);
    assert.equal(updated.busted, false);
  }

  {
    assert.equal(classifyHunchPrediction(10, 6), "HIGH");
    assert.equal(classifyHunchPrediction(10, 5), "LOW");
    assert.equal(classifyHunchPrediction(4, 1), "LOW");
  }
}
