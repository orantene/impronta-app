/**
 * TUL-1592: Friends collective P2 hardening (held migration 20261231422700).
 * (a) the money of a split line adds up in the DB; (b) anon cannot read the owner's share columns;
 * (c) collective reviews do not feed the member's PUBLIC rating (talent_profiles.rating_avg and friends).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { memberNetCents, ownerTakeCents } from "./friends-collective";
import { buildLineSnapshot } from "./friends-collective";

const sql = readFileSync(join(process.cwd(), "../supabase/migrations/_pending_pm/20261231422700_collective_p2_hardening_tul1592.sql"), "utf8");
const code = sql.replace(/^\s*--.*$/gm, "");

describe("(a) member net + owner take = line total, in the database", () => {
  test("the CHECK exists and only constrains split lines", () => {
    assert.match(code, /ADD CONSTRAINT order_lines_owner_split_sums_chk CHECK \(\s*owner_take_cents IS NULL OR talent_cost_cents = total_cents - owner_take_cents\s*\)/);
  });
  test("the app's own split never violates it: for any total and share, net + take = total exactly", () => {
    const shares = [
      { kind: "percent", bps: 0 }, { kind: "percent", bps: 1 }, { kind: "percent", bps: 1_234 }, { kind: "percent", bps: 5_000 }, { kind: "percent", bps: 9_000 },
      { kind: "fixed", amountCents: 0, currency: "MXN" }, { kind: "fixed", amountCents: 700, currency: "MXN" }, { kind: "fixed", amountCents: 999_999_999, currency: "MXN" },
    ] as const;
    for (const total of [1, 2, 3, 99, 100, 101, 999, 1_000, 12_345, 99_999, 1_000_001]) {
      for (const share of shares) {
        const take = ownerTakeCents(total, share);
        assert.equal(memberNetCents(total, share) + take, total, `${total} ${JSON.stringify(share)}`);
        assert.equal(buildLineSnapshot(total, share, 1).ownerTakeCents, take);
        assert.ok(take >= 0 && take <= Math.floor((total * 9_000) / 10_000), "within the 90% cap");
      }
    }
  });
});

describe("(b) anon cannot read the share columns", () => {
  test("table-level SELECT is revoked from anon and every column EXCEPT owner_share_* / pending_share_* is granted back", () => {
    assert.match(code, /REVOKE SELECT ON public\.agency_talent_roster FROM anon/);
    assert.match(code, /GRANT SELECT \(%s\) ON public\.agency_talent_roster TO anon/);
    assert.match(code, /c\.column_name NOT LIKE 'owner\\_share\\_%'/);
    assert.match(code, /c\.column_name NOT LIKE 'pending\\_share\\_%'/);
  });
  test("it refuses (raises) rather than leaving the table with no readable columns", () => {
    assert.match(code, /IF v_cols IS NULL THEN\s+RAISE EXCEPTION/);
  });
  test("no code reads the roster with a star select, which a column grant would turn into a permission error", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !p.includes("database.types")) {
          const src = readFileSync(p, "utf8");
          if (/from\(\s*["']agency_talent_roster["']\s*\)\s*\.select\(\s*(?:["'`]\*["'`])?\s*[,)]/.test(src)) hits.push(p);
          if (/agency_talent_roster\s*(?:!\w+)?\s*\(\s*\*\s*\)/.test(src)) hits.push(p);
        }
      }
    };
    walk(join(process.cwd(), "src"));
    assert.deepEqual(hits, []);
  });
});

describe("(c) collective reviews stay out of the member's public rating", () => {
  test("the public aggregates exclude reviews of a Friends collective; the private totals do not", () => {
    const fn = code.slice(code.indexOf("CREATE OR REPLACE FUNCTION public.talent_reviews_recompute_summary"), code.indexOf("CREATE OR REPLACE FUNCTION public.agencies_work_model_rating_recompute"));
    const pub = fn.slice(fn.indexOf(") pub,") - 900, fn.indexOf(") pub,"));
    assert.match(pub, /AND r\.verified_paid\s+AND NOT EXISTS \(\s*SELECT 1 FROM public\.agencies a\s+WHERE a\.id = r\.tenant_id AND a\.work_model = 'friends_collective'/);
    const all = fn.slice(fn.indexOf(") pub,"));
    assert.doesNotMatch(all, /friends_collective/, "rating_all_* (private baseline) still counts everything");
    assert.match(all, /AND r\.status <> 'spam'/);
  });
  test("a workspace that becomes (or stops being) a collective recomputes its members, and existing members are fixed once", () => {
    assert.match(code, /AFTER UPDATE OF work_model ON public\.agencies/);
    assert.match(code, /OLD\.work_model = 'friends_collective'/);
    assert.match(code, /a\.work_model = 'friends_collective'\s+LOOP\s+PERFORM public\.talent_reviews_recompute_summary/);
  });
  test("the function keeps its privileges (CREATE OR REPLACE, no new grant), and the trigger function is not callable by clients", () => {
    assert.doesNotMatch(code, /GRANT EXECUTE ON FUNCTION public\.talent_reviews_recompute_summary/);
    assert.match(code, /REVOKE ALL ON FUNCTION public\.agencies_work_model_rating_recompute\(\) FROM PUBLIC, anon, authenticated/);
  });
});

describe("migration hygiene", () => {
  test("sorts after the work_model migration it depends on, is one transaction, and carries a rollback", () => {
    assert.ok("20261231422700" > "20261231420200");
    assert.match(sql, /^BEGIN;/m);
    assert.match(sql, /^COMMIT;/m);
    assert.match(sql, /ROLLBACK:/);
  });
});
