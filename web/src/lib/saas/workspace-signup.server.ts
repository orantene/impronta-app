import { getAppUrl } from "@/lib/auth-flow";
import { renderWorkspaceWelcomeEmail } from "@/lib/email/workspace-welcome";
import { sendEmail } from "@/lib/email";
import { workspacePathUrl } from "@/lib/saas/workspace-public-url";
import { onboardStarterContent } from "@/lib/site-admin/server/onboard-starter-content";
import type { AccessProfileWithDisplayName } from "@/lib/access-profile";
import { isReservedSlug } from "@/lib/site-admin/reserved-routes";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createWorkspaceCheckoutSession } from "@/lib/stripe/workspace-billing";
import type { WorkspacePlanKey } from "@/lib/stripe/price-ids";
import { revalidatePath } from "next/cache";
import {
  isNetworkWorkspaceTierInterest,
  isPaidWorkspaceTierInterest,
  isReservedWorkspaceSlug,
  isSelfServeWorkspaceLeadEligible,
  isWorkspaceSignupProfileEligible,
  normalizeWorkspaceSlugCandidate,
  preferredWorkspaceSlugFromLead,
  WORKSPACE_SLUG_MAX_LENGTH,
} from "./workspace-signup";

type MarketingLeadRow = {
  id: string;
  email: string;
  name: string;
  audience: "operator" | "agency" | "organization";
  roster_size: string | null;
  subdomain_wanted: string | null;
  tier_interest: string | null;
  status: string;
  claimed_by_profile_id: string | null;
  provisioned_tenant_id: string | null;
};

type OwnedWorkspaceRow = {
  tenant_id: string;
  agencies:
    | {
        slug: string;
        display_name: string;
        plan_tier: string | null;
      }
    | {
        slug: string;
        display_name: string;
        plan_tier: string | null;
      }[]
    | null;
};

type ExistingRoleBindings = {
  hasClientProfile: boolean;
  hasTalentProfile: boolean;
};

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
        | "unsupported_existing_role"
        | "service_unavailable"
        | "provision_failed";
      message: string;
    };

async function findOwnedFreeWorkspace(
  userId: string,
): Promise<{
  tenantId: string;
  slug: string;
  displayName: string;
} | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("agency_memberships")
    .select("tenant_id, agencies:tenant_id ( slug, display_name, plan_tier )")
    .eq("profile_id", userId)
    .eq("role", "owner")
    .eq("status", "active");

  if (error) {
    logServerError("workspace-signup.findOwnedFreeWorkspace", error);
    return null;
  }

  const rows = (data ?? []) as OwnedWorkspaceRow[];
  for (const row of rows) {
    const agency = Array.isArray(row.agencies) ? row.agencies[0] ?? null : row.agencies;
    if (!agency || agency.plan_tier !== "free" || !agency.slug) continue;
    return {
      tenantId: row.tenant_id,
      slug: agency.slug,
      displayName: agency.display_name,
    };
  }

  return null;
}

async function ensureWorkspaceScaffold(params: {
  tenantId: string;
  displayName: string;
  actorProfileId: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
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
  });
  if (!starter.ok) {
    logServerError(
      "workspace-signup.ensureWorkspaceScaffold.homepage",
      new Error(starter.error ?? "starter-content failed"),
    );
  }
}

async function generateAvailableWorkspaceSlug(
  preferred: string,
): Promise<string> {
  const admin = createServiceRoleClient();
  if (!admin) {
    return preferred || "workspace";
  }

  const normalizedBase = normalizeWorkspaceSlugCandidate(preferred) || "workspace";
  const base = isReservedWorkspaceSlug(normalizedBase) ? "workspace" : normalizedBase;

  const { data, error } = await admin
    .from("agencies")
    .select("slug")
    .or(`slug.eq.${base},slug.like.${base}-%`)
    .limit(200);

  if (error) {
    logServerError("workspace-signup.generateAvailableWorkspaceSlug", error);
    return base;
  }

  const existing = new Set(
    (data ?? [])
      .map((row) => String((row as { slug?: string }).slug ?? "").trim().toLowerCase())
      .filter(Boolean),
  );

  if (!existing.has(base) && !isReservedSlug(base)) {
    return base;
  }

  for (let suffix = 2; suffix < 500; suffix += 1) {
    const suffixText = `-${suffix}`;
    const trimmedBase = base.slice(0, WORKSPACE_SLUG_MAX_LENGTH - suffixText.length);
    const candidate = `${trimmedBase.replace(/-+$/, "")}${suffixText}`;
    if (!existing.has(candidate) && !isReservedSlug(candidate)) {
      return candidate;
    }
  }

  return `${base.slice(0, 28).replace(/-+$/, "")}-${Date.now().toString().slice(-3)}`;
}

async function loadLead(leadId: string): Promise<MarketingLeadRow | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("saas_marketing_signups")
    .select(
      "id, email, name, audience, roster_size, subdomain_wanted, tier_interest, status, claimed_by_profile_id, provisioned_tenant_id",
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
}

async function loadExistingRoleBindings(
  userId: string,
): Promise<ExistingRoleBindings | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const [clientResult, talentResult] = await Promise.all([
    admin.from("client_profiles").select("id").eq("user_id", userId).limit(1),
    admin
      .from("talent_profiles")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(1),
  ]);

  if (clientResult.error) {
    logServerError("workspace-signup.loadExistingRoleBindings.client", clientResult.error);
    return null;
  }

  if (talentResult.error) {
    logServerError("workspace-signup.loadExistingRoleBindings.talent", talentResult.error);
    return null;
  }

  return {
    hasClientProfile: (clientResult.data?.length ?? 0) > 0,
    hasTalentProfile: (talentResult.data?.length ?? 0) > 0,
  };
}

function buildSignupSettings(lead: MarketingLeadRow): Record<string, unknown> {
  const settings: Record<string, unknown> = {
    signup_audience: lead.audience,
    signup_roster_size: lead.roster_size,
    signup_tier_interest: lead.tier_interest,
  };
  if (isNetworkWorkspaceTierInterest(lead.tier_interest)) {
    settings.network_requested_at = new Date().toISOString();
  }
  return settings;
}

async function sendWorkspaceWelcomeEmail(params: {
  ownerEmail: string;
  ownerName: string;
  planTier: string;
  slug: string;
  adminPath: string;
  publicUrl: string;
}): Promise<void> {
  const appBase = getAppUrl();
  try {
    await sendEmail({
      to: params.ownerEmail,
      subject: `Your ${params.slug} workspace is ready — ${params.ownerName}`,
      html: renderWorkspaceWelcomeEmail({
        ownerName: params.ownerName,
        planTier: params.planTier,
        slug: params.slug,
        adminUrl: `${appBase}${params.adminPath}`,
        publicUrl: params.publicUrl,
      }),
      replyTo: process.env.EMAIL_REPLY_TO,
    });
  } catch (err) {
    logServerError("workspace-signup.welcomeEmail", err);
  }
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

  revalidatePath("/", "layout");
  revalidatePath(adminPath, "layout");

  const ownerEmail = (params.userEmail ?? params.lead.email).trim();
  const ownerName = params.lead.name.trim() || params.agency.display_name;

  if (!params.reusedExisting && ownerEmail) {
    await sendWorkspaceWelcomeEmail({
      ownerEmail,
      ownerName,
      planTier: "free",
      slug: params.agency.slug,
      adminPath,
      publicUrl,
    });
  }

  if (isNetworkWorkspaceTierInterest(tierInterest)) {
    void sendNetworkFounderAlert({
      slug: params.agency.slug,
      tenantId: params.agency.id,
      ownerEmail,
      ownerName,
    });
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

  if (isPaidWorkspaceTierInterest(tierInterest)) {
    const checkout = await createWorkspaceCheckoutSession({
      tenantId: params.agency.id,
      planKey: tierInterest,
      ownerEmail,
      displayName: params.agency.display_name,
      tenantSlug: params.agency.slug,
      appBaseUrl: getAppUrl(),
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
        planKey: tierInterest,
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
  if (!leadEmail || !actorEmail || leadEmail !== actorEmail) {
    return {
      ok: false,
      error: "email_mismatch",
      message: "Finish signup with the same email you used on Get Started so we can attach the workspace correctly.",
    };
  }

  if (lead.claimed_by_profile_id && lead.claimed_by_profile_id !== params.userId) {
    return {
      ok: false,
      error: "claimed_elsewhere",
      message: "That workspace signup has already been claimed by another account.",
    };
  }

  const existingRoleBindings =
    params.profile?.app_role &&
    params.profile.app_role !== "agency_staff" &&
    params.profile.app_role !== "super_admin"
      ? await loadExistingRoleBindings(params.userId)
      : {
          hasClientProfile: false,
          hasTalentProfile: false,
        };

  if (!existingRoleBindings) {
    return {
      ok: false,
      error: "service_unavailable",
      message: "We couldn't verify this account yet. Please try workspace signup again in a minute.",
    };
  }

  if (
    !isWorkspaceSignupProfileEligible({
      appRole: params.profile?.app_role,
      accountStatus: params.profile?.account_status,
      onboardingCompletedAt: params.profile?.onboarding_completed_at,
      hasClientProfile: existingRoleBindings.hasClientProfile,
      hasTalentProfile: existingRoleBindings.hasTalentProfile,
    })
  ) {
    return {
      ok: false,
      error: "unsupported_existing_role",
      message: "This account already belongs to a client or talent flow. Use a dedicated operator account for workspace creation right now.",
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

  const existingFree = await findOwnedFreeWorkspace(params.userId);
  if (existingFree) {
    await ensureWorkspaceScaffold({
      tenantId: existingFree.tenantId,
      displayName: existingFree.displayName,
      actorProfileId: params.userId,
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

  const desiredSlug = preferredWorkspaceSlugFromLead({
    subdomainWanted: lead.subdomain_wanted,
    name: lead.name,
    email: lead.email,
  });
  const slug = await generateAvailableWorkspaceSlug(desiredSlug);
  const displayName = lead.name.trim() || "New Workspace";
  const now = new Date().toISOString();

  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .insert({
      slug,
      display_name: displayName,
      kind: "agency",
      status: "active",
      template_key: "default",
      supported_locales: ["en"],
      onboarding_completed_at: now,
      plan_tier: "free",
      talent_seat_limit: 5,
      settings: buildSignupSettings(lead),
    })
    .select("id, slug, display_name")
    .single();

  if (agencyError || !agency?.id || !agency.slug) {
    logServerError("workspace-signup.insertAgency", agencyError ?? "missing agency row");
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

  if (params.profile?.app_role !== "super_admin") {
    profilePatch.app_role = "agency_staff";
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
