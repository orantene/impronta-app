import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Wiring guard for the talent page draft/publish split.
 *
 * The bug this prevents: a save wrote `talent_pages.blocks`, Publish only
 * flipped `status`, and the public loaders rendered `blocks`, so every save on
 * a published page was live at once. The behaviour is proven in
 * `talent-page-publish-core.test.ts`; this file pins the four layers that must
 * stay connected for that behaviour to reach production.
 */

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Body of one exported function: from its declaration to the next export. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} not found`);
  const next = src.indexOf("\nexport ", start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}

const ACTIONS = read("lib/site-admin/builder-core/adapters/talent-page-actions.ts");
const SITE = read("lib/talent-site/server/site-management-actions.ts");

test("saving a talent page never writes the live body", () => {
  const save = fnBody(ACTIONS, "saveTalentPageAction");
  assert.doesNotMatch(save, /blocks_published/);
  assert.doesNotMatch(save, /status:\s*"published"/);
});

test("restoring a revision never writes the live body", () => {
  assert.doesNotMatch(fnBody(ACTIONS, "restoreTalentPageRevisionAction"), /blocks_published/);
});

test("both publish paths copy the draft body through publishTalentPageBodies", () => {
  const page = fnBody(ACTIONS, "publishTalentPageAction");
  assert.match(page, /publishTalentPageBodies\(/);
  assert.doesNotMatch(page, /\.update\(\{\s*status:\s*"published"/);

  const site = fnBody(SITE, "publishMaxSiteAction");
  assert.match(site, /publishTalentPageBodies\(/);
  // The site row still gets status "published"; only a talent_pages status
  // flip without the body copy is forbidden.
  assert.doesNotMatch(site, /from\("talent_pages"\)\s*\.update\(\{\s*status:\s*"published"/);
});

test("the publish binding writes blocks_published with a compare-and-swap on updated_at", () => {
  const bind = read("lib/talent-site/server/publish-talent-page-bodies.ts");
  assert.match(bind, /blocks_published:\s*blocks/);
  assert.match(bind, /\.eq\("updated_at", expectedUpdatedAt\)/);
});

test("both public loaders read blocks_published and pick the body with publicPageBody", () => {
  const load = read("lib/talent-site/server/load-max-site.ts");
  assert.match(load, /blocks_published/);
  const render = read("lib/talent-site/server/render-max-site.tsx");
  assert.match(render, /publicPageBody\(page, \{ draftPreview: isOwnerDraftPreview \}\)/);
  assert.doesNotMatch(render, /coerceTree\(page\.blocks\)/);

  const pub = read("lib/talent-site/published-talent-page.ts");
  assert.match(pub, /blocks_published/);
  const core = read("lib/talent-site/published-talent-page-core.ts");
  assert.match(core, /publicPageBody\(/);
  assert.doesNotMatch(core, /coerceBuilderTree\(row\.blocks\)/);
});
