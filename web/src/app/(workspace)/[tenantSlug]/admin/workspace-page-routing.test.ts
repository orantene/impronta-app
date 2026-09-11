import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveWorkspaceAdminPage } from "./workspace-page-routing";

test("resolveWorkspaceAdminPage maps canonical workspace route segments", () => {
  assert.equal(resolveWorkspaceAdminPage("overview"), "overview");
  assert.equal(resolveWorkspaceAdminPage("messages"), "messages");
  assert.equal(resolveWorkspaceAdminPage("menu"), "menu");
  assert.equal(resolveWorkspaceAdminPage("website"), "website");
});

test("resolveWorkspaceAdminPage maps legacy route aliases", () => {
  assert.equal(resolveWorkspaceAdminPage("inbox"), "messages");
  assert.equal(resolveWorkspaceAdminPage("work"), "messages");
  assert.equal(resolveWorkspaceAdminPage("talent"), "roster");
  assert.equal(resolveWorkspaceAdminPage("site"), "website");
  assert.equal(resolveWorkspaceAdminPage("billing"), "settings");
});

test("resolveWorkspaceAdminPage maps canonical server-rendered routes", () => {
  // /admin/financials — business financials page (L46)
  assert.equal(resolveWorkspaceAdminPage("financials"), "financials");
  assert.equal(resolveWorkspaceAdminPage("pos"), "pos");
  assert.equal(resolveWorkspaceAdminPage("tables"), "tables");
  assert.equal(resolveWorkspaceAdminPage("preparation"), "preparation");
  assert.equal(resolveWorkspaceAdminPage("sales"), "sales");
  // /admin/roster/applications — layout strips to first segment "roster";
  // the "roster" entry already covers this sub-route.
  assert.equal(resolveWorkspaceAdminPage("roster"), "roster");
});

test("resolveWorkspaceAdminPage defaults unknown and empty segments to overview", () => {
  assert.equal(resolveWorkspaceAdminPage(""), "overview");
  assert.equal(resolveWorkspaceAdminPage("not-a-workspace-page"), "overview");
});

// ─── The registry's canonical segments ───────────────────────────────────────
//
// T2 made this resolver a projection of `lib/workspace/destinations.ts`. The
// tests above pin that every URL that worked before still opens the same body;
// these pin the new names, which land on the page their destination renders at
// TODAY — not on the segment it is moving to.

test("a canonical destination segment resolves to the page it renders at today", () => {
  assert.equal(resolveWorkspaceAdminPage("appts"), "sessions");
  assert.equal(resolveWorkspaceAdminPage("catalog"), "menu");
  assert.equal(resolveWorkspaceAdminPage("people"), "roster");
  assert.equal(resolveWorkspaceAdminPage("spaces"), "tables");
  assert.equal(resolveWorkspaceAdminPage("issues"), "exceptions");
  // Not built: their URL lands on the real page the registry names.
  assert.equal(resolveWorkspaceAdminPage("payments"), "financials");
  assert.equal(resolveWorkspaceAdminPage("projects"), "messages");
  // No route at all yet, and it says so rather than pointing somewhere it is not.
  assert.equal(resolveWorkspaceAdminPage("mywork"), "overview");
});

test("/admin/exceptions now names its own page instead of falling to overview", () => {
  // The body is unchanged — /admin/exceptions is a canonical server route and
  // always was — but the shell's active page is now Issues, so the rail
  // highlights the row the operator is standing on.
  assert.equal(resolveWorkspaceAdminPage("exceptions"), "exceptions");
});

test("payouts keeps its own body and is NOT folded into payments", () => {
  // The registry lists `payouts` as an alias of the Payments destination,
  // which is a real page at /admin/payments now. But /admin/payouts
  // renders <PayoutsPage/> in the SPA and has no canonical matcher, so
  // collapsing it would paint a blank screen. See LEGACY_PAGES_WITH_THEIR_OWN_BODY.
  assert.equal(resolveWorkspaceAdminPage("payouts"), "payouts");
});

test("case and whitespace are tolerated, as the old allow-list did", () => {
  assert.equal(resolveWorkspaceAdminPage("  Messages  "), "messages");
  assert.equal(resolveWorkspaceAdminPage("TALENT"), "roster");
});
