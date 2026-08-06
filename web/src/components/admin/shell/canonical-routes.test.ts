import { test } from "node:test";
import assert from "node:assert/strict";
import { pathIsCanonical } from "./canonical-routes";

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
  for (const p of ["/admin", "/admin/roster", "/admin/calendar", "/admin/clients", "/admin/media"]) {
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
