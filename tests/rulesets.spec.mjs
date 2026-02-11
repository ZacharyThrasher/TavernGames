import assert from "node:assert/strict";

import { summarizeDuelRolls } from "../scripts/twenty-one/rules/duel-rules.js";
import { computeGoblinStageAdvance } from "../scripts/twenty-one/rules/goblin-rules.js";
import { calculateBettingOrderByVisibleTotals } from "../scripts/twenty-one/rules/turn-order.js";

export function runRulesetsSpec() {
  {
    const turnOrder = ["a", "b", "c"];
    const tableData = {
      bettingOrder: [...turnOrder],
      holds: { a: true },
      busts: {},
      folded: {},
      caught: {},
      goblinStageRemaining: [],
      goblinSuddenDeathActive: false,
      goblinStageIndex: 0,
      goblinStageDie: 20,
      currentPlayer: "a",
    };

    const advanced = computeGoblinStageAdvance(turnOrder, tableData);
    assert.equal(advanced.action, "stage-advance");
    assert.equal(advanced.tableData.goblinStageDie, 12);
    assert.equal(advanced.tableData.goblinStageIndex, 1);
    assert.deepEqual(advanced.tableData.goblinStageRemaining, ["b", "c"]);
    assert.equal(advanced.tableData.currentPlayer, "b");
  }

  {
    const turnOrder = ["a", "b"];
    const tableData = {
      bettingOrder: [...turnOrder],
      holds: { b: true },
      busts: {},
      folded: {},
      caught: {},
      goblinStageRemaining: [],
      goblinSuddenDeathActive: false,
      goblinStageIndex: 5,
      goblinStageDie: 4,
      currentPlayer: "b",
    };

    const advanced = computeGoblinStageAdvance(turnOrder, tableData);
    assert.equal(advanced.action, "coin-start");
    assert.equal(advanced.tableData.goblinSuddenDeathActive, true);
    assert.equal(advanced.tableData.goblinStageDie, 2);
    assert.deepEqual(advanced.tableData.goblinStageRemaining, ["a"]);
    assert.equal(advanced.tableData.currentPlayer, "a");
  }

  {
    const turnOrder = ["a", "b"];
    const tableData = {
      bettingOrder: [...turnOrder],
      holds: { a: true, b: true },
      busts: {},
      folded: {},
      caught: {},
      goblinStageRemaining: [],
      goblinSuddenDeathActive: true,
      goblinStageDie: 2,
      currentPlayer: "b",
    };

    const advanced = computeGoblinStageAdvance(turnOrder, tableData);
    assert.equal(advanced.action, "finish");
  }

  {
    const summary = summarizeDuelRolls(
      {
        a: { total: 18, d20: 14, d4Bonus: 4, hits: 1 },
        b: { total: 18, d20: 16, d4Bonus: 2, hits: 1 },
        c: { total: 11, d20: 11, d4Bonus: 0, hits: 0 }
      },
      {
        getNameForUserId: (id) => `name-${id}`,
        getSafeNameForUserId: (id) => `safe-${id}`
      }
    );

    assert.equal(summary.highestTotal, 18);
    assert.equal(summary.isTie, true);
    assert.deepEqual(summary.winners.map((winner) => winner.playerId).sort(), ["a", "b"]);
    assert.equal(summary.results[0].playerName, "name-a");
    assert.equal(summary.results[0].safePlayerName, "safe-a");
  }

  {
    const summary = summarizeDuelRolls({ a: { total: 22 }, b: { total: 21 } });
    assert.equal(summary.highestTotal, 22);
    assert.equal(summary.isTie, false);
    assert.equal(summary.winners.length, 1);
    assert.equal(summary.winners[0].playerId, "a");
  }

  {
    const order = calculateBettingOrderByVisibleTotals(
      ["a", "b", "c"],
      { a: 7, b: 4, c: 7 }
    );
    assert.deepEqual(order, ["b", "a", "c"]);
  }
}
