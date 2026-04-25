import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Phase 16 — Site control center consolidation.
 *
 * The legacy `/admin/site-settings` overview was a 6-tile index pointing at
 * structure / identity / branding / design / sections / pages. Every one of
 * those surfaces is now reachable as a tile from the new `/admin/site`
 * capability index, which also adds tier-banded conversion hooks. Rather
 * than maintain two parallel index pages, redirect the old route to the
 * new control center. Deep routes under `/admin/site-settings/*` remain
 * intact and are linked directly from the Site control center cards.
 */
export default function SiteSettingsOverviewPage() {
  redirect("/admin/site");
}
