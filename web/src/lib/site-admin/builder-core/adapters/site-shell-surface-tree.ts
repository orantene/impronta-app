/**
 * site_shell EDIT-surface tree shaping (Builder Studio WS-A A2) — PURE helpers.
 *
 * A1 made the `site_shell` builder surface FULLY FREEFORM: the editor edits the
 * shell as a `BuilderNodeTree` persisted to `cms_pages.blocks`, and publish
 * overlays that tree onto `published_page_snapshot.builderTree` (so
 * `<PublishedShell>` paints it via `renderBuilderNodes`). A2 mounts that surface.
 *
 * THE FULLY-FREEFORM DECISION (documented for A3–A8):
 * --------------------------------------------------------------------------
 * The shell header/footer on the EDIT surface are plain freeform `section`
 * nodes — landmark wrappers (`sectionTypeKey` "site_header" / "site_footer")
 * whose meaningful content lives in `children`, edited like any other freeform
 * subtree. We DELIBERATELY do not depend on the legacy `slots[]` addresses on
 * the edit side:
 *
 *   - `resolveSnapshotBuilderTree` runs `reconcileBuilderTreeWithLegacySlots` on
 *     READ. If the freeform tree diverged from slot addresses the reconciler
 *     could re-inject/drop nodes. By treating the shell edit surface as
 *     fully-freeform (the `blocks` draft is authoritative; the snapshot tree is
 *     only the first-open fallback, already reconciled), every edit round-trips
 *     through `cms_pages.blocks` verbatim — no slot reconciliation on the values
 *     the operator is actively editing.
 *   - The slim landmark+children shape below is exactly what `renderBuilderNodes`
 *     consumes: the bespoke `SiteHeaderComponent` / `SiteFooterComponent` stay
 *     intact behind the live-render flag (`site-shell-flag` → `PublishedShell`),
 *     and the freeform children render after them — the path PublishedShell
 *     already exercises today.
 *
 * GUARDRAIL: these helpers are PURE (no I/O, no runtime imports beyond types).
 * They are reached ONLY when the editor routes to the shell surface, which is
 * behind `shouldRouteSiteShellSurface` (OFF by default). With the flag off
 * nothing calls them.
 */

import type {
  BuilderNode,
  BuilderNodeTree,
  BuilderSectionNode,
} from "@/lib/site-admin/builder-node/types";

/** The two shell landmark slots, in render order. */
export const SHELL_SLOT_ORDER = ["header", "footer"] as const;
export type ShellSlotKey = (typeof SHELL_SLOT_ORDER)[number];

/** Section type key ↔ slot key for the shell landmarks. */
const SLOT_FOR_SECTION_TYPE: Record<string, ShellSlotKey> = {
  site_header: "header",
  site_footer: "footer",
};

/** True for a `site_header` / `site_footer` freeform section node. */
export function isShellLandmarkNode(
  node: BuilderNode,
): node is BuilderSectionNode {
  return (
    node.kind === "section" &&
    (node.props.sectionTypeKey === "site_header" ||
      node.props.sectionTypeKey === "site_footer")
  );
}

/**
 * Build a SLIM shell landmark section node: a `site_header` / `site_footer`
 * section wrapper carrying ONLY the landmark identity (sectionTypeKey + slotKey
 * + sortOrder) plus its freeform `children`. The bespoke component props are
 * intentionally NOT carried on the edit-surface node — the landmark renders as a
 * wrapper and the children carry the editable content, which is what
 * `renderBuilderNodes` paints.
 *
 * `sortOrder` is derived from the slot (header before footer) so a slot-anchored
 * reconcile, if it ever runs on a stray read, still lands the node at a stable
 * address. The edit surface itself never depends on it (fully-freeform).
 */
export function buildSlimShellSectionNode(input: {
  id: string;
  slotKey: ShellSlotKey;
  children?: BuilderNodeTree;
  label?: string | null;
  /**
   * The snapshot slot's `sectionId`. REQUIRED for the node to be addressable —
   * see the ADDRESSABILITY note above. Omitted only when no slot exists yet
   * (a synthesized empty landmark on a partial tree).
   */
  sectionId?: string | null;
}): BuilderSectionNode {
  const sectionTypeKey =
    input.slotKey === "header" ? "site_header" : "site_footer";
  return {
    id: input.id,
    kind: "section",
    props: {
      // ADDRESSABILITY (F-slim) — `builderSectionNodeAddressKey` returns NULL
      // when `sectionId` is absent, and `PublishedShell` looks the landmark up
      // by that key. A landmark minted without `sectionId` therefore binds to
      // nothing: its freeform children silently stop rendering on the published
      // site. This helper is reached from the LIVE super-admin
      // `applyShellTemplateToTenant` write path, so dropping the id here is a
      // real content-loss bug, not a dormant one. Always carry it through.
      ...(input.sectionId ? { sectionId: input.sectionId } : {}),
      sectionTypeKey,
      slotKey: input.slotKey,
      sortOrder: input.slotKey === "header" ? 0 : 1,
      label: input.label ?? null,
    },
    children: input.children ?? [],
  };
}

/**
 * Normalize a shell freeform tree to the SLIM landmark+children shape: keep the
 * header/footer section landmarks (in header→footer order), reduce each to its
 * slim identity + children, and drop any non-landmark top-level node (the shell
 * surface only owns the two landmarks). Pure + idempotent.
 *
 * Used to (a) prove the slim shape in tests and (b) give the mount a stable,
 * reconcile-safe edit tree regardless of whether the source was the freeform
 * `blocks` draft or the snapshot fallback.
 */
export function slimShellTree(tree: BuilderNodeTree): BuilderSectionNode[] {
  const bySlot = new Map<ShellSlotKey, BuilderSectionNode>();
  for (const node of tree) {
    if (!isShellLandmarkNode(node)) continue;
    const slotKey =
      (node.props.slotKey as ShellSlotKey | undefined) ??
      SLOT_FOR_SECTION_TYPE[node.props.sectionTypeKey];
    if (!slotKey || bySlot.has(slotKey)) continue;
    bySlot.set(
      slotKey,
      buildSlimShellSectionNode({
        id: node.id,
        slotKey,
        children: node.children ?? [],
        label: node.props.label ?? null,
        // Carry the incoming landmark's slot address through the slim reshape;
        // dropping it un-addresses the landmark (see buildSlimShellSectionNode).
        sectionId:
          typeof node.props.sectionId === "string" ? node.props.sectionId : null,
      }),
    );
  }
  const out: BuilderSectionNode[] = [];
  for (const slotKey of SHELL_SLOT_ORDER) {
    const node = bySlot.get(slotKey);
    if (node) out.push(node);
  }
  return out;
}
