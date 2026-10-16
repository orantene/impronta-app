import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

test("TUL-748: My presence bootstrap runs its four loaders in one Promise.all", () => {
  const src = read("lib/talent-site/server/public-page-bootstrap.server.ts");
  assert.match(
    src,
    /Promise\.all\(\[\s*safe\(loadWebsiteSettingsEnabledAction\(\)\),\s*safe\(loadMaxSiteManagerAction\(\)\),\s*safe\(loadMaisonSetupBootstrapAction\(\)\),\s*safe\(loadTalentGoLiveAction\(\)\),?\s*\]\)/,
  );
});

test("TUL-748: the manager loader starts the owned-workspace lookup with its site reads", () => {
  const src = read("lib/talent-site/server/site-management-actions.ts");
  const start = src.indexOf("startOwnedWorkspaceLoad(");
  const reads = src.indexOf("const readAll = () =>");
  const resolve = src.indexOf("resolveManagerPublicSiteUrl({");
  assert.ok(start > 0 && reads > 0 && resolve > 0);
  // Started before the reads, consumed after them, never awaited inline.
  assert.ok(start < reads && reads < resolve, "lookup must start before the reads and be consumed after");
  assert.match(src, /resolveManagerPublicSiteUrl\(\{[\s\S]*?ownedPromise,\s*\}\)/);
  const helpers = read("lib/talent-site/server/site-management-helpers.ts");
  assert.match(helpers, /input\.ownedPromise \?\? loadOwnedBusinessWorkspace/);
});

test("TUL-748: the go-live loader reads the request locale in parallel with the gate", () => {
  const src = read("lib/talent-site/history/history-actions.ts");
  assert.match(src, /Promise\.all\(\[gate\("personalSiteEdit"\), getRequestLocale\(\)\]\)/);
  assert.doesNotMatch(src, /await getRequestLocale\(\)\)\.toLowerCase/);
});
