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

import { useMemo, type ComponentType } from "react";

import { useEditContext } from "../edit-context";
import { useBuilderTree } from "../builder-tree-bridge";
import { InspectorNotice } from "./kit";
import { BuilderNodeContentInspector } from "./builder-node-content";
import { resolveStandaloneBuilderNodeForContent } from "./builder-node-content-utils";
import { HeroContentInspector } from "./hero-content";
import { CategoryGridContentInspector } from "./category-grid-content";
import { CtaBannerContentInspector } from "./cta-banner-content";
import { FeaturedTalentContentInspector } from "./featured-talent-content";
import { TalentTypeGridContentInspector } from "./talent-type-grid-content";
import { TestimonialsTrioContentInspector } from "./testimonials-trio-content";
import { GalleryStripContentInspector } from "./gallery-strip-content";
import { TrustStripContentInspector } from "./trust-strip-content";
import { GenericContent } from "./generic-content";

interface ContentTabProps {
  sectionTypeKey: string;
  schemaVersion: number;
  tenantId: string;
  draftProps: Record<string, unknown>;
  selectedBuilderNodeId: string | null;
  onChange: (next: Record<string, unknown>) => void;
}

interface CuratedInspectorProps {
  draftProps: Record<string, unknown>;
  tenantId: string;
  selectedBuilderNodeId: string | null;
  onChange: (next: Record<string, unknown>) => void;
}

const CURATED: Record<string, ComponentType<CuratedInspectorProps>> = {
  hero: HeroContentInspector,
  category_grid: CategoryGridContentInspector,
  cta_banner: CtaBannerContentInspector,
  featured_talent: FeaturedTalentContentInspector,
  talent_type_grid: TalentTypeGridContentInspector,
  testimonials_trio: TestimonialsTrioContentInspector,
  gallery_strip: GalleryStripContentInspector,
  trust_strip: TrustStripContentInspector,
};

export function ContentTab({
  sectionTypeKey,
  schemaVersion,
  tenantId,
  draftProps,
  selectedBuilderNodeId,
  onChange,
}: ContentTabProps) {
  const { device } = useEditContext();
  // WS2 — tree VALUE from the micro-store (builder-tree-bridge).
  const builderTree = useBuilderTree();
  const selectedStandaloneBuilderNode = useMemo(
    () =>
      resolveStandaloneBuilderNodeForContent(
        builderTree,
        selectedBuilderNodeId,
      ),
    [builderTree, selectedBuilderNodeId],
  );
  if (selectedStandaloneBuilderNode) {
    return (
      <BuilderNodeContentInspector
        node={selectedStandaloneBuilderNode}
        tenantId={tenantId}
      />
    );
  }

  const Curated = CURATED[sectionTypeKey];
  if (Curated) {
    return (
      <>
        {device !== "desktop" ? (
          <InspectorNotice tone="info">
            Content fields without breakpoint overrides show desktop values on{" "}
            {device === "tablet" ? "Tablet" : "Mobile"}. Use the viewport rail to hide this section on a device.
          </InspectorNotice>
        ) : null}
        <Curated
          draftProps={draftProps}
          tenantId={tenantId}
          selectedBuilderNodeId={selectedBuilderNodeId}
          onChange={onChange}
        />
      </>
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
