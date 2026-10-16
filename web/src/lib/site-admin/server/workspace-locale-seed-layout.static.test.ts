/**
 * The admin layout must decide the language-seed hop through
 * workspaceLocaleSeedHopPossible (which refuses RSC requests), not through an
 * inline condition that forgets the soft-navigation case. Fails if the layout
 * goes back to the inline check.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const layout = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/layout.tsx"), "utf8");

test("admin layout hops only through workspaceLocaleSeedHopPossible, passing the RSC header", () => {
  assert.match(layout, /workspaceLocaleSeedHopPossible\(\{/);
  assert.match(layout, /rscHeader: hdrs\.get\("rsc"\)/);
  assert.doesNotMatch(layout, /isWorkspaceSeedablePath\(pathname, tenantSlug\) &&/, "no inline seedable-path condition");
});

test("the redirect to the seed route is still present for hard loads", () => {
  assert.match(layout, /redirect\(workspaceLocaleSeedHref\(/);
});
