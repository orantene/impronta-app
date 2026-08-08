import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import {
  AuthCard,
  AuthDivider,
  AuthHeading,
  AuthNotice,
} from "@/components/auth/auth-ui";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { getAppUrl, normalizeOptionalNextPath } from "@/lib/auth-flow";
import {
  readRegisterIntent,
  registerCopyKeys,
  resolveRegisterFlow,
} from "@/lib/auth/register-intent";
import {
  buildWorkspaceOnboardingPath,
  WORKSPACE_SIGNUP_INTENT,
} from "@/lib/saas/workspace-signup";
import { loadWorkspaceLeadEmail } from "@/lib/saas/workspace-signup-lead.server";
import { readInviteFromCookieStore } from "@/lib/invites/cookie";
import { getPublicHostContext } from "@/lib/saas/scope";
import { hostSafeRedirectDestination } from "@/lib/saas/host-safe-destination";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { prefersPasswordlessFirst } from "@/lib/auth/otp-flow";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { RegisterForm, RegisterLoginFooter } from "./register-form";

/**
 * P2 — THE signup page. There is no other one.
 *
 * `/talent/register`, `/client/register` and `/join` are permanent redirects
 * into here carrying `?as=<intent>`; the marketing get-started modal shares the
 * same `components/auth/auth-ui` primitives. Which audience the page addresses
 * is decided by `lib/auth/register-intent.ts` (pure, unit-tested); this file
 * keeps only what genuinely needs a request: the session check, the two
 * agency-name lookups, and the host-aware post-auth destination.
 */

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

/**
 * Where a brand-new CLIENT lands after auth. Carried over verbatim from the
 * retired `/client/register`: on the marketing apex and hub hosts `/client` is
 * NOT an allowed path (the workspace lives on the app host), so a relative
 * default 404'd there. Those hosts get an absolute app-host URL; the
 * `.tulala.digital` session cookie spans both.
 */
async function defaultClientNext(): Promise<string> {
  const hostCtx = await getPublicHostContext();
  if (hostCtx.kind === "agency" && hostCtx.tenantSlug) {
    return `/${hostCtx.tenantSlug}/client`;
  }
  return hostCtx.kind === "app" ? "/client" : `${getAppUrl()}/client`;
}

/** First stop for a brand-new TALENT: finish the profile fields. */
const TALENT_DEFAULT_PATH = "/talent/profile/fields";

/**
 * Where a brand-new TALENT lands after auth.
 *
 * Same incident class as `defaultClientNext` above (host-blind auth redirect →
 * 404; PRs #1041/#1045/#1046) — `/talent/*` is allow-listed on agency + app
 * only, so the previous bare `"/talent/profile/fields"` 404'd for anyone who
 * signed up as talent on the marketing apex or a hub host.
 *
 * Fixed via `hostSafeRedirectDestination`, which asks the surface allow-list
 * itself instead of re-listing host kinds here — so it self-heals if the
 * allow-list changes.
 *
 * DELIBERATELY NOT a mirror of `defaultClientNext`: that one slug-prefixes on
 * agency hosts, which would be WRONG here. `/talent/*` is excluded from
 * branded rewriting on purpose (`lib/saas/branded-admin-url.ts`) because the
 * talent self-surface is host-agnostic while `/<slug>/talent/*` are legacy
 * redirectors that bounce back — slug-prefixing would reintroduce the
 * documented infinite navigation loop, which is worse than the 404 being fixed.
 */
async function defaultTalentNext(): Promise<string> {
  return hostSafeRedirectDestination(TALENT_DEFAULT_PATH);
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    intent?: string;
    lead?: string;
    next?: string;
    /** P2 intent: `talent` | `client` | `operator` (legacy alias: `role`). */
    as?: string;
    role?: string;
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
  const params = await searchParams;
  const { error, intent, lead, next, invitation, email } = params;
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const workspaceLeadId = typeof lead === "string" && lead ? lead : null;
  const workspaceSignup = Boolean(
    intent === WORKSPACE_SIGNUP_INTENT && workspaceLeadId,
  );
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

  const requestedIntent = readRegisterIntent(params);
  const explicitNext = normalizeOptionalNextPath(next);

  // Post-auth destination, per flow. Each branch is the behaviour the retired
  // route had, unchanged — an explicit valid `?next=` always wins over the
  // per-intent default.
  let nextPath: string | undefined;
  if (workspaceSignup && workspaceLeadId) {
    nextPath = buildWorkspaceOnboardingPath(workspaceLeadId);
  } else if (claimInvitationId) {
    nextPath = `/claim?invitation=${encodeURIComponent(claimInvitationId)}`;
  } else if (requestedIntent === "talent") {
    // Only resolved for the talent intent, so plain /register pays no host lookup.
    nextPath = explicitNext ?? (await defaultTalentNext());
  } else if (requestedIntent === "client") {
    nextPath = explicitNext ?? (await defaultClientNext());
  } else {
    nextPath = explicitNext;
  }

  // Pre-fill the email the operator already typed in the get-started funnel
  // so the email/password path doesn't make them retype it. Resolved
  // server-side from the lead id (never passed through the URL — it's PII).
  // Null on any miss; the field just renders empty, never blocks signup.
  const leadEmail =
    workspaceSignup && workspaceLeadId
      ? await loadWorkspaceLeadEmail(workspaceLeadId)
      : null;

  // E.5 — Surface inviter context when the visitor came from /invite/[token].
  const isInviteFlow = !workspaceSignup && nextPath?.startsWith("/invite/");
  const inviterAgencyName = isInviteFlow ? await loadInviterAgencyName() : null;

  // Claim invites carry their own headline: the person is here to take over a
  // specific existing profile, not to pick a role.
  const claimAgencyName = claimInvitationId
    ? await loadClaimAgencyName(claimInvitationId)
    : null;

  const flow = resolveRegisterFlow({
    workspaceSignup,
    claimInvite: Boolean(claimInvitationId),
    rosterInvite: Boolean(inviterAgencyName),
    intent: requestedIntent,
  });
  const agencyName =
    flow === "claim" ? claimAgencyName : flow === "invite" ? inviterAgencyName : null;
  const keys = registerCopyKeys(flow, Boolean(agencyName));

  // P4 — the CLIENT (booker) lane is passwordless-first. Only the plain
  // `?as=client` flow: a claim or roster invite has its own contract and the
  // operator funnel keeps password-first signup.
  const passwordlessFirst = flow === "client" && prefersPasswordlessFirst(requestedIntent);

  // Claim invites carry the invited address, and the claim RPC requires an exact
  // match — prefilling it stops the commonest failure (signing up with a
  // different email and hitting `email_mismatch`).
  const defaultEmail =
    (claimInvitationId && typeof email === "string" && email.trim()
      ? email.trim()
      : leadEmail) ?? undefined;

  // `{agency}` is only present in the claim + invite strings. The claim
  // description always names someone, so it falls back to a catalog phrase
  // rather than a hardcoded locale branch.
  const agencyLabel =
    agencyName ??
    (flow === "claim" ? t("public.auth.register.claimAgencyFallback") : "");
  const fill = (value: string): string => value.replace("{agency}", agencyLabel);

  return (
    <div className="w-full">
      <AuthHeading
        eyebrow={t(keys.eyebrow)}
        title={fill(t(keys.title))}
        description={fill(t(keys.description))}
      />

      <AuthCard>
        {error ? (
          <AuthNotice tone="error" align="center" className="mb-4">
            {decodeURIComponent(error)}
          </AuthNotice>
        ) : null}

        <GoogleAuthButton
          nextPath={nextPath}
          pendingLabel={t("public.auth.googleOpening")}
          failedLabel={t("public.auth.googleFailed")}
          popupBlockedMessage={t("public.auth.googlePopupBlocked")}
          unableToStartMessage={t("public.auth.googleUnableToStart")}
        >
          {t(keys.google)}
        </GoogleAuthButton>

        <AuthDivider label={t("public.auth.or")} />

        {passwordlessFirst ? (
          // P4 — CLIENT intent leads with an emailed code. The password form is
          // the SAME component, rendered only when the visitor asks for it.
          <EmailCodeForm
            nextPath={nextPath}
            locale={locale}
            defaultEmail={defaultEmail}
            submitLabel={t("public.auth.passwordless.emailSubmit")}
            passwordFallback={
              <RegisterForm
                nextPath={nextPath}
                submitLabel={t(keys.submit)}
                locale={locale}
                defaultEmail={defaultEmail}
                hideFooter
              />
            }
            footer={
              <RegisterLoginFooter
                nextPath={nextPath}
                locale={locale}
                intent="client"
              />
            }
          />
        ) : (
          <RegisterForm
            nextPath={nextPath}
            submitLabel={t(keys.submit)}
            locale={locale}
            defaultEmail={defaultEmail}
          />
        )}
      </AuthCard>
    </div>
  );
}
