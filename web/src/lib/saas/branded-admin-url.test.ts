import test from "node:test";
import assert from "node:assert/strict";

import {
  brandedAdminRedirectPath,
  brandedAdminRewritePath,
  normalizeBrandedNextParam,
} from "./branded-admin-url";

const SLUG = "impronta";

// ── brandedAdminRedirectPath — doubled URL → branded URL ────────────────────

test("redirect: strips the slug from admin paths", () => {
  assert.equal(brandedAdminRedirectPath("/impronta/admin", SLUG), "/admin");
  assert.equal(
    brandedAdminRedirectPath("/impronta/admin/roster/applications", SLUG),
    "/admin/roster/applications",
  );
});

test("redirect: strips the slug from client paths", () => {
  assert.equal(brandedAdminRedirectPath("/impronta/client", SLUG), "/client");
  assert.equal(
    brandedAdminRedirectPath("/impronta/client/bookings", SLUG),
    "/client/bookings",
  );
});

test("redirect: leaves already-branded paths alone", () => {
  assert.equal(brandedAdminRedirectPath("/admin", SLUG), null);
  assert.equal(brandedAdminRedirectPath("/admin/messages", SLUG), null);
});

test("redirect: never touches the public storefront", () => {
  // A CMS page whose slug happens to match the tenant slug must survive.
  assert.equal(brandedAdminRedirectPath("/impronta/gallery", SLUG), null);
  assert.equal(brandedAdminRedirectPath("/impronta", SLUG), null);
  assert.equal(brandedAdminRedirectPath("/impronta/talent/trust", SLUG), null);
});

test("redirect: does not match a slug that is only a prefix of the segment", () => {
  assert.equal(brandedAdminRedirectPath("/improntamodels/admin", SLUG), null);
});

test("redirect: no-ops without a slug (pre-migration agency_domains rows)", () => {
  assert.equal(brandedAdminRedirectPath("//admin", ""), null);
});

// ── brandedAdminRewritePath — branded URL → internal slug route ─────────────

test("rewrite: adds the slug for admin and client", () => {
  assert.equal(brandedAdminRewritePath("/admin", SLUG), "/impronta/admin");
  assert.equal(
    brandedAdminRewritePath("/admin/messages/abc", SLUG),
    "/impronta/admin/messages/abc",
  );
  assert.equal(brandedAdminRewritePath("/client", SLUG), "/impronta/client");
});

test("rewrite: excludes /talent/* — it has its own host-agnostic tree", () => {
  // Rewriting these hits a legacy redirector that bounces back here forever.
  assert.equal(brandedAdminRewritePath("/talent/trust", SLUG), null);
  assert.equal(brandedAdminRewritePath("/talent/settings/payouts", SLUG), null);
});

test("rewrite: excludes /client/register — an unauthenticated (auth) route", () => {
  assert.equal(brandedAdminRewritePath("/client/register", SLUG), null);
  // Its siblings still rewrite.
  assert.equal(
    brandedAdminRewritePath("/client/registered", SLUG),
    "/impronta/client/registered",
  );
});

test("rewrite: is idempotent — an already-slugged path is left alone", () => {
  assert.equal(brandedAdminRewritePath("/impronta/admin", SLUG), null);
});

test("redirect and rewrite are exact inverses on the branded surfaces", () => {
  for (const branded of ["/admin", "/admin/roster", "/client", "/client/bookings"]) {
    const slugged = brandedAdminRewritePath(branded, SLUG);
    assert.equal(typeof slugged, "string", `${branded} should rewrite`);
    assert.equal(brandedAdminRedirectPath(slugged!, SLUG), branded);
  }
});

// ── normalizeBrandedNextParam — the ?next= round-trip ──────────────────────

function responseWithLocation(location: string) {
  return { headers: new Headers({ location }) };
}

test("next: rewrites a slugged next back to the branded path", () => {
  const res = responseWithLocation(
    "https://improntamodels.com/login?next=%2Fimpronta%2Fadmin",
  );
  normalizeBrandedNextParam(res, SLUG);
  assert.equal(
    res.headers.get("location"),
    "https://improntamodels.com/login?next=%2Fadmin",
  );
});

test("next: preserves other query params", () => {
  const res = responseWithLocation(
    "https://improntamodels.com/login?next=%2Fimpronta%2Fadmin%2Froster&reason=session_expired",
  );
  normalizeBrandedNextParam(res, SLUG);
  const url = new URL(res.headers.get("location")!);
  assert.equal(url.searchParams.get("next"), "/admin/roster");
  assert.equal(url.searchParams.get("reason"), "session_expired");
});

test("next: handles a relative location without inventing a host", () => {
  const res = responseWithLocation("/login?next=%2Fimpronta%2Fadmin");
  normalizeBrandedNextParam(res, SLUG);
  assert.equal(res.headers.get("location"), "/login?next=%2Fadmin");
});

test("next: leaves non-workspace next values untouched", () => {
  const location = "https://improntamodels.com/login?next=%2Fimpronta%2Fgallery";
  const res = responseWithLocation(location);
  normalizeBrandedNextParam(res, SLUG);
  assert.equal(res.headers.get("location"), location);
});

test("next: no-ops when there is no location or no next", () => {
  const noNext = responseWithLocation("https://improntamodels.com/login");
  normalizeBrandedNextParam(noNext, SLUG);
  assert.equal(noNext.headers.get("location"), "https://improntamodels.com/login");

  const noLocation = { headers: new Headers() };
  normalizeBrandedNextParam(noLocation, SLUG);
  assert.equal(noLocation.headers.get("location"), null);
});
