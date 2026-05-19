/**
 * Characterization — the only pure (DB-free / auth-free) exported surface
 * in `src/lib/server-actions/`: the translations URL builders + search-param
 * parsers in `admin-translations-url.ts`. Black-box: pins the CURRENT
 * query-string output and normalization, including the quirks that emerge
 * from composing the shared admin-panel/search-param helpers. Suspected
 * bugs are flagged with `it.skip`, never fixed here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  VIEW_TABS,
  translationsHref,
  bioSortHref,
  taxonomySortHref,
  locationSortHref,
  parseTranslationsSearchParams,
  parseTranslationsAdminPanel,
  translationsBioEditorHref,
  translationsTaxonomyEditorHref,
  translationsLocationEditorHref,
} from "./admin-translations-url";

// A syntactically valid v4 UUID (version nibble 4, variant 8) — passes the
// admin-panel `isAdminPanelAid` regex used transitively by the parsers.
const UUID = "11111111-1111-4111-8111-111111111111";

// ─────────────────────────────────────────────────────────────────────────
// translationsHref — default-omission rules + fixed param order
// ─────────────────────────────────────────────────────────────────────────

describe("translationsHref", () => {
  it("no options → bare path, no query string", () => {
    assert.equal(translationsHref({}), "/admin/translations");
  });

  it("view `bio` is the implicit default and is omitted; other views are set", () => {
    assert.equal(translationsHref({ view: "bio" }), "/admin/translations");
    assert.equal(
      translationsHref({ view: "taxonomy" }),
      "/admin/translations?view=taxonomy",
    );
  });

  it("status `all` omitted; q is trimmed; whitespace-only q omitted", () => {
    assert.equal(translationsHref({ status: "all" }), "/admin/translations");
    assert.equal(
      translationsHref({ status: "missing" }),
      "/admin/translations?status=missing",
    );
    assert.equal(translationsHref({ q: "   " }), "/admin/translations");
    assert.equal(
      translationsHref({ q: "  café  " }),
      "/admin/translations?q=caf%C3%A9",
    );
  });

  it("dir `asc` omitted; `desc` set", () => {
    assert.equal(translationsHref({ dir: "asc" }), "/admin/translations");
    assert.equal(
      translationsHref({ dir: "desc" }),
      "/admin/translations?dir=desc",
    );
  });

  it("QUIRK: the SAME sort string is kept or dropped depending on the view's default sort", () => {
    // taxonomy default = "kind" → dropped under taxonomy…
    assert.equal(
      translationsHref({ view: "taxonomy", sort: "kind" }),
      "/admin/translations?view=taxonomy",
    );
    // …but kept under bio (bio default = "name").
    assert.equal(
      translationsHref({ view: "bio", sort: "kind" }),
      "/admin/translations?sort=kind",
    );
    // no view → default "name" → "name" dropped, others kept.
    assert.equal(translationsHref({ sort: "name" }), "/admin/translations");
    assert.equal(
      translationsHref({ sort: "slug" }),
      "/admin/translations?sort=slug",
    );
    // cms view default = "slug".
    assert.equal(
      translationsHref({ view: "cms", sort: "slug" }),
      "/admin/translations?view=cms",
    );
  });

  it("param insertion order is fixed: view, status, q, sort, dir", () => {
    assert.equal(
      translationsHref({
        view: "taxonomy",
        status: "missing",
        q: "x",
        sort: "slug",
        dir: "desc",
      }),
      "/admin/translations?view=taxonomy&status=missing&q=x&sort=slug&dir=desc",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// *SortHref toggles — direction flip + default-column omission interplay
// ─────────────────────────────────────────────────────────────────────────

describe("bioSortHref / taxonomySortHref / locationSortHref", () => {
  it("same target flips asc→desc→asc; a different target resets to asc", () => {
    assert.equal(
      bioSortHref("code", "code", "asc", "all", ""),
      "/admin/translations?sort=code&dir=desc",
    );
    assert.equal(
      bioSortHref("code", "code", "desc", "all", ""),
      "/admin/translations?sort=code",
    );
    assert.equal(
      bioSortHref("code", "name", "desc", "all", ""),
      "/admin/translations?sort=code",
    );
  });

  it("QUIRK: toggling the view's DEFAULT column hides `sort` but still emits `dir=desc`", () => {
    // bio default = "name": sorting "name" asc→desc drops the sort param
    // (== default) yet keeps dir=desc → URL looks like only a direction.
    assert.equal(
      bioSortHref("name", "name", "asc", "all", ""),
      "/admin/translations?dir=desc",
    );
  });

  it("taxonomy view is always pinned in the URL; default `kind` column omitted", () => {
    assert.equal(
      taxonomySortHref("kind", "kind", "asc", "all", ""),
      "/admin/translations?view=taxonomy&dir=desc",
    );
    assert.equal(
      taxonomySortHref("slug", "kind", "asc", "all", ""),
      "/admin/translations?view=taxonomy&sort=slug",
    );
  });

  it("location view; default `country` column; desc→asc drops dir", () => {
    assert.equal(
      locationSortHref("country", "country", "desc", "all", ""),
      "/admin/translations?view=locations",
    );
    assert.equal(
      locationSortHref("slug", "country", "asc", "needs_attention", " q "),
      "/admin/translations?view=locations&status=needs_attention&q=q&sort=slug",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// parseTranslationsSearchParams — normalization + alias remapping quirks
// ─────────────────────────────────────────────────────────────────────────

describe("parseTranslationsSearchParams", () => {
  it("empty params → all defaults", () => {
    assert.deepEqual(parseTranslationsSearchParams({}), {
      view: "bio",
      bioStatusFilter: "all",
      taxLocStatusFilter: "all",
      q: "",
      bioSort: "name",
      taxonomySort: "kind",
      locationSort: "country",
      sortDir: "asc",
    });
  });

  it("view: a key present in VIEW_TABS is preserved; anything else → `bio`", () => {
    const known = VIEW_TABS[0]?.key;
    assert.ok(known, "registry yields at least one nav tab");
    assert.equal(parseTranslationsSearchParams({ view: known }).view, known);
    assert.equal(
      parseTranslationsSearchParams({ view: "__not_a_view__" }).view,
      "bio",
    );
  });

  it("QUIRK: `status` precedence over `bio` uses ?? — an EMPTY status string still shadows `bio`", () => {
    // sp.bio is consulted only when sp.status is null/undefined.
    assert.equal(
      parseTranslationsSearchParams({ bio: "complete" }).bioStatusFilter,
      "complete",
    );
    // status === "" is not null/undefined, so ?? does NOT fall through to
    // bio; "" → trim "" → || "all".
    assert.equal(
      parseTranslationsSearchParams({ status: "", bio: "complete" })
        .bioStatusFilter,
      "all",
    );
    assert.equal(
      parseTranslationsSearchParams({ status: "   " }).bioStatusFilter,
      "all",
    );
  });

  it("bio alias remaps: reviewed/approved/auto/published/translated → complete", () => {
    for (const s of ["reviewed", "approved", "auto", "published", "translated"]) {
      assert.equal(
        parseTranslationsSearchParams({ status: s }).bioStatusFilter,
        "complete",
        `bio alias for ${s}`,
      );
    }
    assert.equal(
      parseTranslationsSearchParams({ status: "stale" }).bioStatusFilter,
      "needs_attention",
    );
    assert.equal(
      parseTranslationsSearchParams({ status: "language_conflict" })
        .bioStatusFilter,
      "language_issue",
    );
  });

  it("QUIRK: bio and taxLoc DIVERGE on the same input — `reviewed` → complete (bio) but `all` (taxLoc)", () => {
    const r = parseTranslationsSearchParams({ status: "reviewed" });
    assert.equal(r.bioStatusFilter, "complete");
    assert.equal(r.taxLocStatusFilter, "all"); // taxLoc has no reviewed alias
    const r2 = parseTranslationsSearchParams({ status: "published" });
    assert.equal(r2.bioStatusFilter, "complete");
    assert.equal(r2.taxLocStatusFilter, "complete"); // published IS shared
  });

  it("sortDir: only the exact string `desc` yields desc; everything else asc", () => {
    assert.equal(parseTranslationsSearchParams({ dir: "desc" }).sortDir, "desc");
    assert.equal(parseTranslationsSearchParams({ dir: "DESC" }).sortDir, "asc");
    assert.equal(parseTranslationsSearchParams({ dir: "asc" }).sortDir, "asc");
  });

  it("QUIRK: all three sort parsers run on the SAME raw `sort` regardless of view", () => {
    const r = parseTranslationsSearchParams({ sort: "slug" });
    assert.equal(r.bioSort, "name"); // "slug" is not a bio sort key → default
    assert.equal(r.taxonomySort, "slug"); // valid taxonomy key
    assert.equal(r.locationSort, "slug"); // valid location key
    const r2 = parseTranslationsSearchParams({ sort: "es_at" });
    assert.equal(r2.bioSort, "es_at");
    assert.equal(r2.taxonomySort, "kind"); // not a taxonomy key → default
    assert.equal(r2.locationSort, "country"); // not a location key → default
  });

  it("q is trimmed", () => {
    assert.equal(parseTranslationsSearchParams({ q: "  hi  " }).q, "hi");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// parseTranslationsAdminPanel — apanel trim/empty, aid UUID-gated
// ─────────────────────────────────────────────────────────────────────────

describe("parseTranslationsAdminPanel", () => {
  it("empty → { apanel: null, aid: null }", () => {
    assert.deepEqual(parseTranslationsAdminPanel({}), {
      apanel: null,
      aid: null,
    });
  });

  it("apanel is trimmed; whitespace-only → null", () => {
    assert.deepEqual(parseTranslationsAdminPanel({ apanel: "  bio  " }), {
      apanel: "bio",
      aid: null,
    });
    assert.equal(parseTranslationsAdminPanel({ apanel: "   " }).apanel, null);
  });

  it("aid must be a valid UUID (read path validates); junk → null", () => {
    assert.equal(parseTranslationsAdminPanel({ aid: UUID }).aid, UUID);
    assert.equal(
      parseTranslationsAdminPanel({ aid: "not-a-uuid" }).aid,
      null,
    );
    // surrounding whitespace tolerated (trimmed before the regex)
    assert.equal(
      parseTranslationsAdminPanel({ aid: `  ${UUID}  ` }).aid,
      UUID,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// *EditorHref — open a drawer; aid is NOT validated on the WRITE path
// ─────────────────────────────────────────────────────────────────────────

describe("translations*EditorHref", () => {
  const noFilters = { status: "all" as const, q: "", dir: "asc" as const };

  it("bio editor: clean filters → just the panel keys", () => {
    assert.equal(
      translationsBioEditorHref({ ...noFilters, sort: "name" }, UUID),
      `/admin/translations?apanel=bio&aid=${UUID}`,
    );
  });

  it("bio editor: non-default filters precede the appended panel keys", () => {
    assert.equal(
      translationsBioEditorHref(
        { status: "missing", q: " x ", sort: "code", dir: "desc" },
        "t1",
      ),
      "/admin/translations?status=missing&q=x&sort=code&dir=desc&apanel=bio&aid=t1",
    );
  });

  it("QUIRK: the WRITE path does NOT UUID-validate aid — any non-empty id is accepted", () => {
    // Contrast parseTranslationsAdminPanel, which rejects non-UUID aids.
    assert.equal(
      translationsBioEditorHref({ ...noFilters, sort: "name" }, "plainstring"),
      "/admin/translations?apanel=bio&aid=plainstring",
    );
  });

  it("QUIRK: an EMPTY id silently drops the whole panel (merge needs apanel AND aid truthy)", () => {
    assert.equal(
      translationsBioEditorHref({ ...noFilters, sort: "name" }, ""),
      "/admin/translations",
    );
    assert.equal(
      translationsBioEditorHref(
        { status: "missing", q: "", sort: "name", dir: "asc" },
        "",
      ),
      "/admin/translations?status=missing",
    );
  });

  it("taxonomy editor pins view=taxonomy; default sort `kind` omitted", () => {
    assert.equal(
      translationsTaxonomyEditorHref(
        { status: "all", q: "", sort: "kind", dir: "asc" },
        UUID,
      ),
      `/admin/translations?view=taxonomy&apanel=taxonomy_term&aid=${UUID}`,
    );
    assert.equal(
      translationsTaxonomyEditorHref(
        { status: "all", q: "", sort: "slug", dir: "asc" },
        UUID,
      ),
      `/admin/translations?view=taxonomy&sort=slug&apanel=taxonomy_term&aid=${UUID}`,
    );
  });

  it("location editor pins view=locations; default sort `country` omitted", () => {
    assert.equal(
      translationsLocationEditorHref(
        { status: "all", q: "", sort: "country", dir: "asc" },
        UUID,
      ),
      `/admin/translations?view=locations&apanel=location&aid=${UUID}`,
    );
  });
});
