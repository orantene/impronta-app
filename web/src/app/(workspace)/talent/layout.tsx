// Platform-scoped talent shell — /talent/* on app.tulala.digital (no tenant slug).
// Agenda V2 rollout: see docs/plans/today-calendar/ROLLOUT.md (TALENT_AGENDA_V2).
//
// Thin outer layout. It does ONLY the cheap, session/header-only gating that must
// stay an HTTP-level redirect or a bare passthrough, then hands the heavy data
// loads to <TalentLayoutInner> behind a Suspense boundary WITH a fallback. Before
// this split the whole shell streamed inside a boundary with no fallback, so the
// first paint was blank until ~20 loads finished (P0 root-cause notes: Notion
// card 3f32c5ee974381b6ae7ec3f6b8347f49).

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { dashboardMetadata } from "@/i18n/dashboard-metadata";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { TalentLayoutInner } from "./_talent-layout-inner";
import { TalentShellSkeleton } from "./_talent-shell-skeleton";

export const dynamic = "force-dynamic";

export const generateMetadata = dashboardMetadata;

export default async function PlatformTalentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCachedActorSession();
  if (!session.supabase) redirect("/login?error=config");
  if (!session.user) redirect("/login?next=/talent/today");

  const hdrs = await headers();
  const pathname = hdrs.get("x-impronta-original-pathname") ?? "/talent/today";
  const isTalentRoot =
    pathname === "/talent" || pathname === "/talent/";

  // Full-screen surfaces under /talent/* that own their entire viewport (the
  // freeform Page Builder editor chrome) opt OUT of the dashboard shell so the
  // editor renders bare. The route itself enforces auth + the Max-tier gate.
  if (pathname.startsWith("/talent/page-builder")) {
    return <>{children}</>;
  }

  // The guided onboarding wizard is a focused, full-screen flow that owns its
  // own chrome. The route itself enforces auth + loads its own data.
  if (pathname.startsWith("/talent/onboarding")) {
    return <>{children}</>;
  }

  // TUL-129: /talent itself never paints the shell; its page redirects straight
  // to /talent/today. The inner layout returns children for this path too (after
  // a profile read), so answering it here is the same output without the read,
  // and keeps that page's redirect an HTTP redirect instead of one inside a
  // streamed boundary.
  if (isTalentRoot) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={<TalentShellSkeleton />}>
      <TalentLayoutInner>{children}</TalentLayoutInner>
    </Suspense>
  );
}
