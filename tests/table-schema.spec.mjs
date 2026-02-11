import assert from "node:assert/strict";

import { emptyTableData } from "../scripts/twenty-one/constants.js";
import { normalizeTableData } from "../scripts/state.js";

export function runTableSchemaSpec() {
  {
    const table = emptyTableData();
    assert.ok(table.coreState);
    assert.ok(table.skillState);
    assert.ok(table.sideBetState);
    assert.ok(table.goblinState);
    assert.ok(table.cutState);
    assert.deepEqual(table.totals, {});
  }

  {
    const normalized = normalizeTableData({
      coreState: {
        totals: { a: 12 },
        visibleTotals: { a: 7 },
        phase: "betting",
        gameMode: "standard"
      },
      skillState: {
        hasActed: { a: true },
        usedSkills: { a: { hunch: true } }
      },
      sideBetState: {
        sideBetPool: 99,
        sideBets: { a: [{ championId: "b", amount: 5 }] }
      }
    });

    assert.equal(normalized.totals.a, 12);
    assert.equal(normalized.visibleTotals.a, 7);
    assert.equal(normalized.phase, "betting");
    assert.equal(normalized.hasActed.a, true);
    assert.equal(normalized.sideBetPool, 99);
    assert.ok(normalized.coreState);
    assert.ok(normalized.skillState);
    assert.ok(normalized.sideBetState);
  }
}
