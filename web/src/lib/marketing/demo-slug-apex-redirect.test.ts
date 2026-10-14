import assert from "node:assert/strict";
import { test } from "node:test";
import { marketingDemoSlugRedirect } from "./demo-slug-apex-redirect";

const base = { search: "", method: "GET", hostKind: "marketing" };

test("apex /es/<demo-slug> and /<demo-slug> 308 to the demo subdomain", () => {
  assert.equal(
    marketingDemoSlugRedirect({ ...base, pathname: "/es/alex-trevino-demo" }),
    "https://alex-trevino-demo.tulala.digital/",
  );
  assert.equal(
    marketingDemoSlugRedirect({ ...base, pathname: "/alex-trevino-demo/" }),
    "https://alex-trevino-demo.tulala.digital/",
  );
  assert.equal(
    marketingDemoSlugRedirect({ ...base, pathname: "/en/alex-trevino-demo", search: "?a=1" }),
    "https://alex-trevino-demo.tulala.digital/?a=1",
  );
});

test("only marketing host, safe methods, single segment, valid label", () => {
  assert.equal(marketingDemoSlugRedirect({ ...base, pathname: "/alex-trevino-demo", hostKind: "agency" }), null);
  assert.equal(marketingDemoSlugRedirect({ ...base, pathname: "/alex-trevino-demo", method: "POST" }), null);
  assert.equal(marketingDemoSlugRedirect({ ...base, pathname: "/a/b-demo" }), null);
  assert.equal(marketingDemoSlugRedirect({ ...base, pathname: "/alex-trevino" }), null);
  assert.equal(marketingDemoSlugRedirect({ ...base, pathname: "/-demo" }), null);
  assert.equal(marketingDemoSlugRedirect({ ...base, pathname: "/Bad_Slug-demo" }), null);
});
