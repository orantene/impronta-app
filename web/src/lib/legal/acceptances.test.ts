import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hashIp,
  isAgeAndTermsConfirmed,
  isFreshOAuthSignup,
  isLegalAcceptanceEnabled,
  isMissingSchemaError,
  policyChangedSinceRequest,
} from "./acceptances.core";
import {
  hasSignupAcceptance,
  recordAcceptance,
  recordSignupAcceptance,
  recordTalentPolicyAcceptance,
} from "./acceptances";

type Row = Record<string, unknown>;

/** Minimal PostgREST-shaped fake: enough for the calls acceptances.ts makes. */
function fakeDb(opts: { missing?: boolean; throwOnInsert?: boolean } = {}) {
  const tables: Record<string, Row[]> = { terms_acceptances: [], platform_policy_versions: [] };
  let seq = 0;
  const missingErr = { code: "42P01", message: "relation does not exist" };
  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let pendingInsert: Row | null = null;
    let order: { col: string; asc: boolean } | null = null;
    const q = {
      select() { return q; },
      eq(col: string, v: unknown) { filters.push((r) => r[col] === v); return q; },
      order(col: string, o: { ascending: boolean }) { order = { col, asc: o.ascending }; return q; },
      limit() { return q; },
      insert(row: Row) {
        if (opts.throwOnInsert) throw new Error("boom");
        pendingInsert = { id: `id-${++seq}`, ...row };
        return q;
      },
      async single() { return q.maybeSingle(); },
      async maybeSingle() {
        if (opts.missing) return { data: null, error: missingErr };
        if (pendingInsert) {
          tables[table].push(pendingInsert);
          return { data: { id: pendingInsert.id }, error: null };
        }
        let rows = tables[table].filter((r) => filters.every((f) => f(r)));
        if (order) {
          const { col, asc } = order;
          rows = [...rows].sort((a, b) => (Number(a[col]) - Number(b[col])) * (asc ? 1 : -1));
        }
        return { data: rows[0] ?? null, error: null };
      },
    };
    return q;
  }
  return { client: { from } as never, tables };
}

const ON = { LEGAL_ACCEPTANCE_ENABLED: "true" };

test("checkbox: only an explicit tick counts", () => {
  for (const v of ["on", "1", "true", "yes", " ON "]) assert.equal(isAgeAndTermsConfirmed(v), true, v);
  for (const v of [null, undefined, "", "off", "0", "false", "no"]) assert.equal(isAgeAndTermsConfirmed(v as never), false, String(v));
});

test("flag is on by default and off only when explicitly disabled", () => {
  assert.equal(isLegalAcceptanceEnabled({}), true);
  assert.equal(isLegalAcceptanceEnabled({ LEGAL_ACCEPTANCE_ENABLED: "false" }), false);
  assert.equal(isLegalAcceptanceEnabled({ LEGAL_ACCEPTANCE_ENABLED: "0" }), false);
});

test("missing-schema codes are recognised", () => {
  assert.equal(isMissingSchemaError({ code: "42P01" }), true);
  assert.equal(isMissingSchemaError({ code: "PGRST205" }), true);
  assert.equal(isMissingSchemaError({ code: "23505" }), false);
});

test("ip is hashed, never stored raw", () => {
  const h = hashIp("203.0.113.9, 10.0.0.1", "s");
  assert.ok(h && h.length === 64 && !h.includes("203"));
  assert.equal(hashIp(null), null);
});

test("recordAcceptance writes one row with hashed ip", async () => {
  const db = fakeDb();
  const id = await recordAcceptance(
    { platformPolicyVersionId: "pv1", context: "signup", actorUserId: "u1", ageConfirmed: true, ip: "1.2.3.4" },
    { client: db.client, env: ON },
  );
  assert.ok(id);
  const row = db.tables.terms_acceptances[0];
  assert.equal(row.platform_policy_version_id, "pv1");
  assert.equal(row.age_confirmed, true);
  assert.notEqual(row.ip_hash, "1.2.3.4");
});

test("recordAcceptance never throws: missing table, thrown error, flag off, no version", async () => {
  assert.equal(await recordAcceptance({ platformPolicyVersionId: "x", context: "signup" }, { client: fakeDb({ missing: true }).client, env: ON }), null);
  assert.equal(await recordAcceptance({ platformPolicyVersionId: "x", context: "signup" }, { client: fakeDb({ throwOnInsert: true }).client, env: ON }), null);
  const off = fakeDb();
  assert.equal(await recordAcceptance({ platformPolicyVersionId: "x", context: "signup" }, { client: off.client, env: { LEGAL_ACCEPTANCE_ENABLED: "false" } }), null);
  assert.equal(off.tables.terms_acceptances.length, 0);
  assert.equal(await recordAcceptance({ context: "inquiry" }, { client: fakeDb().client, env: ON }), null);
});

test("signup records Terms + Privacy once per revision (idempotent)", async () => {
  const db = fakeDb();
  assert.equal(await recordSignupAcceptance("u1", { client: db.client, env: ON }), 2);
  assert.equal(await recordSignupAcceptance("u1", { client: db.client, env: ON }), 0);
  assert.equal(db.tables.platform_policy_versions.length, 2);
  assert.deepEqual(db.tables.platform_policy_versions.map((r) => r.kind).sort(), ["privacy", "terms"]);
  assert.equal(db.tables.terms_acceptances.length, 2);
  assert.ok(db.tables.terms_acceptances.every((r) => r.context === "signup" && r.age_confirmed === true));
  assert.equal(await hasSignupAcceptance("u1", { client: db.client, env: ON }), true);
  assert.equal(await hasSignupAcceptance("u2", { client: db.client, env: ON }), false);
});

test("signup recorder tolerates a missing table; gate reads unknown as null", async () => {
  const db = fakeDb({ missing: true });
  assert.equal(await recordSignupAcceptance("u1", { client: db.client, env: ON }), 0);
  assert.equal(await hasSignupAcceptance("u1", { client: db.client, env: ON }), null);
  assert.equal(await hasSignupAcceptance("u1", { client: fakeDb().client, env: { LEGAL_ACCEPTANCE_ENABLED: "false" } }), null);
});

test("talent policy acceptance needs a stamped version", async () => {
  const db = fakeDb();
  assert.equal(await recordTalentPolicyAcceptance({ talentPolicyVersionId: null, context: "inquiry" }, { client: db.client, env: ON }), null);
  assert.ok(await recordTalentPolicyAcceptance({ talentPolicyVersionId: "tpv1", context: "offer_approval", contextId: "o1", tenantId: "t1" }, { client: db.client, env: ON }));
  assert.equal(db.tables.terms_acceptances[0].talent_policy_version_id, "tpv1");
  assert.equal(db.tables.terms_acceptances[0].platform_policy_version_id, null);
});

test("fresh Google signup detection", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  const g = (mins: number, provider = "google") => ({ created_at: new Date(now - mins * 60_000).toISOString(), app_metadata: { provider } });
  assert.equal(isFreshOAuthSignup(g(1), now), true);
  assert.equal(isFreshOAuthSignup(g(60), now), false);
  assert.equal(isFreshOAuthSignup(g(1, "email"), now), false);
  assert.equal(isFreshOAuthSignup(null, now), false);
});

test("2.4: changed only when both versions are known and differ", () => {
  assert.equal(policyChangedSinceRequest("a", "b"), true);
  assert.equal(policyChangedSinceRequest("a", "a"), false);
  assert.equal(policyChangedSinceRequest(null, "b"), false);
  assert.equal(policyChangedSinceRequest("a", null), false);
});
