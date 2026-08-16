/**
 * editor-value.ts — PURE defaults layer for the `site_header` section editor.
 *
 * Extracted from `Editor.tsx` (a "use client" React module) so the F5
 * regression can be guarded by a node test with no React/JSDOM in the loop.
 *
 * F5 — WHY THIS IS A `...initial` SPREAD AND NOT A FIELD WHITELIST:
 * the returned object is the base of every `onChange` payload the editor emits
 * (`onChange({ ...value, ...next })`). When it was built by listing fields
 * explicitly, every schema field the list forgot was ERASED from the section's
 * props the moment the operator touched any control. `regions` (the WF-5
 * fully-freeform header), `scrollTone`, `scrollThresholdPx` and
 * `nodePresentation` were all being silently dropped that way.
 *
 * Spreading `initial` first makes the named entries a DEFAULTS layer instead of
 * a filter: known fields still get their fallback, and unknown / newly-added
 * schema fields round-trip untouched without anyone having to remember to edit
 * this file.
 */

import type { SiteHeaderV1 } from "./schema";

/** Apply editor defaults to the incoming section props, preserving all fields. */
export function withSiteHeaderEditorDefaults(
  initial: Partial<SiteHeaderV1>,
): SiteHeaderV1 {
  return {
    ...initial,
    brand: initial.brand ?? { href: "/" },
    brandDisplay: initial.brandDisplay ?? "image-and-text",
    navItems: initial.navItems ?? [],
    primaryCta: initial.primaryCta,
    sticky: initial.sticky ?? true,
    tone: initial.tone ?? "surface",
    variant: initial.variant ?? "standard",
    authArea: initial.authArea ?? {
      showAccountMenu: true,
      showLanguageToggle: true,
      showDiscoveryTools: true,
    },
    // Phase 6B — reusable header cluster + density. Defaults keep every
    // existing tenant visually unchanged (empty cluster, no density attrs).
    socialLinks: initial.socialLinks ?? [],
    contactLinks: initial.contactLinks ?? [],
    density: initial.density,
    presentation: initial.presentation,
  } as SiteHeaderV1;
}
