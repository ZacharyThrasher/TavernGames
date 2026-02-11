import assert from "node:assert/strict";

import {
  applyStandardRerollToTable,
  resolveContest
} from "../scripts/twenty-one/rules/pure-rules.js";

export function runFlowRulesSpec() {
  {
    const tableData = {
      rolls: {
        target: [
          { die: 20, result: 10, public: true },
          { die: 10, result: 9, public: false }
        ]
      },
      totals: { target: 19 },
      visibleTotals: { target: 10 }
    };

    const contest = resolveContest({
      attackerTotal: 18,
      defenderTotal: 12,
      isNat1: false
    });
    assert.equal(contest.success, true);

    const updated = applyStandardRerollToTable(tableData, "target", 1, 10);
    assert.equal(updated.totals.target, 20);
    assert.equal(updated.visibleTotals.target, 10);
    assert.equal(updated.busted, false);

    const busted = applyStandardRerollToTable(updated, "target", 0, 20);
    assert.equal(busted.totals.target, 30);
    assert.equal(busted.visibleTotals.target, 20);
    assert.equal(busted.busted, true);
  }

  {
    const outcome = resolveContest({
      attackerTotal: 25,
      defenderTotal: 2,
      isNat1: true
    });

    assert.equal(outcome.success, false);
    assert.equal(outcome.outcome, "failure");
  }
}
