"use client";

import { cleanSectionName as cleanSectionNameRaw } from "@/lib/site-admin/clean-section-name";

import { useEditContext } from "./edit-context";
import { useBuilderTree } from "./builder-tree-bridge";
import {
  useSelectedSectionId,
  useSelectedBuilderNodeId,
} from "./selection-bridge";
import {
  humanizeSectionTypeKey,
  inspectorTabItemsForKeys,
  resolveInspectorVisibleTabs,
  type InspectorTabKey,
} from "./inspector-tab-config";
import {
  filterInspectorTabsByAdvanced,
  hasHiddenAdvancedInspectorTabs,
} from "./advanced-mode-visibility";
import { useAdvancedMode } from "./advanced-mode";
import { resolveStandaloneBuilderNodeForContent } from "./inspectors/builder-node-content-utils";

function cleanSectionName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = cleanSectionNameRaw(raw);
  return cleaned || null;
}

export function useInspectorVisibleTabs() {
  const { loadedSection, slots } = useEditContext();
  // WS2 — tree VALUE from the micro-store (builder-tree-bridge).
  const builderTree = useBuilderTree();
  // W2 (selection-bridge) — selection VALUES from the micro-store.
  const selectedSectionId = useSelectedSectionId();
  const selectedBuilderNodeId = useSelectedBuilderNodeId();

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

  const { advanced } = useAdvancedMode();

  const resolvedTabKeys = resolveInspectorVisibleTabs({
    sectionTypeKey:
      loadedSection?.sectionTypeKey ?? skeletonHint?.typeKey ?? null,
    selectedStandaloneBuilderNode,
  });

  // Advanced OFF hides Data (bindings) + Motion — the node keeps any overrides
  // it already has (styles still render); only the editing tab is hidden.
  const visibleTabKeys = filterInspectorTabsByAdvanced(resolvedTabKeys, advanced);
  const hasHiddenAdvancedTabs = hasHiddenAdvancedInspectorTabs(
    resolvedTabKeys,
    advanced,
  );

  const tabItems = inspectorTabItemsForKeys(visibleTabKeys);

  return { tabItems, visibleTabKeys, hasHiddenAdvancedTabs };
}

export type { InspectorTabKey };
