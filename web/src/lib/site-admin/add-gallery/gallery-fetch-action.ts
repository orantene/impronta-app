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
 *
 * SYNC INVARIANT (P5): this is the ONE read path for both live builders' "+"
 * galleries and the Lab Catalog — code items have no second representation, and
 * templates + overlay are the only variable inputs, both funnelled through
 * `listGalleryItems`. There is therefore no second code path that could drift.
 * The panel refetches on every open → "next-load" sync (the chosen model). Every
 * mutation that changes the catalog (overlay writes, template publish/unpublish/
 * archive) bumps `builder_catalog_version` (read via `getCatalogVersion`), the
 * forward-looking hook for an optional realtime refresh of an already-open panel.
 */

import { listGalleryItems } from "./registry-db-merge";
import { listCatalogStructure } from "./catalog-structure-actions";
import type { AddGalleryItem, GallerySurfaceDescriptor } from "./types";
import { listPublishedTemplates } from "@/lib/site-admin/builder-core/templates/registry-actions";
import { listCatalogOverlays } from "@/lib/site-admin/builder-core/templates/catalog-overlay-actions";
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
      // X4 — the precise 4-surface key drives per-surface overlay subtraction.
      surfaceKey: descriptor.surfaceKey ?? null,
      // X6 — the independent Lab axis (true only on the Builder Lab surface).
      isLab: descriptor.isLab ?? false,
      plan: coercePlan(descriptor.plan),
      talentTier: descriptor.talentTier,
      tenantId: descriptor.tenantId,
    },
    {
      listPublishedTemplates,
      loadOverlays: listCatalogOverlays,
      loadStructure: listCatalogStructure,
    },
  );
}
