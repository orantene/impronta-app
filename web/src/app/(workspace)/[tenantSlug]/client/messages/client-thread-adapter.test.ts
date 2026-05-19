/**
 * CHARACTERIZATION (GOLDEN) SPEC — client Messages role adapter.
 * Phase 2 zero-behaviour-change net for the CLIENT ThreadShell adoption
 * (remediation-plan-2026-05-19 §3 "Test gap" + §4 strangler step 2).
 *
 * Mirrors the Lane-E oracle pattern (messages-thread-helpers.test.ts):
 * the REAL exported functions are called — no reimplemented logic, no
 * frozen duplicates that could silently drift. Every expected value is
 * independently hand-computed from the PRE-adoption inline predicate that
 * lived in ClientMessagesShell, so an unchanged-green run is the proof
 * that routing the client surface through the slotted <ThreadShell> did
 * not change inbox filter / search / projection behaviour.
 *
 * Run: npx tsx --test \
 *   "src/app/(workspace)/[tenantSlug]/client/messages/client-thread-adapter.test.ts"
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { ClientInquiryRow } from "../../_data-bridge";
import {
  clientInquiryMatchesFilter,
  toClientThreadItems,
  type ClientMessagesFilter,
} from "./client-thread-adapter";

// Minimal row factory — only the five fields the predicate/projection
// touch (next_action_by, status, company, event_location, id). Cast is
// scoped to the test; the real functions are exercised unmodified.
function row(p: Partial<ClientInquiryRow> & { id: string }): ClientInquiryRow {
  return {
    company: null,
    event_location: null,
    status: "submitted",
    next_action_by: "agency",
    ...p,
  } as ClientInquiryRow;
}

describe("clientInquiryMatchesFilter — filter chips", () => {
  it("'all' is a pass-through for every status", () => {
    for (const status of ["submitted", "approved", "booked", "cancelled", "archived", "weird"]) {
      assert.equal(clientInquiryMatchesFilter(row({ id: "x", status }), "all", ""), true);
    }
  });

  it("'needs-me' ⇔ next_action_by === 'client' (exact)", () => {
    assert.equal(clientInquiryMatchesFilter(row({ id: "a", next_action_by: "client" }), "needs-me", ""), true);
    assert.equal(clientInquiryMatchesFilter(row({ id: "b", next_action_by: "agency" }), "needs-me", ""), false);
    assert.equal(clientInquiryMatchesFilter(row({ id: "c", next_action_by: "talent" }), "needs-me", ""), false);
  });

  it("'active' = {submitted,coordination,offer_pending,offer_sent} — NOT approved/booked (pinned quirk)", () => {
    for (const s of ["submitted", "coordination", "offer_pending", "offer_sent"]) {
      assert.equal(clientInquiryMatchesFilter(row({ id: s, status: s }), "active", ""), true);
    }
    for (const s of ["approved", "booked", "cancelled", "archived", "draft"]) {
      assert.equal(clientInquiryMatchesFilter(row({ id: s, status: s }), "active", ""), false);
    }
  });

  it("'booked' = status booked OR approved (approved counts here, not in 'active')", () => {
    assert.equal(clientInquiryMatchesFilter(row({ id: "a", status: "booked" }), "booked", ""), true);
    assert.equal(clientInquiryMatchesFilter(row({ id: "b", status: "approved" }), "booked", ""), true);
    assert.equal(clientInquiryMatchesFilter(row({ id: "c", status: "submitted" }), "booked", ""), false);
  });

  it("'past' = {cancelled,archived} only", () => {
    assert.equal(clientInquiryMatchesFilter(row({ id: "a", status: "cancelled" }), "past", ""), true);
    assert.equal(clientInquiryMatchesFilter(row({ id: "b", status: "archived" }), "past", ""), true);
    assert.equal(clientInquiryMatchesFilter(row({ id: "c", status: "booked" }), "past", ""), false);
  });
});

describe("clientInquiryMatchesFilter — search", () => {
  it("blank / whitespace-only search does not filter", () => {
    const r = row({ id: "i1", company: "Acme", status: "booked" });
    assert.equal(clientInquiryMatchesFilter(r, "all", ""), true);
    assert.equal(clientInquiryMatchesFilter(r, "all", "   "), true);
  });

  it("haystack = [company,event_location,status,id] Boolean-filtered, joined ' ', lowercased substring", () => {
    const r = row({ id: "RI-77", company: "Lumière Studio", event_location: "Tulum", status: "coordination" });
    assert.equal(clientInquiryMatchesFilter(r, "all", "lumière"), true);   // company, case-insensitive
    assert.equal(clientInquiryMatchesFilter(r, "all", "TULUM"), true);     // event_location, case-insensitive
    assert.equal(clientInquiryMatchesFilter(r, "all", "coordination"), true); // status
    assert.equal(clientInquiryMatchesFilter(r, "all", "ri-77"), true);     // id, lowercased
    assert.equal(clientInquiryMatchesFilter(r, "all", "berlin"), false);   // no field contains it
  });

  it("null company is dropped by the Boolean filter (no 'null' in haystack)", () => {
    const r = row({ id: "z9", company: null, event_location: null, status: "submitted" });
    assert.equal(clientInquiryMatchesFilter(r, "all", "null"), false);
    assert.equal(clientInquiryMatchesFilter(r, "all", "submitted z9"), true); // status + id joined by space
  });

  it("filter AND search are both required to pass", () => {
    const r = row({ id: "k1", company: "Nova", status: "approved", next_action_by: "client" });
    assert.equal(clientInquiryMatchesFilter(r, "booked", "nova"), true);   // approved∈booked AND 'nova' hit
    assert.equal(clientInquiryMatchesFilter(r, "booked", "zzz"), false);   // filter ok, search miss
    assert.equal(clientInquiryMatchesFilter(r, "active", "nova"), false);  // search ok, filter miss (approved∉active)
  });
});

describe("toClientThreadItems — projection", () => {
  it("empty → empty", () => {
    assert.deepEqual(toClientThreadItems([]), []);
  });

  it("preserves order 1:1 and maps to { id, title: company ?? id }", () => {
    const rows = [
      row({ id: "b", company: "Beta Co" }),
      row({ id: "a", company: null }),
    ];
    assert.deepEqual(toClientThreadItems(rows), [
      { id: "b", title: "Beta Co" },
      { id: "a", title: "a" },        // null company → id fallback (?? )
    ]);
  });

  it("pins exact `??` semantics: '' company is NOT null/undefined → kept as '' (NOT id)", () => {
    assert.deepEqual(toClientThreadItems([row({ id: "c", company: "" })]), [
      { id: "c", title: "" },
    ]);
  });
});

// Type-level guard: the filter union the shell passes is exactly this.
const _filters: ClientMessagesFilter[] = ["all", "needs-me", "active", "booked", "past"];
void _filters;
