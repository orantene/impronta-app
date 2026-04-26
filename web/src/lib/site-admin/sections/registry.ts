/**
 * Phase 5 — section registry.
 *
 * Platform-owned catalog of section types. Tenants instantiate these via
 * cms_sections rows; homepage composer references instances via
 * cms_page_sections. New types ship as a new directory + PR entry here.
 */

import type { SectionRegistryEntry } from "./types";
import { heroMeta } from "./hero/meta";
import { heroMigrations } from "./hero/migrations";
import { heroSchemasByVersion, type HeroV1 } from "./hero/schema";
import { HeroComponent } from "./hero/Component";
import { HeroEditor } from "./hero/Editor";

import { trustStripMeta } from "./trust_strip/meta";
import { trustStripMigrations } from "./trust_strip/migrations";
import {
  trustStripSchemasByVersion,
  type TrustStripV1,
} from "./trust_strip/schema";
import { TrustStripComponent } from "./trust_strip/Component";
import { TrustStripEditor } from "./trust_strip/Editor";

import { ctaBannerMeta } from "./cta_banner/meta";
import { ctaBannerMigrations } from "./cta_banner/migrations";
import { ctaBannerSchemasByVersion, type CtaBannerV1 } from "./cta_banner/schema";
import { CtaBannerComponent } from "./cta_banner/Component";
import { CtaBannerEditor } from "./cta_banner/Editor";

import { categoryGridMeta } from "./category_grid/meta";
import { categoryGridMigrations } from "./category_grid/migrations";
import {
  categoryGridSchemasByVersion,
  type CategoryGridV1,
} from "./category_grid/schema";
import { CategoryGridComponent } from "./category_grid/Component";
import { CategoryGridEditor } from "./category_grid/Editor";

import { destinationsMosaicMeta } from "./destinations_mosaic/meta";
import { destinationsMosaicMigrations } from "./destinations_mosaic/migrations";
import {
  destinationsMosaicSchemasByVersion,
  type DestinationsMosaicV1,
} from "./destinations_mosaic/schema";
import { DestinationsMosaicComponent } from "./destinations_mosaic/Component";
import { DestinationsMosaicEditor } from "./destinations_mosaic/Editor";

import { testimonialsTrioMeta } from "./testimonials_trio/meta";
import { testimonialsTrioMigrations } from "./testimonials_trio/migrations";
import {
  testimonialsTrioSchemasByVersion,
  type TestimonialsTrioV1,
} from "./testimonials_trio/schema";
import { TestimonialsTrioComponent } from "./testimonials_trio/Component";
import { TestimonialsTrioEditor } from "./testimonials_trio/Editor";

// ── M8 new sections ──────────────────────────────────────────────────────
import { processStepsMeta } from "./process_steps/meta";
import { processStepsMigrations } from "./process_steps/migrations";
import {
  processStepsSchemasByVersion,
  type ProcessStepsV1,
} from "./process_steps/schema";
import { ProcessStepsComponent } from "./process_steps/Component";
import { ProcessStepsEditor } from "./process_steps/Editor";

import { imageCopyAlternatingMeta } from "./image_copy_alternating/meta";
import { imageCopyAlternatingMigrations } from "./image_copy_alternating/migrations";
import {
  imageCopyAlternatingSchemasByVersion,
  type ImageCopyAlternatingV1,
} from "./image_copy_alternating/schema";
import { ImageCopyAlternatingComponent } from "./image_copy_alternating/Component";
import { ImageCopyAlternatingEditor } from "./image_copy_alternating/Editor";

import { valuesTrioMeta } from "./values_trio/meta";
import { valuesTrioMigrations } from "./values_trio/migrations";
import {
  valuesTrioSchemasByVersion,
  type ValuesTrioV1,
} from "./values_trio/schema";
import { ValuesTrioComponent } from "./values_trio/Component";
import { ValuesTrioEditor } from "./values_trio/Editor";

import { pressStripMeta } from "./press_strip/meta";
import { pressStripMigrations } from "./press_strip/migrations";
import {
  pressStripSchemasByVersion,
  type PressStripV1,
} from "./press_strip/schema";
import { PressStripComponent } from "./press_strip/Component";
import { PressStripEditor } from "./press_strip/Editor";

import { galleryStripMeta } from "./gallery_strip/meta";
import { galleryStripMigrations } from "./gallery_strip/migrations";
import {
  gallerySchemasByVersion,
  type GalleryStripV1,
} from "./gallery_strip/schema";
import { GalleryStripComponent } from "./gallery_strip/Component";
import { GalleryStripEditor } from "./gallery_strip/Editor";

import { featuredTalentMeta } from "./featured_talent/meta";
import { featuredTalentMigrations } from "./featured_talent/migrations";
import {
  featuredTalentSchemasByVersion,
  type FeaturedTalentV1,
} from "./featured_talent/schema";
import { FeaturedTalentComponent } from "./featured_talent/Component";
import { FeaturedTalentEditor } from "./featured_talent/Editor";

// ── M9 archetype expansion ───────────────────────────────────────────────
import { marqueeMeta } from "./marquee/meta";
import { marqueeMigrations } from "./marquee/migrations";
import {
  marqueeSchemasByVersion,
  type MarqueeV1,
} from "./marquee/schema";
import { MarqueeComponent } from "./marquee/Component";
import { MarqueeEditor } from "./marquee/Editor";

import { statsMeta } from "./stats/meta";
import { statsMigrations } from "./stats/migrations";
import {
  statsSchemasByVersion,
  type StatsV1,
} from "./stats/schema";
import { StatsComponent } from "./stats/Component";
import { StatsEditor } from "./stats/Editor";

import { faqAccordionMeta } from "./faq_accordion/meta";
import { faqAccordionMigrations } from "./faq_accordion/migrations";
import {
  faqAccordionSchemasByVersion,
  type FaqAccordionV1,
} from "./faq_accordion/schema";
import { FaqAccordionComponent } from "./faq_accordion/Component";
import { FaqAccordionEditor } from "./faq_accordion/Editor";

import { splitScreenMeta } from "./split_screen/meta";
import { splitScreenMigrations } from "./split_screen/migrations";
import {
  splitScreenSchemasByVersion,
  type SplitScreenV1,
} from "./split_screen/schema";
import { SplitScreenComponent } from "./split_screen/Component";
import { SplitScreenEditor } from "./split_screen/Editor";

// ── M10 archetype expansion (Phase 6 cont.) ─────────────────────────────
import { timelineMeta } from "./timeline/meta";
import { timelineMigrations } from "./timeline/migrations";
import { timelineSchemasByVersion, type TimelineV1 } from "./timeline/schema";
import { TimelineComponent } from "./timeline/Component";
import { TimelineEditor } from "./timeline/Editor";

import { pricingGridMeta } from "./pricing_grid/meta";
import { pricingGridMigrations } from "./pricing_grid/migrations";
import {
  pricingGridSchemasByVersion,
  type PricingGridV1,
} from "./pricing_grid/schema";
import { PricingGridComponent } from "./pricing_grid/Component";
import { PricingGridEditor } from "./pricing_grid/Editor";

import { teamGridMeta } from "./team_grid/meta";
import { teamGridMigrations } from "./team_grid/migrations";
import { teamGridSchemasByVersion, type TeamGridV1 } from "./team_grid/schema";
import { TeamGridComponent } from "./team_grid/Component";
import { TeamGridEditor } from "./team_grid/Editor";

import { contactFormMeta } from "./contact_form/meta";
import { contactFormMigrations } from "./contact_form/migrations";
import {
  contactFormSchemasByVersion,
  type ContactFormV1,
} from "./contact_form/schema";
import { ContactFormComponent } from "./contact_form/Component";
import { ContactFormEditor } from "./contact_form/Editor";

import { anchorNavMeta } from "./anchor_nav/meta";
import { anchorNavMigrations } from "./anchor_nav/migrations";
import {
  anchorNavSchemasByVersion,
  type AnchorNavV1,
} from "./anchor_nav/schema";
import { AnchorNavComponent } from "./anchor_nav/Component";
import { AnchorNavEditor } from "./anchor_nav/Editor";

import { beforeAfterMeta } from "./before_after/meta";
import { beforeAfterMigrations } from "./before_after/migrations";
import {
  beforeAfterSchemasByVersion,
  type BeforeAfterV1,
} from "./before_after/schema";
import { BeforeAfterComponent } from "./before_after/Component";
import { BeforeAfterEditor } from "./before_after/Editor";

import { contentTabsMeta } from "./content_tabs/meta";
import { contentTabsMigrations } from "./content_tabs/migrations";
import {
  contentTabsSchemasByVersion,
  type ContentTabsV1,
} from "./content_tabs/schema";
import { ContentTabsComponent } from "./content_tabs/Component";
import { ContentTabsEditor } from "./content_tabs/Editor";

import { codeEmbedMeta } from "./code_embed/meta";
import { codeEmbedMigrations } from "./code_embed/migrations";
import {
  codeEmbedSchemasByVersion,
  type CodeEmbedV1,
} from "./code_embed/schema";
import { CodeEmbedComponent } from "./code_embed/Component";
import { CodeEmbedEditor } from "./code_embed/Editor";

// ── entries ──────────────────────────────────────────────────────────────

export const heroSection: SectionRegistryEntry<HeroV1> = {
  meta: heroMeta,
  currentVersion: 1,
  schemasByVersion: heroSchemasByVersion,
  migrations: heroMigrations,
  Component: HeroComponent,
  Editor: HeroEditor,
};

export const trustStripSection: SectionRegistryEntry<TrustStripV1> = {
  meta: trustStripMeta,
  currentVersion: 1,
  schemasByVersion: trustStripSchemasByVersion,
  migrations: trustStripMigrations,
  Component: TrustStripComponent,
  Editor: TrustStripEditor,
};

export const ctaBannerSection: SectionRegistryEntry<CtaBannerV1> = {
  meta: ctaBannerMeta,
  currentVersion: 1,
  schemasByVersion: ctaBannerSchemasByVersion,
  migrations: ctaBannerMigrations,
  Component: CtaBannerComponent,
  Editor: CtaBannerEditor,
};

export const categoryGridSection: SectionRegistryEntry<CategoryGridV1> = {
  meta: categoryGridMeta,
  currentVersion: 1,
  schemasByVersion: categoryGridSchemasByVersion,
  migrations: categoryGridMigrations,
  Component: CategoryGridComponent,
  Editor: CategoryGridEditor,
};

export const destinationsMosaicSection: SectionRegistryEntry<DestinationsMosaicV1> = {
  meta: destinationsMosaicMeta,
  currentVersion: 1,
  schemasByVersion: destinationsMosaicSchemasByVersion,
  migrations: destinationsMosaicMigrations,
  Component: DestinationsMosaicComponent,
  Editor: DestinationsMosaicEditor,
};

export const testimonialsTrioSection: SectionRegistryEntry<TestimonialsTrioV1> = {
  meta: testimonialsTrioMeta,
  currentVersion: 1,
  schemasByVersion: testimonialsTrioSchemasByVersion,
  migrations: testimonialsTrioMigrations,
  Component: TestimonialsTrioComponent,
  Editor: TestimonialsTrioEditor,
};

export const processStepsSection: SectionRegistryEntry<ProcessStepsV1> = {
  meta: processStepsMeta,
  currentVersion: 1,
  schemasByVersion: processStepsSchemasByVersion,
  migrations: processStepsMigrations,
  Component: ProcessStepsComponent,
  Editor: ProcessStepsEditor,
};

export const imageCopyAlternatingSection: SectionRegistryEntry<ImageCopyAlternatingV1> = {
  meta: imageCopyAlternatingMeta,
  currentVersion: 1,
  schemasByVersion: imageCopyAlternatingSchemasByVersion,
  migrations: imageCopyAlternatingMigrations,
  Component: ImageCopyAlternatingComponent,
  Editor: ImageCopyAlternatingEditor,
};

export const valuesTrioSection: SectionRegistryEntry<ValuesTrioV1> = {
  meta: valuesTrioMeta,
  currentVersion: 1,
  schemasByVersion: valuesTrioSchemasByVersion,
  migrations: valuesTrioMigrations,
  Component: ValuesTrioComponent,
  Editor: ValuesTrioEditor,
};

export const pressStripSection: SectionRegistryEntry<PressStripV1> = {
  meta: pressStripMeta,
  currentVersion: 1,
  schemasByVersion: pressStripSchemasByVersion,
  migrations: pressStripMigrations,
  Component: PressStripComponent,
  Editor: PressStripEditor,
};

export const galleryStripSection: SectionRegistryEntry<GalleryStripV1> = {
  meta: galleryStripMeta,
  currentVersion: 1,
  schemasByVersion: gallerySchemasByVersion,
  migrations: galleryStripMigrations,
  Component: GalleryStripComponent,
  Editor: GalleryStripEditor,
};

export const featuredTalentSection: SectionRegistryEntry<FeaturedTalentV1> = {
  meta: featuredTalentMeta,
  currentVersion: 1,
  schemasByVersion: featuredTalentSchemasByVersion,
  migrations: featuredTalentMigrations,
  Component: FeaturedTalentComponent,
  Editor: FeaturedTalentEditor,
};

export const marqueeSection: SectionRegistryEntry<MarqueeV1> = {
  meta: marqueeMeta,
  currentVersion: 1,
  schemasByVersion: marqueeSchemasByVersion,
  migrations: marqueeMigrations,
  Component: MarqueeComponent,
  Editor: MarqueeEditor,
};

export const statsSection: SectionRegistryEntry<StatsV1> = {
  meta: statsMeta,
  currentVersion: 1,
  schemasByVersion: statsSchemasByVersion,
  migrations: statsMigrations,
  Component: StatsComponent,
  Editor: StatsEditor,
};

export const faqAccordionSection: SectionRegistryEntry<FaqAccordionV1> = {
  meta: faqAccordionMeta,
  currentVersion: 1,
  schemasByVersion: faqAccordionSchemasByVersion,
  migrations: faqAccordionMigrations,
  Component: FaqAccordionComponent,
  Editor: FaqAccordionEditor,
};

export const splitScreenSection: SectionRegistryEntry<SplitScreenV1> = {
  meta: splitScreenMeta,
  currentVersion: 1,
  schemasByVersion: splitScreenSchemasByVersion,
  migrations: splitScreenMigrations,
  Component: SplitScreenComponent,
  Editor: SplitScreenEditor,
};

export const timelineSection: SectionRegistryEntry<TimelineV1> = {
  meta: timelineMeta,
  currentVersion: 1,
  schemasByVersion: timelineSchemasByVersion,
  migrations: timelineMigrations,
  Component: TimelineComponent,
  Editor: TimelineEditor,
};

export const pricingGridSection: SectionRegistryEntry<PricingGridV1> = {
  meta: pricingGridMeta,
  currentVersion: 1,
  schemasByVersion: pricingGridSchemasByVersion,
  migrations: pricingGridMigrations,
  Component: PricingGridComponent,
  Editor: PricingGridEditor,
};

export const teamGridSection: SectionRegistryEntry<TeamGridV1> = {
  meta: teamGridMeta,
  currentVersion: 1,
  schemasByVersion: teamGridSchemasByVersion,
  migrations: teamGridMigrations,
  Component: TeamGridComponent,
  Editor: TeamGridEditor,
};

export const contactFormSection: SectionRegistryEntry<ContactFormV1> = {
  meta: contactFormMeta,
  currentVersion: 1,
  schemasByVersion: contactFormSchemasByVersion,
  migrations: contactFormMigrations,
  Component: ContactFormComponent,
  Editor: ContactFormEditor,
};

export const anchorNavSection: SectionRegistryEntry<AnchorNavV1> = {
  meta: anchorNavMeta,
  currentVersion: 1,
  schemasByVersion: anchorNavSchemasByVersion,
  migrations: anchorNavMigrations,
  Component: AnchorNavComponent,
  Editor: AnchorNavEditor,
};

export const beforeAfterSection: SectionRegistryEntry<BeforeAfterV1> = {
  meta: beforeAfterMeta,
  currentVersion: 1,
  schemasByVersion: beforeAfterSchemasByVersion,
  migrations: beforeAfterMigrations,
  Component: BeforeAfterComponent,
  Editor: BeforeAfterEditor,
};

export const contentTabsSection: SectionRegistryEntry<ContentTabsV1> = {
  meta: contentTabsMeta,
  currentVersion: 1,
  schemasByVersion: contentTabsSchemasByVersion,
  migrations: contentTabsMigrations,
  Component: ContentTabsComponent,
  Editor: ContentTabsEditor,
};

export const codeEmbedSection: SectionRegistryEntry<CodeEmbedV1> = {
  meta: codeEmbedMeta,
  currentVersion: 1,
  schemasByVersion: codeEmbedSchemasByVersion,
  migrations: codeEmbedMigrations,
  Component: CodeEmbedComponent,
  Editor: CodeEmbedEditor,
};

export const SECTION_REGISTRY = {
  hero: heroSection,
  trust_strip: trustStripSection,
  cta_banner: ctaBannerSection,
  category_grid: categoryGridSection,
  destinations_mosaic: destinationsMosaicSection,
  testimonials_trio: testimonialsTrioSection,
  // ── M8 new ─────────────────────────────────────────────────────────────
  process_steps: processStepsSection,
  image_copy_alternating: imageCopyAlternatingSection,
  values_trio: valuesTrioSection,
  press_strip: pressStripSection,
  gallery_strip: galleryStripSection,
  featured_talent: featuredTalentSection,
  // ── M9 archetype expansion ───────────────────────────────────────────
  marquee: marqueeSection,
  stats: statsSection,
  faq_accordion: faqAccordionSection,
  split_screen: splitScreenSection,
  // ── M10 archetype expansion ───────────────────────────────────────────
  timeline: timelineSection,
  pricing_grid: pricingGridSection,
  team_grid: teamGridSection,
  contact_form: contactFormSection,
  anchor_nav: anchorNavSection,
  before_after: beforeAfterSection,
  content_tabs: contentTabsSection,
  code_embed: codeEmbedSection,
} as const;

export type SectionTypeKey = keyof typeof SECTION_REGISTRY;

export function getSectionType(key: string): SectionRegistryEntry | null {
  if (!(key in SECTION_REGISTRY)) return null;
  return SECTION_REGISTRY[key as SectionTypeKey] as SectionRegistryEntry;
}

export function listAgencyVisibleSections(): ReadonlyArray<SectionRegistryEntry> {
  return Object.values(SECTION_REGISTRY).filter(
    (s) => s.meta.visibleToAgency,
  ) as ReadonlyArray<SectionRegistryEntry>;
}
