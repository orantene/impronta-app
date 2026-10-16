import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NextRequest } from "next/server";

import {
  TALENT_SITE_PRIVATE_KEY_PARAM,
  talentSitePrivateCacheKeyUrl,
} from "@/lib/saas/talent-site-anon-cache";

const URL_ = "https://karla.tulala.digital/servicios";
function req(cookie?: string, method = "GET") {
  return new NextRequest(URL_, { method, headers: cookie ? { cookie } : {} });
}

// TUL-755: Next drops `Vary: Cookie` on page HTML, so the CDN keyed only on the
// URL and served the anonymous entry to signed-in visitors. These requests must
// land on a different cache key.
describe("talent-site private cache key (TUL-755)", () => {
  it("leaves a cookieless GET on the shared anonymous key", () => {
    assert.equal(talentSitePrivateCacheKeyUrl(req(), new URL(URL_)), null);
  });

  for (const cookie of ["sb-abc-auth-token=x", "impronta_guest=g1", "locale=en"]) {
    it(`moves a GET carrying ${cookie.split("=")[0]} to the private key`, () => {
      const keyed = talentSitePrivateCacheKeyUrl(req(cookie), new URL(URL_));
      assert.ok(keyed, "expected a private-key URL");
      assert.equal(keyed.pathname, "/servicios");
      assert.equal(keyed.searchParams.get(TALENT_SITE_PRIVATE_KEY_PARAM), "1");
    });
  }

  it("never re-keys an already keyed URL (no rewrite loop)", () => {
    const keyed = new URL(`${URL_}?${TALENT_SITE_PRIVATE_KEY_PARAM}=1`);
    assert.equal(talentSitePrivateCacheKeyUrl(req("sb-abc-auth-token=x"), keyed), null);
  });

  it("leaves POSTs (server actions, forms) alone", () => {
    assert.equal(talentSitePrivateCacheKeyUrl(req("sb-abc-auth-token=x", "POST"), new URL(URL_)), null);
  });

  it("keeps the original query string", () => {
    const keyed = talentSitePrivateCacheKeyUrl(req("impronta_guest=g1"), new URL(`${URL_}?ref=ig`));
    assert.equal(keyed?.searchParams.get("ref"), "ig");
  });
});
