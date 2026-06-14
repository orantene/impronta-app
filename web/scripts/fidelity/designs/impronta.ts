/**
 * Canonical tree relocated to the product so the design a tenant can pick in the
 * page builder IS the design the fidelity harness scores.
 * Source of truth: src/lib/site-admin/builder-node/page-designs/impronta.ts
 *
 * HARNESS NOTE (section_embeds): impronta uses `section_embed` for the connected
 * and Casting-Issue sections (marquee, featured talent, discipline rail, the two
 * full-bleed plates, statement, inquiry-sentence, stats). heroFind, best-for, and
 * process are freeform layers/containers. The fidelity renderer has no section
 * registry injected, so embed nodes render as `null`. The scored frames therefore
 * show: heroFind fully (freeform search hero), best-for, process, join, and
 * finalCta fully; the marquee, featured talent, discipline rail, plates, statement,
 * inquiry-sentence, and stats are invisible in harness output.
 *
 * This is an honest limitation — score the design only on what the frames show.
 * To close the gap, the section_embed renderer would need to be injected into the
 * harness (or the embed sections stubbed with freeform primitives for harness
 * scoring). Tracked as a follow-up in the builder audit (2026-06-02 I-8 note).
 *
 * MULTI-ROOT NOTE: impronta is the one page-design whose tree is a top-level array
 * of section nodes (not a single wrapping container) — see the source file.
 */
export { improntaDesign } from "../../../src/lib/site-admin/builder-node/page-designs/impronta";
