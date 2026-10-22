"use server";

/**
 * TUL-818 · Is the talent's own published site actually reachable?
 *
 * The dashboard badge used to say "Website live" from the published row alone,
 * while the onboarding finish check (verify-live) could see the address fail.
 * This action runs the same server-side check against the talent's own site so
 * the badge reads the verified state. Read-only.
 *
 * AUTH: owner from the session via `requireTalentSelf()`; no ids are accepted.
 * The read is the cookie-session client, so `talent_sites` RLS applies.
 */

import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError, logServerExpected } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { createLiveVerifyMemo } from "@/lib/onboarding/live-badge";
import { verifyLivePage } from "@/lib/onboarding/verify-live";
import { getAppUrl } from "@/lib/auth-flow";
import { siteUrl } from "./site-management-helpers";

const memo = createLiveVerifyMemo({ okTtlMs: 10 * 60_000, failTtlMs: 30_000 });

/** true = verified live · false = published but the address did not answer · null = not published / no session. */
export async function loadMySiteLiveVerifiedAction(): Promise<boolean | null> {
  const scope = await requireTalentSelf();
  if (!scope.ok) return null;
  const sb = await getCachedServerSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("talent_sites")
    .select("site_slug, site_published_at")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();
  if (error) {
    logServerError("talentSite.liveVerified", error);
    return null;
  }
  const row = data as { site_slug?: string | null; site_published_at?: string | null } | null;
  if (!row?.site_slug || !row.site_published_at) return null;
  const raw = siteUrl(row.site_slug);
  if (!raw) return null;
  // Path addresses (`/t/site/<slug>`) are checked on the app origin.
  const url = /^https?:\/\//.test(raw) ? raw : `${getAppUrl().replace(/\/+$/, "")}${raw}`;

  // No name yet: nothing to look for, so the badge is simply "not verified".
  const name = scope.talentProfile.displayName?.trim() || null;
  if (!name) return null;
  return memo.get(url, async () => {
    const check = await verifyLivePage({ url, name, timeoutMs: 6000 });
    // A page that does not (yet) show the name or answer is an expected state, not a crash.
    if (!check.ok) logServerExpected("talentSite.liveVerified", new Error(`check:${check.reason}`));
    return check.ok;
  });
}
