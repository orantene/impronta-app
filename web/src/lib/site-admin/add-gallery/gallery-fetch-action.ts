"use server";

/**
 * fetchSurfaceGalleryItems (P1) — the live Add Gallery's ONE read path.
 *
 * The gallery panel (`add-gallery-panel.tsx`) calls this on open to get the
 * merged catalog for its surface: the code catalog (filtered to the surface's
 * allowed tabs) ∪ the surface's gated published DB templates. This is the wiring
 * that was missing — `listGalleryItems` existed (WS4) but had no live caller, so
 * published `builder_templates` never reached the real builders' "+" gallery.
 *
 * Imports come from the specific modules (NOT the `add-gallery` barrel) so this
 * server module never transitively pulls in the DOM-only drag / perform-insert
 * code that the barrel re-exports.
 *
 * Trust: see `GallerySurfaceDescriptor`. `listPublishedTemplates` reads with the
 * caller's cookie session, so RLS (`status='published'`) is the real boundary;
 * the descriptor's plan/tier/target only shape which template cards show.
 */

import { listGalleryItems } from "./registry-db-merge";
import type { AddGalleryItem, GallerySurfaceDescriptor } from "./types";
import { listPublishedTemplates } from "@/lib/site-admin/builder-core/templates/registry-actions";
import type { BuilderTemplateTarget } from "@/lib/site-admin/builder-core/templates/registry-rows";

type PlanKey = "free" | "studio" | "agency" | "network";
const PLAN_KEYS: ReadonlySet<string> = new Set(["free", "studio", "agency", "network"]);

function coercePlan(plan: string | null): PlanKey | null {
  return plan && PLAN_KEYS.has(plan) ? (plan as PlanKey) : null;
}

export async function fetchSurfaceGalleryItems(
  descriptor: GallerySurfaceDescriptor,
): Promise<AddGalleryItem[]> {
  return listGalleryItems(
    {
      galleryPolicy: {
        allowedTabs: descriptor.allowedTabs,
        allowDbTemplates: descriptor.allowDbTemplates,
      },
      surfaceTarget: (descriptor.surfaceTarget ?? null) as BuilderTemplateTarget | null,
      plan: coercePlan(descriptor.plan),
      talentTier: descriptor.talentTier,
    },
    { listPublishedTemplates },
  );
}
