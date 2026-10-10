// Platform talent root — resolver (same URL as the shell; no duplicate app/talent route).
//
// Resolution order:
//   1. Unauthenticated → /login?next=/talent (preserving query)
//   2. Has a talent profile → seed the agency cookie when there is a roster,
//      redirect /talent/today. Every pro has a dashboard: with the free-site
//      model a talent with no roster is a solo pro, not someone waiting to be
//      added. The old roster wall (a dead-end screen) is retired
//      (TUL-117, C1-12, DS-41).
//   3. No talent profile and no talent app_role → /onboarding/role
//   4. A talent app_role with no profile row yet → the guided /start flow

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCachedActorSession, getCachedServerSupabase } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  ACTIVE_TALENT_TENANT_COOKIE,
  loadPrimaryTalentAgency,
} from "@/lib/talent/active-agency-context";
import { loadTalentSelfProfileByUser } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { loadAccessProfile } from "@/lib/access-profile";
import { buildQuerySuffix } from "@/lib/saas/redirect-query";
import { resolveMarketingOrigin } from "@/lib/brand/marketing-origin";
import { buildStartUrl } from "@/lib/onboarding/legacy-signup-redirect";
import { legacyFlowLang } from "@/lib/onboarding/legacy-signup-redirect.server";

async function resolveTalentProfileId(userId: string): Promise<string | null> {
  const self = await loadTalentSelfProfileByUser(userId);
  if (self?.id) return self.id;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  // limit(1), not maybeSingle: two rows is an error from maybeSingle and
  // used to fall through to the wall as if the profile did not exist.
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  if (error || !data?.[0]?.id) return null;
  return data[0].id as string;
}

export const dynamic = "force-dynamic";

export default async function PlatformTalentRootPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const querySuffix = buildQuerySuffix(sp);

  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent(`/talent${querySuffix}`)}`);
  }

  const profileId = await resolveTalentProfileId(session.user.id);
  if (profileId) {
    try {
      const store = await cookies();
      if (!store.get(ACTIVE_TALENT_TENANT_COOKIE)?.value) {
        const primary = await loadPrimaryTalentAgency(profileId);
        if (primary) {
          store.set(ACTIVE_TALENT_TENANT_COOKIE, primary.tenantId, {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 365,
          });
        }
      }
    } catch {
      // cookies() unavailable outside request
    }
    redirect(`/talent/today${querySuffix}`);
  }

  const supabase = await getCachedServerSupabase();
  const access = supabase
    ? await loadAccessProfile(supabase, session.user.id).catch(() => null)
    : null;
  if (access?.app_role !== "talent") {
    redirect(`/onboarding/role${querySuffix}`);
  }
  // A talent role with no profile row yet: finish setup in the guided flow
  // rather than dead-ending. Cross-host, so the URL is absolute.
  redirect(
    buildStartUrl({
      siteUrl: resolveMarketingOrigin(),
      lang: await legacyFlowLang(),
      choice: "myself",
    }),
  );
}
