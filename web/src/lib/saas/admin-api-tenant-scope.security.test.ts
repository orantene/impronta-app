/**
 * admin-api-tenant-scope.security.test.ts — regression guard for two admin API
 * routes that read tenant-scoped PII from tables whose RLS uses the GLOBAL
 * is_agency_staff() check (talent_profiles / profiles / client_profiles). Without
 * an application-level tenant check, a staffer of one tenant could read another
 * tenant's talent profile or client name/email/phone/company by id (a confirmed
 * cross-tenant leak — see the tenant-isolation security audit).
 *
 * Source-level invariants (readFileSync + assert.match), the pattern blessed by
 * tenant-isolation.test.ts: route handlers can't be unit-tested without mocking
 * auth+supabase, so we pin that each route still derives the caller's tenant via
 * getTenantScope() and gates the lookup on the tenant membership table.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

test("inspector/talent route scopes the talent lookup to the caller's tenant roster", () => {
  const src = read("src/app/api/admin/inspector/talent/route.ts");
  assert.match(src, /getTenantScope\s*\(/, "must derive the caller's tenant via getTenantScope()");
  assert.match(src, /agency_talent_roster/, "must verify the talent is on the caller's tenant roster");
  assert.match(
    src,
    /\.eq\(\s*["']tenant_id["']\s*,\s*scope\.tenantId\s*\)/,
    "roster check must filter on the caller's tenant_id",
  );
});

test("clients/[id]/snapshot route scopes the client lookup to the caller's tenant relationships", () => {
  const src = read("src/app/api/admin/clients/[id]/snapshot/route.ts");
  assert.match(src, /getTenantScope\s*\(/, "must derive the caller's tenant via getTenantScope()");
  assert.match(
    src,
    /agency_client_relationships/,
    "must verify the client has a relationship with the caller's tenant",
  );
  assert.match(
    src,
    /\.eq\(\s*["']tenant_id["']\s*,\s*scope\.tenantId\s*\)/,
    "relationship check must filter on the caller's tenant_id",
  );
});
