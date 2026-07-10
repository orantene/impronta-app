"use server";

/**
 * admin-guest-chat-settings.ts — WRITE/admin side of the per-tenant guest-chat
 * configuration. Powers the workspace Settings → Guest chat drawer.
 *
 * Auth: requireStaffTenantAction() resolves the caller's tenant from the session
 * and gives a staff-scoped Supabase client; the tenant_guest_chat_settings RLS
 * write policy (is_staff_of_tenant) is the real boundary. tenant_id is taken
 * from the session scope — NEVER from client input.
 *
 * The public render side reads via loadGuestChatSettings() (lib/inquiry/
 * guest-chat-settings.ts); this module is only the workspace control surface.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { GUEST_CHAT_DEFAULTS, type GuestChatSettings } from "@/lib/inquiry/guest-chat-settings";
import { mapGuestChatSettingsRow } from "@/lib/inquiry/guest-chat-settings-shape";

export type LoadGuestChatSettingsResult =
  | { ok: true; data: GuestChatSettings }
  | { ok: false; error: string };

export type SaveGuestChatSettingsInput = {
  enabled: boolean;
  showOnTalent: boolean;
  showOnDirectory: boolean;
  showOnHome: boolean;
  greeting: string | null;
};

export type SaveGuestChatSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

const saveSchema = z.object({
  enabled: z.boolean(),
  showOnTalent: z.boolean(),
  showOnDirectory: z.boolean(),
  showOnHome: z.boolean(),
  greeting: z
    .string()
    .max(280, "Keep the greeting under 280 characters.")
    .nullable()
    .optional(),
});

/**
 * Read the current tenant's guest-chat settings for the admin drawer. Returns
 * the all-on default when no row exists (matches the public reader's contract).
 */
export async function loadGuestChatSettingsForAdmin(): Promise<LoadGuestChatSettingsResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data, error } = await tenantScopedQuery(
    supabase,
    "tenant_guest_chat_settings",
    tenantId,
  )
    .select("enabled, show_on_talent, show_on_directory, show_on_home, greeting")
    .maybeSingle();

  if (error) {
    logServerError("admin-guest-chat-settings.load", error);
    return { ok: false, error: "Couldn't load guest-chat settings." };
  }

  if (!data) return { ok: true, data: GUEST_CHAT_DEFAULTS };

  return { ok: true, data: mapGuestChatSettingsRow(data) };
}

/**
 * Persist the tenant's guest-chat settings. Staff-gated; tenant_id from session.
 */
export async function saveGuestChatSettings(
  input: SaveGuestChatSettingsInput,
): Promise<SaveGuestChatSettingsResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user, tenantSlug } = auth;

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." };
  }
  const v = parsed.data;
  const greeting =
    typeof v.greeting === "string" && v.greeting.trim().length > 0 ? v.greeting.trim() : null;

  // tenantScopedQuery.upsert injects tenant_id (withTenant) so the row is always
  // scoped to the caller's tenant — the staff RLS policy is the real boundary.
  const { error } = await tenantScopedQuery(
    supabase,
    "tenant_guest_chat_settings",
    tenantId,
  ).upsert(
    {
      enabled: v.enabled,
      show_on_talent: v.showOnTalent,
      show_on_directory: v.showOnDirectory,
      show_on_home: v.showOnHome,
      greeting,
      updated_by: user.id,
    },
    { onConflict: "tenant_id" },
  );

  if (error) {
    logServerError("admin-guest-chat-settings.save", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // The launcher is server-rendered on public pages; bust the tenant's public
  // routes so the change shows immediately.
  revalidatePath(`/${tenantSlug}`);
  revalidatePath("/");
  revalidatePath("/directory");

  return { ok: true };
}
