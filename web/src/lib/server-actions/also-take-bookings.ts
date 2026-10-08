"use server";

// TUL-269: a studio owner converts to "I also take bookings myself" after
// sign-up. Owner-only, idempotent, verified server-side: the user comes from
// the session and the workspace from the request's tenant scope (host/header),
// never from client input. Reuses the writers the build path and the Settings
// "How you work" move use. Nothing is deleted.

import { revalidatePath } from "next/cache";

import { runAlsoBookable, type AlsoBookableStep } from "@/lib/onboarding/also-bookable";
import { loadAlsoBookableFacts } from "@/lib/onboarding/also-bookable.server";
import { ensureOwnTalentSite } from "@/lib/onboarding/own-site.server";
import { promoteTalentProfileLive } from "@/lib/onboarding/talent-profile-promotion.server";
import { ensureSelfRosterSiteVisible } from "@/lib/saas/ensure-self-roster";
import { getTenantScope } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { provisionTalentProfileSelf } from "./talent-self-provision";

export type AlsoTakeBookingsResult =
  | { ok: true; changed: boolean; slug: string }
  | { ok: false; error: string; completed: AlsoBookableStep[]; pending: AlsoBookableStep[] };

export async function alsoTakeBookingsAction(): Promise<AlsoTakeBookingsResult> {
  const none = { completed: [] as AlsoBookableStep[], pending: [] as AlsoBookableStep[] };
  if (!(await assertNotImpersonating()).ok) return { ok: false, error: "Read-only while acting as another user.", ...none };
  const session = await getCachedActorSession();
  const admin = createServiceRoleClient();
  if (!session.user || !admin) return { ok: false, error: "You must be signed in.", ...none };
  const userId = session.user.id;
  try {
    const scope = await getTenantScope();
    if (!scope) return { ok: false, error: "Workspace not found.", ...none };
    const loaded = await loadAlsoBookableFacts(admin, userId, scope.tenantId);
    if (!loaded.ok) return { ok: false, error: loaded.error, ...none };

    const res = await runAlsoBookable(
      loaded.facts,
      {},
      {
        async addProvider(i) {
          const r = await provisionTalentProfileSelf(i);
          return r.ok ? { ok: true, talentProfileId: r.talentProfileId } : r;
        },
        promoteProfileLive: (id) => promoteTalentProfileLive(admin, id),
        async ensureSelfRoster(tenantId, talentProfileId) {
          const r = await ensureSelfRosterSiteVisible(admin, { tenantId, talentProfileId, addedBy: userId });
          return r.ok ? r : { ok: false, error: r.error };
        },
        ensureOwnSite: async (talentProfileId) => {
          const r = await ensureOwnTalentSite(admin, { userId, talentProfileId });
          return r.ok ? { ok: true } : { ok: false, error: "Your page is ready but your own site could not be published. Try again." };
        },
      },
    );
    if (!res.ok) return res;
    if (res.changed) revalidatePath(`/${res.slug}/admin/roster`);
    return { ok: true, changed: res.changed, slug: res.slug };
  } catch (err) {
    logServerError("also-take-bookings", err);
    return { ok: false, error: "Something went wrong. Please try again.", ...none };
  }
}
