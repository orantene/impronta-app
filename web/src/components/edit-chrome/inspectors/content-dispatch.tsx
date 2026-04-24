"use client";

/**
 * ContentTab — dispatch to a curated content inspector per section type, or
 * fall back to the registry's existing Editor form.
 *
 * Curated inspectors (premium canvas-native UX) live in this directory and
 * are registered explicitly below. A curated inspector takes only the
 * *content* concerns of a section (copy, CTAs, item lists, media refs); the
 * Layout and Style tabs remain canonical for presentation / decorative
 * treatment. When a curated inspector isn't available yet for a section
 * type, `GenericContent` renders the registry Editor — the composer's form
 * — so every section type is editable on day one without waiting for
 * per-type design.
 *
 * Merge semantics (generic fallback): the registry Editor takes a whole
 * payload and onChange-writes a whole payload. We splice its output back
 * into the current draft while preserving `presentation` (Layout tab is
 * canonical for those fields) so changes made in Layout/Style tabs are
 * never clobbered by a later keystroke in Content.
 */

import type { ComponentType } from "react";

import { HeroContentInspector } from "./hero-content";
import { CategoryGridContentInspector } from "./category-grid-content";
import { CtaBannerContentInspector } from "./cta-banner-content";
import { FeaturedTalentContentInspector } from "./featured-talent-content";
import { TestimonialsTrioContentInspector } from "./testimonials-trio-content";
import { GalleryStripContentInspector } from "./gallery-strip-content";
import { GenericContent } from "./generic-content";

interface ContentTabProps {
  sectionTypeKey: string;
  schemaVersion: number;
  tenantId: string;
  draftProps: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

interface CuratedInspectorProps {
  draftProps: Record<string, unknown>;
  tenantId: string;
  onChange: (next: Record<string, unknown>) => void;
}

const CURATED: Record<string, ComponentType<CuratedInspectorProps>> = {
  hero: HeroContentInspector,
  category_grid: CategoryGridContentInspector,
  cta_banner: CtaBannerContentInspector,
  featured_talent: FeaturedTalentContentInspector,
  testimonials_trio: TestimonialsTrioContentInspector,
  gallery_strip: GalleryStripContentInspector,
};

export function ContentTab({
  sectionTypeKey,
  schemaVersion,
  tenantId,
  draftProps,
  onChange,
}: ContentTabProps) {
  const Curated = CURATED[sectionTypeKey];
  if (Curated) {
    return (
      <Curated
        draftProps={draftProps}
        tenantId={tenantId}
        onChange={onChange}
      />
    );
  }
  return (
    <GenericContent
      sectionTypeKey={sectionTypeKey}
      schemaVersion={schemaVersion}
      tenantId={tenantId}
      draftProps={draftProps}
      onChange={onChange}
    />
  );
}
