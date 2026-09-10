import { test } from "node:test";
import assert from "node:assert/strict";
import { pathIsCanonical } from "./canonical-routes";
import { DESTINATIONS } from "@/lib/workspace/destinations";

/**
 * Regression cover for the two admin URL shapes.
 *
 * Path-based host (app.tulala.digital): /{slug}/admin/...
 * Branded host   (improntamodels.com):  /admin/...        ← no slug
 *
 * The branded shape was unhandled: pathIsCanonical sliced the first segment off
 * unconditionally, so on a custom domain every canonical admin page rendered
 * stacked on top of the prototype SPA. Caught in production on 2026-08-06.
 */

const CANONICAL_PAGES = [
  "activity-log",
  "financials",
  "triage",
  "discover-inquiries",
  "discover-performance",
  "bookings",
  "account",
];

test("canonical admin pages resolve on the path-based host (/{slug}/admin/...)", () => {
  for (const page of CANONICAL_PAGES) {
    assert.equal(pathIsCanonical(`/impronta/admin/${page}`), true, `slug form: ${page}`);
  }
});

test("canonical admin pages resolve on a BRANDED host (/admin/... with no slug)", () => {
  for (const page of CANONICAL_PAGES) {
    assert.equal(pathIsCanonical(`/admin/${page}`), true, `branded form: ${page}`);
  }
});

test("both host shapes agree for every canonical page", () => {
  for (const page of CANONICAL_PAGES) {
    assert.equal(
      pathIsCanonical(`/admin/${page}`),
      pathIsCanonical(`/impronta/admin/${page}`),
      `host shapes disagree for ${page}`,
    );
  }
});

test("nested canonical routes work on both shapes", () => {
  for (const p of [
    "/admin/settings/discover",
    "/admin/roster/applications",
    "/admin/roster/registration",
    "/admin/policy/auto-ack",
    "/admin/website/redirects",
    "/admin/events/door",
    "/admin/orders",
    "/admin/sales",
    "/admin/discounts",
    "/admin/pos",
    "/admin/tables",
    "/admin/preparation",
  ]) {
    assert.equal(pathIsCanonical(p), true, `branded: ${p}`);
    assert.equal(pathIsCanonical(`/impronta${p}`), true, `slug: ${p}`);
  }
});

test("id-bearing routes need the id segment on both shapes", () => {
  assert.equal(pathIsCanonical("/admin/messages/abc123"), true);
  assert.equal(pathIsCanonical("/impronta/admin/messages/abc123"), true);
  // list view stays on the prototype SPA
  assert.equal(pathIsCanonical("/admin/messages"), false);
  assert.equal(pathIsCanonical("/impronta/admin/messages"), false);
  assert.equal(pathIsCanonical("/admin/work/w-1"), true);
  assert.equal(pathIsCanonical("/impronta/admin/work/w-1"), true);
});

test("SPA-owned surfaces stay non-canonical on both shapes", () => {
  // Roster deliberately has NO matcher (reverted 2026-05-15 by product owner).
  // "/admin/website" itself stays on the SPA — only the /redirects child is canonical.
  // "/admin/events" stays on the SPA — only /events/door is canonical.
  for (const p of ["/admin", "/admin/roster", "/admin/calendar", "/admin/clients", "/admin/media", "/admin/website", "/admin/events"]) {
    assert.equal(pathIsCanonical(p), false, `branded: ${p}`);
    assert.equal(pathIsCanonical(`/impronta${p}`), false, `slug: ${p}`);
  }
});

test("platform-scoped talent routes still resolve", () => {
  assert.equal(pathIsCanonical("/talent/trust"), true);
  assert.equal(pathIsCanonical("/talent/discover"), true);
  assert.equal(pathIsCanonical("/talent/discover-agencies"), true);
  assert.equal(pathIsCanonical("/impronta/talent/trust"), true);
});

test("empty and unknown paths are not canonical", () => {
  assert.equal(pathIsCanonical(null), false);
  assert.equal(pathIsCanonical(""), false);
  assert.equal(pathIsCanonical("/"), false);
  assert.equal(pathIsCanonical("/admin/definitely-not-a-page"), false);
  assert.equal(pathIsCanonical("/impronta/admin/definitely-not-a-page"), false);
});

test("leading slashes are normalised", () => {
  assert.equal(pathIsCanonical("///admin/activity-log"), true);
});

/**
 * People (P4) — /admin/people is a real server page; /admin/roster is NOT.
 *
 * Both halves matter. If the roster ever became canonical the roster SPA would
 * render nothing at all, and if /admin/people were left non-canonical its
 * server page would render inline UNDER the SPA — the exact stacking failure
 * the branded-host bug above produced.
 */
test("People is canonical on both host shapes, from the registry and not by hand", () => {
  assert.equal(pathIsCanonical("/admin/people"), true);
  assert.equal(pathIsCanonical("/impronta/admin/people"), true);
  // People is `render: "canonical"` with no fallbackSegment, so this comes
  // from REGISTRY_MATCHERS. That is the point: the rail, the mobile tab bar
  // and `setPage` read the same entry, so the door an operator clicks and the
  // matcher that yields to the real page cannot disagree. It was a
  // hand-written matcher while the registry still said `/admin/roster`, and
  // that is exactly how the surface ended up reachable only by typed URL.
  assert.equal(
    DESTINATIONS.people.render,
    "canonical",
    "People is back on the SPA, so the registry projection no longer covers it",
  );
  assert.equal(DESTINATIONS.people.fallbackSegment, undefined);
  // The blanket registry match now covers deeper People URLs too. There are no
  // sub-routes under /admin/people; if one is ever added it must be a real page
  // rather than a PageRouteSyncer, and this is where that is written down.
  assert.equal(pathIsCanonical("/admin/people/abc123"), true);
  // And the roster the People surface sits beside is untouched: `roster` is
  // only an ALIAS, and aliases are deliberately excluded from the projection.
  assert.equal(pathIsCanonical("/admin/roster"), false);
  assert.equal(pathIsCanonical("/impronta/admin/roster"), false);
  // The roster's three talent-only queues keep their own hand-written matchers
  // (they are real server pages) — that is unchanged, and it is why the People
  // row can go on linking to them from their `adminPath`.
  assert.equal(pathIsCanonical("/impronta/admin/roster/applications"), true);
});
