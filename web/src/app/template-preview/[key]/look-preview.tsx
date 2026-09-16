/**
 * LookPreview — `/template-preview/<lookId>?kind=look&type=<businessType>`
 *
 * Renders a Look (Layer 1) instantiated with a business type's components
 * (Layer 2) and fixture imagery, through the SAME storefront pipeline a tenant
 * page uses (`HomepageCmsSections` against a real tenant id, the pattern
 * `WorkspaceTemplatePreview` established). The Look's theme patch is merged
 * over the preview tenant's branding so the tokens paint exactly as they
 * would after `composeSiteFromBrief` writes `theme_json_draft`.
 *
 * Header + page + footer are concatenated into one freeform tree: the shell is
 * builder nodes like everything else, and a preview that hid it would hide the
 * part of a Look people judge first.
 *
 * Gated to a signed-in user by the page (D-TPL-13). Example data only; it
 * never reads or writes a tenant's own pages.
 */

import { PublicDiscoveryStateProvider } from "@/components/directory/public-discovery-state";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import type { Locale } from "@/i18n/config";
import {
  SITE_PAGE_ROLES,
  buildComponentsForType,
  exampleContext,
  familyForType,
  fixtureImageResolver,
  getLook,
  instantiateSite,
  type SiteLocale,
  type SitePageRole,
} from "@/lib/site-admin/builder-core/site-templates";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import type { WorkspacePreviewContext } from "@/lib/site-admin/server/preview-workspace-context";
import { loadPublicBranding } from "@/lib/site-admin/server/reads";
import {
  designTokensToCssVars,
  designTokensToDataAttrs,
  resolveDesignTokens,
} from "@/lib/site-admin/tokens/resolve";

export function parseSitePageRole(raw: string | undefined): SitePageRole {
  return (SITE_PAGE_ROLES as readonly string[]).includes(raw ?? "") ? (raw as SitePageRole) : "home";
}

export async function LookPreview({
  lookId,
  typeId,
  page,
  locale,
  tenant,
  bare,
}: {
  lookId: string;
  typeId: string;
  page: SitePageRole;
  locale: SiteLocale;
  tenant: WorkspacePreviewContext | null;
  /** Hide the context strip (for screenshots and the Lab iframe). */
  bare: boolean;
}) {
  const look = getLook(lookId);
  if (!look) return null;

  const family = familyForType(typeId);
  const ctx = exampleContext(family, typeId, locale);
  const site = instantiateSite({
    look,
    locale,
    identity: ctx.identity,
    images: fixtureImageResolver,
    components: buildComponentsForType(typeId, ctx),
  });

  const branding = tenant ? await loadPublicBranding(tenant.tenantId) : null;
  const baseTokens = resolveDesignTokens(branding);
  const tokens = { ...baseTokens, ...site.themePatch };
  const cssVars = designTokensToCssVars(tokens);
  const dataAttrs = designTokensToDataAttrs(tokens);

  const snapshot: HomepageSnapshot = {
    version: 1,
    publishedAt: new Date().toISOString(),
    pageVersion: 0,
    locale: locale as Locale,
    fields: { title: `${look.title[locale]} · ${typeId}`, metaDescription: null, introTagline: null },
    templateSchemaVersion: 1,
    slots: [],
    builderTree: [...site.shell.header, ...site.pages[page], ...site.shell.footer],
  };

  return (
    <div
      data-testid="look-preview"
      data-look={look.id}
      data-business-type={typeId}
      data-page={page}
      data-theme-canvas-root=""
      data-card-design-scope=""
      {...dataAttrs}
      // Body text inherits from `color.neutral` on a tenant host (globals.css
      // `--foreground` chain); mirror that here so inherited colours match.
      style={{ minHeight: "100vh", ...(cssVars as React.CSSProperties), color: "var(--token-color-neutral)", backgroundColor: "var(--token-color-background)" }}
    >
      {bare ? null : (
        <div
          data-testid="look-preview-context"
          style={{ padding: "8px 14px", fontSize: 12, background: "#101418", color: "#9BA8B7", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          Look <strong style={{ color: "#E6EDF3" }}>{look.id}</strong> · type{" "}
          <strong style={{ color: "#E6EDF3" }}>{typeId}</strong> ({family}) · page {page} · {locale}.
          Example data and fixture photos; nothing here belongs to a tenant.
          {site.issues.length > 0 ? <> · {site.issues.length} issue(s): {site.issues.join("; ")}</> : null}
        </div>
      )}
      {tenant ? (
        // The storefront mounts this provider for the connected blocks
        // (`directory` renders a HeroSearch that reads it); the preview must too
        // or an agency Look throws on its About page.
        <PublicDiscoveryStateProvider>
          <HomepageCmsSections snapshot={snapshot} tenantId={tenant.tenantId} locale={locale as Locale} />
        </PublicDiscoveryStateProvider>
      ) : (
        <p style={{ padding: 24 }}>No workspace could be resolved for the preview context.</p>
      )}
    </div>
  );
}
