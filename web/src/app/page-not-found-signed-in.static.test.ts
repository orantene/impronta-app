import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync("src/app/%5Fpage-not-found/page.tsx", "utf8");

// TUL-1907: the proxy rewrites every unknown path here, so this page must be session-aware.
test("TUL-1907: the proxy 404 swaps Sign in for the dashboard when signed in", () => {
  assert.match(src, /getCachedActorSession/);
  assert.match(src, /resolveAuthenticatedDestination\(actor\.profile\)/);
  assert.match(src, /dashboard: "Ir a mi panel"/);
  assert.match(src, /dashboard: "Go to my dashboard"/);
  assert.match(src, /homePath \? `\$\{app\}\$\{homePath\}` : `\$\{app\}\/login`/);
  assert.match(src, /homePath \? t\.dashboard : t\.signIn/);
});

test("TUL-1907: the proxy 404 stays dynamic (reads headers and cookies per request)", () => {
  assert.match(src, /await headers\(\)/);
  assert.match(src, /await cookies\(\)/);
  assert.doesNotMatch(src, /export const (dynamic|revalidate)\s*=\s*"?(force-static|\d+)/);
});
