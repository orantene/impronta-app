/**
 * TUL-1328: guards on the automatic review-request decision. Pure logic —
 * no DB, no mocks. Pins down:
 *   - a refunded or cancelled booking is never asked, even past the cutoff
 *   - a booking on a QA/demo fixture tenant is never asked
 *   - a reserved-domain contact email (no account) is dropped, not asked
 *   - none of the above block an otherwise-eligible completed booking
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { decideAutoReviewRequests, type AutoReviewBooking } from "./auto-review-request-plan";

const NOW = new Date("2026-06-03T12:00:00Z");
const CUTOFF = new Date("2026-01-01T00:00:00Z");

function booking(overrides: Partial<AutoReviewBooking> = {}): AutoReviewBooking {
  return {
    id: "b1",
    tenant_id: "tenant-1",
    status: "completed",
    payment_status: "paid",
    ends_at: "2026-06-01T10:00:00Z",
    starts_at: null,
    event_date: null,
    client_user_id: null,
    contact_email: "client@realclient.com",
    order_id: null,
    title: "Shoot",
    ...overrides,
  };
}

function decide(bookings: AutoReviewBooking[], extra: Partial<Parameters<typeof decideAutoReviewRequests>[0]> = {}) {
  return decideAutoReviewRequests({
    now: NOW,
    bookings,
    talentsByBooking: new Map([["b1", ["talent-1"]]]),
    requestedBookingIds: new Set(),
    cutoff: CUTOFF,
    ...extra,
  });
}

describe("decideAutoReviewRequests — TUL-1328 guards", () => {
  it("an otherwise-eligible completed booking is due", () => {
    const d = decide([booking()]);
    assert.equal(d.due.length, 1);
    assert.equal(d.due[0]?.booking.id, "b1");
  });

  it("a refunded booking is skipped, not asked", () => {
    const d = decide([booking({ payment_status: "refunded" })]);
    assert.equal(d.due.length, 0);
    assert.equal(d.skipped.refunded_or_cancelled, 1);
  });

  it("a cancelled booking is skipped, not asked", () => {
    const d = decide([booking({ payment_status: "cancelled" })]);
    assert.equal(d.due.length, 0);
    assert.equal(d.skipped.refunded_or_cancelled, 1);
  });

  it("a booking on a fixture tenant is skipped, not asked", () => {
    const d = decide([booking({ tenant_id: "fixture-tenant" })], {
      fixtureTenantIds: new Set(["fixture-tenant"]),
    });
    assert.equal(d.due.length, 0);
    assert.equal(d.skipped.test_tenant, 1);
  });

  it("a fixture tenant with no fixtureTenantIds passed stays unaffected (default empty set)", () => {
    const d = decide([booking({ tenant_id: "fixture-tenant" })]);
    assert.equal(d.due.length, 1);
  });

  it("a reserved-domain contact email with no account is dropped, not asked", () => {
    const d = decide([booking({ contact_email: "guest@example.com", client_user_id: null })]);
    assert.equal(d.due.length, 0);
    assert.equal(d.skipped.reserved_email, 1);
  });

  it("a .test domain contact email is also dropped", () => {
    const d = decide([booking({ contact_email: "guest@impronta.test", client_user_id: null })]);
    assert.equal(d.due.length, 0);
    assert.equal(d.skipped.reserved_email, 1);
  });

  it("a reserved-domain contact email is fine when the booking also has an account", () => {
    const d = decide([booking({ contact_email: "guest@example.com", client_user_id: "user-1" })]);
    assert.equal(d.due.length, 1);
    assert.equal(d.due[0]?.invitedEmail, null);
    assert.equal(d.due[0]?.clientUserId, "user-1");
  });
});
