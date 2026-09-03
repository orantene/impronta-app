/**
 * DEFAULT PAGES CONTRACT — the ONE place the page quota is evaluated.
 *
 * Three actions can create a page (create-draft, duplicate, and the picker's
 * availability probe). Each used to ask the PLAN alone, so Free denied every
 * creation outright and the seeded system pages were irrelevant to the answer.
 * They now all route through this function, so the three answers cannot drift.
 *
 * Lives here rather than in `builder-capabilities.ts` because reading the role
 * pointers pulls in `page-roles.ts` (and with it the service-role client), and
 * `builder-capabilities` is imported by a client component
 * (`components/edit-chrome/edit-context.tsx`). The pure counting rules stay in
 * `builder-capabilities`; only the I/O composition lives here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  cmsAdditionalPageDeniedReason,
  loadBuilderWorkspacePlan,
  loadQuotaCountedPageCount,
} from "@/lib/site-admin/builder-capabilities";
import { logServerError } from "@/lib/server/safe-error";

import { readTenantPageRoles } from "./page-roles";
import { resolveCheapestPageLifterName } from "./page-lifter";
import { PAGE_ROLES } from "./page-roles-shape";

/**
 * Why this workspace may not create another page, or null when it may.
 *
 * Counts only operator-created pages: the homepage, the 404, the site shell and
 * the directory page are provisioned by the platform and exempt, as is any page
 * the operator has promoted to a role.
 */
export async function resolveAdditionalPageDenial(
  supabase: SupabaseClient,
  tenantId: string,
  logTag: string,
): Promise<string | null> {
  const workspacePlan = await loadBuilderWorkspacePlan(supabase, tenantId, {
    onError: (message) => logServerError(logTag, new Error(message)),
  });
  const roles = await readTenantPageRoles(supabase, tenantId);
  const roleSlugs = new Set(
    PAGE_ROLES.map((role) => roles[role]).filter(
      (slug): slug is string => typeof slug === "string" && slug.length > 0,
    ),
  );
  const counted = await loadQuotaCountedPageCount(supabase, tenantId, roleSlugs);

  // Resolve the named plan from the live catalog rather than a literal, so the
  // upsell can never point at a tier that is not sellable. See page-lifter.ts.
  const lifter = await resolveCheapestPageLifterName();
  return cmsAdditionalPageDeniedReason(workspacePlan, counted, lifter);
}
