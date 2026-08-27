import "server-only";

import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isTalentOnTenantRoster } from "@/lib/saas/talent-roster";

/**
 * An agency storefront may only serve talent on ITS OWN visible roster.
 *
 * `profile-view.tsx` used to note that the agency surface "continues to rely on
 * roster RLS". It cannot. RLS enforces the GLOBAL gate
 * (`talent_profiles.is_publicly_listed`), and that column answers a different
 * question than a tenant page is asking:
 *
 *   is_publicly_listed    "is this talent listed ANYWHERE on the platform?"
 *                         true as soon as any tenant — the hub included — has
 *                         them site_visible/featured
 *   agency_talent_roster  "may THIS tenant show them?"
 *
 * So a talent who is `site_visible` on the hub is globally listed, and RLS
 * admits the row on EVERY agency host — including one whose own roster row for
 * them is `removed` or `roster_only`.
 *
 * Live consequence on improntamodels.com: three talent the agency had taken off
 * its roster still served complete, indexable profiles with working "Inquire"
 * buttons, while the mirror-image roster gate in `startGuestChatInquiry`
 * rejected every send — after the visitor had typed a brief and handed over
 * their name and email. The agency was also publicly showing people it had
 * explicitly removed.
 *
 * `talent-roster.ts` states the rule this restores: "Every public storefront
 * query for talent — listing, preview, inquiry submission — must gate on the
 * current tenant's roster with an appropriate agency_visibility."
 *
 * KNOWN LIMITATION — callers get a SOFT 404.
 * `t/[profileCode]/loading.tsx` puts an implicit Suspense boundary on the
 * segment, so Next flushes the shell before either generateMetadata or the page
 * component resolves. A notFound() raised from anywhere inside the segment then
 * renders the not-found UI but cannot retract a status line already on the
 * wire. Measured, not assumed: the response is 200 with a "Page not found"
 * body. Moving the gate earlier within the segment does NOT help.
 *
 * That is acceptable because the indexing risk is closed by other means: Next's
 * not-found page carries `<meta name="robots" content="noindex">`, the talent's
 * own metadata is gone (gate this in generateMetadata too, not just the view),
 * and the tenant sitemap scopes by `created_by_agency_id` so it never
 * advertised these rows. A hard 404 would need the check in `proxy.ts` — a
 * roster lookup on every /t/ request — or dropping loading.tsx and its skeleton
 * for every talent page. Both are bigger trades than this bug justifies.
 *
 * Calls `notFound()` when the talent is not on this tenant's visible roster, so
 * a caller is a three-line guard rather than a block of branching.
 */
export async function assertTalentVisibleOnAgencySurface(
  pub: SupabaseClient,
  tenantId: string,
  talentProfileId: string,
): Promise<void> {
  if (!(await isTalentOnTenantRoster(pub, tenantId, talentProfileId))) {
    notFound();
  }
}
