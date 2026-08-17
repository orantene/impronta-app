/**
 * Inspector Reset D4 — the group recipes, pinned.
 *
 * These are the claims the PR makes about what an operator sees. They are
 * cheap to state and expensive to notice breaking by eye, which is exactly the
 * shape of thing that decays: a kind quietly gaining a fifth group, Advanced
 * quietly defaulting to open, or a field's search term getting lost when its
 * group is re-composed.
 *
 * The search-coverage suite is the one that matters most. D5's whole promise
 * is "typing 'shadow' shows shadow", and the D4 regroup MOVED fields between
 * groups — shadow left Effects for Appearance, visibility and custom CSS came
 * in from no group at all. If a term is dropped in that move the field becomes
 * unreachable by search while still rendering, which no screenshot reveals.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { ES_TEXT } from "../../editor-i18n-es";
import {
  STYLE_GROUP_ORDER,
  STYLE_GROUP_SEARCH_TERMS,
  STYLE_GROUP_TITLES,
  firstOpenStyleGroup,
  hasStyleGroup,
  layoutGroupOwnsAlign,
  styleGroupsForKind,
  type StyleGroupId,
} from "./group-recipes";
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node";

/** Every kind the Style panel can be opened on (i.e. everything but section). */
const KINDS: readonly BuilderNodeKind[] = [
  "container",
  "split",
  "accordion",
  "accordion_item",
  "tabs",
  "tab_panel",
  "carousel",
  "masonry",
  "heading",
  "paragraph",
  "button",
  "image",
  "video",
  "embed",
  "social_post",
  "social_feed",
  "icon",
  "pricing_table",
  "rich_text",
  "code",
  "divider",
  "spacer",
  "card",
  "cta_group",
  "nav",
  "social_links",
  "form",
  "section_embed",
];

// ── The shape D4 asks for ────────────────────────────────────────────────────

test("no kind renders more than four groups, and none renders fewer than two", () => {
  for (const kind of KINDS) {
    const groups = styleGroupsForKind(kind);
    assert.ok(
      groups.length >= 2 && groups.length <= 4,
      `${kind} renders ${groups.length} groups; D4 allows 2-3 meaningful groups plus one Advanced`,
    );
  }
});

test("every kind ends at exactly one Advanced, and it is last", () => {
  for (const kind of KINDS) {
    const groups = styleGroupsForKind(kind);
    assert.equal(
      groups.filter((g) => g === "advanced").length,
      1,
      `${kind} must have exactly one Advanced group`,
    );
    assert.equal(
      groups.at(-1),
      "advanced",
      `${kind}'s Advanced group must be last`,
    );
  }
});

test("groups always render in STYLE_GROUP_ORDER", () => {
  for (const kind of KINDS) {
    const groups = styleGroupsForKind(kind);
    const expected = STYLE_GROUP_ORDER.filter((g) => groups.includes(g));
    assert.deepEqual(groups, expected, `${kind} renders groups out of order`);
  }
});

test("no duplicate groups", () => {
  for (const kind of KINDS) {
    const groups = styleGroupsForKind(kind);
    assert.equal(new Set(groups).size, groups.length, `${kind} repeats a group`);
  }
});

// ── The specific cases the approved mockup names ─────────────────────────────

test("mockup A: a container gets exactly Layout & spacing, Appearance, Advanced", () => {
  assert.deepEqual(styleGroupsForKind("container"), [
    "layout",
    "appearance",
    "advanced",
  ]);
});

test("annotation D: no 'Typography' group holding a lone Align control", () => {
  // The kinds whose Typography group contained nothing but Align. Each must
  // now have NO text group — and must have Align re-homed into Layout.
  for (const kind of ["container", "split", "card", "cta_group", "masonry", "carousel"] as const) {
    assert.equal(hasStyleGroup(kind, "text"), false, `${kind} still gets a Text group`);
    assert.equal(
      layoutGroupOwnsAlign(kind),
      true,
      `${kind} lost its Align control instead of re-homing it`,
    );
  }
});

test("annotation D: no empty Appearance on a divider or a spacer", () => {
  assert.equal(hasStyleGroup("divider", "appearance"), false);
  assert.equal(hasStyleGroup("spacer", "appearance"), false);
});

test("Align is owned by exactly one group per kind", () => {
  for (const kind of KINDS) {
    const inText = hasStyleGroup(kind, "text");
    const inLayout = layoutGroupOwnsAlign(kind);
    assert.notEqual(
      inText,
      inLayout,
      `${kind} would render Align ${inText && inLayout ? "twice" : "never"}`,
    );
  }
});

// ── First-open behaviour ─────────────────────────────────────────────────────

test("the first-open group is one this kind actually renders, and is never Advanced", () => {
  for (const kind of KINDS) {
    const open = firstOpenStyleGroup(kind);
    assert.notEqual(
      open,
      "advanced",
      `${kind} would open Advanced by default, restoring the wall of spec-named fields`,
    );
    assert.ok(
      styleGroupsForKind(kind).includes(open),
      `${kind} would open ${open}, a group it does not render`,
    );
  }
});

test("the first-open group is the FIRST group this kind renders", () => {
  for (const kind of KINDS) {
    assert.equal(
      firstOpenStyleGroup(kind),
      styleGroupsForKind(kind)[0],
      `${kind} opens a group that is not the first one on screen`,
    );
  }
});

// ── D5: search still reaches every field after the regroup ───────────────────

/**
 * The terms the SIX pre-D4 groups registered, verbatim from their
 * `searchTerms` props at origin/main 269e36b50. Nothing here may be lost in
 * the regroup: every one must still be findable somewhere in the new stack,
 * or a field that renders became unreachable by search.
 */
const PRE_D4_SEARCH_TERMS: readonly string[] = [
  // Typography
  "font", "text size", "weight", "bold", "line height", "letter spacing",
  "align", "transform", "uppercase", "text wrap", "whitespace", "truncate",
  "decoration", "tone",
  // Dimensions
  "width", "max width", "min width", "height", "max height", "min height",
  "exact size",
  // Appearance
  "background", "fill", "color", "text color", "border", "corners", "radius",
  "rounded",
  // Spacing
  "margin", "padding", "gap", "box model", "inset",
  // Position & layout
  "position", "sticky", "z-index", "stacking", "layout", "flex", "justify",
  "order", "overflow",
  // Effects & motion
  "shadow", "opacity", "blur", "backdrop", "blend", "filter", "hover", "focus",
  "active", "states", "transition", "animation", "entrance", "scroll", "scale",
  "rotate", "clip", "mask", "outline", "cursor",
];

function allTermsFor(kind: BuilderNodeKind): string[] {
  return styleGroupsForKind(kind).flatMap(
    (g) => STYLE_GROUP_SEARCH_TERMS[g] as string[],
  );
}

test("D5: no pre-D4 search term was dropped by the regroup", () => {
  // Measured against a `container`-shaped selection widened to every group,
  // since a term only needs a home, not a home on every kind.
  const everyTerm = new Set(
    (STYLE_GROUP_ORDER as readonly StyleGroupId[]).flatMap(
      (g) => STYLE_GROUP_SEARCH_TERMS[g] as string[],
    ),
  );
  const registered = [...everyTerm];
  const missing = PRE_D4_SEARCH_TERMS.filter(
    // Covered exactly, or covered because a registered term CONTAINS it — the
    // filter is a case-insensitive substring match on the registered term, so
    // registering "scroll snap" also answers a search for "scroll".
    (term) => !registered.some((t) => t.includes(term)),
  );
  assert.deepEqual(
    missing,
    [],
    `search terms lost in the D4 regroup: ${missing.join(", ")}`,
  );
});

test("D5: the loose blocks folded into Advanced are now searchable at all", () => {
  // Visibility and Custom CSS rendered OUTSIDE every group before D4, so the
  // filter could never match them. This is new coverage, not preserved
  // coverage — hence its own assertion.
  for (const term of ["visibility", "hide", "custom css", "css"]) {
    assert.ok(
      (STYLE_GROUP_SEARCH_TERMS.advanced as string[]).includes(term),
      `"${term}" must be registered by the Advanced group`,
    );
  }
});

test("D5: shadow is searchable on every kind that can paint one", () => {
  // The audit's headline failure. Shadow moved from Effects to Appearance;
  // this pins that the move did not strand it.
  for (const kind of ["container", "card", "button", "image", "heading"] as const) {
    assert.ok(
      allTermsFor(kind).includes("shadow"),
      `"shadow" is unreachable by search on a ${kind}`,
    );
  }
});

test("every group registers at least one search term", () => {
  for (const group of STYLE_GROUP_ORDER) {
    assert.ok(
      (STYLE_GROUP_SEARCH_TERMS[group] as string[]).length > 0,
      `${group} registers no search terms, so nothing in it is findable`,
    );
  }
});

// ── Spanish ──────────────────────────────────────────────────────────────────

test("every group title has a Spanish entry", () => {
  // The regex parity guard cannot see these: they reach InspectorGroup as
  // `title={STYLE_GROUP_TITLES.layout}`, an expression rather than a literal.
  for (const group of STYLE_GROUP_ORDER) {
    const title = STYLE_GROUP_TITLES[group];
    assert.ok(
      ES_TEXT[title],
      `group title "${title}" has no Spanish entry; it would render in English`,
    );
  }
});
