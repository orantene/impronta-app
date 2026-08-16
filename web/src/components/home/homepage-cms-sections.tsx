/**
 * Phase 5 / M5 — public renderer for CMS-composed homepage sections.
 *
 * Given a `HomepageSnapshot` (from `published_homepage_snapshot`), this
 * component dispatches each slot entry to the matching `SectionRegistryEntry`
 * Component. Snapshot props are migrated to the registry's current schema
 * version via `migrateSectionPayload` — older published pages keep rendering
 * after a type-version bump without forcing a re-publish.
 *
 * Carry-forward discipline:
 *   - The snapshot is frozen at homepage-publish time. Subsequent edits (or
 *     even re-publishes) of a referenced section have ZERO effect on the
 *     storefront until the operator re-publishes the homepage. That rule is
 *     enforced upstream (`loadPublicHomepage` reads the snapshot, never the
 *     junction rows); this renderer just displays what it's given.
 *   - Unknown / removed section types are rendered as nothing, with a warn
 *     log in development. An archived section that a rollback happened to
 *     reference would have been filtered out at restore time.
 *   - We never render section props inline from free-form JSON: every render
 *     goes through a registry entry with a Zod-parsed payload.
 */
import type { ReactNode } from "react";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { improntaLog } from "@/lib/server/structured-log";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import {
  buildBuilderNodeRoleBindings,
  builderSectionNodeAddressKey,
  BuilderNodeRendererStyles,
  collectPresentNodeKinds,
  hasRenderableBuilderNodes,
  indexBuilderSectionChildNodeIds,
  indexBuilderSectionNodeIds,
  indexBuilderSectionNodes,
  renderFreeformPageRootTree,
  renderUnboundGalleryRoots,
  type BuilderNode,
  type BuilderVisibilityContext,
  renderBuilderNodes,
  resolveBuilderNodeRole,
  resolveSnapshotBuilderTree,
} from "@/lib/site-admin/builder-node";
import { treeHasInstances } from "@/lib/site-admin/builder-node/component-instances";
import {
  collectBuilderSectionEmbedNodes,
  makeSectionEmbedRenderer,
} from "@/lib/site-admin/builder-node/section-embed-renderer";
import { isBuilderClientCanvasEnabled } from "@/lib/site-admin/edit-mode/client-canvas-flag";
import { ClientBuilderCanvas } from "@/components/edit-chrome/client-builder-canvas";
import { ClientSectionChildren } from "@/components/edit-chrome/client-section-children";
import { loadBuilderNodeDataSources } from "./homepage-cms-data-sources";
import { BuilderProfilerBoundary } from "@/components/edit-chrome/builder-profiler-boundary";
import { loadBuilderComponentsForTenant } from "@/lib/site-admin/edit-mode/builder-components-loader";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { isPreviewActiveForTenant } from "@/lib/site-admin/server/homepage-reads";
import { loadPublicBranding } from "@/lib/site-admin/server/reads";
import { normalizeComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import {
  SECTION_REGISTRY,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import {
  migrateSectionPayload,
  type SectionRegistryEntry,
} from "@/lib/site-admin/sections/types";
import {
  presentationDataAttrs,
  presentationInlineStyles,
  presentationScopedCss,
  presentationVideoBackground,
} from "@/lib/site-admin/sections/shared/presentation";
import { getPublicPathPrefix } from "@/lib/saas";
import { prefixPublicHrefsDeep } from "@/lib/saas/public-hrefs";
import {
  resolveGoogleMapsKeyForClient,
  resolveTenantCaptcha,
} from "@/lib/integrations/resolve";

function resolveBuilderSectionBindingForSlotEntry(
  entry: HomepageSnapshot["slots"][number],
  builderSectionNodeIds: ReadonlyMap<string, string>,
  builderSectionNodes: ReadonlyMap<string, Extract<BuilderNode, { kind: "section" }>>,
  options?: { onlySectionId?: string },
): {
  builderNodeId: string | undefined;
  builderSectionNode: Extract<BuilderNode, { kind: "section" }> | undefined;
} {
  const directKey =
    builderSectionNodeAddressKey({
      sectionId: entry.sectionId,
      slotKey: entry.slotKey,
      sortOrder: entry.sortOrder,
    }) ?? "";

  const byAddress = builderSectionNodes.get(directKey);
  if (byAddress) {
    return {
      builderNodeId: builderSectionNodeIds.get(directKey) ?? byAddress.id,
      builderSectionNode: byAddress,
    };
  }

  const wantSlot = entry.slotKey ?? "";
  const wantOrder =
    typeof entry.sortOrder === "number" && Number.isFinite(entry.sortOrder)
      ? entry.sortOrder
      : 0;

  for (const node of builderSectionNodes.values()) {
    if (node.kind !== "section") continue;
    if (node.props.sectionId !== entry.sectionId) continue;

    const nodeSlot = node.props.slotKey ?? "";
    const nodeOrder =
      typeof node.props.sortOrder === "number" && Number.isFinite(node.props.sortOrder)
        ? node.props.sortOrder
        : 0;

    const slotMatches = nodeSlot === "" || nodeSlot === wantSlot;
    const orderMatches = nodeOrder === wantOrder;
    if (slotMatches && orderMatches) {
      return { builderNodeId: node.id, builderSectionNode: node };
    }
  }

  // Storefront maps one `<HomepageCmsSections />` per slot entry (`onlySectionId`).
  // Draft builder trees can disagree with snapshot rows on slotKey/sortOrder while
  // still carrying the correct `sectionId` + composition children. When the canonical
  // address misses, bind by `sectionId` and disambiguate duplicate section nodes in
  // corrupt trees: prefer slot/sort alignment, then prefer the node that actually
  // carries nested blocks.
  if (options?.onlySectionId === entry.sectionId) {
    const candidates = [...builderSectionNodes.values()].filter(
      (node): node is Extract<BuilderNode, { kind: "section" }> =>
        node.kind === "section" && node.props.sectionId === entry.sectionId,
    );
    if (candidates.length === 0) {
      return { builderNodeId: undefined, builderSectionNode: undefined };
    }
    if (candidates.length === 1) {
      const sole = candidates[0]!;
      return { builderNodeId: sole.id, builderSectionNode: sole };
    }

    const wantSlotInner = entry.slotKey ?? "";
    const wantOrderInner =
      typeof entry.sortOrder === "number" && Number.isFinite(entry.sortOrder)
        ? entry.sortOrder
        : 0;

    const exactSlot = candidates.filter((n) => (n.props.slotKey ?? "") === wantSlotInner);
    const slotPool = exactSlot.length > 0 ? exactSlot : candidates;

    const orderPool = slotPool.filter((n) => {
      const no =
        typeof n.props.sortOrder === "number" && Number.isFinite(n.props.sortOrder)
          ? n.props.sortOrder
          : 0;
      return no === wantOrderInner;
    });
    const pool = orderPool.length > 0 ? orderPool : slotPool;

    const sorted = [...pool].sort(
      (a, b) => (b.children?.length ?? 0) - (a.children?.length ?? 0),
    );
    const sole = sorted[0]!;
    return { builderNodeId: sole.id, builderSectionNode: sole };
  }

  return { builderNodeId: undefined, builderSectionNode: undefined };
}

interface HomepageCmsSectionsProps {
  snapshot: HomepageSnapshot;
  tenantId: string;
  locale: string;
  /** Restrict rendering to a specific slot key (e.g. `"hero"`). */
  onlySlot?: string;
  includeBuilderNodeRendererStyles?: boolean;
  /**
   * When the caller maps one section per `<HomepageCmsSections />` mount (storefront
   * layout), pass the **full** `snapshot` (including `builderTree`) and set this to
   * the section id to render. Passing a single-slot `slots` slice without this kept
   * the old merge/fallback behavior from seeing the full composition — and address
   * drift between tree nodes vs slot rows could leave `blank_section` children unbound.
   */
  onlySectionId?: string;
  /** Render only Add Gallery custom root sections (single mount on slot pages). */
  onlyUnboundGallery?: boolean;
}

/**
 * Depth-first: does this snapshot's builder tree contain a native `form` node?
 * Used to decide whether the tenant captcha must be resolved for this render
 * (see `needsCaptcha`). Defensive against arbitrary snapshot JSON — unknown
 * shapes simply answer "no".
 */
function snapshotHasFormNode(tree: unknown): boolean {
  if (!tree) return false;
  const visit = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.some(visit);
    if (!node || typeof node !== "object") return false;
    const n = node as { kind?: unknown; children?: unknown };
    if (n.kind === "form") return true;
    return visit(n.children);
  };
  return visit(tree);
}

export async function HomepageCmsSections({
  snapshot,
  tenantId,
  locale,
  onlySlot,
  includeBuilderNodeRendererStyles = true,
  onlySectionId,
  onlyUnboundGallery = false,
}: HomepageCmsSectionsProps) {
  // `slots` is typed required on HomepageSnapshot, but an edit-mode draft
  // snapshot (pure builderTree, no legacy slots) can arrive with it undefined —
  // which crashed the storefront render at `.some(...)`. Normalize to [] so the
  // render boundary never throws; an empty slot list just means "no legacy
  // sections to map".
  const slots = snapshot.slots ?? [];
  // Only pay for the tenant Maps-key resolution when a map-bearing section is
  // actually in the snapshot (today: location_discovery's orbit map). Avoids a
  // service-role round-trip on every storefront render.
  const needsMapsKey = slots.some(
    (s) => s.sectionTypeKey === "location_discovery",
  );
  // Captcha is needed for the curated contact_form section AND for any native
  // builder `form` node — the latter posts to the same endpoint, and that
  // endpoint enforces captcha per TENANT. Gating on slots alone meant a page
  // built purely from form nodes resolved no captcha, rendered no widget, and
  // had every submission rejected once the tenant enabled a provider.
  const needsCaptcha =
    slots.some((s) => s.sectionTypeKey === "contact_form") ||
    snapshotHasFormNode(snapshot.builderTree);

  const [
    editMode,
    previewActive,
    publicPathPrefix,
    actorSession,
    mapsApiKey,
    resolvedCaptcha,
    branding,
  ] =
    await Promise.all([
      isEditModeActiveForTenant(tenantId),
      isPreviewActiveForTenant(tenantId),
      getPublicPathPrefix(),
      getCachedActorSession(),
      needsMapsKey
        ? resolveGoogleMapsKeyForClient(tenantId)
        : Promise.resolve(null),
      needsCaptcha
        ? resolveTenantCaptcha(tenantId)
        : Promise.resolve(null),
      loadPublicBranding(tenantId),
    ]);

  // GAP B — the tenant's LIVE per-component-type default styles (cascade middle
  // layer). Normalized once and passed to every freeform render path; an empty
  // map is the no-op default (renderer returns each node by identity). Draft
  // live-preview while editing these is layered on top via the theme-preview
  // bridge (B-4); the published page always uses the LIVE map.
  const componentStyleDefaults = normalizeComponentStyleDefaults(
    branding?.component_styles_json,
  );

  // Wave 5B · #38 — render-time signals for node-level conditional visibility.
  // `locale` is always known; `signedIn` comes from the request-cached actor
  // session (one round-trip shared across every section mount). A node with no
  // condition is unaffected; a signal we don't set passes (never hides).
  //
  // In EDIT mode we pass NO context (undefined) so every node renders and stays
  // selectable/editable — hiding a conditional block on the canvas would make
  // it un-editable. Preview + the live storefront DO evaluate the rule.
  const visibilityContext: BuilderVisibilityContext | undefined = editMode
    ? undefined
    : { locale, signedIn: Boolean(actorSession.user) };

  // Thread only the PUBLIC widget config to components; the verify secret never
  // leaves the submit route.
  const captchaConfig = resolvedCaptcha
    ? { provider: resolvedCaptcha.provider, siteKey: resolvedCaptcha.siteKey }
    : null;

  // Filter by slot AND/OR section id. The storefront mounts one
  // `<HomepageCmsSections onlySectionId=… />` per non-hero section without
  // `onlySlot`; without an `onlySectionId` branch every such mount iterated
  // ALL slots, emitting a section shell per entry → ~65 shells for a
  // 9-section page. A predicate that honors both (and both-present) keeps
  // `onlySlot="hero"` rendering every hero-slot section while making
  // `onlySectionId` render exactly one.
  const entries = slots.filter((s) => {
    if (onlySlot && s.slotKey !== onlySlot) return false;
    if (onlySectionId && s.sectionId !== onlySectionId) return false;
    return true;
  });

  if (onlyUnboundGallery) {
    const tree = resolveSnapshotBuilderTree(snapshot).tree;
    const builderDataSources = await loadBuilderNodeDataSources(
      tree,
      tenantId,
      locale,
    );
    const builderComponents =
      !editMode && treeHasInstances(tree)
        ? await loadBuilderComponentsForTenant(tenantId)
        : {};
    const sectionEmbedRenderer = makeSectionEmbedRenderer({
      tenantId,
      locale,
      publicPathPrefix,
    });
    return renderUnboundGalleryRoots(tree, {
      publicPathPrefix,
      mode: "freeform",
      includeRendererStyles: false,
      dataSources: builderDataSources,
      components: builderComponents,
      visibilityContext,
      renderSectionEmbed: sectionEmbedRenderer,
    });
  }

  // Freeform full-page design: a builderTree persisted with NO curated slots
  // (e.g. a one-click starter design). The slot loop below only renders
  // section-mapped slots, and the `entries.length === 0` guard would otherwise
  // short-circuit to an empty placeholder — so render the whole resolved tree
  // here. Published, preview, AND edit all want the design on the canvas; only
  // a genuinely empty page (no slots and no tree) falls through to the
  // placeholder below.
  if (entries.length === 0 && slots.length === 0) {
    const freeform = resolveSnapshotBuilderTree(snapshot);
    if (freeform.tree.length > 0) {
      const freeformDataSources = await loadBuilderNodeDataSources(
        freeform.tree,
        tenantId,
        locale,
      );
      const freeformComponents =
        !editMode && treeHasInstances(freeform.tree)
          ? await loadBuilderComponentsForTenant(tenantId)
          : {};
      const freeformSectionEmbedRenderer = makeSectionEmbedRenderer({
        tenantId,
        locale,
        publicPathPrefix,
        // Same resolved captcha the section-list path passes below. Without it
        // a contact form embedded in a freeform page renders with no widget.
        captcha: captchaConfig,
        // Likewise the Maps key — an embedded map section otherwise falls back
        // to its placeholder while the section-list path shows a live map.
        mapsApiKey,
      });
      // REND-2 — scope the renderer sheet to the kinds on this freeform page,
      // but only on the PUBLISHED path. Edit/preview keep the FULL sheet so an
      // author can drop any kind onto the canvas without a re-fetch. Falls back
      // to the full sheet on any uncertainty (buildScopedRendererCss).
      const freeformScopedKinds =
        editMode || previewActive
          ? undefined
          : collectPresentNodeKinds(freeform.tree, freeformComponents);
      const freeformStyles =
        includeBuilderNodeRendererStyles &&
        hasRenderableBuilderNodes(freeform.tree, { mode: "freeform" }) ? (
          <BuilderNodeRendererStyles kinds={freeformScopedKinds} />
        ) : null;

      // W3 Sub-step B — CLIENT-RENDERED CANVAS (default OFF; flag-gated).
      // Only when edit mode is active AND NEXT_PUBLIC_BUILDER_CLIENT_CANVAS is
      // on do we paint the freeform tree client-side. The `section_embed`
      // server islands are pre-rendered here (same renderer, same wrapper +
      // `data-*`) and handed to the client canvas by node id; everything else
      // renders client-side against the SERIALIZED `freeformDataSources`. The
      // head styles still emit server-side so the head matches the server path.
      if (editMode && isBuilderClientCanvasEnabled()) {
        const sectionEmbedIslands: Record<string, ReactNode> = {};
        for (const embed of collectBuilderSectionEmbedNodes(freeform.tree)) {
          sectionEmbedIslands[embed.id] = freeformSectionEmbedRenderer(embed);
        }
        return (
          <>
            {freeformStyles}
            {/* W0-T6 — flag-gated canvas profiler (no-op unless
                NEXT_PUBLIC_BUILDER_PROFILE=1). Wraps the client canvas so the
                W0-T7 run can measure canvas reconcile cost per edit separately
                from the chrome. Renders no extra node when the flag is off. */}
            <BuilderProfilerBoundary id="builder-canvas">
              <ClientBuilderCanvas
                initialTree={freeform.tree}
                dataSources={freeformDataSources}
                sectionEmbedIslands={sectionEmbedIslands}
                publicPathPrefix={publicPathPrefix}
                components={freeformComponents}
                visibilityContext={visibilityContext}
                componentStyleDefaults={componentStyleDefaults}
              />
            </BuilderProfilerBoundary>
          </>
        );
      }

      // DEFAULT (flag off) — server-rendered canvas, byte-identical to today.
      // W4-T4(b) DEFERRED (point of no return): baking the canvas flag + deleting
      // this fallback requires the W0-T7 flag-OFF/ON profiling baseline (Wave 6)
      // on disk first — do NOT delete this branch until that delta is captured.
      return (
        <>
          {freeformStyles}
          {renderFreeformPageRootTree(freeform.tree, {
            publicPathPrefix,
            mode: "freeform",
            includeRendererStyles: false,
            dataSources: freeformDataSources,
            components: freeformComponents,
            visibilityContext,
            componentStyleDefaults,
            renderSectionEmbed: freeformSectionEmbedRenderer,
          })}
        </>
      );
    }
  }

  if (entries.length === 0) {
    if (!editMode && !previewActive) return null;
    return (
      <div
        className="min-h-[50vh] w-full"
        data-cms-page-empty=""
        aria-hidden
      />
    );
  }

  const builderTreeResolution = resolveSnapshotBuilderTree(snapshot);
  const builderSectionNodeIds = indexBuilderSectionNodeIds(builderTreeResolution.tree);
  const builderSectionNodes = indexBuilderSectionNodes(builderTreeResolution.tree);
  const builderSectionChildNodeIds = indexBuilderSectionChildNodeIds(
    builderTreeResolution.tree,
  );
  const builderDataSources = await loadBuilderNodeDataSources(
    builderTreeResolution.tree,
    tenantId,
    locale,
  );
  // Phase 3 — load this tenant's component definitions so linked instances
  // render LIVE. Skipped entirely (no DB query) when the page has no instances.
  // EDIT MODE renders the instance's editable STORED children instead: live
  // resolution namespaces ids (instanceId__masterId) which the editor's
  // selection/inspector model doesn't track, so resolving in edit mode would
  // break selecting/editing instance content. Preview + published resolve live.
  const builderComponents =
    !editMode && treeHasInstances(builderTreeResolution.tree)
      ? await loadBuilderComponentsForTenant(tenantId)
      : {};

  if (
    process.env.NODE_ENV !== "production" &&
    builderTreeResolution.issues.length > 0
  ) {
    void improntaLog("home_homepage_cms_sections.warn", {
      message: "[homepage-cms-sections] invalid builderTree; rendering legacy slots",
      issues: JSON.stringify(builderTreeResolution.issues),
    });
  }

  const shouldIncludeBuilderNodeRendererStyles =
    includeBuilderNodeRendererStyles &&
    hasRenderableBuilderNodes(builderTreeResolution.tree, { mode: "freeform" });

  // REND-2 — scope the single shared renderer sheet to the kinds present in the
  // page's builder tree (the curated React sections carry their own CSS, so the
  // builder sheet only needs builder-node kinds). Published path only; edit /
  // preview keep the full sheet so authoring any kind is safe. Conservative
  // full-sheet fallback lives in buildScopedRendererCss.
  const builderScopedKinds =
    editMode || previewActive
      ? undefined
      : collectPresentNodeKinds(builderTreeResolution.tree, builderComponents);

  return (
    <>
      {shouldIncludeBuilderNodeRendererStyles ? (
        <BuilderNodeRendererStyles kinds={builderScopedKinds} />
      ) : null}
      {entries.map((entry) => {
        // Registry entries are keyed by type key; we widen to the generic
        // `SectionRegistryEntry` to hand off to the version-agnostic
        // `migrateSectionPayload` helper.
        const registryEntry = SECTION_REGISTRY[
          entry.sectionTypeKey as SectionTypeKey
        ] as SectionRegistryEntry | undefined;
        if (!registryEntry) {
          if (process.env.NODE_ENV !== "production") {
            void improntaLog("home_homepage_cms_sections.warn", {
              message: "[homepage-cms-sections] unknown section_type_key; skipping",
              slotKey: entry.slotKey,
              type: entry.sectionTypeKey,
            });
          }
          // In edit-mode we render a visible placeholder so the operator
          // notices an orphaned section reference (e.g. a section type
          // that was retired after publish). View mode renders nothing
          // to avoid leaking debug chrome to public visitors.
          if (editMode) {
            return (
              <div
                key={`orphan:${entry.slotKey}:${entry.sectionId}:${entry.sortOrder}`}
                data-cms-section-orphan=""
                className="mx-4 my-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-300"
              >
                <strong>Section unavailable:</strong> the type{" "}
                <code>{entry.sectionTypeKey}</code> is no longer registered.
                Remove this slot entry from the homepage composer or restore
                the section type in code.
              </div>
            );
          }
          return null;
        }
        let migrated: { version: number; payload: unknown };
        try {
          migrated = migrateSectionPayload(
            registryEntry,
            entry.schemaVersion,
            entry.props,
          );
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            void improntaLog("home_homepage_cms_sections.warn", {
              message: "[homepage-cms-sections] migration failed; skipping section",
              slotKey: entry.slotKey,
              type: entry.sectionTypeKey,
              from: entry.schemaVersion,
              to: registryEntry.currentVersion,
              error: (error as Error).message,
            });
          }
          if (editMode) {
            return (
              <div
                key={`migfail:${entry.slotKey}:${entry.sectionId}:${entry.sortOrder}`}
                data-cms-section-orphan=""
                className="mx-4 my-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm text-amber-300"
              >
                <strong>Section payload out of date:</strong> snapshot v
                {entry.schemaVersion} could not migrate to v
                {registryEntry.currentVersion} for{" "}
                <code>{entry.sectionTypeKey}</code>. Re-publish the homepage
                to refresh the snapshot.
              </div>
            );
          }
          return null;
        }
        const Component = registryEntry.Component;
        const key = `${entry.slotKey}:${entry.sectionId}:${entry.sortOrder}`;
        const payloadForRender = prefixPublicHrefsDeep(
          migrated.payload,
          publicPathPrefix,
        );
        // Pixel-first companion: emit per-section scoped CSS when the
        // operator wrote any custom CSS. Scoped to the wrapper's
        // `data-section-id` attribute so it can't leak across sections.
        const payload = payloadForRender as { presentation?: unknown };
        const presentation = (payload?.presentation ?? undefined) as Parameters<typeof presentationScopedCss>[1];
        const scopedCss = presentationScopedCss(entry.sectionId, presentation);
        const videoBg = presentationVideoBackground(presentation);
        const isBlankSection = entry.sectionTypeKey === "blank_section";
        const { builderNodeId, builderSectionNode } =
          resolveBuilderSectionBindingForSlotEntry(
            entry,
            builderSectionNodeIds,
            builderSectionNodes,
            onlySectionId ? { onlySectionId } : undefined,
          );
        const builderSectionChildren = builderSectionNode?.children ?? [];
        // "2018 bye-bye" — an ejected section no longer renders its curated
        // React component; its roleless freeform children render in its place.
        const sectionEjected = builderSectionNode?.props.ejected === true;
        const roleBindingResult = buildBuilderNodeRoleBindings(
          builderNodeId
            ? (builderSectionChildNodeIds.get(builderNodeId) ?? []).filter((id) =>
                resolveBuilderNodeRole(id),
              )
            : [],
        );
        const roleBindings = roleBindingResult.nodeIdsByRole;
        if (
          process.env.NODE_ENV !== "production" &&
          roleBindingResult.unknownNodeIds.length > 0
        ) {
          void improntaLog("home_homepage_cms_sections.warn", {
            message: "[homepage-cms-sections] unknown builder child node roles",
            sectionId: entry.sectionId,
            sectionTypeKey: entry.sectionTypeKey,
            unknownNodeIds: roleBindingResult.unknownNodeIds.join(", "),
          });
        }
        const builderNodeBindings =
          builderNodeId || Object.keys(roleBindings).length > 0
            ? {
                sectionNodeId: builderNodeId ?? null,
                nodeIdsByRole: roleBindings,
              }
            : undefined;
        const rendered = (
          <Component
            key={key}
            props={payloadForRender as never}
            tenantId={tenantId}
            locale={locale}
            preview={false}
            sectionId={entry.sectionId}
            publicPathPrefix={publicPathPrefix}
            mapsApiKey={mapsApiKey}
            captcha={captchaConfig}
            builderNodeBindings={builderNodeBindings}
          />
        );
        // Wrap unconditionally (visitor + edit mode). Visitor mode needs the
        // wrapper for scoped CSS targeting; edit mode adds chrome attrs the
        // selection layer reads.
        //
        // When a section has a video background, the wrapper becomes a
        // positioned container (relative + overflow:hidden) and a <video>
        // is injected as the first child, behind the section content via
        // z-index. The actual section markup is unchanged.
        const wrapperPresentationStyles =
          isBlankSection || videoBg
            ? {
                ...(isBlankSection ? presentationInlineStyles(presentation) : {}),
                ...(videoBg
                  ? {
                      position: "relative" as const,
                      overflow: "hidden" as const,
                      isolation: "isolate" as const,
                    }
                  : {}),
              }
            : undefined;
        const rootBlockIndex = builderNodeId
          ? builderTreeResolution.tree.findIndex((node) => node.id === builderNodeId)
          : -1;
        // builder-perf-2026 — curated-slot instant editing. In edit mode with the
        // client-canvas flag on, render this section's builder CHILDREN client-side
        // (<ClientSectionChildren>) so a child edit repaints instantly instead of
        // triggering the per-edit server `router.refresh()`. The curated <Component>
        // above stays server-rendered (its prop edits keep the refresh). Flag off /
        // published / preview → the byte-identical server render below.
        const sectionEmbedRendererForChildren = makeSectionEmbedRenderer({
          tenantId,
          locale,
          publicPathPrefix,
        });
        let builderChildrenNode: ReactNode = null;
        if (builderSectionChildren.length > 0) {
          if (editMode && isBuilderClientCanvasEnabled() && builderNodeId) {
            const childEmbedIslands: Record<string, ReactNode> = {};
            for (const embed of collectBuilderSectionEmbedNodes(
              builderSectionChildren,
            )) {
              childEmbedIslands[embed.id] = sectionEmbedRendererForChildren(embed);
            }
            builderChildrenNode = (
              <ClientSectionChildren
                sectionNodeId={builderNodeId}
                initialChildren={builderSectionChildren}
                dataSources={builderDataSources}
                sectionEmbedIslands={childEmbedIslands}
                publicPathPrefix={publicPathPrefix}
                components={builderComponents}
                visibilityContext={visibilityContext}
                componentStyleDefaults={componentStyleDefaults}
              />
            );
          } else {
            builderChildrenNode = renderBuilderNodes(builderSectionChildren, {
              publicPathPrefix,
              mode: "freeform",
              includeRendererStyles: false,
              dataSources: builderDataSources,
              components: builderComponents,
              visibilityContext,
              componentStyleDefaults,
              renderSectionEmbed: sectionEmbedRendererForChildren,
            });
          }
        }
        return (
          <div
            key={`wrap:${key}`}
            {...(isBlankSection ? presentationDataAttrs(presentation) : {})}
            data-cms-section=""
            data-cms-block=""
            data-block-index={
              rootBlockIndex >= 0 ? rootBlockIndex : (entry.sortOrder ?? 0)
            }
            data-section-id={entry.sectionId}
            data-section-type-key={entry.sectionTypeKey}
            data-slot-key={entry.slotKey}
            data-sort-order={entry.sortOrder}
            data-builder-node-id={builderNodeId}
            className={isBlankSection ? "site-blank-section" : undefined}
            style={
              wrapperPresentationStyles &&
              Object.keys(wrapperPresentationStyles).length > 0
                ? wrapperPresentationStyles
                : undefined
            }
          >
            {scopedCss ? (
              <style dangerouslySetInnerHTML={{ __html: scopedCss }} />
            ) : null}
            {videoBg ? (
              <>
                <video
                  src={videoBg.src}
                  poster={videoBg.poster}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    zIndex: -2,
                    pointerEvents: "none",
                  }}
                />
                {typeof videoBg.overlay === "number" && videoBg.overlay > 0 ? (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: `rgba(0,0,0,${videoBg.overlay})`,
                      zIndex: -1,
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
              </>
            ) : null}
            {sectionEjected ? null : rendered}
            {builderChildrenNode}
          </div>
        );
      })}
      {onlySectionId || onlySlot
        ? null
        : renderUnboundGalleryRoots(builderTreeResolution.tree, {
            publicPathPrefix,
            mode: "freeform",
            includeRendererStyles: false,
            dataSources: builderDataSources,
            components: builderComponents,
            visibilityContext,
            renderSectionEmbed: makeSectionEmbedRenderer({
              tenantId,
              locale,
              publicPathPrefix,
            }),
          })}
    </>
  );
}

