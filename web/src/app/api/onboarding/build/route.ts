/**
 * POST /api/onboarding/build — runs the module's build for the signed-in
 * owner of a claimed brief. A route handler (not a server action) so the
 * provisioning + compose (20–60 s measured) has room: `maxDuration = 120`.
 * Idempotent: a second POST returns the stored build record.
 *
 * Reachability: `/api/onboarding` is in SHARED_API_PREFIXES (path-groups.ts)
 * because the module runs on the marketing host.
 */

import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_PROFILE_REFRESH_COOKIE, ACCESS_PROFILE_REFRESH_VALUE } from "@/lib/auth/access-profile-refresh";
import { forgetAccessProfileMemo } from "@/lib/supabase/middleware";
import { forgetUserTenantMemberships } from "@/lib/saas/tenant";
import { loadAccessProfile } from "@/lib/access-profile";
import { getOnboardingFlags } from "@/lib/settings/onboarding-flags";
import { getCachedActorSession, getCachedServerSupabase } from "@/lib/server/request-cache";
import { loadBrief } from "@/lib/tulala/brief-store.server";
import { parsePersistedModuleState } from "@/lib/onboarding/module-state";
import { runOnboardingBuild } from "@/lib/onboarding/build.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!(await getOnboardingFlags()).onboarding_module_enabled) {
    return NextResponse.json({ ok: false, code: "module_off" }, { status: 404 });
  }
  const session = await getCachedActorSession();
  const supabase = await getCachedServerSupabase();
  if (!session.user || !supabase) {
    return NextResponse.json({ ok: false, code: "unauthenticated" }, { status: 401 });
  }
  const owner = { kind: "profile" as const, profileId: session.user.id };
  const brief = await loadBrief(owner);
  if (!brief) return NextResponse.json({ ok: false, code: "no_brief" }, { status: 404 });
  const state = parsePersistedModuleState(brief.moduleState);
  if (!state.input) return NextResponse.json({ ok: false, code: "no_input" }, { status: 409 });

  const profile = await loadAccessProfile(supabase, session.user.id);
  const status = await runOnboardingBuild({
    owner,
    brief,
    state,
    userClient: supabase,
    userId: session.user.id,
    email: session.user.email ?? null,
    profile,
    requestHost: request.headers.get("x-impronta-host-name") ?? request.headers.get("host"),
    locale: state.locale ?? "en",
  });
  // The build changed who this person is (role, status, memberships). The
  // middleware memoises the access profile for 60 s and the tenant list for
  // 30 s per process: drop both here and set the refresh cookie so the very
  // next navigation (the arrival button) routes on the new profile instead of
  // bouncing between /onboarding/role and /admin.
  forgetAccessProfileMemo(session.user.id);
  forgetUserTenantMemberships(session.user.id);
  const res = NextResponse.json({ ok: true, build: status });
  if (status.status === "done") {
    res.cookies.set(ACCESS_PROFILE_REFRESH_COOKIE, ACCESS_PROFILE_REFRESH_VALUE, { path: "/", maxAge: 60, httpOnly: true, sameSite: "lax" });
  }
  return res;
}
