import assert from "node:assert/strict";
import { test } from "node:test";

import { contactSurfaceForHostKind } from "./contact-host";

test("host-dispatch picks marketing for marketing kind and storefront otherwise", () => {
  assert.equal(contactSurfaceForHostKind("marketing"), "marketing");
  assert.equal(contactSurfaceForHostKind("tenant"), "storefront");
  assert.equal(contactSurfaceForHostKind("agency"), "storefront");
  assert.equal(contactSurfaceForHostKind("app"), "storefront");
});
