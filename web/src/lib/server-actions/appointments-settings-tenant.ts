"use server";

/* eslint-disable ratchet/no-untenanted-from -- agencies is the tenant-root table (keyed by id, not tenant_id); same pattern as commercial-terms-tenant. */

/**
 * Per-workspace appointments config at agencies.settings.appointments.
 * Read-modify-MERGE — never clobber sibling settings keys.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  normalizeTenantAppointmentsSettings,
  type TenantAppointmentsSettings,
} from "@/lib/scheduling/appointments-settings-types";
import { TERMINOLOGY_IDS } from "@/lib/scheduling/terminology";

const defaultsSchema = z
  .object({
    slotMinutes: z.number().int().min(1).max(480),
    bufferBeforeMin: z.number().int().min(0).max(240),
    bufferAfterMin: z.number().int().min(0).max(240),
    minNoticeMin: z.number().int().min(0).max(60 * 24 * 30),
    horizonDays: z.number().int().min(1).max(365),
  })
  .strict();

const tenantAppointmentsSchema = z
  .object({
    enabled: z.boolean(),
    terminology: z.enum(TERMINOLOGY_IDS),
    timezone: z.string().min(1).max(80),
    allowTalentDirectBooking: z.boolean(),
    defaults: defaultsSchema,
    presetId: z.enum(["default", "barbershop", "salon", "clinic"]).nullable(),
  })
  .strict();

type LoadResult =
  | { ok: true; data: TenantAppointmentsSettings }
  | { ok: false; error: string };

export async function loadTenantAppointmentsSettings(): Promise<LoadResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data: agency, error } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    logServerError("appointments-settings-tenant.load", error);
    return { ok: false, error: "Could not load appointment settings." };
  }

  const settings =
    typeof agency?.settings === "object" && agency.settings !== null
      ? (agency.settings as Record<string, unknown>)
      : {};

  return { ok: true, data: normalizeTenantAppointmentsSettings(settings.appointments) };
}

type UpdateResult =
  | { ok: true; data: TenantAppointmentsSettings }
  | { ok: false; error: string };

export async function updateTenantAppointmentsSettings(
  tenantSlug: string,
  next: TenantAppointmentsSettings,
): Promise<UpdateResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  if (typeof tenantSlug === "string" && tenantSlug && tenantSlug !== auth.tenantSlug) {
    return { ok: false, error: "You don't have permission to change this." };
  }

  const parsed = tenantAppointmentsSchema.safeParse(next);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid appointments payload.",
    };
  }

  const { data: agency, error: readErr } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .single();
  if (readErr) {
    logServerError("appointments-settings-tenant.read", readErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const currentSettings: Record<string, unknown> =
    typeof agency?.settings === "object" && agency.settings !== null
      ? (agency.settings as Record<string, unknown>)
      : {};

  const nextAppointments: TenantAppointmentsSettings = {
    enabled: parsed.data.enabled,
    terminology: parsed.data.terminology,
    timezone: parsed.data.timezone,
    allowTalentDirectBooking: parsed.data.allowTalentDirectBooking,
    defaults: parsed.data.defaults,
    presetId: parsed.data.presetId,
  };

  const nextSettings = { ...currentSettings, appointments: nextAppointments };

  const { error: updateErr } = await supabase
    .from("agencies")
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq("id", tenantId);

  if (updateErr) {
    logServerError("appointments-settings-tenant.update", updateErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath(`/${auth.tenantSlug}`, "layout");
  return { ok: true, data: nextAppointments };
}
