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

import { buildAccessProfileRefreshCookie } from "@/lib/auth/access-profile-refresh";
import { forgetAccessProfileMemo } from "@/lib/supabase/middleware";
import { forgetUserTenantMemberships } from "@/lib/saas/tenant";
import { loadAccessProfile } from "@/lib/access-profile";
import { getOnboardingFlags } from "@/lib/settings/onboarding-flags";
import { getCachedActorSession, getCachedServerSupabase } from "@/lib/server/request-cache";
import { loadBrief } from "@/lib/tulala/brief-store.server";
import { parsePersistedModuleState } from "@/lib/onboarding/module-state";
import { essentialsReady } from "@/lib/onboarding/essentials";
import { requireAge18ForPublish } from "@/lib/onboarding/age-gate";
import { pathToChoice } from "@/lib/onboarding/choice";
import { updateBriefModuleState } from "@/lib/tulala/brief-module-state.server";
import { runOnboardingBuild } from "@/lib/onboarding/build.server";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return Response.json({ error: readOnly.error }, { status: 403 });
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
  // TUL-84: the manual path ("I'll fill it in myself") has no description text,
  // only confirmed essentials; that is enough to build.
  if (!state.input && !essentialsReady(state.essentials ?? null)) return NextResponse.json({ ok: false, code: "no_input" }, { status: 409 });

  // Owner decision 2026-10-01: a public talent page needs the 18+ confirmation.
  // Refused before anything is created, so nothing half-live is left behind.
  const gate = requireAge18ForPublish({
    choice: state.choice ?? (state.path ? pathToChoice(state.path) : null),
    confirmedAt: state.age18ConfirmedAt,
    locale: state.locale ?? "en",
  });
  if (!gate.ok) {
    return NextResponse.json({ ok: false, code: gate.code, message: gate.message, step: gate.backStep }, { status: 409 });
  }
  if (gate.required && !state.age18ConfirmedBy) {
    await updateBriefModuleState(brief.id, { age18ConfirmedBy: session.user.id });
  }

  const profile = await loadAccessProfile(supabase, session.user.id);
  const requestHost = request.headers.get("x-impronta-host-name") ?? request.headers.get("host");
  const status = await runOnboardingBuild({
    owner,
    brief,
    state,
    userClient: supabase,
    userId: session.user.id,
    email: session.user.email ?? null,
    profile,
    requestHost,
    locale: state.locale ?? "en",
  });
  // The build changed who this person is (role, status, memberships). The
  // middleware memoises the access profile for 60 s and the tenant list for
  // 30 s per process: drop both here and set the refresh cookie so the very
  // next navigation (the arrival button) routes on the new profile instead of
  // bouncing between /onboarding/role and /admin.
  forgetAccessProfileMemo(session.user.id);
  forgetUserTenantMemberships(session.user.id);
  // The arrival lands on app.tulala.digital while this runs on the apex, and
  // possibly on another instance whose memo this forget never touched. The
  // stamped cookie is parent-domain scoped (same helper as the auth cookies)
  // and invalidates every memo entry older than the build on every instance.
  const res = NextResponse.json({ ok: true, build: status });
  if (status.status === "done") {
    const refresh = buildAccessProfileRefreshCookie(requestHost);
    res.cookies.set(refresh.name, refresh.value, refresh.options);
  }
  return res;
}
