/**
 * TUL-1482: the home-page Launch Edition link follows the same launch switch as
 * the changelog itself. Nothing is linked, and nothing is read, before launch.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildLaunchEditionLink, launchEditionPath, loadLaunchEditionLink } from "./launch-edition-link";
import { changelogLaunchState, type ChangelogRow } from "./public-read";

function edition(over: Partial<ChangelogRow> = {}): ChangelogRow {
  return {
    notion_page_id: "3fe2c5ee-9743-8135-b034-edc2c0d6a40a",
    status: "published",
    kind: "Edition",
    release_date: "2026-11-01",
    tier: 3,
    badge: null,
    title_en: "Tulala Fall 2026",
    title_es: "Tulala Otoño 2026",
    summary_en: "Everything new.",
    summary_es: "Todo lo nuevo.",
    body_en_html: "<p>Details.</p>",
    body_es_html: "<p>Detalles.</p>",
    audience: [],
    plans: [],
    categories: [],
    help_url: null,
    cover_image_url: null,
    published_at: "2026-11-01T15:00:00Z",
    ...over,
  };
}

test("no link while the switch is off, the copy is a placeholder, or no Edition is published", () => {
  const e = edition();
  assert.equal(buildLaunchEditionLink(changelogLaunchState(false, [e]), "en"), null);
  assert.equal(buildLaunchEditionLink(changelogLaunchState(true, []), "en"), null);
  const placeholder = edition({ body_en_html: "<p>NEEDS ORAN SIGN-OFF</p>" });
  assert.equal(buildLaunchEditionLink(changelogLaunchState(true, [placeholder]), "es"), null);
});

test("live: the link points at the Edition entry in the visitor's language, with the signed-off title", () => {
  const e = edition();
  const state = changelogLaunchState(true, [e]);
  const en = buildLaunchEditionLink(state, "en");
  const es = buildLaunchEditionLink(state, "es");
  assert.equal(en?.path, `/changelog/${e.notion_page_id}`);
  assert.equal(en?.title, "Tulala Fall 2026");
  assert.equal(es?.path, `/novedades/${e.notion_page_id}`);
  assert.equal(es?.title, "Tulala Otoño 2026");
  assert.equal(en?.cta, "See what's new");
  assert.equal(es?.cta, "Ver las novedades");
  assert.equal(launchEditionPath("x", "en"), "/changelog/x");
  assert.equal(launchEditionPath("x", "es"), "/novedades/x");
});

test("the loader returns null and reads nothing when the switch is off", async () => {
  const saved = process.env.CHANGELOG_PUBLIC_LAUNCH;
  try {
    delete process.env.CHANGELOG_PUBLIC_LAUNCH;
    assert.equal(await loadLaunchEditionLink("en"), null);
    process.env.CHANGELOG_PUBLIC_LAUNCH = "true";
    assert.equal(await loadLaunchEditionLink("es"), null, '"true" is not the on-value');
  } finally {
    if (saved === undefined) delete process.env.CHANGELOG_PUBLIC_LAUNCH;
    else process.env.CHANGELOG_PUBLIC_LAUNCH = saved;
  }
});

test("the home page mounts the strip, and the strip reads only the guarded loader", () => {
  const web = process.cwd();
  const read = (rel: string) => readFileSync(join(web, rel), "utf8");
  const home = read("src/components/marketing/home-page.tsx");
  assert.match(home, /import \{ LaunchEditionStrip \} from "\.\/launch-edition-strip"/);
  assert.match(home, /<LaunchEditionStrip locale=\{locale\} \/>/);
  const strip = read("src/components/marketing/launch-edition-strip.tsx");
  assert.match(strip, /loadLaunchEditionLink\(/);
  assert.match(strip, /if \(!link\) return null;/);
  assert.doesNotMatch(strip, /isChangelogPublicLaunch|process\.env/);
});
