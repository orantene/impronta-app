// Composition-preset factories for the productised full-page designs.
//
// Unlike the section-pack factories (which build a small subtree from scratch),
// these adapt a canonical PageDesign tree — the same tree the fidelity harness
// scores — into an insert-ready block: repeaters are baked into static children
// and every id is re-minted so the template drops onto a page intact, editable,
// and collision-free, with no backend data required to look finished.
import { makeId } from "./create";
import {
  agencyDesign,
  bakePageDesignTree,
  editorialDesign,
  festivalDesign,
  saasDesign,
  storeDesign,
  type PageDesign,
} from "./page-designs";
import type { BuilderNode } from "./types";

type NonSectionNode = Exclude<BuilderNode, { kind: "section" }>;

function bakePageDesignPreset(design: PageDesign): NonSectionNode {
  const baked = bakePageDesignTree(design.tree, design.dataSources);
  const root = baked[0];
  if (root && root.kind !== "section") {
    return root as NonSectionNode;
  }
  // Defensive: every design is authored as a single non-section root container,
  // but if that ever changes, wrap the baked nodes so the preset stays valid.
  return {
    id: makeId("container"),
    kind: "container",
    props: { layout: "stack", style: { width: "100%", maxWidthFree: "100%" } },
    children: baked,
  } as NonSectionNode;
}

export function createEditorialPortfolioPreset(): NonSectionNode {
  return bakePageDesignPreset(editorialDesign);
}

export function createProductionAgencyPreset(): NonSectionNode {
  return bakePageDesignPreset(agencyDesign);
}

export function createSaasProductPreset(): NonSectionNode {
  return bakePageDesignPreset(saasDesign);
}

export function createPrintStorePreset(): NonSectionNode {
  return bakePageDesignPreset(storeDesign);
}

export function createLiveEventPreset(): NonSectionNode {
  return bakePageDesignPreset(festivalDesign);
}
