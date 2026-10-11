/**
 * TUL-533 S1: /talent/services sat on "Cargando pedidos…" for 30 s+. A server
 * action that a history write discards never settles, so every mount-time load
 * on the page goes through settleServerAction and ends in a result or a
 * fallback, never a spinner forever.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) =>
  readFileSync(join(process.cwd(), "src/components/talent/services", file), "utf8");

test("the orders queue loads through settleServerAction and falls back to no orders", () => {
  const src = read("TalentOrdersQueue.tsx");
  assert.match(src, /settleServerAction\(\(\) => loadTalentOrders\(talentId\)/);
  assert.match(src, /\.catch\(\(\) => \[\]\)/);
  assert.equal(src.match(/[^.\w]loadTalentOrders\(/g)?.length, 1, "only the settled call reaches the action");
});

test("the services list loads through settleServerAction", () => {
  const src = read("use-offerings-editor.ts");
  assert.match(src, /settleServerAction\(\(\) => loadTalentOfferingsForEditor\(talentId\)/);
  assert.match(src, /settleServerAction\(\(\) => loadWorkspaceMenuForEditor\(workspaceTenantId\)/);
  assert.match(src, /setError\("Could not refresh your services\."\)/, "a stall ends in the error state");
});

test("every load, retry included, ends within 15 s", () => {
  for (const file of ["TalentOrdersQueue.tsx", "use-offerings-editor.ts"]) {
    const src = read(file);
    const budget = Number(/const LOAD_BUDGET_MS = ([\d_]+);/.exec(src)?.[1]?.replace(/_/g, ""));
    const delay = Number(/const LOAD_RETRY_DELAY_MS = ([\d_]+);/.exec(src)?.[1]?.replace(/_/g, ""));
    const calls = src.match(/budgetMs: LOAD_BUDGET_MS,\s*retries: 1,\s*retryDelayMs: LOAD_RETRY_DELAY_MS,/g)?.length ?? 0;
    assert.equal(calls, src.match(/settleServerAction\(/g)?.length, `${file}: every settle call carries the bounded retry`);
    assert.ok(2 * budget + delay <= 15_000, `${file}: ${2 * budget + delay} ms`);
  }
});
