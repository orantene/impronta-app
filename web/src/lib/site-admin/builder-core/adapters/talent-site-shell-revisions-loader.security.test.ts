/**
 * REV-1b — security/wiring guard for the TALENT-OWNED revisions LIST loader.
 *
 * (node:test + node:assert, text-scan — no Next.js / Supabase graph loaded,
 * mirroring `talent-site/actions.security.test.ts`.)
 *
 * THE GAP REV-1b CLOSES: REV-1 bound `restoreRevision` for the talent-site
 * shell, but the RevisionsDrawer's LIST read fell through to the STAFF-gated
 * `loadHomepageRevisionsAction` (the shell mounts with no `pageSlug`). A talent
 * has no staff capability, so the list read was denied — they could RESTORE but
 * not SEE their shell's revisions.
 *
 * This test pins the two halves of the fix as TEXT contracts (the runtime
 * routing is exercised by the pure adapter-core tests):
 *   1. `loadTalentSiteShellRevisionsAction` is OWNER-gated (gateOwner — the same
 *      gate REV-1's restore uses), scoped to the owner's own site, reading
 *      `talent_site_revisions` — and NEVER staff-gated / cms_* / service-role.
 *   2. The RevisionsDrawer PREFERS `loadSurfaceRevisions` over the staff-gated
 *      homepage/page default loaders, and the production adapter BINDS the
 *      owner-gated loader so `loadRevisions` is exposed for this surface.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(THIS_DIR, "../../../../..");

const ACTIONS_SRC = readFileSync(
  join(THIS_DIR, "talent-site-shell-actions.ts"),
  "utf8",
);
const ADAPTER_SRC = readFileSync(
  join(THIS_DIR, "talent-site-shell-adapter.ts"),
  "utf8",
);
const DRAWER_SRC = readFileSync(
  join(WEB_ROOT, "src/components/edit-chrome/revisions-drawer.tsx"),
  "utf8",
);

function loaderSource(): string {
  const start = ACTIONS_SRC.indexOf(
    "export async function loadTalentSiteShellRevisionsAction",
  );
  assert.ok(start >= 0, "loadTalentSiteShellRevisionsAction source located");
  const next = ACTIONS_SRC.indexOf("\nexport ", start + 1);
  return ACTIONS_SRC.slice(start, next === -1 ? undefined : next);
}

test("[REV-1b] the revisions LIST loader is OWNER-gated, not staff-gated", () => {
  const src = loaderSource();
  // Same owner gate REV-1's restore uses (owner + Max + own-id).
  assert.match(src, /const gate = await gateOwner\(/);
  assert.match(src, /if \(!gate\.ok\)/);
  // NEVER the staff gate the homepage/page default loaders use.
  assert.equal(src.includes("requireStaff"), false);
  assert.equal(src.includes("requireTenantScope"), false);
});

test("[REV-1b] the loader reads talent_site_revisions, scoped to the owner's own site", () => {
  const src = loaderSource();
  assert.match(src, /\.from\("talent_site_revisions"\)/);
  // Scoped to the owner's resolved site + own profile — never an unscoped read.
  assert.match(src, /\.eq\("talent_site_id", siteRow\.id\)/);
  assert.match(src, /\.eq\("talent_profile_id", gate\.talentProfileId\)/);
  // Uses the caller's OWN client (owner RLS backs it), never service-role.
  assert.match(src, /getCachedServerSupabase\(\)/);
  assert.equal(src.includes("getServiceRoleClient"), false);
  assert.equal(src.includes("createServiceRoleClient"), false);
  // Never touches cms_* revision tables.
  assert.equal(src.includes("cms_page_revisions"), false);
  assert.equal(src.includes("loadHomepageRevisionsForStaff"), false);
});

test("[REV-1b] the loader surfaces ONLY shell revisions (filters full-site composition rows)", () => {
  const src = loaderSource();
  assert.match(src, /isTalentSiteShellRevisionSnapshot\(/);
});

test("[REV-1b] the production adapter BINDS the owner-gated loader (exposes loadRevisions)", () => {
  // The seam only exposes loadRevisions when the action surface supplies
  // loadShellRevisions — the binding is the load-bearing step.
  assert.match(ADAPTER_SRC, /loadShellRevisions:\s*loadTalentSiteShellRevisionsAction/);
  assert.match(ADAPTER_SRC, /loadTalentSiteShellRevisionsAction/);
});

test("[REV-1b] the RevisionsDrawer PREFERS loadSurfaceRevisions over the staff-gated default", () => {
  // The drawer routes the list read through the surface adapter when present,
  // falling back to the homepage/page actions only when it is null. This keeps
  // the routing in the adapter/config — no surfaceKind fork in the drawer.
  assert.match(DRAWER_SRC, /loadSurfaceRevisions/);
  // The preference is structural: loadSurfaceRevisions is the FIRST branch of
  // the fetch ternary, ahead of loadPageRevisionsAction / loadHomepageRevisionsAction.
  const fetchIdx = DRAWER_SRC.indexOf("const fetchPromise");
  assert.ok(fetchIdx >= 0, "drawer builds a fetchPromise");
  const branch = DRAWER_SRC.slice(fetchIdx, fetchIdx + 400);
  const surfaceIdx = branch.indexOf("loadSurfaceRevisions");
  const homepageIdx = branch.indexOf("loadHomepageRevisionsAction");
  const pageIdx = branch.indexOf("loadPageRevisionsAction");
  assert.ok(surfaceIdx >= 0, "fetch prefers loadSurfaceRevisions");
  assert.ok(homepageIdx >= 0 && pageIdx >= 0, "fetch retains the default loaders");
  assert.ok(
    surfaceIdx < homepageIdx && surfaceIdx < pageIdx,
    "loadSurfaceRevisions must be preferred ahead of the staff-gated defaults",
  );
});
