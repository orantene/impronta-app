/**
 * Canonical tree relocated to the product so the design a tenant can pick in the
 * page builder IS the design the fidelity harness scores.
 * Source of truth: src/lib/site-admin/builder-node/page-designs/impronta.ts
 *
 * HARNESS NOTE (section_embeds): impronta still uses `section_embed` for connected
 * blocks (discipline rail, featured talent, markets band). heroFind is freeform
 * layers (title, search form, CTAs). The fidelity renderer has no section registry
 * injected, so embed nodes render as `null`. The scored frames therefore show:
 * heroFind fully (freeform search hero), heroClassic fully, process/pillars/join/
 * finalCta fully. The discipline rail,
 * featured talent, and markets map are invisible in harness output.
 *
 * This is an honest limitation — score the design only on what the frames show.
 * To close the gap, the section_embed renderer would need to be injected into the
 * harness (or the embed sections stubbed with freeform primitives for harness
 * scoring). Tracked as a follow-up in the builder audit (2026-06-02 I-8 note).
 *
 * TALENT IMAGERY NOTE: the three stage-card images in heroClassic are live
 * Supabase storage URLs (https://pluhdapdnuiulvxmyspd.supabase.co/…). The
 * perf-budget logs them as "remote" and does not count them toward payload; the
 * harness captures will show placeholder broken-image icons (no network to the
 * Supabase CDN during offline capture). This is a known gap; replace with
 * root-relative photos from web/public when first-party roster photography is
 * available.
 */
export { improntaDesign } from "../../../src/lib/site-admin/builder-node/page-designs/impronta";
