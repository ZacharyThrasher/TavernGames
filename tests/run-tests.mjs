import { runFlowRulesSpec } from "./flow-rules.spec.mjs";
import { runPureRulesSpec } from "./pure-rules.spec.mjs";
import { runRulesetsSpec } from "./rulesets.spec.mjs";
import { runTableSchemaSpec } from "./table-schema.spec.mjs";

const suites = [
  ["pure-rules", runPureRulesSpec],
  ["flow-rules", runFlowRulesSpec],
  ["rulesets", runRulesetsSpec],
  ["table-schema", runTableSchemaSpec]
];

let failed = false;

for (const [name, run] of suites) {
  try {
    run();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed = true;
    console.error(`[FAIL] ${name}`);
    console.error(error?.stack ?? error?.message ?? error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("All tests passed.");
}
