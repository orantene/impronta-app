import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const web = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

const ACTIONS = "src/components/admin/shell/internal/actions.ts";
const DRAWER = "src/components/admin/shell/internal/drawers/profile-shell/TalentProfileShellDrawer.tsx";

test("TUL-1476: the People page direct add (profile drawer) checks terms first and proposes after the roster row", () => {
  const src = read(ACTIONS);
  const fn = src.slice(src.indexOf("export async function addTalentToRoster("), src.indexOf("// ── Create Draft"));
  const check = fn.indexOf('readJoinTerms(terms, termsCtx.defaultModel).kind === "invalid"');
  const profileInsert = fn.indexOf('.from("talent_profiles")');
  const rosterInsert = fn.indexOf('from("agency_talent_roster").insert(');
  const propose = fn.indexOf("await proposeTermsOnJoin(await createClient(), {");
  assert.ok(check > 0 && check < profileInsert, "invalid terms must be refused before anything is written");
  assert.ok(rosterInsert > 0 && propose > rosterInsert, "terms follow the roster write (the RPC needs the row)");
  const block = fn.slice(propose, fn.indexOf("});", propose));
  assert.match(block, /tenantId: scope\.tenantId,/);
  assert.match(block, /path: "direct_add"/);
  // The user session proposes, never the service role.
  assert.doesNotMatch(block.slice(0, block.indexOf("})")), /admin,/);
  assert.match(fn, /terms: termsOutcome/);
});

test("TUL-1476: the New profile drawer shows the terms step before create and sends it with the add", () => {
  const src = read(DRAWER);
  assert.match(src, /mode === "create" && !isSelf && !payload\.talentId && tenantSlug \? \(\s*<CreateJoinTerms/);
  assert.match(src, /managementMethod: "agency",\s*\}, joinTermsRef\.current\)/);
  const step = read("src/components/admin/shell/internal/drawers/profile-shell/CreateJoinTerms.tsx");
  assert.match(step, /<JoinTermsStep/);
  assert.match(step, /termsRef\.current = next/);
});
