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

/**
 * TUL-434 PM HOLD: default `/admin/orders` must stay today's live desk
 * (phone cards + desktop table + inline refund). The accordion mock mounts
 * only when `?door=preview` sets `doorListProps`. Presence of both paths is
 * not enough — the ternary must put the live list on the falsy branch.
 *
 * #2963/#3994 follow-up: the falsy branch's phone-card list, desktop table
 * and refund form were extracted out of this file into
 * `order-row-detail.tsx` (`OrdersList`) so a row can expand into an organized
 * detail panel (Customer / Items and totals / Payment and status / Order
 * info) without touching the held `?door=preview` mock. The guarantee this
 * test pins — door mock only behind the flag, the real list still has a
 * table, a phone list and a reachable refund form — is unchanged; the second
 * half of it is now checked against `order-row-detail.tsx`, where that markup
 * actually lives.
 */
test("TUL-434 — default render is today's live list; door only behind ?door=preview", () => {
  const page = read("src/app/(workspace)/[tenantSlug]/admin/orders/page.tsx");
  assert.match(
    page,
    /const doorPreview = isDoorPreview\(/,
    "preview gate must call isDoorPreview on the door search param",
  );
  assert.match(
    page,
    /const doorListProps = doorPreview\s*\?[\s\S]*?:\s*null/,
    "doorListProps must be null when door is not preview",
  );
  // Truthy branch mounts the mock (desktop + mobile); falsy branch mounts the
  // real list (desktop + mobile), never the mock.
  assert.match(
    page,
    /\{doorListProps \? \([\s\S]*?<OrdersDoorMockList[\s\S]*?<OrdersDoorMockList[\s\S]*?\) : \([\s\S]*?<OrdersList[\s\S]*?<OrdersList/,
    "falsy doorListProps must render the real OrdersList (mobile + desktop); truthy mounts the mock",
  );
  const mockMounts = page.match(/<OrdersDoorMockList/g) ?? [];
  assert.equal(
    mockMounts.length,
    2,
    "exactly two mock mounts (desktop + mobile), both under doorListProps",
  );
  // No unconditional mock desk — every OrdersDoorMockList must sit after the
  // doorListProps gate (both mounts are between `doorListProps ?` and its else).
  const gateAt = page.indexOf("{doorListProps ?");
  const elseAt = page.indexOf(") : (", gateAt);
  assert.ok(gateAt >= 0 && elseAt > gateAt, "doorListProps ternary must exist");
  const previewArm = page.slice(gateAt, elseAt);
  const afterElse = page.slice(elseAt);
  assert.equal(
    (previewArm.match(/<OrdersDoorMockList/g) ?? []).length,
    2,
    "both mock mounts live on the preview arm",
  );
  assert.doesNotMatch(afterElse, /OrdersDoorMockList/, "default arm must not mount the door mock");
  assert.equal(
    (afterElse.match(/<OrdersList\b/g) ?? []).length,
    2,
    "default arm mounts the real OrdersList exactly twice (mobile + desktop)",
  );

  // The real markup (phone list, desktop table, reachable refund form) now
  // lives in the extracted component, not inline here.
  const rowDetail = read("src/app/(workspace)/[tenantSlug]/admin/orders/order-row-detail.tsx");
  assert.match(rowDetail, /<ul/, "the real list keeps the phone card list");
  assert.match(rowDetail, /<table/, "the real list keeps the desktop table");
  assert.match(rowDetail, /OrdersRefundForm/, "the real list keeps the live refund form");
});

test("TUL-434 — phone sheet and inline door split the width with no gap at 390 px", () => {
  // Tailwind v4: `max-[N]` is `width < N`, `min-[N]` is `width >= N`. The pair
  // must share one N, or a width (390 on the card's phone) shows neither.
  const src = read("src/app/(workspace)/[tenantSlug]/admin/orders/orders-door-mock-list.tsx");
  const sheet = src.match(/max-\[(\d+)px\]:flex/);
  const inline = src.match(/min-\[(\d+)px\]:block/);
  assert.ok(sheet && inline, "sheet and inline door breakpoints must exist");
  assert.equal(sheet[1], inline[1], "sheet max-[N] and inline min-[N] must use the same N");
  assert.ok(Number(sheet[1]) > 390, "a 390 px phone must get the sheet");
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
  //
  // #2963/#3994: this markup now lives in `order-row-detail.tsx` (the real
  // list), not inline in page.tsx — see the TUL-434 test above. page.tsx
  // keeps formatDashboardMoneyCents for the totals strip.
  const page = read("src/app/(workspace)/[tenantSlug]/admin/orders/page.tsx");
  assert.match(page, /formatDashboardMoneyCents/);

  const rowDetail = read("src/app/(workspace)/[tenantSlug]/admin/orders/order-row-detail.tsx");
  assert.match(rowDetail, /salesChannelLabel/);
  assert.match(rowDetail, /orderLineItemsLabel/);
  assert.match(rowDetail, /lineCountOne/);
  assert.match(rowDetail, /lineCountOther/);
  assert.match(rowDetail, /formatDashboardMoneyCents/);
  assert.match(rowDetail, /whiteSpace:\s*["']nowrap["']|tabular-nums/);
  assert.doesNotMatch(rowDetail, /formatOrderMoney/);
  // Bare `lineCount` noun without singular/plural is the defect.
  assert.doesNotMatch(rowDetail, /\{copy\.lineCount\}/);
});
