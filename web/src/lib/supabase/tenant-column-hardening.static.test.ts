/**
 * TUL-1292 / TUL-1721 / TUL-1791 (package P1): tenant + column hardening, one held migration.
 *
 * supabase/migrations/_pending_pm/20261231426400_tenant_column_hardening_tul1292.sql closes three
 * database-layer holes. These pins fail the build if the migration text or the web code that has to
 * live with it drifts:
 *
 *   1. agency_domains: a BEFORE INSERT OR UPDATE trigger stops everyone but service_role / a direct
 *      connection from marking a hostname verified / ssl_provisioned / active / suspended, setting
 *      the verification timestamps, or re-pointing hostname / kind. The web verification actions
 *      therefore write the transition through the service-role client.
 *   2. admission_comp, party_waitlist_join, session_set_instructor refuse ids from another tenant.
 *   3. talent_profiles.invitation_email is revoked from `authenticated`; the owner and staff read it
 *      through SECURITY DEFINER RPCs, and every file naming the column is audited below.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const WEB = process.cwd();
const SRC = join(WEB, "src");
const MIGRATIONS = join(WEB, "..", "supabase", "migrations");
const HELD_DIR = join(MIGRATIONS, "_pending_pm");
const FILE = "20261231426400_tenant_column_hardening_tul1292.sql";
const REVOKE_FILE_VERSION = "20261231425500";

const sql = () => readFileSync(join(HELD_DIR, FILE), "utf8");
const code = () => sql().replace(/^\s*--.*$/gm, "");

/** The `CREATE OR REPLACE FUNCTION <name>(` ... `$$;` block (first match). */
function fnBlock(src: string, name: string): string {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  const end = src.indexOf("$$;", src.indexOf("AS $$", start));
  assert.ok(end > start, `${name} not terminated`);
  return src.slice(start, end + 3);
}

// --- held file --------------------------------------------------------------

test("the migration is held in _pending_pm, sorts after the 425500 revoke, and is the only file at its version", () => {
  const held = readdirSync(HELD_DIR);
  const live = readdirSync(MIGRATIONS);
  assert.ok(held.includes(FILE));
  assert.ok(!live.includes(FILE), "must not be in the live folder");
  assert.ok(FILE.slice(0, 14) > REVOKE_FILE_VERSION);
  assert.equal(held.filter((f) => f.startsWith(FILE.slice(0, 14))).length, 1);
  assert.ok(held.some((f) => f.startsWith(REVOKE_FILE_VERSION)), "the revoke it extends must exist");
});

test("header states the apply order and the deploy-first rule", () => {
  const s = sql();
  assert.match(s, /APPLY ORDER: AFTER 20261231425500/);
  assert.match(s, /only once the web code of this PR is deployed/);
  assert.match(s, /HELD FILE/);
});

test("it runs in one transaction and never uses SET ROLE", () => {
  const c = code();
  assert.equal((c.match(/^BEGIN;/gm) ?? []).length, 1);
  assert.equal((c.match(/^COMMIT;/gm) ?? []).length, 1);
  assert.doesNotMatch(c, /SET\s+(LOCAL\s+)?ROLE/i);
});

test("it refuses to run before the 425500 table-level revoke (a column REVOKE is a no-op under a table grant)", () => {
  const c = code();
  assert.match(c, /has_table_privilege\('authenticated', 'public\.talent_profiles', 'SELECT'\)/);
  assert.match(c, /apply 20261231425500 first/);
  assert.match(c, /to_regprocedure\('public\.staff_can_access_talent_profile\(uuid\)'\) IS NULL/);
  assert.ok(
    c.indexOf("apply 20261231425500 first") < c.indexOf("REVOKE SELECT (invitation_email)"),
    "the precondition must come before the revoke",
  );
});

// --- 1. agency_domains ------------------------------------------------------

test("agency_domains guard: trigger fires BEFORE INSERT OR UPDATE and bypasses only service_role / direct connections", () => {
  const c = code();
  assert.match(c, /DROP TRIGGER IF EXISTS trg_agency_domains_guard_verification_state ON public\.agency_domains;/);
  assert.match(
    c,
    /CREATE TRIGGER trg_agency_domains_guard_verification_state\s+BEFORE INSERT OR UPDATE ON public\.agency_domains\s+FOR EACH ROW/,
  );
  const fn = fnBlock(c, "agency_domains_guard_verification_state");
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = public/);
  assert.match(fn, /request\.jwt\.claims/);
  assert.match(fn, /request\.jwt\.claim\.role/);
  assert.match(fn, /IF v_caller_role IN \('service_role', ''\) THEN\s+RETURN NEW;/);
  // The bypass is exactly that one line: no platform-admin or owner escape hatch for the state columns.
  assert.doesNotMatch(fn, /is_platform_admin|agency_memberships|auth\.uid/);
  assert.match(code(), /REVOKE ALL ON FUNCTION public\.agency_domains_guard_verification_state\(\) FROM PUBLIC, anon, authenticated;/);
});

test("agency_domains guard blocks the unverified-active PATCH, the timestamps, suspended release and re-pointing", () => {
  const fn = fnBlock(code(), "agency_domains_guard_verification_state");
  // INSERT: only the two unverified starting states, no timestamps.
  assert.match(fn, /NEW\.status NOT IN \('pending', 'dns_verification_sent'\)/);
  assert.match(fn, /NEW\.verified_at IS NOT NULL/);
  assert.match(fn, /NEW\.ssl_provisioned_at IS NOT NULL/);
  // UPDATE: the four privileged target states.
  assert.match(fn, /NEW\.status IN \('verified', 'ssl_provisioned', 'active', 'suspended'\)/);
  assert.match(fn, /OLD\.status = 'suspended'/);
  assert.match(fn, /NEW\.verified_at IS DISTINCT FROM OLD\.verified_at/);
  assert.match(fn, /NEW\.ssl_provisioned_at IS DISTINCT FROM OLD\.ssl_provisioned_at/);
  assert.match(fn, /NEW\.hostname IS DISTINCT FROM OLD\.hostname OR NEW\.kind IS DISTINCT FROM OLD\.kind/);
  // Every refusal is 42501 (insufficient_privilege), never a silent return.
  assert.equal((fn.match(/RAISE EXCEPTION/g) ?? []).length, (fn.match(/ERRCODE = '42501'/g) ?? []).length);
  assert.ok((fn.match(/RAISE EXCEPTION/g) ?? []).length >= 5);
});

test("agency_domains guard leaves the owner's reconnect flow (reset to dns_verification_sent / failed) allowed", () => {
  const fn = fnBlock(code(), "agency_domains_guard_verification_state");
  // The privileged status list must not contain the states the owner flow writes.
  const listed = fn.match(/NEW\.status IN \(([^)]*)\)/)?.[1] ?? "";
  for (const s of ["pending", "dns_verification_sent", "failed"]) assert.ok(!listed.includes(s), `${s} must stay writable`);
  // Clearing a timestamp back to null is allowed: the check is NEW ... IS NOT NULL AND changed.
  assert.match(fn, /NEW\.verified_at IS NOT NULL AND NEW\.verified_at IS DISTINCT FROM OLD\.verified_at/);
});

test("the owner's verify / provisioning transitions are written through the service-role client", () => {
  const src = readFileSync(
    join(SRC, "app", "(workspace)", "[tenantSlug]", "admin", "settings", "domain-actions.ts"),
    "utf8",
  );
  assert.match(src, /import \{ createServiceRoleClient \} from "@\/lib\/supabase\/admin";/);
  assert.match(src, /verifyCustomDomainRecord\(writer, domain\)/);
  assert.match(src, /syncCustomDomainProvisioning\(writer, domain\)/);
  assert.doesNotMatch(src, /verifyCustomDomainRecord\(supabase/);
  assert.doesNotMatch(src, /syncCustomDomainProvisioning\(supabase/);
  assert.match(src, /const writer = transitionWriter\(tenantSlug, returnTo\);/);
  // The server action proves the tenant BEFORE the elevated write: the row is loaded with scope.tenantId.
  assert.match(src, /loadCustomDomainVerificationRecord\(\s*supabase,\s*scope\.tenantId,/);
  assert.match(src, /requireCapability\("manage_agency_domains", scope\.tenantId\)/);
  // "use server": only async functions are exported, so the helper stays module-private.
  assert.doesNotMatch(src, /export (const|function) transitionWriter/);
});

test("no user-session code path writes a privileged agency_domains state", () => {
  const offenders: string[] = [];
  for (const f of walk(SRC)) {
    const src = readFileSync(f, "utf8");
    if (!/from\(\s*["'`]agency_domains["'`]\s*\)/.test(src)) continue;
    for (const m of src.matchAll(/from\(\s*["'`]agency_domains["'`]\s*\)\s*\.(insert|update|upsert)\(\s*\{([\s\S]*?)\}\s*\)/g)) {
      if (/status:\s*["'`](verified|ssl_provisioned|active|suspended)["'`]/.test(m[2])) {
        offenders.push(`${rel(f)}: ${m[1]} writes a privileged status`);
      }
    }
  }
  // Audited: platform + provisioning + workspace-domain writers all use the service-role client.
  const allowed = new Set([
    "src/app/(workspace)/platform/admin/tenants/actions-control.ts",
    "src/lib/saas/ensure-workspace-domain.ts",
  ]);
  const unexpected = offenders.filter((o) => !allowed.has(o.split(":")[0]));
  assert.deepEqual(unexpected, []);
  for (const f of allowed) {
    const src = readFileSync(join(WEB, f), "utf8");
    // actions-control builds the service-role client itself; ensure-workspace-domain takes the
    // caller's `admin` (its callers, talent-workspace-provision and provision-for-choice, pass one).
    assert.match(src, /createServiceRoleClient|\badmin\.from\("agency_domains"\)/, `${f} must write with the service-role client`);
  }
});

// --- 2. RPC tenant checks ---------------------------------------------------

test("admission_comp reads the tier variant through its offering's tenant", () => {
  const fn = fnBlock(code(), "admission_comp");
  assert.match(fn, /JOIN public\.talent_offerings o ON o\.id = v\.offering_id/);
  assert.match(fn, /WHERE v\.id = p_tier_variant_id AND o\.tenant_id = p_tenant_id/);
  assert.doesNotMatch(fn, /FROM public\.talent_offering_variants WHERE id = p_tier_variant_id;/);
  // Earlier fixes survive the redefinition (D-142 identity, D-146 payee).
  assert.match(fn, /owner_tenant_id/);
  assert.match(fn, /guest_session_id/);
  assert.match(fn, /c\.tenant_id = p_tenant_id/);
});

test("party_waitlist_join refuses a zone of another tenant (and of another location)", () => {
  const fn = fnBlock(code(), "party_waitlist_join");
  assert.match(fn, /FROM public\.venue_location_zones z/);
  assert.match(fn, /z\.tenant_id = p_tenant_id/);
  assert.match(fn, /p_location_id IS NULL OR z\.location_id = p_location_id/);
  assert.ok(fn.indexOf("venue_location_zones") < fn.indexOf("INSERT INTO public.party_waitlist"), "check before the insert");
  assert.match(fn, /FROM public\.venue_locations WHERE id = p_location_id AND tenant_id = p_tenant_id/);
});

test("session_set_instructor refuses a user who is neither staff nor an active roster talent of the tenant", () => {
  const fn = fnBlock(code(), "session_set_instructor");
  assert.match(fn, /m\.tenant_id = p_tenant_id AND m\.profile_id = p_user_id AND m\.status = 'active'/);
  assert.match(fn, /r\.tenant_id = p_tenant_id AND r\.status = 'active' AND tp\.user_id = p_user_id/);
  assert.match(fn, /'wrong_tenant'/);
  assert.ok(fn.indexOf("'wrong_tenant'") < fn.indexOf("UPDATE public.sessions"), "check before any write");
  assert.match(fn, /FROM public\.sessions\s+WHERE id = p_session_id AND tenant_id = p_tenant_id/);
});

test("the three RPCs stay service_role-only, with the same signatures as before", () => {
  const c = code();
  const sigs = [
    "admission_comp(uuid, uuid, uuid, text, text, text, uuid, text, text, uuid)",
    "party_waitlist_join(uuid, uuid, uuid, integer, text, text, text, text, integer)",
    "session_set_instructor(uuid, uuid, uuid, text)",
  ];
  for (const sig of sigs) {
    const esc = sig.replace(/[()]/g, "\\$&");
    assert.match(c, new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC, anon, authenticated;`));
    assert.match(c, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO service_role;`));
    assert.doesNotMatch(c, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO [^;]*(authenticated|anon)`));
  }
  assert.doesNotMatch(c, /DROP FUNCTION/i, "CREATE OR REPLACE with identical signatures: no overload may be left behind");
});

test("each redefined RPC keeps the signature of its latest earlier definition", () => {
  const read = (f: string) => readFileSync(join(MIGRATIONS, f), "utf8");
  const argsOf = (src: string, name: string) =>
    (src.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(([\\s\\S]*?)\\)\\s*RETURNS`))?.[1] ?? "").replace(/\s+/g, " ").trim();
  const mine = code();
  assert.equal(argsOf(mine, "admission_comp"), argsOf(read("20261231242000_admission_comp_payee.sql"), "admission_comp"));
  assert.equal(argsOf(mine, "party_waitlist_join"), argsOf(read("20261231224000_party_waitlist.sql"), "party_waitlist_join"));
  assert.equal(argsOf(mine, "session_set_instructor"), argsOf(read("20261231217000_session_ops.sql"), "session_set_instructor"));
});

// --- 3. invitation_email ----------------------------------------------------

test("invitation_email is revoked from authenticated at column level and nothing else on talent_profiles is touched", () => {
  const c = code();
  assert.match(c, /REVOKE SELECT \(invitation_email\) ON public\.talent_profiles FROM authenticated;/);
  const tpStatements = [...c.matchAll(/(REVOKE|GRANT)[^;]*public\.talent_profiles[^;]*;/gi)].map((m) => m[0]);
  assert.equal(tpStatements.length, 1, `unexpected talent_profiles ACL statements: ${tpStatements.join(" | ")}`);
  assert.doesNotMatch(c, /talent_profiles\s+(FROM|TO)\s+[^;]*\b(anon|service_role)\b/);
  assert.doesNotMatch(c, /ALTER TABLE/i);
});

test("talent_invitation_email: SECURITY DEFINER, empty search_path, own row or staff only, authenticated EXECUTE only", () => {
  const c = code();
  const fn = fnBlock(c, "talent_invitation_email");
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = ''/);
  assert.match(fn, /auth\.uid\(\) IS NOT NULL/);
  assert.match(fn, /tp\.user_id = auth\.uid\(\)/);
  assert.match(fn, /public\.staff_can_access_talent_profile\(p_talent_id\)/);
  assert.match(c, /REVOKE ALL ON FUNCTION public\.talent_invitation_email\(uuid\) FROM PUBLIC, anon;/);
  assert.match(c, /GRANT EXECUTE ON FUNCTION public\.talent_invitation_email\(uuid\) TO authenticated;/);
  assert.doesNotMatch(c, /GRANT EXECUTE ON FUNCTION public\.talent_invitation_email[^;]*\banon\b/);
});

test("talent_seed_invitation_email: own profile only, fills an empty value only", () => {
  const c = code();
  const fn = fnBlock(c, "talent_seed_invitation_email");
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path = ''/);
  assert.match(fn, /tp\.user_id = auth\.uid\(\)/);
  assert.match(fn, /tp\.invitation_email IS NULL/);
  assert.doesNotMatch(fn, /staff_can_access_talent_profile/);
  assert.match(c, /GRANT EXECUTE ON FUNCTION public\.talent_seed_invitation_email\(uuid, text\) TO authenticated;/);
  assert.doesNotMatch(c, /GRANT EXECUTE ON FUNCTION public\.talent_seed_invitation_email[^;]*\banon\b/);
});

test("both new RPCs are reviewed in the function-execute allow-list for authenticated only", () => {
  const json = JSON.parse(readFileSync(join(WEB, "scripts", "function-execute-allowlist.json"), "utf8")) as {
    reviewed: Array<{ signature: string; roles: string[]; reason: string }>;
  };
  for (const sig of ["talent_invitation_email(uuid)", "talent_seed_invitation_email(uuid, text)"]) {
    const e = json.reviewed.find((x) => x.signature === sig);
    assert.ok(e, `${sig} must be reviewed`);
    assert.deepEqual(e.roles, ["authenticated"]);
    assert.match(e.reason, /auth\.uid/);
  }
});

/**
 * Every non-test source file that names invitation_email, with why it survives the revoke.
 * A new file naming the column fails the test until someone decides which kind it is.
 */
const INVITATION_EMAIL_AUDIT: Record<string, string> = {
  // write-only: UPDATE / INSERT payloads (no RETURNING, no WHERE on the column)
  "src/app/(workspace)/[tenantSlug]/admin/roster/[id]/actions.ts": "write via admin client",
  "src/app/(workspace)/[tenantSlug]/admin/roster/new/actions.ts": "insert payload + form parse",
  "src/components/admin/shell/internal/actions.ts": "write via admin client",
  "src/lib/account/anonymize.ts": "scrub write (service role)",
  "src/lib/onboarding/talent-writer.server.ts": "write payload",
  "src/lib/server-actions/talent-self-profile-sections.ts": "UPDATE patch, no RETURNING",
  "src/lib/talent/talent-profile-shell-persistence.ts": "patch builder",
  // service-role reads (admin client, tenant filter)
  "src/app/(workspace)/[tenantSlug]/_data-bridge/roster.ts": "service-role roster read, .eq(tenant_id)",
  "src/app/(workspace)/[tenantSlug]/admin/people/people-data.ts": "service-role client",
  "src/components/admin/shell/internal/data-bridge.ts": "service-role roster read, .eq(tenant_id)",
  "src/lib/server-actions/roster-invite.ts": "admin client dedup lookup",
  "src/lib/server-actions/roster-import-row.ts": "admin client dedup lookup",
  // user-session readers moved to the RPC
  "src/lib/server-actions/admin-talent-profile-sections.ts": "RPC via loadTalentInvitationEmail (+ a row type)",
  "src/lib/talent/self-profile-editor-data.ts": "RPC via loadTalentInvitationEmail (+ a row type)",
  "src/lib/talent/invitation-email.ts": "the RPC helper itself",
  "src/app/onboarding/actions.ts": "RPC via seedTalentInvitationEmail (+ a comment)",
  // UI props, types and comments: no query
  "src/app/(workspace)/[tenantSlug]/admin/roster/[id]/TalentEditForm.tsx": "form field",
  "src/app/(workspace)/[tenantSlug]/admin/roster/new/NewRosterTalentForm.tsx": "form field",
  "src/components/admin/shell/internal/drawers/profile-shell/TalentProfileShellDrawer.tsx": "reads the loaded draft",
  "src/components/admin/shell/internal/state/types.ts": "comment",
  "src/lib/people/hats.ts": "comment",
  "src/lib/notifications/catalog-audiences-unclaimed.ts": "comment",
  "src/lib/server-actions/talent-takeover.ts": "comment",
};

test("every source file naming invitation_email is audited", () => {
  const seen = walk(SRC)
    .filter((f) => readFileSync(f, "utf8").includes("invitation_email"))
    .map(rel)
    .filter((f) => !f.endsWith("database.types.ts"));
  const unaudited = seen.filter((f) => !(f in INVITATION_EMAIL_AUDIT));
  assert.deepEqual(unaudited, [], "new file names invitation_email: decide service-role / RPC / write-only and add it above");
  const stale = Object.keys(INVITATION_EMAIL_AUDIT).filter((f) => !seen.includes(f));
  assert.deepEqual(stale, [], "audit entry no longer names the column: remove it");
});

test("no user-session query selects, filters or returns invitation_email any more", () => {
  const migrated = [
    "src/lib/server-actions/admin-talent-profile-sections.ts",
    "src/lib/talent/self-profile-editor-data.ts",
    "src/app/onboarding/actions.ts",
  ];
  for (const f of migrated) {
    const src = readFileSync(join(WEB, f), "utf8");
    assert.doesNotMatch(src, /\.select\(\s*["'`]invitation_email/, `${f}: select`);
    assert.doesNotMatch(src, /^\s+invitation_email,\s*$/m, `${f}: column in a select list`);
    assert.doesNotMatch(src, /\.(is|eq|ilike)\(\s*["'`]invitation_email/, `${f}: filter on the column`);
    assert.match(src, /@\/lib\/talent\/invitation-email/, `${f}: must use the RPC helper`);
  }
});

test("public and talent-site pages never read invitation_email", () => {
  const publicRoots = ["src/app/t", "src/app/(public)", "src/app/%5Ftalent-site", "src/lib/talent-site", "src/lib/storefront"];
  for (const root of publicRoots) {
    let files: string[] = [];
    try {
      files = walk(join(WEB, root));
    } catch {
      continue;
    }
    for (const f of files) {
      assert.ok(!readFileSync(f, "utf8").includes("invitation_email"), `${rel(f)} reads invitation_email`);
    }
  }
});

// --- helpers ----------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|static\.test)\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function rel(p: string): string {
  return relative(WEB, p).split("\\").join("/");
}
