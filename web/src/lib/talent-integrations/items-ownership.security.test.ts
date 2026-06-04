/**
 * items-ownership.security.test.ts — owner-guard characterization for talent
 * manual featured-media items (talent_integration_items).
 *
 * The CRUD functions live behind two layers that cannot be unit-tested on Node
 * without experimental module mocking:
 *   - actions.ts calls `requireTalentSelf()` (session-coupled), and
 *   - repository.ts uses the service-role client (RLS-bypassing).
 *
 * Per repo convention (see saas/scope.security.test.ts + tenant-isolation.test.ts)
 * these are pinned with SOURCE-LEVEL INVARIANTS: readFileSync + assert.match.
 * A refactor that drops the talent ownership scoping fails loudly here.
 *
 * The guarantee under test: a talent can only read/write their OWN items.
 *   1. Every item action requires `requireTalentSelf()` and bails on !ok.
 *   2. Item actions pass guard.talentProfile.id (never a caller-supplied owner).
 *   3. Owner-scoped repo update/delete filter by talent_profile_id.
 *   4. The public list returns ONLY public_profile_enabled = true items.
 *   5. New items default to NOT public (privacy-first).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ACTIONS_SRC = readFileSync(join(HERE, "actions.ts"), "utf8");
const REPO_SRC = readFileSync(join(HERE, "repository.ts"), "utf8");

const ITEM_ACTIONS = [
  "fetchTalentFeaturedMediaAction",
  "addTalentFeaturedMediaAction",
  "updateTalentFeaturedMediaAction",
  "removeTalentFeaturedMediaAction",
];

function actionBody(name: string): string {
  const start = ACTIONS_SRC.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `action ${name} must exist`);
  // The next exported function (or EOF) bounds this body.
  const after = ACTIONS_SRC.indexOf("\nexport async function ", start + 1);
  return ACTIONS_SRC.slice(start, after === -1 ? undefined : after);
}

test("every item action requires the talent-self guard and bails on failure", () => {
  for (const name of ITEM_ACTIONS) {
    const body = actionBody(name);
    assert.match(
      body,
      /const guard = await requireTalentSelf\(\)/,
      `${name} must call requireTalentSelf()`,
    );
    assert.match(
      body,
      /if \(!guard\.ok\) return \{ ok: false, error: guard\.error[\s\S]*?\};/,
      `${name} must bail when the guard fails`,
    );
  }
});

test("item actions scope writes to the guard's own talentProfile.id", () => {
  // The owner is taken from the guarded session, never from action input.
  for (const name of [
    "addTalentFeaturedMediaAction",
    "updateTalentFeaturedMediaAction",
    "removeTalentFeaturedMediaAction",
  ]) {
    const body = actionBody(name);
    assert.match(
      body,
      /guard\.talentProfile\.id/,
      `${name} must use guard.talentProfile.id as the owner`,
    );
  }
  // No item action accepts an owner / talentProfileId from the caller.
  for (const name of ITEM_ACTIONS) {
    const body = actionBody(name);
    assert.doesNotMatch(
      body,
      /talentProfileId:\s*(input|parsed)/,
      `${name} must not take a caller-supplied owner id`,
    );
  }
});

test("owner-scoped repo update/delete filter by talent_profile_id", () => {
  const updateStart = REPO_SRC.indexOf("export async function updateTalentIntegrationItem");
  const deleteStart = REPO_SRC.indexOf("export async function deleteTalentIntegrationItem");
  assert.ok(updateStart >= 0 && deleteStart >= 0);

  const updateBody = REPO_SRC.slice(
    updateStart,
    REPO_SRC.indexOf("\nexport async function ", updateStart + 1),
  );
  const deleteBody = REPO_SRC.slice(
    deleteStart,
    REPO_SRC.indexOf("\nexport async function ", deleteStart + 1),
  );

  assert.match(
    updateBody,
    /\.eq\("talent_profile_id", talentProfileId\)/,
    "update must scope by talent_profile_id (ownership)",
  );
  assert.match(
    deleteBody,
    /\.eq\("talent_profile_id", talentProfileId\)/,
    "delete must scope by talent_profile_id (ownership)",
  );
});

test("public list returns only public_profile_enabled items", () => {
  const start = REPO_SRC.indexOf(
    "export async function listPublicTalentIntegrationItems",
  );
  assert.ok(start >= 0);
  const body = REPO_SRC.slice(
    start,
    REPO_SRC.indexOf("\nexport async function ", start + 1),
  );
  assert.match(
    body,
    /\.eq\("public_profile_enabled", true\)/,
    "public reads must filter to public_profile_enabled = true",
  );
});

test("new featured-media items default to NOT public (privacy-first)", () => {
  // createTalentIntegrationItem defaults public_profile_enabled to false.
  const start = REPO_SRC.indexOf("export async function createTalentIntegrationItem");
  const body = REPO_SRC.slice(
    start,
    REPO_SRC.indexOf("\nexport async function ", start + 1),
  );
  assert.match(
    body,
    /public_profile_enabled:\s*input\.publicProfileEnabled \?\? false/,
    "create must default public_profile_enabled to false",
  );
  // The add action requests publicProfileEnabled: false explicitly.
  const addBody = actionBody("addTalentFeaturedMediaAction");
  assert.match(
    addBody,
    /publicProfileEnabled:\s*parsed\.data\.publicProfileEnabled \?\? false/,
    "add action must default to private",
  );
});

test("add action rejects unrecognized URLs before any DB write", () => {
  const body = actionBody("addTalentFeaturedMediaAction");
  const parseIdx = body.indexOf("parseMediaUrl(parsed.data.url)");
  const createIdx = body.indexOf("createTalentIntegrationItem(");
  assert.ok(parseIdx >= 0, "must parse the url");
  assert.ok(createIdx >= 0, "must create the item");
  assert.ok(
    parseIdx < createIdx,
    "url must be parsed/validated before the item is written",
  );
  assert.match(
    body,
    /if \(!media\) \{[\s\S]*?return \{[\s\S]*?ok: false/,
    "unrecognized urls must return an error, not write",
  );
  // embed url is rebuilt safely, never trusted from input
  assert.match(
    body,
    /safeEmbedUrl\(media\.provider, media\.externalId\)/,
    "embed url must come from safeEmbedUrl, not from caller input",
  );
});

test("manual featured media is showcase-only — never a verified badge", () => {
  const body = actionBody("addTalentFeaturedMediaAction");
  assert.match(
    body,
    /verification_status:\s*"manual_unverified"/,
    "manual items must be stored as manual_unverified",
  );
  // No item action touches trust badges.
  for (const name of ITEM_ACTIONS) {
    assert.doesNotMatch(
      actionBody(name),
      /trust_badge|TrustBadge|syncTalentIntegrationTrustBadge/,
      `${name} must not create/verify trust badges`,
    );
  }
});
