import { workspacePathUrl } from "@/lib/saas/workspace-public-url";
import { onboardStarterContent } from "@/lib/site-admin/server/onboard-starter-content";
import type { AccessProfileWithDisplayName } from "@/lib/access-profile";
import { isReservedSlug } from "@/lib/site-admin/reserved-routes";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
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

  const starter = await onboardStarterContent(admin, { tenantId: params.tenantId });
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
      "id, email, name, audience, subdomain_wanted, tier_interest, status, claimed_by_profile_id, provisioned_tenant_id",
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
      });
      return {
        ok: true,
        tenantId: data.id,
        tenantSlug: data.slug,
        tenantName: data.display_name,
        adminPath: `/${data.slug}/admin`,
        publicPath: `/${data.slug}`,
        publicUrl: workspacePathUrl(data.slug),
        reusedExisting: true,
      };
    }
  }

  const existingFree = await findOwnedFreeWorkspace(params.userId);
  if (existingFree) {
    await ensureWorkspaceScaffold({
      tenantId: existingFree.tenantId,
      displayName: existingFree.displayName,
    });
    await attachLeadToTenant({
      leadId: lead.id,
      userId: params.userId,
      tenantId: existingFree.tenantId,
    });
    return {
      ok: true,
      tenantId: existingFree.tenantId,
      tenantSlug: existingFree.slug,
      tenantName: existingFree.displayName,
      adminPath: `/${existingFree.slug}/admin`,
      publicPath: `/${existingFree.slug}`,
      publicUrl: workspacePathUrl(existingFree.slug),
      reusedExisting: true,
    };
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
  });
  await attachLeadToTenant({
    leadId: lead.id,
    userId: params.userId,
    tenantId: agency.id,
  });

  return {
    ok: true,
    tenantId: agency.id,
    tenantSlug: agency.slug,
    tenantName: agency.display_name,
    adminPath: `/${agency.slug}/admin`,
    publicPath: `/${agency.slug}`,
    publicUrl: workspacePathUrl(agency.slug),
    reusedExisting: false,
  };
}
