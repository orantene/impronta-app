import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

// TUL-1250: a signed-in client opening /client must see a skeleton, never a blank white page,
// while the resolver (session, identity, tenant lookup) redirects on.
test("TUL-1250: /client paints a skeleton while the resolver redirect runs", () => {
  assert.ok(existsSync("src/app/client/loading.tsx"), "src/app/client/loading.tsx is missing");
  const src = readFileSync("src/app/client/loading.tsx", "utf8");
  assert.match(src, /export default function/);
  assert.match(src, /client\/loading/);
});

test("TUL-1250: the shared client skeleton is a visible status region, not an empty node", () => {
  const src = readFileSync("src/app/(workspace)/[tenantSlug]/client/loading.tsx", "utf8");
  assert.match(src, /role="status"/);
  assert.match(src, /minHeight/);
});
