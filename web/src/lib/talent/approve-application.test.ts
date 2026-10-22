/**
 * TUL-1871 / TUL-1368: approving a join application puts the talent on the roster.
 * In-memory PostgREST stand-in (FakeQuery shape), no `any`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  approveApplicationIntoRoster,
  seatLimitApproveMessage,
  type ApproveDeps,
  type ApproveInput,
} from "./approve-application";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Result = { data: Row[] | null; error: { code?: string; message: string } | null };

type FakeQuery = {
  select: (cols?: string) => FakeQuery;
  eq: (col: string, value: unknown) => FakeQuery;
  in: (col: string, values: unknown[]) => FakeQuery;
  limit: (n: number) => FakeQuery;
  update: (patch: Row) => FakeQuery;
  insert: (row: Row) => Promise<Result>;
  then: (resolve: (value: Result) => void) => void;
};

function makeAdmin(tables: Tables, opts: { failRosterWrite?: boolean; failRosterInsertCode?: string } = {}) {
  const admin = {
    from(table: string): FakeQuery {
      const rows = (tables[table] ??= []);
      const preds: Array<(r: Row) => boolean> = [];
      let patch: Row | null = null;
      let max = Infinity;
      const run = (): Result => {
        const hit = rows.filter((r) => preds.every((p) => p(r))).slice(0, max);
        if (patch) {
          if (table === "agency_talent_roster" && opts.failRosterWrite) {
            return { data: null, error: { message: "boom" } };
          }
          for (const r of hit) Object.assign(r, patch);
        }
        return { data: hit.map((r) => ({ id: r.id, status: r.status })), error: null };
      };
      const q: FakeQuery = {
        select: () => q,
        eq(col, value) {
          preds.push((r) => r[col] === value);
          return q;
        },
        in(col, values) {
          preds.push((r) => values.includes(r[col]));
          return q;
        },
        limit(n) {
          max = n;
          return q;
        },
        update(p) {
          patch = p;
          return q;
        },
        async insert(row) {
          if (table === "agency_talent_roster" && opts.failRosterWrite) return { data: null, error: { message: "boom" } };
          if (opts.failRosterInsertCode) return { data: null, error: { code: opts.failRosterInsertCode, message: "dup" } };
          rows.push({ id: `new-${rows.length}`, ...row });
          return { data: null, error: null };
        },
        then(resolve) {
          resolve(run());
        },
      };
      return q;
    },
  };
  return admin as unknown as Parameters<typeof approveApplicationIntoRoster>[0];
}

const T = "tenant-1";
const P = "talent-1";
const input: ApproveInput = {
  table: "talent_hub_applications",
  applicationId: "app-1",
  tenantId: T,
  talentProfileId: P,
  userId: "owner-1",
  note: "welcome",
  locale: "en",
};

function deps(over: Partial<ApproveDeps> = {}): ApproveDeps {
  return {
    checkSeat: async () => ({ ok: true }),
    resolveExclusivity: async () => null,
    defaultVisibility: "roster_only",
    now: () => "2026-10-21T00:00:00.000Z",
    ...over,
  };
}

function fresh(): Tables {
  return {
    talent_hub_applications: [{ id: "app-1", status: "pending" }],
    agency_talent_roster: [],
  };
}

test("approve claims the application and inserts an active roster row", async () => {
  const tables = fresh();
  const out = await approveApplicationIntoRoster(makeAdmin(tables), input, deps());
  assert.deepEqual(out, { ok: true, rosterAdded: true });
  assert.equal(tables.talent_hub_applications[0].status, "approved");
  assert.equal(tables.talent_hub_applications[0].decided_by_user_id, "owner-1");
  assert.equal(tables.talent_hub_applications[0].decided_at, "2026-10-21T00:00:00.000Z");
  assert.equal(tables.talent_hub_applications[0].decision_note, "welcome");
  const roster = tables.agency_talent_roster;
  assert.equal(roster.length, 1);
  assert.equal(roster[0].tenant_id, T);
  assert.equal(roster[0].talent_profile_id, P);
  assert.equal(roster[0].status, "active");
  assert.equal(roster[0].agency_visibility, "roster_only");
  assert.equal(roster[0].source_type, "freelancer_claimed");
  assert.equal(roster[0].added_by, "owner-1");
});

test("a second click is already_decided and adds no second roster row", async () => {
  const tables = fresh();
  const admin = makeAdmin(tables);
  await approveApplicationIntoRoster(admin, input, deps());
  const again = await approveApplicationIntoRoster(admin, input, deps());
  assert.equal(again.ok, false);
  assert.equal(!again.ok && again.code, "already_decided");
  assert.equal(tables.agency_talent_roster.length, 1);
});

test("over the plan cap: refused with a clear message, application stays pending, nothing written", async () => {
  for (const locale of ["en", "es"] as const) {
    const tables = fresh();
    const out = await approveApplicationIntoRoster(
      makeAdmin(tables),
      { ...input, locale },
      deps({ checkSeat: async () => ({ ok: false, limit: 5 }) }),
    );
    assert.equal(out.ok, false);
    assert.equal(!out.ok && out.code, "seat_limit");
    assert.equal(!out.ok && out.error, seatLimitApproveMessage(5, locale));
    assert.equal(tables.talent_hub_applications[0].status, "pending");
    assert.equal(tables.agency_talent_roster.length, 0);
  }
  assert.match(seatLimitApproveMessage(5, "es"), /límite/);
  assert.match(seatLimitApproveMessage(5, "en"), /plan limit/);
});

test("a talent already counted on the roster needs no new seat", async () => {
  const tables = fresh();
  tables.agency_talent_roster.push({ id: "r1", tenant_id: T, talent_profile_id: P, status: "pending" });
  const out = await approveApplicationIntoRoster(
    makeAdmin(tables),
    input,
    deps({ checkSeat: async () => ({ ok: false, limit: 1 }) }),
  );
  assert.deepEqual(out, { ok: true, rosterAdded: true });
  assert.equal(tables.agency_talent_roster.length, 1);
  assert.equal(tables.agency_talent_roster[0].status, "active");
});

test("an inactive row is reactivated, an already active row is left alone", async () => {
  const inactive = fresh();
  inactive.agency_talent_roster.push({ id: "r1", tenant_id: T, talent_profile_id: P, status: "inactive" });
  assert.deepEqual(await approveApplicationIntoRoster(makeAdmin(inactive), input, deps()), { ok: true, rosterAdded: true });
  assert.equal(inactive.agency_talent_roster[0].status, "active");

  const active = fresh();
  active.agency_talent_roster.push({ id: "r1", tenant_id: T, talent_profile_id: P, status: "active", agency_visibility: "site_visible" });
  assert.deepEqual(await approveApplicationIntoRoster(makeAdmin(active), input, deps()), { ok: true, rosterAdded: false });
  assert.equal(active.agency_talent_roster[0].agency_visibility, "site_visible");
  assert.equal(active.talent_hub_applications[0].status, "approved");
});

test("a roster row of another workspace does not count", async () => {
  const tables = fresh();
  tables.agency_talent_roster.push({ id: "r9", tenant_id: "other", talent_profile_id: P, status: "active" });
  const out = await approveApplicationIntoRoster(makeAdmin(tables), input, deps());
  assert.deepEqual(out, { ok: true, rosterAdded: true });
  assert.equal(tables.agency_talent_roster.length, 2);
});

test("exclusive workspace stamps the exclusivity fields from the resolver", async () => {
  const tables = fresh();
  await approveApplicationIntoRoster(
    makeAdmin(tables),
    input,
    deps({
      resolveExclusivity: async () => ({ shouldBeExclusive: true, exclusivityStatus: "auto_assigned", autoAssignedAt: "2026-10-21T00:00:00.000Z" }),
    }),
  );
  assert.equal(tables.agency_talent_roster[0].is_primary, true);
  assert.equal(tables.agency_talent_roster[0].exclusivity_status, "auto_assigned");
});

test("roster write failure releases the claim back to pending", async () => {
  const tables = fresh();
  const out = await approveApplicationIntoRoster(makeAdmin(tables, { failRosterWrite: true }), input, deps());
  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.code, "db_error");
  assert.equal(tables.talent_hub_applications[0].status, "pending");
  assert.equal(tables.talent_hub_applications[0].decided_by_user_id, null);
});

test("a concurrent insert (23505) counts as success", async () => {
  const tables = fresh();
  const out = await approveApplicationIntoRoster(makeAdmin(tables, { failRosterInsertCode: "23505" }), input, deps());
  assert.deepEqual(out, { ok: true, rosterAdded: false });
  assert.equal(tables.talent_hub_applications[0].status, "approved");
});
