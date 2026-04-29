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
import { getCachedActorSession } from "@/lib/server/request-cache";

export const dynamic = "force-dynamic";

export default async function AccountRedirectPage() {
  const session = await getCachedActorSession();

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
    redirect("/admin/account");
  }
  if (profile.app_role === "talent") {
    redirect("/talent/account");
  }
  if (profile.app_role === "client") {
    redirect("/client/account");
  }

  // Fallback — unknown role, bounce to home.
  redirect("/");
}
