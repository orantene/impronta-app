/**
 * TUL-1628: workspace staff can READ their AI usage and spend-cap rows, never write them. Static checks on the
 * held migration, plus a check that every app write to these tables is on the service-role client (which bypasses
 * RLS), so the stricter policy cannot break a legitimate path.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "_pending_pm", "20261231423600_ai_usage_controls_rls_select_only_tul1628.sql"), "utf8");
const code = sql.replace(/--.*$/gm, "");
const TABLES = ["ai_tenant_controls", "ai_usage_monthly"] as const;

test("held migration: reserved version, in _pending_pm, idempotent", () => {
  assert.match(sql, /^-- TUL-1628/);
  assert.match(sql, /HELD: lives in _pending_pm/);
  assert.match(code, /DROP POLICY IF EXISTS ai_tenant_controls_staff ON/);
  assert.match(code, /DROP POLICY IF EXISTS ai_usage_monthly_staff ON/);
});

test("each table gets a staff SELECT policy scoped to the tenant, and no write policy for authenticated", () => {
  for (const t of TABLES) {
    assert.match(code, new RegExp(`CREATE POLICY ${t}_staff_select ON public\\.${t}\\s+FOR SELECT\\s+TO authenticated\\s+USING \\(public\\.is_staff_of_tenant\\(tenant_id\\)\\)`), t);
    assert.match(code, new RegExp(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\\.${t} FROM authenticated`), t);
  }
  assert.doesNotMatch(code, /FOR (ALL|INSERT|UPDATE|DELETE)/i, "no write policy may be created");
  assert.doesNotMatch(code, /WITH CHECK/i);
  assert.doesNotMatch(code, /GRANT /i);
});

function files(): string[] {
  const out = execFileSync("git", ["ls-files", "src"], { cwd: process.cwd(), encoding: "utf8" });
  return out.split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && f !== "src/lib/supabase/database.types.ts");
}

test("every app write to these tables (and the usage RPC) is on the service-role client", () => {
  const WRITE = /from\("(?:ai_tenant_controls|ai_usage_monthly)"\)\s*\.(?:insert|update|upsert|delete)\(|rpc\("increment_ai_usage_monthly"/;
  const writers = files().filter((f) => WRITE.test(readFileSync(join(process.cwd(), f), "utf8")));
  assert.ok(writers.length >= 2, `expected the known writers, found ${writers.join(", ")}`);
  for (const f of writers) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.match(src, /createServiceRoleClient\(/, `${f} writes AI usage / controls but does not use the service-role client`);
  }
});
