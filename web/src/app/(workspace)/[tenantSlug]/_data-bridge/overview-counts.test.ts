import assert from "node:assert/strict";
import { test } from "node:test";

import { mapOverviewCounts } from "./overview-counts";

test("maps every key the workspace_overview_counts function returns", () => {
  const out = mapOverviewCounts({
    roster_total: 4,
    roster_published: 3,
    open_inquiries: 5,
    team_members: 2,
    pending_approvals: 1,
    awaiting_client: 6,
    draft_inquiries: 7,
    unassigned_open: 8,
    agency_action: 9,
    ready_to_book: 10,
    oldest_coordinator_created_at: "2026-10-01T00:00:00+00:00",
    next_booking: { contact_name: "Ana", event_date: "2026-11-02" },
  });
  assert.deepEqual(out, {
    rosterTotal: 4,
    rosterPublished: 3,
    openInquiries: 5,
    teamMembers: 2,
    pendingApprovals: 1,
    awaitingClientCount: 6,
    draftInquiryCount: 7,
    unassignedOpenCount: 8,
    agencyActionCount: 9,
    readyToBookCount: 10,
    oldestCoordinatorCreatedAt: "2026-10-01T00:00:00+00:00",
    nextBooking: { contactName: "Ana", eventDate: "2026-11-02" },
  });
});

test("a failed or empty call reads as zeros, never throws", () => {
  for (const bad of [null, undefined, "x", [], 5]) {
    const out = mapOverviewCounts(bad);
    assert.equal(out.openInquiries, 0);
    assert.equal(out.nextBooking, null);
  }
  assert.equal(mapOverviewCounts({ roster_total: "3" }).rosterTotal, 3);
  assert.equal(mapOverviewCounts({ next_booking: null }).nextBooking, null);
});

test("the migration the mapper reads from exists and is invoker-secured", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(
    new URL("../../../../../../supabase/migrations/20261231356000_workspace_overview_counts.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
  for (const key of ["roster_total", "open_inquiries", "ready_to_book", "next_booking", "oldest_coordinator_created_at"]) {
    assert.ok(sql.includes(`'${key}'`), key);
  }
});

test("legacy fallback returns the same shape from per-table reads", async () => {
  const { loadOverviewCountsLegacy } = await import("./overview-counts-legacy");
  const calls: string[] = [];
  // A chainable stand-in: every filter returns itself, awaiting yields the result.
  const query = (table: string) => {
    calls.push(table);
    const result =
      table === "agency_talent_roster"
        ? {
            data: [
              { status: "active", talent_profiles: { workflow_status: "published" } },
              { status: "pending", talent_profiles: { workflow_status: "draft" } },
            ],
            count: 2,
            error: null,
          }
        : { data: [], count: 3, error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "is", "in", "not", "gte", "order", "limit"]) {
      chain[m] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return chain;
  };
  const fake = { from: query } as unknown as Parameters<typeof loadOverviewCountsLegacy>[0];
  const out = await loadOverviewCountsLegacy(fake, "t1");
  assert.equal(calls.length, 11, "ten counts plus the roster read, one request each");
  assert.equal(out.rosterTotal, 2);
  assert.equal(out.rosterPublished, 1);
  assert.equal(out.openInquiries, 3);
  assert.equal(out.nextBooking, null);
});
