/**
 * TUL-1586: the changelog never goes public with placeholder copy.
 *
 * CHANGELOG_PUBLIC_LAUNCH=1 is necessary but not sufficient: the page, sitemap
 * and feed stay OFF (noindex, no sitemap entry) while any published entry still
 * carries a placeholder marker, or while no Launch Edition is published.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  changelogLaunchState,
  hasPlaceholderCopy,
  pickLaunchEdition,
  type ChangelogRow,
} from "./public-read";

let n = 0;
function row(over: Partial<ChangelogRow> = {}): ChangelogRow {
  n += 1;
  return {
    notion_page_id: `page-${n}`,
    status: "published",
    kind: "Weekly changelog",
    release_date: "2026-10-20",
    tier: 2,
    badge: null,
    title_en: "Share a promo in one tap",
    title_es: "Comparte una promoción con un toque",
    summary_en: "Send it by WhatsApp.",
    summary_es: "Envíala por WhatsApp.",
    body_en_html: "<p>Details.</p>",
    body_es_html: "<p>Detalles.</p>",
    audience: [],
    plans: [],
    categories: [],
    help_url: null,
    cover_image_url: null,
    published_at: "2026-10-20T15:00:00Z",
    ...over,
  };
}
const edition = (over: Partial<ChangelogRow> = {}) =>
  row({ kind: "Edition", title_en: "Tulala Fall 2026", title_es: "Tulala Otoño 2026", ...over });

test("flag off is always off, whatever is published", () => {
  const s = changelogLaunchState(false, [edition(), row()]);
  assert.equal(s.live, false);
  assert.equal(!s.live && s.reason, "flag_off");
});

test("flag on + a clean published Launch Edition is live", () => {
  const e = edition();
  const s = changelogLaunchState(true, [row(), e]);
  assert.equal(s.live, true);
  assert.equal(s.live && s.edition.notion_page_id, e.notion_page_id);
});

test("flag on + no published Launch Edition stays off", () => {
  for (const rows of [[], [row(), row()]]) {
    const s = changelogLaunchState(true, rows);
    assert.equal(s.live, false);
    assert.equal(!s.live && s.reason, "no_launch_edition");
  }
});

test("an Edition that has no title in one language is not a Launch Edition", () => {
  assert.equal(pickLaunchEdition([edition({ title_es: "  " })]), null);
  assert.equal(changelogLaunchState(true, [edition({ title_en: "" })]).live, false);
});

test("flag on + placeholder copy anywhere in a published entry stays off, and names the entry", () => {
  const bad = edition({ body_en_html: "<p>PLACEHOLDER COPY, NEEDS ORAN SIGN-OFF BEFORE LAUNCH.</p>" });
  const s = changelogLaunchState(true, [row(), bad]);
  assert.equal(s.live, false);
  assert.equal(!s.live && s.reason, "placeholder_copy");
  assert.deepEqual(!s.live && s.offenders, [bad.notion_page_id]);
});

test("the placeholder check covers both languages and every text field", () => {
  const fields: Array<keyof ChangelogRow> = ["title_en", "title_es", "summary_en", "summary_es", "body_en_html", "body_es_html"];
  for (const field of fields) {
    assert.equal(hasPlaceholderCopy(row({ [field]: "REQUIERE VISTO BUENO DE ORAN" })), true, String(field));
    assert.equal(hasPlaceholderCopy(row({ [field]: "texto provisional" })), true, String(field));
    assert.equal(hasPlaceholderCopy(row({ [field]: "TODO: write this" })), true, String(field));
  }
});

test("a real entry that merely mentions placeholders is not blocked", () => {
  assert.equal(hasPlaceholderCopy(row({ title_en: "Custom placeholder text in forms", body_en_html: "<p>Set the placeholder shown in each field.</p>" })), false);
  assert.equal(hasPlaceholderCopy(row({ summary_en: "Todo list for your team" })), false);
  assert.equal(hasPlaceholderCopy(row({ title_es: "Todo en un solo lugar", summary_es: "TODO EN UN LUGAR para tu negocio" })), false);
});

test("placeholder copy wins over a missing edition, and the newest Edition is picked", () => {
  const old = edition({ published_at: "2026-09-01T00:00:00Z", title_en: "Old" });
  const next = edition({ published_at: "2026-10-20T00:00:00Z", title_en: "New" });
  assert.equal(pickLaunchEdition([old, next])?.title_en, "New");
  const s = changelogLaunchState(true, [row({ title_en: "needs oran sign-off" })]);
  assert.equal(!s.live && s.reason, "placeholder_copy");
});

test("every public surface reads the guarded state, never the bare flag", () => {
  const web = process.cwd();
  const read = (rel: string) => readFileSync(join(web, rel), "utf8");
  for (const rel of [
    "src/components/marketing/changelog/changelog-views.tsx",
    "src/lib/changelog/feed.ts",
    "src/app/sitemap.ts",
  ]) {
    const src = read(rel);
    assert.match(src, /isChangelogLive\(\)/, `${rel} must use isChangelogLive`);
    assert.doesNotMatch(src, /isChangelogPublicLaunch/, `${rel} must not read the bare flag`);
  }
});
