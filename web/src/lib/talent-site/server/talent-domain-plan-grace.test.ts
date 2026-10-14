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
