/**
 * lab-cache-paths.ts — the ONE description of which cached paths a Builder Lab
 * template write invalidates.
 *
 * WHY IT IS A MODULE AND NOT TWO CONSTANTS IN TWO FILES
 * ────────────────────────────────────────────────────
 * Two writers reach the same surfaces: `registry-actions.ts` (publish /
 * unpublish / archive / restore) and `admin-platform-default-templates.ts` (the
 * platform DEFAULT pointer). They already disagreed once — the pointer write
 * revalidated NOTHING at all — and the fix for that is worthless if the two
 * files can drift apart again. Both now read this module.
 *
 * THE SEGMENT-TYPE BUG THIS ENCODES
 * ─────────────────────────────────
 * The Lab lives at `/platform/admin/builder-lab`, a CHILD of `/platform/admin`.
 * `revalidatePath("/platform/admin")` defaults to `type: "page"`, which
 * invalidates that one page and nothing nested under it — so every publish in
 * the Lab was revalidating a page the operator was not looking at, while the Lab
 * itself kept its cached RSC payload. `"layout"` invalidates the segment AND its
 * subtree, which is what the callers meant all along.
 *
 * PUBLIC PATHS ARE OPT-IN, NEVER BLANKET
 * ──────────────────────────────────────
 * `revalidatePath("/")` drops the cached data for EVERY tenant storefront, so it
 * is only correct when the write actually changed what an unconfigured tenant
 * renders — i.e. the row is (or has just become) the platform default for that
 * surface. Flipping the talent default must not cost every workspace its cached
 * branding, and publishing an unrelated starter must not either.
 *
 * Kept a plain module (NOT `"use server"`) so both action files can import these
 * values and a unit test can assert the mapping without a database.
 */

import type { PlatformTemplateSurface } from "@/lib/platform/default-templates";

/** One path + the segment type `revalidatePath` must be called with. */
export interface LabRevalidateTarget {
  path: string;
  /** Omitted means `revalidatePath`'s own default ("page"). */
  type?: "page" | "layout";
}

/**
 * The Lab's admin segment. `"layout"` deliberately: see the segment-type note
 * above — a page-type call here never reaches `/platform/admin/builder-lab`.
 */
export const PLATFORM_ADMIN_REVALIDATE: LabRevalidateTarget = {
  path: "/platform/admin",
  type: "layout",
};

/**
 * The PUBLIC render path each default surface feeds.
 *
 *  • `storefront` → `/`, the agency homepage. `agency-home-storefront.tsx`
 *    resolves the pointer on the no-published-composition branch.
 *  • `talent` → `/t/[profileCode]`, the fallback talent profile. A dynamic
 *    segment, so `revalidatePath` requires an explicit type.
 *
 * Both route files are `force-dynamic`, so there is no full-route cache to bust;
 * what this reaches is the data-cache entries created while rendering those
 * paths and the client Router Cache, so an operator's own reload after a change
 * shows the new default instead of a cached RSC payload.
 */
export const PUBLIC_PATH_FOR_SURFACE: Record<
  PlatformTemplateSurface,
  LabRevalidateTarget
> = {
  storefront: { path: "/" },
  talent: { path: "/t/[profileCode]", type: "page" },
};

/**
 * Which surfaces a template row can serve as the platform default for, given
 * its `target_context`. Mirrors the `.in("target_context", …)` filters in
 * `default-storefront-template.ts` / the talent chain: a `talent`-context row
 * can never render as a storefront default, so publishing it must not
 * invalidate `/`.
 */
export function surfacesServableByTarget(
  targetContext: string,
): PlatformTemplateSurface[] {
  const out: PlatformTemplateSurface[] = [];
  if (targetContext === "workspace" || targetContext === "both") {
    out.push("storefront");
  }
  if (targetContext === "talent" || targetContext === "both") {
    out.push("talent");
  }
  return out;
}

/**
 * The full target list for a template write.
 *
 * Always the Lab segment; PLUS a public path only for the surfaces where this
 * exact row is the live platform default. `pointerBySurface` is the caller's
 * already-loaded pointer map, so this function stays pure and does no I/O.
 */
export function revalidateTargetsForTemplateWrite(input: {
  templateId: string;
  targetContext: string;
  pointerBySurface: Partial<Record<PlatformTemplateSurface, string | null>>;
}): LabRevalidateTarget[] {
  const targets: LabRevalidateTarget[] = [PLATFORM_ADMIN_REVALIDATE];
  for (const surface of surfacesServableByTarget(input.targetContext)) {
    if (input.pointerBySurface[surface] === input.templateId) {
      targets.push(PUBLIC_PATH_FOR_SURFACE[surface]);
    }
  }
  return targets;
}

/**
 * The target list for a DEFAULT-POINTER write: the Lab segment plus the public
 * path of the surface whose pointer moved — unconditionally, because the write
 * itself is what changed the answer for that surface.
 */
export function revalidateTargetsForPointerWrite(
  surface: PlatformTemplateSurface,
): LabRevalidateTarget[] {
  return [PLATFORM_ADMIN_REVALIDATE, PUBLIC_PATH_FOR_SURFACE[surface]];
}
