/**
 * WorkspaceTemplatePreview — the STOREFRONT half of `/template-preview/[key]`.
 *
 * A `db-template` row whose `target_context` is `workspace` or `both` is, by
 * definition, a candidate for the platform Default Storefront. The live render
 * path for that is, in `agency-home-storefront.tsx`:
 *
 *     <HomepageCmsSections snapshot={{ slots: [], builderTree }} tenantId locale />
 *
 * a freeform snapshot (tree only, no curated slots) rendered against a REAL
 * tenant id, which is what lets the connected nodes — featured talent, the
 * discipline grid, roster repeaters — populate. This component reuses that exact
 * call rather than introducing a second renderer, so what the operator sees in
 * the Lab is produced by the same code that serves a tenant.
 *
 * The one thing the preview must add back is the THEME. On a tenant host, the
 * root layout projects `resolveDesignTokens(branding)` onto <html>; the preview
 * runs on the platform host, where that projection resolves to registry
 * defaults. So the tokens are loaded for the preview tenant and projected onto
 * this wrapper, which is where the builder's own canvas projector puts them too.
 */

import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import type { Locale } from "@/i18n/config";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import { loadPublicBranding } from "@/lib/site-admin/server/reads";
import type { WorkspacePreviewContext } from "@/lib/site-admin/server/preview-workspace-context";
import {
  designTokensToCssVars,
  designTokensToDataAttrs,
  resolveDesignTokens,
} from "@/lib/site-admin/tokens/resolve";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/** Copy for the context strip, so the operator never guesses whose data this is. */
function sourceLabel(source: WorkspacePreviewContext["source"]): string {
  switch (source) {
    case "requested":
      return "requested workspace";
    case "hub":
      return "platform hub workspace";
    default:
      return "oldest active workspace";
  }
}

export async function WorkspaceTemplatePreview({
  title,
  metaDescription,
  builderTree,
  tenant,
  locale,
}: {
  title: string;
  metaDescription: string | null;
  builderTree: BuilderNode[];
  /** Null only when the database has no usable workspace at all. */
  tenant: WorkspacePreviewContext | null;
  locale: Locale;
}) {
  const branding = tenant ? await loadPublicBranding(tenant.tenantId) : null;
  const tokens = resolveDesignTokens(branding);
  const cssVars = designTokensToCssVars(tokens);
  const dataAttrs = designTokensToDataAttrs(tokens);
  const headingFamily = tokens["typography.heading-font-family"]?.trim();
  const bodyFamily = tokens["typography.body-font-family"]?.trim();
  if (headingFamily) cssVars["--site-heading-font"] = headingFamily;
  if (bodyFamily) cssVars["--site-body-font"] = bodyFamily;

  const snapshot: HomepageSnapshot = {
    version: 1,
    publishedAt: new Date().toISOString(),
    pageVersion: 0,
    locale,
    fields: { title, metaDescription, introTagline: null },
    templateSchemaVersion: 1,
    // Freeform full-page design: tree only, no curated slots. This is the exact
    // snapshot shape `agency-home-storefront.tsx` builds for the platform
    // default, so it takes the same branch inside HomepageCmsSections.
    slots: [],
    builderTree,
  };

  return (
    <div
      data-testid="workspace-template-preview"
      data-theme-canvas-root=""
      {...dataAttrs}
      style={{ minHeight: "100vh", ...(cssVars as React.CSSProperties) }}
    >
      <div
        data-testid="workspace-template-preview-context"
        style={{
          padding: "8px 14px",
          fontSize: 12,
          background: "#101418",
          color: "#9BA8B7",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {tenant ? (
          <>
            Storefront preview, rendered against{" "}
            <strong style={{ color: "#E6EDF3" }}>{tenant.displayName}</strong> (
            {sourceLabel(tenant.source)}). Connected sections show that
            workspace&rsquo;s real roster, the same way a tenant would see them.
            Add <code>?tenant=slug</code> to preview against another workspace.
          </>
        ) : (
          <>
            No workspace could be resolved, so connected sections below have no
            roster to draw from and will render empty. That is a gap in this
            preview, not in the design.
          </>
        )}
      </div>
      {tenant ? (
        <HomepageCmsSections
          snapshot={snapshot}
          tenantId={tenant.tenantId}
          locale={locale}
        />
      ) : null}
    </div>
  );
}
