/**
 * Platform brand — back-compat re-export layer.
 *
 * The canonical source of truth moved to `@/lib/brand/tulala`. This file
 * exists so the hundreds of existing `PLATFORM_BRAND` imports scattered
 * across pages, metadata, emails, and analytics keep resolving without a
 * mass rename during the Rostra → Tulala rebrand. New code should import
 * from `@/lib/brand/tulala` directly.
 */
import { TULALA_BRAND, TENANT_EXAMPLE_BRAND } from "@/lib/brand/tulala";

export const PLATFORM_BRAND = TULALA_BRAND;
export { TENANT_EXAMPLE_BRAND };
