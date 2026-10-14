// TUL-745: platform admin Settings (7.7s) and Tenants (4.9s) were slow because
// independent reads ran as a serial chain of round trips. Static guards.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("platform Settings page loads its independent reads in one Promise.all", () => {
  const src = read("src/app/(workspace)/platform/admin/settings/page.tsx");
  const body = src.slice(src.indexOf("export default async function"));
  assert.match(body, /await Promise\.all\(\[/);
  const loaders = [
    "loadPlatformSuperAdmins",
    "loadPlatformOperatingCurrency",
    "loadPlatformCommercialDefaults",
    "loadActivePayoutSystem",
    "loadPlatformWorkspaceUi",
    "isMessagingChannelsEnabled",
    "loadPrivateMediaAccessState",
    "loadGuestCaptchaEnforced",
  ];
  for (const l of loaders) {
    assert.doesNotMatch(body, new RegExp(`= await ${l}\\(`), `${l} must not be awaited serially`);
  }
});

test("tenant list loader fetches taxonomy, owner names and auth emails together", () => {
  const src = read("src/app/(workspace)/platform/tenant-management-data.ts");
  const start = src.indexOf("export async function loadPlatformTenantList");
  const fn = src.slice(start, src.indexOf("\nexport ", start + 10));
  assert.doesNotMatch(fn, /await sb\.auth\.admin\.listUsers/, "listUsers must start in a parallel batch");
  assert.doesNotMatch(fn, /const \{ data: tpt \} = await/, "taxonomy read must be inside Promise.all");
  assert.doesNotMatch(fn, /const \{ data: profiles \} = await/, "profiles read must be inside Promise.all");
  assert.match(fn, /const usersPromise = sb\.auth\.admin\.listUsers/);
});
