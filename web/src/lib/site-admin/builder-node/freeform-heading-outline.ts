/**
 * A11y lint for freeform full-page designs (the builder-node tree).
 *
 * Curated CMS pages use composition slots (`flat` in the navigator). Freeform
 * one-click designs (e.g. Impronta homepage, the /t/[code] default profile
 * tree, talent_pages, freeform cms_pages) have no slots — headings live on
 * `section_embed` config and standalone `heading` blocks in `builderTree`,
 * and images live on `image` blocks (and inside container/card/cta_group
 * subtrees). This module is the ONE shared builder-tree walker that powers
 * the navigator Outline AND the edit-point a11y badges.
 *
 * A11Y-3 (Builder Ecosystem 2026):
 *   - `buildHeadingOutlineFromBuilderTree` — document-order heading outline
 *     (unchanged signature; consumed by the navigator Outline mode).
 *   - `lintBuilderTreeA11y` — pure linter returning structured findings for
 *     both heading-outline skips (missing_h1 / multiple_h1 / skipped_level /
 *     h2_before_h1, reusing the shared `lintHeadingOutline`) AND images
 *     missing alt text. Surfaced advisory-only at the edit point (navigator
 *     badges); it NEVER blocks save.
 *
 * Lives in the shared builder-node layer so every freeform surface (Builder
 * Lab playground, admin storefront freeform cms_page, /t/[code] profile,
 * talent_pages) inherits the same lint with zero surface-specific code.
 */

import {
  headingNodeFromSectionType,
  lintHeadingOutline,
  type HeadingLintIssue,
  type HeadingNode,
} from "@/lib/site-admin/a11y/heading-hierarchy";

import {
  resolveInstanceChildren,
  type ComponentDefinitions,
} from "./component-instances";

import type { BuilderNode, BuilderNodeTree } from "./types";

/** A11y finding for one image node missing alt text. */
export interface MissingAltFinding {
  /** Builder node id of the offending image — used for click-to-focus. */
  nodeId: string;
  /** Friendly label for the image (layer label, else a generic phrase). */
  label: string;
  severity: "warn";
}

/** Combined builder-tree a11y findings, surfaced at the edit point. */
export interface BuilderTreeA11yReport {
  headingIssues: HeadingLintIssue[];
  missingAlt: MissingAltFinding[];
}

/**
 * Walk every node in the tree (incl. children of any container-like kind).
 *
 * A11Y-3 — living-component INSTANCES: an instance root (`props.instanceOf`)
 * stores a snapshot of its master children, but the LIVE render path resolves
 * the master subtree fresh and layers per-instance overrides on top
 * (`resolveInstanceChildren` → swapped `imageSrc`/`imageAlt`, overridden heading
 * `text`, …). Walking only the STORED children therefore lints stale content —
 * it misses an override that swapped an image to one with no alt, and over-reports
 * a master image whose instance override supplied the alt.
 *
 * When component definitions are supplied we descend the RESOLVED instance
 * children instead — the exact idiom `render.tsx`/`renderer-css-scope.ts` use.
 * When they aren't (the default — the navigator may not have the library loaded),
 * we fall back to the stored children, so the lint can never crash on a
 * missing/unloaded component (same graceful-fallback contract as the renderer).
 */
function visitTree(
  tree: BuilderNodeTree,
  visit: (node: BuilderNode) => void,
  components?: ComponentDefinitions,
) {
  const walk = (node: BuilderNode) => {
    visit(node);
    // Living-component instance — prefer the resolved master subtree (with
    // overrides applied) when its definition is available; else fall through to
    // the stored children below (graceful fallback, matching the renderer).
    if (components && node.kind === "container" && node.props.instanceOf) {
      const resolved = resolveInstanceChildren(node, components);
      if (resolved) {
        for (const child of resolved) walk(child);
        return;
      }
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
  };
  for (const root of tree) walk(root);
}

/**
 * Build a document-order heading outline from a freeform builder tree.
 *
 * Heading levels come from `heading` blocks (props.level), from `section_embed`
 * blocks (mapped via the shared HEADING_MAP), and from the two native data
 * blocks, which render a real `<h1>` / `<h2>` from their own `headline` prop.
 * Signature preserved for the navigator Outline consumer.
 */
export function buildHeadingOutlineFromBuilderTree(
  tree: BuilderNodeTree,
  components?: ComponentDefinitions,
): HeadingNode[] {
  const out: HeadingNode[] = [];

  visitTree(tree, (node) => {
    if (node.kind === "section_embed") {
      const config = (node.props.config ?? {}) as Record<string, unknown>;
      const heading = headingNodeFromSectionType(
        node.props.sectionTypeKey,
        config,
        node.id,
      );
      if (heading) out.push(heading);
    } else if (node.kind === "hero_search") {
      // WS7 Phase 0 — the native search hero renders its headline as the page
      // `<h1>` (see render.tsx). Without this the outline reported missing_h1
      // for every page whose hero IS the search hero, and the a11y lint (and
      // the AI eval scorecard that consumes it) graded the correct shape as
      // broken. `talent_type_grid` renders an `<h2>` the same way.
      const text = node.props.headline?.trim();
      if (text) {
        out.push({ level: 1, text, sectionId: node.id, sectionTypeKey: "hero_search" });
      }
    } else if (node.kind === "talent_type_grid") {
      const text = node.props.headline?.trim();
      if (text) {
        out.push({ level: 2, text, sectionId: node.id, sectionTypeKey: "talent_type_grid" });
      }
    } else if (node.kind === "heading") {
      const text = node.props.text.trim();
      if (text) {
        out.push({
          level: node.props.level,
          text,
          sectionId: node.id,
          sectionTypeKey: "heading",
        });
      }
    }
  }, components);

  return out;
}

/** Collect image nodes whose alt text is empty/absent. */
function collectMissingAlt(
  tree: BuilderNodeTree,
  components?: ComponentDefinitions,
): MissingAltFinding[] {
  const out: MissingAltFinding[] = [];
  visitTree(tree, (node) => {
    if (node.kind !== "image") return;
    // An image bound to a dynamic field (fieldBindings.alt) gets its alt at
    // render time from the resolved field — don't flag those.
    if (node.props.fieldBindings?.alt) return;
    const src = typeof node.props.src === "string" ? node.props.src.trim() : "";
    // Only flag images that actually show something. A placeholder with no
    // src is not a screen-reader problem yet.
    if (!src) return;
    const alt = typeof node.props.alt === "string" ? node.props.alt.trim() : "";
    if (alt) return;
    out.push({
      nodeId: node.id,
      label: node.props.layerLabel?.trim() || "Image",
      severity: "warn",
    });
  }, components);
  return out;
}

/**
 * Lint a freeform builder tree for heading-outline + missing-alt issues.
 * Pure: takes the tree, returns structured findings. Advisory only — the
 * caller surfaces these as non-blocking badges and never gates save on them.
 *
 * A11Y-3 — pass `components` (the saved component-definition library) to lint the
 * LIVE-resolved children of living-component instances (overrides applied) rather
 * than their stored master snapshot. Omitting it preserves the prior behaviour
 * exactly (instances are walked via their stored children).
 */
export function lintBuilderTreeA11y(
  tree: BuilderNodeTree,
  components?: ComponentDefinitions,
): BuilderTreeA11yReport {
  const outline = buildHeadingOutlineFromBuilderTree(tree, components);
  return {
    headingIssues: lintHeadingOutline(outline),
    missingAlt: collectMissingAlt(tree, components),
  };
}
