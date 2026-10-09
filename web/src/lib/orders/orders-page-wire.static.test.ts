import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CANONICAL_ROUTE_MATCHERS } from "@/components/admin/shell/canonical-routes";
import { resolveWorkspaceAdminPage } from "@/app/(workspace)/[tenantSlug]/admin/workspace-page-routing";

/**
 * The Orders desk, pinned at every layer that can silently drop it.
 *
 * The repo's most-repeated defect is a capability wired at 3 of 4 layers. For a
 * canonical workspace route the layers are: the page file, the canonical-route
 * matcher, the segment allow-list, and a DOOR someone can actually click. Miss
 * the matcher and the shell renders the SPA over it; miss the allow-list and
 * `resolveWorkspaceAdminPage` silently rewrites the URL to `overview`; miss the
 * door and it is an engine nobody can reach.
 *
 * Text-based on purpose: these four facts live in four files that no type
 * connects, so nothing else can notice when one of them is removed.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("layer 1 — the canonical page file exists and is capability-gated", () => {
  const page = read("src/app/(workspace)/[tenantSlug]/admin/orders/page.tsx");
  assert.match(page, /userHasCapability\(/, "the Orders page must gate on a capability");
  assert.match(page, /loadWorkspaceOrders/, "the page must read through the data bridge");
});

test("layer 2 — a canonical-route matcher claims /admin/orders", () => {
  // The matchers are now a projection of the destination registry (no
  // hand-written `s[1] === "orders"` line), so ask the real matcher list.
  assert.ok(
    CANONICAL_ROUTE_MATCHERS.some((match) => match(["admin", "orders"])),
    "without this the SPA renders its own body over the canonical page",
  );
});

test("layer 3 — 'orders' is an allowed workspace segment", () => {
  // The allow-list is now the registry; an unlisted segment resolves to overview.
  assert.equal(resolveWorkspaceAdminPage("orders"), "orders", "an unlisted segment resolves to overview, silently");
});

test("layer 4 — something links to it", () => {
  // The door. A page reachable only by typing its URL is the "engine with no
  // door" this repo has shipped before.
  const src = read("src/components/admin/shell/internal/page-modules/AnalyticsPage.tsx");
  assert.match(src, /\$\{adminBasePath\}\/orders/, "no surface links to the Orders desk");
});

test("the loader REFUSES on a read error rather than returning an empty desk", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/_data-bridge/orders.ts");
  // Pinned because the fail-open version of this exact shape shipped earlier in
  // the phase: an error resolved to a benign-looking value renders a confident
  // lie ("No orders yet") to a workspace that has hundreds.
  assert.match(src, /ok:\s*false/, "the loader must have a refusal branch");
  assert.doesNotMatch(
    src,
    /return\s*\{\s*ok:\s*true,\s*rows:\s*\[\]\s*\}\s*;?\s*\n\s*\}\s*\n\s*if\s*\(\w*[Ee]rr/,
    "an error path must not resolve to an empty list",
  );
});

test("Pedidos list polish — channel label, plural lines, dashboard money, nowrap", () => {
  // TUL-435 Done-when: Origen via salesChannelLabel, 1 artículo / 2 artículos,
  // "$1,000 MXN" via formatDashboardMoneyCents, amounts stay on one line.
  const page = read("src/app/(workspace)/[tenantSlug]/admin/orders/page.tsx");
  assert.match(page, /salesChannelLabel/);
  assert.match(page, /orderLineItemsLabel/);
  assert.match(page, /lineCountOne/);
  assert.match(page, /lineCountOther/);
  assert.match(page, /formatDashboardMoneyCents/);
  assert.match(page, /whiteSpace:\s*["']nowrap["']/);
  assert.doesNotMatch(page, /formatOrderMoney/);
  // Bare `lineCount` noun without singular/plural is the defect.
  assert.doesNotMatch(page, /\{t\("lineCount"\)\}/);
});
