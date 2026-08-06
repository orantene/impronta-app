import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  isNonStorefrontPath,
  NON_STOREFRONT_PREFIXES,
  normalizeStorefrontPath,
} from "./non-storefront-path";

/**
 * WAVE 6.1 — the quick bar now mounts independently of the editor, on every
 * public page of a tenant's own site. That is a much wider surface than the
 * editor's, so the exclusions matter more, not less: the one thing this bar must
 * never do is sit on top of dashboard or auth chrome.
 *
 * These tests pin the shared path gate and the structural invariants that make
 * the wider mount safe. They are structural on purpose — a React-render test of
 * a server component that reads `headers()` would prove less and break more.
 */

const HERE = join(process.cwd(), "src/components/edit-chrome");
const MOUNT = readFileSync(join(HERE, "admin-quick-bar-mount.tsx"), "utf8");
const CHROME = readFileSync(join(HERE, "edit-chrome.tsx"), "utf8");
const EDITOR_MOUNT = readFileSync(join(HERE, "edit-chrome-mount.tsx"), "utf8");
const BAR = readFileSync(join(HERE, "admin-quick-bar.tsx"), "utf8");

test("dashboard, auth and onboarding paths are non-storefront", () => {
  for (const path of [
    "/admin",
    "/admin/roster",
    "/talent",
    "/talent/dashboard",
    "/client",
    "/login",
    "/register",
    "/auth/callback",
    "/onboarding",
    "/account",
    "/t/TAL-123",
    "/api/health",
  ]) {
    assert.equal(isNonStorefrontPath(path), true, `${path} must be excluded`);
  }
});

test("public storefront paths are NOT excluded — this is the wave 6.1 reach", () => {
  for (const path of ["/", "/directory", "/p/about", "/services", "/contact"]) {
    assert.equal(isNonStorefrontPath(path), false, `${path} must be allowed`);
  }
});

test("a leading tenant slug is stripped before the exclusion check", () => {
  // Without this, `/qa-agency-244988/admin` reads as a storefront path and the
  // bar lands on top of the dashboard.
  assert.equal(
    isNonStorefrontPath(
      normalizeStorefrontPath("/qa-agency-244988/admin", "", "qa-agency-244988"),
    ),
    true,
  );
  assert.equal(
    isNonStorefrontPath(
      normalizeStorefrontPath("/qa-agency-244988/directory", "", "qa-agency-244988"),
    ),
    false,
  );
  // The path-mode public prefix takes precedence over the host slug.
  assert.equal(
    normalizeStorefrontPath("/w/acme/admin", "/w/acme", "acme"),
    "/admin",
  );
});

test("the editor mount and the quick-bar mount share ONE exclusion list", () => {
  // Two copies drift; a dashboard prefix added to one and missed in the other is
  // exactly the bug this shares the module to prevent.
  for (const src of [MOUNT, EDITOR_MOUNT]) {
    assert.match(src, /from "\.\/non-storefront-path"/);
    assert.doesNotMatch(src, /const NON_STOREFRONT_PREFIXES/);
  }
  assert.ok(NON_STOREFRONT_PREFIXES.includes("/admin"));
});

test("the quick bar has exactly one mount — EditChrome no longer renders it", () => {
  // Rendering from both places stacks two bars wherever the surfaces overlap.
  assert.doesNotMatch(CHROME, /<AdminQuickBar\b/);
  assert.match(MOUNT, /<AdminQuickBar\b/);
});

test("the mount gates on membership, the platform switch, and edit mode", () => {
  assert.match(MOUNT, /agency\.site_admin\.pages\.edit/);
  assert.match(MOUNT, /loadPlatformWorkspaceUi/);
  assert.match(MOUNT, /quickBarEnabled/);
  assert.match(MOUNT, /isEditModeActiveForTenant/);
});

test("wave 6.2 — the label-only, link-less bar no longer exists", () => {
  // `workspaceSlug` is a required string: the component cannot render a bar
  // whose every destination would 404.
  assert.match(BAR, /workspaceSlug: string;/);
  assert.doesNotMatch(BAR, /workspaceSlug: string \| null/);
});

test("wave 6.4 — the narrow-screen collapse is real, not just a scroll", () => {
  assert.match(BAR, /data-aqb-menu-toggle/);
  assert.match(BAR, /data-aqb-menu-panel/);
  // The panel opens below the bar, inside the offset the bar already reserves,
  // so it cannot cover the tenant's own header.
  assert.match(BAR, /top: ADMIN_QUICK_BAR_H/);
});
