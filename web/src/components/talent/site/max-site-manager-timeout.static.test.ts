import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync("src/components/talent/site/TalentMaxSiteManager.tsx", "utf8");

test("TUL-728: the site manager load times out into the retry state instead of loading forever", () => {
  assert.match(src, /MANAGER_LOAD_TIMEOUT_MS/);
  assert.match(src, /Promise\.race\(\[\s*takeOr\("manager"/);
});

test("TUL-728: a timed-out or thrown load always ends in the retry state, never the loading card", () => {
  // The timeout rejects, the catch records an error and clears the state,
  // and finally ALWAYS drops the loading flag.
  assert.match(src, /reject\(new Error\("manager-load-timeout"\)\)/);
  assert.match(src, /catch \(cause\) \{[\s\S]*?setError\(copy\.t\("Could not load your website\."\)\);\s*setState\(null\);[\s\S]*?\} finally \{\s*setLoading\(false\);/);
  // "Loading your website…" only renders while loading; the error card has a retry button.
  assert.match(src, /if \(loading\) \{?\s*return <Card><span style=\{mutedText\}>\{copy\.t\("Loading your website…"\)\}/);
  assert.match(src, /onClick=\{retry\}/);
  assert.match(src, /const retry = \(\) => \{\s*setLoading\(true\);\s*setError\(null\);\s*void reload\(\);/);
});

test("TUL-728 / TUL-1114: 'Hide a public page' opens the hide/show list inside Settings, never navigates away, never touches the manager loader", () => {
  const settings = readFileSync("src/components/admin/shell/internal/talent/pages/SettingsPage.tsx", "utf8");
  const at = settings.indexOf('key: "hide",');
  const row = settings.slice(at, at + 600);
  assert.match(row, /panel: <TalentSiteAppearancesPanel \/>/);
  assert.doesNotMatch(row, /onOpen/, "the row must not navigate out of Settings");
  assert.doesNotMatch(row, /setTalentPage\("public-page"\)/);
  assert.doesNotMatch(settings, /loadMaxSiteManagerAction/);
});
