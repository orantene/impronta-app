/**
 * Built-in Designs' style token DEFAULTS by slug (the same map each Design
 * payload carries as `tokenDefaults`). Render paths layer these under the
 * talent's site tokens; they never override a talent value. Light module (no
 * builder trees), safe for client bundles.
 */
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import { typeSystemComponentStyleDefaults } from "./design-type-system";
import { FOLIO_DESIGN_TOKEN_DEFAULTS } from "./folio-defaults";
import { GRIDLINE_DESIGN_TOKEN_DEFAULTS } from "./gridline-defaults";
import { MAISON_V2_TOKEN_DEFAULTS } from "./maison-v2-tokens";

const DESIGN_TOKEN_DEFAULTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "maison-v2": MAISON_V2_TOKEN_DEFAULTS,
  folio: FOLIO_DESIGN_TOKEN_DEFAULTS,
  gridline: GRIDLINE_DESIGN_TOKEN_DEFAULTS,
};

const NONE: Readonly<Record<string, string>> = Object.freeze({});

export function designTokenDefaults(slug: string | null | undefined): Readonly<Record<string, string>> {
  if (!slug) return NONE;
  return DESIGN_TOKEN_DEFAULTS[slug.trim().toLowerCase()] ?? NONE;
}

/** Slug form, for render paths that only know the Design (its defaults decide). */
export function designComponentStyleDefaults(
  slug: string | null | undefined,
  base: ComponentStyleDefaults,
): ComponentStyleDefaults {
  return typeSystemComponentStyleDefaults(designTokenDefaults(slug), base);
}
