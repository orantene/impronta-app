import assert from "node:assert/strict";
import { test } from "node:test";

import { annotateDiffWithEvents, diffDraft, type DraftSnapshot } from "./diff-draft";

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

test("each line row carries who proposed the line (S5)", () => {
  const base: DraftSnapshot = { version: 1, currency: "MXN", lines: [{ ...line("l1", 1), proposedBy: "client" }] };
  const theirs: DraftSnapshot = {
    version: 2,
    currency: "MXN",
    lines: [
      { ...line("l1", 3), proposedBy: "client" },
      { ...line("l2", 1), proposedBy: "staff" },
    ],
  };
  const yours: DraftSnapshot = {
    version: 1,
    currency: "MXN",
    lines: [
      { ...line("l1", 2), proposedBy: "client" },
      { ...line("l3", 1), proposedBy: "system" },
    ],
  };
  const diff = diffDraft(base, theirs, yours);
  const units = diff.find((row) => row.lineId === "l1" && row.field === "units");
  assert.equal(units?.proposedBy, "client");
  assert.equal(units?.changedBy, null);
  assert.deepEqual(units?.priceHistory, []);
  const added = diff.find((row) => row.lineId === "l3");
  assert.equal(added?.field, "added");
  assert.equal(added?.proposedBy, "system");
  // A snapshot taken before S5 has no author.
  const old = diffDraft(
    { version: 1, currency: "MXN", lines: [line("l1", 1)] },
    { version: 2, currency: "MXN", lines: [line("l1", 3)] },
    { version: 1, currency: "MXN", lines: [line("l1", 2)] },
  );
  assert.equal(old[0]?.proposedBy, null);
  // Whole-draft rows have no author.
  const currency = diffDraft(
    { version: 1, currency: "MXN", lines: [] },
    { version: 2, currency: "USD", lines: [] },
    { version: 1, currency: "MXN", lines: [] },
  );
  assert.equal(currency[0]?.field, "currency");
  assert.equal(currency[0]?.proposedBy, null);
});

test("the line history says who changed what and every price move (S5)", () => {
  const diff = diffDraft(
    { version: 1, currency: "MXN", lines: [{ ...line("l1", 1), proposedBy: "client" }] },
    { version: 3, currency: "MXN", lines: [{ ...line("l1", 3), unitCents: 2000, proposedBy: "client" }] },
    { version: 1, currency: "MXN", lines: [{ ...line("l1", 2), proposedBy: "client" }] },
  );
  const events = [
    { line_id: "l1", actor_kind: "client", created_at: "2026-09-17T10:00:00Z", change: { op: "add", old: null, new: { unit_cents: 1800 } } },
    { line_id: "l1", actor_kind: "staff", created_at: "2026-09-17T10:05:00Z", change: { op: "update", old: { unit_cents: 1800 }, new: { unit_cents: 2000 } } },
    // Out of order on purpose: a quantity change with no price move.
    { line_id: "l1", actor_kind: "system", created_at: "2026-09-17T10:02:00Z", change: { op: "update", old: { unit_cents: "1800" }, new: { unit_cents: "1800" } } },
    { line_id: "other", actor_kind: "staff", created_at: "2026-09-17T11:00:00Z", change: { op: "remove", old: { unit_cents: 500 }, new: null } },
  ];
  const rows = annotateDiffWithEvents(diff, events);
  for (const row of rows) {
    assert.equal(row.changedBy, "staff", `${row.field}: latest event on l1 is staff's`);
    assert.deepEqual(row.priceHistory, [
      { at: "2026-09-17T10:00:00Z", by: "client", fromCents: null, toCents: 1800 },
      { at: "2026-09-17T10:05:00Z", by: "staff", fromCents: 1800, toCents: 2000 },
    ]);
  }
  // No events: rows come back as they were.
  assert.deepEqual(annotateDiffWithEvents(diff, []), diff);
});
