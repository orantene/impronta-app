/**
 * Platform DEFAULT storefront — the premium, Lab-authored freeform tree a
 * brand-new / unconfigured AGENCY tenant renders until its operator publishes a
 * bespoke homepage composition.
 *
 * This is a hand-authored {@link BuilderNodeTree} (the same shape the Builder
 * Lab persists into `builder_templates.builder_tree`). It is seeded into a
 * reserved `builder_templates` row by `scripts/seed-default-storefront.ts` and
 * resolved at render time by `resolvePlatformDefaultStorefrontTree`. Until that
 * row is published, the fallback keeps rendering the existing
 * `DefaultStorefrontBody`, so merging this code changes nothing live.
 *
 * Tenant scoping is automatic and per-tenant: the FEATURED-TALENT and
 * TALENT-BY-DISCIPLINE blocks are authored as `section_embed` nodes
 * (`featured_talent` / `talent_type_grid`) — the SAME curated sections the
 * storefront uses elsewhere. When `HomepageCmsSections` renders this tree with
 * the viewing tenant's `tenantId`, the section-embed renderer fetches THAT
 * tenant's roster + discipline taxonomy from request context (no preview
 * subject ⇒ the active tenant). The embeds self-fetch and self-scope, so the
 * wrapping `container`s deliberately carry NO `dataBinding` — a container-level
 * `featured_talent_profiles` / `tenant_directory_search` binding would make the
 * render path substitute its own built-in live grid (a generic SEARCH BOX for
 * the discipline block, a degraded actionless card grid for featured) and DROP
 * the curated embed. Curated section embeds degrade to a public-safe empty note
 * (never blank, never throw, never an operator-only link) when a tenant has no
 * roster yet.
 *
 * Idiom: matches the productised page-design templates
 * (`builder-node/page-designs/*`) — full-bleed hero with a background image +
 * overlay gradient, inline `style` escapes (paddings, colours, fonts,
 * responsive, hover), and stable string node ids.
 */

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

/** Reserved slug the fallback resolver + seed script agree on. */
export const PLATFORM_DEFAULT_STOREFRONT_SLUG = "__platform_default_storefront__";

/** Hero / brand display serif + body sans — ship in the marketing font set. */
const DISPLAY = '"Playfair Display", var(--font-playfair-display), Georgia, serif';
const BODY = '"Inter", var(--font-inter-body), system-ui, sans-serif';

/** Real editorial photo that ships in `/public/marketing/photos` (root-relative
 *  so the renderer's `isSafeBuilderImageSrc` accepts it on every tenant host). */
const HERO_IMAGE = "/marketing/photos/talent-services-hero.jpg";

/**
 * The default storefront tree. A single root `container` band stack:
 *   1. HERO            — full-bleed background image + ink overlay, eyebrow,
 *                        headline, subheading, two CTAs (Explore / Inquire).
 *   2. FEATURED TALENT — heading + a `featured_talent` section embed that
 *                        renders the tenant's roster cards (auto-scoped).
 *   3. BY DISCIPLINE   — heading + a `talent_type_grid` section embed in
 *                        dynamic mode (derives disciplines from the roster).
 *   4. CLOSING CTA     — ink band with a heading + inquire button.
 */
export const PLATFORM_DEFAULT_STOREFRONT_TREE: BuilderNodeTree = [
  {
    id: "default-storefront-page",
    kind: "container",
    props: {
      layerLabel: "Default storefront",
      layout: "stack",
      style: {
        width: "100%",
        maxWidthFree: "100%",
        gap: "0px",
        backgroundColor: "#0c0c0e",
        textColor: "#f4f1ea",
        fontFamily: BODY,
      },
    },
    children: [
      // ── HERO (full-bleed cover image + overlay) ───────────────────────────
      {
        id: "default-storefront-hero",
        kind: "container",
        props: {
          layerLabel: "Hero",
          layout: "stack",
          align: "center",
          style: {
            position: "relative",
            width: "100%",
            maxWidthFree: "100%",
            minHeight: "660px",
            paddingTop: "120px",
            paddingRight: "44px",
            paddingBottom: "120px",
            paddingLeft: "44px",
            gap: "20px",
            justifyContent: "center",
            // Cover image painted behind a darkening gradient so the white
            // headline stays legible over any photo.
            backgroundImage: `linear-gradient(180deg, rgba(8,8,10,0.55) 0%, rgba(8,8,10,0.78) 100%), url("${HERO_IMAGE}")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            textColor: "#f7f4ee",
            responsive: {
              mobile: {
                paddingTop: "84px",
                paddingBottom: "84px",
                paddingRight: "22px",
                paddingLeft: "22px",
                minHeight: "520px",
              },
            },
          },
        },
        children: [
          {
            id: "default-storefront-hero-eyebrow",
            kind: "paragraph",
            props: {
              text: "A curated roster of professionals",
              layerLabel: "Eyebrow",
              style: {
                align: "center",
                fontFamily: BODY,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                textColor: "rgba(247,244,238,0.74)",
              },
            },
          },
          {
            id: "default-storefront-hero-headline",
            kind: "heading",
            props: {
              text: "Book exceptional talent.",
              level: 1,
              layerLabel: "Headline",
              style: {
                align: "center",
                fontFamily: DISPLAY,
                fontSize: "76px",
                lineHeight: "1.02",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                textColor: "#fbf8f2",
                maxWidthFree: "920px",
                textWrap: "balance",
                marginBottomFree: "0px",
                responsive: {
                  tablet: { fontSize: "56px" },
                  mobile: { fontSize: "38px" },
                },
              },
            },
          },
          {
            id: "default-storefront-hero-subheading",
            kind: "paragraph",
            props: {
              text: "Browse our roster, explore by discipline, and start an inquiry in minutes.",
              layerLabel: "Subheading",
              style: {
                align: "center",
                fontFamily: BODY,
                fontSize: "18px",
                lineHeight: "1.6",
                textColor: "rgba(247,244,238,0.82)",
                maxWidthFree: "560px",
              },
            },
          },
          {
            id: "default-storefront-hero-ctas",
            kind: "cta_group",
            props: {
              layerLabel: "Hero actions",
              layout: "row",
              gap: "m",
              align: "center",
              style: {
                marginTopFree: "12px",
                flexWrap: "wrap",
                justifyContent: "center",
              },
            },
            children: [
              {
                id: "default-storefront-hero-cta-primary",
                kind: "button",
                props: {
                  label: "Explore talent",
                  href: "/directory",
                  tone: "primary",
                  layerLabel: "Primary CTA",
                  style: {
                    fontFamily: BODY,
                    fontSize: "14px",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    backgroundColor: "#f4f1ea",
                    textColor: "#0c0c0e",
                    borderColor: "#f4f1ea",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    transitionProperty: "background-color, transform, box-shadow",
                    transitionDuration: "200ms",
                    transitionTimingFunction: "ease",
                    hover: {
                      backgroundColor: "#ffffff",
                      scale: "1.03",
                      boxShadow: "0 16px 38px rgba(0,0,0,0.42)",
                    },
                  },
                },
              },
              {
                id: "default-storefront-hero-cta-secondary",
                kind: "button",
                props: {
                  label: "Start an inquiry",
                  href: "/directory",
                  tone: "secondary",
                  layerLabel: "Secondary CTA",
                  style: {
                    fontFamily: BODY,
                    fontSize: "14px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    backgroundColor: "transparent",
                    textColor: "#f7f4ee",
                    borderColor: "rgba(247,244,238,0.55)",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    transitionProperty: "background-color, border-color",
                    transitionDuration: "200ms",
                    transitionTimingFunction: "ease",
                    hover: {
                      backgroundColor: "rgba(247,244,238,0.1)",
                      borderColor: "rgba(247,244,238,0.85)",
                    },
                  },
                },
              },
            ],
          },
        ],
      },
      // ── FEATURED TALENT (bound to featured_talent_profiles) ───────────────
      {
        id: "default-storefront-featured",
        kind: "container",
        props: {
          layerLabel: "Featured talent",
          layout: "stack",
          align: "center",
          // NO container-level `dataBinding`: the curated `featured_talent` embed
          // below self-fetches + self-scopes to the active tenant. A container
          // `featured_talent_profiles` binding here would make the render path
          // substitute its own DEGRADED live grid (no inquiry/bookmark actions,
          // no display toggles) and silently DROP the curated embed.
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "8px",
            paddingTop: "96px",
            paddingRight: "44px",
            paddingBottom: "96px",
            paddingLeft: "44px",
            backgroundColor: "#0c0c0e",
            textColor: "#f4f1ea",
            responsive: {
              mobile: {
                paddingTop: "64px",
                paddingBottom: "64px",
                paddingRight: "22px",
                paddingLeft: "22px",
              },
            },
          },
        },
        children: [
          {
            id: "default-storefront-featured-eyebrow",
            kind: "paragraph",
            props: {
              text: "Featured talent",
              layerLabel: "Eyebrow",
              style: {
                align: "center",
                fontFamily: BODY,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                textColor: "rgba(244,241,234,0.6)",
              },
            },
          },
          {
            id: "default-storefront-featured-heading",
            kind: "heading",
            props: {
              text: "Meet the roster",
              level: 2,
              layerLabel: "Heading",
              style: {
                align: "center",
                fontFamily: DISPLAY,
                fontSize: "44px",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                textColor: "#fbf8f2",
                marginBottomFree: "24px",
                responsive: { mobile: { fontSize: "32px" } },
              },
            },
          },
          {
            id: "default-storefront-featured-embed",
            kind: "section_embed",
            props: {
              sectionTypeKey: "featured_talent",
              layerLabel: "Talent grid",
              // Headless: header copy lives in the heading nodes above, so the
              // embed renders cards only. `emptyStateText` keeps the zero-roster
              // state public-safe (a brand-new agency is the common viewer) —
              // a friendly note, never an operator-only "add roster" link.
              config: {
                eyebrow: "",
                headline: "",
                copy: "",
                headless: true,
                emptyStateText: "New talent joining soon — check back shortly.",
              },
            },
          },
        ],
      },
      // ── TALENT BY DISCIPLINE (bound to tenant_directory_search) ───────────
      {
        id: "default-storefront-disciplines",
        kind: "container",
        props: {
          layerLabel: "Talent by discipline",
          layout: "stack",
          align: "center",
          // NO container-level `dataBinding`: a `tenant_directory_search`
          // binding here makes the render path substitute a generic SEARCH BOX
          // + chip list and DROP the embed — the opposite of the authored
          // discipline-card grid. The `talent_type_grid` embed below renders the
          // cards (dynamic mode → derived from THIS tenant's roster taxonomy).
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "8px",
            paddingTop: "96px",
            paddingRight: "44px",
            paddingBottom: "96px",
            paddingLeft: "44px",
            backgroundColor: "#111114",
            borderColor: "rgba(244,241,234,0.08)",
            borderWidth: "1px 0px 1px 0px",
            borderStyle: "solid",
            textColor: "#f4f1ea",
            responsive: {
              mobile: {
                paddingTop: "64px",
                paddingBottom: "64px",
                paddingRight: "22px",
                paddingLeft: "22px",
              },
            },
          },
        },
        children: [
          {
            id: "default-storefront-disciplines-eyebrow",
            kind: "paragraph",
            props: {
              text: "Browse by discipline",
              layerLabel: "Eyebrow",
              style: {
                align: "center",
                fontFamily: BODY,
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.26em",
                textTransform: "uppercase",
                textColor: "rgba(244,241,234,0.6)",
              },
            },
          },
          {
            id: "default-storefront-disciplines-heading",
            kind: "heading",
            props: {
              text: "Find the right fit",
              level: 2,
              layerLabel: "Heading",
              style: {
                align: "center",
                fontFamily: DISPLAY,
                fontSize: "44px",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                textColor: "#fbf8f2",
                marginBottomFree: "24px",
                responsive: { mobile: { fontSize: "32px" } },
              },
            },
          },
          {
            id: "default-storefront-disciplines-embed",
            kind: "section_embed",
            props: {
              sectionTypeKey: "talent_type_grid",
              layerLabel: "Discipline grid",
              // `mode: "dynamic"` derives the cards from THIS tenant's roster
              // taxonomy (fetchTenantTalentCategories scoped to tenantId);
              // `parentCategoryMode` rolls child types up to broad disciplines.
              // Header copy lives in the heading nodes above (empty strings here).
              config: {
                mode: "dynamic",
                parentCategoryMode: true,
                maxItems: 8,
                eyebrow: "",
                headline: "",
                subheadline: "",
                seeAllLabel: "",
                emptyStateText: "Disciplines appear as you build your roster.",
              },
            },
          },
        ],
      },
      // ── CLOSING CTA ───────────────────────────────────────────────────────
      {
        id: "default-storefront-cta",
        kind: "container",
        props: {
          layerLabel: "Closing CTA",
          layout: "stack",
          align: "center",
          style: {
            width: "100%",
            maxWidthFree: "100%",
            gap: "20px",
            paddingTop: "104px",
            paddingRight: "28px",
            paddingBottom: "112px",
            paddingLeft: "28px",
            backgroundColor: "#0c0c0e",
            textColor: "#f4f1ea",
            responsive: {
              mobile: {
                paddingTop: "72px",
                paddingBottom: "80px",
              },
            },
          },
        },
        children: [
          {
            id: "default-storefront-cta-heading",
            kind: "heading",
            props: {
              text: "Ready to book?",
              level: 2,
              layerLabel: "Heading",
              style: {
                align: "center",
                fontFamily: DISPLAY,
                fontSize: "48px",
                fontWeight: 600,
                letterSpacing: "-0.01em",
                textColor: "#fbf8f2",
                maxWidthFree: "720px",
                textWrap: "balance",
                marginBottomFree: "0px",
                responsive: { mobile: { fontSize: "34px" } },
              },
            },
          },
          {
            id: "default-storefront-cta-copy",
            kind: "paragraph",
            props: {
              text: "Tell us about your project and we'll match you with the right talent.",
              layerLabel: "Copy",
              style: {
                align: "center",
                fontFamily: BODY,
                fontSize: "18px",
                lineHeight: "1.6",
                textColor: "rgba(244,241,234,0.78)",
                maxWidthFree: "520px",
              },
            },
          },
          {
            id: "default-storefront-cta-button",
            kind: "button",
            props: {
              label: "Start an inquiry",
              href: "/directory",
              tone: "primary",
              layerLabel: "CTA",
              style: {
                fontFamily: BODY,
                fontSize: "14px",
                fontWeight: 700,
                letterSpacing: "0.04em",
                marginTopFree: "4px",
                backgroundColor: "#f4f1ea",
                textColor: "#0c0c0e",
                borderColor: "#f4f1ea",
                borderWidth: "1px",
                borderStyle: "solid",
                transitionProperty: "background-color, transform, box-shadow",
                transitionDuration: "200ms",
                transitionTimingFunction: "ease",
                hover: {
                  backgroundColor: "#ffffff",
                  scale: "1.03",
                  boxShadow: "0 16px 38px rgba(0,0,0,0.42)",
                },
              },
            },
          },
        ],
      },
    ],
  },
];
