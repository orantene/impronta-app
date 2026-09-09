"use server";

/* eslint-disable ratchet/no-untenanted-from -- talent_profiles is a global identity table with no tenant_id; hours/roster writes that do have tenant_id go through tenantScopedQuery below. Owner-gated by authorizeHours. */

/**
 * Load / upsert talent_booking_hours and the talent-half opt-in
 * (booking_terms.directBookingOptIn). Owner or workspace staff.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { isStaffRole } from "@/lib/auth-flow";
import {
  parseBookingHours,
  parseHoursExceptions,
  parseWeeklyHours,
  type BookingHours,
  type WeeklyHours,
} from "@/lib/scheduling/hours-types";
import { tenantTimezone } from "@/lib/spaces/venues";
import { isValidIanaTimeZone } from "@/lib/scheduling/tz";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { actorMayWriteHours } from "@/lib/scheduling/hours-edit-policy";

const weeklySchema = z.record(
  z.string(),
  z.array(
    z.object({
      startMin: z.number().int().min(0).max(1439),
      endMin: z.number().int().min(1).max(1440),
    }),
  ),
);

const hoursPayloadSchema = z
  .object({
    timezone: z.string().min(1).max(80),
    weekly: weeklySchema,
    exceptions: z.array(z.unknown()).optional(),
    slotMinutes: z.number().int().min(1).max(480),
    bufferBeforeMin: z.number().int().min(0).max(240),
    bufferAfterMin: z.number().int().min(0).max(240),
    minNoticeMin: z.number().int().min(0).max(60 * 24 * 30),
    horizonDays: z.number().int().min(1).max(365),
  })
  .strict();

type HoursAuth =
  | {
      ok: true;
      userId: string;
      isOwner: boolean;
      isStaff: boolean;
      staffTenantId: string | null;
      canEditHours: boolean;
    }
  | { ok: false; error: string };

async function authorizeHours(talentProfileId: string): Promise<HoursAuth> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { data: tp, error } = await supabase
    .from("talent_profiles")
    .select("id, user_id, profile_kind")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (error || !tp) {
    if (error) logServerError("booking-hours.authorize", error);
    return { ok: false, error: "Profile not found." };
  }

  const isOwner = tp.user_id === session.user.id;
  const staff = await requireWorkspaceStaffAction();
  const isStaff = staff.ok || (!!session.profile && isStaffRole(session.profile.app_role));
  if (!isOwner && !staff.ok && !isStaff) return { ok: false, error: "Forbidden." };

  return {
    ok: true,
    userId: session.user.id,
    isOwner,
    isStaff: staff.ok,
    staffTenantId: staff.ok ? staff.tenantId : null,
    canEditHours: actorMayWriteHours(
      { isOwner, isStaff: staff.ok },
      {
        profileKind: typeof tp.profile_kind === "string" ? tp.profile_kind : "person",
        userId: typeof tp.user_id === "string" ? tp.user_id : null,
      },
    ),
  };
}

async function resolveHoursTenantId(
  talentProfileId: string,
  staffTenantId: string | null,
): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return staffTenantId;

  const { data: existing } = await admin
    .from("talent_booking_hours")
    .select("tenant_id")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (typeof existing?.tenant_id === "string" && existing.tenant_id) {
    return existing.tenant_id;
  }
  if (staffTenantId) return staffTenantId;

  const { data: tp } = await admin
    .from("talent_profiles")
    .select("created_by_agency_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (typeof tp?.created_by_agency_id === "string" && tp.created_by_agency_id) {
    return tp.created_by_agency_id;
  }

  const { data: roster } = await admin
    .from("agency_talent_roster")
    .select("tenant_id")
    .eq("talent_profile_id", talentProfileId)
    .in("status", ["active", "pending"])
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();
  return typeof roster?.tenant_id === "string" ? roster.tenant_id : null;
}

export type HoursTarget = {
  id: string;
  name: string;
  kind: "person" | "resource";
};

type ListTargetsResult =
  | { ok: true; targets: HoursTarget[] }
  | { ok: false; error: string };

export async function listBookingHoursTargets(): Promise<ListTargetsResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const [{ data: roster }, { data: resources }] = await Promise.all([
    tenantScopedQuery(admin, "agency_talent_roster", auth.tenantId)
      .select("talent_profile_id, talent_profiles(id, display_name, first_name, profile_kind)")
      .in("status", ["active", "pending"]),
    admin
      .from("talent_profiles")
      .select("id, display_name, first_name, profile_kind")
      .eq("created_by_agency_id", auth.tenantId)
      .eq("profile_kind", "resource")
      .is("deleted_at", null),
  ]);

  const targets: HoursTarget[] = [];
  const seen = new Set<string>();
  const push = (id: string, name: string, kind: "person" | "resource") => {
    if (seen.has(id)) return;
    seen.add(id);
    targets.push({ id, name, kind });
  };

  for (const raw of roster ?? []) {
    const row = raw as {
      talent_profiles?:
        | { id?: string; display_name?: string | null; first_name?: string | null; profile_kind?: string | null }
        | { id?: string; display_name?: string | null; first_name?: string | null; profile_kind?: string | null }[]
        | null;
    };
    const tp = Array.isArray(row.talent_profiles)
      ? row.talent_profiles[0]
      : row.talent_profiles;
    if (!tp || typeof tp !== "object") continue;
    const rec = tp as { id?: string; display_name?: string | null; first_name?: string | null; profile_kind?: string | null };
    if (!rec.id) continue;
    push(
      rec.id,
      rec.display_name || rec.first_name || "Untitled",
      rec.profile_kind === "resource" ? "resource" : "person",
    );
  }
  for (const rec of resources ?? []) {
    push(
      rec.id,
      rec.display_name || rec.first_name || "Untitled",
      "resource",
    );
  }
  targets.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, targets };
}

/** A proposal awaiting review. Timezone is nullable — never guessed as UTC. */
export type BookingHoursProposal = {
  timezone: string | null;
  weekly: WeeklyHours;
  slotMinutes: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  horizonDays: number;
  source: string;
  proposedAt: string | null;
};

function parseProposalRow(raw: unknown): BookingHoursProposal | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const weekly = parseWeeklyHours(row.weekly) ?? { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  return {
    timezone: typeof row.timezone === "string" && row.timezone.trim() ? row.timezone.trim() : null,
    weekly,
    slotMinutes: typeof row.slot_minutes === "number" ? row.slot_minutes : 30,
    bufferBeforeMin: typeof row.buffer_before_min === "number" ? row.buffer_before_min : 0,
    bufferAfterMin: typeof row.buffer_after_min === "number" ? row.buffer_after_min : 0,
    minNoticeMin: typeof row.min_notice_min === "number" ? row.min_notice_min : 120,
    horizonDays: typeof row.horizon_days === "number" ? row.horizon_days : 60,
    source: typeof row.source === "string" ? row.source : "publish_default",
    proposedAt: typeof row.proposed_at === "string" ? row.proposed_at : null,
  };
}

type LoadHoursResult =
  | {
      ok: true;
      hours: BookingHours | null;
      /** A proposal awaiting review, when there is one and no hours exist yet. */
      proposal: BookingHoursProposal | null;
      /** The workspace's zone, for an editor opening on a person with no hours yet. */
      defaultTimezone: string;
      directBookingOptIn: boolean;
      canEditHours: boolean;
    }
  | { ok: false; error: string };

export async function loadBookingHours(talentProfileId: string): Promise<LoadHoursResult> {
  const auth = await authorizeHours(talentProfileId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const [
    { data: hoursRow, error: hoursErr },
    { data: tp, error: tpErr },
    { data: proposalRow, error: proposalErr },
  ] = await Promise.all([
    admin
      .from("talent_booking_hours")
      .select(
        "timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days",
      )
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle(),
    admin
      .from("talent_profiles")
      .select("booking_terms")
      .eq("id", talentProfileId)
      .maybeSingle(),
    admin
      .from("talent_booking_hours_proposals")
      .select("timezone, weekly, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days, source, proposed_at")
      .eq("talent_profile_id", talentProfileId)
      .eq("status", "proposed")
      .maybeSingle(),
  ]);

  if (hoursErr) {
    logServerError("booking-hours.load", hoursErr);
    return { ok: false, error: "Could not load hours." };
  }
  if (tpErr) {
    logServerError("booking-hours.loadTerms", tpErr);
    return { ok: false, error: "Could not load hours." };
  }
  if (proposalErr) {
    logServerError("booking-hours.loadProposal", proposalErr);
    return { ok: false, error: "Could not load hours." };
  }

  const terms =
    typeof tp?.booking_terms === "object" && tp.booking_terms !== null
      ? (tp.booking_terms as Record<string, unknown>)
      : {};

  // What the editor should start on when this person has no hours row yet.
  // It used to start on "UTC", so the first thing a Tulum barber saw was the
  // wrong timezone already filled in, and saving it made the wrong answer real.
  const hoursTenantId = await resolveHoursTenantId(talentProfileId, auth.staffTenantId);
  const defaultTimezone = hoursTenantId ? await tenantTimezone(hoursTenantId) : "UTC";

  return {
    ok: true,
    hours: parseBookingHours(hoursRow),
    // A proposal only matters while there is no real calendar yet: once
    // hours exist the proposal (accepted or otherwise stale) has nothing
    // left to offer the editor.
    proposal: hoursRow ? null : parseProposalRow(proposalRow),
    defaultTimezone,
    directBookingOptIn: terms.directBookingOptIn === true,
    canEditHours: auth.canEditHours,
  };
}

type AcceptProposalResult = { ok: true; hours: BookingHours } | { ok: false; error: string };

/**
 * Accept the pending proposal for this talent with the operator's own
 * timezone. Gated by the same hours-edit policy as saveBookingHours — the
 * proposal is not a second, weaker write path.
 */
export async function acceptBookingHoursProposal(
  talentProfileId: string,
  input: { timezone: string },
): Promise<AcceptProposalResult> {
  const auth = await authorizeHours(talentProfileId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!auth.canEditHours) {
    return { ok: false, error: "This person sets their own hours." };
  }

  const timezone = input.timezone.trim();
  if (!timezone) return { ok: false, error: "Pick a time zone." };
  if (!isValidIanaTimeZone(timezone)) return { ok: false, error: "Pick a valid time zone." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data, error } = await admin.rpc("accept_booking_hours_proposal", {
    p_talent_profile_id: talentProfileId,
    p_actor_id: auth.userId,
    p_overrides: { timezone },
  });
  if (error) {
    logServerError("booking-hours.acceptProposal", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const result = data as { ok?: boolean; reason?: string } | null;
  if (!result?.ok) {
    if (result?.reason === "hours_exist") {
      return { ok: false, error: "This person already has booking hours." };
    }
    if (result?.reason === "timezone_required" || result?.reason === "bad_input") {
      return { ok: false, error: "Pick a time zone." };
    }
    if (result?.reason === "not_found") {
      return { ok: false, error: "That proposal is no longer there." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const { data: hoursRow, error: hoursErr } = await admin
    .from("talent_booking_hours")
    .select(
      "timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days",
    )
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (hoursErr) {
    logServerError("booking-hours.acceptProposal/reload", hoursErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const hours = parseBookingHours(hoursRow);
  if (!hours) return { ok: false, error: CLIENT_ERROR.update };

  revalidatePath("/", "layout");
  return { ok: true, hours };
}

type SaveHoursResult = { ok: true; hours: BookingHours } | { ok: false; error: string };

export async function saveBookingHours(
  talentProfileId: string,
  payload: {
    timezone: string;
    weekly: WeeklyHours;
    slotMinutes: number;
    bufferBeforeMin: number;
    bufferAfterMin: number;
    minNoticeMin: number;
    horizonDays: number;
  },
): Promise<SaveHoursResult> {
  const auth = await authorizeHours(talentProfileId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!auth.canEditHours) {
    return { ok: false, error: "This person sets their own hours." };
  }

  const parsed = hoursPayloadSchema.safeParse({
    ...payload,
    exceptions: [],
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid hours." };
  }
  if (!isValidIanaTimeZone(parsed.data.timezone)) {
    return { ok: false, error: "Pick a valid time zone." };
  }
  const weekly = parseWeeklyHours(parsed.data.weekly);
  const exceptions = parseHoursExceptions([]);
  if (!weekly || !exceptions) return { ok: false, error: "Hours look incomplete." };

  const tenantId = await resolveHoursTenantId(talentProfileId, auth.staffTenantId);
  if (!tenantId) return { ok: false, error: "Could not resolve the workspace for these hours." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const row = {
    talent_profile_id: talentProfileId,
    tenant_id: tenantId,
    timezone: parsed.data.timezone,
    weekly: parsed.data.weekly,
    exceptions: [],
    slot_minutes: parsed.data.slotMinutes,
    buffer_before_min: parsed.data.bufferBeforeMin,
    buffer_after_min: parsed.data.bufferAfterMin,
    min_notice_min: parsed.data.minNoticeMin,
    horizon_days: parsed.data.horizonDays,
    updated_at: new Date().toISOString(),
  };

  const { error } = await tenantScopedQuery(admin, "talent_booking_hours", tenantId).upsert(row, {
    onConflict: "talent_profile_id",
  });
  if (error) {
    logServerError("booking-hours.save", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath("/", "layout");
  const hours = parseBookingHours(row);
  if (!hours) return { ok: false, error: CLIENT_ERROR.update };
  return { ok: true, hours };
}

type OptInResult = { ok: true; directBookingOptIn: boolean } | { ok: false; error: string };

export async function setTalentDirectBookingOptIn(
  talentProfileId: string,
  optIn: boolean,
): Promise<OptInResult> {
  const auth = await authorizeHours(talentProfileId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data: tp, error: readErr } = await admin
    .from("talent_profiles")
    .select("booking_terms")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (readErr) {
    logServerError("booking-hours.optIn.read", readErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const current =
    typeof tp?.booking_terms === "object" && tp.booking_terms !== null
      ? (tp.booking_terms as Record<string, unknown>)
      : {};
  const next = { ...current, directBookingOptIn: optIn === true };

  const { error } = await admin
    .from("talent_profiles")
    .update({ booking_terms: next, updated_at: new Date().toISOString() } as never)
    .eq("id", talentProfileId);
  if (error) {
    logServerError("booking-hours.optIn", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  return { ok: true, directBookingOptIn: optIn === true };
}
