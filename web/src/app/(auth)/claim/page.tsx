// Talent profile CLAIM landing.
//
// This is the surface an invited talent lands on after confirming their email
// (or immediately, if they were already signed in). It performs the claim and
// explains the outcome — it never redirects to an error page, because the
// person has just created an account and a dead end here loses them.
//
// Flow: sendTalentClaimInvite emails `/register?invitation=<id>&email=<e>` →
// RegisterPage threads `next=/claim?invitation=<id>` through signup →
// Supabase confirm redirect lands here with a session → we call the RPC.
//
// The RPC (`claim_talent_profile`, migration 20260805232235) owns ALL the
// guards atomically: invite validity/expiry/revocation, email match, profile
// availability, the one-live-profile-per-user rule, and idempotent replay. It
// returns a jsonb verdict instead of throwing so we can keep the session and
// render real copy for every case.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppUrl } from "@/lib/auth-flow";

import {
  AuthArrowGlyph,
  AuthCard,
  AuthHeading,
  AuthNotice,
} from "@/components/auth/auth-ui";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  presentClaimOutcome,
  type ClaimVerdict,
} from "@/lib/talent/claim-outcome";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ invitation?: string }>;

/** Inviting workspace's public name, for copy. Never fatal. */
async function loadAgencyName(tenantId: string | undefined): Promise<string | null> {
  if (!tenantId) return null;
  const admin = createServiceRoleClient();
  if (!admin) return null;
  try {
    const { data } = await admin
      .from("agencies")
      .select("display_name")
      .eq("id", tenantId)
      .maybeSingle();
    return (data as { display_name?: string | null } | null)?.display_name?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Which tenant sent this invite — resolved BEFORE the claim so the copy can
 * name the agency even on a failure verdict (an expired link still needs to
 * say who to ask for a new one).
 */
async function loadInviteTenant(invitationId: string): Promise<string | undefined> {
  const admin = createServiceRoleClient();
  if (!admin) return undefined;
  try {
    const { data } = await admin
      .from("talent_claim_invitations")
      .select("tenant_id")
      .eq("id", invitationId)
      .maybeSingle();
    return (data as { tenant_id?: string } | null)?.tenant_id;
  } catch {
    return undefined;
  }
}

export default async function ClaimProfilePage({
  searchParams,
}: {
  searchParams: PageParams;
}) {
  const { invitation } = await searchParams;

  // No token → nothing to do. Send them somewhere useful rather than 404.
  if (!invitation) redirect("/login");

  const session = await getCachedActorSession();
  // Not signed in yet: bounce through login, preserving the token so the claim
  // completes the moment they authenticate.
  if (!session.user || !session.supabase) {
    redirect(`/login?next=${encodeURIComponent(`/claim?invitation=${invitation}`)}`);
  }

  const tenantId = await loadInviteTenant(invitation);
  const agencyName = await loadAgencyName(tenantId);

  let verdict: ClaimVerdict = { ok: false, reason: "unknown" };
  const { data, error } = await session.supabase.rpc("claim_talent_profile", {
    p_invitation_id: invitation,
    p_email: session.user.email ?? null,
  });

  if (error) {
    logServerError("claim/claim_talent_profile", error);
  } else if (data && typeof data === "object") {
    verdict = data as ClaimVerdict;
  }

  const view = presentClaimOutcome(verdict, agencyName);
  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  return (
    <div className="w-full">
      <AuthHeading
        eyebrow={
          view.success
            ? t("public.auth.claim.successEyebrow")
            : t("public.auth.claim.eyebrow")
        }
        title={view.title}
        description={view.body}
      />

      <AuthCard>
        <div className="flex flex-col gap-3">
          {/* Absolute: /claim is allow-listed on marketing + hub (claim mail is
              branded per workspace and can be opened anywhere), but /talent
              exists on the app + agency surfaces only. */}
          {view.showDashboard ? (
            <Link
              href={`${getAppUrl()}/talent`}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-[0.9375rem] font-medium leading-none tracking-[-0.005em] transition-[background,transform,box-shadow] duration-200"
              style={{
                background: "var(--plt-forest)",
                color: "var(--plt-forest-on)",
                boxShadow: "var(--plt-shadow-forest)",
              }}
            >
              <span>{t("public.auth.claim.dashboardCta")}</span>
              <AuthArrowGlyph />
            </Link>
          ) : null}
          {view.showResendHint ? (
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-[0.9375rem] font-medium leading-none transition-colors"
              style={{
                background: "var(--plt-bg-raised)",
                border: "1px solid var(--plt-hairline-strong)",
                color: "var(--plt-ink)",
              }}
            >
              {t("public.auth.claim.backToSignIn")}
            </Link>
          ) : null}

          {view.success && verdict.exclusive_confirmed ? (
            <AuthNotice tone="info">
              {t("public.auth.claim.exclusiveNote")}
            </AuthNotice>
          ) : null}
        </div>
      </AuthCard>
    </div>
  );
}
