import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hubSearchRedirect } from "./hub-search-redirect";

const base = { hostKind: "hub", method: "GET", marketingOrigin: "https://tulala.digital" };

test("TUL-978: /search on a hub goes to the MARKETING directory (the hub host serves no /directory), keeping the query", () => {
  assert.equal(hubSearchRedirect({ ...base, pathname: "/search", search: "?q=test" }), "https://tulala.digital/directory?q=test");
  assert.equal(hubSearchRedirect({ ...base, pathname: "/es/search/", search: "?q=ni%C3%B1a" }), "https://tulala.digital/es/directory?q=ni%C3%B1a");
  assert.equal(hubSearchRedirect({ ...base, pathname: "/search", search: "" }), "https://tulala.digital/directory");
  assert.equal(hubSearchRedirect({ ...base, marketingOrigin: "https://staging.example.test/", pathname: "/search", search: "?q=x" }), "https://staging.example.test/directory?q=x", "a staging marketing origin is honoured, trailing slash trimmed");
});

test("the target host really serves /directory: it is the marketing surface, never the hub", () => {
  const allow = readFileSync(join(process.cwd(), "src/lib/saas/surface-allow-list.ts"), "utf8");
  assert.match(allow, /storefront\s+→ `\/directory`/);
  assert.match(allow, /hub\s+\|\s+✓\s+\|\s+✓\s+\|\s+✓\s+\|\s+✓\s+\|\s+path-slug/, "the hub row has path-slug storefront, not /directory");
});

test("only hub hosts, only GET/HEAD, only /search itself", () => {
  assert.equal(hubSearchRedirect({ ...base, hostKind: "agency", pathname: "/search", search: "?q=x" }), null);
  assert.equal(hubSearchRedirect({ ...base, hostKind: "marketing", pathname: "/search", search: "?q=x" }), null);
  assert.equal(hubSearchRedirect({ ...base, method: "POST", pathname: "/search", search: "?q=x" }), null);
  assert.equal(hubSearchRedirect({ ...base, pathname: "/searching", search: "" }), null);
  assert.equal(hubSearchRedirect({ ...base, pathname: "/search/more", search: "" }), null);
});

test("the proxy wires it before the surface 404", () => {
  const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
  assert.match(proxy, /hubSearchRedirect\(/);
  assert.ok(proxy.indexOf("hubSearchRedirect(") < proxy.indexOf('new URL("/_page-not-found", request.url)'));
});
