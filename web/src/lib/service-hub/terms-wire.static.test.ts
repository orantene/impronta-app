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
  assert.equal((src.match(/assertNotImpersonating\(\)/g) ?? []).length, 3);
  assert.match(src, /rpc\("respond_workspace_talent_terms"/);
  assert.match(src, /rpc\("propose_workspace_talent_terms"/);
  assert.doesNotMatch(src, /createServiceRoleClient/);
});

test("the terms migration is held, additive, and guards both RPCs", () => {
  const dir = join(web, "..", "supabase", "migrations", "_pending_pm");
  const file = readdirSync(dir).find((f) => f.endsWith("_workspace_talent_terms_tul1368.sql"));
  assert.ok(file, "held migration missing from _pending_pm");
  const sql = readFileSync(join(dir, file!), "utf8");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(code, /\b(DROP TABLE|ALTER TABLE public\.(?!workspace_talent_terms|talent_exclusive_workspace))/);
  assert.match(sql, /is_own_talent_profile\(v_row\.talent_profile_id\)/);
  assert.match(sql, /m\.role IN \('owner','admin'\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.respond_workspace_talent_terms\(uuid,boolean\) FROM PUBLIC, anon/);
});

test("accepting exclusive terms stores the talent's exclusive workspace (one per talent)", () => {
  const dir = join(web, "..", "supabase", "migrations", "_pending_pm");
  const sql = readFileSync(join(dir, "20261231419200_workspace_talent_terms_tul1368.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.talent_exclusive_workspace \(\s*talent_profile_id\s+uuid\s+PRIMARY KEY/);
  assert.match(sql, /IF p_accept AND v_row\.exclusive THEN\s*INSERT INTO public\.talent_exclusive_workspace/);
  assert.match(sql, /DELETE FROM public\.talent_exclusive_workspace/);
});

test("the card shows the exclusive notice before the buttons", () => {
  const src = read("src/components/talent/service-hub/HubTermsPrompt.tsx");
  assert.ok(src.indexOf("exclusiveNotice(") > 0 && src.indexOf("exclusiveNotice(") < src.indexOf("<form"));
});

test("review fixes: propose needs the talent on the roster, talent can revoke, caps, rollback notes", () => {
  const sql = readFileSync(join(web, "..", "supabase", "migrations", "_pending_pm", "20261231419200_workspace_talent_terms_tul1368.sql"), "utf8");
  assert.match(sql, /FROM public\.agency_talent_roster r\s+WHERE r\.tenant_id = p_tenant_id AND r\.talent_profile_id = p_talent_profile_id\s+AND r\.status IN \('active','pending'\)/);
  assert.match(sql, /FUNCTION public\.revoke_workspace_talent_terms\(p_terms_id uuid\)/);
  assert.match(sql, /status IN \('pending','accepted','declined','superseded','revoked'\)/);
  assert.match(sql, /share_bps <= 9000/);
  assert.match(sql, /-- ROLLBACK/);
  const actions = read("src/lib/service-hub/terms-actions.ts");
  assert.match(actions, /rpc\("revoke_workspace_talent_terms"/);
  const loader = read("src/lib/service-hub/terms.server.ts");
  assert.match(loader, /await createClient\(\)/);
  assert.doesNotMatch(loader, /admin\s*\.from\("workspace_talent_terms"\)/);
});
