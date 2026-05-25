import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { getCachedActorSession } from "@/lib/server/request-cache";
import {
  loadTalentSelfProfile,
  loadTalentSelfProfileByUser,
} from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import {
  getActiveTalentAgencyContext,
  type ActiveTalentAgencyContext,
} from "@/lib/talent/active-agency-context";

export type PlatformTalentContext = {
  userId: string;
  talentProfileId: string;
  activeAgency: ActiveTalentAgencyContext | null;
  tenantId: string | null;
  tenantSlug: string | null;
};

/**
 * Platform-scoped talent workspace context (no URL tenant slug).
 * Requires a claimed talent profile. Agency context comes from cookie or primary roster.
 */
export const requirePlatformTalentContext = cache(
  async (): Promise<PlatformTalentContext> => {
    const session = await getCachedActorSession();
    if (!session.user) redirect("/login?next=/talent/today");

    const base = await loadTalentSelfProfileByUser(session.user.id);
    if (!base) notFound();

    const activeAgency = await getActiveTalentAgencyContext(base.id);

    return {
      userId: session.user.id,
      talentProfileId: base.id,
      activeAgency,
      tenantId: activeAgency?.tenantId ?? null,
      tenantSlug: activeAgency?.slug ?? null,
    };
  },
);

/**
 * Resolve tenant scope for a talent page that may be mounted at
 * `/{tenantSlug}/talent/*` or `/talent/*`.
 */
export async function resolveTalentPageScope(
  params: Promise<{ tenantSlug?: string }>,
): Promise<{ tenantSlug: string; tenantId: string }> {
  const { tenantSlug: routeSlug } = await params;
  if (routeSlug) {
    const scope = await getTenantPortalScopeBySlug(routeSlug);
    if (!scope) notFound();
    return { tenantSlug: routeSlug, tenantId: scope.tenantId };
  }

  const ctx = await requirePlatformTalentContext();
  if (!ctx.tenantSlug || !ctx.tenantId) {
    notFound();
  }
  return { tenantSlug: ctx.tenantSlug, tenantId: ctx.tenantId };
}

export async function loadPlatformTalentSelfProfile(userId: string) {
  const ctx = await requirePlatformTalentContext();
  if (ctx.tenantId) {
    const scoped = await loadTalentSelfProfile(userId, ctx.tenantId);
    if (scoped) return scoped;
  }
  return loadTalentSelfProfileByUser(userId);
}
