import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  CATALOG_SEED_FRESH_MS,
  CATALOG_SEED_WAIT_MS,
  expectCatalogBootstrap,
  firstCatalogLoad,
  resetCatalogBootstrap,
  seedCatalogBootstrap,
  takeCatalogSeed,
} from "./catalog-bootstrap";

/**
 * B5 (TUL-1271 #12): the workspace Catalog took 10 to 18 s on every visit.
 * Its list was a server action fired on mount, queued behind the shell's own
 * actions (and discarded by any navigation landing meanwhile, which hangs it
 * until the 10 s settle budget retries). The route now loads the list on the
 * server; these pin that the editor takes it instead of calling the action.
 */

const ok = (n: number) => ({ ok: true as const, items: [], defaultCurrency: "MXN", defaultCreateType: "service" as const, n });
type Ok = ReturnType<typeof ok>;

function counter(result: Ok = ok(0), delayMs = 0) {
  let calls = 0;
  return {
    call: () => {
      calls += 1;
      return new Promise<Ok>((r) => setTimeout(() => r(result), delayMs));
    },
    calls: () => calls,
  };
}

const withWindow = () => Object.assign(globalThis, { window: globalThis });
const withoutWindow = () => {
  Reflect.deleteProperty(globalThis, "window");
};

test("the seed is browser-only (module state never leaks across server requests)", () => {
  withoutWindow();
  resetCatalogBootstrap();
  seedCatalogBootstrap({ tenantId: "t1", result: ok(1) });
  withWindow();
  assert.equal(takeCatalogSeed("t1"), null);
  withoutWindow();
});

test("taken once, for the same workspace only, while fresh, and only when the server load succeeded", () => {
  withWindow();
  resetCatalogBootstrap();
  seedCatalogBootstrap({ tenantId: "t1", result: ok(1) }, 1_000);
  assert.equal(takeCatalogSeed("t2", 1_001), null, "another workspace never gets it");
  assert.deepEqual(takeCatalogSeed("t1", 1_001), ok(1));
  assert.equal(takeCatalogSeed("t1", 1_002), null, "once");

  resetCatalogBootstrap();
  seedCatalogBootstrap({ tenantId: "t1", result: ok(1) }, 1_000);
  assert.equal(takeCatalogSeed("t1", 1_000 + CATALOG_SEED_FRESH_MS), null, "stale");

  resetCatalogBootstrap();
  seedCatalogBootstrap({ tenantId: "t1", result: { ok: false, error: "Not authorized." } });
  assert.equal(takeCatalogSeed("t1"), null, "a refusal falls back to the action");
  withoutWindow();
});

test("a seed already here: the first load makes NO server action call", async () => {
  withWindow();
  resetCatalogBootstrap();
  seedCatalogBootstrap({ tenantId: "t1", result: ok(7) });
  const action = counter();
  assert.deepEqual(await firstCatalogLoad("t1", action.call), ok(7));
  assert.equal(action.calls(), 0);
  withoutWindow();
});

test("the page's marker holds the first load until the streamed list lands, then no action call", async () => {
  withWindow();
  resetCatalogBootstrap();
  expectCatalogBootstrap();
  const action = counter();
  const pending = firstCatalogLoad("t1", action.call);
  setTimeout(() => seedCatalogBootstrap({ tenantId: "t1", result: ok(3) }), 5);
  assert.deepEqual(await pending, ok(3));
  assert.equal(action.calls(), 0);
  withoutWindow();
});

test("the marker's list is null (server could not load): the action runs", async () => {
  withWindow();
  resetCatalogBootstrap();
  expectCatalogBootstrap();
  const action = counter(ok(9));
  const pending = firstCatalogLoad("t1", action.call);
  setTimeout(() => seedCatalogBootstrap(null), 5);
  assert.deepEqual(await pending, ok(9));
  assert.equal(action.calls(), 1);
  withoutWindow();
});

test("the marker's list never lands: the wait is bounded, then the action runs", async () => {
  withWindow();
  resetCatalogBootstrap();
  const now = Date.now();
  expectCatalogBootstrap(now - (CATALOG_SEED_WAIT_MS - 20));
  const action = counter(ok(5));
  assert.deepEqual(await firstCatalogLoad("t1", action.call, now), ok(5));
  assert.equal(action.calls(), 1);
  withoutWindow();
});

test("no marker (a pushState rail click renders no page): the action goes at once", async () => {
  withWindow();
  resetCatalogBootstrap();
  const action = counter(ok(2));
  const pending = firstCatalogLoad("t1", action.call);
  assert.equal(action.calls(), 1, "called synchronously, no wait");
  assert.deepEqual(await pending, ok(2));
  resetCatalogBootstrap();
  withoutWindow();
});

test("no marker, but a list lands before a slow action: the list wins", async () => {
  withWindow();
  resetCatalogBootstrap();
  const action = counter(ok(1), 200);
  const pending = firstCatalogLoad("t1", action.call);
  setTimeout(() => seedCatalogBootstrap({ tenantId: "t1", result: ok(4) }), 5);
  assert.deepEqual(await pending, ok(4));
  resetCatalogBootstrap();
  withoutWindow();
});

test("wiring: both Catalog routes stream the list and stay bare synchronous pages; reloads still call the action", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  for (const seg of ["catalog", "menu"]) {
    const page = read(`src/app/(workspace)/[tenantSlug]/admin/${seg}/page.tsx`);
    assert.match(page, /<CatalogBootstrap \/>/);
    assert.match(page, /<PageRouteSyncer page="menu" \/>/);
    assert.doesNotMatch(page, /\bawait\b|async function/, "the page itself never waits (spa-segments)");
  }
  const boot = read("src/app/(workspace)/[tenantSlug]/admin/_catalog-bootstrap.tsx");
  assert.match(boot, /<CatalogBootstrapExpected \/>\s*<Suspense fallback=\{null\}>\s*<CatalogBootstrapLoader \/>/);
  const server = read("src/lib/talent/catalog-bootstrap.server.ts");
  assert.match(server, /getAdminWorkspaceScope\(\)/, "tenant from the request surface, never the client");
  assert.match(server, /loadWorkspaceMenuForEditor\(scope\.tenantId\)/, "the same authorised loader as the action");
  const hook = read("src/components/talent/services/use-offerings-editor.ts");
  assert.match(hook, /loadTick > 0\s*\? workspaceAction\(\)\s*: firstCatalogLoad\(workspaceTenantId, workspaceAction\)/);
});
