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
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import {
  buildBuilderNodeRoleBindings,
  builderSectionNodeAddressKey,
  indexBuilderSectionChildNodeIds,
  indexBuilderSectionNodeIds,
  indexBuilderSectionNodes,
  type BuilderNode,
  type BuilderNodeRenderDataSources,
  renderBuilderNodes,
  resolveBuilderNodeRole,
  resolveSnapshotBuilderTree,
} from "@/lib/site-admin/builder-node";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { isPreviewActiveForTenant } from "@/lib/site-admin/server/homepage-reads";
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
import { fetchFeaturedTalentForSection } from "@/lib/site-admin/sections/featured_talent/fetch";
import { getPublicPathPrefix } from "@/lib/saas";
import { prefixPublicHrefsDeep } from "@/lib/saas/public-hrefs";
import { getHomepageData } from "@/lib/home-data";

interface HomepageCmsSectionsProps {
  snapshot: HomepageSnapshot;
  tenantId: string;
  locale: string;
  /** Restrict rendering to a specific slot key (e.g. `"hero"`). */
  onlySlot?: string;
}

export async function HomepageCmsSections({
  snapshot,
  tenantId,
  locale,
  onlySlot,
}: HomepageCmsSectionsProps) {
  const [editMode, previewActive, publicPathPrefix] = await Promise.all([
    isEditModeActiveForTenant(tenantId),
    isPreviewActiveForTenant(tenantId),
    getPublicPathPrefix(),
  ]);

  const entries = onlySlot
    ? snapshot.slots.filter((s) => s.slotKey === onlySlot)
    : snapshot.slots;

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

  if (
    process.env.NODE_ENV !== "production" &&
    builderTreeResolution.issues.length > 0
  ) {
    console.warn("[homepage-cms-sections] invalid builderTree; rendering legacy slots", {
      issues: builderTreeResolution.issues,
    });
  }

  return (
    <>
      {entries.map((entry) => {
        // Registry entries are keyed by type key; we widen to the generic
        // `SectionRegistryEntry` to hand off to the version-agnostic
        // `migrateSectionPayload` helper.
        const registryEntry = SECTION_REGISTRY[
          entry.sectionTypeKey as SectionTypeKey
        ] as SectionRegistryEntry | undefined;
        if (!registryEntry) {
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              "[homepage-cms-sections] unknown section_type_key; skipping",
              { slotKey: entry.slotKey, type: entry.sectionTypeKey },
            );
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
            console.warn(
              "[homepage-cms-sections] migration failed; skipping section",
              {
                slotKey: entry.slotKey,
                type: entry.sectionTypeKey,
                from: entry.schemaVersion,
                to: registryEntry.currentVersion,
                error: (error as Error).message,
              },
            );
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
        const builderNodeId = builderSectionNodeIds.get(
          builderSectionNodeAddressKey({
            sectionId: entry.sectionId,
            slotKey: entry.slotKey,
            sortOrder: entry.sortOrder,
          }) ?? "",
        );
        const builderSectionNode = builderSectionNodes.get(
          builderSectionNodeAddressKey({
            sectionId: entry.sectionId,
            slotKey: entry.slotKey,
            sortOrder: entry.sortOrder,
          }) ?? "",
        );
        const builderSectionChildren = builderSectionNode?.children ?? [];
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
          console.warn("[homepage-cms-sections] unknown builder child node roles", {
            sectionId: entry.sectionId,
            sectionTypeKey: entry.sectionTypeKey,
            unknownNodeIds: roleBindingResult.unknownNodeIds,
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
        return (
          <div
            key={`wrap:${key}`}
            {...(isBlankSection ? presentationDataAttrs(presentation) : {})}
            data-cms-section=""
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
            {rendered}
            {builderSectionChildren.length > 0
              ? renderBuilderNodes(builderSectionChildren, {
                  publicPathPrefix,
                  mode: "freeform",
                  dataSources: builderDataSources,
                })
              : null}
          </div>
        );
      })}
    </>
  );
}

function collectBuilderDataBindingMax(
  nodes: ReadonlyArray<BuilderNode>,
  sourceKey: string,
): number | null {
  let max: number | null = null;
  const visit = (node: BuilderNode) => {
    if (
      node.kind === "container" &&
      node.props.dataBinding?.sourceKey === sourceKey
    ) {
      max = Math.max(max ?? 0, node.props.dataBinding.maxItems ?? 4);
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };
  for (const node of nodes) visit(node);
  return max;
}

function hasBuilderDataBinding(
  nodes: ReadonlyArray<BuilderNode>,
  sourceKey: string,
): boolean {
  return collectBuilderDataBindingMax(nodes, sourceKey) != null;
}

async function loadBuilderNodeDataSources(
  nodes: ReadonlyArray<BuilderNode>,
  tenantId: string,
  locale: string,
): Promise<BuilderNodeRenderDataSources> {
  const featuredLimit = collectBuilderDataBindingMax(
    nodes,
    "featured_talent_profiles",
  );
  const needsLocations = hasBuilderDataBinding(nodes, "talent_locations");
  const needsDirectoryShortcuts = hasBuilderDataBinding(
    nodes,
    "tenant_directory_search",
  );
  if (featuredLimit == null && !needsLocations && !needsDirectoryShortcuts) {
    return {};
  }

  const [featuredTalentProfiles, homepageData] = await Promise.all([
    featuredLimit == null
      ? Promise.resolve(undefined)
      : fetchFeaturedTalentForSection(
          tenantId,
          {
            sourceMode: "auto_featured_flag",
            limit: Math.min(Math.max(featuredLimit, 1), 12),
            columnsDesktop: 4,
            variant: "grid",
            presentation: {},
          },
          locale,
        ),
    needsLocations || needsDirectoryShortcuts
      ? getHomepageData({ tenantId })
      : Promise.resolve(null),
  ]);

  return {
    featuredTalentProfiles,
    talentLocations: homepageData?.locations,
    directoryShortcuts: homepageData?.talentTypes,
  };
}
