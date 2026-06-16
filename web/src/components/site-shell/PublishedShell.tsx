/**
 * Phase B.1 — `<PublishedShell>` wrapper.
 *
 * Server Component. Wraps a page body with the tenant's snapshot-rendered
 * header + footer when the site-shell feature flag is on AND the tenant has
 * a published shell row. Falls back to rendering the children alone (no
 * header/footer) when either gate is closed; the calling layout still has
 * `PublicHeader` mounted around it, which means:
 *
 *   - Default tenants (flag off OR no shell) get the existing
 *     `PublicHeader` + body + existing footer (no behavior change).
 *   - Opted-in tenants with a published shell get the snapshot-rendered
 *     header + body + snapshot-rendered footer; the calling layout MUST
 *     un-mount `PublicHeader` to avoid double-headers.
 *
 * Phase B.2 wires the un-mount logic into `agency-home-storefront.tsx`.
 * For B.1, this component is built but never reached at runtime — the
 * feature flag in `site-shell-flag.ts` defaults to "off".
 *
 * Renders the snapshot via the same `getSectionType()` lookup the homepage
 * composer uses, so theming, presentation tokens, and layout tokens behave
 * identically to body sections.
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { improntaLog } from "@/lib/server/structured-log";
import { loadPublishedShell } from "@/lib/site-admin/server/shell-reads";
import {
  buildBuilderNodeRoleBindings,
  builderSectionNodeAddressKey,
  BuilderNodeRendererStyles,
  collectBuilderCollectionSourceKeys,
  collectBuilderImageMediaIds,
  hasRenderableBuilderNodes,
  indexBuilderSectionChildNodeIds,
  indexBuilderSectionNodeIds,
  indexBuilderSectionNodes,
  renderBuilderNodes,
  resolveBuilderNodeRole,
  resolveSnapshotBuilderTree,
} from "@/lib/site-admin/builder-node";
import { treeHasInstances } from "@/lib/site-admin/builder-node/component-instances";
import { makeSectionEmbedRenderer } from "@/lib/site-admin/builder-node/section-embed-renderer";
import { loadBuilderComponentsForTenant } from "@/lib/site-admin/edit-mode/builder-components-loader";
import { loadPublicComponentStyleDefaults } from "@/lib/site-admin/server/reads";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { listBuilderImageMediaAssets } from "@/lib/site-admin/media/assets";
import { resolveCollectionDataSources } from "@/lib/site-admin/collections/server";
import { getSectionType } from "@/lib/site-admin/sections/registry";
import {
  isSiteShellEnabledForTenant,
  resolveShellRenderDecision,
} from "@/lib/site-admin/site-shell-flag";
import { SITE_HEADER_SELECTION_ID } from "@/lib/site-admin/site-header/selection-id";
import type { Locale } from "@/i18n/config";
import { getPublicPathPrefix } from "@/lib/saas";
import { prefixPublicHrefsDeep } from "@/lib/saas/public-hrefs";
import { createServiceRoleClient } from "@/lib/supabase/admin";

interface Props {
  tenantId: string;
  locale: Locale;
  children: React.ReactNode;
}

export interface SiteShellRenderHints {
  /** True when this request will render a snapshot shell. The calling
   *  layout uses this to decide whether to also mount the legacy
   *  `PublicHeader` / footer (when false → mount them; when true →
   *  skip them so we don't double-render). */
  snapshotShellActive: boolean;
}

/**
 * Server-side helper for the calling layout to decide whether to mount the
 * legacy header/footer. Single source of truth — both the wrapper helpers
 * below and the layout MUST consult this to stay in sync.
 */
export async function shouldRenderSnapshotShell(
  tenantId: string,
  locale: Locale,
): Promise<boolean> {
  const flagEnabled = isSiteShellEnabledForTenant(tenantId);
  // Short-circuit the DB read when the flag is off (the common case) — the
  // pure decision is false regardless of whether a shell row exists.
  if (!flagEnabled) return false;
  const shell = await loadPublishedShell(tenantId, locale);
  return resolveShellRenderDecision({
    flagEnabled,
    shellPublished: shell !== null,
  }).renderSnapshotShell;
}

/**
 * Render the snapshot shell's HEADER slot, or null if no shell is engaged
 * for this tenant. Mount this at the top of the page, where the legacy
 * `PublicHeader` would otherwise live. The calling layout is responsible
 * for not also mounting `PublicHeader` in this case (use
 * `shouldRenderSnapshotShell` to gate).
 */
export async function PublishedShellHeader({
  tenantId,
  locale,
  includeBuilderNodeRendererStyles = true,
}: {
  tenantId: string;
  locale: Locale;
  includeBuilderNodeRendererStyles?: boolean;
}) {
  if (!isSiteShellEnabledForTenant(tenantId)) return null;
  const shell = await loadPublishedShell(tenantId, locale);
  if (!shell) return null;
  const slot = shell.snapshot.slots.find((s) => s.slotKey === "header");
  if (!slot) return null;
  const builderTree = resolveSnapshotBuilderTree(shell.snapshot).tree;
  const builderSectionNodeIds = indexBuilderSectionNodeIds(
    builderTree,
  );
  const builderSectionNodes = indexBuilderSectionNodes(
    builderTree,
  );
  const builderSectionChildNodeIds = indexBuilderSectionChildNodeIds(
    builderTree,
  );
  return renderShellSlot(
    slot,
    tenantId,
    locale,
    builderSectionNodeIds,
    builderSectionNodes,
    builderSectionChildNodeIds,
    { includeBuilderNodeRendererStyles },
  );
}

/**
 * Render the snapshot shell's FOOTER slot, or null. Mount at the bottom of
 * the page where the legacy footer would otherwise live.
 */
export async function PublishedShellFooter({
  tenantId,
  locale,
  includeBuilderNodeRendererStyles = true,
}: {
  tenantId: string;
  locale: Locale;
  includeBuilderNodeRendererStyles?: boolean;
}) {
  if (!isSiteShellEnabledForTenant(tenantId)) return null;
  const shell = await loadPublishedShell(tenantId, locale);
  if (!shell) return null;
  const slot = shell.snapshot.slots.find((s) => s.slotKey === "footer");
  if (!slot) return null;
  const builderTree = resolveSnapshotBuilderTree(shell.snapshot).tree;
  const builderSectionNodeIds = indexBuilderSectionNodeIds(
    builderTree,
  );
  const builderSectionNodes = indexBuilderSectionNodes(
    builderTree,
  );
  const builderSectionChildNodeIds = indexBuilderSectionChildNodeIds(
    builderTree,
  );
  return renderShellSlot(
    slot,
    tenantId,
    locale,
    builderSectionNodeIds,
    builderSectionNodes,
    builderSectionChildNodeIds,
    { includeBuilderNodeRendererStyles },
  );
}

/**
 * Convenience wrapper that nests children between header + footer when the
 * shell is engaged, or just renders children when not. Useful for pages
 * whose body is small enough to nest. Larger pages (homepage with 9+
 * sections) prefer mounting `PublishedShellHeader` and
 * `PublishedShellFooter` directly at their top + bottom positions.
 */
export async function PublishedShell({ tenantId, locale, children }: Props) {
  return (
    <>
      <BuilderNodeRendererStyles />
      <PublishedShellHeader
        tenantId={tenantId}
        locale={locale}
        includeBuilderNodeRendererStyles={false}
      />
      {children}
      <PublishedShellFooter
        tenantId={tenantId}
        locale={locale}
        includeBuilderNodeRendererStyles={false}
      />
    </>
  );
}

async function renderShellSlot(
  slot: {
    slotKey: string;
    sortOrder: number;
    sectionTypeKey: string;
    sectionId: string;
    props: Record<string, unknown>;
  },
  tenantId: string,
  locale: string,
  builderSectionNodeIds: ReadonlyMap<string, string>,
  builderSectionNodes: ReturnType<typeof indexBuilderSectionNodes>,
  builderSectionChildNodeIds: ReadonlyMap<string, ReadonlyArray<string>>,
  options: { includeBuilderNodeRendererStyles?: boolean } = {},
): Promise<React.ReactNode> {
  const reg = getSectionType(slot.sectionTypeKey);
  if (!reg) {
    if (process.env.NODE_ENV !== "production") {
      void improntaLog("site_shell_publishedshell.warn", {
        message: `[PublishedShell] unknown section type "${slot.sectionTypeKey}" — slot ignored`,
      });
    }
    return null;
  }
  const Comp = reg.Component;
  const publicPathPrefix = await getPublicPathPrefix();
  const props = prefixPublicHrefsDeep(slot.props, publicPathPrefix);
  const builderNodeId = builderSectionNodeIds.get(
    builderSectionNodeAddressKey({
      sectionId: slot.sectionId,
      slotKey: slot.slotKey,
      sortOrder: slot.sortOrder,
    }) ?? "",
  );
  const builderSectionNode = builderSectionNodes.get(
    builderSectionNodeAddressKey({
      sectionId: slot.sectionId,
      slotKey: slot.slotKey,
      sortOrder: slot.sortOrder,
    }) ?? "",
  );
  const builderSectionChildren = builderSectionNode?.children ?? [];
  const shouldIncludeBuilderNodeRendererStyles =
    options.includeBuilderNodeRendererStyles !== false &&
    hasRenderableBuilderNodes(builderSectionChildren, { mode: "freeform" });
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
    void improntaLog("site_shell_publishedshell.warn", {
      message: "[published-shell] unknown builder child node roles",
      sectionId: slot.sectionId,
      sectionTypeKey: slot.sectionTypeKey,
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
  const mediaIds = collectBuilderImageMediaIds(builderSectionChildren);
  const collectionSourceKeys = collectBuilderCollectionSourceKeys(builderSectionChildren);
  const serviceSupabase =
    mediaIds.length > 0 || collectionSourceKeys.length > 0
      ? createServiceRoleClient()
      : null;
  const mediaSupabase = mediaIds.length > 0 ? serviceSupabase : null;
  const [
    builderComponents,
    mediaAssets,
    collections,
    actorSession,
    editModeActive,
    componentStyleDefaults,
  ] =
    await Promise.all([
      treeHasInstances(builderSectionChildren)
        ? loadBuilderComponentsForTenant(tenantId)
        : Promise.resolve({}),
      mediaSupabase
        ? listBuilderImageMediaAssets(mediaSupabase, tenantId, mediaIds)
        : Promise.resolve(undefined),
      serviceSupabase && collectionSourceKeys.length > 0
        ? resolveCollectionDataSources(serviceSupabase, tenantId, collectionSourceKeys)
        : Promise.resolve(undefined),
      getCachedActorSession(),
      isEditModeActiveForTenant(tenantId),
      loadPublicComponentStyleDefaults(tenantId),
    ]);
  // Wave 5B · #38 — shell blocks honor node-level conditional visibility too
  // (e.g. a "Sign in" CTA shown only to signed-out visitors). Request-cached
  // session = no extra round-trip. In EDIT mode pass NO context so every block
  // stays selectable on the canvas; the live storefront evaluates the rule.
  const visibilityContext = editModeActive
    ? undefined
    : { locale, signedIn: Boolean(actorSession.user) };
  // Phase B.2.B — wrap each shell section in the same `data-cms-section`
  // outer the homepage composer uses (see homepage-cms-sections.tsx). The
  // EditShell selection layer queries `[data-cms-section]` to detect
  // hover / click; without this wrapper, shell sections are visible but
  // not selectable. Markers + fields are identical to body sections so
  // selection chrome, inspector binding, and save flow all work without
  // any special-case code paths.
  return (
    <div
      key={slot.sectionId}
      data-cms-section=""
      data-section-id={
        slot.sectionTypeKey === "site_header"
          ? SITE_HEADER_SELECTION_ID
          : slot.sectionId
      }
      data-section-type-key={slot.sectionTypeKey}
      data-slot-key={slot.slotKey}
      data-sort-order={slot.sortOrder}
      data-builder-node-id={
        slot.sectionTypeKey === "site_header" ? undefined : builderNodeId
      }
    >
      {shouldIncludeBuilderNodeRendererStyles ? (
        <BuilderNodeRendererStyles />
      ) : null}
      <Comp
        sectionId={slot.sectionId}
        tenantId={tenantId}
        locale={locale}
        preview={false}
        props={props}
        publicPathPrefix={publicPathPrefix}
        builderNodeBindings={builderNodeBindings}
      />
      {builderSectionChildren.length > 0
        ? renderBuilderNodes(builderSectionChildren, {
            publicPathPrefix,
            mode: "freeform",
            includeRendererStyles: false,
            dataSources: { mediaAssets, collections },
            // Phase 3 — resolve live component instances in shell slots too.
            // Gated: the DB query only runs when the slot actually has instances.
            components: builderComponents,
            visibilityContext,
            componentStyleDefaults,
            renderSectionEmbed: makeSectionEmbedRenderer({
              tenantId,
              locale,
              publicPathPrefix,
              // WS-A A5 — on the shell EDIT canvas, interactive header-widget
              // embeds render their static placeholder (no live widget / auth
              // read / data fetch); the published shell mounts the real widget.
              // Pure-render embeds ignore `preview`, so they are unaffected.
              editorMode: editModeActive,
            }),
          })
        : null}
    </div>
  );
}
