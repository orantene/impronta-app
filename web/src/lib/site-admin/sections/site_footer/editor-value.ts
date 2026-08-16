/**
 * editor-value.ts — PURE defaults layer for the `site_footer` section editor.
 *
 * Extracted from `Editor.tsx` so the F5 regression is guarded by a node test.
 * See `../site_header/editor-value.ts` for the full rationale: this object is
 * the base of every `onChange` payload, so it MUST spread `initial` rather than
 * whitelist fields, or unlisted schema fields (`nodePresentation`, and anything
 * added to the schema later) are erased on the operator's next edit.
 */

import type { SiteFooterV1 } from "./schema";

/** Apply editor defaults to the incoming section props, preserving all fields. */
export function withSiteFooterEditorDefaults(
  initial: Partial<SiteFooterV1>,
): SiteFooterV1 {
  return {
    ...initial,
    brand: initial.brand ?? {},
    brandDisplay: initial.brandDisplay ?? "image-and-text",
    columns: initial.columns ?? [],
    social: initial.social ?? [],
    legal: initial.legal ?? { links: [] },
    variant: initial.variant ?? "standard",
    tone: initial.tone ?? "follow",
    presentation: initial.presentation,
  } as SiteFooterV1;
}
