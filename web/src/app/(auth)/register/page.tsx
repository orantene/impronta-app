import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { normalizeOptionalNextPath } from "@/lib/auth-flow";
import {
  buildWorkspaceOnboardingPath,
  WORKSPACE_SIGNUP_INTENT,
} from "@/lib/saas/workspace-signup";
import { loadWorkspaceLeadEmail } from "@/lib/saas/workspace-signup-lead.server";
import { readInviteFromCookieStore } from "@/lib/invites/cookie";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { RegisterForm } from "./register-form";

/**
 * The inviting workspace's display name for a claim invite, so the page can
 * say "Claim your profile on Impronta Models" instead of the generic
 * create-account pitch (which told an invited talent they would "choose
 * whether you're Talent or a Client" — flatly wrong for this flow; owner
 * flagged it in claim QA 2026-08-06). Best-effort: null keeps a claim-neutral
 * headline, never blocks the form.
 */
async function loadClaimAgencyName(invitationId: string): Promise<string | null> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return null;
    const { data: inv } = await admin
      .from("talent_claim_invitations")
      .select("tenant_id")
      .eq("id", invitationId)
      .maybeSingle();
    const tenantId = (inv as { tenant_id?: string } | null)?.tenant_id;
    if (!tenantId) return null;
    const { data: agency } = await admin
      .from("agencies")
      .select("display_name")
      .eq("id", tenantId)
      .maybeSingle();
    return (agency as { display_name?: string | null } | null)?.display_name?.trim() || null;
  } catch {
    return null;
  }
}

async function loadInviterAgencyName(): Promise<string | null> {
  try {
    const store = await cookies();
    const payload = readInviteFromCookieStore({ get: (name) => store.get(name) });
    if (!payload) return null;
    const supabase = createPublicSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from("agency_business_identity")
      .select("public_name")
      .eq("tenant_id", payload.inviterTenantId)
      .maybeSingle();
    return (data as { public_name?: string | null } | null)?.public_name?.trim() || null;
  } catch {
    return null;
  }
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    intent?: string;
    lead?: string;
    next?: string;
    /**
     * Talent claim-invite id (sendTalentClaimInvite emails
     * `/register?invitation=<id>&email=<e>`). This param was previously
     * DROPPED here, which is why no invited talent could ever claim the
     * profile an agency built for them — they signed up and silently got a
     * second, empty profile instead. Threaded into `next` so the claim runs
     * the moment the account is confirmed, for both the email and Google paths.
     */
    invitation?: string;
    /** Prefill for the invited address (the claim requires an exact match). */
    email?: string;
  }>;
}) {
  const { error, intent, lead, next, invitation, email } = await searchParams;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const workspaceLeadId = typeof lead === "string" && lead ? lead : null;
  const workspaceIntent = intent === WORKSPACE_SIGNUP_INTENT && workspaceLeadId;
  // A claim invite outranks a plain `next`: the whole point of the link is to
  // land on /claim once there's a session. normalizeNextPath keeps the query
  // string (it only rejects non-internal paths), so the token survives.
  const claimInvitationId =
    typeof invitation === "string" && invitation.trim() ? invitation.trim() : null;

  // An ALREADY-SIGNED-IN visitor clicking a claim link must go straight to
  // /claim — without this they fell through the generic authed-user path and
  // landed on their dashboard with the token silently dropped (found in
  // real-browser QA: the workspace owner clicked an invite and the claim
  // never ran). /claim renders a real verdict for every signed-in case.
  if (claimInvitationId) {
    const session = await getCachedActorSession();
    if (session.user) {
      redirect(`/claim?invitation=${encodeURIComponent(claimInvitationId)}`);
    }
  }

  const nextPath = workspaceIntent
    ? buildWorkspaceOnboardingPath(workspaceLeadId)
    : claimInvitationId
      ? `/claim?invitation=${encodeURIComponent(claimInvitationId)}`
      : normalizeOptionalNextPath(next);

  // Pre-fill the email the operator already typed in the get-started funnel
  // so the email/password path doesn't make them retype it. Resolved
  // server-side from the lead id (never passed through the URL — it's PII).
  // Null on any miss; the field just renders empty, never blocks signup.
  const leadEmail =
    workspaceIntent && workspaceLeadId
      ? await loadWorkspaceLeadEmail(workspaceLeadId)
      : null;

  // E.5 — Surface inviter context when the visitor came from /invite/[token].
  const isInviteFlow = !workspaceIntent && nextPath?.startsWith("/invite/");
  const inviterAgencyName = isInviteFlow ? await loadInviterAgencyName() : null;

  // Claim invites carry their own headline: the person is here to take over a
  // specific existing profile, not to pick a role.
  const claimAgencyName = claimInvitationId
    ? await loadClaimAgencyName(claimInvitationId)
    : null;

  const title = workspaceIntent
    ? t("public.auth.register.operatorTitle")
    : claimInvitationId
      ? claimAgencyName
        ? t("public.auth.register.claimTitleAgency").replace("{agency}", claimAgencyName)
        : t("public.auth.register.claimTitle")
      : inviterAgencyName
        ? t("public.auth.register.inviteTitle").replace("{agency}", inviterAgencyName)
        : t("public.auth.register.title");
  const description = workspaceIntent
    ? t("public.auth.register.operatorDescription")
    : claimInvitationId
      ? t("public.auth.register.claimDescription").replace(
          "{agency}",
          claimAgencyName ??
            (locale === "es" ? "Tu agencia" : "Your agency"),
        )
      : inviterAgencyName
        ? t("public.auth.register.inviteDescription").replace("{agency}", inviterAgencyName)
        : t("public.auth.register.description");
  const googleLabel = workspaceIntent
    ? t("public.auth.register.googleContinue")
    : t("public.auth.register.google");
  const emailLabel = workspaceIntent
    ? t("public.auth.register.operatorSubmit")
    : claimInvitationId
      ? t("public.auth.register.claimSubmit")
      : inviterAgencyName
        ? t("public.auth.register.inviteSubmit")
        : t("public.auth.register.emailSubmit");

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {decodeURIComponent(error)}
        </p>
      ) : null}
      <GoogleAuthButton
        nextPath={nextPath}
        pendingLabel={t("public.auth.googleOpening")}
        failedLabel={t("public.auth.googleFailed")}
        popupBlockedMessage={t("public.auth.googlePopupBlocked")}
        unableToStartMessage={t("public.auth.googleUnableToStart")}
      >
        {googleLabel}
      </GoogleAuthButton>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm uppercase">
          <span className="bg-card px-2 text-muted-foreground">{t("public.auth.or")}</span>
        </div>
      </div>
      <RegisterForm
        nextPath={nextPath}
        submitLabel={emailLabel}
        locale={locale}
        // Claim invites carry the invited address, and the claim RPC requires
        // an exact match — prefilling it stops the commonest failure (signing
        // up with a different email and hitting `email_mismatch`).
        defaultEmail={
          (claimInvitationId && typeof email === "string" && email.trim()
            ? email.trim()
            : leadEmail) ?? undefined
        }
      />
    </div>
  );
}
