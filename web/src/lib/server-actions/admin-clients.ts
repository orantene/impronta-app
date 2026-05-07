"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseWithSchema, trimmedString } from "@/lib/admin/validation";
import { requireStaff } from "@/lib/server/action-guards";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type AdminClientProfileActionState =
  | {
      error?: string;
      success?: boolean;
      message?: string;
      createdUserId?: string;
      temporaryPassword?: string;
      createdDisplayName?: string;
      createdCompanyName?: string | null;
      createdEmail?: string;
      createdPhone?: string | null;
    }
  | undefined;

const adminCreateClientSchema = z.object({
  display_name: z.string().min(1, "Client name is required."),
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
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
  const auth = await requireStaff();
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
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const parsed = parseWithSchema(adminCreateClientSchema, {
    display_name: trimmedString(formData, "display_name"),
    email: trimmedString(formData, "email").toLowerCase(),
    password: String(formData.get("password") ?? ""),
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

  const { display_name, email, password, company_name, phone, whatsapp_phone, website_url, notes } = parsed.data;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name,
    },
  });

  const userId = created.user?.id;
  if (createErr || !userId) {
    logServerError("admin/createAdminClient/auth", createErr);
    return { error: createErr?.message || CLIENT_ERROR.signUp };
  }

  const { supabase } = auth;

  const { error: profileErr } = await supabase
    .from("profiles")
    .update({
      display_name,
      app_role: "client",
      account_status: "active",
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (profileErr) {
    logServerError("admin/createAdminClient/profile", profileErr);
    return { error: CLIENT_ERROR.update };
  }

  const { error: clientProfileErr } = await supabase
    .from("client_profiles")
    .upsert(
      {
        user_id: userId,
        company_name: company_name || null,
        phone: phone || null,
        whatsapp_phone: whatsapp_phone || null,
        website_url: website_url || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (clientProfileErr) {
    logServerError("admin/createAdminClient/clientProfile", clientProfileErr);
    return { error: CLIENT_ERROR.update };
  }

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${userId}`);

  return {
    success: true,
    message: "Client login created.",
    createdUserId: userId,
    temporaryPassword: password,
    createdDisplayName: display_name,
    createdCompanyName: company_name || null,
    createdEmail: email,
    createdPhone: phone || null,
  };
}
