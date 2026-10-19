import assert from "node:assert/strict";
import { test } from "node:test";

import { LEGACY_PRIVACY_SLUG, POLICY_SLUG } from "@/lib/talent-policies/public";
import { needsRouteLookup, needsServiceLookup, serviceRouteVerdict, talentRouteVerdict } from "./route-verdict";

test("TUL-1140: an unknown slug is a not-found verdict, a slug a page owns renders", () => {
  assert.equal(talentRouteVerdict("zzz-nope", ["galeria", "contacto"]), "not-found");
  assert.equal(talentRouteVerdict("galeria", ["galeria", "contacto"]), "render");
});

test("TUL-857: /privacy redirects unless the talent authored a page with that slug", () => {
  assert.equal(talentRouteVerdict(LEGACY_PRIVACY_SLUG, ["galeria"]), "privacy-redirect");
  assert.equal(talentRouteVerdict(LEGACY_PRIVACY_SLUG, [LEGACY_PRIVACY_SLUG]), "render");
});

test("home, draft preview and platform pages never trigger the lookup", () => {
  assert.equal(needsRouteLookup(null, undefined), false);
  assert.equal(needsRouteLookup("zzz-nope", "draft"), false);
  assert.equal(needsRouteLookup(POLICY_SLUG.privacy, undefined), false);
  assert.equal(needsRouteLookup(POLICY_SLUG.booking, undefined), false);
});

test("a normal slug and the legacy privacy slug do trigger the lookup", () => {
  assert.equal(needsRouteLookup("zzz-nope", undefined), true);
  assert.equal(needsRouteLookup(LEGACY_PRIVACY_SLUG, undefined), true);
});

// TUL-1273 #5: a removed or archived service answers HTTP 404, not a streamed 200.
const OFFERINGS = [{ id: "a1b2c3d4-0000-0000-0000-000000000000", kind: "service" as const, visibility: "public" as const, title: "Masaje" }];

test("TUL-1273 #5: service slugs trigger the service lookup, other slugs and draft previews do not", () => {
  assert.equal(needsServiceLookup("servicio-masaje-a1b2c3d4", undefined), true);
  assert.equal(needsServiceLookup("servicio-masaje-a1b2c3d4", "draft"), false);
  assert.equal(needsServiceLookup("galeria", undefined), false);
  assert.equal(needsServiceLookup(null, undefined), false);
});

test("TUL-1273 #5: a live service renders (any title part), a gone one is not-found, a page row of that slug wins", () => {
  assert.equal(serviceRouteVerdict("servicio-masaje-a1b2c3d4", OFFERINGS, []), "render");
  assert.equal(serviceRouteVerdict("servicio-old-title-a1b2c3d4", OFFERINGS, []), "render");
  assert.equal(serviceRouteVerdict("servicio-masaje-deadbeef", OFFERINGS, []), "not-found");
  assert.equal(serviceRouteVerdict("servicio-masaje-a1b2c3d4", [], []), "not-found");
  assert.equal(serviceRouteVerdict("servicio-masaje-deadbeef", [], ["servicio-masaje-deadbeef"]), "render");
});
