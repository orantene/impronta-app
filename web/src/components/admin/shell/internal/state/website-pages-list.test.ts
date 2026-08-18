import assert from "node:assert/strict";
import { test } from "node:test";

import type { WebsitePageRow } from "./types";
import {
  derivePageVisibilityNotes,
  groupPagesBySlug,
  normalizePageSlugKey,
  pageGroupMatchesStatus,
  sortPageGroups,
} from "./website-pages-list";

/**
 * P2-A — the pure rules behind the Website → Pages list (grouping by slug
 * across locales, the fixed reading order, and the search-visibility facts).
 *
 * These are the rules a reviewer cannot check by looking at the JSX, and the
 * ones a novice operator's mental model depends on: "one row per page, my
 * homepage at the top, and the app never tells me something it does not know."
 */

function row(overrides: Partial<WebsitePageRow> = {}): WebsitePageRow {
  return {
    id: "p1",
    title: "Title",
    slug: "/about",
    status: "published",
    updatedAt: "2026-08-01T00:00:00.000Z",
    lastEditedBy: "Ana",
    template: "blank",
    locale: "en",
    ...overrides,
  };
}

// ── normalizePageSlugKey ────────────────────────────────────────────────

test("normalizePageSlugKey folds the homepage's many spellings into '/'", () => {
  assert.equal(normalizePageSlugKey(""), "/");
  assert.equal(normalizePageSlugKey("/"), "/");
  assert.equal(normalizePageSlugKey("  /  "), "/");
});

test("normalizePageSlugKey normalizes leading and trailing slashes", () => {
  assert.equal(normalizePageSlugKey("about"), "/about");
  assert.equal(normalizePageSlugKey("/about/"), "/about");
  assert.equal(normalizePageSlugKey("//launch/ss27//"), "/launch/ss27");
});

// ── groupPagesBySlug ────────────────────────────────────────────────────

test("groupPagesBySlug puts the EN and ES rows of one slug in ONE group", () => {
  const groups = groupPagesBySlug([
    row({ id: "en", locale: "en", slug: "/about" }),
    row({ id: "es", locale: "es", slug: "/about", title: "Sobre nosotros" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.variants.length, 2);
  assert.deepEqual(groups[0]!.locales, ["en", "es"]);
});

test("groupPagesBySlug reads the display fields off the DEFAULT-locale variant", () => {
  const groups = groupPagesBySlug(
    [
      row({ id: "es", locale: "es", title: "Sobre nosotros" }),
      row({ id: "en", locale: "en", title: "About us" }),
    ],
    "en",
  );
  assert.equal(groups[0]!.primary.id, "en");
  assert.equal(groups[0]!.primary.title, "About us");
  // The default-locale variant also leads the variant list.
  assert.equal(groups[0]!.variants[0]!.id, "en");
});

test("groupPagesBySlug falls back to the first variant when the default locale is missing", () => {
  const groups = groupPagesBySlug(
    [row({ id: "es", locale: "es", title: "Sobre nosotros" })],
    "en",
  );
  assert.equal(groups[0]!.primary.id, "es");
  assert.deepEqual(groups[0]!.locales, ["es"]);
});

test("groupPagesBySlug treats a row with no locale as the tenant default", () => {
  const groups = groupPagesBySlug([row({ id: "bare", locale: undefined })], "es");
  assert.deepEqual(groups[0]!.locales, ["es"]);
  assert.equal(groups[0]!.primary.id, "bare");
});

test("groupPagesBySlug marks the group as the homepage when ANY variant is", () => {
  const groups = groupPagesBySlug([
    row({ id: "en", slug: "/", locale: "en", isHomepage: true }),
    row({ id: "es", slug: "/", locale: "es", isHomepage: false }),
  ]);
  assert.equal(groups[0]!.isHomepage, true);
});

test("groupPagesBySlug keeps distinct slugs apart and preserves input order", () => {
  const groups = groupPagesBySlug([
    row({ id: "a", slug: "/contact" }),
    row({ id: "b", slug: "/about" }),
  ]);
  assert.deepEqual(groups.map((g) => g.slug), ["/contact", "/about"]);
});

// ── sortPageGroups ──────────────────────────────────────────────────────

test("sortPageGroups puts the homepage first, whatever its status", () => {
  const sorted = sortPageGroups(
    groupPagesBySlug([
      row({ id: "a", slug: "/about", title: "About", status: "published" }),
      row({ id: "h", slug: "/", title: "Zzz home", status: "draft", isHomepage: true }),
    ]),
  );
  assert.equal(sorted[0]!.slug, "/");
});

test("sortPageGroups orders live, then scheduled, then draft, then archived", () => {
  const sorted = sortPageGroups(
    groupPagesBySlug([
      row({ id: "arch", slug: "/old", status: "archived" }),
      row({ id: "draft", slug: "/press", status: "draft" }),
      row({ id: "sched", slug: "/launch", status: "scheduled", scheduledFor: "2026-09-01T00:00:00.000Z" }),
      row({ id: "live", slug: "/about", status: "published" }),
    ]),
  );
  assert.deepEqual(sorted.map((g) => g.slug), ["/about", "/launch", "/press", "/old"]);
});

test("sortPageGroups sorts live pages A to Z by title", () => {
  const sorted = sortPageGroups(
    groupPagesBySlug([
      row({ id: "r", slug: "/roster", title: "Roster" }),
      row({ id: "a", slug: "/about", title: "About us" }),
      row({ id: "c", slug: "/contact", title: "Contact" }),
    ]),
  );
  assert.deepEqual(sorted.map((g) => g.primary.title), ["About us", "Contact", "Roster"]);
});

test("sortPageGroups sorts scheduled pages soonest-first, undated last", () => {
  const sorted = sortPageGroups(
    groupPagesBySlug([
      row({ id: "n", slug: "/none", status: "scheduled", scheduledFor: undefined }),
      row({ id: "l", slug: "/late", status: "scheduled", scheduledFor: "2026-12-01T00:00:00.000Z" }),
      row({ id: "s", slug: "/soon", status: "scheduled", scheduledFor: "2026-09-01T00:00:00.000Z" }),
    ]),
  );
  assert.deepEqual(sorted.map((g) => g.slug), ["/soon", "/late", "/none"]);
});

test("sortPageGroups sorts drafts most-recently-edited first", () => {
  const sorted = sortPageGroups(
    groupPagesBySlug([
      row({ id: "old", slug: "/old-draft", status: "draft", updatedAt: "2026-01-01T00:00:00.000Z" }),
      row({ id: "new", slug: "/new-draft", status: "draft", updatedAt: "2026-08-10T00:00:00.000Z" }),
    ]),
  );
  assert.deepEqual(sorted.map((g) => g.slug), ["/new-draft", "/old-draft"]);
});

test("sortPageGroups does not mutate its input", () => {
  const groups = groupPagesBySlug([
    row({ id: "z", slug: "/zzz", title: "Zzz" }),
    row({ id: "a", slug: "/aaa", title: "Aaa" }),
  ]);
  const before = groups.map((g) => g.slug);
  sortPageGroups(groups);
  assert.deepEqual(groups.map((g) => g.slug), before);
});

// ── pageGroupMatchesStatus ──────────────────────────────────────────────

test("pageGroupMatchesStatus matches on ANY variant, not just the primary", () => {
  const [group] = groupPagesBySlug([
    row({ id: "en", locale: "en", status: "published" }),
    row({ id: "es", locale: "es", status: "draft" }),
  ]);
  assert.equal(pageGroupMatchesStatus(group!, "published"), true);
  assert.equal(pageGroupMatchesStatus(group!, "draft"), true);
  assert.equal(pageGroupMatchesStatus(group!, "archived"), false);
});

// ── derivePageVisibilityNotes ───────────────────────────────────────────

test("derivePageVisibilityNotes reports nothing when the page is fully visible", () => {
  const notes = derivePageVisibilityNotes(
    row({ noindex: false, includeInSitemap: true, hasMetaDescription: true }),
  );
  assert.deepEqual(notes, []);
});

test("derivePageVisibilityNotes reports each fact it can prove, in a stable order", () => {
  const notes = derivePageVisibilityNotes(
    row({ noindex: true, includeInSitemap: false, hasMetaDescription: false }),
  );
  assert.deepEqual(notes.map((n) => n.id), ["noindex", "sitemap", "metaDescription"]);
});

test("derivePageVisibilityNotes returns catalog KEYS, never English strings", () => {
  const notes = derivePageVisibilityNotes(row({ noindex: true }));
  assert.equal(notes[0]!.messageKey, "dashboard.adminWebsite.pagesListNoindex");
});

test("derivePageVisibilityNotes stays silent on fields the pipeline did not carry", () => {
  // undefined means "unknown", not "false". Claiming a page is missing from
  // the sitemap on the strength of an absent field is a fabricated fact.
  const notes = derivePageVisibilityNotes(
    row({ noindex: undefined, includeInSitemap: undefined, hasMetaDescription: undefined }),
  );
  assert.deepEqual(notes, []);
});
