import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildReleaseBodyBlocks,
  buildReleaseProperties,
  chunk,
  extractPrNumbers,
  matchTicketsToPrs,
  nextReleaseId,
  prNumbersFromTicketField,
  prefixToIsoDate,
  releaseDatePrefix,
  toRichText,
  withRelease,
} from "./release-recorder";

test("release date prefix uses Cancún time, not UTC", () => {
  // 03:00 UTC on Oct 22 is still Oct 21 in Cancún (UTC-5).
  assert.equal(releaseDatePrefix(new Date("2026-10-22T03:00:00Z")), "2026.10.21");
  assert.equal(releaseDatePrefix(new Date("2026-10-22T06:00:00Z")), "2026.10.22");
  assert.equal(prefixToIsoDate("2026.10.21"), "2026-10-21");
});

test("first release of a day takes the bare date, later ones count up", () => {
  assert.equal(nextReleaseId("2026.10.21", []), "2026.10.21");
  assert.equal(nextReleaseId("2026.10.21", ["2026.10.20", "2026.10.20.2"]), "2026.10.21");
  assert.equal(nextReleaseId("2026.10.21", ["2026.10.21"]), "2026.10.21.2");
  assert.equal(nextReleaseId("2026.10.21", ["2026.10.21", "2026.10.21.2"]), "2026.10.21.3");
  assert.equal(nextReleaseId("2026.10.21", ["2026.10.21.3", "2026.10.21"]), "2026.10.21.4");
});

test("extracts squash-merge and integration-batch PR numbers", () => {
  const prs = extractPrNumbers([
    "QA-T: staging signup-code + probe scripts (Q1, Q2) (#4107)",
    "integ: batch 5 (client sign-in #2621 first) #2621 #2645 #2647 (#2691)",
    "fix: html entity &#123; and path a/#99 are not PRs",
    "chore: no reference here",
  ]);
  assert.deepEqual(prs, [2621, 2645, 2647, 2691, 4107]);
});

test("reads one or many PR URLs from the ticket field", () => {
  assert.deepEqual(prNumbersFromTicketField("https://github.com/orantene/impronta-app/pull/4114"), [4114]);
  assert.deepEqual(
    prNumbersFromTicketField(
      "https://github.com/orantene/impronta-app/pull/4144 https://github.com/orantene/impronta-app/pull/4147",
    ),
    [4144, 4147],
  );
  assert.deepEqual(prNumbersFromTicketField("#3753"), [3753]);
  assert.deepEqual(prNumbersFromTicketField(null), []);
});

test("matches only tickets whose PR is in the release", () => {
  const tickets = [
    { id: "a", prField: "https://github.com/x/y/pull/10", releaseIds: [] },
    { id: "b", prField: "https://github.com/x/y/pull/11 https://github.com/x/y/pull/12", releaseIds: [] },
    { id: "c", prField: null, releaseIds: [] },
  ];
  assert.deepEqual(
    matchTicketsToPrs(tickets, [12, 99]).map((t) => t.id),
    ["b"],
  );
});

test("adding the release to a ticket never duplicates it", () => {
  assert.deepEqual(withRelease([], "abc-1"), ["abc-1"]);
  assert.deepEqual(withRelease(["abc1"], "abc-1"), ["abc1"]);
  assert.deepEqual(withRelease(["old"], "new"), ["old", "new"]);
});

test("rich text is split at Notion's 2000-character limit", () => {
  const parts = toRichText("x".repeat(4500));
  assert.equal(parts.length, 3);
  assert.equal(parts[0].text.content.length, 2000);
  assert.equal(parts[2].text.content.length, 500);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("release row is a Draft production release at tier 0", () => {
  const props = buildReleaseProperties({
    releaseId: "2026.10.21",
    isoDate: "2026-10-21",
    commit: "abc123",
    prNumbers: [1, 2],
  }) as Record<string, Record<string, unknown>>;
  assert.deepEqual(props.Status, { status: { name: "Draft" } });
  assert.deepEqual(props.Kind, { select: { name: "Production release" } });
  assert.deepEqual(props.Tier, { select: { name: "0 Internal" } });
  assert.deepEqual(props["Release date"], { date: { start: "2026-10-21" } });
  assert.deepEqual(props.PRs, { rich_text: [{ type: "text", text: { content: "#1 #2" } }] });
});

test("body lists every commit after the intro and heading", () => {
  const blocks = buildReleaseBodyBlocks(
    [
      { sha: "1234567890abcdef", subject: "feat: one (#1)" },
      { sha: "fedcba0987654321", subject: "fix: two (#2)" },
    ],
    3,
  );
  assert.equal(blocks.length, 4);
  assert.equal(blocks[1].type, "heading_2");
  assert.equal(blocks[2].type, "bulleted_list_item");
});
