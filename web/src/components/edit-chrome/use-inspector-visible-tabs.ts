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
  resolveInspectorChrome,
  type InspectorStyleMount,
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
  const currentLoadedSection =
    loadedSection?.id === selectedSectionId ? loadedSection : null;

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

  const chrome = resolveInspectorChrome({
    sectionTypeKey:
      currentLoadedSection?.sectionTypeKey ?? skeletonHint?.typeKey ?? null,
    selectedStandaloneBuilderNode,
  });

  // Advanced OFF hides Data (bindings) — the node keeps any overrides it
  // already has (styles still render); only the editing tab is hidden.
  const visibleTabKeys = filterInspectorTabsByAdvanced(chrome.tabKeys, advanced);
  const hasHiddenAdvancedTabs = hasHiddenAdvancedInspectorTabs(
    chrome.tabKeys,
    advanced,
  );

  const tabItems = inspectorTabItemsForKeys(visibleTabKeys);

  return {
    tabItems,
    visibleTabKeys,
    hasHiddenAdvancedTabs,
    styleMount: chrome.styleMount,
  };
}

export type { InspectorStyleMount, InspectorTabKey };
