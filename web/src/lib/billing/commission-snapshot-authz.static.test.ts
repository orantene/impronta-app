/**
 * The commission-snapshot writer must stay authorized.
 *
 * `engine_persist_booking_commission_snapshot` writes the rows that decide WHO
 * GETS PAID. The 2026-09-01 finance audit found it callable by any authenticated
 * user, and `20261226000011_finance_p0_rpc_authorization.sql` fixed it by adding
 * a guard block that raises 42501 unless the caller is service_role, an internal
 * connection, or staff of the owning tenant.
 *
 * WHAT THIS FILE EXISTS TO CATCH, and why the existing protection is not enough:
 *
 *   1. The migration asserts its own revokes AT APPLY TIME, which proves nothing
 *      about a LATER migration. The function is SECURITY DEFINER and defined with
 *      CREATE OR REPLACE, so any future migration can redefine it — silently
 *      dropping the guard — and every apply-time assertion in the old file still
 *      passes because it already ran.
 *
 *   2. The only thing standing between us and that today is a COMMENT in the
 *      migration: "Do not remove that block when editing this function." A
 *      comment is not a dependency. This repo has already shipped a defect whose
 *      sole protection was a comment.
 *
 * So the invariant asserted here is about the LAST definition to run, not about
 * any one file: whatever migration defines this function last must still contain
 * the guard, and no migration may hand `anon` EXECUTE back.
 *
 * This is a source-level check by necessity — the failure is an ABSENT guard in
 * DDL, and absence in SQL text is not observable from the TypeScript client
 * without a live privileged connection.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const MIGRATIONS = resolve(process.cwd(), "..", "supabase", "migrations");

const GUARD_CALL = "engine_caller_may_write_tenant_finances";
const WRITER = "engine_persist_booking_commission_snapshot";

/** Every migration file, oldest first — filename order IS apply order here. */
function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
}

/**
 * The body of the LAST `CREATE OR REPLACE FUNCTION public.<name>` across all
 * migrations: the definition that is actually live. Returns the file it came
 * from so a failure names the culprit rather than just the invariant.
 */
function lastDefinitionOf(fnName: string): { file: string; body: string } | null {
  let found: { file: string; body: string } | null = null;
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const marker = new RegExp(
      `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fnName}\\s*\\(`,
      "gi",
    );
    let m: RegExpExecArray | null;
    while ((m = marker.exec(sql)) !== null) {
      // From this CREATE to the end of its $$-quoted body.
      const rest = sql.slice(m.index);
      const end = rest.search(/\$\$\s*;/);
      found = { file, body: end === -1 ? rest : rest.slice(0, end) };
    }
  }
  return found;
}

test("the LIVE definition of the snapshot writer still calls the authorization gate", () => {
  const def = lastDefinitionOf(WRITER);
  assert.ok(def, `no CREATE OR REPLACE for ${WRITER} found — was it renamed?`);
  assert.ok(
    def.body.includes(GUARD_CALL),
    `${def.file} redefines ${WRITER} WITHOUT calling ${GUARD_CALL}. ` +
      `That reopens the 2026-09-01 P0: any authenticated user could write the payout ` +
      `split for any booking. Re-add the guard block immediately after the booking lookup.`,
  );
});

test("the guard REFUSES — it raises 42501, it does not return quietly", () => {
  // A guard that returns instead of raising would leave the caller believing the
  // snapshot was written. Absence must be loud, not empty.
  const def = lastDefinitionOf(WRITER)!;
  assert.match(
    def.body,
    /RAISE\s+EXCEPTION/i,
    `${def.file}: the authorization failure path must RAISE, not return`,
  );
  assert.match(
    def.body,
    /42501/,
    `${def.file}: the refusal must carry ERRCODE 42501 (insufficient_privilege) so callers can tell ` +
      `"not allowed" apart from "nothing to write"`,
  );
});

test("no migration hands anon EXECUTE back on a financial RPC", () => {
  // REVOKE is not permanent: a later GRANT, or a re-created function inheriting
  // the schema's default privileges, silently re-opens it.
  const offenders: string[] = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const line of sql.split("\n")) {
      const l = line.trim();
      if (!/^GRANT\s+EXECUTE/i.test(l)) continue;
      if (!new RegExp(`${WRITER}|${GUARD_CALL}|record_discount_redemption`, "i").test(l)) continue;
      if (/\banon\b/i.test(l)) offenders.push(`${file}: ${l}`);
    }
  }
  assert.deepEqual(offenders, [], `anon was re-granted EXECUTE on a financial RPC:\n${offenders.join("\n")}`);
});

test("record_discount_redemption stays service_role only", () => {
  // Distinct from the writer on purpose: this one has NO legitimate end-user
  // caller, so `authenticated` must not hold EXECUTE either. The writer is the
  // opposite case — a tenant admin may legitimately call it, and the BODY is what
  // refuses everyone else. Conflating the two policies is how one of them breaks.
  const offenders: string[] = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const line of sql.split("\n")) {
      const l = line.trim();
      if (!/^GRANT\s+EXECUTE/i.test(l)) continue;
      if (!/record_discount_redemption/i.test(l)) continue;
      if (/\bauthenticated\b/i.test(l)) offenders.push(`${file}: ${l}`);
    }
  }
  assert.deepEqual(offenders, [], `record_discount_redemption granted to authenticated:\n${offenders.join("\n")}`);
});

test("SELF-TEST: the detector actually fails on a guard-less redefinition", () => {
  // An assertion nobody has seen go red is not evidence. This proves the matcher
  // above would catch the exact regression it claims to catch.
  const bad = `
CREATE OR REPLACE FUNCTION public.${WRITER}(p_booking_id UUID, p_rows JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO commission_snapshots SELECT * FROM jsonb_populate_recordset(NULL::commission_snapshots, p_rows);
END;
$$;`;
  assert.ok(!bad.includes(GUARD_CALL), "fixture must lack the guard");
  assert.ok(!/42501/.test(bad), "fixture must lack the errcode");

  const good = readFileSync(
    join(MIGRATIONS, "20261226000011_finance_p0_rpc_authorization.sql"),
    "utf8",
  );
  assert.ok(good.includes(GUARD_CALL) && /42501/.test(good), "the real migration must satisfy both");
});
