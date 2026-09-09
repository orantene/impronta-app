/**
 * Final campaign readiness — static gate.
 * Does not claim any case passed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");

test("404 register and final campaign doc exist; count stays honest", () => {
  const register = resolve(ROOT, "docs/plans/program/scenario-register-404.md");
  const campaign = resolve(ROOT, "docs/plans/program/FINAL-CAMPAIGN.md");
  const matrix = resolve(ROOT, "docs/plans/program/scenario-matrix.md");
  assert.equal(existsSync(register), true);
  assert.equal(existsSync(campaign), true);
  assert.equal(existsSync(matrix), true);
  const reg = readFileSync(register, "utf8");
  assert.match(reg, /\*\*404\*\*/);
  assert.match(reg, /CS-01/);
  assert.match(reg, /C-01/);
  const camp = readFileSync(campaign, "utf8");
  assert.match(camp, /0 \/ 48/);
  assert.equal(existsSync(resolve(ROOT, "web/scripts/verify-resource-concurrency.mjs")), true);
});
