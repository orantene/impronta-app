/**
 * UNIT TEST — picker-config.ts.
 *
 * Runs in `test:sessions` (glob lane). `tsx --test` executes, it does not
 * typecheck: a green lane is not a green branch.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { pickerConfig } from "./picker-config";

const TENANT = "3f1b6a2c-0000-4000-8000-000000000001";
const OFFERING = "3f1b6a2c-0000-4000-8000-000000000002";

test("both ids present is configured, and the values come back trimmed", () => {
  const c = pickerConfig(`  ${TENANT} `, OFFERING);
  assert.equal(c.ok, true);
  if (!c.ok) return;
  assert.equal(c.tenantId, TENANT);
  assert.equal(c.offeringId, OFFERING);
});

test("the renderer's `?? \"\"` sentinel is caught, and named as the TENANT", () => {
  // render.tsx passes `tenantId={options.dataSources.tenantId ?? ""}`. This is
  // the exact value that arrives when a block sits on a page with no tenant in
  // its data sources.
  const c = pickerConfig("", OFFERING);
  assert.equal(c.ok, false);
  if (c.ok) return;
  // Which half is missing, because the author has to know which field to fill.
  assert.equal(c.missing, "tenant");
});

test("a missing offering is its own answer, not the same as a missing tenant", () => {
  const c = pickerConfig(TENANT, "");
  assert.equal(c.ok, false);
  if (c.ok) return;
  assert.equal(c.missing, "offering");
});

test("neither supplied reports BOTH rather than picking one to blame", () => {
  const c = pickerConfig("", "");
  assert.equal(c.ok, false);
  if (c.ok) return;
  assert.equal(c.missing, "both");
});

test("null and undefined are treated as absent, not as the string 'null'", () => {
  for (const bad of [null, undefined]) {
    const c = pickerConfig(bad, OFFERING);
    assert.equal(c.ok, false, String(bad));
    if (c.ok) return;
    assert.equal(c.missing, "tenant");
  }
});

test("whitespace only is absent — a space is not a configuration", () => {
  const c = pickerConfig("   ", OFFERING);
  assert.equal(c.ok, false);
  if (c.ok) return;
  assert.equal(c.missing, "tenant");
});

test("a MALFORMED id is NOT reported as unconfigured", () => {
  // Deliberate. "not set up" sends the author to the editor to choose a class
  // they have already chosen. A wrong id is a different fault with a different
  // fix, and the actions' zod uuid schema owns it and answers it as invalid.
  // This question is only ever "was anything supplied at all".
  const c = pickerConfig("not-a-uuid", "also-not-a-uuid");
  assert.equal(c.ok, true);
});
