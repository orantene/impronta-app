/**
 * TEMP dev-only visual-QA harness for the Noir & Or homepage blocks.
 *
 * Renders every new block (8 composition presets + the 2 freeform section
 * templates) stacked, through the real `renderBuilderNodes` path. Mirrors the
 * `/dev/template-preview/[key]` harness: top-level `app/dev/*` route (NOT in the
 * `(public)` group, which needs tenant context), production-gated, renderer sheet
 * emitted once, fonts loaded explicitly. The Noir & Or palette is projected as
 * `--token-*` CSS vars on the canvas root so the token references resolve true to
 * the mockup (and the literal fallbacks baked into each factory match anyway).
 *
 * URL: /dev/noir-qa  (·  ?lang=es exercises the per-node i18n overlay)
 * DELETE before merge — not for production.
 */
import { notFound } from "next/navigation";

import type { Locale } from "@/i18n/config";
import { buildAddGallerySectionTemplate } from "@/lib/site-admin/add-gallery/section-templates";
import {
  BuilderNodeRendererStyles,
  BuilderNodeRevealRuntime,
  renderBuilderNodes,
} from "@/lib/site-admin/builder-node/render";
import {
  createBuilderNodeCompositionPreset,
  type BuilderNodeCompositionPresetId,
} from "@/lib/site-admin/builder-node/composition-presets";

export const dynamic = "force-dynamic";

type Entry =
  | { label: string; kind: "preset"; id: BuilderNodeCompositionPresetId }
  | { label: string; kind: "template"; id: string };

// Homepage order, top to bottom, matching the mockup composition.
const ORDER: ReadonlyArray<Entry> = [
  { label: "hero-slider", kind: "template", id: "hero-slider" },
  { label: "marquee-ticker", kind: "preset", id: "marquee-ticker" },
  { label: "featured-faces-board", kind: "preset", id: "featured-faces-board" },
  { label: "divisions-row", kind: "preset", id: "divisions-row" },
  { label: "story-house", kind: "template", id: "story-house" },
  { label: "campaigns-lookbook", kind: "preset", id: "campaigns-lookbook" },
  { label: "stat-band-editorial", kind: "preset", id: "stat-band-editorial" },
  { label: "testimonials-trio", kind: "preset", id: "testimonials-trio" },
  { label: "cta-banner-spotlight", kind: "preset", id: "cta-banner-spotlight" },
  { label: "footer-editorial", kind: "preset", id: "footer-editorial" },
];

// Noir & Or palette + display fonts projected as the token CSS vars the factories
// reference (so they resolve in-theme without the tenant theme scope).
const NOIR_VARS: React.CSSProperties = {
  ["--token-color-background" as string]: "#100e13",
  ["--token-color-ink" as string]: "#ece4d3",
  ["--token-color-primary" as string]: "#c6a14e",
  ["--token-color-accent" as string]: "#e0c074",
  ["--token-color-border" as string]: "rgba(198,161,78,0.26)",
  ["--token-typography-heading-font-family" as string]:
    "'Cormorant Garamond', Georgia, serif",
  ["--token-typography-body-font-family" as string]:
    "'Inter', ui-sans-serif, system-ui, sans-serif",
};

// Review harness renders the blocks statically — strip revealOnView so nothing
// sits hidden behind a scroll-triggered fade (which read as "missing/broken"
// when glancing at the page without scrolling each section into view).
function stripReveal<T>(node: T): T {
  const n = node as {
    props?: { style?: Record<string, unknown> };
    children?: unknown[];
  };
  if (n.props?.style) {
    delete n.props.style.revealOnView;
    delete n.props.style.revealDelay;
  }
  if (Array.isArray(n.children)) n.children.forEach((c) => stripReveal(c));
  return node;
}

export default async function NoirQaPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const sp = await searchParams;
  const locale = (sp.lang === "es" ? "es" : "en") as Locale;
  // The renderer resolves localizable props through an ordered fallback chain;
  // ES falls back to the EN base props the factories author.
  const contentLocale = {
    locale,
    defaultLocale: "en",
    chain: locale === "es" ? (["es", "en"] as const) : (["en"] as const),
  };

  return (
    <main
      data-theme-canvas-root=""
      style={{
        ...NOIR_VARS,
        background: "#100e13",
        color: "#ece4d3",
        minHeight: "100vh",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {/* Display fonts true to the mockup. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* Dev-only harness: a plain font link is fine here. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Inter:wght@300;400;500;600&display=swap"
      />
      {/* Renderer sheet once; per-block calls pass includeRendererStyles:false. */}
      <BuilderNodeRendererStyles />
      {ORDER.map((entry) => {
        const built =
          entry.kind === "preset"
            ? createBuilderNodeCompositionPreset(entry.id)
            : buildAddGallerySectionTemplate(entry.id);
        const node = built ? stripReveal(built) : null;
        return (
          <div key={entry.id} data-noir-qa={entry.id}>
            {node
              ? renderBuilderNodes([node], {
                  contentLocale,
                  includeRendererStyles: false,
                  includeFontLinks: false,
                })
              : null}
          </div>
        );
      })}
      <BuilderNodeRevealRuntime />
    </main>
  );
}
