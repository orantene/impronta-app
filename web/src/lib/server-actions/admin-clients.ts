"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseWithSchema, trimmedString } from "@/lib/admin/validation";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { clientBelongsToTenant } from "@/lib/server/client-tenant-access";
import { createClientAccount } from "@/lib/server/create-client-account";
import { ensureTenantClientRelationship } from "@/lib/client-account/relationship.server";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";

// A.4 INTENTIONAL DIVERGENCE: convert to `ServerActionResult<T>`. This is a `useFormState`
// payload (admin "new client" sheet) that carries both success metadata
// (`createdUserId`, `invited`, etc.) and error state on the same
// object. Conversion requires moving the create-result fields under `data`
// + updating every form caller. Out of scope for the initial sweep.
export type AdminClientProfileActionState =
  | {
      error?: string;
      success?: boolean;
      message?: string;
      createdUserId?: string;
      createdDisplayName?: string;
      createdCompanyName?: string | null;
      createdEmail?: string;
      createdPhone?: string | null;
      /** An invitation email was sent; the client chooses their own password. */
      invited?: boolean;
    }
  | undefined;

const adminCreateClientSchema = z.object({
  display_name: z.string().min(1, "Client name is required."),
  email: z.string().email("Enter a valid email."),
  company_name: z.string(),
  phone: z.string(),
  whatsapp_phone: z.string(),
  website_url: z.string(),
  notes: z.string(),
});

const adminClientProfileSchema = z.object({
  user_id: z.string().min(1, "Missing client."),
  company_name: z.string(),
  phone: z.string(),
  whatsapp_phone: z.string(),
  website_url: z.string(),
  notes: z.string(),
});

export async function updateAdminClientProfile(
  _prev: AdminClientProfileActionState,
  formData: FormData,
): Promise<AdminClientProfileActionState> {
  await requireNotImpersonating();
  // TUL-1733: a WORKSPACE action. The old global `requireStaff()` admitted every self-serve studio owner
  // to ANY client's profile (and the RLS policy on client_profiles is just as global).
  const auth = await requireWorkspaceStaffAction({ capability: "edit_client_relationship" });
  if (!auth.ok) return { error: auth.error };

  const { supabase } = auth;
  const parsed = parseWithSchema(adminClientProfileSchema, {
    user_id: trimmedString(formData, "user_id"),
    company_name: trimmedString(formData, "company_name"),
    phone: trimmedString(formData, "phone"),
    whatsapp_phone: trimmedString(formData, "whatsapp_phone"),
    website_url: trimmedString(formData, "website_url"),
    notes: trimmedString(formData, "notes"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const {
    user_id: userId,
    company_name,
    phone,
    whatsapp_phone,
    website_url,
    notes,
  } = parsed.data;

  if (!(await clientBelongsToTenant(supabase, auth.tenantId, userId))) {
    return { error: CLIENT_ERROR.update };
  }

  const { error } = await supabase
    .from("client_profiles")
    .update({
      company_name: company_name || null,
      phone: phone || null,
      whatsapp_phone: whatsapp_phone || null,
      website_url: website_url || null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    logServerError("admin/updateAdminClientProfile", error);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${userId}`);
  return { success: true, message: "Client details saved." };
}

export async function createAdminClient(
  _prev: AdminClientProfileActionState,
  formData: FormData,
): Promise<AdminClientProfileActionState> {
  await requireNotImpersonating();
  // TUL-1733: a WORKSPACE action (editor and above). The new client is attached to the caller's workspace
  // below; the old global `requireStaff()` let any studio owner mint confirmed accounts platform-wide.
  const auth = await requireWorkspaceStaffAction({ capability: "edit_client_relationship" });
  if (!auth.ok) return { error: auth.error };

  const parsed = parseWithSchema(adminCreateClientSchema, {
    display_name: trimmedString(formData, "display_name"),
    email: trimmedString(formData, "email").toLowerCase(),
    company_name: trimmedString(formData, "company_name"),
    phone: trimmedString(formData, "phone"),
    whatsapp_phone: trimmedString(formData, "whatsapp_phone"),
    website_url: trimmedString(formData, "website_url"),
    notes: trimmedString(formData, "notes"),
  });
  if ("error" in parsed) return { error: parsed.error };

  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      error:
        "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to enable staff-created client logins.",
    };
  }

  const { display_name, email, company_name, phone } = parsed.data;
  const redirectTo = process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password` : undefined;

  // The client is invited by email and sets their own password (no password is typed or shown here).
  const created = await createClientAccount(
    {
      admin,
      redirectTo,
      attachToTenant: (userId) => ensureTenantClientRelationship({ userId, tenantId: auth.tenantId, originDomain: null }),
    },
    parsed.data,
  );
  if (!created.ok) {
    return { error: created.step === "invite" ? created.message || CLIENT_ERROR.signUp : CLIENT_ERROR.update };
  }
  const userId = created.userId;

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${userId}`);

  return {
    success: true,
    message: "Invitation sent.",
    createdUserId: userId,
    createdDisplayName: display_name,
    createdCompanyName: company_name || null,
    createdEmail: email,
    createdPhone: phone || null,
    invited: true,
  };
}
