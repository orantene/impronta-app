/**
 * Dev-only template-preview harness.
 *
 * Renders a full platform-default builder tree in isolation so QA can
 * screenshot the defaults without needing a seeded `lvh.me` host or an
 * `agency_domains` entry.
 *
 * URL: /dev/template-preview/[key]
 *
 * Supported keys:
 *   default-storefront  — the agency homepage default (PLATFORM_DEFAULT_STOREFRONT_TREE)
 *   default-talent      — the talent Max-profile default (buildDefaultTalentProfileTree
 *                         + hydrateTalentTree with a fixture profile)
 *
 * Gated: production returns 404. Mirrors the section-sandbox gate pattern
 * (`/dev/section-sandbox/[type]/page.tsx`).
 *
 * NOTE ON EMBEDS: the storefront tree contains `section_embed` nodes
 * (`featured_talent`, `talent_type_grid`). This harness has no tenant
 * context, so `renderSectionEmbed` is null — the renderer omits those nodes
 * silently. Their placeholder state is therefore NOT visible here; only
 * the surrounding structural chrome (headings, CTA bands, layout) renders.
 * This is intentional: the goal is layout + structure QA, not live roster data.
 */

import { notFound } from "next/navigation";

import {
  BuilderNodeRendererStyles,
  renderBuilderNodes,
} from "@/lib/site-admin/builder-node";
import { PLATFORM_DEFAULT_STOREFRONT_TREE } from "@/lib/site-admin/server/default-storefront-tree";
import {
  buildDefaultTalentProfileTree,
  hydrateTalentTree,
} from "@/lib/talent-site/default-talent-tree";
import { demoTemplatePreviewHydration } from "@/lib/talent-site/templates/preview-hydration";
import { loadPlatformDefaultTheme } from "@/lib/platform/default-theme";
import {
  designTokensToCssVars,
  designTokensToDataAttrs,
} from "@/lib/site-admin/tokens/resolve";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------

export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { key } = await params;

  if (key !== "default-storefront" && key !== "default-talent") {
    notFound();
  }

  // Load the platform default theme so tokens / component style defaults resolve
  // correctly — mirrors TalentSiteFreeformRenderer and the /t/[code]/[slug] page.
  const surface = key === "default-talent" ? "talent" : "workspace";
  const platformDefault = await loadPlatformDefaultTheme(surface);

  const tokens = platformDefault.tokens;
  const hasTokens = Object.keys(tokens).length > 0;
  const cssVars = hasTokens ? designTokensToCssVars(tokens) : {};
  const headingFamily = tokens["typography.heading-font-family"]?.trim();
  const bodyFamily = tokens["typography.body-font-family"]?.trim();
  if (headingFamily) cssVars["--site-heading-font"] = headingFamily;
  if (bodyFamily) cssVars["--site-body-font"] = bodyFamily;
  const dataAttrs = hasTokens ? designTokensToDataAttrs(tokens) : {};

  // Build the tree for the requested key.
  const tree =
    key === "default-storefront"
      ? PLATFORM_DEFAULT_STOREFRONT_TREE
      : (() => {
          const base = buildDefaultTalentProfileTree();
          // Reuse the SHARED demo persona the public preview route falls back to,
          // so the dev harness and the public route render the identical fixture.
          const { tokens } = demoTemplatePreviewHydration();
          return hydrateTalentTree(base, tokens);
        })();

  const label =
    key === "default-storefront"
      ? "Default Storefront"
      : "Default Talent Profile";

  return (
    <div style={{ minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Dev header — mirrors section-sandbox chrome */}
      <header
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid #e5e5e5",
          background: "white",
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: 12,
          color: "#666",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <strong>template preview</strong>
        <span>·</span>
        <code>{key}</code>
        <span>·</span>
        <span>{label}</span>
        <span>·</span>
        <span style={{ color: "#999" }}>
          section_embed nodes render empty (no tenant context — layout QA only)
        </span>
      </header>

      {/* Full-width canvas with platform-default tokens projected as CSS vars
          on `data-theme-canvas-root` — mirrors TalentSiteFreeformRenderer and
          /t/[code]/[slug]. Renderer styles emitted once here; the renderBuilderNodes
          call below passes includeRendererStyles=false. */}
      <main
        data-theme-canvas-root=""
        {...dataAttrs}
        style={{
          ...(cssVars as React.CSSProperties),
          backgroundColor:
            key === "default-storefront"
              ? "#0c0c0e" // storefront is dark; the tree sets its own bg
              : "var(--token-color-background, #ffffff)",
          minHeight: "100vh",
          width: "100%",
        }}
      >
        <BuilderNodeRendererStyles />
        {renderBuilderNodes(tree, {
          mode: "freeform",
          includeRendererStyles: false,
          includeFontLinks: false,
          publicPathPrefix: "",
          componentStyleDefaults: platformDefault.componentStyles,
          // No renderSectionEmbed: embeds degrade to nothing (see file header note).
          renderSectionEmbed: null,
        })}
      </main>
    </div>
  );
}
