/**
 * WS-A A5 + A6 — header-widget embeds, responsive/visibility round-trip, and the
 * nav mobile-menu variant.
 *
 * A5: the 4 curated header-widget presets (`header_search` / `header_account` /
 *     `header_inquiry` / `header_favorites`) are registered, resolve to a known
 *     curated section key, and their schema parses an empty config. The
 *     editor-placeholder-vs-published switch is the established `preview` prop:
 *     each header section renders a static placeholder when `preview` is true
 *     (the in-editor canvas — see SectionEmbedRenderContext.editorMode) and the
 *     live widget when false (the published shell). We assert the shared
 *     placeholder helper renders the side-effect-free chip with the right marker
 *     (the Components themselves pull the full app/CSS graph, which `tsx --test`
 *     can't load — they're covered by tsc + the renderer plumbing).
 *
 * A6: a node's `style.responsive` + `visibilityCondition` survive validate for
 *     the new shell kinds (`nav`, `social_links`, `section_embed`); the nav
 *     `mobileMenuVariant` validates (valid kept, invalid stripped).
 *
 * Runner: node:test via `tsx --test`. No DOM — returned React element props are
 * inspected directly.
 */
import assert from "node:assert/strict";
import { isValidElement, type ReactElement } from "react";
import { test } from "node:test";

import {
  SECTION_EMBED_PRESETS,
  getSectionEmbedPreset,
  createBuilderSectionEmbed,
} from "./section-embed-presets";
import { validateBuilderNodeTree } from "./validate";
import {
  headerWidgetSchemaV1,
  HeaderWidgetGlyph,
  HeaderWidgetPlaceholder,
} from "@/lib/site-admin/sections/shared/header-widget";
// Import each section's meta directly (zero-runtime; avoids pulling the full
// SECTION_REGISTRY — and the app/CSS graph — which `tsx --test` cannot load).
import { headerSearchMeta } from "@/lib/site-admin/sections/header_search/meta";
import { headerAccountMeta } from "@/lib/site-admin/sections/header_account/meta";
import { headerInquiryMeta } from "@/lib/site-admin/sections/header_inquiry/meta";
import { headerFavoritesMeta } from "@/lib/site-admin/sections/header_favorites/meta";

const HEADER_WIDGET_METAS = {
  header_search: headerSearchMeta,
  header_account: headerAccountMeta,
  header_inquiry: headerInquiryMeta,
  header_favorites: headerFavoritesMeta,
} as const;

const HEADER_WIDGET_PRESETS = [
  { id: "header-search", key: "header_search" },
  { id: "header-account", key: "header_account" },
  { id: "header-inquiry", key: "header_inquiry" },
  { id: "header-favorites", key: "header_favorites" },
] as const;

// ── A5 · presets registered + resolve to a curated section key ───────────────

test("the 4 header-widget presets are registered with their section keys", () => {
  for (const { id, key } of HEADER_WIDGET_PRESETS) {
    const preset = getSectionEmbedPreset(id);
    assert.ok(preset, `preset "${id}" should be registered`);
    assert.equal(preset.sectionTypeKey, key);
    assert.ok(preset.label.trim().length > 0);
    assert.ok(preset.description.trim().length > 0);
  }
});

test("each header-widget preset key has a registered shell-only curated section", () => {
  for (const { key } of HEADER_WIDGET_PRESETS) {
    const meta = HEADER_WIDGET_METAS[key as keyof typeof HEADER_WIDGET_METAS];
    assert.ok(meta, `"${key}" should have a section meta`);
    assert.equal(meta.key, key);
    // Shell-only: kept OUT of the agency page section picker; surfaced ONLY as a
    // header-widget embed preset in the shell gallery.
    assert.equal(meta.visibleToAgency, false, `"${key}" must be shell-only`);
  }
});

test("the async (server-data-loader) header widgets are tagged hasLiveData", () => {
  assert.equal(headerAccountMeta.hasLiveData, true);
  assert.equal(headerInquiryMeta.hasLiveData, true);
  // Search and Favorites used to be sync (pure render) and were asserted here
  // as NOT live-data. #1197 made them async: both now resolve the tenant's
  // locale URL grammar per request (`getRequestLocaleUrlSettings`) so their
  // hrefs follow the tenant's default locale instead of the global fallback.
  //
  // That makes `hasLiveData: true` the CORRECT tag for them, and it is required
  // by `sections/section-meta-live-data.test.ts`, which asserts every
  // async-Component section is tagged. The two guards previously disagreed:
  // satisfying that one reddened this one. Keep them reconciled — if a header
  // widget stops loading request data, untag it in BOTH places.
  //
  // Cost of the tag, so it is a deliberate trade and not a silent one: a tagged
  // widget skips the curated-edit path, so an in-editor prop change on these
  // two now costs a router refresh.
  assert.equal(headerSearchMeta.hasLiveData, true);
  assert.equal(headerFavoritesMeta.hasLiveData, true);
});

test("createBuilderSectionEmbed builds a valid node for each header widget", () => {
  for (const { key } of HEADER_WIDGET_PRESETS) {
    const node = createBuilderSectionEmbed(key);
    assert.equal(node.kind, "section_embed");
    assert.ok(node.kind === "section_embed" && node.props.sectionTypeKey === key);
  }
});

test("header-widget preset ids are unique and present in SECTION_EMBED_PRESETS", () => {
  const ids = new Set(SECTION_EMBED_PRESETS.map((p) => p.id));
  for (const { id } of HEADER_WIDGET_PRESETS) {
    assert.ok(ids.has(id), `SECTION_EMBED_PRESETS should contain "${id}"`);
  }
});

test("headerWidgetSchemaV1 parses an empty config (widget owns its own data)", () => {
  const parsed = headerWidgetSchemaV1.safeParse({});
  assert.ok(parsed.success, "empty header-widget config must be schema-valid");
});

// ── A5 · editor placeholder chip (the side-effect-free editor render) ────────

/** Issues string from a validation result (empty when it passed). */
function issuesText(
  result: ReturnType<typeof validateBuilderNodeTree>,
): string {
  return result.ok ? "" : JSON.stringify(result.issues);
}

/** Read a top-level prop off a returned React element. */
function elProps(element: unknown): Record<string, unknown> {
  assert.ok(isValidElement(element), "expected a React element");
  return (element as ReactElement<Record<string, unknown>>).props;
}

test("HeaderWidgetPlaceholder renders a labeled, marked, side-effect-free chip", () => {
  const el = HeaderWidgetPlaceholder({
    typeKey: "header_search",
    label: "Search",
    glyph: HeaderWidgetGlyph({ children: null }),
  });
  const props = elProps(el);
  // It is a plain <span> (no client island / no link), tagged as the placeholder
  // so the canvas renders the chip rather than mounting the live widget.
  assert.equal(props["data-header-widget"], "header_search");
  assert.equal(props["data-header-widget-mode"], "placeholder");
  // The label text is present among the children.
  const children = props.children;
  assert.ok(
    Array.isArray(children)
      ? children.includes("Search")
      : children === "Search",
    "placeholder should render its label",
  );
});

test("HeaderWidgetGlyph wraps its children in an aria-hidden <svg>", () => {
  const el = HeaderWidgetGlyph({ children: null });
  const props = elProps(el);
  assert.equal(props["aria-hidden"], true);
});

// ── A6 · responsive + visibilityCondition round-trip for the new kinds ───────

test("section_embed round-trips style.responsive (hide on mobile) + visibilityCondition", () => {
  const tree = [
    {
      id: "emb-1",
      kind: "section_embed",
      visibilityCondition: { auth: "signed_in" },
      props: {
        sectionTypeKey: "header_search",
        config: {},
        style: { responsive: { mobile: { visibility: "hidden" } } },
      },
    },
  ];
  const result = validateBuilderNodeTree(tree);
  assert.ok(result.ok, `validate should pass: ${issuesText(result)}`);
  const node = result.tree[0];
  assert.equal(node.kind, "section_embed");
  const props = node.props as {
    style?: { responsive?: { mobile?: { visibility?: string } } };
  };
  assert.equal(props.style?.responsive?.mobile?.visibility, "hidden");
  assert.deepEqual(node.visibilityCondition, { auth: "signed_in" });
});

test("nav + social_links round-trip style.responsive (hide on tablet)", () => {
  const tree = [
    {
      id: "wrap",
      kind: "container",
      props: { layout: "row" },
      children: [
        {
          id: "nav-1",
          kind: "nav",
          props: {
            links: [{ id: "l1", label: "Home", href: "/" }],
            style: { responsive: { tablet: { visibility: "hidden" } } },
          },
        },
        {
          id: "soc-1",
          kind: "social_links",
          props: {
            links: [{ id: "s1", platform: "instagram", href: "https://instagram.com/x" }],
            style: { responsive: { mobile: { visibility: "hidden" } } },
          },
        },
      ],
    },
  ];
  const result = validateBuilderNodeTree(tree);
  assert.ok(result.ok, `validate should pass: ${issuesText(result)}`);
  const container = result.tree[0];
  assert.ok(container.kind === "container");
  const [nav, social] = container.children;
  const navStyle = (nav.props as { style?: { responsive?: { tablet?: { visibility?: string } } } }).style;
  const socStyle = (social.props as { style?: { responsive?: { mobile?: { visibility?: string } } } }).style;
  assert.equal(navStyle?.responsive?.tablet?.visibility, "hidden");
  assert.equal(socStyle?.responsive?.mobile?.visibility, "hidden");
});

// ── A6 · nav mobileMenuVariant validation ────────────────────────────────────

function validateNav(mobileMenuVariant: unknown) {
  return validateBuilderNodeTree([
    {
      id: "c",
      kind: "container",
      props: { layout: "row" },
      children: [
        {
          id: "n",
          kind: "nav",
          props: {
            links: [{ id: "l1", label: "Home", href: "/" }],
            mobileMenuVariant,
          },
        },
      ],
    },
  ]);
}

test("nav mobileMenuVariant accepts each valid variant", () => {
  for (const variant of ["dropdown", "drawer-right", "sheet-bottom", "full-screen-fade"]) {
    const result = validateNav(variant);
    assert.ok(result.ok, `variant "${variant}" should validate`);
    const nav = (result.tree[0] as { children: { props: { mobileMenuVariant?: string } }[] })
      .children[0];
    assert.equal(nav.props.mobileMenuVariant, variant);
  }
});

test("nav mobileMenuVariant strips an invalid value (and the rest validates)", () => {
  const result = validateNav("carousel-slide");
  // Invalid enum → the optional prop is rejected; validate surfaces the issue
  // rather than persisting a bad value.
  assert.equal(result.ok, false);
});

test("nav with NO mobileMenuVariant validates (back-compat default)", () => {
  const result = validateNav(undefined);
  assert.ok(result.ok, "absent mobileMenuVariant must stay valid");
  const nav = (result.tree[0] as { children: { props: { mobileMenuVariant?: string } }[] })
    .children[0];
  assert.equal(nav.props.mobileMenuVariant, undefined);
});
