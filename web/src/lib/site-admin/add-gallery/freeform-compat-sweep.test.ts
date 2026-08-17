import assert from "node:assert/strict";
import test from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { builderNodeKindAllowedAtRoot } from "@/lib/site-admin/builder-node/drop-policy";
import { makeId } from "@/lib/site-admin/builder-node/make-id";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import { createBuilderSectionEmbed } from "@/lib/site-admin/builder-node/section-embed-presets";
import { renderSectionEmbed } from "@/lib/site-admin/builder-node/section-embed-renderer";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";

import { FREEFORM_INCOMPATIBLE } from "./freeform-compat";
import { governSectionEmbedNode } from "./kind-governance";
import { resolveAddGalleryInsertAction } from "./insert";
import { isAddGalleryItemAvailable } from "./registry";
import { ADD_GALLERY_AVAILABLE_ITEMS } from "./registry-catalog";
import type { AddGalleryItem } from "./types";

/**
 * freeform-compat-sweep.test.ts — W3 (all-freeform rebuild).
 *
 * For every gallery item an operator can actually insert today, resolve the
 * REAL insert payload the live gallery would produce (`resolveAddGalleryInsertAction`
 * — the same function `performAddGalleryInsert` calls; for the `sectionEmbed`/
 * `connectedNode` family that means the same `createBuilderSectionEmbed` +
 * `governSectionEmbedNode` pair `insertBuilderSectionEmbed` calls in
 * edit-context.tsx), then check it actually WORKS on a freeform page:
 *
 *   (a) the resulting tree passes `validateBuilderNodeTree` (the same check
 *       publish preflight runs), and
 *   (b) it renders without throwing through `renderBuilderNodes` (the same
 *       function the canvas + storefront call) — a smoke render, and
 *   (c) for a `section_embed` node specifically, its config isn't so empty /
 *       invalid that the curated renderer degrades to a "finish configuring"
 *       placeholder instead of real content (section-embed-renderer.tsx).
 *
 * Explicitly excluded (per the audit brief):
 *   - the 6 `registry-roadmap.ts` items — `insertMethod: "disabledComingSoon"`,
 *     already flagged with a "Soon" badge, never actually insert anything.
 *   - 2 more items embedded inline in registry-catalog-elements.ts that ALSO
 *     use the `roadmap()` helper (el-inquiry-button, el-gallery) — same
 *     "Soon"-badged, non-available, redirect-to-another-card placeholders.
 *   - DB-backed `dbTemplate` / `page_templates` items — resolved from Supabase
 *     at runtime, not present in the static code catalogs this sweep reads,
 *     and unavailable offline. (None of the 3 static catalog files define any
 *     `insertMethod: "dbTemplate"` item today — confirmed by inspection.)
 *   - the "Recommended" category — `registry.ts` aliases a handful of section
 *     items under `rec:`-prefixed ids for the recommended rail; testing the
 *     underlying (non-aliased) item once is sufficient.
 *
 * This is a REGRESSION + STALENESS gate, not a one-shot report: it asserts
 * the sweep's failing-item set is EXACTLY `Object.keys(FREEFORM_INCOMPATIBLE)`
 * — no more (a newly-broken card must be flagged in freeform-compat.ts before
 * this goes green again) and no less (a fixed card must be removed from the
 * map, or this fails as a stale flag).
 */

interface SweepFailure {
  id: string;
  tab: string;
  reason: string;
}

/**
 * Wrap a resolved insert node the way it would realistically land: directly
 * at the page root when its kind is root-allowed (mirrors dropping a
 * top-level block straight onto the page), otherwise inside a freeform
 * `container` (mirrors dropping a leaf element into an existing layout shell
 * — the only way most element-tab items land in practice).
 */
function wrapForValidation(node: BuilderNode): BuilderNode[] {
  if (builderNodeKindAllowedAtRoot(node.kind)) return [node];
  return [
    {
      id: makeId("container"),
      kind: "container",
      props: { layout: "stack" },
      children: [node],
    } as BuilderNode,
  ];
}

/** Resolve the exact node a gallery item would insert, via the real code path. */
function resolveInsertNode(item: AddGalleryItem): BuilderNode | null {
  const action = resolveAddGalleryInsertAction(item);
  switch (action.type) {
    case "nativeNode":
    case "sectionTemplate":
    case "dbTemplate":
      return action.node;
    case "sectionEmbed":
    case "connectedNode":
      // Byte-identical to what `insertBuilderSectionEmbed` (edit-context.tsx)
      // builds: the raw embed node, governed against the full catalog.
      return governSectionEmbedNode(
        createBuilderSectionEmbed(action.sectionTypeKey),
        action.sectionTypeKey,
        ADD_GALLERY_AVAILABLE_ITEMS,
      );
    case "noop":
      return null;
    default:
      return null;
  }
}

/**
 * For a `section_embed` node, resolve the SAME reason the live renderer
 * would show a placeholder for, WITHOUT invoking the curated section's own
 * (often server/data-fetching) `Component` — JSX element creation doesn't
 * execute a function component, so reading `.props.reason` off the returned
 * element is enough to see which branch `renderSectionEmbed` took.
 */
function sectionEmbedPlaceholderReason(node: BuilderNode): string | undefined {
  if (node.kind !== "section_embed") return undefined;
  const element = renderSectionEmbed(node as never, {
    tenantId: "sweep-tenant",
    locale: "en",
    editorMode: true,
  }) as unknown as { props?: { reason?: string } } | null;
  return element?.props?.reason;
}

function runSweep(): SweepFailure[] {
  const failures: SweepFailure[] = [];
  const testedItems = ADD_GALLERY_AVAILABLE_ITEMS.filter(isAddGalleryItemAvailable);

  for (const item of testedItems) {
    let node: BuilderNode | null;
    try {
      node = resolveInsertNode(item);
    } catch (err) {
      failures.push({
        id: item.id,
        tab: item.tab,
        reason: `resolveAddGalleryInsertAction threw: ${(err as Error).message}`,
      });
      continue;
    }
    if (!node) {
      failures.push({ id: item.id, tab: item.tab, reason: "resolved to no insertable node" });
      continue;
    }

    // (a) tree validation.
    const tree = wrapForValidation(node);
    const validation = validateBuilderNodeTree(tree);
    if (!validation.ok) {
      failures.push({
        id: item.id,
        tab: item.tab,
        reason: `fails validateBuilderNodeTree: ${validation.issues
          .map((issue) => issue.message)
          .join("; ")}`,
      });
      continue;
    }

    // (b) smoke render — no section_embed renderer injected, matching the
    // many existing render.test.ts cases that render plain trees; a
    // section_embed node renders null in that mode (never throws).
    try {
      renderToStaticMarkup(
        createElement(
          Fragment,
          null,
          renderBuilderNodes(tree, { publicPathPrefix: "/impronta" }),
        ),
      );
    } catch (err) {
      failures.push({
        id: item.id,
        tab: item.tab,
        reason: `renderBuilderNodes threw: ${(err as Error).message}`,
      });
      continue;
    }

    // (c) empty/invalid section_embed config → "finish configuring" placeholder.
    const reason = sectionEmbedPlaceholderReason(node);
    if (reason === "invalid_config") {
      failures.push({
        id: item.id,
        tab: item.tab,
        reason:
          "section_embed config fails its section schema — lands as a \"finish configuring\" placeholder instead of content",
      });
    } else if (reason === "unknown") {
      failures.push({
        id: item.id,
        tab: item.tab,
        reason: "section_embed targets an unregistered sectionTypeKey",
      });
    }
    // reason === "no_context" cannot happen here — a non-null context is
    // always supplied above — and reason === undefined means a live render.
  }

  return failures;
}

test("add gallery freeform-compat sweep matches FREEFORM_INCOMPATIBLE exactly", () => {
  const failures = runSweep();
  const failureById = new Map(failures.map((f) => [f.id, f] as const));
  const flaggedIds = new Set(Object.keys(FREEFORM_INCOMPATIBLE));

  const unflagged = failures.filter((f) => !flaggedIds.has(f.id));
  const stale = [...flaggedIds].filter((id) => !failureById.has(id));

  assert.deepEqual(
    unflagged,
    [],
    unflagged.length > 0
      ? `New freeform-incompatible gallery item(s) found that are NOT yet flagged in freeform-compat.ts:\n${unflagged
          .map((f) => `  - [${f.tab}] ${f.id}: ${f.reason}`)
          .join("\n")}\nAdd an entry to FREEFORM_INCOMPATIBLE (freeform-compat.ts) for each.`
      : undefined,
  );

  assert.deepEqual(
    stale,
    [],
    stale.length > 0
      ? `freeform-compat.ts flags item(s) that now PASS the sweep (remove the stale entry): ${stale.join(", ")}`
      : undefined,
  );
});
