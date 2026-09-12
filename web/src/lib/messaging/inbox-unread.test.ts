/**
 * `countMessagingUnread` (contract seam 10): the rail badge counts, per
 * person, the threads at the location whose last customer message is newer
 * than that person's read mark, and nothing else. The same rule
 * `loadMessagingInbox` applies row by row, so the badge and the Unread filter
 * cannot disagree.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { countMessagingUnread } from "./inbox";

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      let filtered = rows;
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filtered = filtered.filter((row) => row[column] === value);
          return query;
        },
        in(column: string, values: unknown[]) {
          filtered = filtered.filter((row) => values.includes(row[column]));
          return query;
        },
        not(column: string, op: string, value: unknown) {
          if (op === "is" && value === null) filtered = filtered.filter((row) => row[column] != null);
          return query;
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          resolve({ data: filtered, error: null });
        },
      };
      return query;
    },
  };
}

test("counts unread customer messages at the location for this person only", async () => {
  const admin = fakeAdmin({
    inquiries: [
      { id: "a", tenant_id: "t1", location_slug: "default", last_customer_message_at: "2026-09-11T10:00:00Z" },
      { id: "b", tenant_id: "t1", location_slug: "default", last_customer_message_at: "2026-09-11T08:00:00Z" },
      { id: "c", tenant_id: "t1", location_slug: "annex", last_customer_message_at: "2026-09-11T10:00:00Z" },
      { id: "d", tenant_id: "t1", location_slug: "default", last_customer_message_at: null },
      { id: "e", tenant_id: "t2", location_slug: "default", last_customer_message_at: "2026-09-11T10:00:00Z" },
    ],
    inquiry_message_reads: [
      { inquiry_id: "b", user_id: "u1", last_read_at: "2026-09-11T09:00:00Z" },
      { inquiry_id: "a", user_id: "u2", last_read_at: "2026-09-11T11:00:00Z" },
    ],
  });
  // a: unread for u1 (no read mark). b: read after the last message. c: other
  // location. d: never wrote. e: another tenant.
  assert.equal(await countMessagingUnread(admin, { tenantId: "t1", locationSlug: "default", actorUserId: "u1" }), 1);
  // u2 read a; b has no mark for u2, so b is unread for u2.
  assert.equal(await countMessagingUnread(admin, { tenantId: "t1", locationSlug: "default", actorUserId: "u2" }), 1);
  // "all" spans locations.
  assert.equal(await countMessagingUnread(admin, { tenantId: "t1", locationSlug: "all", actorUserId: "u1" }), 2);
});

test("a failed read answers zero, never a throw on the till's rail", async () => {
  const admin = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        not() {
          return Promise.resolve({ data: null, error: { message: "down" } });
        },
      };
    },
  };
  assert.equal(await countMessagingUnread(admin, { tenantId: "t1", locationSlug: "default", actorUserId: "u1" }), 0);
});
