import assert from "node:assert/strict";
import { test } from "node:test";

import { LEGACY_PRIVACY_SLUG, POLICY_SLUG } from "@/lib/talent-policies/public";
import { needsRouteLookup, talentRouteVerdict } from "./route-verdict";

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
