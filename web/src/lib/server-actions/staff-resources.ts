"use server";

/* eslint-disable ratchet/no-untenanted-from -- agencies is keyed by id (the tenant), talent_profiles has no tenant_id (filter is created_by_agency_id + profile_kind). */

/**
 * Business-workspace staff / chair resource profiles.
 * Server-enforces workspace_type='business'. Never uses roster UI.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { normalizeWorkspaceType } from "@/lib/saas/workspace-type";

export type StaffResource = {
  id: string;
  name: string;
};

type AuthBusiness =
  | { ok: true; tenantId: string; tenantSlug: string; userId: string }
  | { ok: false; error: string };

async function requireBusinessWorkspace(): Promise<AuthBusiness> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data: agency, error } = await auth.supabase
    .from("agencies")
    .select("workspace_type")
    .eq("id", auth.tenantId)
    .maybeSingle();
  if (error) {
    logServerError("staff-resources.workspaceType", error);
    return { ok: false, error: "Could not load workspace." };
  }
  if (normalizeWorkspaceType(agency?.workspace_type) !== "business") {
    return { ok: false, error: "Staff and resources are only available on a business workspace." };
  }
  return {
    ok: true,
    tenantId: auth.tenantId,
    tenantSlug: auth.tenantSlug,
    userId: auth.user.id,
  };
}

type ListResult = { ok: true; resources: StaffResource[] } | { ok: false; error: string };

export async function listStaffResources(): Promise<ListResult> {
  const auth = await requireBusinessWorkspace();
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data, error } = await admin
    .from("talent_profiles")
    .select("id, display_name, first_name")
    .eq("created_by_agency_id", auth.tenantId)
    .eq("profile_kind", "resource")
    .is("deleted_at", null)
    .order("display_name", { ascending: true });

  if (error) {
    logServerError("staff-resources.list", error);
    return { ok: false, error: "Could not load staff and resources." };
  }

  return {
    ok: true,
    resources: (data ?? []).map((row) => ({
      id: row.id,
      name: row.display_name || row.first_name || "Untitled",
    })),
  };
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

type CreateResult = { ok: true; resource: StaffResource } | { ok: false; error: string };

export async function createStaffResource(name: string): Promise<CreateResult> {
  const auth = await requireBusinessWorkspace();
  if (!auth.ok) return { ok: false, error: auth.error };
  const parsed = createSchema.safeParse({ name });
  if (!parsed.success) return { ok: false, error: "Enter a name." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: codeRow, error: codeErr } = await admin.rpc("generate_profile_code");
  if (codeErr || !codeRow) {
    logServerError("staff-resources.code", codeErr);
    return { ok: false, error: "Could not allocate a profile code. Try again." };
  }

  const { data: inserted, error: insertErr } = await admin
    .from("talent_profiles")
    .insert({
      profile_code: String(codeRow),
      display_name: parsed.data.name,
      first_name: parsed.data.name,
      profile_kind: "resource",
      created_by_agency_id: auth.tenantId,
      workflow_status: "approved",
      visibility: "hidden",
      is_publicly_hidden: true,
      membership_tier: "free",
      membership_status: "active",
    })
    .select("id, display_name")
    .single();

  if (insertErr || !inserted) {
    logServerError("staff-resources.create", insertErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, resource: { id: inserted.id, name: inserted.display_name || parsed.data.name } };
}

type ArchiveResult = { ok: true } | { ok: false; error: string };

export async function archiveStaffResource(resourceId: string): Promise<ArchiveResult> {
  const auth = await requireBusinessWorkspace();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!/^[0-9a-f-]{36}$/i.test(resourceId)) return { ok: false, error: "Invalid resource." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: existing, error: readErr } = await admin
    .from("talent_profiles")
    .select("id, profile_kind, created_by_agency_id")
    .eq("id", resourceId)
    .maybeSingle();
  if (readErr || !existing) {
    if (readErr) logServerError("staff-resources.archive.read", readErr);
    return { ok: false, error: "Resource not found." };
  }
  if (existing.profile_kind !== "resource" || existing.created_by_agency_id !== auth.tenantId) {
    return { ok: false, error: "Forbidden." };
  }

  const { error } = await admin
    .from("talent_profiles")
    .update({
      deleted_at: new Date().toISOString(),
      is_publicly_hidden: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", resourceId);
  if (error) {
    logServerError("staff-resources.archive", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true };
}
