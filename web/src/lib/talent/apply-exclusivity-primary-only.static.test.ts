/** TUL-1924: pins the primary-only exclusivity rule in the gate, the loader and the RLS migration. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const mig = read("../supabase/migrations/20261231429000_taa_talent_insert_primary_only_exclusivity.sql");
const actions = read("src/lib/talent/apply-actions.ts");
const loaders = read("src/lib/talent/apply-loaders.ts");

test("migration replaces taa_talent_insert as an INSERT policy with the same shape", () => {
  assert.match(mig, /DROP POLICY IF EXISTS "taa_talent_insert" ON public\."talent_agency_applications";/);
  assert.match(mig, /CREATE POLICY "taa_talent_insert" ON public\."talent_agency_applications"\s+AS PERMISSIVE\s+FOR INSERT\s+TO public/);
  assert.match(mig, /status = 'pending'::talent_application_status/);
  assert.match(mig, /tp\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(mig, /a\.accepts_open_applications = true/);
  assert.match(mig, /r\.status <> ALL \(ARRAY\['removed'::text, 'rejected'::text\]\)/);
});

test("migration exclusivity predicate requires is_primary and a different tenant", () => {
  assert.match(mig, /\(r\.is_primary = true\)/);
  assert.match(mig, /\(r\.tenant_id <> talent_agency_applications\.tenant_id\)/);
  assert.match(mig, /r\.exclusivity_status = ANY \(ARRAY\['confirmed'::exclusivity_status, 'auto_assigned'::exclusivity_status\]\)/);
});

test("migration also replaces tha_talent_insert with the same primary-only predicate and keeps the hub clause", () => {
  const hub = mig.slice(mig.indexOf('DROP POLICY IF EXISTS "tha_talent_insert"'));
  assert.match(hub, /CREATE POLICY "tha_talent_insert" ON public\."talent_hub_applications"\s+AS PERMISSIVE\s+FOR INSERT\s+TO public/);
  assert.match(hub, /ad\.kind = 'hub'::text/);
  assert.match(hub, /tp\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(hub, /\(r\.is_primary = true\)/);
  assert.match(hub, /\(r\.tenant_id <> talent_hub_applications\.tenant_id\)/);
});

test("rollback file restores both policies without is_primary", () => {
  const rb = read("../docs/plans/evidence/r1924-rollback.sql");
  assert.match(rb, /CREATE POLICY "taa_talent_insert"/);
  assert.match(rb, /CREATE POLICY "tha_talent_insert"/);
  assert.doesNotMatch(rb, /is_primary/);
});

test("migration changes no data", () => {
  assert.doesNotMatch(mig.replace(/^--.*$/gm, ""), /\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM|TRUNCATE)\b/i);
});

test("the gate and the loader only look at the primary roster row", () => {
  const gate = actions.slice(actions.indexOf("async function exclusivityGate"), actions.indexOf("async function submitApplication"));
  assert.match(gate, /\.eq\("is_primary", true\)/);
  assert.match(gate, /rosterBlocksApply\(/);
  assert.match(actions, /exclusivityGate\(guard\.talentProfile\.id, targetTenantId\)/);
  assert.match(loaders.slice(loaders.indexOf("async function isTalentExclusive")), /\.eq\("is_primary", true\)/);
});
