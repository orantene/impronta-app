"use client";

import { cleanSectionName as cleanSectionNameRaw } from "@/lib/site-admin/clean-section-name";

import { useEditContext } from "./edit-context";
import {
  humanizeSectionTypeKey,
  inspectorTabItemsForKeys,
  resolveInspectorVisibleTabs,
  type InspectorTabKey,
} from "./inspector-tab-config";
import { resolveStandaloneBuilderNodeForContent } from "./inspectors/builder-node-content-utils";

function cleanSectionName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = cleanSectionNameRaw(raw);
  return cleaned || null;
}

export function useInspectorVisibleTabs() {
  const {
    selectedSectionId,
    selectedBuilderNodeId,
    loadedSection,
    slots,
    builderTree,
  } = useEditContext();

  const selectedStandaloneBuilderNode = resolveStandaloneBuilderNodeForContent(
    builderTree,
    selectedBuilderNodeId,
  );

  let skeletonHint: { name: string; typeKey: string } | null = null;
  if (selectedSectionId) {
    for (const entries of Object.values(slots)) {
      const found = entries.find((e) => e.sectionId === selectedSectionId);
      if (found) {
        skeletonHint = {
          name:
            cleanSectionName(found.name) ||
            humanizeSectionTypeKey(found.sectionTypeKey),
          typeKey: found.sectionTypeKey,
        };
        break;
      }
    }
  }

  const visibleTabKeys = resolveInspectorVisibleTabs({
    sectionTypeKey:
      loadedSection?.sectionTypeKey ?? skeletonHint?.typeKey ?? null,
    selectedStandaloneBuilderNode,
  });

  const tabItems = inspectorTabItemsForKeys(visibleTabKeys);

  return { tabItems, visibleTabKeys };
}

export type { InspectorTabKey };
