import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  deriveBlockers,
  executeDeletionRequest,
  isDeletionConfirmation,
  isExecutable,
  scheduledForFrom,
  type DeletionBlocker,
  type DeletionRequestRow,
  type ExecutorDeps,
} from "./deletion";

const NOW = new Date("2026-10-20T05:00:00.000Z");
const USER = "11111111-2222-3333-4444-555555555555";

const CLEAR = { futureBookings: 0, pendingPayouts: 0, fundedBalanceCents: 0, partiallyPaidBookings: 0, teamWorkspaces: 0 };

test("grace period is 14 days", () => {
  const at = new Date("2026-10-01T10:00:00.000Z");
  assert.equal(scheduledForFrom(at).toISOString(), "2026-10-15T10:00:00.000Z");
});

test("typed confirmation accepts DELETE / ELIMINAR in any case, nothing else", () => {
  assert.equal(isDeletionConfirmation(" delete "), true);
  assert.equal(isDeletionConfirmation("Eliminar"), true);
  assert.equal(isDeletionConfirmation("delet"), false);
  assert.equal(isDeletionConfirmation(""), false);
});

test("blockers: none when everything is clear", () => {
  assert.deepEqual(deriveBlockers(CLEAR), []);
});

test("blockers: each condition maps to its code with its count", () => {
  const b = deriveBlockers({ futureBookings: 2, pendingPayouts: 1, fundedBalanceCents: 500, partiallyPaidBookings: 3, teamWorkspaces: 1 });
  assert.deepEqual(b, [
    { code: "future_booking", count: 2 },
    { code: "payout_pending", count: 1 },
    { code: "balance_on_account", count: 1 },
    { code: "balance_owed", count: 3 },
    { code: "workspace_has_team", count: 1 },
  ]);
});

test("blockers: a zero or negative balance is not a blocker", () => {
  assert.deepEqual(deriveBlockers({ ...CLEAR, fundedBalanceCents: 0 }), []);
  assert.deepEqual(deriveBlockers({ ...CLEAR, fundedBalanceCents: -100 }), []);
});

// ── executor state machine ───────────────────────────────────────────────────

function req(over: Partial<DeletionRequestRow> = {}): DeletionRequestRow {
  return {
    id: "req-1",
    user_id: USER,
    status: "pending",
    scheduled_for: "2026-10-15T00:00:00.000Z",
    attempt_count: 0,
    last_attempt_at: null,
    ...over,
  };
}

function deps(over: Partial<ExecutorDeps> & { blockers?: DeletionBlocker[]; authExists?: boolean } = {}) {
  const log: string[] = [];
  const finished: Array<Record<string, unknown>> = [];
  const d: ExecutorDeps = {
    claim: async () => {
      log.push("claim");
      return true;
    },
    loadSubject: async (userId) => {
      log.push("loadSubject");
      return { subject: { userId, email: "a@b.com", talentProfileIds: [] }, authUserExists: over.authExists ?? true };
    },
    loadBlockers: async () => {
      log.push("loadBlockers");
      return over.blockers ?? [];
    },
    anonymize: async () => {
      log.push("anonymize");
      return { ok: true, steps: [{ label: "x", ok: true }] };
    },
    deleteAuthUser: async () => {
      log.push("deleteAuthUser");
      return { ok: true };
    },
    finish: async (_r, patch) => {
      log.push(`finish:${patch.status}`);
      finished.push(patch);
    },
    ...over,
  };
  return { d, log, finished };
}

test("not due yet: skipped, nothing touched", async () => {
  const { d, log } = deps();
  const out = await executeDeletionRequest(req({ scheduled_for: "2026-11-01T00:00:00.000Z" }), d, NOW);
  assert.deepEqual(out, { kind: "skipped", reason: "not_due" });
  assert.deepEqual(log, []);
});

test("cancelled or completed requests are never executed", async () => {
  for (const status of ["cancelled", "completed"] as const) {
    const { d, log } = deps();
    const out = await executeDeletionRequest(req({ status }), d, NOW);
    assert.equal(out.kind, "skipped");
    assert.deepEqual(log, []);
  }
});

test("lost claim (cancelled in between, or another run): skipped", async () => {
  const { d, log } = deps({ claim: async () => false });
  const out = await executeDeletionRequest(req(), d, NOW);
  assert.deepEqual(out, { kind: "skipped", reason: "not_claimed" });
  assert.deepEqual(log, []);
});

test("happy path order: blockers, anonymize, THEN delete auth, then complete", async () => {
  const { d, log, finished } = deps();
  const out = await executeDeletionRequest(req(), d, NOW);
  assert.deepEqual(out, { kind: "completed", alreadyGone: false });
  assert.deepEqual(log, ["claim", "loadSubject", "loadBlockers", "anonymize", "deleteAuthUser", "finish:completed"]);
  assert.equal(finished[0].completed_at, NOW.toISOString());
});

test("blockers present: request kept as blocked, nothing anonymized or deleted", async () => {
  const blockers: DeletionBlocker[] = [{ code: "future_booking", count: 1 }];
  const { d, log, finished } = deps({ blockers });
  const out = await executeDeletionRequest(req(), d, NOW);
  assert.deepEqual(out, { kind: "blocked", blockers });
  assert.deepEqual(log, ["claim", "loadSubject", "loadBlockers", "finish:blocked"]);
  assert.deepEqual(finished[0].blockers, blockers);
});

test("a blocked request is re-evaluated on the next run and goes ahead once clear", async () => {
  const { d, log } = deps();
  const out = await executeDeletionRequest(req({ status: "blocked" }), d, NOW);
  assert.equal(out.kind, "completed");
  assert.ok(log.includes("deleteAuthUser"));
});

test("anonymize failure: auth user is NOT deleted, request marked failed", async () => {
  const { d, log, finished } = deps({
    anonymize: async () => ({ ok: false, steps: [{ label: "inquiries_as_client", ok: false, error: "boom" }] }),
  });
  const out = await executeDeletionRequest(req(), d, NOW);
  assert.equal(out.kind, "failed");
  assert.equal(log.includes("deleteAuthUser"), false);
  assert.equal(finished[0].status, "failed");
  assert.match(String(finished[0].last_error), /inquiries_as_client: boom/);
});

test("retry after the auth user was already deleted completes without redoing anything", async () => {
  const { d, log } = deps({ authExists: false });
  const out = await executeDeletionRequest(req({ status: "failed", attempt_count: 1 }), d, NOW);
  assert.deepEqual(out, { kind: "completed", alreadyGone: true });
  assert.deepEqual(log, ["claim", "loadSubject", "finish:completed"]);
});

test("a thrown error is recorded as failed, never as completed", async () => {
  const { d, finished } = deps({
    loadBlockers: async () => {
      throw new Error("booking_talent: timeout");
    },
  });
  const out = await executeDeletionRequest(req(), d, NOW);
  assert.equal(out.kind, "failed");
  assert.equal(finished[0].status, "failed");
});

test("processing is re-claimable only once stale (crashed run)", () => {
  assert.equal(isExecutable(req({ status: "processing", last_attempt_at: "2026-10-20T04:30:00.000Z" }), NOW), false);
  assert.equal(isExecutable(req({ status: "processing", last_attempt_at: "2026-10-20T03:00:00.000Z" }), NOW), true);
  assert.equal(isExecutable(req({ status: "failed" }), NOW), true);
  assert.equal(isExecutable(req({ status: "cancelled" }), NOW), false);
});

// ── migration pins ───────────────────────────────────────────────────────────

const MIGRATION = readFileSync(
  join(process.cwd(), "..", "supabase", "migrations", "20261231299900_account_deletion_requests.sql"),
  "utf8",
);

test("migration relaxes every FK that would make deleting a user fail", () => {
  for (const [table, col] of [
    ["inquiry_coordinators", "user_id"],
    ["inquiry_action_log", "actor_user_id"],
    ["inquiry_attachments", "uploaded_by"],
    ["talent_representation_requests", "requested_by"],
    ["client_balance_ledger", "user_id"],
  ]) {
    assert.match(MIGRATION, new RegExp(`fk_set_null\\('public\\.${table}', '${col}'`), `${table}.${col}`);
  }
});

test("migration never changes booking_transactions or agency_bookings deletion semantics", () => {
  assert.equal(/ALTER TABLE public\.(booking_transactions|agency_bookings)/i.test(MIGRATION), false);
  assert.equal(/fk_set_null\('public\.(booking_transactions|agency_bookings)'/.test(MIGRATION), false);
});
