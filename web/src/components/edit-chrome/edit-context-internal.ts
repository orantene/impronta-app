/**
 * edit-context-internal — pure, render-free helpers peeled out of
 * edit-context.tsx (W4-F2 god-file decomposition). Everything here is either a
 * plain type or a pure function over composition/builder-tree data: no hooks,
 * no React state, no side effects beyond the documented localStorage read in
 * `rehydratePersistedUndoStack`. Consumed only by edit-context.tsx and its
 * sibling provider hooks — NOT part of the public ./edit-context surface.
 */

import {
  BUILDER_NODE_REGISTRY,
  builderNodeKindAllowedAtRoot,
  unboundGallerySectionIdsSignature,
  assertAdvancedLibraryAllowsOperation,
  type BuilderNode,
  type BuilderNodeMutationCode,
  type BuilderNodeOperationKind,
  type BuilderNodeTree,
} from "@/lib/site-admin/builder-node";
import {
  buildHomepageBuilderConfig,
  type BuilderContextConfig,
} from "@/lib/site-admin/builder-core/config";
import { homepageAdapter } from "@/lib/site-admin/builder-core/adapters/homepage-adapter";
import type { ReactNode } from "react";

import type { CompositionData } from "@/lib/site-admin/edit-mode/composition-actions";
import {
  readClasses as readStyleClasses,
  toRegistry as toStyleClassRegistry,
} from "@/lib/site-admin/builder-node/style-classes-storage";
import {
  readPresets as readStylePresets,
  presetRegistryHasContent,
} from "@/lib/site-admin/builder-node/style-presets-storage";
import { getEditSessionId } from "./presence-provider";
import type {
  BuilderNodePastePreview,
  CompositionSnapshot,
  PageMetadata,
} from "./edit-context-types";

export const DEFAULT_METADATA: PageMetadata = {
  title: "Homepage",
  metaTitle: null,
  metaDescription: null,
  introTagline: null,
  ogTitle: null,
  ogDescription: null,
  ogImageUrl: null,
  canonicalUrl: null,
  noindex: false,
};

export type BuilderNodeMutationResult =
  | { ok: true; tree: BuilderNodeTree; nodeId?: string }
  | {
      ok: false;
      code: BuilderNodeMutationCode;
      error: string;
      details?: ReadonlyArray<string>;
    };

/**
 * Unified undo/redo stack entry. Composition entries capture slots +
 * metadata and revert by re-saving the composition. Field entries
 * capture a single section's pre/post props and revert by re-saving
 * that section through its autosave action. Keeping both on one
 * timeline means ⌘Z honours LIFO across structural and content edits.
 */
// W3-T8 — the selection that was active when an edit was committed, carried on
// each HistoryEntry so undo/redo can land the operator back on the affected
// block with its inspector open (instead of dropping to "nothing selected").
// Optional: legacy persisted entries (and the rare entry committed with no
// selection) simply restore nothing.
export interface HistorySelection {
  sectionId: string | null;
  builderNodeId: string | null;
}

export type HistoryEntry =
  | {
      kind: "composition";
      snapshot: CompositionSnapshot;
      selection?: HistorySelection;
    }
  | {
      kind: "builderTree";
      pre: BuilderNodeTree;
      post: BuilderNodeTree;
      selection?: HistorySelection;
    }
  | {
      kind: "field";
      sectionId: string;
      sectionTypeKey: string;
      schemaVersion: number;
      name: string;
      pre: Record<string, unknown>;
      post: Record<string, unknown>;
      selection?: HistorySelection;
    }
  // Marathon W1-T4 — a section visibility toggle or rename. These persist via
  // the section's own dispatch path (which writes the server record), so they
  // can't be replayed through the composition snapshot (stripSnapshotForSave
  // drops name/visibility). Undo/redo re-dispatch with recordHistory:false.
  | {
      kind: "sectionMeta";
      field: "visibility" | "name";
      sectionId: string;
      pre: string;
      post: string;
      selection?: HistorySelection;
    };

export function cloneSnapshot(s: CompositionSnapshot): CompositionSnapshot {
  return {
    metadata: { ...s.metadata },
    slots: Object.fromEntries(
      Object.entries(s.slots).map(([k, v]) => [k, v.map((e) => ({ ...e }))]),
    ),
  };
}

function cloneBuilderNodeTree(tree: BuilderNodeTree): BuilderNodeTree {
  return tree.map((node) => {
    if ("children" in node && Array.isArray(node.children)) {
      return {
        ...node,
        children: cloneBuilderNodeTree(node.children),
      };
    }
    return { ...node };
  });
}

export function cloneBuilderNode(node: BuilderNode): BuilderNode {
  return cloneBuilderNodeTree([node])[0]!;
}

export function findBuilderNodeLocation(
  tree: ReadonlyArray<BuilderNode>,
  nodeId: string,
): {
  node: BuilderNode;
  parentId: string | null;
  index: number;
  siblingCount: number;
} | null {
  function walk(
    nodes: ReadonlyArray<BuilderNode>,
    parentId: string | null,
  ): {
    node: BuilderNode;
    parentId: string | null;
    index: number;
    siblingCount: number;
  } | null {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]!;
      if (node.id === nodeId) {
        return { node, parentId, index, siblingCount: nodes.length };
      }
      if ("children" in node && Array.isArray(node.children)) {
        const nested = walk(node.children, node.id);
        if (nested) return nested;
      }
    }
    return null;
  }
  return walk(tree, null);
}

export function findOwnerSectionIdForBuilderNode(
  tree: ReadonlyArray<BuilderNode>,
  nodeId: string,
): string | null {
  function walk(
    nodes: ReadonlyArray<BuilderNode>,
    currentSectionId: string | null,
  ): string | null {
    for (const node of nodes) {
      const nextSectionId =
        node.kind === "section"
          ? node.props.sectionId ?? node.id
          : currentSectionId;
      if (node.id === nodeId) return nextSectionId;
      if ("children" in node && Array.isArray(node.children)) {
        const nested = walk(node.children, nextSectionId);
        if (nested) return nested;
      }
    }
    return null;
  }
  return walk(tree, null);
}

export function findSiteShellSlotForBuilderNode(
  tree: ReadonlyArray<BuilderNode>,
  nodeId: string,
): "header" | "footer" | null {
  function walk(
    nodes: ReadonlyArray<BuilderNode>,
    currentShellSlot: "header" | "footer" | null,
  ): "header" | "footer" | null {
    for (const node of nodes) {
      const nextShellSlot =
        node.kind === "section"
          ? node.props.slotKey === "header" || node.props.slotKey === "footer"
            ? node.props.slotKey
            : null
          : currentShellSlot;
      if (node.id === nodeId) {
        return nextShellSlot;
      }
      if ("children" in node && Array.isArray(node.children)) {
        const nested = walk(node.children, nextShellSlot);
        if (nested) return nested;
      }
    }
    return null;
  }
  return walk(tree, null);
}

export function guardBuilderNodeMutation(input: {
  tree: BuilderNodeTree;
  operation: BuilderNodeOperationKind;
  canEditSiteShell: boolean;
  advancedElementLibraryEnabled: boolean;
  nodeId?: string;
  parentId?: string | null;
}): Extract<BuilderNodeMutationResult, { ok: false }> | null {
  const advancedGate = assertAdvancedLibraryAllowsOperation(
    input.operation,
    input.advancedElementLibraryEnabled,
  );
  if (!advancedGate.ok) {
    return {
      ok: false,
      code: "GUARDED_NODE",
      error: advancedGate.message,
    };
  }

  if (input.canEditSiteShell) return null;

  const guardedMessage =
    "Your current plan cannot edit site shell blocks (header/footer). Upgrade to edit shell structure.";

  if (input.nodeId) {
    const sourceShellSlot = findSiteShellSlotForBuilderNode(input.tree, input.nodeId);
    if (sourceShellSlot) {
      return {
        ok: false,
        code: "GUARDED_NODE",
        error: guardedMessage,
      };
    }
  }

  if (typeof input.parentId === "string") {
    const targetShellSlot = findSiteShellSlotForBuilderNode(
      input.tree,
      input.parentId,
    );
    if (targetShellSlot) {
      return {
        ok: false,
        code: "GUARDED_NODE",
        error: guardedMessage,
      };
    }
  }

  return null;
}

function builderNodeAllowsChild(
  parentKind: BuilderNode["kind"],
  childKind: BuilderNode["kind"],
): boolean {
  const policy = BUILDER_NODE_REGISTRY[parentKind].children;
  if (policy.type === "any") return true;
  if (policy.type === "none") return false;
  return policy.kinds.includes(childKind);
}

export function builderNodeLabel(kind: BuilderNode["kind"]): string {
  return BUILDER_NODE_REGISTRY[kind]?.label ?? kind;
}

export function resolveCopiedBuilderNodePasteTarget(input: {
  tree: BuilderNodeTree;
  copiedNode: BuilderNode;
  targetNodeId?: string | null;
}):
  | {
      ok: true;
      parentId: string | null;
      index?: number;
      preview: BuilderNodePastePreview;
    }
  | { ok: false; preview: BuilderNodePastePreview } {
  const copiedLabel = builderNodeLabel(input.copiedNode.kind);

  if (!input.targetNodeId) {
    if (builderNodeKindAllowedAtRoot(input.copiedNode.kind)) {
      return {
        ok: true,
        parentId: null,
        index: undefined,
        preview: {
          copiedKind: input.copiedNode.kind,
          copiedLabel,
          mode: "append",
          message: `Paste ${copiedLabel} at the page root.`,
        },
      };
    }
    return {
      ok: false,
      preview: {
        copiedKind: input.copiedNode.kind,
        copiedLabel,
        mode: "blocked",
        message: `${copiedLabel} needs a compatible parent. Select a section or layout group before pasting.`,
      },
    };
  }

  const location = findBuilderNodeLocation(input.tree, input.targetNodeId);
  if (!location) {
    return {
      ok: false,
      preview: {
        copiedKind: input.copiedNode.kind,
        copiedLabel,
        mode: "blocked",
        message: "The selected paste target is no longer on the page.",
      },
    };
  }

  const targetLabel = builderNodeLabel(location.node.kind);
  if (builderNodeAllowsChild(location.node.kind, input.copiedNode.kind)) {
    return {
      ok: true,
      parentId: location.node.id,
      index: undefined,
      preview: {
        copiedKind: input.copiedNode.kind,
        copiedLabel,
        mode: "inside",
        message: `Paste ${copiedLabel} inside ${targetLabel}.`,
      },
    };
  }

  if (location.parentId === null) {
    if (builderNodeKindAllowedAtRoot(input.copiedNode.kind)) {
      return {
        ok: true,
        parentId: null,
        index: location.index + 1,
        preview: {
          copiedKind: input.copiedNode.kind,
          copiedLabel,
          mode: "after",
          message: `Paste ${copiedLabel} after ${targetLabel}.`,
        },
      };
    }
    return {
      ok: false,
      preview: {
        copiedKind: input.copiedNode.kind,
        copiedLabel,
        mode: "blocked",
        message: `${copiedLabel} cannot sit at the page root. Select a section or container.`,
      },
    };
  }

  const parent = findBuilderNodeLocation(input.tree, location.parentId);
  if (!parent || !builderNodeAllowsChild(parent.node.kind, input.copiedNode.kind)) {
    return {
      ok: false,
      preview: {
        copiedKind: input.copiedNode.kind,
        copiedLabel,
        mode: "blocked",
        message: `${copiedLabel} cannot be pasted beside ${targetLabel}. Choose a compatible group.`,
      },
    };
  }

  return {
    ok: true,
    parentId: location.parentId,
    index: location.index + 1,
    preview: {
      copiedKind: input.copiedNode.kind,
      copiedLabel,
      mode: "after",
      message: `Paste ${copiedLabel} after ${targetLabel}.`,
    },
  };
}

/**
 * W3 Sub-step C — section_embed reconcile detector.
 *
 * `section_embed` nodes are server-rendered islands: the client canvas
 * (`ClientBuilderCanvas`) renders each one from a `sectionEmbedIslands` map the
 * SERVER pre-rendered, keyed by node id. A purely client-side repaint can paint
 * regular nodes instantly, but it CANNOT conjure an island for a section_embed
 * id the server never rendered (i.e. one created by an add/duplicate). A move
 * keeps the same id, so the cached island repaints client-side — no server
 * round-trip needed. Only a CHANGE TO THE SET of section_embed ids (an id that
 * appears or disappears) requires the server to re-render the storefront RSC
 * tree so the new island exists.
 *
 * Returns true when the section_embed id sets differ between two trees — the
 * signal to eagerly `router.refresh()` (scoped reconcile) so the new island is
 * server-rendered promptly, rather than waiting for the debounced save's
 * trailing refresh. Cheap: O(embed nodes), and embeds are a small minority.
 */
/** Pure, client-safe section_embed id collector. MUST stay inline / dependency-free:
 *  importing it from section-embed-renderer (server module) leaks "server-only" into
 *  this "use client" file and breaks the production build. */
function collectSectionEmbedIds(tree: BuilderNodeTree): string[] {
  const ids: string[] = [];
  const visit = (node: BuilderNode) => {
    if (node.kind === "section_embed") ids.push(node.id);
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of tree) visit(node);
  return ids;
}

export function mutationTouchesSectionEmbedIslandSet(
  prevTree: BuilderNodeTree,
  nextTree: BuilderNodeTree,
): boolean {
  const prevIds = collectSectionEmbedIds(prevTree);
  const nextIds = collectSectionEmbedIds(nextTree);
  if (prevIds.length !== nextIds.length) return true;
  if (nextIds.length === 0) return false;
  const prevSet = new Set(prevIds);
  for (const id of nextIds) {
    if (!prevSet.has(id)) return true;
  }
  return false;
}

/** Config edits on an existing embed id — island HTML must re-render on the server. */
function sectionEmbedConfigSignature(tree: BuilderNodeTree): string {
  const parts: string[] = [];
  function visit(node: BuilderNode): void {
    if (node.kind === "section_embed") {
      parts.push(
        `${node.id}:${JSON.stringify(node.props.config ?? null)}`,
      );
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  }
  for (const node of tree) visit(node);
  parts.sort();
  return parts.join("\n");
}

export function mutationTouchesSectionEmbedConfig(
  prevTree: BuilderNodeTree,
  nextTree: BuilderNodeTree,
): boolean {
  return sectionEmbedConfigSignature(prevTree) !== sectionEmbedConfigSignature(nextTree);
}

/** Add Gallery custom sections paint via server HTML on composition-slot pages. */
export function mutationTouchesUnboundGallerySections(
  prevTree: BuilderNodeTree,
  nextTree: BuilderNodeTree,
): boolean {
  return (
    unboundGallerySectionIdsSignature(prevTree) !==
    unboundGallerySectionIdsSignature(nextTree)
  );
}

/**
 * WS1 — lazily-built homepage builder config, the EditProvider default when no
 * `surfaceConfig` prop is passed. Computed on first use (NOT at module load) so
 * the import cycle edit-context → homepage-adapter → composition-actions →
 * (section registry) → edit-context never reads a half-initialised export at
 * top level (that would TDZ). The homepage adapter is a pure pass-through, so
 * this default keeps the homepage byte-identical.
 */
let cachedDefaultHomepageConfig: BuilderContextConfig | null = null;
export function defaultHomepageBuilderConfig(): BuilderContextConfig {
  if (cachedDefaultHomepageConfig === null) {
    cachedDefaultHomepageConfig = buildHomepageBuilderConfig(homepageAdapter);
  }
  return cachedDefaultHomepageConfig;
}

/**
 * STYLE-1 — read the page's site-scoped style classes from the local mirror into
 * the `styleClasses` save envelope (or `undefined` when empty). Centralizes the
 * read so every save/publish call site threads the registry identically.
 */
export function styleClassesForSave(pageId: string | null) {
  const classes = readStyleClasses(pageId);
  return classes.length > 0 ? toStyleClassRegistry(classes) : undefined;
}

/** STYLE-1 — read the page's site-scoped presets into the `stylePresets` save
 *  envelope (or `undefined` when empty). */
export function stylePresetsForSave(pageId: string | null) {
  const registry = readStylePresets(pageId);
  return presetRegistryHasContent(registry) ? registry : undefined;
}

// ── #18 UNDO-SURVIVES-RELOAD — persisted-stack rehydration ───────────────────
// (See the history-stack comment block in edit-context.tsx for the full #18
// design; the cap + validation + versioned-envelope rehydrate live here so the
// provider's `past` initializer stays a one-liner.)

/** Persisted-stack cap — smaller than the in-memory HISTORY_CAP because
 *  serialized snapshots are heavier. */
export const UNDO_PERSIST_CAP = 10;

const isKnownHistoryEntry = (e: unknown): e is HistoryEntry =>
  e !== null &&
  typeof e === "object" &&
  "kind" in (e as object) &&
  ((e as { kind: string }).kind === "composition" ||
    (e as { kind: string }).kind === "builderTree" ||
    (e as { kind: string }).kind === "field" ||
    // W1-T4 — visibility/rename entries survive reload too.
    (e as { kind: string }).kind === "sectionMeta");

/**
 * Rehydrate the persisted undo stack for a page (the `past` useState
 * initializer). Behavior is IDENTICAL to the former inline initializer in
 * edit-context.tsx — see the W1-T5(a)/W1-L2 comments inline below for the
 * versioned-envelope + same-session-advance rules.
 */
export function rehydratePersistedUndoStack(input: {
  undoPersistKey: string | null;
  initialComposition: CompositionData | null;
}): HistoryEntry[] {
  const { undoPersistKey, initialComposition } = input;
  if (!undoPersistKey || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(undoPersistKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    // W1-T5(a) — the persisted payload is now a VERSIONED envelope
    // { baseVersion, sessionId, entries }. A persisted stack's `pre`/`post`
    // trees are only safe to replay against the page version they were
    // authored on. If another session (another browser/tab) advanced the page
    // version while this stack sat in localStorage, replaying it would write
    // a STALE tree wholesale at the current version — CAS accepts it → silent
    // clobber. So we DROP the persisted stack whenever its baseVersion ≠ the
    // version we just loaded... EXCEPT (W1-L2) when the version advance was
    // provably OUR OWN: the envelope's per-tab session token matches BOTH the
    // current tab's token (sessionStorage survives a same-tab reload) AND the
    // `edit_session_id` stamped on the loaded row by its last draft write —
    // i.e. the mismatch is the pagehide beacon of THIS session bumping the
    // version during its own reload, and the loaded content is this stack's
    // own latest post-tree. A foreign writer leaves a different (or NULL)
    // stamp and still drops the stack.
    //
    // Legacy bare-array payloads (pre-W1-T5) have no baseVersion → we cannot
    // prove they're same-session, so we conservatively drop them once.
    const loadedVersion = initialComposition?.pageVersion ?? null;
    let entriesRaw: unknown[] = [];
    let baseVersion: number | null = null;
    let envelopeSessionId: string | null = null;
    if (Array.isArray(parsed)) {
      // Legacy format — unversioned. Drop (can't prove freshness).
      return [];
    }
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { entries?: unknown }).entries)
    ) {
      entriesRaw = (parsed as { entries: unknown[] }).entries;
      const bv = (parsed as { baseVersion?: unknown }).baseVersion;
      baseVersion = typeof bv === "number" ? bv : null;
      const sid = (parsed as { sessionId?: unknown }).sessionId;
      envelopeSessionId = typeof sid === "string" && sid.length > 0 ? sid : null;
    } else {
      return [];
    }
    // Stale-base guard: only rehydrate when the stamp matches the loaded
    // version (or we have no loaded version to compare against — first paint).
    if (
      loadedVersion !== null &&
      baseVersion !== null &&
      baseVersion !== loadedVersion
    ) {
      const lastWriter = initialComposition?.lastWriterEditSessionId ?? null;
      const ownSessionAdvance =
        envelopeSessionId !== null &&
        envelopeSessionId === getEditSessionId() &&
        lastWriter === envelopeSessionId;
      if (!ownSessionAdvance) return [];
    }
    const valid = entriesRaw.filter(isKnownHistoryEntry);
    return valid.slice(-UNDO_PERSIST_CAP);
  } catch {
    return [];
  }
}

export interface EditProviderProps {
  tenantId: string;
  workspacePlan?: string | null;
  /** Falls back to `en` if omitted; edit chrome today operates on the platform default. */
  locale?: string;
  /** Tenant default storefront locale (`agency_business_identity`). LocaleSwitcher URLs. */
  defaultLocale?: string;
  /** When non-null the editor is on a non-homepage page with this slug.
   *  Threaded from EditChromeMount via the URL pathname. */
  pageSlug?: string | null;
  /** Server-known tenant locales, threaded from EditChromeMount so the
   *  topbar locale switcher renders on first paint. The composition load
   *  refreshes this once it lands; this prop just primes it. */
  initialAvailableLocales?: ReadonlyArray<string>;
  /**
   * T1-2 — server-prefetched composition snapshot. When EditChromeMount
   * resolves the editor while staff is engaged, it loads the composition
   * server-side and threads it here as the provider's initial state. The
   * navigator, canvas, add-section drawer, and publish drawer all read
   * from this context, so seeding it on the server eliminates the "0
   * sections" first-paint window the audit flagged. Falls back to a
   * client-side load when this prop is absent (legacy callers, error
   * recovery, locale switch revalidation).
   */
  initialComposition?: CompositionData | null;
  /** Storefront label threaded from EditChromeMount for top-bar tenant context. */
  tenantSiteLabel?: string | null;
  /**
   * Workspace admin URL segment (`/{slug}/admin/website`, …). Set on agency
   * storefronts; null on hub — callers fall back to legacy `/admin/site-settings/*`.
   */
  workspaceMembershipSlug?: string | null;
  /** True only for platform owners (super_admin) — gates raw-HTML `code` insertion. */
  canInsertRawHtmlElements?: boolean;
  /**
   * WS1 core-adapter seam — the surface config that specialises this ONE
   * Page Builder Core for a surface (homepage / cms_page / talent_page /
   * platform_lab). Every persistence call-site (load / save / save-draft /
   * restore) routes through `surfaceConfig.surface` (the adapter) instead of
   * importing the homepage actions directly.
   *
   * OPTIONAL with a homepage default: when omitted (every existing storefront
   * call path), the provider uses `DEFAULT_HOMEPAGE_BUILDER_CONFIG`, whose
   * adapter is a pure pass-through over the four homepage actions — so the
   * homepage stays byte-identical. New mount points (BuilderEditorMount) pass
   * their own config with a different adapter; same provider, zero forked code.
   */
  surfaceConfig?: BuilderContextConfig;
  children: ReactNode;
}
