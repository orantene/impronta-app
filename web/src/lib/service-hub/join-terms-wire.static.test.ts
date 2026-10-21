import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const web = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

const PATHS = [
  { file: "src/lib/server-actions/roster-invite.ts", path: "invite", write: /tenantScopedQuery\(\s*admin,\s*"agency_talent_roster",\s*scope\.tenantId,?\s*\)\.insert\(/ },
  { file: "src/app/(workspace)/[tenantSlug]/admin/roster/registration/actions.ts", path: "discover_join", write: /\.update\(update\)/ },
  { file: "src/app/(workspace)/[tenantSlug]/admin/roster/new/actions.ts", path: "direct_add", write: /from\("agency_talent_roster"\)\.insert\(/ },
] as const;

test("all three join paths propose terms AFTER the roster row is written, scoped to the workspace", () => {
  for (const p of PATHS) {
    const src = read(p.file);
    const call = src.indexOf("await proposeTermsOnJoin(await createClient(), {");
    assert.ok(call > 0, `${p.file} never proposes terms`);
    const write = src.search(p.write);
    assert.ok(write > 0 && write < call, `${p.file}: terms must follow the roster write (the RPC needs the roster row)`);
    const block = src.slice(call, src.indexOf("});", call));
    assert.match(block, /tenantId: scope\.tenantId,/, `${p.file}: tenant must come from the resolved scope`);
    assert.match(block, new RegExp(`path: "${p.path}"`));
    // The terms are checked before anything is written.
    const check = src.indexOf("readJoinTerms(terms, termsCtx.defaultModel).kind === \"invalid\"");
    assert.ok(check > 0 && check < write, `${p.file}: invalid terms must be refused before the roster write`);
  }
});

test("Discover approval only proposes for a request of THIS workspace", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/roster/registration/actions.ts");
  const guard = src.indexOf("if (row.tenant_id !== scope.tenantId)");
  assert.ok(guard > 0 && guard < src.indexOf("await proposeTermsOnJoin("));
  // Reject never proposes.
  const reject = src.slice(src.indexOf('if (decision === "reject")'), src.indexOf("// Approve"));
  assert.doesNotMatch(reject, /proposeTermsOnJoin/);
});

test("terms go through #4158's guarded RPC with the user session, never the service role", () => {
  const src = read("src/lib/service-hub/join-terms.server.ts");
  assert.match(src, /rpc\("propose_workspace_talent_terms"/);
  assert.doesNotMatch(src, /rpc\("respond_workspace_talent_terms"|workspace_service_listing|createServiceRoleClient/);
  assert.doesNotMatch(src, /\.from\("workspace_talent_terms"\)/);
});

test("no sale before acceptance: listings bind to an ACCEPTED terms version only (TUL-1367 SQL)", () => {
  const sql = readFileSync(join(web, "..", "supabase", "migrations", "_pending_pm", "20261231419300_workspace_service_listings_tul1367.sql"), "utf8");
  assert.match(sql, /RAISE EXCEPTION 'no_accepted_terms'/);
  assert.match(sql, /accepted_terms_version IS NULL THEN\s+RETURN false;/);
  assert.match(sql, /AND version = \$3 AND status = ''accepted''/);
});

test("each owner flow mounts the terms step", () => {
  assert.match(read("src/components/admin/shell/internal/drawers/light-18.tsx"), /<JoinTermsStep tenantSlug=\{tenantSlug\}[^>]*onChange=\{setTerms\}/);
  assert.match(read("src/components/admin/shell/internal/drawers/light-18.tsx"), /inviteRosterTalent\(tenantSlug, name, email, terms\)/);
  assert.match(read("src/components/admin/registration/JoinRequestsList.tsx"), /decideJoinRequest\(tenantSlug, id, decision, decision === "approve" \? terms : null\)/);
  assert.match(read("src/components/admin/registration/JoinRequestsList.tsx"), /<JoinTermsStep /);
  assert.match(read("src/app/(workspace)/[tenantSlug]/admin/roster/new/NewRosterTalentForm.tsx"), /<JoinTermsStep [^>]*asFormFields \/>/);
});

test("the step has no em dashes and no raw hex colours", () => {
  for (const f of ["src/components/admin/service-hub/JoinTermsStep.tsx", "src/lib/service-hub/join-terms-copy.ts", "src/lib/service-hub/join-terms.ts"]) {
    const src = read(f);
    assert.doesNotMatch(src, /—/, `${f} has an em dash`);
  }
  assert.doesNotMatch(read("src/components/admin/service-hub/JoinTermsStep.tsx"), /#[0-9a-fA-F]{3,8}\b/);
});

test("rent currency never falls back to USD; it comes from #4200's explicit display currency", () => {
  for (const f of ["src/lib/service-hub/join-terms.ts", "src/components/admin/service-hub/JoinTermsStep.tsx", "src/lib/service-hub/join-terms.server.ts"]) {
    assert.doesNotMatch(read(f), /(\|\||\?\?|=)\s*"USD"/, `${f} has a USD fallback`);
  }
  const server = read("src/lib/service-hub/join-terms.server.ts");
  assert.match(server, /import \{ explicitDisplayCurrency \} from "@\/lib\/reservations\/deposit-currency"/);
  assert.match(server, /\.from\("agencies"\)\.select\("settings"\)\.eq\("id", tenantId\)/);
  assert.match(read("src/components/admin/service-hub/JoinTermsStep.tsx"), /joinTermsInputFor\(res\.defaultModel, res\.workspaceCurrency\)/);
});

test("direct add: a terms problem after the save lands on the roster page with a notice", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/roster/new/actions.ts");
  const propose = src.indexOf("termsOutcome = await proposeTermsOnJoin(");
  const flag = src.indexOf("redirect(`/${tenantSlug}/admin/roster?joinTerms=${termsFlag}`)");
  assert.ok(propose > 0 && flag > propose, "flag redirect must follow the propose call");
  assert.ok(flag < src.indexOf('if (d.management_method === "agency")'), "flag redirect must win over the profile redirect");
  const page = read("src/app/(workspace)/[tenantSlug]/admin/roster/page.tsx");
  assert.match(page, /parseJoinTermsFlag\(\(await searchParams\)\.joinTerms\)/);
  assert.match(page, /<JoinTermsRedirectNotice outcome=\{joinTerms\} \/>/);
  const notice = read("src/components/admin/service-hub/JoinTermsRedirectNotice.tsx");
  assert.match(notice, /toast\(text, \{ tone: "warning" \}\)/);
  assert.match(notice, /joinTermsOutcomeNotice\(outcome, locale\)/);
  assert.match(notice, /router\.replace\(pathname/);
});
