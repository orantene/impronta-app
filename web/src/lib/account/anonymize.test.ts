import test from "node:test";
import assert from "node:assert/strict";

import {
  DELETED_USER_LABEL,
  anonymizeUserData,
  anonymizedEmailFor,
  buildAnonymizationPlan,
  escapeLikeLiteral,
  isAnonymizedEmail,
  type AnonymizeOp,
} from "./anonymize";

const USER = "11111111-2222-3333-4444-555555555555";
const TALENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NOW = "2026-10-01T00:00:00.000Z";

function find(plan: AnonymizeOp[], label: string): AnonymizeOp {
  const op = plan.find((o) => o.label === label);
  assert.ok(op, `plan has ${label}`);
  return op;
}

test("anonymized email is deterministic, per user, and recognisable", () => {
  const e = anonymizedEmailFor(USER);
  assert.equal(e, anonymizedEmailFor(USER));
  assert.ok(isAnonymizedEmail(e));
  assert.notEqual(e, anonymizedEmailFor("99999999-2222-3333-4444-555555555555"));
  assert.equal(isAnonymizedEmail("ana@example.com"), false);
});

test("LIKE wildcards in an email are escaped so ana_b@x.com cannot match anaXb@x.com", () => {
  assert.equal(escapeLikeLiteral("ana_b%c\\d@x.com"), "ana\\_b\\%c\\\\d@x.com");
});

test("money and booking rows are only ever UPDATED, never deleted", () => {
  const plan = buildAnonymizationPlan(
    { userId: USER, email: "ana@example.com", talentProfileIds: [TALENT] },
    NOW,
    { hideTalentProfiles: true, removeRosterRows: true, releaseCoordinatorSeats: true },
  );
  const protectedTables = ["agency_bookings", "booking_transactions", "inquiries", "inquiry_messages", "booking_payouts", "client_balance_ledger"];
  for (const op of plan) {
    if (protectedTables.includes(op.table)) assert.equal(op.kind, "update", `${op.table} must not be deleted`);
  }
  const deletes = plan.filter((o) => o.kind === "delete").map((o) => o.table).sort();
  assert.deepEqual(deletes, ["agency_talent_roster", "talent_profile_field_values"]);
});

test("talent profile is scrubbed and hidden; is_publicly_listed is left to its trigger", () => {
  const plan = buildAnonymizationPlan({ userId: USER, email: null, talentProfileIds: [TALENT] }, NOW);
  const op = find(plan, "talent_profiles");
  assert.equal(op.kind, "update");
  if (op.kind !== "update") return;
  assert.equal(op.patch.display_name, DELETED_USER_LABEL);
  for (const k of ["first_name", "last_name", "legal_name", "short_bio", "phone", "phone_e164", "date_of_birth"]) {
    assert.equal(op.patch[k], null, k);
  }
  assert.deepEqual(op.patch.social_links, []);
  assert.equal(op.patch.is_publicly_hidden, true);
  assert.equal(op.patch.deleted_at, NOW);
  assert.equal("is_publicly_listed" in op.patch, false);
});

test("admin anonymize can keep the profile visible-state untouched when asked", () => {
  const plan = buildAnonymizationPlan({ userId: USER, email: null, talentProfileIds: [TALENT] }, NOW, {
    hideTalentProfiles: false,
  });
  const op = find(plan, "talent_profiles");
  assert.equal(op.kind === "update" && "is_publicly_hidden" in op.patch, false);
  assert.equal(plan.some((o) => o.label === "roster_rows"), false, "roster removal is executor-only");
});

test("guest-contact rows are found by email; no email means no email-matched ops", () => {
  const withEmail = buildAnonymizationPlan({ userId: USER, email: "Ana_B@example.com", talentProfileIds: [] }, NOW);
  const guest = find(withEmail, "inquiries_as_guest");
  assert.deepEqual(guest.filters, [{ op: "ilike", col: "contact_email", value: "Ana\\_B@example.com" }]);
  assert.ok(withEmail.some((o) => o.label === "bookings_as_guest"));
  assert.ok(withEmail.some((o) => o.label === "transactions_as_guest_payer"));

  const without = buildAnonymizationPlan({ userId: USER, email: null, talentProfileIds: [] }, NOW);
  assert.equal(without.some((o) => o.filters.some((f) => f.op === "ilike")), false);

  // An already-anonymized email must not be used as a match key (it would
  // match every other anonymized row).
  const anon = buildAnonymizationPlan({ userId: USER, email: anonymizedEmailFor(USER), talentProfileIds: [] }, NOW);
  assert.equal(anon.some((o) => o.filters.some((f) => f.op === "ilike")), false);
});

test("no talent profile: no talent ops, no empty IN () filters", () => {
  const plan = buildAnonymizationPlan({ userId: USER, email: null, talentProfileIds: [] }, NOW);
  for (const op of plan) {
    for (const f of op.filters) if (f.op === "in") assert.ok(f.value.length > 0, `${op.label} has empty IN`);
  }
  assert.equal(plan.some((o) => o.table === "talent_profiles"), false);
});

test("inquiry contact email stays non-null (column is NOT NULL)", () => {
  const plan = buildAnonymizationPlan({ userId: USER, email: null, talentProfileIds: [] }, NOW);
  const op = find(plan, "inquiries_as_client");
  assert.ok(op.kind === "update" && typeof op.patch.contact_email === "string");
});

// ── I/O: a fake client that records calls ─────────────────────────────────────

type Call = { table: string; action: string; patch?: unknown; filters: Array<[string, string, unknown]> };

function fakeAdmin(opts: { failTable?: string } = {}) {
  const calls: Call[] = [];
  const removed: string[][] = [];
  function builder(table: string, action: string, patch?: unknown, rows: unknown[] = []) {
    const call: Call = { table, action, patch, filters: [] };
    calls.push(call);
    const result = () => ({
      data: rows,
      error: opts.failTable === table && action !== "select" ? { message: "boom" } : null,
    });
    const b: Record<string, unknown> = {};
    for (const m of ["eq", "in", "ilike", "is", "not", "neq"]) {
      b[m] = (col: string, ...rest: unknown[]) => {
        call.filters.push([m, col, rest.length === 1 ? rest[0] : rest]);
        return b;
      };
    }
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
    return b;
  }
  const admin = {
    from(table: string) {
      return {
        select: () =>
          builder(table, "select", undefined, table === "inquiry_attachments" ? [{ storage_path: "t/1/a.pdf" }] : []),
        update: (patch: unknown) => builder(table, "update", patch),
        delete: () => builder(table, "delete"),
      };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        },
      }),
    },
  };
  return { admin, calls, removed };
}

test("anonymizeUserData removes uploaded files, runs every op, reports ok", async () => {
  const { admin, calls, removed } = fakeAdmin();
  const report = await anonymizeUserData(
    admin as never,
    { userId: USER, email: "ana@example.com", talentProfileIds: [TALENT] },
    { hideTalentProfiles: true, removeRosterRows: true },
    new Date(NOW),
  );
  assert.equal(report.ok, true);
  assert.deepEqual(removed, [["t/1/a.pdf"]]);
  assert.ok(calls.some((c) => c.table === "talent_profiles" && c.action === "update"));
  assert.ok(!calls.some((c) => c.table === "booking_transactions" && c.action === "delete"));
});

test("a failing step makes the report not ok (so the executor never deletes the auth user)", async () => {
  const { admin } = fakeAdmin({ failTable: "inquiries" });
  const report = await anonymizeUserData(
    admin as never,
    { userId: USER, email: null, talentProfileIds: [] },
    {},
    new Date(NOW),
  );
  assert.equal(report.ok, false);
  assert.ok(report.steps.some((s) => s.label === "inquiries_as_client" && !s.ok));
});

test("running twice issues the same writes (idempotent)", async () => {
  const a = fakeAdmin();
  const b = fakeAdmin();
  const subject = { userId: USER, email: "ana@example.com", talentProfileIds: [TALENT] };
  await anonymizeUserData(a.admin as never, subject, {}, new Date(NOW));
  await anonymizeUserData(a.admin as never, subject, {}, new Date(NOW));
  await anonymizeUserData(b.admin as never, subject, {}, new Date(NOW));
  const writes = (cs: Call[]) => cs.filter((c) => c.action !== "select").map((c) => JSON.stringify(c));
  const first = writes(b.calls);
  assert.deepEqual(writes(a.calls), [...first, ...first]);
});

// ── payout_accounts ───────────────────────────────────────────────────────────

const OTHER_USER = "99999999-2222-3333-4444-555555555555";
const OTHER_TALENT = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";

test("payout accounts: profile and talent ops carry exactly those filters and only display_name", () => {
  const plan = buildAnonymizationPlan({ userId: USER, email: null, talentProfileIds: [TALENT] }, NOW);
  const prof = find(plan, "payout_accounts_profile");
  const tal = find(plan, "payout_accounts_talent");
  assert.equal(prof.table, "payout_accounts");
  assert.equal(tal.table, "payout_accounts");
  assert.deepEqual(prof.filters, [
    { op: "eq", col: "owner_type", value: "profile" },
    { op: "eq", col: "owner_id", value: USER },
  ]);
  assert.deepEqual(tal.filters, [
    { op: "eq", col: "owner_type", value: "talent" },
    { op: "in", col: "owner_id", value: [TALENT] },
  ]);
  for (const op of [prof, tal]) {
    assert.equal(op.kind, "update");
    if (op.kind !== "update") continue;
    assert.deepEqual(op.patch, { display_name: DELETED_USER_LABEL });
    for (const k of ["status", "provider", "provider_account_id", "id", "tenant_id", "owner_id", "owner_type", "amount_minor"]) {
      assert.equal(k in op.patch, false, k);
    }
  }
});

test("payout accounts: a subject with no talent profiles gets only the profile op", () => {
  const plan = buildAnonymizationPlan({ userId: USER, email: null, talentProfileIds: [] }, NOW);
  const ops = plan.filter((o) => o.table === "payout_accounts");
  assert.deepEqual(ops.map((o) => o.label), ["payout_accounts_profile"]);
});

test("payout accounts: no op targets owner_type agency, and other owners would not match", () => {
  const plan = buildAnonymizationPlan({ userId: USER, email: null, talentProfileIds: [TALENT] }, NOW);
  const ops = plan.filter((o) => o.table === "payout_accounts");
  assert.equal(ops.length, 2);
  const rows = [
    { owner_type: "agency", owner_id: USER },
    { owner_type: "agency", owner_id: TALENT },
    { owner_type: "profile", owner_id: OTHER_USER },
    { owner_type: "talent", owner_id: OTHER_TALENT },
    { owner_type: "talent", owner_id: USER },
    { owner_type: "profile", owner_id: TALENT },
  ];
  for (const row of rows) assert.equal(ops.some((o) => matches(row, o.filters)), false, JSON.stringify(row));
  assert.ok(ops.some((o) => matches({ owner_type: "profile", owner_id: USER }, o.filters)));
  assert.ok(ops.some((o) => matches({ owner_type: "talent", owner_id: TALENT }, o.filters)));
});

type Row = Record<string, unknown>;
type PlanFilter = AnonymizeOp["filters"][number];

function matches(row: Row, filters: PlanFilter[]): boolean {
  return filters.every((f) => {
    if (f.op === "eq") return row[f.col] === f.value;
    if (f.op === "in") return f.value.includes(String(row[f.col]));
    if (f.op === "isNull") return row[f.col] == null;
    return false;
  });
}

test("payout accounts: applying the plan to a fake store changes only display_name on matching rows", async () => {
  const store: Row[] = [
    { id: "p1", owner_type: "profile", owner_id: USER, display_name: "Ana IBAN 1234", provider: "manual_bank", provider_account_id: null, status: "connected" },
    { id: "p2", owner_type: "talent", owner_id: TALENT, display_name: "Ana Chase 0001", provider: "stripe", provider_account_id: "acct_123", status: "pending_verification" },
    { id: "p3", owner_type: "agency", owner_id: USER, display_name: "Agency Ltd", provider: "manual_bank", provider_account_id: null, status: "connected" },
    { id: "p4", owner_type: "profile", owner_id: OTHER_USER, display_name: "Bo Bank", provider: "manual_bank", provider_account_id: null, status: "connected" },
    { id: "p5", owner_type: "talent", owner_id: OTHER_TALENT, display_name: "Cy Bank", provider: "stripe", provider_account_id: "acct_999", status: "connected" },
  ];
  const before = store.map((r) => ({ ...r }));
  const admin = {
    from(table: string) {
      return {
        update: (patch: Row) => {
          const filters: Array<[string, string, unknown]> = [];
          const b: Record<string, unknown> = {};
          for (const m of ["eq", "in", "ilike", "is"]) {
            b[m] = (col: string, v: unknown) => {
              filters.push([m, col, v]);
              return b;
            };
          }
          b.then = (res: (v: unknown) => unknown) => {
            if (table === "payout_accounts") {
              for (const row of store) {
                const ok = filters.every(([m, col, v]) =>
                  m === "eq" ? row[col] === v : m === "in" ? (v as unknown[]).includes(row[col]) : false,
                );
                if (ok) Object.assign(row, patch);
              }
            }
            return Promise.resolve({ error: null }).then(res);
          };
          return b;
        },
        delete: () => {
          const b: Record<string, unknown> = {};
          for (const m of ["eq", "in", "ilike", "is"]) b[m] = () => b;
          b.then = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res);
          return b;
        },
        select: () => {
          const b: Record<string, unknown> = {};
          for (const m of ["eq", "not"]) b[m] = () => b;
          b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
          return b;
        },
      };
    },
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  };

  const run = async () =>
    anonymizeUserData(admin as never, { userId: USER, email: null, talentProfileIds: [TALENT] }, {}, new Date(NOW));
  assert.equal((await run()).ok, true);
  const after = store.map((r) => ({ ...r }));
  assert.equal(after[0].display_name, DELETED_USER_LABEL);
  assert.equal(after[1].display_name, DELETED_USER_LABEL);
  for (const i of [2, 3, 4]) assert.deepEqual(after[i], before[i]);
  for (const i of [0, 1]) assert.deepEqual({ ...after[i], display_name: null }, { ...before[i], display_name: null });

  // Re-running converges to the same state.
  await run();
  assert.deepEqual(store, after);
});
