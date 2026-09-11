/**
 * events-model.test.ts — the Events boards' judgements: which segment a row
 * files under, what its state column says, the night's four figures, and
 * the event-day readiness strip.
 *
 * Run: node_modules/.bin/tsx --test src/components/admin/shell/internal/page-modules/events/events-model.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { EventListRow, EventTierRow, SessionPoolRow } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import {
  centsFromInput,
  dayKey,
  eventDayReadiness,
  eventState,
  inSegment,
  nightFigures,
  segmentCounts,
  segmentFromQuery,
  tabFromQuery,
  tierPhase,
} from "./events-model";

const tier: EventTierRow = {
  id: "t1",
  poolKey: "ga",
  label: "General admission",
  amountCents: 40000,
  admitsPerUnit: 1,
  isHidden: false,
  seatingMode: null,
  onSale: true,
  saleReason: null,
  salesFrom: null,
  salesUntil: null,
  maxPerOrder: null,
};

function row(patch: Partial<EventListRow> = {}): EventListRow {
  return {
    id: "e1",
    slug: "rooftop-jazz",
    title: "Rooftop Jazz",
    status: "published",
    admissionKind: "ticket",
    doorsOffsetMinutes: 0,
    refundCutoffHours: null,
    payoutReleaseRule: "on_session_end",
    nextSessionAt: "2026-09-18T01:00:00.000Z",
    sessionCount: 1,
    runFinished: false,
    timeZone: "America/Mexico_City",
    tiers: [tier],
    sessions: [{ id: "s1", startsAt: "2026-09-18T01:00:00.000Z" }],
    ...patch,
  };
}

const NOW = "2026-09-17T20:00:00.000Z"; // 15:00 in Mexico City, the night is at 20:00 local

test("eventState: draft, on sale, missing tier, missing night, finished, cancelled", () => {
  assert.equal(eventState(row({ status: "draft" })), "draft");
  assert.equal(eventState(row()), "salesOpen");
  assert.equal(eventState(row({ tiers: [] })), "noTier");
  assert.equal(eventState(row({ sessionCount: 0, sessions: [] })), "noNight");
  assert.equal(eventState(row({ runFinished: true })), "finished");
  assert.equal(eventState(row({ status: "cancelled", tiers: [] })), "cancelled");
});

test("inSegment: today is the venue's calendar day, not the reader's", () => {
  const r = row();
  assert.equal(dayKey(r.sessions[0]!.startsAt, r.timeZone), "2026-09-17");
  assert.equal(inSegment(r, "today", NOW), true);
  assert.equal(inSegment(r, "upcoming", NOW), true);
  assert.equal(inSegment(r, "past", NOW), false);
  assert.equal(inSegment(row({ status: "draft" }), "drafts", NOW), true);
  assert.equal(inSegment(row({ tiers: [] }), "attention", NOW), true);
  assert.equal(inSegment(row({ runFinished: true }), "past", NOW), true);
});

test("segmentCounts counts every segment a row belongs to", () => {
  const counts = segmentCounts(
    [row(), row({ id: "e2", status: "draft" }), row({ id: "e3", runFinished: true, nextSessionAt: null, sessions: [{ id: "s0", startsAt: "2026-09-04T01:00:00.000Z" }] })],
    NOW,
  );
  assert.deepEqual(counts, { upcoming: 1, today: 1, drafts: 1, attention: 0, past: 1 });
});

test("segmentFromQuery and tabFromQuery fall back rather than trust the URL", () => {
  assert.equal(segmentFromQuery("drafts"), "drafts");
  assert.equal(segmentFromQuery("nope"), "upcoming");
  assert.equal(tabFromQuery("day"), "day");
  assert.equal(tabFromQuery(null), "tickets");
});

test("tierPhase reads the reader's own sale verdict", () => {
  assert.equal(tierPhase({ onSale: true, saleReason: null }), "onSale");
  assert.equal(tierPhase({ onSale: false, saleReason: "scheduled" }), "scheduled");
  assert.equal(tierPhase({ onSale: false, saleReason: "hidden" }), "hidden");
  assert.equal(tierPhase({ onSale: false, saleReason: "ended" }), "ended");
});

test("nightFigures: capacity is the pools' sum, sold their committed peak, and no pool is null not zero", () => {
  const pools: SessionPoolRow[] = [
    { poolKey: "ga", tierLabel: "GA", poolId: "p1", unitsTotal: 12, overbookUnits: 0, isActive: true, committedPeak: 8 },
    { poolKey: "table", tierLabel: "Table", poolId: "p2", unitsTotal: 2, overbookUnits: null, isActive: true, committedPeak: 1 },
    { poolKey: "child", tierLabel: "Child", poolId: null, unitsTotal: null, overbookUnits: null, isActive: null, committedPeak: null },
  ];
  assert.deepEqual(nightFigures(pools), { capacity: 14, sold: 9, remaining: 5, pooled: 2, tiers: 3 });
  assert.deepEqual(nightFigures([pools[2]!]), { capacity: null, sold: null, remaining: null, pooled: 0, tiers: 1 });
  const unknown = nightFigures([{ ...pools[0]!, committedPeak: null }]);
  assert.equal(unknown.sold, null);
  assert.equal(unknown.remaining, null);
});

test("eventDayReadiness says what the engine can vouch for", () => {
  const ready = eventDayReadiness(row(), [{ poolKey: "ga", tierLabel: "GA", poolId: "p1", unitsTotal: 12, overbookUnits: 0, isActive: true, committedPeak: 0 }]);
  assert.deepEqual(
    ready.map((r) => [r.key, r.ok]),
    [
      ["published", true],
      ["tiers", true],
      ["night", true],
      ["pools", true],
    ],
  );
  const notReady = eventDayReadiness(row({ status: "draft", tiers: [], sessionCount: 0, sessions: [] }), null);
  assert.equal(notReady.every((r) => !r.ok), true);
});

test("centsFromInput accepts a comma and refuses a word", () => {
  assert.equal(centsFromInput("12,50"), 1250);
  assert.equal(centsFromInput("12.5"), 1250);
  assert.equal(centsFromInput("free"), null);
  assert.equal(centsFromInput("-1"), null);
});
