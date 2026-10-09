import assert from "node:assert/strict";
import test from "node:test";

import {
  registrarExpiresAtToIso,
  resolveActiveDomainHealthTransition,
  resolveRenewalNoticeKind,
  shouldResetRenewalNoticeStamps,
  talentDomainNeedsDailyHealthCheck,
  TALENT_DOMAIN_HEALTH_INTERVAL_MS,
} from "./talent-site-domain-health";

test("talentDomainNeedsDailyHealthCheck is due when last check is null or stale", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  assert.equal(talentDomainNeedsDailyHealthCheck(null, now), true);
  assert.equal(
    talentDomainNeedsDailyHealthCheck(
      new Date(now.getTime() - TALENT_DOMAIN_HEALTH_INTERVAL_MS - 1).toISOString(),
      now,
    ),
    true,
  );
  assert.equal(
    talentDomainNeedsDailyHealthCheck(
      new Date(now.getTime() - TALENT_DOMAIN_HEALTH_INTERVAL_MS + 60_000).toISOString(),
      now,
    ),
    false,
  );
});

test("resolveActiveDomainHealthTransition reports DNS and HTTPS failures", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const dnsFail = resolveActiveDomainHealthTransition(
    {
      routingRecords: [],
      matchedRouting: false,
      httpsReachable: false,
      httpsFromVercel: false,
    },
    now,
  );
  assert.equal(dnsFail.healthy, false);
  assert.match(dnsFail.failureReason ?? "", /DNS/i);

  const httpsFail = resolveActiveDomainHealthTransition(
    {
      routingRecords: [],
      matchedRouting: true,
      httpsReachable: false,
      httpsFromVercel: false,
    },
    now,
  );
  assert.equal(httpsFail.healthy, false);
  assert.match(httpsFail.failureReason ?? "", /HTTPS/i);

  const ok = resolveActiveDomainHealthTransition(
    {
      routingRecords: [],
      matchedRouting: true,
      httpsReachable: true,
      httpsFromVercel: true,
    },
    now,
  );
  assert.equal(ok.healthy, true);
  assert.equal(ok.failureReason, null);
});

test("resolveRenewalNoticeKind prefers 7-day when inside both windows", () => {
  const now = new Date("2026-10-09T00:00:00Z");
  const inSixDays = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(
    resolveRenewalNoticeKind({
      registrarExpiresAt: inSixDays,
      notice30dSentAt: null,
      notice7dSentAt: null,
      now,
    }),
    7,
  );

  const inTwentyDays = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(
    resolveRenewalNoticeKind({
      registrarExpiresAt: inTwentyDays,
      notice30dSentAt: null,
      notice7dSentAt: null,
      now,
    }),
    30,
  );

  assert.equal(
    resolveRenewalNoticeKind({
      registrarExpiresAt: inTwentyDays,
      notice30dSentAt: now.toISOString(),
      notice7dSentAt: null,
      now,
    }),
    null,
  );
});

test("shouldResetRenewalNoticeStamps only when expiry moves later", () => {
  assert.equal(
    shouldResetRenewalNoticeStamps("2026-11-01T00:00:00Z", "2027-11-01T00:00:00Z"),
    true,
  );
  assert.equal(
    shouldResetRenewalNoticeStamps("2027-11-01T00:00:00Z", "2026-11-01T00:00:00Z"),
    false,
  );
  assert.equal(shouldResetRenewalNoticeStamps(null, "2027-11-01T00:00:00Z"), false);
});

test("registrarExpiresAtToIso accepts ms number and numeric string", () => {
  const ms = Date.parse("2027-01-15T00:00:00Z");
  assert.equal(registrarExpiresAtToIso(ms), "2027-01-15T00:00:00.000Z");
  assert.equal(registrarExpiresAtToIso(String(ms)), "2027-01-15T00:00:00.000Z");
  assert.equal(registrarExpiresAtToIso(null), null);
  assert.equal(registrarExpiresAtToIso("nope"), null);
});
