import type { FidelityDesign } from "./html";
import { agencyDesign } from "./designs/agency";
import { editorialDesign } from "./designs/editorial";
import { festivalDesign } from "./designs/festival";
import { improntaDesign } from "./designs/impronta";
import { saasDesign } from "./designs/saas";
import { storeDesign } from "./designs/store";
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
 *
 * Scoring bar: editorial/agency/saas/store/festival @ 90.0. studio/noir/impronta
 * were not previously scored. impronta is now scored below (see scorecard note
 * in web/docs/fidelity-m2-scorecard.md and in ./designs/impronta.ts for the
 * harness gap explanation — section_embeds render null without a section
 * registry, and talent/discipline imagery is remote).
 */
export const fidelityDesigns: FidelityDesign[] = [
  trivialDesign,
  editorialDesign,
  saasDesign,
  agencyDesign,
  // P5 Lane C — two new archetypes proving the engine reaches 90 beyond the
  // first three: a light retail e-commerce product page and a dark cinematic
  // live-event page (each with the nav node, P3 repeaters, pricing_table,
  // rich_text + link, real photography, ≥2 registry faces, and ≥2 motion frames).
  storeDesign,
  festivalDesign,
  // Wave 2 flagship — the Impronta Models & Image Agency homepage. Scored from
  // captured frames; see ./designs/impronta.ts for the honest harness-gap note
  // (section_embeds + remote imagery). Score reported in the Wave-2 REPORT.
  improntaDesign,
];
