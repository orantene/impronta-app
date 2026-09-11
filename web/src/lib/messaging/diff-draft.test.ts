import assert from "node:assert/strict";
import { test } from "node:test";

import { diffDraft, type DraftSnapshot } from "./diff-draft";

const line = (id: string, units: number): DraftSnapshot["lines"][number] => ({
  id,
  label: "Pizza",
  units,
  unitCents: 1800,
});

test("concurrent unit edits produce previous / theirs / yours", () => {
  const base: DraftSnapshot = { version: 1, currency: "MXN", lines: [line("l1", 1)] };
  const theirs: DraftSnapshot = { version: 2, currency: "MXN", lines: [line("l1", 3)] };
  const yours: DraftSnapshot = { version: 1, currency: "MXN", lines: [line("l1", 2)] };
  const diff = diffDraft(base, theirs, yours);
  const units = diff.find((row) => row.field === "units");
  assert.ok(units);
  assert.equal(units?.previous, 1);
  assert.equal(units?.theirs, 3);
  assert.equal(units?.yours, 2);
});

test("identical yours and theirs is empty", () => {
  const snap: DraftSnapshot = { version: 2, currency: "MXN", lines: [line("l1", 2)] };
  assert.deepEqual(diffDraft(snap, snap, snap), []);
});
