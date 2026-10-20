import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const web = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

test("talent layout mounts the terms card, skipped while acting as the talent", () => {
  const src = read("src/app/(workspace)/talent/_talent-layout-inner.tsx");
  assert.match(src, /actingAs \? null : \(\s*<Suspense fallback=\{null\}>\s*<HubTermsPrompt /);
});

test("terms actions refuse impersonation and call the guarded RPCs with the user session", () => {
  const src = read("src/lib/service-hub/terms-actions.ts");
  assert.equal((src.match(/assertNotImpersonating\(\)/g) ?? []).length, 2);
  assert.match(src, /rpc\("respond_workspace_talent_terms"/);
  assert.match(src, /rpc\("propose_workspace_talent_terms"/);
  assert.doesNotMatch(src, /createServiceRoleClient/);
});

test("the terms migration is held, additive, and guards both RPCs", () => {
  const dir = join(web, "..", "supabase", "migrations", "_pending_pm");
  const file = readdirSync(dir).find((f) => f.endsWith("_workspace_talent_terms_tul1368.sql"));
  assert.ok(file, "held migration missing from _pending_pm");
  const sql = readFileSync(join(dir, file!), "utf8");
  assert.doesNotMatch(sql, /\b(DROP TABLE|ALTER TABLE public\.(?!workspace_talent_terms|talent_exclusive_workspace))/);
  assert.match(sql, /is_own_talent_profile\(v_row\.talent_profile_id\)/);
  assert.match(sql, /m\.role IN \('owner','admin'\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.respond_workspace_talent_terms\(uuid,boolean\) FROM PUBLIC, anon/);
});

test("accepting exclusive terms stores the talent's exclusive workspace (one per talent)", () => {
  const dir = join(web, "..", "supabase", "migrations", "_pending_pm");
  const sql = readFileSync(join(dir, "20261231419100_workspace_talent_terms_tul1368.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.talent_exclusive_workspace \(\s*talent_profile_id\s+uuid\s+PRIMARY KEY/);
  assert.match(sql, /IF p_accept AND v_row\.exclusive THEN\s*INSERT INTO public\.talent_exclusive_workspace/);
  assert.match(sql, /DELETE FROM public\.talent_exclusive_workspace/);
});

test("the card shows the exclusive notice before the buttons", () => {
  const src = read("src/components/talent/service-hub/HubTermsPrompt.tsx");
  assert.ok(src.indexOf("exclusiveNotice(") > 0 && src.indexOf("exclusiveNotice(") < src.indexOf("<form"));
});
