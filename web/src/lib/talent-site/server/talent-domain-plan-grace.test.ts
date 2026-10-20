import test from "node:test";
import assert from "node:assert/strict";

import {
  TALENT_DOMAIN_PLAN_GRACE_DAYS,
  computePlanGraceWindow,
  graceDetachDue,
  isInPlanGrace,
  isPurchasedAcquisition,
  planGrantsCustomDomain,
  shouldBeginDomainPlanGrace,
  shouldClearDomainPlanGrace,
} from "./talent-domain-plan-grace";

test("computePlanGraceWindow is 30 UTC days", () => {
  const now = new Date("2026-10-09T12:00:00.000Z");
  const { startedAt, endsAt } = computePlanGraceWindow(now);
  assert.equal(startedAt, "2026-10-09T12:00:00.000Z");
  assert.equal(endsAt, "2026-11-08T12:00:00.000Z");
  assert.equal(TALENT_DOMAIN_PLAN_GRACE_DAYS, 30);
});

test("planGrantsCustomDomain only for Web Office (portfolio)", () => {
  assert.equal(planGrantsCustomDomain("talent_portfolio"), true);
  assert.equal(planGrantsCustomDomain("max"), true);
  assert.equal(planGrantsCustomDomain("talent_pro"), false);
  assert.equal(planGrantsCustomDomain("talent_basic"), false);
  assert.equal(planGrantsCustomDomain(null), false);
});

test("shouldBeginDomainPlanGrace on losing Web Office", () => {
  assert.equal(shouldBeginDomainPlanGrace("talent_portfolio", "talent_basic"), true);
  assert.equal(shouldBeginDomainPlanGrace("talent_portfolio", "talent_pro"), true);
  assert.equal(shouldBeginDomainPlanGrace("talent_pro", "talent_basic"), false);
  assert.equal(shouldBeginDomainPlanGrace("talent_portfolio", "talent_portfolio"), false);
});

test("shouldClearDomainPlanGrace on restoring Web Office", () => {
  assert.equal(shouldClearDomainPlanGrace("talent_basic", "talent_portfolio"), true);
  assert.equal(shouldClearDomainPlanGrace("talent_pro", "talent_portfolio"), true);
  assert.equal(shouldClearDomainPlanGrace("talent_portfolio", "talent_basic"), false);
});

test("isPurchasedAcquisition", () => {
  assert.equal(isPurchasedAcquisition("purchased"), true);
  assert.equal(isPurchasedAcquisition("connected"), false);
  assert.equal(isPurchasedAcquisition(null), false);
});

test("graceDetachDue after ends_at and not yet detached", () => {
  const now = new Date("2026-11-09T00:00:00.000Z");
  assert.equal(
    graceDetachDue(
      {
        planGraceEndsAt: "2026-11-08T12:00:00.000Z",
        vercelDetachedAt: null,
      },
      now,
    ),
    true,
  );
  assert.equal(
    graceDetachDue(
      {
        planGraceEndsAt: "2026-11-10T12:00:00.000Z",
        vercelDetachedAt: null,
      },
      now,
    ),
    false,
  );
  assert.equal(
    graceDetachDue(
      {
        planGraceEndsAt: "2026-11-08T12:00:00.000Z",
        vercelDetachedAt: "2026-11-08T13:00:00.000Z",
      },
      now,
    ),
    false,
  );
});

test("isInPlanGrace during open window", () => {
  const now = new Date("2026-10-20T00:00:00.000Z");
  assert.equal(
    isInPlanGrace(
      {
        planGraceStartedAt: "2026-10-09T12:00:00.000Z",
        planGraceEndsAt: "2026-11-08T12:00:00.000Z",
        vercelDetachedAt: null,
      },
      now,
    ),
    true,
  );
  assert.equal(
    isInPlanGrace(
      {
        planGraceStartedAt: "2026-10-09T12:00:00.000Z",
        planGraceEndsAt: "2026-11-08T12:00:00.000Z",
        vercelDetachedAt: "2026-11-08T13:00:00.000Z",
      },
      now,
    ),
    false,
  );
});

// TUL-835 / main fix: the orphan backfill gates on the EFFECTIVE (dunning-aware) plan.
import { sweepTalentDomainPlanGrace } from "./talent-domain-plan-grace";

type SweepRow = Record<string, unknown>;

function sweepAdmin(opts: { plan: string; pastDueDaysAgo: number | null }) {
  const stamped: string[] = [];
  const pastDue = opts.pastDueDaysAgo == null ? [] : [
    { talent_profile_id: "tp1", status: "past_due", past_due_since: new Date(Date.now() - opts.pastDueDaysAgo * 86_400_000).toISOString() },
  ];
  const tables: Record<string, SweepRow[]> = {
    talent_site_domains: [{ id: "d1", talent_profile_id: "tp1", domain: "ana.example", acquisition: "bring_your_own", plan_grace_started_at: null, plan_grace_ends_at: null, vercel_detached_at: null }],
    talent_profiles: [{ id: "tp1", talent_plan_key: opts.plan }],
    talent_subscriptions: pastDue,
  };
  const admin = {
    from: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      let updating = false;
      const q: Record<string, unknown> = {
        select: () => q,
        is: (c: string, v: unknown) => ((rows = rows.filter((r) => (r[c] ?? null) === v)), q),
        not: () => q,
        lte: () => ((rows = []), q),
        in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
        eq: (c: string, v: unknown) => {
          rows = rows.filter((r) => r[c] === v);
          if (updating && table === "talent_site_domains") stamped.push(String(v));
          return q;
        },
        limit: () => q,
        update: () => ((updating = true), q),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: { data: SweepRow[]; error: null }) => unknown) => res({ data: rows, error: null }),
      };
      return q;
    },
  };
  return { admin: admin as never, stamped };
}

test("sweep: a stored Web Office plan past the dunning grace now starts the domain grace", async () => {
  const { admin, stamped } = sweepAdmin({ plan: "talent_portfolio", pastDueDaysAgo: 30 });
  await sweepTalentDomainPlanGrace(admin, { now: new Date() });
  assert.ok(stamped.includes("d1"), "effective plan is Free, so the grace is stamped");
});

test("sweep: a past_due talent still inside the dunning grace keeps the domain (no grace)", async () => {
  const { admin, stamped } = sweepAdmin({ plan: "talent_portfolio", pastDueDaysAgo: 2 });
  await sweepTalentDomainPlanGrace(admin, { now: new Date() });
  assert.equal(stamped.length, 0);
});

test("sweep: a stored Web Office plan with no billing problem keeps the domain", async () => {
  const { admin, stamped } = sweepAdmin({ plan: "talent_portfolio", pastDueDaysAgo: null });
  await sweepTalentDomainPlanGrace(admin, { now: new Date() });
  assert.equal(stamped.length, 0);
});
