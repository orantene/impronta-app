"use client";

/**
 * BuilderEditorMount — the reusable entry point that mounts the ONE Page
 * Builder Core (`<EditShell>` → `<EditProvider>`) for an arbitrary
 * `BuilderContextConfig`, OUTSIDE the storefront `?edit=1` flow.
 *
 * `EditChromeMount` keeps owning the homepage path: it runs the storefront
 * gate (host kind, staff, edit cookie, page-slug resolution), builds the
 * homepage config, and renders the editor over the live storefront DOM. That
 * surface is unchanged.
 *
 * New surfaces (Platform Builder Lab = WS5, workspace/talent pages = WS6) do
 * NOT live on the storefront. They render their own page (admin route, lab
 * stage, …) and drop this mount in with a non-homepage adapter + config. Same
 * `EditProvider`, same chrome, zero forked editor code — the only difference is
 * which `surfaceConfig.surface` (adapter) the persistence calls route through.
 *
 * Because the new surfaces aren't behind the storefront engage cookie, this
 * mount renders the engaged editor directly (it does NOT render the idle
 * EditPill / PreviewPill that EditChrome toggles for the storefront). The
 * hosting page decides when to show the editor.
 */

import type { ReactNode } from "react";

import type { BuilderContextConfig } from "@/lib/site-admin/builder-core/config";
import type { CompositionData } from "@/lib/site-admin/edit-mode/composition-actions";

import { EditShell } from "@/components/edit-chrome/edit-shell";

export interface BuilderEditorMountProps {
  /**
   * The surface config — adapter + permissions + gallery policy + data sources
   * + preview subject + capabilities. Required: this is the whole point of the
   * mount. Build a non-homepage config (WS5/WS6) or pass the homepage default.
   */
  surfaceConfig: BuilderContextConfig;
  /** Active tenant id (the workspace whose builder credentials/scope apply). */
  tenantId: string;
  /** Builder plan tier for capability gating. Forwarded to EditProvider. */
  workspacePlan?: string | null;
  /** Locale the editor edits in. Defaults to the platform default in EditProvider. */
  locale?: string;
  /** Tenant default storefront locale (LocaleSwitcher prefixed URLs). */
  defaultLocale?: string;
  /**
   * The page being edited on this surface. Null/undefined → the surface's
   * primary/home page. For freeform surfaces (workspace_page / talent_page)
   * the adapter keys persistence off the resolved page; pass the surface's
   * page slug so the adapter loads/saves the right row.
   */
  pageSlug?: string | null;
  /** Tenant-published locales — primes the topbar locale switcher on first paint. */
  availableLocales?: ReadonlyArray<string>;
  /**
   * Server-prefetched composition for this surface (via
   * `surfaceConfig.surface.load(ctx)` on the server). When present the editor
   * seeds from it immediately instead of flashing an empty state; when absent
   * EditProvider runs the client-side load through the same adapter.
   */
  initialComposition?: CompositionData | null;
  /** Storefront / surface display label for the top bar. */
  tenantSiteLabel?: string | null;
  /** Workspace admin URL segment, when the surface lives under a workspace. */
  workspaceMembershipSlug?: string | null;
  /** Raw-HTML `code` insertion gate (super_admin only). */
  canInsertRawHtmlElements?: boolean;
  /** Optional extra chrome rendered inside the provider tree. */
  children?: ReactNode;
}

export function BuilderEditorMount({
  surfaceConfig,
  tenantId,
  workspacePlan = null,
  locale,
  defaultLocale,
  pageSlug = null,
  availableLocales,
  initialComposition = null,
  tenantSiteLabel = null,
  workspaceMembershipSlug = null,
  canInsertRawHtmlElements = false,
  children,
}: BuilderEditorMountProps) {
  return (
    <EditShell
      tenantId={tenantId}
      workspacePlan={workspacePlan}
      locale={locale}
      pageSlug={pageSlug}
      availableLocales={availableLocales}
      defaultLocale={defaultLocale}
      initialComposition={initialComposition}
      tenantSiteLabel={tenantSiteLabel}
      workspaceMembershipSlug={workspaceMembershipSlug}
      canInsertRawHtmlElements={canInsertRawHtmlElements}
      surfaceConfig={surfaceConfig}
    >
      {children}
    </EditShell>
  );
}
