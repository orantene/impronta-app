import assert from "node:assert/strict";
import { test } from "node:test";

import { fixtureInbox } from "./fixture";
import { clipSnippet, filterInboxRows, inboxMatchSnippet, inboxRowMatches } from "./inbox-search";

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
