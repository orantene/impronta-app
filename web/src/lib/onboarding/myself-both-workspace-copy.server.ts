import "server-only";

/**
 * TUL-453 · apply myself → both offerings/hours copy onto a freshly opened
 * studio workspace. Best-effort after roster: failures are logged, never roll
 * back the workspace (membership + roster already match #2945).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { normalizeTenantAppointmentsSettings } from "@/lib/scheduling/appointments-settings-types";
import { isValidIanaTimeZone } from "@/lib/scheduling/tz";

import {
  formatWeeklyHoursLines,
  planMyselfBothCopy,
  replaceEmptyHoursInJson,
  type OfferingRehomeRow,
} from "./myself-both-workspace-copy";

export type MyselfBothCopyResult = {
  offeringsMoved: number;
  openingHoursWritten: boolean;
  appointmentsEnabled: boolean;
  hoursTenantRehomed: boolean;
  homepageHoursPatched: boolean;
};

function asSettings(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
}

async function patchHomepageHours(
  admin: SupabaseClient,
  tenantId: string,
  weekly: unknown,
): Promise<boolean> {
  const linesEs = formatWeeklyHoursLines(weekly, "es");
  const linesEn = formatWeeklyHoursLines(weekly, "en");
  const lines = linesEs.length ? linesEs : linesEn;
  if (!lines.length) return false;

  const { data, error } = await admin
    .from("cms_pages")
    .select("id, published_homepage_snapshot")
    .eq("tenant_id", tenantId)
    .eq("system_template_key", "homepage")
    .maybeSingle();
  if (error) {
    logServerError("myself-both-copy.homepage.read", error);
    return false;
  }
  if (!data?.id || data.published_homepage_snapshot == null) return false;

  const patched = replaceEmptyHoursInJson(data.published_homepage_snapshot, lines);
  if (!patched.changed) {
    // Try EN lines if ES empty-message was already different, or vice versa.
    const alt = replaceEmptyHoursInJson(
      data.published_homepage_snapshot,
      linesEn.length ? linesEn : linesEs,
    );
    if (!alt.changed) return false;
    const { error: upErr } = await admin
      .from("cms_pages")
      .update({ published_homepage_snapshot: alt.value })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (upErr) {
      logServerError("myself-both-copy.homepage.write", upErr);
      return false;
    }
    return true;
  }

  const { error: upErr } = await admin
    .from("cms_pages")
    .update({ published_homepage_snapshot: patched.value })
    .eq("id", data.id)
    .eq("tenant_id", tenantId);
  if (upErr) {
    logServerError("myself-both-copy.homepage.write", upErr);
    return false;
  }
  return true;
}

/**
 * Move the owner's hub offerings onto `workspaceTenantId`, copy opening hours
 * into `agencies.settings`, turn appointments on, and replace baked empty
 * hours copy on the homepage when present.
 */
export async function copyMyselfOfferingsAndHoursToWorkspace(
  admin: SupabaseClient,
  input: { workspaceTenantId: string; talentProfileId: string },
): Promise<MyselfBothCopyResult> {
  const out: MyselfBothCopyResult = {
    offeringsMoved: 0,
    openingHoursWritten: false,
    appointmentsEnabled: false,
    hoursTenantRehomed: false,
    homepageHoursPatched: false,
  };

  const { data: offeringRows, error: offErr } = await admin
    .from("talent_offerings")
    .select("id, tenant_id, owner_kind")
    .eq("talent_profile_id", input.talentProfileId);
  if (offErr) {
    logServerError("myself-both-copy.offerings.read", offErr);
    return out;
  }

  const { data: hoursRow, error: hoursErr } = await admin
    .from("talent_booking_hours")
    .select("tenant_id, weekly, timezone")
    .eq("talent_profile_id", input.talentProfileId)
    .maybeSingle();
  if (hoursErr) logServerError("myself-both-copy.hours.read", hoursErr);

  const { data: agencyRow, error: agencyErr } = await admin
    .from("agencies")
    .select("settings")
    .eq("id", input.workspaceTenantId)
    .maybeSingle();
  if (agencyErr) {
    logServerError("myself-both-copy.agency.read", agencyErr);
    return out;
  }

  const settings = asSettings((agencyRow as { settings?: unknown } | null)?.settings);
  const appointments = normalizeTenantAppointmentsSettings(settings.appointments);
  const plan = planMyselfBothCopy({
    workspaceTenantId: input.workspaceTenantId,
    offerings: (offeringRows ?? []) as OfferingRehomeRow[],
    hoursWeekly: (hoursRow as { weekly?: unknown } | null)?.weekly ?? null,
    hoursTenantId:
      typeof (hoursRow as { tenant_id?: unknown } | null)?.tenant_id === "string"
        ? ((hoursRow as { tenant_id: string }).tenant_id)
        : null,
    workspaceOpeningHours: settings.opening_hours ?? null,
    appointmentsEnabled: appointments.enabled,
  });

  if (plan.offeringIds.length) {
    const { error: moveErr } = await admin
      .from("talent_offerings")
      .update({ tenant_id: input.workspaceTenantId, updated_at: new Date().toISOString() })
      .in("id", plan.offeringIds)
      .eq("talent_profile_id", input.talentProfileId);
    if (moveErr) logServerError("myself-both-copy.offerings.move", moveErr);
    else out.offeringsMoved = plan.offeringIds.length;
  }

  if (plan.rehomeHoursTenant && hoursRow) {
    const { error: hrErr } = await admin
      .from("talent_booking_hours")
      .update({ tenant_id: input.workspaceTenantId })
      .eq("talent_profile_id", input.talentProfileId);
    if (hrErr) logServerError("myself-both-copy.hours.rehome", hrErr);
    else out.hoursTenantRehomed = true;
  }

  let nextSettings = settings;
  let settingsDirty = false;
  const weekly = (hoursRow as { weekly?: unknown } | null)?.weekly ?? null;
  const tzRaw = (hoursRow as { timezone?: unknown } | null)?.timezone;
  const tz = typeof tzRaw === "string" && isValidIanaTimeZone(tzRaw) ? tzRaw : null;

  if (plan.writeOpeningHours && weekly) {
    nextSettings = { ...nextSettings, opening_hours: weekly };
    settingsDirty = true;
    out.openingHoursWritten = true;
  }

  if (plan.enableAppointments) {
    const nextAppt = {
      ...appointments,
      enabled: true,
      terminology: appointments.enabled ? appointments.terminology : ("appointments" as const),
      timezone: tz ?? appointments.timezone,
      presetId: appointments.presetId ?? "salon",
    };
    nextSettings = { ...nextSettings, appointments: nextAppt };
    settingsDirty = true;
    out.appointmentsEnabled = true;
  }

  if (settingsDirty) {
    const { error: setErr } = await admin
      .from("agencies")
      .update({ settings: nextSettings })
      .eq("id", input.workspaceTenantId);
    if (setErr) {
      logServerError("myself-both-copy.settings.write", setErr);
      out.openingHoursWritten = false;
      out.appointmentsEnabled = false;
    }
  }

  if (weekly) {
    try {
      out.homepageHoursPatched = await patchHomepageHours(admin, input.workspaceTenantId, weekly);
    } catch (err) {
      logServerError("myself-both-copy.homepage.patch", err);
    }
  }

  return out;
}
