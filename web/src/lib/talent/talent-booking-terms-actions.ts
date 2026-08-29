"use server";

/**
 * Talent commercial booking-terms — focused load / save actions (Wave 5).
 *
 * CONFIGURATION ONLY. Reads and writes `talent_profiles.booking_terms` jsonb
 * (TalentBookingTerms). Does NOT charge a card, create a Stripe object, or
 * alter any offer/booking money math — these are the talent's *preferences*
 * that inform offers and display on their page; the binding per-offer terms
 * are set in the booking flow later.
 *
 * Authorization: a write/read is allowed when the caller is EITHER
 *   (a) the talent themselves (talent_profiles.user_id === session user), OR
 *   (b) agency staff (requireStaff) editing on the talent's behalf.
 * This lets the same actions back both the talent-self Settings card and the
 * admin profile-editor drawer.
 *
 * NOTE (repo gotcha): the generated database.types.ts is NOT regenerated this
 * wave, so the new `booking_terms` column is unknown to the typed client. Reads
 * use `.returns<T>()` to assert the row shape; writes cast the patch to the
 * row-update shape so the build does not widen to GenericStringError.
 *
 * A "use server" module may export ONLY async functions — shared types live in
 * @/lib/billing/commercial-terms-types.
 */

import { revalidatePath } from "next/cache";
import type { RefundPolicyKey, TalentBookingTerms } from "@/lib/billing/commercial-terms-types";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isStaffRole } from "@/lib/auth-flow";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

const REFUND_POLICY_KEYS: readonly RefundPolicyKey[] = [
  "tiered",
  "flexible",
  "strict",
  "manual",
];

const EMPTY_TERMS: TalentBookingTerms = {
  depositPct: null,
  refundPolicy: null,
  instantBookOptIn: false,
  fixedRateCents: null,
  directBookingOptIn: false,
};

/** Coerce an arbitrary stored jsonb value into a safe TalentBookingTerms. */
function normalizeBookingTerms(raw: unknown): TalentBookingTerms {
  if (!raw || typeof raw !== "object") return { ...EMPTY_TERMS };
  const o = raw as Record<string, unknown>;

  const depositPct =
    typeof o.depositPct === "number" && Number.isFinite(o.depositPct)
      ? Math.min(100, Math.max(0, Math.round(o.depositPct)))
      : null;

  const refundPolicy =
    typeof o.refundPolicy === "string" &&
    (REFUND_POLICY_KEYS as readonly string[]).includes(o.refundPolicy)
      ? (o.refundPolicy as RefundPolicyKey)
      : null;

  const fixedRateCents =
    typeof o.fixedRateCents === "number" && Number.isFinite(o.fixedRateCents) && o.fixedRateCents >= 0
      ? Math.round(o.fixedRateCents)
      : null;

  return {
    depositPct,
    refundPolicy,
    instantBookOptIn: o.instantBookOptIn === true,
    fixedRateCents,
    directBookingOptIn: o.directBookingOptIn === true,
  };
}

/** Validate an inbound (client-supplied) terms object before persisting. */
function sanitizeInboundTerms(input: TalentBookingTerms): TalentBookingTerms {
  return normalizeBookingTerms(input);
}

type AuthResult =
  | { ok: true; supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>; userId: string; isStaff: boolean }
  | { ok: false; error: string };

/**
 * Resolve the caller and confirm they may touch this talent's booking terms.
 * Owner (user_id match) OR staff. Returns an RLS-bound client for reads.
 */
async function authorizeForTalent(talentProfileId: string): Promise<AuthResult> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { data: tp, error } = await supabase
    .from("talent_profiles")
    .select("id, user_id")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (error || !tp) {
    if (error) logServerError("talent.bookingTerms.authorize", error);
    return { ok: false, error: "Profile not found." };
  }

  const isStaff = !!session.profile && isStaffRole(session.profile.app_role);
  const isOwner = tp.user_id === session.user.id;
  if (!isOwner && !isStaff) return { ok: false, error: "Forbidden." };

  return { ok: true, supabase, userId: session.user.id, isStaff };
}

type LoadTalentBookingTermsResult =
  | { ok: true; terms: TalentBookingTerms }
  | { ok: false; error: string };

/** Load the talent's stored booking-terms preferences (normalized). */
export async function loadTalentBookingTerms(
  talentProfileId: string,
): Promise<LoadTalentBookingTermsResult> {
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };

    // `.returns<T>()` asserts the row shape — `booking_terms` is unknown to the
    // generated types this wave (see module header).
    const { data, error } = await auth.supabase
      .from("talent_profiles")
      .select("booking_terms")
      .eq("id", talentProfileId)
      .returns<{ booking_terms: unknown }[]>()
      .maybeSingle();

    if (error) {
      logServerError("talent.bookingTerms.load", error);
      return { ok: false, error: "Could not load booking terms." };
    }

    return { ok: true, terms: normalizeBookingTerms(data?.booking_terms) };
  } catch (err) {
    logServerError("talent.bookingTerms.load", err);
    return { ok: false, error: "Unexpected error." };
  }
}

type UpdateTalentBookingTermsResult =
  | { ok: true; terms: TalentBookingTerms }
  | { ok: false; error: string };

/**
 * Persist the talent's booking-terms preferences. Uses the service-role client
 * for the write (the talent may lack RLS update access to every column; staff
 * writes on behalf are already gated above).
 */
export async function updateTalentBookingTerms(
  talentProfileId: string,
  terms: TalentBookingTerms,
): Promise<UpdateTalentBookingTermsResult> {
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };

    const clean = sanitizeInboundTerms(terms);

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    // `booking_terms` is unknown to the generated update type this wave — cast
    // the patch so it doesn't widen to GenericStringError.
    const patch = {
      booking_terms: clean,
      updated_at: new Date().toISOString(),
    } as unknown as Record<string, never>;

    const { error } = await admin
      .from("talent_profiles")
      .update(patch)
      .eq("id", talentProfileId);

    if (error) {
      logServerError("talent.bookingTerms.update", error);
      return { ok: false, error: "Failed to save booking terms." };
    }

    revalidatePath("/talent/settings");
    revalidatePath(`/admin/talent/${talentProfileId}`);
    return { ok: true, terms: clean };
  } catch (err) {
    logServerError("talent.bookingTerms.update", err);
    return { ok: false, error: "Unexpected error." };
  }
}
