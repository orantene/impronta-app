/**
 * P0 (PR 0b-2): storage policies on media-public / media-originals gated staff with
 * the GLOBAL is_agency_staff(), so any studio owner (app_role 'agency_staff') could
 * list/read other tenants' private originals and insert/update/delete any tenant's
 * media through the Storage API. The fix scopes staff to the tenant that owns the
 * object path via storage_media_staff_can_touch(name) -> is_staff_of_tenant().
 *
 * Static: reads the migration text (in migrations/) and the upload call sites. No DB connection.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..");
const FILE = "20261231415100_storage_media_tenant_scoped_rls.sql";
const applied = join(REPO, "supabase", "migrations", FILE);
const sql = readFileSync(applied, "utf8");
// Executable SQL only: strip -- comments so prose cannot satisfy or fail a pin.
const code = sql.replace(/--.*$/gm, "");

const POLICIES: Array<[string, string, string]> = [
  ["staff_insert_public_media", "INSERT", "media-public"],
  ["staff_update_public_media", "UPDATE", "media-public"],
  ["staff_delete_public_media", "DELETE", "media-public"],
  ["staff_select_originals_media", "SELECT", "media-originals"],
  ["staff_insert_originals_media", "INSERT", "media-originals"],
  ["staff_delete_originals_media", "DELETE", "media-originals"],
];

function policyBody(name: string): string {
  const m = code.match(new RegExp(`CREATE POLICY ${name} ON storage\\.objects([\\s\\S]*?);`, "i"));
  assert.ok(m, `${name} must be (re)created`);
  return m[1];
}

for (const [name, cmd, bucket] of POLICIES) {
  test(`${name} is tenant-scoped, not global staff`, () => {
    const body = policyBody(name);
    assert.match(body, new RegExp(`FOR ${cmd} TO authenticated`, "i"));
    assert.ok(body.includes(`bucket_id = '${bucket}'`));
    assert.match(body, /public\.storage_media_staff_can_touch\(name\)/);
    assert.doesNotMatch(body, /is_agency_staff/i, "no global-staff predicate");
  });

  test(`${name} old global policy is dropped before re-create`, () => {
    assert.match(code, new RegExp(`DROP POLICY IF EXISTS ${name}\\s+ON storage\\.objects`, "i"));
  });
}

test("UPDATE policy also checks the NEW row (no renaming into another tenant's path)", () => {
  const body = policyBody("staff_update_public_media");
  assert.match(body, /USING\s+\(bucket_id = 'media-public' AND public\.storage_media_staff_can_touch\(name\)\)/);
  assert.match(body, /WITH CHECK\s+\(bucket_id = 'media-public' AND public\.storage_media_staff_can_touch\(name\)\)/);
});

test("helper resolves tenant/<id>/..., <tenant>/staging/... and <talent_profile_id>/... via is_staff_of_tenant", () => {
  const fn = code.match(/CREATE OR REPLACE FUNCTION public\.storage_media_staff_can_touch[\s\S]*?\$\$;/i)?.[0];
  assert.ok(fn, "helper defined");
  assert.match(fn, /SECURITY DEFINER/i);
  assert.match(fn, /SET search_path TO 'public'/i);
  assert.match(fn, /split_part\(p_name, '\/', 1\) = 'tenant'/);
  assert.match(fn, /public\.is_staff_of_tenant\(split_part\(p_name, '\/', 2\)::uuid\)/);
  assert.match(fn, /public\.agency_talent_roster/);
  assert.match(fn, /r\.removed_at IS NULL/);
  assert.match(fn, /public\.is_staff_of_tenant\(r\.tenant_id\)/);
  assert.match(fn, /ELSE false/i, "unparseable paths fail closed");
  assert.doesNotMatch(fn, /is_agency_staff/i);
});

test("helper is not callable by anon", () => {
  assert.match(code, /REVOKE ALL ON FUNCTION public\.storage_media_staff_can_touch\(text\) FROM PUBLIC, anon/i);
  assert.match(code, /GRANT EXECUTE ON FUNCTION public\.storage_media_staff_can_touch\(text\) TO authenticated/i);
});

test("public READ on media-public and talent-self policies are not touched", () => {
  assert.doesNotMatch(code, /storage_media_public_select/);
  assert.doesNotMatch(code, /talent_(insert|update|delete|select)_[a-z_]*media/);
  assert.doesNotMatch(code, /DELETE FROM storage|UPDATE storage\.objects|INSERT INTO storage/i, "no data touched");
});

test("the broad authenticated originals policies stay dropped", () => {
  assert.match(code, /DROP POLICY IF EXISTS storage_media_originals_select_authenticated/i);
  assert.match(code, /DROP POLICY IF EXISTS storage_media_originals_insert_authenticated/i);
});

// Path-convention pins: if an uploader changes its prefix, the helper must change too.
const WEB = join(REPO, "web", "src");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

test("server upload routes (service role) keep the tenant/<id>/ prefix the helper understands", () => {
  for (const f of [
    "app/api/admin/media/upload/route.ts",
    "app/api/admin/media/upload/svg/route.ts",
    "app/api/admin/media/upload/init/route.ts",
    "app/api/talent/media/upload/route.ts",
  ]) {
    assert.match(read(f), /`tenant\/\$\{(scope\.)?tenantId\}\//, f);
  }
});

test("the roster editor's direct browser uploads (the only user-session writers) use <talent_profile_id>/", () => {
  const dir = "app/(workspace)/[tenantSlug]/admin/roster/[id]/";
  assert.match(read(dir + "EditorSections.tsx"), /const storagePath = `\$\{talentId\}\/gallery\//);
});
