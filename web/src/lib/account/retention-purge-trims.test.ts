import assert from "node:assert/strict";
import test from "node:test";

import { runRetention } from "./retention";
import { runAccountPurge } from "./retention-account-purge";
import { runLogTrims } from "./retention-log-trims";

const NOW = new Date("2026-10-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

type Profile = { id: string; deleted_at: string };
type Cfg = {
  profiles?: Profile[];
  /** completed deletion requests, by completed_at */
  requests?: string[];
  /** `${table}:${profileId}` -> referencing row count */
  refs?: Record<string, number>;
  /** log table -> batches of ids returned by successive selects */
  logBatches?: Record<string, string[][]>;
  /** log table -> exact old-row count */
  logCounts?: Record<string, number>;
  readErrors?: Record<string, string>;
};

/** Fake admin: records every write, applies the deleted_at cutoff itself. */
function fakeAdmin(cfg: Cfg = {}) {
  const writes: string[] = [];
  const deletedIds: string[] = [];
  const ltArgs: Record<string, string> = {};
  const batches = { ...(cfg.logBatches ?? {}) };
  const queues: Record<string, string[][]> = Object.fromEntries(
    Object.entries(batches).map(([k, v]) => [k, [...v]]),
  );

  function builder(table: string) {
    let mode: "select" | "delete" = "select";
    let head = false;
    let hasCursor = false;
    let lt: string | null = null;
    let eqId: string | null = null;
    let inValues: string[] = [];
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = (_c?: string, o?: { head?: boolean }) => {
      head = !!o?.head;
      return b;
    };
    b.delete = () => {
      mode = "delete";
      return b;
    };
    b.update = () => {
      mode = "delete";
      return b;
    };
    for (const m of ["is", "not", "order", "limit", "ilike"]) b[m] = chain;
    b.or = () => {
      hasCursor = true;
      return b;
    };
    b.eq = (col: string, v: string) => {
      if (col === "id" || col === "talent_profile_id" || col === "owner_id" || col === "owner_talent_profile_id") eqId = v;
      return b;
    };
    b.in = (_c: string, v: string[]) => {
      inValues = v;
      return b;
    };
    b.lt = (_c: string, v: string) => {
      lt = v;
      ltArgs[table] = v;
      return b;
    };
    b.then = (res: (v: unknown) => unknown) => {
      const err = cfg.readErrors?.[table];
      if (err) return Promise.resolve({ data: null, count: null, error: { message: err } }).then(res);
      if (mode === "delete") {
        writes.push(`delete:${table}`);
        if (table === "talent_profiles" && eqId) deletedIds.push(eqId);
        return Promise.resolve({ error: null }).then(res);
      }
      if (table === "talent_profiles") {
        const rows = (cfg.profiles ?? []).filter((p) => !lt || p.deleted_at < lt);
        const page = hasCursor ? [] : rows;
        return Promise.resolve({ data: head ? null : page, count: rows.length, error: null }).then(res);
      }
      if (table === "account_deletion_requests") {
        const rows = (cfg.requests ?? []).filter((c) => inValues.includes(c)).map((c) => ({ completed_at: c }));
        return Promise.resolve({ data: rows, count: rows.length, error: null }).then(res);
      }
      if (table in (cfg.logCounts ?? {}) || table in queues) {
        if (head) return Promise.resolve({ data: null, count: cfg.logCounts?.[table] ?? 0, error: null }).then(res);
        const next = (queues[table] ?? []).shift() ?? [];
        return Promise.resolve({ data: next.map((id) => ({ id })), count: next.length, error: null }).then(res);
      }
      const n = eqId ? (cfg.refs?.[`${table}:${eqId}`] ?? 0) : 0;
      return Promise.resolve({ data: [], count: n, error: null }).then(res);
    };
    return b;
  }
  return { writes, deletedIds, ltArgs, admin: { from: (t: string) => builder(t) } };
}

const P = (id: string, days: number): Profile => ({ id, deleted_at: ago(days) });

test("account purge dry run: counts, deletes nothing", async () => {
  const { admin, writes } = fakeAdmin({ profiles: [P("a", 31)], requests: [ago(31)] });
  const errors: string[] = [];
  const r = await runAccountPurge(admin as never, { now: NOW, enforce: false, errors });
  assert.equal(r.candidates, 1);
  assert.equal(r.purgeable, 1);
  assert.equal(r.deleted, 0);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
});

test("account purge enforce: only expired, clear accounts are deleted (29 d kept, 31 d purged)", async () => {
  const { admin, writes, deletedIds } = fakeAdmin({
    profiles: [P("expired-clear", 31), P("too-young", 29), P("booked", 40), P("ordered", 41), P("no-request", 42)],
    requests: [ago(31), ago(29), ago(40), ago(41)],
    refs: { "agency_bookings:booked": 1, "order_lines:ordered": 2 },
  });
  const errors: string[] = [];
  const r = await runAccountPurge(admin as never, { now: NOW, enforce: true, errors });
  assert.equal(r.candidates, 4); // too-young is not past the cutoff
  assert.equal(r.scanned, 4);
  assert.equal(r.deleted, 1);
  assert.deepEqual(deletedIds, ["expired-clear"]);
  assert.deepEqual(writes, ["delete:talent_profiles"]);
  assert.deepEqual(r.keptByReason, { booking: 1, order: 1, no_completed_request: 1 });
  assert.deepEqual(errors, []);
});

test("an account with a payout account or media row is kept even when expired", async () => {
  const { admin, writes } = fakeAdmin({
    profiles: [P("paid", 60), P("media", 61)],
    requests: [ago(60), ago(61)],
    refs: { "payout_accounts:paid": 1, "media_assets:media": 3 },
  });
  const r = await runAccountPurge(admin as never, { now: NOW, enforce: true, errors: [] });
  assert.equal(r.deleted, 0);
  assert.deepEqual(writes, []);
  assert.deepEqual(r.keptByReason, { payout_account: 1, media_rows_remain: 1 });
});

test("a guard read error keeps the account and is collected", async () => {
  const { admin, writes } = fakeAdmin({
    profiles: [P("a", 31)],
    requests: [ago(31)],
    readErrors: { ledger_entries: "boom" },
  });
  const errors: string[] = [];
  const r = await runAccountPurge(admin as never, { now: NOW, enforce: true, errors });
  assert.equal(r.deleted, 0);
  assert.deepEqual(writes, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ledger_entries: boom/);
});

test("log trims dry run: exact counts, no writes", async () => {
  const { admin, writes } = fakeAdmin({ logCounts: { analytics_events: 3200, notification_dispatch_log: 19 } });
  const errors: string[] = [];
  const r = await runLogTrims(admin as never, { now: NOW, enforce: false, errors });
  assert.equal(r.analyticsEvents.olderThanCutoff, 3200);
  assert.equal(r.notificationDispatchLog.olderThanCutoff, 19);
  assert.equal(r.analyticsEvents.deleted, 0);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
});

test("log trims enforce: bounded batches, 90-day cutoff, only the two log tables", async () => {
  const { admin, writes, ltArgs } = fakeAdmin({
    logCounts: { analytics_events: 5, notification_dispatch_log: 1 },
    logBatches: { analytics_events: [["1", "2"], ["3", "4"], ["5"]], notification_dispatch_log: [["9"]] },
  });
  const errors: string[] = [];
  const r = await runLogTrims(admin as never, { now: NOW, enforce: true, batch: 2, errors });
  assert.equal(r.analyticsEvents.deleted, 5);
  assert.equal(r.notificationDispatchLog.deleted, 1);
  assert.equal(ltArgs.analytics_events, ago(90));
  assert.equal(r.analyticsEvents.cutoff, ago(90));
  assert.deepEqual(writes, [
    "delete:analytics_events",
    "delete:analytics_events",
    "delete:analytics_events",
    "delete:notification_dispatch_log",
  ]);
  assert.deepEqual(errors, []);
});

test("log trims stop at the per-run batch bound", async () => {
  const { admin, writes } = fakeAdmin({
    logCounts: { analytics_events: 100 },
    logBatches: { analytics_events: [["1", "2"], ["3", "4"], ["5", "6"], ["7", "8"]] },
  });
  const r = await runLogTrims(admin as never, { now: NOW, enforce: true, batch: 2, maxBatches: 2, errors: [] });
  assert.equal(r.analyticsEvents.deleted, 4);
  assert.equal(writes.length, 2);
});

test("a read error in one step is collected and the other steps still run; report carries the new fields", async () => {
  const { admin, writes } = fakeAdmin({
    readErrors: { talent_profiles: "profiles down" },
    logCounts: { analytics_events: 2, notification_dispatch_log: 0 },
    logBatches: { analytics_events: [["1", "2"]] },
  });
  const r = await runRetention(admin as never, { now: NOW, enforce: true });
  assert.ok(r.errors.some((e) => e.startsWith("account_purge:") && e.includes("profiles down")));
  assert.equal(r.analyticsEvents.deleted, 2);
  assert.equal(r.analyticsEvents.olderThanCutoff, 2);
  assert.equal(r.notificationDispatchLog.olderThanCutoff, 0);
  assert.equal(r.deletedAccounts.deleted, 0);
  assert.equal(typeof r.deletedAccounts.candidates, "number");
  assert.equal(typeof r.deletedAccounts.keptByReason, "object");
  assert.deepEqual(writes, ["delete:analytics_events"]);
});

test("runRetention dry run performs no writes in any step", async () => {
  const { admin, writes } = fakeAdmin({
    profiles: [P("a", 31)],
    requests: [ago(31)],
    logCounts: { analytics_events: 7, notification_dispatch_log: 3 },
  });
  const r = await runRetention(admin as never, { now: NOW, enforce: false });
  assert.equal(r.deletedAccounts.purgeable, 1);
  assert.equal(r.deletedAccounts.deleted, 0);
  assert.equal(r.analyticsEvents.olderThanCutoff, 7);
  assert.deepEqual(writes, []);
  assert.deepEqual(r.errors, []);
});
