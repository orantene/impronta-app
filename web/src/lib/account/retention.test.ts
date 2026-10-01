import test from "node:test";
import assert from "node:assert/strict";

import { isPurgeableInquiry, monthsBefore, retentionEnforced, runRetention, type PurgeCandidate } from "./retention";

const NOW = new Date("2026-10-01T00:00:00.000Z");
const CUTOFF = monthsBefore(NOW, 24);

function cand(over: Partial<PurgeCandidate> = {}): PurgeCandidate {
  return {
    id: "inq-1",
    status: "closed_lost",
    bookedAt: null,
    updatedAt: "2024-01-01T00:00:00.000Z",
    lastMessageAt: null,
    bookingCount: 0,
    transactionCount: 0,
    paymentLinkCount: 0,
    ...over,
  };
}

test("enforcement is off unless RETENTION_ENFORCE is exactly 'true'", () => {
  assert.equal(retentionEnforced({}), false);
  assert.equal(retentionEnforced({ RETENTION_ENFORCE: "1" }), false);
  assert.equal(retentionEnforced({ RETENTION_ENFORCE: "TRUE" }), false);
  assert.equal(retentionEnforced({ RETENTION_ENFORCE: "true" }), true);
});

test("cutoffs: 24 months back from now", () => {
  assert.equal(CUTOFF.toISOString(), "2024-10-01T00:00:00.000Z");
});

test("an idle unbooked inquiry with nothing financial attached is purgeable", () => {
  assert.equal(isPurgeableInquiry(cand(), CUTOFF), true);
});

test("anything booked or paid is never purged", () => {
  assert.equal(isPurgeableInquiry(cand({ bookedAt: "2023-01-01T00:00:00Z" }), CUTOFF), false);
  assert.equal(isPurgeableInquiry(cand({ status: "converted" }), CUTOFF), false);
  assert.equal(isPurgeableInquiry(cand({ bookingCount: 1 }), CUTOFF), false);
  assert.equal(isPurgeableInquiry(cand({ transactionCount: 1 }), CUTOFF), false);
  assert.equal(isPurgeableInquiry(cand({ paymentLinkCount: 1 }), CUTOFF), false);
});

test("a recent message keeps an old inquiry alive", () => {
  assert.equal(isPurgeableInquiry(cand({ lastMessageAt: "2025-06-01T00:00:00Z" }), CUTOFF), false);
});

// Fake client: records writes; every select returns the canned rows.
function fakeAdmin() {
  const writes: string[] = [];
  function q(table: string, action: string, rows: unknown[] = [], count = 0) {
    const b: Record<string, unknown> = {};
    for (const m of ["eq", "in", "is", "not", "lt", "order", "limit", "ilike"]) b[m] = () => b;
    b.then = (res: (v: unknown) => unknown) => {
      if (action !== "select") writes.push(`${action}:${table}`);
      return Promise.resolve({ data: rows, count, error: null }).then(res);
    };
    return b;
  }
  return {
    writes,
    admin: {
      from(table: string) {
        return {
          select: () =>
            table === "inquiries"
              ? q(table, "select", [{ id: "inq-1", status: "closed_lost", booked_at: null, updated_at: "2023-01-01T00:00:00Z" }], 1)
              : q(table, "select", [], 0),
          update: () => q(table, "update"),
          delete: () => q(table, "delete"),
        };
      },
    },
  };
}

test("dry run counts but writes nothing", async () => {
  const { admin, writes } = fakeAdmin();
  const r = await runRetention(admin as never, { now: NOW, enforce: false });
  assert.equal(r.enforce, false);
  assert.equal(r.guestContact.matched, 1);
  assert.equal(r.guestContact.anonymized, 0);
  assert.equal(r.unbookedInquiries.purgeable, 1);
  assert.equal(r.unbookedInquiries.deleted, 0);
  assert.deepEqual(writes, []);
  assert.deepEqual(r.errors, []);
});

test("enforced run anonymizes guests and deletes only inquiries (never bookings or money rows)", async () => {
  const { admin, writes } = fakeAdmin();
  const r = await runRetention(admin as never, { now: NOW, enforce: true });
  assert.equal(r.unbookedInquiries.deleted, 1);
  assert.deepEqual(writes, ["update:inquiries", "delete:inquiries"]);
});
