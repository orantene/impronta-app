import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  sweepActiveTalentSiteDomainHealth,
  sweepPendingTalentSiteDomainVerifications,
  sweepTalentSiteDomainRenewals,
} from "./talent-site-domain-cron";

type Row = Record<string, unknown>;

function makeAdmin(rows: Row[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const client = {
    from(_table: string) {
      return {
        select() {
          return {
            in(_col: string, statuses: string[]) {
              const filtered = rows.filter((r) =>
                statuses.includes(String(r.status)),
              );
              return {
                order() {
                  return {
                    limit() {
                      return Promise.resolve({ data: filtered, error: null });
                    },
                  };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              updates.push({ id, patch });
              const row = rows.find((r) => r.id === id);
              if (row) Object.assign(row, patch);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, updates };
}

function baseActive(overrides: Row = {}): Row {
  return {
    id: "dom-1",
    talent_profile_id: "tal-1",
    domain: "example.com",
    status: "active",
    verification_token: "tok",
    is_primary: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    verified_at: "2026-01-01T00:00:00Z",
    ssl_provisioned_at: "2026-01-01T00:00:00Z",
    last_health_check_at: null,
    failure_reason: null,
    registrar_expires_at: null,
    renewal_notice_30d_sent_at: null,
    renewal_notice_7d_sent_at: null,
    breakage_notified_at: null,
    ...overrides,
  };
}

test("sweepActiveTalentSiteDomainHealth notifies once on breakage and sets failure_reason", async () => {
  const row = baseActive();
  const { client, updates } = makeAdmin([row]);
  const notified: string[] = [];

  const report = await sweepActiveTalentSiteDomainHealth(client, {
    now: new Date("2026-10-09T12:00:00Z"),
    resolveARecords: async () => [],
    resolveCnameRecords: async () => [],
    httpsProbe: async () => ({ reachable: false, fromVercel: false }),
    notifyBroken: async (p) => {
      notified.push(p.domain);
    },
  });

  assert.equal(report.scanned, 1);
  assert.equal(report.broken, 1);
  assert.equal(report.notified, 1);
  assert.deepEqual(notified, ["example.com"]);
  assert.equal(typeof updates[0]?.patch.failure_reason, "string");
  assert.equal(typeof updates[0]?.patch.breakage_notified_at, "string");
});

test("sweepActiveTalentSiteDomainHealth does not re-notify when breakage_notified_at is set", async () => {
  const row = baseActive({
    breakage_notified_at: "2026-10-08T12:00:00Z",
    failure_reason: "prior",
  });
  const { client } = makeAdmin([row]);
  let calls = 0;

  const report = await sweepActiveTalentSiteDomainHealth(client, {
    now: new Date("2026-10-09T12:00:00Z"),
    resolveARecords: async () => [],
    resolveCnameRecords: async () => [],
    httpsProbe: async () => ({ reachable: false, fromVercel: false }),
    notifyBroken: async () => {
      calls += 1;
    },
  });

  assert.equal(report.notified, 0);
  assert.equal(calls, 0);
});

test("sweepActiveTalentSiteDomainHealth clears failure on recovery", async () => {
  const row = baseActive({
    failure_reason: "DNS routing records are missing or no longer point to Tulala.",
    breakage_notified_at: "2026-10-08T12:00:00Z",
  });
  const { client, updates } = makeAdmin([row]);

  const report = await sweepActiveTalentSiteDomainHealth(client, {
    now: new Date("2026-10-09T12:00:00Z"),
    resolveARecords: async () => ["76.76.21.21"],
    resolveCnameRecords: async () => [],
    httpsProbe: async () => ({ reachable: true, fromVercel: true }),
    notifyBroken: async () => {
      throw new Error("should not notify on recovery");
    },
  });

  assert.equal(report.healthy, 1);
  assert.equal(updates[0]?.patch.failure_reason, null);
  assert.equal(updates[0]?.patch.breakage_notified_at, null);
});

test("sweepTalentSiteDomainRenewals stores expiry and sends 30-day notice", async () => {
  const now = new Date("2026-10-09T00:00:00Z");
  const expires = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString();
  const row = baseActive();
  const { client, updates } = makeAdmin([row]);
  const notices: Array<{ days: number; domain: string }> = [];

  const report = await sweepTalentSiteDomainRenewals(client, {
    now,
    fetchRegistrarInfo: async () => ({
      attempted: true,
      expiresAtIso: expires,
      autoRenew: true,
      skippedReason: null,
      errorCode: null,
      errorMessage: null,
    }),
    notifyRenewal: async (p) => {
      notices.push({ days: p.days, domain: p.domain });
    },
  });

  assert.equal(report.expiryUpdated, 1);
  assert.equal(report.noticed30d, 1);
  assert.deepEqual(notices, [{ days: 30, domain: "example.com" }]);
  assert.equal(updates.some((u) => u.patch.registrar_expires_at === expires), true);
  assert.equal(typeof updates.find((u) => u.patch.renewal_notice_30d_sent_at)?.patch.renewal_notice_30d_sent_at, "string");
});

test("sweepPendingTalentSiteDomainVerifications advances on TXT match", async () => {
  const row = baseActive({
    status: "dns_verification_sent",
    verification_token: "impronta-verify-abc",
    verified_at: null,
    ssl_provisioned_at: null,
    last_health_check_at: null,
  });
  const { client, updates } = makeAdmin([row]);

  const report = await sweepPendingTalentSiteDomainVerifications(client, {
    now: new Date("2026-10-09T12:00:00Z"),
    txtResolver: async () => [["impronta-verify-abc"]],
  });

  assert.equal(report.verified, 1);
  assert.equal(updates[0]?.patch.status, "verified");
});
