"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadClientTrustState } from "@/lib/client-trust/evaluator";
import { mapToGuestTrustChipProps } from "@/lib/inquiry/guest-trust-chip-mapper";
import type { GuestTrustChipProps, TrustSignalState } from "@/lib/inquiry/guest-chat-contract";
import {
  listClientIntegrations,
  isClientIntegrationVerifiedTrustSignal,
} from "@/lib/client-integrations/repository";
import { getClientIntegrationDef } from "@/lib/client-integrations/catalog";

// ─── Guest / client trust chip (talent thread header) ────────────────────────

/** Serialisable trust-chip data for the talent thread header (no callbacks). */
export type TalentGuestTrustChipData = Omit<GuestTrustChipProps, "onBlock" | "onReport"> & {
  /**
   * Subject identity for the recipient-safety actions, resolved server-side
   * from the inquiry sender. `null` when neither a client user nor a guest
   * session is on the inquiry (block/report unavailable — older inquiry rows).
   */
  blockTarget:
    | { inquiryId: string; subjectType: "client_user" | "guest_session"; subjectId: string }
    | null;
};

/**
 * Load the talent-facing trust chip for an inquiry the signed-in talent
 * participates in. Mirrors loadTalentInquiryThread's authorization (the talent
 * must be an active/invited participant on the inquiry) and runs the reads via
 * the service-role client AFTER that gate, since client-trust + auth-email
 * signals aren't RLS-readable by a lineup talent.
 *
 * Returns null when the caller isn't a participant or on any error — the chip
 * simply doesn't render. Data is built with sensible defaults: when there is no
 * registered client (pure guest inquiry) the tier is null + identity collapses
 * to "guest"/"identified" off the captured contact fields.
 */
export async function loadTalentInquiryGuestTrust(
  inquiryId: string,
): Promise<TalentGuestTrustChipData | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createServiceRoleClient();
    const readClient = admin ?? supabase;

    const { data: inquiry } = await readClient
      .from("inquiries")
      .select("id, tenant_id, contact_name, contact_email, contact_phone, client_user_id, guest_session_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (!inquiry?.tenant_id) return null;
    const inq = inquiry as {
      tenant_id: string;
      contact_name: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      client_user_id: string | null;
      guest_session_id: string | null;
    };
    const tenantId = inq.tenant_id;

    // Authorize: the signed-in user's talent profile must be a participant on
    // this inquiry. Resolve by user_id (not the roster-scoped self profile) so a
    // platform talent with an inactive agency-roster row still passes.
    const { data: tp } = await readClient
      .from("talent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    const talentProfileId = (tp as { id: string } | null)?.id;
    if (!talentProfileId) return null;
    const { data: participant } = await readClient
      .from("inquiry_participants")
      .select("inquiry_id")
      .eq("inquiry_id", inquiryId)
      .eq("talent_profile_id", talentProfileId)
      .in("status", ["invited", "active"])
      .maybeSingle();
    if (!participant) return null;

    // ── Trust tier + payment verification — from client_trust_state.
    // verified_at being non-null means the client completed the $5 Stripe
    // payment verification (or an OAuth-sync wrote it). That is the payment
    // signal source — there is no separate "payment badge" table.
    let clientTrustLevel: GuestTrustChipProps["tier"] = null;
    let paymentSignalOverride: TrustSignalState = "absent";
    if (inq.client_user_id) {
      const state = await loadClientTrustState(inq.client_user_id, tenantId, readClient);
      clientTrustLevel = state?.trustLevel ?? null;
      paymentSignalOverride = state?.verifiedAt ? "verified" : "absent";
    }

    // ── Email verification — the client user's auth email_confirmed_at.
    let isEmailVerified = false;
    if (inq.client_user_id && admin) {
      try {
        const { data: authUser } = await admin.auth.admin.getUserById(inq.client_user_id);
        isEmailVerified = Boolean(authUser?.user?.email_confirmed_at);
      } catch (err) {
        logServerError("talent.trustChip.emailVerify", err);
      }
    }

    // ── Phone signal — client_profiles.phone.
    // There is no dedicated verified-phone flag in the schema; a stored phone
    // number means it was captured but we cannot assert it was verified via SMS.
    // We report present_unverified when a phone exists, absent otherwise.
    let phoneSignalOverride: TrustSignalState = "absent";
    if (inq.client_user_id) {
      try {
        const { data: clientProfile } = await readClient
          .from("client_profiles")
          .select("phone")
          .eq("user_id", inq.client_user_id)
          .maybeSingle();
        const phone = (clientProfile as { phone?: string | null } | null)?.phone;
        phoneSignalOverride = phone ? "present_unverified" : "absent";
      } catch (err) {
        logServerError("talent.trustChip.phone", err);
      }
    }
    // If no registered client but the inquiry captured a phone at submission
    // time, surface that as present_unverified too.
    if (inq.client_user_id === null && inq.contact_phone?.trim()) {
      phoneSignalOverride = "present_unverified";
    }

    // ── Social signal — client_integrations (OAuth-verified social accounts).
    // "verified"          = at least one social integration is OAuth-verified,
    //                       trust_signal_enabled, and talent_visible.
    // "present_unverified"= at least one social integration row exists in the
    //                       social category but none are fully verified.
    // "absent"            = no social integrations at all.
    let socialSignalOverride: TrustSignalState = "absent";
    if (inq.client_user_id) {
      try {
        const integrations = await listClientIntegrations(inq.client_user_id);
        let hasSocialRow = false;
        let hasVerifiedSocial = false;
        for (const row of integrations) {
          const def = getClientIntegrationDef(row.provider_key);
          if (def?.category !== "social") continue;
          hasSocialRow = true;
          if (isClientIntegrationVerifiedTrustSignal(row) && row.talent_visible) {
            hasVerifiedSocial = true;
            break;
          }
        }
        if (hasVerifiedSocial) {
          socialSignalOverride = "verified";
        } else if (hasSocialRow) {
          socialSignalOverride = "present_unverified";
        }
      } catch (err) {
        logServerError("talent.trustChip.social", err);
      }
    }

    // ── Completed bookings — confirmed/completed agency_bookings for the client.
    let completedBookings = 0;
    if (inq.client_user_id) {
      const { count } = await readClient
        .from("agency_bookings")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("client_user_id", inq.client_user_id)
        .in("status", ["confirmed", "completed"]);
      completedBookings = count ?? 0;
    }

    // ── Block state — has THIS talent (recipient) already blocked the sender?
    let isBlocked = false;
    {
      const orParts: string[] = [];
      if (inq.guest_session_id) orParts.push(`blocked_guest_session_id.eq.${inq.guest_session_id}`);
      if (inq.client_user_id) orParts.push(`blocked_client_user_id.eq.${inq.client_user_id}`);
      if (orParts.length > 0) {
        const { data: blockRow } = await readClient
          .from("user_blocks")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("blocker_user_id", user.id)
          .or(orParts.join(","))
          .limit(1)
          .maybeSingle();
        isBlocked = !!blockRow;
      }
    }

    const props = mapToGuestTrustChipProps({
      trustSummary: null,
      contactName: inq.contact_name?.trim() || "Guest",
      contactEmail: inq.contact_email?.trim() || null,
      contactPhone: inq.contact_phone?.trim() || null,
      clientTrustLevel,
      completedBookings,
      isEmailVerified,
      isBlocked,
      phoneSignalOverride,
      socialSignalOverride,
      paymentSignalOverride,
    });

    // Resolve the subject for block/report. Prefer the registered client user;
    // fall back to the guest session. Null when neither is present.
    const blockTarget = inq.client_user_id
      ? { inquiryId, subjectType: "client_user" as const, subjectId: inq.client_user_id }
      : inq.guest_session_id
        ? { inquiryId, subjectType: "guest_session" as const, subjectId: inq.guest_session_id }
        : null;

    const { onBlock: _onBlock, onReport: _onReport, ...serialisable } = props;
    void _onBlock;
    void _onReport;
    return { ...serialisable, blockTarget };
  } catch (err) {
    logServerError("talent.trustChip.load", err);
    return null;
  }
}
