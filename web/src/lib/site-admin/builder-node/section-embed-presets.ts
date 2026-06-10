/**
 * Curated `section_embed` presets — the "Tulala component" entries surfaced in
 * the element-library Add picker. Each maps a friendly label to a curated
 * section `sectionTypeKey` plus a sensible default `config` (the section's own
 * props payload, identical in shape to what the section Editor writes for a CMS
 * instance). Picking one inserts a `BuilderSectionEmbedNode` that the freeform
 * renderer resolves to the live curated Component (see section-embed-renderer).
 *
 * Defaults reuse the sections' own published presets where they exist
 * (featured_talent, directory) so a freshly-dropped component already looks
 * right; booking + cta carry minimal valid configs (their schemas require a
 * URL / headline respectively). The 7 extended presets (Wave 3 · T3.4) carry
 * schema-valid placeholder data verified against each section's Zod schema.
 *
 * Kept out of create.ts (which is at its max-lines budget) and imported by the
 * `createBuilderSectionEmbed` factory there.
 */
import { v11FeaturedTalentPreset } from "@/lib/site-admin/sections/featured_talent/presets";
import { fashionDirectoryPreset } from "@/lib/site-admin/sections/directory/presets";

import type { BuilderNode } from "./types";
import { makeId } from "./make-id";

export interface SectionEmbedPreset {
  /** Stable id for the picker entry. */
  id: string;
  /** Curated section registry key the embed wraps. */
  sectionTypeKey: string;
  /** Picker tile label. */
  label: string;
  /** Short picker description / search aid. */
  description: string;
  /** Default props payload for the wrapped section. */
  config: Record<string, unknown>;
}

/**
 * The four shipped Tulala components. `config` for featured_talent + directory
 * reuses each section's own canonical preset; booking + cta carry a minimal
 * schema-valid default (operator edits the URL / copy after dropping it).
 *
 * Wave 3 (T3.4) adds 7 more: testimonials_trio, gallery_strip, stats,
 * faq_accordion, team_grid, logo_cloud, location_discovery. Every config is
 * authored to pass its section's Zod schema at runtime — see
 * section-embed-presets.test.ts for schema-parse assertions.
 */
export const SECTION_EMBED_PRESETS: ReadonlyArray<SectionEmbedPreset> = [
  // ── Original 4 ────────────────────────────────────────────────────────────
  {
    id: "directory",
    sectionTypeKey: "directory",
    label: "Directory",
    description:
      "Full filterable talent directory with search, filters, and live roster cards.",
    config: { ...fashionDirectoryPreset } as Record<string, unknown>,
  },
  {
    id: "featured-talent",
    sectionTypeKey: "featured_talent",
    label: "Featured talent",
    description: "A curated grid of featured roster profiles.",
    config: { ...v11FeaturedTalentPreset } as Record<string, unknown>,
  },
  {
    id: "booking",
    sectionTypeKey: "booking_widget",
    label: "Booking",
    description: "An embedded scheduling widget for booking calls or sessions.",
    config: {
      eyebrow: "Book",
      headline: "Schedule a call",
      intro: "Pick a time that works for you.",
      // Allow-listed scheduling host (operator replaces with their own link).
      url: "https://calendly.com/your-workspace/intro",
      variant: "inline",
      buttonLabel: "Book a call",
      ratio: "4/3",
      presentation: {},
    },
  },
  {
    id: "cta",
    sectionTypeKey: "cta_banner",
    label: "CTA",
    description: "A conversion banner with headline, copy, and call-to-action buttons.",
    config: {
      eyebrow: "Ready when you are",
      headline: "Let's create something together",
      copy: "Tell us about your project and we'll match you with the right talent.",
      primaryCta: { label: "Start an inquiry", href: "/contact" },
      secondaryCta: { label: "Explore talent", href: "/directory" },
      variant: "minimal-band",
      bandTone: "ivory",
      insetCard: true,
      presentation: {},
    },
  },

  // ── Wave 3 · T3.4 additions ───────────────────────────────────────────────

  /**
   * testimonials_trio — social-proof quote cards. Three editorial quotes with
   * cycling champagne/blush/sage accent palette. Default `variant:"trio-card"`.
   * Schema: testimonialsTrioSchemaV1 (sections/testimonials_trio/schema.ts).
   */
  {
    id: "testimonials-trio",
    sectionTypeKey: "testimonials_trio",
    label: "Testimonials",
    description:
      "Three elegant quote cards with palette accents — ideal for social proof in high-consideration verticals.",
    config: {
      eyebrow: "What clients say",
      headline: "Trusted by leading brands",
      items: [
        {
          quote:
            "Working with this team was seamless from first inquiry to final delivery. The talent matched our brand exactly.",
          author: "Sofia Reyes",
          context: "Creative Director, Maison Soleil",
          accent: "champagne",
        },
        {
          quote:
            "We've worked with agencies across three continents — this experience stood apart. Responsive, professional, and exceptional results.",
          author: "James Whitfield",
          context: "Producer, Blanc Studio",
          accent: "blush",
        },
        {
          quote:
            "The roster depth is remarkable. We found our lead for a global campaign in under 48 hours.",
          author: "Mei Lin",
          context: "Head of Marketing, Apertura",
          accent: "sage",
        },
      ],
      variant: "trio-card",
      defaultAccent: "auto",
      presentation: {},
    },
  },

  /**
   * gallery_strip — editorial image mosaic. Three images with cycling aspect
   * ratios (wide / tall / square). `src` values use Unsplash editorial URLs —
   * operator replaces with real agency photography.
   * Schema: gallerySchemaV1 (sections/gallery_strip/schema.ts).
   * Note: items.src must be a valid URL (schema: z.string().url()).
   */
  {
    id: "gallery-strip",
    sectionTypeKey: "gallery_strip",
    label: "Gallery",
    description:
      "An editorial mosaic of images with cycling aspect ratios — scroll-rail, grid, or mosaic layout.",
    config: {
      eyebrow: "Portfolio",
      headline: "Behind the lens",
      items: [
        {
          src: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80",
          alt: "Editorial fashion portrait — wide",
          aspect: "wide",
        },
        {
          src: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=80",
          alt: "Model portrait in natural light — tall",
          aspect: "tall",
        },
        {
          src: "https://images.unsplash.com/photo-1529139574466-a303027614a1?w=800&q=80",
          alt: "Behind-the-scenes creative set — square",
          aspect: "square",
        },
      ],
      variant: "mosaic",
      caption: "Replace these with your agency's own editorial photography.",
      presentation: {},
    },
  },

  /**
   * stats — key metric tiles with large typographic values. Default `variant:"row"`
   * with 4 stats; operator replaces with real figures.
   * Schema: statsSchemaV1 (sections/stats/schema.ts).
   */
  {
    id: "stats",
    sectionTypeKey: "stats",
    label: "Stats",
    description:
      "Large typographic stat tiles — talent count, years of experience, markets, bookings.",
    config: {
      eyebrow: "By the numbers",
      headline: "Scale that speaks for itself",
      items: [
        { value: "200+", label: "Talent represented" },
        { value: "12", label: "Years in the industry" },
        { value: "40+", label: "Markets worldwide" },
        { value: "98%", label: "Client satisfaction" },
      ],
      variant: "row",
      align: "center",
      presentation: {},
    },
  },

  /**
   * faq_accordion — collapsible Q&A pairs. Four representative FAQ items
   * covering common talent-booking questions. `defaultOpen:-1` (all collapsed).
   * Schema: faqAccordionSchemaV1 (sections/faq_accordion/schema.ts).
   */
  {
    id: "faq-accordion",
    sectionTypeKey: "faq_accordion",
    label: "FAQ",
    description:
      "Collapsible frequently asked questions — bordered, minimal, or card layout variants.",
    config: {
      eyebrow: "FAQ",
      headline: "Common questions",
      intro: "Everything you need to know about working with us.",
      items: [
        {
          question: "How do I start an inquiry?",
          answer:
            "Browse our directory and click 'Start inquiry' on any talent profile, or contact us directly and we'll match you with the right fit for your brief.",
        },
        {
          question: "What types of talent do you represent?",
          answer:
            "We represent models, chefs, musicians, photographers, and creative professionals across a wide range of disciplines and markets.",
        },
        {
          question: "How are rates determined?",
          answer:
            "Rates vary by talent, project scope, usage rights, and market. We provide a detailed quote after reviewing your brief — no surprises.",
        },
        {
          question: "Do you work internationally?",
          answer:
            "Yes. We have active rosters across multiple markets and can source and coordinate talent for projects worldwide.",
        },
      ],
      variant: "bordered",
      defaultOpen: -1,
      presentation: {},
    },
  },

  /**
   * team_grid — team/staff portrait grid. Three placeholder members in the
   * `portrait` variant (3-column desktop). imageUrl is optional in the schema
   * so members without photos render gracefully.
   * Schema: teamGridSchemaV1 (sections/team_grid/schema.ts).
   */
  {
    id: "team-grid",
    sectionTypeKey: "team_grid",
    label: "Team",
    description:
      "Portrait cards for your agency's team or key people — portrait, circle, or row layout.",
    config: {
      eyebrow: "The team",
      headline: "Who you'll work with",
      intro: "A dedicated team behind every booking.",
      members: [
        {
          name: "Alexandra Voss",
          role: "Founder & Creative Director",
          bio: "15 years shaping creative talent strategy across fashion, hospitality, and lifestyle brands.",
          imageUrl:
            "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=600&q=80",
          imageAlt: "Alexandra Voss — Founder",
        },
        {
          name: "Marco Delgado",
          role: "Head of Talent",
          bio: "Scouts and develops roster talent across Latin America and Southern Europe.",
          imageUrl:
            "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80",
          imageAlt: "Marco Delgado — Head of Talent",
        },
        {
          name: "Nadia Chen",
          role: "Client Relations",
          bio: "Ensures every client brief is matched with exactly the right talent, on time and on brief.",
          imageUrl:
            "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&q=80",
          imageAlt: "Nadia Chen — Client Relations",
        },
      ],
      variant: "portrait",
      columnsDesktop: 3,
      presentation: {},
    },
  },

  /**
   * logo_cloud — client / press logo strip. Six placeholder logos using the
   * Tulala wordmark SVG (operator replaces with real client/press logos). Uses
   * `muted` variant so logos render as desaturated — standard for trust strips.
   * logoSchema requires imageUrl to be a valid URL and alt to be a non-empty string.
   * Schema: logoCloudSchemaV1 (sections/logo_cloud/schema.ts).
   */
  {
    id: "logo-cloud",
    sectionTypeKey: "logo_cloud",
    label: "Logo cloud",
    description:
      "Client, press, or partner logos — mono, color, or muted variant. Drop and replace URLs.",
    config: {
      eyebrow: "As seen in",
      logos: [
        {
          imageUrl: "https://tulala.digital/logo-mark.svg",
          alt: "Client logo 1",
        },
        {
          imageUrl: "https://tulala.digital/logo-mark.svg",
          alt: "Client logo 2",
        },
        {
          imageUrl: "https://tulala.digital/logo-mark.svg",
          alt: "Client logo 3",
        },
        {
          imageUrl: "https://tulala.digital/logo-mark.svg",
          alt: "Client logo 4",
        },
        {
          imageUrl: "https://tulala.digital/logo-mark.svg",
          alt: "Client logo 5",
        },
        {
          imageUrl: "https://tulala.digital/logo-mark.svg",
          alt: "Client logo 6",
        },
      ],
      columnsDesktop: 6,
      variant: "muted",
      presentation: {},
    },
  },

  /**
   * location_discovery — "Local faces, international reach" map/grid block.
   * `source:"manual"` so it renders the operator-authored items immediately
   * without a DB query; `showMap:true` activates the editorial map visual.
   * `href` items use legacy string format (auto-coerced by optionalLinkRefOrLegacy).
   * Schema: locationDiscoverySchemaV1 (sections/location_discovery/schema.ts).
   *
   * This is the "one-click drop" for the interactive market map that the
   * Impronta homepage uses (and that P2-IMPRONTA wires as the real markets block).
   */
  {
    id: "location-discovery",
    sectionTypeKey: "location_discovery",
    label: "Location map",
    description:
      "Interactive market map with per-city talent counts — the 'Local faces, international reach' block.",
    config: {
      eyebrow: "Where we work",
      headline: "Local faces, international reach",
      subheadline:
        "We place talent across key markets and can source across borders for any brief.",
      source: "manual",
      showMap: true,
      showCount: true,
      maxItems: 8,
      layout: "grid",
      ctaLabel: "Browse all markets",
      ctaHref: "/directory",
      items: [
        {
          label: "Riviera Maya",
          region: "Mexico",
          href: "/directory?market=riviera-maya",
          count: 24,
          featured: true,
          status: "active",
        },
        {
          label: "Mexico City",
          region: "Mexico",
          href: "/directory?market=cdmx",
          count: 18,
          status: "active",
        },
        {
          label: "Buenos Aires",
          region: "Argentina",
          href: "/directory?market=buenos-aires",
          count: 12,
          status: "active",
        },
        {
          label: "Los Angeles",
          region: "United States",
          href: "/directory?market=los-angeles",
          count: 0,
          status: "coming_soon",
        },
        {
          label: "Madrid",
          region: "Spain",
          href: "/directory?market=madrid",
          count: 0,
          status: "coming_soon",
        },
      ],
      presentation: {},
    },
  },
];

const SECTION_EMBED_PRESET_BY_ID = new Map(
  SECTION_EMBED_PRESETS.map((preset) => [preset.id, preset] as const),
);

const SECTION_EMBED_PRESET_BY_TYPE_KEY = new Map(
  SECTION_EMBED_PRESETS.map((preset) => [preset.sectionTypeKey, preset] as const),
);

export function getSectionEmbedPreset(
  id: string,
): SectionEmbedPreset | undefined {
  return SECTION_EMBED_PRESET_BY_ID.get(id);
}

/**
 * Friendly operator-facing label for a curated section embed, keyed by its
 * `sectionTypeKey` (e.g. "featured_talent" → "Featured talent", "directory" →
 * "Directory"). Used by the layers tree / navigator to name a `section_embed`
 * row by what it IS rather than the raw key. Unknown keys (a curated section we
 * never minted a picker preset for) return `undefined`, so callers can fall
 * back to a humanized key.
 */
export function sectionEmbedTypeLabel(
  sectionTypeKey: string,
): string | undefined {
  return SECTION_EMBED_PRESET_BY_TYPE_KEY.get(sectionTypeKey)?.label;
}

/**
 * Build a `section_embed` BuilderNode for a curated section type key, seeded
 * with that type's default config when one is registered above. Unknown keys
 * still produce a valid node (empty config → the renderer shows a placeholder),
 * so the factory never throws.
 */
export function createBuilderSectionEmbed(sectionTypeKey: string): BuilderNode {
  const preset = SECTION_EMBED_PRESET_BY_TYPE_KEY.get(sectionTypeKey);
  return {
    id: makeId("section_embed"),
    kind: "section_embed",
    props: {
      sectionTypeKey,
      config: preset ? { ...preset.config } : {},
    },
  };
}
