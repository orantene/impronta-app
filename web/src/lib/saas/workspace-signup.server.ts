import { getAppUrl } from "@/lib/auth-flow";
import { sendProvisioningFailureEmailOnce } from "./workspace-signup-failure-notify";
import { notifyPlatformNewWorkspace } from "./workspace-signup-platform-alerts";
import { notifyWorkspaceSignupWelcome } from "./workspace-signup-welcome-notify";
import { sendEmail } from "@/lib/email";
import { workspacePathUrl } from "@/lib/saas/workspace-public-url";
import { onboardStarterContent } from "@/lib/site-admin/server/onboard-starter-content";
import {
  SIGNUP_BUSINESS_DESCRIPTION_KEY,
  normalizeSignupBusinessDescription,
} from "@/lib/site-admin/server/onboard-signup-description";
import type { AccessProfileWithDisplayName } from "@/lib/access-profile";
import { logServerError } from "@/lib/server/safe-error";
import {
  createServiceRoleClient,
  createUncachedServiceRoleClient,
} from "@/lib/supabase/admin";
import { createWorkspaceCheckoutSession } from "@/lib/stripe/workspace-billing";
import { getRequestLocale } from "@/i18n/request-locale";
import { type WorkspacePlanKey } from "@/lib/stripe/price-ids";
import { resolveWorkspacePriceId } from "@/lib/stripe/price-catalog";
import {
  findFreeWorkspaceLimitBlocker,
  findLeadOwnedFreeWorkspace,
} from "./workspace-signup-free-limit";
import { generateAvailableWorkspaceSlug } from "./workspace-signup-slug.server";
import { PLAN_TIER_LABEL, isWorkspacePlanTier } from "@/lib/platform/plan-override";
import { PLAN_SEAT_CAPS } from "./plan-seat-caps";
import {
  isNetworkWorkspaceTierInterest,
  isPaidWorkspaceTierInterest,
  isSelfServeWorkspaceLeadEligible,
  resolveWorkspaceOwnerAppRole,
  preferredWorkspaceSlugFromLead,
} from "./workspace-signup";

type MarketingLeadRow = {
  id: string;
  email: string;
  name: string;
  business_name: string | null;
  /**
   * The free-text "what do you do?" blurb from the /get-started disclosure.
   * Its migration comment promises it "seeds the page-builder AI 'describe your
   * page' front door during onboarding"; it never reached the workspace because
   * `loadLead` did not select it.
   */
  business_description: string | null;
  audience: "operator" | "agency" | "organization" | "business";
  roster_size: string | null;
  subdomain_wanted: string | null;
  tier_interest: string | null;
  status: string;
  claimed_by_profile_id: string | null;
  provisioned_tenant_id: string | null;
  notes: string | null;
  /**
   * The `?promo=` code the visitor arrived on, validated once at render and
   * carried here so it survives the register → provision → checkout hop. The
   * checkout resolver validates it AGAIN — it started life as a URL param.
   */
  promo_code: string | null;
};

// Dedup marker + send helper live in `workspace-signup-failure-notify.ts`
// (split out to keep this file under the 800-line cap).


export type ProvisionWorkspaceResult =
  | {
      ok: true;
      tenantId: string;
      tenantSlug: string;
      tenantName: string;
      adminPath: string;
      publicPath: string;
      publicUrl: string;
      reusedExisting: boolean;
      checkoutUrl?: string;
      requireSalesContact?: boolean;
      planKey?: WorkspacePlanKey;
    }
  | {
      ok: false;
      error:
        | "missing_lead"
        | "invalid_lead"
        | "email_mismatch"
        | "claimed_elsewhere"
        | "free_workspace_limit"
        | "service_unavailable"
        | "provision_failed";
      message: string;
      /**
       * Set on `free_workspace_limit` so the trampoline can send the owner to
       * the workspace they ALREADY have instead of dead-ending them.
       */
      existingWorkspace?: {
        slug: string;
        displayName: string;
        adminPath: string;
      };
    };

async function ensureWorkspaceScaffold(params: {
  tenantId: string;
  displayName: string;
  actorProfileId: string;
  /** Signup answer, so the starter homepage speaks to this kind of business. */
  audience?: "operator" | "agency" | "organization" | "business";
  /** Signup blurb, parked on the workspace for the AI "describe your page" door. */
  businessDescription?: string | null;
}): Promise<void> {
  // READ-AFTER-WRITE: this whole trampoline executes inside a Server Component
  // render (`/onboarding/workspace`), where Next memoizes identical fetch GETs
  // for the lifetime of the render. The starter seed INSERTs the homepage row
  // and then re-reads it under the same PostgREST URL several times (its own
  // read, plus the CAS reads inside saveHomepageDraftComposition and
  // publishHomepage). With the memoized client every one of those reads got the
  // pre-INSERT empty body — which is why 4/4 rehearsal signups shipped an
  // unpublished, section-less storefront. See createUncachedServiceRoleClient.
  const admin = createUncachedServiceRoleClient();
  if (!admin) return;

  const publicName = params.displayName.trim() || "New Workspace";

  const { error: identityError } = await admin
    .from("agency_business_identity")
    .upsert(
      {
        tenant_id: params.tenantId,
        public_name: publicName,
      },
      {
        onConflict: "tenant_id",
        ignoreDuplicates: true,
      },
    );

  if (identityError) {
    logServerError("workspace-signup.ensureWorkspaceScaffold.identity", identityError);
  }

  const { error: brandingError } = await admin
    .from("agency_branding")
    .upsert(
      {
        tenant_id: params.tenantId,
        theme_json: {},
      },
      {
        onConflict: "tenant_id",
        ignoreDuplicates: true,
      },
    );

  if (brandingError) {
    logServerError("workspace-signup.ensureWorkspaceScaffold.branding", brandingError);
  }

  const starter = await onboardStarterContent(admin, {
    tenantId: params.tenantId,
    actorProfileId: params.actorProfileId,
    seedFreeStarter: true,
    audience: params.audience,
    businessDescription: params.businessDescription,
  });
  if (!starter.ok) {
    logServerError(
      "workspace-signup.ensureWorkspaceScaffold.homepage",
      new Error(starter.error ?? "starter-content failed"),
    );
  }
}

async function loadLead(leadId: string): Promise<MarketingLeadRow | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("saas_marketing_signups")
    .select(
      "id, email, name, business_name, business_description, audience, roster_size, subdomain_wanted, tier_interest, status, claimed_by_profile_id, provisioned_tenant_id, notes, promo_code",
    )
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    logServerError("workspace-signup.loadLead", error);
    return null;
  }

  return (data as MarketingLeadRow | null) ?? null;
}

async function attachLeadToTenant(params: {
  leadId: string;
  userId: string;
  tenantId: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;

  const { error } = await admin
    .from("saas_marketing_signups")
    .update({
      status: "onboarded",
      claimed_by_profile_id: params.userId,
      provisioned_tenant_id: params.tenantId,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", params.leadId);

  if (error) {
    logServerError("workspace-signup.attachLeadToTenant", error);
  }

  // Best-effort: guest tickets stamped with this lead inherit the new tenant.
  const { error: ticketError } = await admin
    .from("support_tickets")
    .update({ tenant_id: params.tenantId })
    .contains("metadata", { lead_id: params.leadId });
  if (ticketError) {
    logServerError("workspace-signup.backfillGuestTickets", ticketError);
  }

  // Release any subdomain TTL reservation this lead was holding. The slug is
  // now claimed by a real agencies row, so the reservation is redundant. We
  // delete by lead_id rather than slug to defensively handle the edge case
  // where the user changed their slug between form submit and provisioning
  // (shouldn't happen today, but the lead is the source of truth).
  const { error: releaseError } = await admin
    .from("saas_subdomain_reservations")
    .delete()
    .eq("lead_id", params.leadId);

  if (releaseError) {
    logServerError("workspace-signup.releaseReservation", releaseError);
  }
}

function buildSignupSettings(lead: MarketingLeadRow): Record<string, unknown> {
  const settings: Record<string, unknown> = {
    signup_audience: lead.audience,
    signup_roster_size: lead.roster_size,
    signup_tier_interest: lead.tier_interest,
    // Collected by the funnel since 20260711183427 and stored nowhere the
    // workspace could read it. Parked here with the other provenance keys.
    [SIGNUP_BUSINESS_DESCRIPTION_KEY]:
      normalizeSignupBusinessDescription(lead.business_description),
    // Provenance stamp. `findLeadOwnedFreeWorkspace` uses this to recover a
    // crashed run of THIS lead without ever reaching for an unrelated
    // workspace the same person happens to own.
    signup_lead_id: lead.id,
  };
  if (isNetworkWorkspaceTierInterest(lead.tier_interest)) {
    settings.network_requested_at = new Date().toISOString();
  }
  return settings;
}

async function sendNetworkFounderAlert(params: {
  slug: string;
  tenantId: string;
  ownerEmail: string;
  ownerName: string;
}): Promise<void> {
  const to = process.env.FOUNDER_NOTIFY_EMAIL;
  if (!to) return;
  const appBase = getAppUrl();
  const adminDeepLink = `${appBase}/platform/admin/tenants`;
  try {
    await sendEmail({
      to,
      subject: `[Tulala] Network setup needed: ${params.slug}`,
      html: `<!doctype html>
<html><body style="margin:0;padding:24px;background:#fffdf7;font-family:Inter,system-ui,sans-serif;color:#0f1714;">
  <h2 style="margin:0 0 16px;font-weight:500;">Network workspace provisioned</h2>
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td style="padding:6px 12px 6px 0;color:#6b766f;font-size:13px;">Slug</td><td style="padding:6px 0;font-size:13px;">${params.slug}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b766f;font-size:13px;">Tenant ID</td><td style="padding:6px 0;font-size:13px;">${params.tenantId}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#6b766f;font-size:13px;">Owner</td><td style="padding:6px 0;font-size:13px;">${params.ownerName} &lt;${params.ownerEmail}&gt;</td></tr>
  </table>
  <p style="margin:20px 0 0;"><a href="${adminDeepLink}" style="color:#1f4a3a;">Open platform admin → tenants</a></p>
</body></html>`,
    });
  } catch (err) {
    logServerError("workspace-signup.networkFounderAlert", err);
  }
}

async function finalizeProvisionResult(params: {
  lead: MarketingLeadRow;
  agency: { id: string; slug: string; display_name: string };
  userId: string;
  userEmail: string | null | undefined;
  reusedExisting: boolean;
}): Promise<ProvisionWorkspaceResult> {
  const adminPath = `/${params.agency.slug}/admin`;
  const publicPath = `/${params.agency.slug}`;
  const publicUrl = workspacePathUrl(params.agency.slug);
  const tierInterest = params.lead.tier_interest;

  // revalidatePath is forbidden during server component renders in Next.js 16
  // (throws "used during render which is unsupported"). The workspace is new and
  // the browser is immediately redirected to it, so there are no stale cache
  // entries to invalidate here anyway. Drop the calls entirely.

  const ownerEmail = (params.userEmail ?? params.lead.email).trim();
  const ownerName = params.lead.name.trim() || params.agency.display_name;

  if (!params.reusedExisting && ownerEmail) {
    notifyWorkspaceSignupWelcome({
      tenantId: params.agency.id,
      ownerUserId: params.userId,
      ownerName,
      workspaceName: params.agency.display_name,
      planLabel: PLAN_TIER_LABEL.free,
      adminPath,
      publicUrl,
    });
  }

  if (!params.reusedExisting) {
    notifyPlatformNewWorkspace({
      tenantId: params.agency.id,
      workspaceName: params.agency.display_name,
      ownerEmail,
      planLabel: PLAN_TIER_LABEL[isWorkspacePlanTier(tierInterest) ? tierInterest : "free"],
    });
  }

  if (isNetworkWorkspaceTierInterest(tierInterest)) {
    // Founder always wants visibility on any Network signup — whether it
    // routes to self-serve Stripe checkout or to sales contact.
    void sendNetworkFounderAlert({
      slug: params.agency.slug,
      tenantId: params.agency.id,
      ownerEmail,
      ownerName,
    });

    const networkPriceId = await resolveWorkspacePriceId("network", "monthly");
    if (!networkPriceId) {
      // No self-serve price configured — sales-contact handoff.
      return {
        ok: true,
        tenantId: params.agency.id,
        tenantSlug: params.agency.slug,
        tenantName: params.agency.display_name,
        adminPath: `${adminPath}?upgrade=network`,
        publicPath,
        publicUrl,
        reusedExisting: params.reusedExisting,
        requireSalesContact: true,
      };
    }
    // networkPriceId is set — fall through to the Stripe checkout path below.
  }

  if (isPaidWorkspaceTierInterest(tierInterest) || isNetworkWorkspaceTierInterest(tierInterest)) {
    const checkout = await createWorkspaceCheckoutSession({
      tenantId: params.agency.id,
      planKey: tierInterest as WorkspacePlanKey,
      ownerEmail,
      displayName: params.agency.display_name,
      tenantSlug: params.agency.slug,
      appBaseUrl: getAppUrl(),
      // Re-validated inside `resolveCheckoutDiscount`; an account-level
      // discount still outranks it.
      promoCode: params.lead.promo_code,
      buyerUserId: params.lead.claimed_by_profile_id,
      // Signup runs inside the /onboarding/workspace render, so the request
      // locale is available; without it the first thing a new Spanish-speaking
      // owner sees is an English payment form.
      locale: await getRequestLocale(),
    });

    if (checkout.ok && checkout.data.url) {
      return {
        ok: true,
        tenantId: params.agency.id,
        tenantSlug: params.agency.slug,
        tenantName: params.agency.display_name,
        adminPath,
        publicPath,
        publicUrl,
        reusedExisting: params.reusedExisting,
        checkoutUrl: checkout.data.url,
        planKey: tierInterest as WorkspacePlanKey,
      };
    }

    logServerError(
      "workspace-signup.checkout",
      new Error(checkout.ok ? "missing url" : checkout.error),
    );
    return {
      ok: true,
      tenantId: params.agency.id,
      tenantSlug: params.agency.slug,
      tenantName: params.agency.display_name,
      adminPath: `${adminPath}/account?billing=checkout_failed`,
      publicPath,
      publicUrl,
      reusedExisting: params.reusedExisting,
    };
  }

  return {
    ok: true,
    tenantId: params.agency.id,
    tenantSlug: params.agency.slug,
    tenantName: params.agency.display_name,
    adminPath,
    publicPath,
    publicUrl,
    reusedExisting: params.reusedExisting,
  };
}

export async function provisionWorkspaceFromLead(params: {
  leadId: string;
  userId: string;
  userEmail: string | null | undefined;
  profile: AccessProfileWithDisplayName | null;
}): Promise<ProvisionWorkspaceResult> {
  if (!params.leadId) {
    return {
      ok: false,
      error: "missing_lead",
      message: "We couldn't find the workspace signup request. Start again from Get Started.",
    };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      ok: false,
      error: "service_unavailable",
      message: "Workspace signup is unavailable until Supabase is configured.",
    };
  }

  const lead = await loadLead(params.leadId);
  if (!lead) {
    return {
      ok: false,
      error: "invalid_lead",
      message: "That workspace signup link is no longer valid. Start again from Get Started.",
    };
  }

  if (!isSelfServeWorkspaceLeadEligible(lead.tier_interest)) {
    return {
      ok: false,
      error: "invalid_lead",
      message: "That signup still goes through assisted onboarding. Start from Get Started and we'll help you choose the right plan.",
    };
  }

  const leadEmail = lead.email.trim().toLowerCase();
  const actorEmail = (params.userEmail ?? "").trim().toLowerCase();
  if (!actorEmail) {
    return {
      ok: false,
      error: "email_mismatch",
      message: "Finish signup with the same email you used on Get Started so we can attach the workspace correctly.",
    };
  }
  // OAuth signup (e.g. Google) may use a different email than what was typed
  // in get-started. The workspace goes to the *authenticated* user regardless,
  // so blocking on mismatch breaks the funnel unnecessarily — the
  // claimed_by_profile_id gate below is the real anti-theft check.
  // Update the lead email to the auth address so welcome emails deliver.
  if (leadEmail && actorEmail && leadEmail !== actorEmail) {
    const adminForUpdate = createServiceRoleClient();
    if (adminForUpdate) {
      await adminForUpdate
        .from("saas_marketing_signups")
        .update({ email: params.userEmail })
        .eq("id", params.leadId);
    }
  }

  if (lead.claimed_by_profile_id && lead.claimed_by_profile_id !== params.userId) {
    await sendProvisioningFailureEmailOnce({ lead, kind: "claimed_elsewhere" });
    return {
      ok: false,
      error: "claimed_elsewhere",
      message: "That workspace signup has already been claimed by another account.",
    };
  }

  if (lead.provisioned_tenant_id) {
    const { data, error } = await admin
      .from("agencies")
      .select("id, slug, display_name")
      .eq("id", lead.provisioned_tenant_id)
      .maybeSingle();

    if (!error && data?.id && data.slug) {
      await ensureWorkspaceScaffold({
        tenantId: data.id,
        displayName: data.display_name,
        actorProfileId: params.userId,
        audience: lead.audience,
        businessDescription: lead.business_description,
      });
      return finalizeProvisionResult({
        lead,
        agency: { id: data.id, slug: data.slug, display_name: data.display_name },
        userId: params.userId,
        userEmail: params.userEmail,
        reusedExisting: true,
      });
    }
  }

  const desiredSlug = preferredWorkspaceSlugFromLead({
    subdomainWanted: lead.subdomain_wanted,
    // Prefer the business name for the slug fallback (when no explicit
    // subdomain was reserved) over the person's name.
    name: lead.business_name?.trim() || lead.name,
    email: lead.email,
  });

  // Crash recovery for THIS lead only (see findLeadOwnedFreeWorkspace).
  const existingFree = await findLeadOwnedFreeWorkspace({
    userId: params.userId,
    leadId: lead.id,
    desiredSlug,
    currentLeadTierInterest: lead.tier_interest,
  });
  if (existingFree) {
    await ensureWorkspaceScaffold({
      tenantId: existingFree.tenantId,
      displayName: existingFree.displayName,
      actorProfileId: params.userId,
      audience: lead.audience,
      businessDescription: lead.business_description,
    });
    await attachLeadToTenant({
      leadId: lead.id,
      userId: params.userId,
      tenantId: existingFree.tenantId,
    });
    return finalizeProvisionResult({
      lead,
      agency: {
        id: existingFree.tenantId,
        slug: existingFree.slug,
        display_name: existingFree.displayName,
      },
      userId: params.userId,
      userEmail: params.userEmail,
      reusedExisting: true,
    });
  }

  // "One Free workspace per owner" (messaging-shells-handoff.md §1.4). We are
  // about to create a SECOND one, so stop and say so. Previously this branch
  // silently reused whatever Free workspace the person already had, which made
  // /get-started promise a slug it never created and dropped the owner into a
  // workspace with a different name. Paid tiers are unaffected: they fall
  // through and get their own workspace.
  const blocker = await findFreeWorkspaceLimitBlocker({
    userId: params.userId,
    currentLeadTierInterest: lead.tier_interest,
  });
  if (blocker) {
    return {
      ok: false,
      error: "free_workspace_limit",
      message: `Your account already has a free workspace, ${blocker.displayName}. Each account gets one free workspace, so we did not create a second one. Open the workspace you have, or upgrade it to a paid plan to add another.`,
      existingWorkspace: {
        slug: blocker.slug,
        displayName: blocker.displayName,
        adminPath: `/${blocker.slug}/admin`,
      },
    };
  }

  const slug = await generateAvailableWorkspaceSlug(desiredSlug);
  // The workspace is born named after the BUSINESS the user typed on
  // /get-started (e.g. "Riviera Maya Work"), falling back to the person's
  // name only for legacy leads that predate the business_name column.
  const displayName = lead.business_name?.trim() || lead.name.trim() || "New Workspace";
  const now = new Date().toISOString();

  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .insert({
      slug,
      display_name: displayName,
      // `kind` stays "agency" for EVERY self-serve workspace, business ones
      // included. Host routing in `proxy.ts` gates on positive `kind`
      // predicates (`kind: "agency" | "hub"`), so a third kind would fall
      // through every one of them and 404 the tenant's own storefront.
      // What a business IS gets said by `workspace_type`, not by `kind`.
      kind: "agency",
      status: "active",
      template_key: "default",
      supported_locales: ["en"],
      onboarding_completed_at: now,
      // A local business runs the business-shaped workspace (no roster to
      // represent); everyone else stays talent-shaped.
      workspace_type: lead.audience === "business" ? "business" : "talent",
      // Deliberately NOT the Website tier. Website is PAID: the upgrade runs
      // through the existing post-provision checkout and the Stripe webhook
      // sets `plan_tier`. Provisioning anyone straight onto a paid tier would
      // hand out a paid plan nobody has paid for.
      plan_tier: "free",
      talent_seat_limit: PLAN_SEAT_CAPS.free,
      settings: buildSignupSettings(lead),
    })
    .select("id, slug, display_name")
    .single();

  if (agencyError || !agency?.id || !agency.slug) {
    logServerError("workspace-signup.insertAgency", agencyError ?? "missing agency row");
    await sendProvisioningFailureEmailOnce({ lead, kind: "provision_failed" });
    return {
      ok: false,
      error: "provision_failed",
      message: "We couldn't create the workspace yet. Please try again in a minute.",
    };
  }

  const { error: membershipError } = await admin
    .from("agency_memberships")
    .insert({
      tenant_id: agency.id,
      profile_id: params.userId,
      role: "owner",
      status: "active",
      accepted_at: now,
    });

  if (membershipError) {
    logServerError("workspace-signup.insertMembership", membershipError);
    await sendProvisioningFailureEmailOnce({ lead, kind: "provision_failed" });
    return {
      ok: false,
      error: "provision_failed",
      message: "The workspace was created, but owner access could not be attached yet. Please try again in a minute.",
    };
  }

  const profilePatch: Record<string, unknown> = {
    account_status: "active",
    onboarding_completed_at: now,
    updated_at: now,
  };

  const ownerAppRole = resolveWorkspaceOwnerAppRole(params.profile?.app_role);
  if (ownerAppRole) {
    profilePatch.app_role = ownerAppRole;
  }

  // Propagate the lead's human name to the profile so the admin shell
  // greeting shows the real name rather than the email local-part.
  // Only set when there's a name to set and the profile doesn't already
  // have one from a prior onboarding step.
  const leadName = lead.name?.trim() ?? "";
  if (leadName && !params.profile?.display_name?.trim()) {
    profilePatch.display_name = leadName;
    // Best-effort first/last split: "QA Test Two" → first="QA Test", last="Two"
    const parts = leadName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      profilePatch.first_name = parts.slice(0, -1).join(" ");
      profilePatch.last_name  = parts[parts.length - 1];
    } else if (parts.length === 1) {
      profilePatch.first_name = parts[0];
    }
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update(profilePatch)
    .eq("id", params.userId);

  if (profileError) {
    logServerError("workspace-signup.updateProfile", profileError);
  }

  await ensureWorkspaceScaffold({
    tenantId: agency.id,
    displayName: agency.display_name,
    actorProfileId: params.userId,
    // THE FIRST-RUN PATH. This is the only one of the three scaffold calls a
    // real new customer takes, and it was the only one that omitted the
    // audience — so `buildFreeStarterEntries` silently defaulted every fresh
    // workspace to "agency" and a solo photographer's homepage announced that
    // they "represent makeup, hair, photography, and styling professionals".
    // The two crash-recovery calls above passed it, which is exactly why this
    // shipped: the tests exercised the pure builder, never this wiring.
    audience: lead.audience,
    businessDescription: lead.business_description,
  });
  await attachLeadToTenant({
    leadId: lead.id,
    userId: params.userId,
    tenantId: agency.id,
  });

  return finalizeProvisionResult({
    lead,
    agency: { id: agency.id, slug: agency.slug, display_name: agency.display_name },
    userId: params.userId,
    userEmail: params.userEmail,
    reusedExisting: false,
  });
}
