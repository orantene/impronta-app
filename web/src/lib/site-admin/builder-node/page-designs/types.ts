import type { BuilderNodeRenderDataSources } from "../render";
import type { BuilderNode } from "../types";

export type PageDesignArchetype =
  | "editorial"
  | "agency"
  | "saas"
  | "store"
  | "festival"
  | "studio";

/**
 * A productised full-page design template.
 *
 * The same object is consumed two ways:
 *  - the fidelity harness re-exports it (id/title/tree/dataSources) and scores
 *    the rendered tree — so the design a tenant picks IS the design the harness
 *    proves at fidelity;
 *  - the page-builder registers it as a one-click composition preset (label /
 *    description / archetype drive the picker card), with any P3 repeaters baked
 *    into static, self-contained children at insert time.
 */
export interface PageDesign {
  /** Stable id (also the fidelity-harness design id). */
  id: string;
  /** Long descriptive title — used by the harness + as a fallback name. */
  title: string;
  /** Short pick label for the template card, e.g. "Editorial portfolio". */
  label: string;
  /** One-line description shown on the template card. */
  description: string;
  archetype: PageDesignArchetype;
  /** Freeform BuilderNode tree — a single-root container per design. */
  tree: BuilderNode[];
  /**
   * Inline collections that drive any `container` repeater
   * (`dataBinding.repeat`) in the tree. The harness renders straight from
   * these; the preset bake expands them into static children so an inserted
   * template needs no backend data to look complete.
   */
  dataSources?: BuilderNodeRenderDataSources;
}
