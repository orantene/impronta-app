import assert from "node:assert/strict";
import { test } from "node:test";

import type { WebsitePageRow } from "./types";
import {
  derivePageActions,
  derivePageVisibilityNotes,
  groupPagesBySlug,
  isPageSlugLocked,
  isSystemOwnedPage,
  normalizePageSlugKey,
  pageGroupMatchesStatus,
  rawPageSlug,
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

// ── rawPageSlug ─────────────────────────────────────────────────────────

test("rawPageSlug recovers the DB slug, with the homepage as the empty string", () => {
  // setPageRoleAction and quickRenamePageAction both match on cms_pages.slug,
  // where the homepage is "" — passing the displayed "/" matches no row.
  assert.equal(rawPageSlug("/"), "");
  assert.equal(rawPageSlug(""), "");
  assert.equal(rawPageSlug("/about"), "about");
  assert.equal(rawPageSlug("about/"), "about");
});

// ── derivePageActions ───────────────────────────────────────────────────

const OPEN = { canEdit: true, isPlatformHub: false, isHomepage: false } as const;

test("derivePageActions offers nothing below admin", () => {
  assert.deepEqual(derivePageActions(row({ status: "draft" }), { ...OPEN, canEdit: false }), []);
});

test("derivePageActions offers nothing on the platform hub's own site", () => {
  // The hub's site is managed in code; every one of these calls would be a lie.
  assert.deepEqual(
    derivePageActions(row({ status: "draft" }), { ...OPEN, isPlatformHub: true }),
    [],
  );
});

test("derivePageActions always offers rename and duplicate", () => {
  for (const status of ["published", "draft", "scheduled", "archived"] as const) {
    const ids = derivePageActions(row({ status }), OPEN);
    assert.ok(ids.includes("rename"), `rename missing for ${status}`);
    assert.ok(ids.includes("duplicate"), `duplicate missing for ${status}`);
  }
});

test("derivePageActions offers Publish on a draft and on a scheduled page only", () => {
  assert.ok(derivePageActions(row({ status: "draft" }), OPEN).includes("publish"));
  assert.ok(derivePageActions(row({ status: "scheduled" }), OPEN).includes("publish"));
  assert.ok(!derivePageActions(row({ status: "published" }), OPEN).includes("publish"));
  assert.ok(!derivePageActions(row({ status: "archived" }), OPEN).includes("publish"));
});

test("derivePageActions offers Restore on an archived page only", () => {
  assert.ok(derivePageActions(row({ status: "archived" }), OPEN).includes("restore"));
  assert.ok(!derivePageActions(row({ status: "draft" }), OPEN).includes("restore"));
});

test("derivePageActions never offers 'Set as homepage' on an unpublished page", () => {
  // setPageRoleAction refuses a non-published target outright, so the button
  // would be one that always errors — worse than no button.
  for (const status of ["draft", "scheduled", "archived"] as const) {
    assert.ok(
      !derivePageActions(row({ status }), OPEN).includes("setHomepage"),
      `setHomepage offered for ${status}`,
    );
  }
  assert.ok(derivePageActions(row({ status: "published" }), OPEN).includes("setHomepage"));
});

test("derivePageActions does not offer 'Set as homepage' on the page that already is", () => {
  const ids = derivePageActions(row({ status: "published" }), { ...OPEN, isHomepage: true });
  assert.ok(!ids.includes("setHomepage"));
});

test("derivePageActions offers Archive on a live or draft page", () => {
  assert.ok(derivePageActions(row({ status: "published" }), OPEN).includes("archive"));
  assert.ok(derivePageActions(row({ status: "draft" }), OPEN).includes("archive"));
  assert.ok(!derivePageActions(row({ status: "scheduled" }), OPEN).includes("archive"));
  assert.ok(!derivePageActions(row({ status: "archived" }), OPEN).includes("archive"));
});

// ── safety rails ────────────────────────────────────────────────────────

test("RAIL: a live page cannot be deleted in one step — Live → Archive → Delete", () => {
  for (const status of ["published", "draft", "scheduled"] as const) {
    assert.ok(
      !derivePageActions(row({ status }), OPEN).includes("delete"),
      `delete offered on a ${status} page`,
    );
  }
  assert.ok(derivePageActions(row({ status: "archived" }), OPEN).includes("delete"));
});

test("RAIL: the homepage is never deletable and never archivable", () => {
  const home = { ...OPEN, isHomepage: true };
  assert.ok(!derivePageActions(row({ status: "archived" }), home).includes("delete"));
  assert.ok(!derivePageActions(row({ status: "published" }), home).includes("archive"));
  assert.ok(!derivePageActions(row({ status: "draft" }), home).includes("archive"));
});

test("RAIL: the homepage's address is locked while it holds the role", () => {
  assert.equal(isPageSlugLocked(row({ slug: "/welcome" }), { isHomepage: true }), true);
  assert.equal(isPageSlugLocked(row({ slug: "/welcome" }), { isHomepage: false }), false);
});

test("RAIL: system-owned pages offer neither Archive nor Delete", () => {
  // archivePage and deletePage both return SYSTEM_PAGE_IMMUTABLE for these,
  // and the cms_pages guard trigger blocks the DELETE underneath.
  const system = row({ status: "published", systemTemplateKey: "homepage" });
  assert.ok(!derivePageActions(system, OPEN).includes("archive"));
  assert.ok(
    !derivePageActions(row({ status: "archived", systemTemplateKey: "homepage" }), OPEN)
      .includes("delete"),
  );
});

test("RAIL: a system-owned page's address is locked, its title is not", () => {
  const system = row({ slug: "/legal", systemTemplateKey: "legal" });
  assert.equal(isPageSlugLocked(system, { isHomepage: false }), true);
  assert.ok(derivePageActions(system, OPEN).includes("rename"));
});

test("isSystemOwnedPage treats an absent template key as 'not system', not unknown", () => {
  // The bridge does not project is_system_owned; system_template_key is its
  // paired flag. An older payload carries neither, and the server rejects the
  // call anyway — its message is the honest one to show.
  assert.equal(isSystemOwnedPage(row({ systemTemplateKey: undefined })), false);
  assert.equal(isSystemOwnedPage(row({ systemTemplateKey: null })), false);
  assert.equal(isSystemOwnedPage(row({ systemTemplateKey: "homepage" })), true);
});

test("derivePageActions returns a stable presentation order", () => {
  assert.deepEqual(derivePageActions(row({ status: "draft" }), OPEN), [
    "publish",
    "rename",
    "duplicate",
    "archive",
  ]);
  assert.deepEqual(derivePageActions(row({ status: "archived" }), OPEN), [
    "restore",
    "rename",
    "duplicate",
    "delete",
  ]);
  assert.deepEqual(derivePageActions(row({ status: "published" }), OPEN), [
    "rename",
    "duplicate",
    "setHomepage",
    "archive",
  ]);
});
