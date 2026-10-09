/**
 * /account — root-level account redirect.
 *
 * The dashboard groups (admin / client / talent) each ship a scoped
 * `/<role>/account` page. Before this file existed, `/account` (with
 * no role prefix) hit Next's default not-found handler — which on a
 * tenant subdomain like `impronta.tulala.digital` rendered a blank
 * dark void with a generic "Not found" string. QA flagged that as a
 * P1 trust-breaker (issue #1).
 *
 * This page resolves the actor and redirects to the correct scoped
 * account route:
 *   - staff (super_admin / agency_staff) → /admin/account
 *   - talent                              → /talent/account
 *   - client                              → /client/account
 *   - onboarding / no role                → /onboarding/role
 *   - signed out                          → /login
 *
 * The redirect happens server-side, so the user lands on a real
 * account screen on the first response — no flash of "Not found".
 */

import { redirect } from "next/navigation";

import { isStaffRole } from "@/lib/auth-flow";
import { accountFlagKindForHost, accountHomeMode } from "@/lib/client-account/agency-area-pure";
import { parseAccountTab } from "@/lib/client-account/area-pure";
import { clientAccountEnabledFor } from "@/lib/client-account/flag";
import { readAccountHost } from "@/lib/client-account/area-site.server";
import { ACCOUNT_AREA_METADATA, renderClientAccountPage } from "@/lib/client-account/render-area";
import { getCachedActorSession } from "@/lib/server/request-cache";

export const dynamic = "force-dynamic";
export const metadata = ACCOUNT_AREA_METADATA;

export default async function AccountRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // TUL-62: on a talent site this URL is the client account area (flag-gated,
  // 404 when off). Every other host keeps the role redirect below, unchanged.
  if ((await readAccountHost()).hostContext === "talent_site") {
    const { tab } = await searchParams;
    return renderClientAccountPage({ kind: "home", tab: parseAccountTab(tab) });
  }
  const session = await getCachedActorSession();

  // TUL-64: agency, hub and app hosts show the client account area to signed-out
  // visitors and client accounts. Flag kind follows x-impronta-host-context
  // (agency / hub / app / marketing) — never a hard-coded `app` check. Staff,
  // talent and platform accounts, and the flag off, keep the role redirect.
  const host = await readAccountHost();
  const flagKind = accountFlagKindForHost(host.hostContext);
  if (
    accountHomeMode({
      flagOn: Boolean(flagKind && clientAccountEnabledFor(flagKind)),
      hostContext: host.hostContext,
      userId: session.user?.id ?? null,
      appRole: session.profile?.app_role ?? null,
    }) === "area"
  ) {
    const { tab } = await searchParams;
    return renderClientAccountPage({ kind: "home", tab: parseAccountTab(tab) });
  }

  if (!session.supabase) {
    redirect("/login?error=config");
  }
  if (!session.user) {
    redirect("/login?next=/account");
  }

  const profile = session.profile;

  if (!profile?.app_role) {
    redirect("/onboarding/role");
  }

  if (
    profile.account_status === "onboarding" ||
    profile.account_status === "registered"
  ) {
    redirect("/onboarding/role");
  }

  if (isStaffRole(profile.app_role)) {
    redirect("/admin");
  }
  if (profile.app_role === "talent") {
    redirect("/talent");
  }
  if (profile.app_role === "client") {
    redirect("/client");
  }

  // Fallback — unknown role, bounce to home.
  redirect("/");
}
