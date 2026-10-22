/**
 * TUL-1746 hardening: a refund-pending payout hold that is still held after 3 days raises an alert on the
 * existing platform_alerts path (the usage-audit table, deduped per day + category + content), not just a log
 * line, so a payout cannot sit unexplained forever.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STALE_HOLD_DAYS, alertStaleHeldPayouts, alertStaleRefundPendingHolds } from "./stale-payout-hold-alert";

const NOW = new Date("2026-10-21T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

type Leg = { id: string; booking_id: string; created_at: string; last_error: string };

function fakeSb(legs: Leg[], opts: { readError?: boolean; insertError?: boolean } = {}) {
  const calls: { upserts: Array<{ rows: unknown; options: unknown }>; filters: string[] } = { upserts: [], filters: [] };
  const sb = {
    from(table: string) {
      calls.filters.push(`from:${table}`);
      if (table === "platform_alerts") {
        return {
          upsert: (rows: unknown, options: unknown) => {
            calls.upserts.push({ rows, options });
            return Promise.resolve({ error: opts.insertError ? { message: "boom" } : null });
          },
        };
      }
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "or", "lt", "order", "limit"]) {
        q[m] = (...args: unknown[]) => {
          calls.filters.push(`${m}:${args.map(String).join(",")}`);
          return m === "limit" ? Promise.resolve(opts.readError ? { data: null, error: { message: "down" } } : { data: legs, error: null }) : q;
        };
      }
      return q;
    },
  } as unknown as SupabaseClient;
  return { sb, calls };
}

const stale = (id: string, ageDays: number): Leg => ({ id, booking_id: `bk_${id}`, created_at: daysAgo(ageDays), last_error: "refund pending: Stripe shows 15000 refunded" });

test("the cutoff is three days", () => {
  assert.equal(STALE_HOLD_DAYS, 3);
});

test("holds older than 3 days raise ONE critical platform alert listing them", async () => {
  const { sb, calls } = fakeSb([stale("a", 3.5), stale("b", 9)]);
  const emails: Array<{ to: string; subject: string }> = [];
  const r = await alertStaleHeldPayouts(sb, {
    now: NOW,
    recipient: "ops@example.com",
    sendEmail: async (m) => void emails.push({ to: m.to, subject: m.subject }),
  });
  assert.equal(r.stale, 2);
  assert.equal(calls.upserts.length, 1);
  const row = (calls.upserts[0].rows as Array<Record<string, unknown>>)[0];
  assert.equal(row.severity, "critical");
  assert.equal(row.category, "payout_refund_pending_stale");
  assert.equal(row.audit_date, "2026-10-21");
  assert.match(String(row.message), /2 payout/);
  assert.deepEqual((row.payload as { legs: Array<{ id: string }> }).legs.map((l) => l.id).sort(), ["a", "b"]);
  assert.deepEqual(calls.upserts[0].options, { onConflict: "audit_date,category,content_hash", ignoreDuplicates: true });
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, "ops@example.com");
});

test("the read asks only for old, still-held, zero-amount refund-pending legs, oldest first", async () => {
  const { sb, calls } = fakeSb([]);
  await alertStaleHeldPayouts(sb, { now: NOW });
  assert.ok(calls.filters.includes("eq:status,held"));
  assert.ok(calls.filters.includes("eq:amount_cents,0"));
  const orFilter = calls.filters.find((f) => f.startsWith("or:")) ?? "";
  for (const prefix of ["refund pending", "processing fee", "ledger unreadable"]) {
    assert.ok(orFilter.includes(`last_error.like."${prefix}%"`), `or-filter covers ${prefix}`);
  }
  assert.ok(calls.filters.includes(`lt:created_at,${daysAgo(3)}`));
  assert.ok(calls.filters.some((f) => f.startsWith("order:created_at")));
});

test("nothing stale: no alert, no email", async () => {
  const { sb, calls } = fakeSb([]);
  const emails: unknown[] = [];
  const r = await alertStaleHeldPayouts(sb, { now: NOW, recipient: "ops@example.com", sendEmail: async (m) => void emails.push(m) });
  assert.equal(r.stale, 0);
  assert.equal(calls.upserts.length, 0);
  assert.equal(emails.length, 0);
});

test("the same holds on the same day hash the same (deduped), different holds hash differently", async () => {
  const hashOf = async (legs: Leg[]) => {
    const { sb, calls } = fakeSb(legs);
    await alertStaleHeldPayouts(sb, { now: NOW });
    return (calls.upserts[0].rows as Array<{ content_hash: string }>)[0].content_hash;
  };
  const a = await hashOf([stale("a", 4), stale("b", 5)]);
  const again = await hashOf([stale("b", 5), stale("a", 4)]);
  const other = await hashOf([stale("a", 4), stale("c", 5)]);
  assert.equal(a, again);
  assert.notEqual(a, other);
});

test("an unreadable ledger or a failed insert never throws", async () => {
  const r1 = await alertStaleHeldPayouts(fakeSb([], { readError: true }).sb, { now: NOW });
  assert.equal(r1.stale, 0);
  const r2 = await alertStaleHeldPayouts(fakeSb([stale("a", 5)], { insertError: true }).sb, { now: NOW });
  assert.equal(r2.stale, 1);
});

test("fee-unknown and ledger-unreadable holds are alerted after 3 days too (TUL-1776)", async () => {
  const feeUnknown: Leg = { ...stale("f", 4), last_error: "processing fee unknown: held until the balance transaction is readable" };
  const ledger: Leg = { ...stale("l", 5), last_error: "ledger unreadable: payout ledger could not be read; payout held and retried" };
  const { sb, calls } = fakeSb([feeUnknown, ledger]);
  const r = await alertStaleHeldPayouts(sb, { now: NOW });
  assert.equal(r.stale, 2);
  const row = (calls.upserts[0].rows as Array<Record<string, unknown>>)[0];
  assert.deepEqual((row.payload as { legs: Array<{ reason: string }> }).legs.map((l) => l.reason.split(":")[0]).sort(), ["ledger unreadable", "processing fee unknown"]);
});

test("the legacy alertStaleRefundPendingHolds name still works", () => {
  assert.equal(alertStaleRefundPendingHolds, alertStaleHeldPayouts);
});

test("the reconcile cron raises the alert after the retry", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const src = readFileSync(join(__dirname, "..", "..", "app", "api", "cron", "reconcile-held-payouts", "route.ts"), "utf8");
  assert.match(src, /alertStaleHeldPayouts\(admin\)/);
  assert.ok(src.indexOf("retryFeeUnknownPayouts(admin)") < src.indexOf("alertStaleHeldPayouts(admin)"));
});
