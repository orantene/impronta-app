import type { FidelityDesign } from "./html";
import { agencyDesign } from "./designs/agency";
import { editorialDesign } from "./designs/editorial";
import { saasDesign } from "./designs/saas";
import { trivialDesign } from "./designs/trivial";

/**
 * Registered fidelity designs.
 *
 * Each non-trivial design is a hand-authored BuilderNode tree that genuinely
 * exercises the P1–P3 capability stack (registry fonts via the font bridge,
 * REAL photography, a P3 repeater driven by inline `dataSources.collections`,
 * rich_text, pricing_table, hover/transition, container queries, scroll
 * animation). The per-design trees live in `./designs/*` to stay under the
 * 800-line file cap; this module is just the registry the harness iterates.
 */
export const fidelityDesigns: FidelityDesign[] = [
  trivialDesign,
  editorialDesign,
  saasDesign,
  agencyDesign,
];
