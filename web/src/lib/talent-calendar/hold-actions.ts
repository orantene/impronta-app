"use server";

/**
 * Workspace-staff calendar write actions — talent holds.
 *
 * Holds are the soft/firm date locks an agency places on a talent while
 * an inquiry is being negotiated (per the binding inquiry-flow spec).
 * They sit alongside the talent-authored `talent_availability_blocks`
 * (in `./actions.ts`) but are written by workspace staff, not the
 * talent.
 *
 * Schema: `talent_holds` (migration 20260513081325). RLS already gates
 * `is_staff_of_tenant(tenant_id)` for read + write.
 *
 * B1 from the inquiry-booking improvement plan
 * (`web/docs/inquiry-booking-improvement-plan-2026-05-12.md`).
 */

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import type { ServerActionResult } from "@/lib/server-actions/result";
import { revalidatePath } from "next/cache";

export type HoldStrength = "soft" | "firm";

export interface PlaceHoldInput {
  tenantSlug: string;
  talentProfileId: string;
  /** Optional — when set, the hold is linked to this inquiry and
   *  released when the inquiry converts/closes. */
  inquiryId?: string | null;
  title: string;
  clientLabel?: string | null;
  startsAt: string; // ISO
  endsAt: string;   // ISO
  allDay?: boolean;
  holdStrength?: HoldStrength;
  /** ISO timestamp at which the hold auto-releases. Defaults to 14 days
   *  for soft holds, 30 days for firm. NULL = no expiry. */
  expiresAt?: string | null;
}

export interface TalentHoldRow {
  id: string;
  talentProfileId: string;
  tenantId: string;
  inquiryId: string | null;
  title: string;
  clientLabel: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  holdStrength: HoldStrength;
  expiresAt: string | null;
  createdAt: string;
}

const DEFAULT_EXPIRY_DAYS: Record<HoldStrength, number> = {
  soft: 14,
  firm: 30,
};

function defaultExpiry(strength: HoldStrength): string {
  const days = DEFAULT_EXPIRY_DAYS[strength];
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Place a hold on a talent's calendar. Staff-only. Conflict-checks
 * against existing overlapping holds + firm bookings; soft holds may
 * stack but firm holds reject if there's already a firm hold or a
 * confirmed booking in the window.
 */
export async function placeTalentHold(
  input: PlaceHoldInput,
): Promise<ServerActionResult<{ holdId: string }>> {
  try {
    if (!input.talentProfileId) return { ok: false, error: "Missing talent." };
    if (!input.title.trim()) return { ok: false, error: "Hold title required." };
    if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
      return { ok: false, error: "End must be after start." };
    }

    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, user, tenantId, tenantSlug } = auth;

    // Verify the slug in the input matches the caller's resolved tenant.
    // (Defensive — `requireStaffTenantAction` already resolved by host;
    // this just catches a confused caller.)
    if (input.tenantSlug && input.tenantSlug !== tenantSlug) {
      return { ok: false, error: "Tenant slug mismatch." };
    }

    const strength: HoldStrength = input.holdStrength ?? "soft";
    const expiresAt = input.expiresAt === null
      ? null
      : (input.expiresAt ?? defaultExpiry(strength));

    // Conflict check — only firm holds reject; soft holds stack.
    if (strength === "firm") {
      const { data: conflicts, error: conflictErr } = await supabase
        .from("talent_holds")
        .select("id, hold_strength")
        .eq("talent_profile_id", input.talentProfileId)
        .eq("hold_strength", "firm")
        .lt("starts_at", input.endsAt)
        .gt("ends_at", input.startsAt)
        .limit(1);
      if (conflictErr) {
        logServerError("hold-actions/conflict_check", conflictErr);
        return { ok: false, error: conflictErr.message };
      }
      if (conflicts && conflicts.length > 0) {
        return {
          ok: false,
          error: "Talent already has a firm hold in this window. Release it first or use a soft hold.",
          reason: "conflict",
        };
      }
    }

    // Insert the hold.
    const { data: created, error: insErr } = await supabase
      .from("talent_holds")
      .insert({
        talent_profile_id: input.talentProfileId,
        tenant_id: tenantId,
        inquiry_id: input.inquiryId ?? null,
        title: input.title.trim(),
        client_label: input.clientLabel?.trim() || null,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        all_day: input.allDay ?? false,
        hold_strength: strength,
        expires_at: expiresAt,
        created_by_user_id: user.id,
      })
      .select("id")
      .single();

    if (insErr || !created) {
      logServerError("hold-actions/insert", insErr);
      return { ok: false, error: insErr?.message ?? "Could not place hold." };
    }

    revalidatePath(`/${tenantSlug}`, "layout");
    return { ok: true, data: { holdId: created.id as string } };
  } catch (err) {
    logServerError("hold-actions/place_unhandled", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Release (delete) a hold. Staff-only via RLS. */
export async function releaseTalentHold(
  holdId: string,
): Promise<ServerActionResult> {
  try {
    if (!holdId) return { ok: false, error: "Missing hold id." };
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const { supabase, tenantId, tenantSlug } = auth;

    const { error } = await supabase
      .from("talent_holds")
      .delete()
      .eq("id", holdId)
      .eq("tenant_id", tenantId);
    if (error) {
      logServerError("hold-actions/release", error);
      return { ok: false, error: error.message };
    }

    revalidatePath(`/${tenantSlug}`, "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("hold-actions/release_unhandled", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Read holds for a specific inquiry. Returns staff-visible holds only. */
export async function loadHoldsForInquiry(
  inquiryId: string,
): Promise<ServerActionResult<TalentHoldRow[]>> {
  try {
    if (!inquiryId) return { ok: false, error: "Missing inquiry id." };
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable." };

    const { data, error } = await supabase
      .from("talent_holds")
      .select(
        "id, talent_profile_id, tenant_id, inquiry_id, title, client_label, starts_at, ends_at, all_day, hold_strength, expires_at, created_at",
      )
      .eq("inquiry_id", inquiryId)
      .order("starts_at", { ascending: true });
    if (error) {
      logServerError("hold-actions/load_for_inquiry", error);
      return { ok: false, error: error.message };
    }

    type Row = {
      id: string;
      talent_profile_id: string;
      tenant_id: string;
      inquiry_id: string | null;
      title: string;
      client_label: string | null;
      starts_at: string;
      ends_at: string;
      all_day: boolean;
      hold_strength: HoldStrength;
      expires_at: string | null;
      created_at: string;
    };
    const rows: TalentHoldRow[] = ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      talentProfileId: r.talent_profile_id,
      tenantId: r.tenant_id,
      inquiryId: r.inquiry_id,
      title: r.title,
      clientLabel: r.client_label,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      allDay: r.all_day,
      holdStrength: r.hold_strength,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    }));
    return { ok: true, data: rows };
  } catch (err) {
    logServerError("hold-actions/load_for_inquiry_unhandled", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Check if a talent has any conflicting hold/booking in a given window.
 *  Used by the offer builder to warn before drafting an offer with
 *  conflicting dates. */
export async function checkTalentAvailability(
  talentProfileId: string,
  startsAt: string,
  endsAt: string,
): Promise<ServerActionResult<{
  hasFirmHold: boolean;
  hasSoftHold: boolean;
  hasBlock: boolean;
}>> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Service unavailable." };

    const [holdsRes, blocksRes] = await Promise.all([
      supabase
        .from("talent_holds")
        .select("hold_strength")
        .eq("talent_profile_id", talentProfileId)
        .lt("starts_at", endsAt)
        .gt("ends_at", startsAt),
      supabase
        .from("talent_availability_blocks")
        .select("id")
        .eq("talent_profile_id", talentProfileId)
        .lt("starts_at", endsAt)
        .gt("ends_at", startsAt)
        .limit(1),
    ]);

    if (holdsRes.error) {
      logServerError("hold-actions/check_holds", holdsRes.error);
      return { ok: false, error: holdsRes.error.message };
    }
    if (blocksRes.error) {
      logServerError("hold-actions/check_blocks", blocksRes.error);
      return { ok: false, error: blocksRes.error.message };
    }

    const holds = (holdsRes.data ?? []) as Array<{ hold_strength: HoldStrength }>;
    return {
      ok: true,
      data: {
        hasFirmHold: holds.some((h) => h.hold_strength === "firm"),
        hasSoftHold: holds.some((h) => h.hold_strength === "soft"),
        hasBlock: (blocksRes.data?.length ?? 0) > 0,
      },
    };
  } catch (err) {
    logServerError("hold-actions/check_availability_unhandled", err);
    return { ok: false, error: "Unexpected error." };
  }
}
