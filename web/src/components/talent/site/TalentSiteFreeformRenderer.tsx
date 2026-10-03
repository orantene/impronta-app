import type { ReactNode } from "react";

import {
  BuilderNodeFontLinks,
  BuilderNodeRendererStyles,
  collectPresentNodeKinds,
  hasRenderableBuilderNodes,
  renderBuilderNodes,
  type BuilderNode,
} from "@/lib/site-admin/builder-node";
import { treeHasInstances } from "@/lib/site-admin/builder-node/component-instances";
import { makeSectionEmbedRenderer } from "@/lib/site-admin/builder-node/section-embed-renderer";
import { resolveExperimentRenderContext } from "@/lib/site-admin/builder-node/experiment-context";
import { loadBuilderNodeDataSources } from "@/components/home/homepage-cms-data-sources";
import { loadBuilderComponentsForTenant } from "@/lib/site-admin/edit-mode/builder-components-loader";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";
import { resolveTenantCaptcha } from "@/lib/integrations/resolve";
import {
  designTokensToCssVars,
  designTokensToDataAttrs,
} from "@/lib/site-admin/tokens/resolve";
import { GoogleFontsLink } from "@/app/google-fonts-link";
import { designComponentStyleDefaults } from "@/lib/talent-site/theme-catalog/collection/design-token-defaults";
import {
  isTalentShellLandmark,
  renderTalentShellLandmark,
} from "@/lib/talent-site/server/render-shell-landmark";

/**
 * Public renderer for a FREEFORM talent Max snapshot (the platform-default
 * freeform profile). Renders the snapshot's `builderTree` through the SAME
 * shared builder-node renderer the agency storefront and talent extra pages
 * (`/t/[code]/[slug]`) use — it does NOT reimplement any node.
 *
 * Theming parity with `/t/[code]/[slug]`: this default profile carries no
 * per-talent theme, so it inherits the PLATFORM DEFAULT (Modern 2026) — NOT the
 * host tenant's (e.g. Impronta black/gold) which would render white-on-white on
 * the light canvas. The platform-default `componentStyles` feed the renderer as
 * `componentStyleDefaults`, and the platform-default tokens are projected as CSS
 * vars on a `data-theme-canvas-root` wrapper (with background + min-height), so
 * every bound node's `var(--token-x, fallback)` resolves to the default theme.
 *
 * The default tree is build-time hydrated with the talent's real profile data
 * (name/bio/photo/services) and is intentionally EMBED-FREE: a talent-subject
 * curated `section_embed` is unsupported (the preview-subject machinery never
 * returns the "talent" kind) and would mis-scope to the managing agency tenant's
 * data, so embeds are stripped upstream (see `buildDefaultTalentFreeformSnapshot`
 * + `stripSectionEmbeds`). The `previewSubject`/tenant plumbing below is kept so
 * that, should the feature ever support talent-subject embeds, this renderer is
 * already wired — but with embeds stripped it is currently a no-op.
 */
export async function TalentSiteFreeformRenderer({
  tree,
  locale,
  context,
  dataSources: presetDataSources,
  designSlug = null,
}: {
  tree: BuilderNode[];
  /**
   * Theme preview: the caller's canvas root already projects this Design's
   * Look tokens (`ThemeTokenPreviewFrame`). Set, this renderer inherits them
   * instead of re-projecting the platform default on a nested canvas root
   * (which painted every Design in the platform blue), uses the Design's own
   * component shapes, and renders the header / footer landmarks.
   */
  designSlug?: string | null;
  /** Pre-resolved sources (My content preview); skips the tenant load. */
  dataSources?: import("@/lib/site-admin/builder-node/render").BuilderNodeRenderDataSources;
  locale: string;
  context?: {
    tenantId: string | null;
    talentProfileId: string;
    publicPathPrefix?: string;
    /** ABTEST-1 reporting tag for the surface this tree renders on. */
    experimentSurface?: string;
  };
}): Promise<ReactNode> {
  if (!hasRenderableBuilderNodes(tree, { mode: "freeform" })) {
    return null;
  }

  const tenantId = context?.tenantId ?? null;
  const publicPathPrefix = context?.publicPathPrefix ?? "";

  const pageHasFormNode = (function hasForm(nodes: unknown): boolean {
    if (Array.isArray(nodes)) return nodes.some(hasForm);
    if (!nodes || typeof nodes !== "object") return false;
    const n = nodes as { kind?: unknown; children?: unknown };
    return n.kind === "form" || hasForm(n.children);
  })(tree);

  // Data sources + live component instances — only load when the tree actually
  // binds them AND a managing tenant exists (the loaders are tenant-scoped
  // service-role reads). Empty objects are the no-op default. The platform-
  // default theme provides componentStyleDefaults + tokens (light Modern 2026)
  // so the page renders at parity with the published talent freeform page.
  const [dataSources, components, platformDefault, experimentContext, pageCaptcha] =
    await Promise.all([
      presetDataSources
        ? Promise.resolve(presetDataSources)
        : tenantId
          ? loadBuilderNodeDataSources(tree, tenantId, locale, null, context?.talentProfileId)
          : Promise.resolve({}),
      tenantId && treeHasInstances(tree)
        ? loadBuilderComponentsForTenant(tenantId)
        : Promise.resolve({}),
      loadPlatformDefaultTheme("talent"),
      // ABTEST-1 — stable per-visitor seed for any A/B CTA/form nodes on this
      // talent surface (profile or personal site).
      resolveExperimentRenderContext({
        tenantId,
        surface: context?.experimentSurface ?? "talentSite",
      }),
      tenantId && pageHasFormNode
        ? resolveTenantCaptcha(tenantId)
        : Promise.resolve(null),
    ]);

  const captchaConfig = pageCaptcha
    ? { provider: pageCaptcha.provider, siteKey: pageCaptcha.siteKey }
    : null;

  // Curated section_embed nodes need a tenant render context. previewSubject
  // points the curated sections at THIS talent. NOTE: the default tree is
  // stripped of embeds upstream, so this renderer is effectively no-op for
  // embeds today; the plumbing is retained for forward-compatibility.
  const renderSectionEmbed =
    tenantId && context
      ? makeSectionEmbedRenderer({
          tenantId,
          locale,
          publicPathPrefix,
          previewSubject: { kind: "talent", id: context.talentProfileId, locale },
          captcha: captchaConfig,
        })
      : null;

  // Project the platform-default tokens as CSS vars + data-attrs on a
  // `data-theme-canvas-root` wrapper so every bound node's `var(--token-x,
  // fallback)` resolves to the default theme rather than inheriting the host
  // tenant's tokens from <html>. Mirrors the `/t/[code]/[slug]` sibling page.
  // A Design preview inherits its parent canvas instead (see `designSlug`).
  const inherit = Boolean(designSlug);
  const tokens = inherit ? {} : platformDefault.tokens;
  const hasTokens = Object.keys(tokens).length > 0;
  const cssVars = hasTokens ? designTokensToCssVars(tokens) : {};
  const headingFamily = tokens["typography.heading-font-family"]?.trim();
  const bodyFamily = tokens["typography.body-font-family"]?.trim();
  if (headingFamily) cssVars["--site-heading-font"] = headingFamily;
  if (bodyFamily) cssVars["--site-body-font"] = bodyFamily;
  const dataAttrs = hasTokens ? designTokensToDataAttrs(tokens) : {};
  const componentStyleDefaults = designComponentStyleDefaults(
    designSlug,
    platformDefault.componentStyles,
  );
  const renderRun = (nodes: BuilderNode[]) =>
    renderBuilderNodes(nodes, {
      publicPathPrefix,
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
      components,
      componentStyleDefaults,
      captcha: captchaConfig,
      visitorLocale: locale,
      contentLocale: { locale, defaultLocale: "en", chain: [locale, "en"] },
      ...experimentContext,
      renderSectionEmbed,
    });
  // Landmarks render through their section Component; the rest in runs so the
  // shared renderer still sees whole sibling groups.
  const body: ReactNode[] = [];
  if (inherit) {
    let run: BuilderNode[] = [];
    const flush = () => {
      if (run.length) {
        body.push(
          <div key={`run-${body.length}`} style={{ display: "contents" }}>
            {renderRun(run)}
          </div>,
        );
      }
      run = [];
    };
    for (const node of tree) {
      if (isTalentShellLandmark(node)) {
        flush();
        body.push(renderTalentShellLandmark(node, { locale, tenantId, publicPathPrefix }));
      } else {
        run.push(node);
      }
    }
    flush();
  }

  return (
    <div
      data-talent-personal-site=""
      data-talent-personal-site-freeform=""
      {...(inherit ? {} : { "data-theme-canvas-root": "" })}
      {...dataAttrs}
      style={
        inherit
          ? undefined
          : {
              ...(cssVars as React.CSSProperties),
              backgroundColor: "var(--token-color-background, #ffffff)",
              minHeight: "100vh",
            }
      }
    >
      {/* REND-2 — public render: scope the renderer sheet to the kinds this
          talent-site page uses (incl. live-resolved instance kinds). Falls back
          to the full sheet on any uncertainty (buildScopedRendererCss). */}
      <BuilderNodeRendererStyles
        kinds={collectPresentNodeKinds(tree, components)}
        nodes={tree}
      />
      <BuilderNodeFontLinks nodes={tree} components={components} />
      {hasTokens ? <GoogleFontsLink tokens={tokens} /> : null}
      {inherit ? body : renderRun(tree)}
    </div>
  );
}
