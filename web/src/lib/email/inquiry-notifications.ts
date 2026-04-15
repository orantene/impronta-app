/**
 * Inquiry pipeline email notifications.
 *
 * Uses the service-role client to look up user emails (stored in auth.users).
 * All functions are fire-and-forget — they log errors but never throw so
 * email failure cannot block the primary server action.
 *
 * Requires: RESEND_API_KEY + SUPABASE_SERVICE_ROLE_KEY env vars.
 * If either is missing, all calls silently no-op.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import {
  bookingConfirmedEmail,
  offerSentEmail,
  talentInvitedEmail,
} from "@/lib/email/templates";
import { logServerError } from "@/lib/server/safe-error";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getUserEmail(userId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin.auth.admin.getUserById(userId);
  return data.user?.email?.trim().toLowerCase() ?? null;
}

// ─── 1. Offer sent → client ─────────────────────────────────────────────────

export async function sendOfferSentNotification({
  supabase,
  inquiryId,
}: {
  supabase: SupabaseClient;
  inquiryId: string;
}): Promise<void> {
  try {
    const { data: inq } = await supabase
      .from("inquiries")
      .select("contact_name, client_user_id, current_offer_id")
      .eq("id", inquiryId)
      .maybeSingle();

    if (!inq?.client_user_id) return;

    const [clientEmail, profileRes, offerRes] = await Promise.all([
      getUserEmail(inq.client_user_id as string),
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", inq.client_user_id)
        .maybeSingle(),
      inq.current_offer_id
        ? supabase
            .from("inquiry_offers")
            .select("total_client_price, currency_code")
            .eq("id", inq.current_offer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (!clientEmail) return;

    let totalAmount = "";
    if (offerRes.data) {
      const o = offerRes.data as { total_client_price: number; currency_code: string } | null;
      if (o) totalAmount = `${o.currency_code} ${Number(o.total_client_price).toFixed(2)}`;
    }

    const tmpl = offerSentEmail({
      clientName: profileRes.data?.display_name ?? null,
      inquiryId,
      contactName: (inq.contact_name as string | null) ?? null,
      totalAmount,
    });

    await sendEmail({ to: clientEmail, ...tmpl });
  } catch (err) {
    logServerError(
      "email/sendOfferSentNotification",
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

// ─── 2. Booking confirmed → client + each talent ────────────────────────────

export async function sendBookingConfirmedNotifications({
  supabase,
  inquiryId,
  bookingId,
}: {
  supabase: SupabaseClient;
  inquiryId: string;
  bookingId: string;
}): Promise<void> {
  try {
    const { data: inq } = await supabase
      .from("inquiries")
      .select("contact_name, event_location, event_date, client_user_id")
      .eq("id", inquiryId)
      .maybeSingle();

    if (!inq) return;

    // ── Client email ──
    if (inq.client_user_id) {
      const [clientEmail, profileRes] = await Promise.all([
        getUserEmail(inq.client_user_id as string),
        supabase
          .from("profiles")
          .select("display_name")
          .eq("id", inq.client_user_id)
          .maybeSingle(),
      ]);

      if (clientEmail) {
        const tmpl = bookingConfirmedEmail({
          recipientName: profileRes.data?.display_name ?? null,
          role: "client",
          bookingId,
          contactName: (inq.contact_name as string | null) ?? null,
          eventDate: (inq.event_date as string | null) ?? null,
          eventLocation: (inq.event_location as string | null) ?? null,
        });
        await sendEmail({ to: clientEmail, ...tmpl });
      }
    }

    // ── Talent emails ──
    const { data: participants } = await supabase
      .from("inquiry_participants")
      .select("talent_profile_id")
      .eq("inquiry_id", inquiryId)
      .eq("role", "talent")
      .eq("status", "active");

    if (!participants?.length) return;

    const talentProfileIds = participants
      .map((p) => p.talent_profile_id)
      .filter(Boolean) as string[];

    if (!talentProfileIds.length) return;

    const { data: talentProfiles } = await supabase
      .from("talent_profiles")
      .select("user_id, display_name")
      .in("id", talentProfileIds);

    if (!talentProfiles?.length) return;

    await Promise.all(
      talentProfiles.map(async (tp) => {
        if (!tp.user_id) return;
        const talentEmail = await getUserEmail(tp.user_id as string);
        if (!talentEmail) return;

        const tmpl = bookingConfirmedEmail({
          recipientName: (tp.display_name as string | null) ?? null,
          role: "talent",
          bookingId,
          contactName: (inq.contact_name as string | null) ?? null,
          eventDate: (inq.event_date as string | null) ?? null,
          eventLocation: (inq.event_location as string | null) ?? null,
        });
        await sendEmail({ to: talentEmail, ...tmpl });
      }),
    );
  } catch (err) {
    logServerError(
      "email/sendBookingConfirmedNotifications",
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}

// ─── 3. Talent invited (added to roster) ───────────────────────────────────

export async function sendTalentInvitedNotification({
  supabase,
  inquiryId,
  talentProfileId,
}: {
  supabase: SupabaseClient;
  inquiryId: string;
  talentProfileId: string;
}): Promise<void> {
  try {
    const [inqRes, tpRes] = await Promise.all([
      supabase
        .from("inquiries")
        .select("contact_name, event_location, event_date")
        .eq("id", inquiryId)
        .maybeSingle(),
      supabase
        .from("talent_profiles")
        .select("user_id, display_name")
        .eq("id", talentProfileId)
        .maybeSingle(),
    ]);

    if (!tpRes.data?.user_id) return;

    const talentEmail = await getUserEmail(tpRes.data.user_id as string);
    if (!talentEmail) return;

    const inq = inqRes.data;
    const tmpl = talentInvitedEmail({
      talentName: (tpRes.data.display_name as string | null) ?? null,
      talentEmail,
      inquiryId,
      contactName: (inq?.contact_name as string | null) ?? null,
      eventDate: (inq?.event_date as string | null) ?? null,
      eventLocation: (inq?.event_location as string | null) ?? null,
    });

    await sendEmail({ to: talentEmail, ...tmpl });
  } catch (err) {
    logServerError(
      "email/sendTalentInvitedNotification",
      err instanceof Error ? err : new Error(String(err)),
    );
  }
}
