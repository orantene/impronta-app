import assert from "node:assert/strict";
import { test } from "node:test";

import { fixtureInbox } from "./fixture";
import { clipSnippet, filterInboxRows, inboxMatchSnippet, inboxRowMatches, keepActiveRow } from "./inbox-search";

test("empty query leaves every row in place", () => {
  const rows = fixtureInbox();
  assert.equal(filterInboxRows(rows, "").length, rows.length);
  assert.equal(filterInboxRows(rows, "   ").length, rows.length);
});

test("typed text filters the inbox by name, subject, and preview", () => {
  const rows = fixtureInbox();
  const laura = filterInboxRows(rows, "Laura");
  assert.equal(laura.length, 2);
  assert.ok(laura.every((row) => row.contactName.startsWith("Laura")));
  const pizza = filterInboxRows(rows, "pizza");
  assert.equal(pizza.length, 1);
  assert.equal(pizza[0]?.id, "inq-visitor");
  const rooftop = filterInboxRows(rows, "rooftop");
  assert.equal(rooftop.length, 2);
});

test("a miss yields no rows so the shell can show no-results", () => {
  assert.equal(filterInboxRows(fixtureInbox(), "zzzz-no-such").length, 0);
  assert.equal(inboxRowMatches(fixtureInbox()[0]!, "zzzz-no-such"), false);
});

test("matching snippet is the field that contained the query", () => {
  const visitor = fixtureInbox()[0]!;
  const snippet = inboxMatchSnippet(visitor, "pizza");
  assert.ok(snippet);
  assert.match(snippet, /pizza/i);
  assert.equal(inboxMatchSnippet(visitor, ""), null);
});

test("clipSnippet windows around the hit", () => {
  const body = `${"x".repeat(50)}Cora asked about Tuesday${"y".repeat(50)}`;
  const clipped = clipSnippet(body, "Cora");
  assert.match(clipped, /^…/);
  assert.match(clipped, /Cora asked about Tuesday/);
});

// D-143: a reply from "Needs reply" must not close the thread the operator is on.
test("the active thread stays listed when the filter no longer returns it", () => {
  const rows = fixtureInbox();
  const active = rows[0]!;
  const others = rows.slice(1);
  const kept = keepActiveRow(others, active.id, rows);
  assert.equal(kept[0]?.id, active.id);
  assert.equal(kept.length, others.length + 1);
  const fresh = { ...active, version: active.version + 1 };
  const refreshed = keepActiveRow(others, active.id, rows, fresh);
  assert.equal(refreshed[0]?.version, active.version + 1);
});

test("nothing is pinned without an active thread, and a listed thread is not doubled", () => {
  const rows = fixtureInbox();
  assert.deepEqual(keepActiveRow(rows, null, rows).map((r) => r.id), rows.map((r) => r.id));
  assert.deepEqual(keepActiveRow(rows, rows[1]!.id, rows).map((r) => r.id), rows.map((r) => r.id));
  assert.equal(keepActiveRow(rows.slice(1), "no-such-row", rows).length, rows.length - 1);
});
