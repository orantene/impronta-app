import assert from "node:assert/strict";
import { test } from "node:test";

import { marketingSpanishAliasRedirect } from "./spanish-path-alias";

const base = { search: "", method: "GET", hostKind: "marketing" };

test("/es/directorio and /directorio land on /es/directory on the marketing host", () => {
  assert.equal(marketingSpanishAliasRedirect({ ...base, pathname: "/es/directorio" }), "/es/directory");
  assert.equal(marketingSpanishAliasRedirect({ ...base, pathname: "/es/directorio/" }), "/es/directory");
  assert.equal(marketingSpanishAliasRedirect({ ...base, pathname: "/directorio" }), "/es/directory");
  assert.equal(marketingSpanishAliasRedirect({ ...base, pathname: "/es/Directorio" }), "/es/directory");
});

test("the query string survives the hop", () => {
  assert.equal(
    marketingSpanishAliasRedirect({ ...base, pathname: "/es/directorio", search: "?q=uñas" }),
    "/es/directory?q=uñas",
  );
});

test("tenant hosts keep their own /directorio page", () => {
  for (const hostKind of ["agency", "hub", "app", "talent_site"]) {
    assert.equal(marketingSpanishAliasRedirect({ ...base, hostKind, pathname: "/es/directorio" }), null);
  }
});

test("other paths, subpaths and non-GET methods pass through", () => {
  assert.equal(marketingSpanishAliasRedirect({ ...base, pathname: "/es/directory" }), null);
  assert.equal(marketingSpanishAliasRedirect({ ...base, pathname: "/es/directorio/foo" }), null);
  assert.equal(marketingSpanishAliasRedirect({ ...base, pathname: "/es" }), null);
  assert.equal(marketingSpanishAliasRedirect({ ...base, method: "POST", pathname: "/es/directorio" }), null);
});
