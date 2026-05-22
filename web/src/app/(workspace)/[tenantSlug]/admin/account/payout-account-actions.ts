"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { findTenantMembership } from "@/lib/saas/tenant";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";

function backToAccount(tenantSlug: string, params: URLSearchParams): never {
  redirect(`/${tenantSlug}/admin/account?${params.toString()}`);
}

export async function createWorkspacePayoutAccountAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) {
    const p = new URLSearchParams({ perr: "Workspace not found." });
    backToAccount(tenantSlug, p);
  }

  const canManageWorkspacePayout = await userHasCapability("agency.payout_account.manage", scope.tenantId);
  const canManageBilling = await userHasCapability("manage_billing", scope.tenantId);
  if (!canManageWorkspacePayout && !canManageBilling) {
    const p = new URLSearchParams({ perr: "You do not have permission to manage workspace payout accounts." });
    backToAccount(tenantSlug, p);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    const p = new URLSearchParams({ perr: "Database unavailable." });
    backToAccount(tenantSlug, p);
  }

  const { data: existing, error: existingError } = await supabase
    .from("payout_accounts")
    .select("id")
    .eq("tenant_id", scope.tenantId)
    .eq("owner_type", "agency")
    .eq("owner_id", scope.tenantId)
    .in("status", ["pending_verification", "connected"])
    .maybeSingle();

  if (existingError) {
    logServerError("account.createWorkspacePayout.lookup", existingError);
  }

  if (!existing) {
    const { data: agency } = await supabase
      .from("agencies")
      .select("display_name")
      .eq("id", scope.tenantId)
      .maybeSingle();

    const displayName = `${(agency as { display_name?: string } | null)?.display_name ?? "Workspace"} payouts`;
    const { error } = await supabase.from("payout_accounts").insert({
      tenant_id: scope.tenantId,
      owner_type: "agency",
      owner_id: scope.tenantId,
      display_name: displayName,
      provider: "manual_bank",
      status: "connected",
      connected_at: new Date().toISOString(),
    });

    if (error) {
      logServerError("account.createWorkspacePayout.insert", error);
      const p = new URLSearchParams({ perr: "Failed to create workspace payout account." });
      backToAccount(tenantSlug, p);
    }
  }

  revalidatePath(`/${tenantSlug}/admin/account`);
  const p = new URLSearchParams({ pmsg: existing ? "Workspace payout account already exists." : "Workspace payout account created." });
  backToAccount(tenantSlug, p);
}

export async function createStaffPayoutAccountAction(formData: FormData): Promise<never> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) {
    const p = new URLSearchParams({ perr: "Workspace not found." });
    backToAccount(tenantSlug, p);
  }

  const session = await getCachedActorSession();
  if (!session.user) {
    const p = new URLSearchParams({ perr: "Not authenticated." });
    backToAccount(tenantSlug, p);
  }

  const membership = await findTenantMembership(scope.tenantId);
  if (!membership || membership.status !== "active") {
    const p = new URLSearchParams({ perr: "You are not an active member of this workspace." });
    backToAccount(tenantSlug, p);
  }

  if (!["owner", "admin", "manager"].includes(membership.role)) {
    const p = new URLSearchParams({ perr: "Only owner, admin, or coordinator can be payout receivers." });
    backToAccount(tenantSlug, p);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    const p = new URLSearchParams({ perr: "Database unavailable." });
    backToAccount(tenantSlug, p);
  }

  const { data: existing, error: existingError } = await supabase
    .from("payout_accounts")
    .select("id")
    .eq("tenant_id", scope.tenantId)
    .eq("owner_type", "profile")
    .eq("owner_id", session.user.id)
    .in("status", ["pending_verification", "connected"])
    .maybeSingle();

  if (existingError) {
    logServerError("account.createStaffPayout.lookup", existingError);
  }

  if (!existing) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", session.user.id)
      .maybeSingle();

    const displayName =
      (profile as { display_name?: string } | null)?.display_name?.trim() ||
      session.user.email ||
      "Staff payout account";

    const { error } = await supabase.from("payout_accounts").insert({
      tenant_id: scope.tenantId,
      owner_type: "profile",
      owner_id: session.user.id,
      display_name: displayName,
      provider: "manual_bank",
      status: "connected",
      connected_at: new Date().toISOString(),
    });

    if (error) {
      logServerError("account.createStaffPayout.insert", error);
      const p = new URLSearchParams({ perr: "Failed to create your payout account." });
      backToAccount(tenantSlug, p);
    }
  }

  revalidatePath(`/${tenantSlug}/admin/account`);
  const p = new URLSearchParams({ pmsg: existing ? "Your payout account already exists." : "Your payout account is now connected." });
  backToAccount(tenantSlug, p);
}
