import "server-only";

/**
 * TUL-84 · the real `EssentialsStore`: service-role writes that reuse the
 * existing tables and merge rules (talent_offerings, talent_booking_hours,
 * booking_terms.directBookingOptIn, agencies.settings.appointments). The
 * session-bound server actions (saveBookingHours, updateTenantAppointmentsSettings)
 * cannot run mid-build for a brand-new tenant, so this mirrors their writes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { inviteRosterTalent } from "@/lib/server-actions/roster-invite";
import { normalizeTenantAppointmentsSettings } from "@/lib/scheduling/appointments-settings-types";
import { isValidIanaTimeZone } from "@/lib/scheduling/tz";
import { resolveHoursTenantId, upsertBookingHoursFromOnboarding } from "@/lib/scheduling/sync-hours-from-pattern.server";
import type { WeeklyHours } from "@/lib/scheduling/hours-types";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

import type { EssentialsStore, OfferingOwnerRef } from "./essentials";

function must<T extends { error: { message: string } | null }>(label: string, r: T): T {
  if (r.error) {
    logServerError(`onboarding.essentials.${label}`, r.error);
    throw new Error(label);
  }
  return r;
}

async function mergeJson(admin: SupabaseClient, table: "talent_profiles" | "agencies", column: string, id: string, patch: Record<string, unknown>) {
  const read = must("mergeRead", await admin.from(table).select(column).eq("id", id).maybeSingle());
  const row = read.data as unknown as Record<string, unknown> | null;
  const cur = row?.[column];
  const base = cur && typeof cur === "object" && !Array.isArray(cur) ? (cur as Record<string, unknown>) : {};
  must("mergeWrite", await admin.from(table).update({ [column]: { ...base, ...patch } }).eq("id", id));
}

/** Tenant a talent's offerings/hours belong to when she has no workspace of her own (hub roster). */
export async function resolveTalentHubTenantId(admin: SupabaseClient, talentProfileId: string): Promise<string | null> {
  return resolveHoursTenantId(admin, talentProfileId, null);
}

export function createEssentialsStore(admin: SupabaseClient): EssentialsStore {
  const ownerFilter = (owner: OfferingOwnerRef) => {
    const q = admin.from("talent_offerings").select("id, title, status");
    return owner.kind === "talent"
      ? q.eq("talent_profile_id", owner.talentProfileId).eq("owner_kind", "talent")
      : q.eq("tenant_id", owner.tenantId).eq("owner_kind", "workspace");
  };

  return {
    async listOfferings(owner) {
      const r = must("listOfferings", await ownerFilter(owner));
      return ((r.data ?? []) as Array<{ id: string; title: string; status: string }>).map((o) => ({ id: o.id, title: String(o.title), status: String(o.status) }));
    },

    async insertOfferings(owner, rows) {
      const base = owner.kind === "talent"
        ? { owner_kind: "talent", talent_profile_id: owner.talentProfileId, tenant_id: owner.tenantId }
        : { owner_kind: "workspace", talent_profile_id: null, tenant_id: owner.tenantId };
      must("insertOfferings", await admin.from("talent_offerings").insert(rows.map((r) => ({ ...base, ...r }))));
    },

    async updateOffering(id, patch) {
      must("updateOffering", await admin.from("talent_offerings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
    },

    async upsertTalentHours({ talentProfileId, tenantId, weekly, timezone }) {
      // The one allowed hours writer (booking-hours write-surface invariant, T1-07).
      return upsertBookingHoursFromOnboarding(admin, { talentProfileId, tenantId, weekly: weekly as WeeklyHours, timezone });
    },

    async setTalentBookable(talentProfileId) {
      await mergeJson(admin, "talent_profiles", "booking_terms", talentProfileId, { directBookingOptIn: true });
    },

    async setTalentPlace(talentProfileId, place) {
      await mergeJson(admin, "talent_profiles", "booking_terms", talentProfileId, { place: { mode: place.mode, area: place.area } });
    },

    async setWorkspaceBusinessInfo(tenantId, info) {
      await mergeJson(admin, "agencies", "settings", tenantId, {
        opening_hours: info.hours,
        ...(info.place ? { business_place: { mode: info.place.mode, area: info.place.area } } : {}),
      });
    },

    async enableWorkspaceAppointments(tenantId, opts) {
      const read = must("apptRead", await admin.from("agencies").select("settings").eq("id", tenantId).maybeSingle());
      const settings = (read.data as { settings?: unknown } | null)?.settings;
      const base = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {};
      const cur = normalizeTenantAppointmentsSettings(base.appointments);
      const tz = opts.timezone && isValidIanaTimeZone(opts.timezone) ? opts.timezone : cur.timezone;
      const next = {
        ...cur,
        enabled: true,
        terminology: cur.enabled ? cur.terminology : ("appointments" as const),
        timezone: tz,
        presetId: cur.presetId ?? opts.presetId,
      };
      must("apptWrite", await admin.from("agencies").update({ settings: { ...base, appointments: next } }).eq("id", tenantId));
    },

    async hasActiveProvider(tenantId) {
      const r = must("providerCount", await tenantScopedQuery(admin, "agency_talent_roster", tenantId).select("id").eq("status", "active").limit(1));
      return (r.data ?? []).length > 0;
    },

    async inviteFirstProvider({ tenantSlug, email, name }) {
      // Session-bound existing flow (seat limit, dedupe, email). The new owner is the signed-in user.
      const r = await inviteRosterTalent(tenantSlug, name ?? "New provider", email);
      if (r.ok) return "invited";
      return /already on your roster/i.test(r.error) ? "already" : "failed";
    },
  };
}
