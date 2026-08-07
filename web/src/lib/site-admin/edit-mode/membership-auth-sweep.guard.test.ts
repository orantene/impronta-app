import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { rolePhase5HasCapability } from "../capabilities";

/**
 * Builder-lane half of the membership-auth sweep pins (2026-08-04).
 *
 * Sibling of `design-actions-membership-guard.test.ts` (PR #990), which pinned
 * the two files that incident touched. This file pins the rest of the builder /
 * site-admin surface that carried the SAME `requireStaff()` global-app_role
 * gate: every editor action, the storefront edit-chrome mount, and the public
 * draft reader. A hybrid workspace owner (talent/client `profiles.app_role` +
 * owner membership) must be able to run all of them on their own workspace.
 *
 * The pinned contract per file: no `requireStaff()` call, and an explicit
 * membership proof — `requireSession()` plus one of
 * `requireEditSurfaceTenantScope` (the surface-derived resolver editor
 * actions use since the 2026-08-07 P1) / `requireTenantScope` /
 * `getTenantScope` / `getTenantScopeBySlug` / `getCurrentUserTenants`, or a
 * direct `userHasCapability(cap, tenantId)` when the tenant arrives as an
 * argument instead of from the request.
 */

const EDIT_MODE = __dirname;
const SITE_ADMIN = join(EDIT_MODE, "..");
const SRC = join(SITE_ADMIN, "..", "..");

const read = (p: string) => readFileSync(p, "utf8");
/**
 * Strip comments before asserting on CALLS. The doc blocks in these files
 * legitimately name `requireStaff()` while explaining why it is wrong here, so
 * a raw source match would fail on its own explanation.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Files converted to `requireSession()` + a request-resolved tenant scope. */
const SCOPE_PROVEN = [
  "edit-mode/ai-generate-action.ts",
  "edit-mode/ai-rewrite-action.ts",
  "edit-mode/ai-translate-site-action.ts",
  "edit-mode/aria-landmark-action.ts",
  "edit-mode/assets-actions.ts",
  "edit-mode/brand-kit-url-action.ts",
  "edit-mode/builder-components-action.ts",
  "edit-mode/cms-pages-list-action.ts",
  "edit-mode/comment-actions.ts",
  "edit-mode/composition-actions.ts",
  "edit-mode/directory-page-backfill-action.ts",
  "edit-mode/heading-lint-action.ts",
  "edit-mode/link-validate-action.ts",
  "edit-mode/page-composer-action.ts",
  "edit-mode/page-design-apply-action.ts",
  "edit-mode/publish-diff-action.ts",
  "edit-mode/publish-preflight-action.ts",
  "edit-mode/revisions-actions.ts",
  "edit-mode/schedule-actions.ts",
  "edit-mode/section-actions.ts",
  "edit-mode/server.ts",
  "edit-mode/site-shell-backfill-action.ts",
  "edit-mode/starter-action.ts",
  "edit-mode/talent-paths-action.ts",
  "edit-mode/talent-picker-action.ts",
  "edit-mode/talent-search.ts",
  "builder-core/adapters/cms-page-actions.ts",
  "builder-core/adapters/site-shell-actions.ts",
  "builder-core/ai/generate-node-image-action.ts",
  "cms-seo-actions.ts",
  "share-link/share-actions.ts",
  "site-header/actions.ts",
] as const;

const MEMBERSHIP_PROOF =
  /requireEditSurfaceTenantScope\(|getEditSurfaceTenantScope\(|requireTenantScope\(|getTenantScope\(|getTenantScopeBySlug\(|getCurrentUserTenants\(|userHasCapability\(/;

for (const rel of SCOPE_PROVEN) {
  test(`${rel}: membership guard, not the global-app_role gate`, () => {
    const src = read(join(SITE_ADMIN, rel));
    assert.doesNotMatch(
      code(src),
      /\brequireStaff\s*\(\)/,
      `${rel} must not call requireStaff() — it gates the GLOBAL profiles.app_role and rejects hybrid workspace owners; see design-actions.ts for the pattern`,
    );
    assert.match(
      src,
      /\brequireSession\s*\(\)/,
      `${rel} must guard with requireSession()`,
    );
    assert.match(
      src,
      MEMBERSHIP_PROOF,
      `${rel} must prove membership (tenant scope resolution or an explicit capability check) — a bare session is not authorization`,
    );
  });
}

test("edit-chrome mount: the storefront edit pill is gated on membership of THIS host's tenant", () => {
  const src = read(join(SRC, "components", "edit-chrome", "edit-chrome-mount.tsx"));
  assert.doesNotMatch(
    code(src),
    /\brequireStaff\s*\(\)/,
    "EditChromeMount must not call requireStaff() — it hid the edit pill from hybrid owners on their OWN storefront",
  );
  assert.match(src, /\brequireSession\s*\(\)/);
  assert.match(
    src,
    /userHasCapability\(\s*"agency\.site_admin\.pages\.edit",\s*ctx\.tenantId,?\s*\)/,
    "the capability must be checked against ctx.tenantId (the tenant this HOST serves) so a member of tenant A never gets the pill on tenant B",
  );
});

test("public CMS page: the draft reader is membership-scoped to the storefront's tenant", () => {
  const src = read(join(SRC, "app", "(public)", "p", "[[...slug]]", "page.tsx"));
  assert.doesNotMatch(
    code(src),
    /\brequireStaff\s*\(\)/,
    "the draft-reader gate must not key on the global profiles.app_role — it hid a hybrid owner's own unpublished draft from them",
  );
  // All three membership gates must be scoped: the two draft reads
  // (generateMetadata + the freeform body) and the wave-2 edit-canvas mount
  // (the body-hosted ClientBuilderCanvas re-proves the editor when the
  // PUBLISHED read succeeded and the draft gate therefore never ran).
  const hits = src.match(
    /userHasCapability\(\s*\n?\s*"agency\.site_admin\.pages\.edit",\s*\n?\s*publicScope\.tenantId,?\s*\n?\s*\)/g,
  );
  assert.equal(
    hits?.length,
    3,
    "all draft-reader / edit-canvas gates must check the capability against publicScope.tenantId",
  );
});

test("capability lattice: pages.edit is held from editor up, so builder work is not owner-only", () => {
  // The builder surface intentionally sits LOWER than design/branding: an
  // editor-role member edits pages, but only admin/owner touch design tokens.
  assert.equal(rolePhase5HasCapability("owner", "agency.site_admin.pages.edit"), true);
  assert.equal(rolePhase5HasCapability("admin", "agency.site_admin.pages.edit"), true);
  assert.equal(rolePhase5HasCapability("editor", "agency.site_admin.pages.edit"), true);
  assert.equal(rolePhase5HasCapability("viewer", "agency.site_admin.pages.edit"), false);
});
