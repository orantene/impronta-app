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

import { Fragment } from "react";

import { getCachedActorSession } from "@/lib/server/request-cache";
import { improntaLog } from "@/lib/server/structured-log";
import { loadPublishedShell } from "@/lib/site-admin/server/shell-reads";
import { resolveShellSocialContact } from "@/lib/site-admin/server/shell-social-contact";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import {
  buildBuilderNodeRoleBindings,
  builderSectionNodeAddressKey,
  BuilderNodeRendererStyles,
  collectPresentNodeKinds,
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
import {
  collectShellSideFreeformNodes,
  isShellLandmarkNode,
  prepareShellTree,
  resolveShellSidePlan,
  type ShellSideKey,
} from "@/lib/site-admin/builder-node/shell-render-plan";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { makeSectionEmbedRenderer } from "@/lib/site-admin/builder-node/section-embed-renderer";
import { loadBuilderComponentsForTenant } from "@/lib/site-admin/edit-mode/builder-components-loader";
import { loadPublicComponentStyleDefaults } from "@/lib/site-admin/server/reads";
import { isEditModeActiveForTenant } from "@/lib/site-admin/edit-mode/is-active";
import { listBuilderImageMediaAssets } from "@/lib/site-admin/media/assets";
import { resolveCollectionDataSources } from "@/lib/site-admin/collections/server";
import {
  collectNavCollectionSourceKeys,
  resolveNavCollectionDataSources,
} from "@/lib/site-admin/server/nav-collection-sources";
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
 * Data the shell's NAV drawer can ask for.
 *
 * Both of these were reachable from the schema and reachable from the panel,
 * and reached the renderer as nothing at all: `dataSources.socialLinks` had no
 * producer anywhere in the codebase (so a `social_links` node "bound" to
 * workspace_social_links silently fell back to its static links), and
 * `availableLocales` was a render option no caller supplied. The drawer then
 * correctly rendered nothing — which is indistinguishable from the feature not
 * existing.
 */
async function resolveShellNavData(
  tenantId: string,
  locale: Locale,
  publicPathPrefix: string,
): Promise<{
  socialLinks: ReadonlyArray<{ platform: string; href: string; label?: string }>;
  availableLocales: ReadonlyArray<{ code: string; href: string; current?: boolean }>;
}> {
  const [social, localeSettings] = await Promise.all([
    resolveShellSocialContact({ tenantId }).catch(() => null),
    loadTenantLocaleSettings(tenantId).catch(() => null),
  ]);

  const supported = (localeSettings?.supportedLocales ?? []) as readonly string[];
  const defaultLocale = (localeSettings?.defaultLocale ?? "en") as string;

  return {
    socialLinks: (social?.socialLinks ?? []).map((link: {
      platform: string;
      href: string;
      label?: string | null;
    }) => ({
      platform: link.platform,
      href: link.href,
      label: link.label ?? undefined,
    })),
    // One row per locale the tenant actually publishes. The DEFAULT locale is
    // unprefixed; every other one carries its segment — the same grammar the
    // language widget uses, so the two cannot disagree.
    availableLocales: supported.map((code) => ({
      code,
      href:
        code === defaultLocale
          ? publicPathPrefix || "/"
          : `${publicPathPrefix}/${code}`,
      current: code === locale,
    })),
  };
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
  return renderPublishedShellSide("header", {
    tenantId,
    locale,
    includeBuilderNodeRendererStyles,
  });
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
  return renderPublishedShellSide("footer", {
    tenantId,
    locale,
    includeBuilderNodeRendererStyles,
  });
}

/**
 * F3 — the one entry point both sides share.
 *
 * The decision of WHAT to render is delegated wholesale to the pure
 * `resolveShellSidePlan` (see `builder-node/shell-render-plan.ts` for the full
 * rationale and the fallback ladder). This function only executes the plan:
 *
 *   - `legacy_slot` → the pre-existing `renderShellSlot` call, with the same
 *     slot object and the same indexes built off the same (untouched) tree.
 *     Every tenant live on the shell today lands here, so their markup is
 *     byte-identical by construction rather than by careful re-derivation.
 *   - `freeform`    → render the side's tree roots directly, INCLUDING
 *     root-level nodes an operator added that no slot addresses. Those roots
 *     were silently dropped before; that was F3.
 */
async function renderPublishedShellSide(
  side: ShellSideKey,
  {
    tenantId,
    locale,
    includeBuilderNodeRendererStyles,
  }: {
    tenantId: string;
    locale: Locale;
    includeBuilderNodeRendererStyles: boolean;
  },
): Promise<React.ReactNode> {
  if (!isSiteShellEnabledForTenant(tenantId)) return null;
  const shell = await loadPublishedShell(tenantId, locale);
  if (!shell) return null;
  const slots = shell.snapshot.slots ?? [];
  const prepared = prepareShellTree(
    resolveSnapshotBuilderTree(shell.snapshot).tree,
    slots,
  );
  const plan = resolveShellSidePlan({ tree: prepared.tree, slots, side });
  if (plan.mode === "none") return null;

  if (plan.mode === "legacy_slot") {
    const builderTree = prepared.tree;
    const builderSectionNodeIds = indexBuilderSectionNodeIds(builderTree);
    const builderSectionNodes = indexBuilderSectionNodes(builderTree);
    const builderSectionChildNodeIds =
      indexBuilderSectionChildNodeIds(builderTree);
    return renderShellSlot(
      plan.slot,
      tenantId,
      locale,
      builderSectionNodeIds,
      builderSectionNodes,
      builderSectionChildNodeIds,
      { includeBuilderNodeRendererStyles },
    );
  }

  return renderFreeformShellSide({
    nodes: plan.nodes,
    tree: prepared.tree,
    slots,
    tenantId,
    locale,
    includeBuilderNodeRendererStyles,
  });
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
  // See the eject note at the <Comp> render below.
  const sectionEjected = builderSectionNode?.props.ejected === true;
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
  // A4 follow-up — built-in collection NAV sources (cms_page / cms_posts) a nav
  // node in this slot binds to. Resolved + injected into the same `collections`
  // map so the nav render case auto-populates its links from them.
  const navCollectionSourceKeys = collectNavCollectionSourceKeys(
    builderSectionChildren,
  );
  const serviceSupabase =
    mediaIds.length > 0 ||
    collectionSourceKeys.length > 0 ||
    navCollectionSourceKeys.length > 0
      ? createServiceRoleClient()
      : null;
  const mediaSupabase = mediaIds.length > 0 ? serviceSupabase : null;
  const [
    builderComponents,
    mediaAssets,
    userCollections,
    navCollections,
    actorSession,
    editModeActive,
    componentStyleDefaults,
    navData,
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
      serviceSupabase && navCollectionSourceKeys.length > 0
        ? resolveNavCollectionDataSources(
            serviceSupabase,
            tenantId,
            navCollectionSourceKeys,
            locale,
          )
        : Promise.resolve(undefined),
      getCachedActorSession(),
      isEditModeActiveForTenant(tenantId),
      loadPublicComponentStyleDefaults(tenantId),
      resolveShellNavData(tenantId, locale, publicPathPrefix)
    ]);
  // Merge the user collections + the built-in nav collections into one map so
  // every binding (user `collection:<id>` repeaters AND nav cms_page/cms_posts)
  // resolves through `dataSources.collections`. Either may be undefined.
  const collections =
    userCollections || navCollections
      ? { ...(userCollections ?? {}), ...(navCollections ?? {}) }
      : undefined;
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
      // The synthetic `__site_header__` id routes editor clicks to the curated
      // header FORM inspector, and suppressing the node id stops the header
      // being selected as a freeform node. Both are right while the curated bar
      // renders -- and wrong once it is EJECTED, because then the bar is an
      // authored tree whose blocks must be clickable like any other. Ejected
      // landmarks therefore expose their real ids.
      data-section-id={
        slot.sectionTypeKey === "site_header" && !sectionEjected
          ? SITE_HEADER_SELECTION_ID
          : slot.sectionId
      }
      data-section-type-key={slot.sectionTypeKey}
      data-slot-key={slot.slotKey}
      data-sort-order={slot.sortOrder}
      data-builder-node-id={
        slot.sectionTypeKey === "site_header" && !sectionEjected
          ? undefined
          : builderNodeId
      }
    >
      {shouldIncludeBuilderNodeRendererStyles ? (
        // REND-2 — scope the shell-slot's renderer sheet to the kinds this slot
        // uses (incl. live-resolved instance kinds via builderComponents). Edit
        // canvas keeps the full sheet so any kind can be added. Falls back to
        // the full sheet on any uncertainty (buildScopedRendererCss).
        <BuilderNodeRendererStyles
          kinds={
            editModeActive
              ? undefined
              : collectPresentNodeKinds(builderSectionChildren, builderComponents)
          }
          nodes={builderSectionChildren}
        />
      ) : null}
      {/* "2018 bye-bye" — an EJECTED landmark no longer renders its curated
       *  React component; its freeform children render in its place. Same
       *  contract the homepage composer honors (homepage-cms-sections.tsx:586-588)
       *  and the one `BuilderSectionNode.props.ejected` documents. The shell
       *  renderer used to ignore the flag entirely, which made "eject" a silent
       *  no-op on the header/footer — the one surface where replacing the
       *  curated bar with an authored tree is the whole point. */}
      {sectionEjected ? null : (
        <Comp
          sectionId={slot.sectionId}
          tenantId={tenantId}
          locale={locale}
          preview={false}
          props={props}
          publicPathPrefix={publicPathPrefix}
          builderNodeBindings={builderNodeBindings}
        />
      )}
      {builderSectionChildren.length > 0
        ? renderBuilderNodes(builderSectionChildren, {
            publicPathPrefix,
            mode: "freeform",
            includeRendererStyles: false,
            dataSources: { mediaAssets, collections, socialLinks: navData.socialLinks },
            availableLocales: navData.availableLocales,
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

/**
 * F3 — render ONE side of a FREEFORM-authored shell tree, directly.
 *
 * This is the agency-scoped port of `render-max-site.tsx`'s `renderShellRoot`:
 * walk the side's roots in order; a `site_header` / `site_footer` LANDMARK
 * renders through its bespoke section component followed by its freeform
 * children (the freeform renderer returns null for `kind: "section"`), and
 * every other root renders through `renderBuilderNodes`. Root-level operator
 * content therefore reaches the live page instead of being dropped for want of
 * a slot address — that was F3.
 *
 * Everything the slot path does for its children — media assets, user + nav
 * collection sources, live component instances, conditional visibility, scoped
 * renderer CSS, section-embed rendering, edit-canvas selection markers — is
 * done here too, over the UNION of every freeform node on the side
 * (`collectShellSideFreeformNodes`). Resolving over the union rather than
 * per-root keeps it to a single round of loads per side, exactly as before.
 */
async function renderFreeformShellSide({
  nodes,
  tree,
  slots,
  tenantId,
  locale,
  includeBuilderNodeRendererStyles,
}: {
  nodes: ReadonlyArray<BuilderNode>;
  tree: BuilderNodeTree;
  slots: ReadonlyArray<{
    slotKey: string;
    sortOrder: number;
    sectionId: string;
    sectionTypeKey: string;
    props?: Record<string, unknown>;
  }>;
  tenantId: string;
  locale: string;
  includeBuilderNodeRendererStyles: boolean;
}): Promise<React.ReactNode> {
  const publicPathPrefix = await getPublicPathPrefix();
  // The nodes the freeform renderer will actually paint: landmark children plus
  // non-landmark roots. Data sources are resolved over exactly this set.
  const freeformNodes = collectShellSideFreeformNodes(nodes);
  const mediaIds = collectBuilderImageMediaIds(freeformNodes);
  const collectionSourceKeys = collectBuilderCollectionSourceKeys(freeformNodes);
  const navCollectionSourceKeys = collectNavCollectionSourceKeys(freeformNodes);
  const serviceSupabase =
    mediaIds.length > 0 ||
    collectionSourceKeys.length > 0 ||
    navCollectionSourceKeys.length > 0
      ? createServiceRoleClient()
      : null;
  const mediaSupabase = mediaIds.length > 0 ? serviceSupabase : null;
  const [
    builderComponents,
    mediaAssets,
    userCollections,
    navCollections,
    actorSession,
    editModeActive,
    componentStyleDefaults,
    navData,
  ] = await Promise.all([
    treeHasInstances(freeformNodes)
      ? loadBuilderComponentsForTenant(tenantId)
      : Promise.resolve({}),
    mediaSupabase
      ? listBuilderImageMediaAssets(mediaSupabase, tenantId, mediaIds)
      : Promise.resolve(undefined),
    serviceSupabase && collectionSourceKeys.length > 0
      ? resolveCollectionDataSources(serviceSupabase, tenantId, collectionSourceKeys)
      : Promise.resolve(undefined),
    serviceSupabase && navCollectionSourceKeys.length > 0
      ? resolveNavCollectionDataSources(
          serviceSupabase,
          tenantId,
          navCollectionSourceKeys,
          locale,
        )
      : Promise.resolve(undefined),
    getCachedActorSession(),
    isEditModeActiveForTenant(tenantId),
    loadPublicComponentStyleDefaults(tenantId),
    resolveShellNavData(tenantId, locale, publicPathPrefix)
  ]);
  const collections =
    userCollections || navCollections
      ? { ...(userCollections ?? {}), ...(navCollections ?? {}) }
      : undefined;
  const visibilityContext = editModeActive
    ? undefined
    : { locale, signedIn: Boolean(actorSession.user) };
  const renderOptions = {
    publicPathPrefix,
    mode: "freeform" as const,
    includeRendererStyles: false,
    dataSources: { mediaAssets, collections, socialLinks: navData.socialLinks },
    availableLocales: navData.availableLocales,
    components: builderComponents,
    visibilityContext,
    componentStyleDefaults,
    renderSectionEmbed: makeSectionEmbedRenderer({
      tenantId,
      locale,
      publicPathPrefix,
      editorMode: editModeActive,
    }),
  };

  const slotByAddress = new Map<string, (typeof slots)[number]>();
  for (const slot of slots) {
    const key = builderSectionNodeAddressKey({
      sectionId: slot.sectionId,
      slotKey: slot.slotKey,
      sortOrder: slot.sortOrder,
    });
    if (key && !slotByAddress.has(key)) slotByAddress.set(key, slot);
  }
  const builderSectionChildNodeIds = indexBuilderSectionChildNodeIds(tree);

  const shouldIncludeRendererStyles =
    includeBuilderNodeRendererStyles &&
    hasRenderableBuilderNodes(freeformNodes, { mode: "freeform" });

  return (
    <>
      {shouldIncludeRendererStyles ? (
        <BuilderNodeRendererStyles
          kinds={
            editModeActive
              ? undefined
              : collectPresentNodeKinds(freeformNodes, builderComponents)
          }
          nodes={freeformNodes}
        />
      ) : null}
      {nodes.map((node) =>
        isShellLandmarkNode(node) ? (
          renderFreeformShellLandmark({
            node,
            slotByAddress,
            builderSectionChildNodeIds,
            tenantId,
            locale,
            publicPathPrefix,
            renderOptions,
          })
        ) : (
          <Fragment key={node.id}>
            {renderBuilderNodes([node], renderOptions)}
          </Fragment>
        ),
      )}
    </>
  );
}

/**
 * Render one shell LANDMARK from a freeform tree.
 *
 * The bespoke component's props come from the LIVE slot when the landmark is
 * address-matched, and from the landmark's inline `props.sectionProps` only
 * when it is not (an un-addressed landmark from an applied shell template, or a
 * second landmark the operator added). That ordering is deliberate: the slot
 * row stays authoritative, so a `cms_sections.props_jsonb` edit — the
 * SiteHeaderInspector autosave path — keeps taking effect on the live site. See
 * `hydrateShellLandmarkSectionProps` for the drift argument in full.
 *
 * The wrapper `<div>` carries the identical `data-cms-section` marker set the
 * slot path emits, so EditShell selection, inspector binding and the save flow
 * behave the same on a freeform shell as on a slot-baked one.
 */
function renderFreeformShellLandmark({
  node,
  slotByAddress,
  builderSectionChildNodeIds,
  tenantId,
  locale,
  publicPathPrefix,
  renderOptions,
}: {
  node: Extract<BuilderNode, { kind: "section" }>;
  slotByAddress: ReadonlyMap<
    string,
    { sectionId: string; props?: Record<string, unknown> }
  >;
  builderSectionChildNodeIds: ReadonlyMap<string, ReadonlyArray<string>>;
  tenantId: string;
  locale: string;
  publicPathPrefix: string;
  renderOptions: Parameters<typeof renderBuilderNodes>[1];
}): React.ReactNode {
  const sectionTypeKey = node.props.sectionTypeKey;
  const reg = getSectionType(sectionTypeKey);
  if (!reg) {
    if (process.env.NODE_ENV !== "production") {
      void improntaLog("site_shell_publishedshell.warn", {
        message: `[PublishedShell] unknown shell landmark type "${sectionTypeKey}" — landmark ignored`,
      });
    }
    return null;
  }
  const Comp = reg.Component;
  const addressKey = builderSectionNodeAddressKey({
    sectionId: node.props.sectionId ?? "",
    slotKey: node.props.slotKey,
    sortOrder: node.props.sortOrder,
  });
  const slot = addressKey ? slotByAddress.get(addressKey) : undefined;
  const rawProps = slot?.props ?? node.props.sectionProps ?? {};
  const props = prefixPublicHrefsDeep(rawProps, publicPathPrefix);
  const sectionId = slot?.sectionId ?? node.props.sectionId ?? node.id;
  const children = node.children ?? [];
  const roleBindingResult = buildBuilderNodeRoleBindings(
    (builderSectionChildNodeIds.get(node.id) ?? []).filter((id) =>
      resolveBuilderNodeRole(id),
    ),
  );
  const roleBindings = roleBindingResult.nodeIdsByRole;
  if (
    process.env.NODE_ENV !== "production" &&
    roleBindingResult.unknownNodeIds.length > 0
  ) {
    void improntaLog("site_shell_publishedshell.warn", {
      message: "[published-shell] unknown builder child node roles",
      sectionId,
      sectionTypeKey,
      unknownNodeIds: roleBindingResult.unknownNodeIds.join(", "),
    });
  }
  return (
    <div
      key={node.id}
      data-cms-section=""
      // See the identical note on the legacy-slot path: an ejected header is an
      // authored tree, so it exposes its real ids and stays node-selectable.
      data-section-id={
        sectionTypeKey === "site_header" && node.props.ejected !== true
          ? SITE_HEADER_SELECTION_ID
          : sectionId
      }
      data-section-type-key={sectionTypeKey}
      data-slot-key={node.props.slotKey ?? undefined}
      data-sort-order={node.props.sortOrder}
      data-builder-node-id={
        sectionTypeKey === "site_header" && node.props.ejected !== true
          ? undefined
          : node.id
      }
    >
      {/* "2018 bye-bye" — see the identical guard on the legacy-slot path.
       *  An EJECTED landmark renders ONLY its freeform children; the curated
       *  header/footer component is gone. This is what makes an all-freeform
       *  shell possible: without it, authored children render BELOW the
       *  curated bar (two headers), so there was no way to replace the bar. */}
      {node.props.ejected === true ? null : (
        <Comp
          sectionId={sectionId}
          tenantId={tenantId}
          locale={locale}
          preview={false}
          props={props}
          publicPathPrefix={publicPathPrefix}
          builderNodeBindings={{
            sectionNodeId: node.id,
            nodeIdsByRole: roleBindings,
          }}
        />
      )}
      {children.length > 0 ? renderBuilderNodes(children, renderOptions) : null}
    </div>
  );
}
