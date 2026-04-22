/**
 * Client-safe subset of the section registry.
 *
 * The full registry in `./registry.ts` imports each section's Component +
 * Editor + server-side helpers. Some section Components (e.g.
 * featured_talent) depend on server-only APIs (`next/headers`,
 * `node:crypto`) via their fetch helpers. When a "use client" module
 * (like section-editor.tsx) imports from `./registry.ts`, webpack pulls
 * all of that server-only graph into the client bundle and errors.
 *
 * This module mirrors the registry shape but only re-exports:
 *   - section meta (label, description, businessPurpose, visibleToAgency)
 *   - Editor component (always client — "use client" at the top of each
 *     section's Editor.tsx file)
 *   - current schema version
 *
 * Server paths keep importing `./registry.ts` for full access. Client
 * paths import from here and get no server-only transitive deps.
 */

import type { ComponentType } from "react";

import { heroMeta } from "./hero/meta";
import { HeroEditor } from "./hero/Editor";

import { trustStripMeta } from "./trust_strip/meta";
import { TrustStripEditor } from "./trust_strip/Editor";

import { ctaBannerMeta } from "./cta_banner/meta";
import { CtaBannerEditor } from "./cta_banner/Editor";

import { categoryGridMeta } from "./category_grid/meta";
import { CategoryGridEditor } from "./category_grid/Editor";

import { destinationsMosaicMeta } from "./destinations_mosaic/meta";
import { DestinationsMosaicEditor } from "./destinations_mosaic/Editor";

import { testimonialsTrioMeta } from "./testimonials_trio/meta";
import { TestimonialsTrioEditor } from "./testimonials_trio/Editor";

import { processStepsMeta } from "./process_steps/meta";
import { ProcessStepsEditor } from "./process_steps/Editor";

import { featuredTalentMeta } from "./featured_talent/meta";
import { FeaturedTalentEditor } from "./featured_talent/Editor";

import { galleryStripMeta } from "./gallery_strip/meta";
import { GalleryStripEditor } from "./gallery_strip/Editor";

import { imageCopyAlternatingMeta } from "./image_copy_alternating/meta";
import { ImageCopyAlternatingEditor } from "./image_copy_alternating/Editor";

import { pressStripMeta } from "./press_strip/meta";
import { PressStripEditor } from "./press_strip/Editor";

import { valuesTrioMeta } from "./values_trio/meta";
import { ValuesTrioEditor } from "./values_trio/Editor";

import type { SectionEditorProps, SectionMeta } from "./types";

export interface SectionEditorRegistryEntry {
  meta: SectionMeta;
  currentVersion: number;
  Editor: ComponentType<SectionEditorProps<Record<string, unknown>>>;
}

export const SECTION_EDITOR_REGISTRY: Record<
  string,
  SectionEditorRegistryEntry
> = {
  hero: {
    meta: heroMeta,
    currentVersion: 1,
    Editor: HeroEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  trust_strip: {
    meta: trustStripMeta,
    currentVersion: 1,
    Editor: TrustStripEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  cta_banner: {
    meta: ctaBannerMeta,
    currentVersion: 1,
    Editor: CtaBannerEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  category_grid: {
    meta: categoryGridMeta,
    currentVersion: 1,
    Editor: CategoryGridEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  destinations_mosaic: {
    meta: destinationsMosaicMeta,
    currentVersion: 1,
    Editor: DestinationsMosaicEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  testimonials_trio: {
    meta: testimonialsTrioMeta,
    currentVersion: 1,
    Editor: TestimonialsTrioEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  process_steps: {
    meta: processStepsMeta,
    currentVersion: 1,
    Editor: ProcessStepsEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  featured_talent: {
    meta: featuredTalentMeta,
    currentVersion: 1,
    Editor: FeaturedTalentEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  gallery_strip: {
    meta: galleryStripMeta,
    currentVersion: 1,
    Editor: GalleryStripEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  image_copy_alternating: {
    meta: imageCopyAlternatingMeta,
    currentVersion: 1,
    Editor: ImageCopyAlternatingEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  press_strip: {
    meta: pressStripMeta,
    currentVersion: 1,
    Editor: PressStripEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
  values_trio: {
    meta: valuesTrioMeta,
    currentVersion: 1,
    Editor: ValuesTrioEditor as unknown as ComponentType<
      SectionEditorProps<Record<string, unknown>>
    >,
  },
};

export function getSectionEditorEntry(
  key: string,
): SectionEditorRegistryEntry | null {
  return SECTION_EDITOR_REGISTRY[key] ?? null;
}
