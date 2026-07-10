/**
 * UNIT TEST — guest-conversation-scan-merge.ts (W2-I).
 *
 * Pins the empty-only merge invariant: the AI scan fills only fields that are
 * currently EMPTY and never overwrites a value the guest set. This is the
 * regression guard for the whole auto-fill feature — a bug here would let the AI
 * clobber a user-confirmed date / location / headcount / budget.
 *
 * Run: npx tsx --test src/lib/inquiry/guest-conversation-scan-merge.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { GuestMessageCapture } from "./guest-message-extract";
import { planScanFills } from "./guest-conversation-scan-merge";

const FULL_CAPTURE: GuestMessageCapture = {
  date: { status: "exact", event_date: "2026-08-15" },
  location: { status: "unconfirmed", city: "Austin" },
  talent: { count_needed: 40 },
  eventType: "wedding",
  budget: { preference: "total_budget", amount: 5000, currency: "USD" },
};

function byKind(fills: { kind: string }[]): Set<string> {
  return new Set(fills.map((f) => f.kind));
}

describe("planScanFills — empty-only merge (W2-I)", () => {
  it("fills every kind when interpreted_query is empty/null", () => {
    const fills = planScanFills(null, FULL_CAPTURE);
    assert.deepEqual(
      byKind(fills),
      new Set(["date", "location", "headcount", "event_type", "budget"]),
    );
  });

  it("fills every kind when interpreted_query has only not_sure defaults", () => {
    const query = {
      schema_version: 1,
      date: { status: "not_sure" },
      location: { status: "not_sure" },
      budget: { preference: "not_sure" },
      talent: {}, // no count_needed
      source_context: {}, // no ai_event_type
    };
    const fills = planScanFills(query, FULL_CAPTURE);
    assert.deepEqual(
      byKind(fills),
      new Set(["date", "location", "headcount", "event_type", "budget"]),
    );
  });

  it("NEVER overwrites a user-set date", () => {
    const query = { date: { status: "exact", event_date: "2026-01-01" } };
    const fills = planScanFills(query, FULL_CAPTURE);
    assert.equal(byKind(fills).has("date"), false, "date must be preserved");
    // But the other empty fields still get filled.
    assert.equal(byKind(fills).has("location"), true);
  });

  it("NEVER overwrites a user-set location, headcount, event_type, or budget", () => {
    const query = {
      location: { status: "confirmed", city: "Paris" },
      talent: { count_needed: 12 },
      source_context: { ai_event_type: "gala" },
      budget: { preference: "total_budget", amount: 999 },
    };
    const fills = planScanFills(query, FULL_CAPTURE);
    // Only `date` was empty → only date is filled.
    assert.deepEqual(byKind(fills), new Set(["date"]));
  });

  it("fills ONLY the empty subset (mixed query)", () => {
    const query = {
      date: { status: "exact", event_date: "2026-05-05" }, // present
      location: { status: "not_sure" }, // empty
      talent: { count_needed: 8 }, // present
    };
    const fills = planScanFills(query, FULL_CAPTURE);
    // location empty; event_type + budget empty; date + headcount present.
    assert.deepEqual(
      byKind(fills),
      new Set(["location", "event_type", "budget"]),
    );
  });

  it("skips a kind when the capture has no signal for it, even if empty", () => {
    const sparse: GuestMessageCapture = { eventType: "birthday" };
    const fills = planScanFills(null, sparse);
    assert.deepEqual(byKind(fills), new Set(["event_type"]));
  });

  it("emits an empty plan when the capture is empty", () => {
    assert.deepEqual(planScanFills(null, {}), []);
  });

  it("maps a flexible date fragment to a flexible chip", () => {
    const fills = planScanFills(null, { date: { status: "flexible" } });
    assert.deepEqual(fills, [
      { kind: "date", value: { dateStatus: "flexible", eventDate: null } },
    ]);
  });

  it("carries the exact date + budget currency through to the chip value", () => {
    const fills = planScanFills(null, FULL_CAPTURE);
    const date = fills.find((f) => f.kind === "date");
    const budget = fills.find((f) => f.kind === "budget");
    assert.deepEqual(date?.value, { dateStatus: "exact", eventDate: "2026-08-15" });
    assert.deepEqual(budget?.value, {
      budgetPreference: "total_budget",
      budgetAmount: 5000,
      currency: "USD",
    });
  });

  it("falls back to coarser location fragments for the city field", () => {
    const fills = planScanFills(null, {
      location: { status: "unconfirmed", country: "Mexico" },
    });
    const loc = fills.find((f) => f.kind === "location");
    assert.deepEqual(loc?.value, { locationStatus: "unconfirmed", city: "Mexico" });
  });

  it("rejects a non-positive / non-finite headcount", () => {
    // The extractor already drops these, but the merge stays defensive.
    assert.deepEqual(planScanFills(null, { talent: { count_needed: 0 } }), []);
  });
});
