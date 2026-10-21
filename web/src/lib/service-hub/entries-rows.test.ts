import assert from "node:assert/strict";
import test from "node:test";

import { listingFromRows, normalizeCategory } from "./entries-rows";

const listing = { id: "l1", tenant_id: "t", talent_profile_id: "p1", offering_id: "o1", status: "accepted", price_mode: "talent_price", booking_type: "request", currency: "USD", entry_id: null, owner_skipped_at: null, talent_consented_at: "2026-10-01T00:00:00Z" };
const offering = { id: "o1", title: "Deep massage", category: "  Massage ", duration_minutes: 60, amount_cents: 50000, currency: "USD" };

test("categories compare case- and accent-insensitively, trimmed; empty is none", () => {
  assert.equal(normalizeCategory("  Masaje Relajación "), "masaje relajacion");
  assert.equal(normalizeCategory("MASSAGE"), normalizeCategory("massage"));
  assert.equal(normalizeCategory("   "), null);
  assert.equal(normalizeCategory(null), null);
});

test("a listing row plus its offering becomes an entry listing", () => {
  const l = listingFromRows(listing, offering, "Ana");
  assert.deepEqual(l, {
    listingId: "l1",
    talentProfileId: "p1",
    talentName: "Ana",
    title: "Deep massage",
    categoryId: "massage",
    durationMinutes: 60,
    bookingType: "request",
    priceCents: 50000,
    currency: "USD",
    entryId: null,
    talentAccepted: true,
  });
});

test("talent consent counts only when she accepted; hidden listings and skipped ones never enter the queue", () => {
  assert.equal(listingFromRows({ ...listing, status: "offered" }, offering, "Ana")!.talentAccepted, false);
  assert.equal(listingFromRows({ ...listing, status: "hidden" }, offering, "Ana"), null);
  const skipped = listingFromRows({ ...listing, owner_skipped_at: "2026-10-02T00:00:00Z" }, offering, "Ana")!;
  assert.equal(skipped.talentAccepted, false);
});

test("a listing price follows the listing mode: her price, or the fixed price; unknown stays null", () => {
  assert.equal(listingFromRows({ ...listing, price_mode: "fixed", price_cents: 40000 }, offering, "Ana")!.priceCents, 40000);
  assert.equal(listingFromRows({ ...listing, price_mode: "margin", margin_bps: 1000 }, offering, "Ana")!.priceCents, 55000);
  assert.equal(listingFromRows({ ...listing, price_mode: "from", price_cents: null }, offering, "Ana")!.priceCents, null);
});

test("malformed rows are dropped, not guessed", () => {
  assert.equal(listingFromRows({ nonsense: true } as never, offering, "Ana"), null);
  assert.equal(listingFromRows(listing, { id: "x" } as never, "Ana")!.durationMinutes, null);
  assert.equal(listingFromRows({ ...listing, booking_type: "walk_in" }, offering, "Ana")!.bookingType, "request");
});
