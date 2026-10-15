/**
 * TUL-379: the seeded "Bozo Guest" thread (bozo-guest+s4@impronta.test, body
 * "[QA TUL-379] ...") on QA Max's account. The reader keeps it: the inbox
 * query returns it and the fixture rule keeps fixtures for a "QA ..." talent.
 * A live talent still never sees it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { filterQaFixtureInboxRows, talentKeepsFixtureThreads } from "@/lib/messages-v5/qa-fixture-row";

import { loadMessagingInbox } from "./inbox";

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      const q: Record<string, unknown> = {
        select: () => q,
        order: () => q,
        limit: () => q,
        is: () => q,
        eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
        in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
        then: (resolve: (v: { data: Row[]; error: null }) => void) => resolve({ data: rows, error: null }),
      };
      return q;
    },
  };
}

const BOZO = {
  id: "5a000379-0000-4000-8000-000000000001",
  tenant_id: "hub",
  location_slug: "default",
  contact_name: "Bozo Guest",
  contact_phone: null,
  contact_email: "bozo-guest+s4@impronta.test",
  conversation_state: "awaiting_customer",
  opportunity_state: null,
  channel: null,
  owner_user_id: null,
  last_customer_message_at: null,
  last_staff_message_at: null,
  resolved_at: null,
  lost_reason: null,
  status: "submitted",
  current_offer_id: null,
  message: "[QA TUL-379] Is Saturday morning open for a manicure?",
  updated_at: "2026-10-13T21:30:04Z",
  version: 1,
};

test("the Bozo seed is returned by the inbox reader and kept for the QA talent", async () => {
  const admin = fakeAdmin({ inquiries: [BOZO] });
  const out = await loadMessagingInbox(admin as never, {
    tenantId: "",
    locationSlug: "all",
    filter: "all",
    actorUserId: "max",
    onlyInquiryIds: [BOZO.id],
  });
  assert.ok(out.ok);
  assert.equal(out.rows.length, 1);
  const max = { isDemo: false, displayName: "QA Fixture — Max Talent" };
  assert.equal(talentKeepsFixtureThreads(max), true);
  const live = { isDemo: false, displayName: "Jane Real" };
  assert.equal(talentKeepsFixtureThreads(live), false);
  assert.equal(filterQaFixtureInboxRows(out.rows).rows.length, 0);
});
