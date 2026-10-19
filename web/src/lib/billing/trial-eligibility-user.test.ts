import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { decideCheckoutTrialDays } from "./trial-eligibility";
import {
  JOINED_MEMBERSHIP_STATUSES,
  mergeHistoryReads,
  readSubjectHistory,
  type HistoryDb,
} from "./trial-eligibility-readers";

/**
 * TUL-1280 review: ONE TRIAL PER USER across talent and workspaces, and no
 * surface promises a trial that Checkout will not apply. Fakes only.
 */

const OFFER = { isEnabled: true, trialDays: 14 };
const USER = "22222222-2222-4222-8222-222222222222";
const PROFILE = "11111111-1111-4111-8111-111111111111";
const WS_OLD = "33333333-3333-4333-8333-333333333333";
const WS_NEW = "44444444-4444-4444-8444-444444444444";

type Result = { data: unknown; error: unknown };

/** Per-table fake: each `.from(table)` resolves to that table's result; records the filters. */
function tableDb(results: Record<string, Result>) {
  const seen: string[] = [];
  type Chain = Promise<Result> & {
    eq: (c: string, v: string) => Chain;
    in: (c: string, v: readonly string[]) => Chain;
    or: (f: string) => Chain;
    limit: (n: number) => Chain;
  };
  const db: HistoryDb = {
    from: (table: string) => ({
      select: (cols: string) => {
        seen.push(`${table}.select:${cols}`);
        const chain: Chain = Object.assign(Promise.resolve(results[table] ?? { data: [], error: null }), {
          eq: (c: string, v: string) => (seen.push(`${table}.eq:${c}=${v}`), chain),
          in: (c: string, v: readonly string[]) => (seen.push(`${table}.in:${c}=${v.join("|")}`), chain),
          or: (f: string) => (seen.push(`${table}.or:${f}`), chain),
          limit: (n: number) => (seen.push(`${table}.limit:${n}`), chain),
        });
        return chain;
      },
    }),
  };
  return { db, seen };
}

function decide(db: HistoryDb, subject: Parameters<typeof readSubjectHistory>[1]) {
  const errors: string[] = [];
  const days = decideCheckoutTrialDays(OFFER, {
    readDbHistory: () => readSubjectHistory(db, subject),
    readStripeHistory: async () => ({ data: [], error: null }),
    onError: (w) => errors.push(w),
  });
  return { days, errors };
}

test("workspace subject with a cancelled row gets no trial", async () => {
  const { db } = tableDb({ workspace_subscriptions: { data: [{ status: "cancelled", trial_end: null }], error: null } });
  assert.equal(await decide(db, { kind: "workspace", tenantId: WS_NEW, buyerUserId: USER }).days, null);
  assert.equal(await decide(db, { kind: "workspace", tenantId: WS_NEW }).days, null);
});

test("the same user's SECOND workspace gets no trial (first workspace trialed)", async () => {
  // The new workspace has no row; the user's membership points at the old one, which trialed.
  const results: Record<string, Result> = {
    agency_memberships: { data: [{ tenant_id: WS_OLD }, { tenant_id: WS_NEW }], error: null },
    workspace_subscriptions: { data: [], error: null },
  };
  const { db, seen } = tableDb(results);
  // The membership-driven read covers every workspace the buyer joined.
  const merged = await readSubjectHistory(db, { kind: "workspace", tenantId: WS_NEW, buyerUserId: USER });
  assert.equal(merged.error, null);
  assert.ok(seen.includes(`agency_memberships.eq:profile_id=${USER}`));
  assert.ok(seen.includes(`agency_memberships.in:status=${JOINED_MEMBERSHIP_STATUSES.join("|")}`));
  assert.ok(seen.includes(`workspace_subscriptions.in:tenant_id=${WS_OLD}|${WS_NEW}`));
  assert.ok(seen.includes(`talent_subscriptions.eq:user_id=${USER}`), "the buyer's talent trials count too");

  const withOldTrial = tableDb({
    agency_memberships: { data: [{ tenant_id: WS_OLD }], error: null },
    workspace_subscriptions: { data: [{ status: "cancelled", trial_end: "2026-09-01T00:00:00Z" }], error: null },
  });
  assert.equal(await decide(withOldTrial.db, { kind: "workspace", tenantId: WS_NEW, buyerUserId: USER }).days, null);
});

test("a user who trialed as a talent gets no workspace trial, and vice versa", async () => {
  const talentTrialed = tableDb({ talent_subscriptions: { data: [{ status: "cancelled", trial_end: "2026-09-01T00:00:00Z" }], error: null } });
  assert.equal(await decide(talentTrialed.db, { kind: "workspace", tenantId: WS_NEW, buyerUserId: USER }).days, null);
  assert.equal(await decide(talentTrialed.db, { kind: "user", userId: USER }).days, null);

  const wsTrialed = tableDb({
    agency_memberships: { data: [{ tenant_id: WS_OLD }], error: null },
    workspace_subscriptions: { data: [{ status: "trialing", trial_end: null }], error: null },
  });
  assert.equal(await decide(wsTrialed.db, { kind: "talent", talentProfileId: PROFILE, userId: USER }).days, null);
});

test("a brand-new user with no history anywhere still gets the trial", async () => {
  const { db } = tableDb({});
  assert.equal(await decide(db, { kind: "workspace", tenantId: WS_NEW, buyerUserId: USER }).days, 14);
  assert.equal(await decide(db, { kind: "talent", talentProfileId: PROFILE, userId: USER }).days, 14);
  assert.equal(await decide(db, { kind: "user", userId: USER }).days, 14);
});

test("no buyerUserId: per-workspace history only (no membership or talent reads)", async () => {
  const { db, seen } = tableDb({});
  await readSubjectHistory(db, { kind: "workspace", tenantId: WS_NEW, buyerUserId: null });
  assert.ok(seen.every((s) => s.startsWith("workspace_subscriptions.")), seen.join(","));
  assert.ok(seen.includes(`workspace_subscriptions.eq:tenant_id=${WS_NEW}`));
});

test("a failed membership read fails closed: no trial", async () => {
  const { db } = tableDb({ agency_memberships: { data: null, error: { message: "denied" } } });
  const r = decide(db, { kind: "user", userId: USER });
  assert.equal(await r.days, null);
  assert.deepEqual(r.errors, ["billing.trialEligibility.db"]);
});

test("mergeHistoryReads: any error wins, otherwise rows concatenate", () => {
  assert.deepEqual(
    mergeHistoryReads([{ data: [{ status: "active" }], error: null }, { data: [], error: null }]),
    { data: [{ status: "active" }], error: null },
  );
  assert.ok(mergeHistoryReads([{ data: [], error: null }, { data: null, error: "x" }]).error);
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("wiring: workspace checkout passes the buyer; promise surfaces use the DB-only rule", () => {
  assert.match(
    read("src/lib/stripe/workspace-billing.ts"),
    /checkoutTrialDays\(\{ kind: "workspace", tenantId: opts\.tenantId, buyerUserId: opts\.buyerUserId \}/,
  );
  const door = read("src/lib/server-actions/trial-door.ts");
  assert.match(door, /displayTrialDays\(\{ kind: "user", userId: session\.user\.id \}, offer\)/);
  assert.doesNotMatch(door, /offer\?\.isEnabled/, "the door no longer promises the trial from the offer alone");
  for (const p of ["src/lib/server-actions/talent-plan-summary.ts", "src/lib/server-actions/workspace-plan-summary.ts"]) {
    const src = read(p);
    assert.match(src, /await displayTrialDays\(/, p);
    assert.match(src, /isTrialEnabled: offerTrialDays > 0,/, p);
  }
  const server = read("src/lib/billing/trial-eligibility.server.ts");
  assert.match(server, /readStripeHistory: null/, "display surfaces never call Stripe");
});
