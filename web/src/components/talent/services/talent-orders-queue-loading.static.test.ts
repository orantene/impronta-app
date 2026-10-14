import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const orders = readFileSync(join(__dirname, "TalentOrdersQueue.tsx"), "utf8");
const editor = readFileSync(join(__dirname, "use-offerings-editor.ts"), "utf8");

test("TUL-336: the orders queue renders nothing while it loads", () => {
  assert.doesNotMatch(orders, /Loading orders/);
  assert.match(orders, /if \(orders === null \|\| orders\.length === 0\) return null;/);
});

test("TUL-336: the orders read is bounded and settles to no rows", () => {
  assert.match(orders, /settleServerAction\(\(\) => loadTalentOrders\(talentId\)/);
  assert.match(orders, /settleOrders\(talentId\)\s*\.catch\(\(\) => \[\] as TalentOrderRow\[\]\)/);
  assert.doesNotMatch(orders, /[^(]loadTalentOrders\(talentId\)\.then/);
});

test("TUL-336: the Services list read is bounded so it cannot load forever", () => {
  assert.match(editor, /settleServerAction\(\(\) => loadWorkspaceMenuForEditor\(workspaceTenantId\)/);
  assert.match(editor, /settleServerAction\(\(\) => loadTalentOfferingsForEditor\(talentId\)/);
  assert.match(editor, /budgetMs: LOAD_BUDGET_MS/);
});
