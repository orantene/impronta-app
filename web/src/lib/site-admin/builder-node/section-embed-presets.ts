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
 * URL / headline respectively).
 *
 * Kept out of create.ts (which is at its max-lines budget) and imported by the
 * `createBuilderSectionEmbed` factory there.
 */
import { v11FeaturedTalentPreset } from "@/lib/site-admin/sections/featured_talent/presets";
import { fashionDirectoryPreset } from "@/lib/site-admin/sections/directory/presets";

import type { BuilderNode } from "./types";
import { makeId } from "./create";

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
 */
export const SECTION_EMBED_PRESETS: ReadonlyArray<SectionEmbedPreset> = [
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
