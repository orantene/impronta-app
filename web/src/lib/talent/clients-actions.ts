"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import {
  upsertClient,
  type TalentClientRow,
} from "@/lib/talent/clients-merge";

// Do NOT `export type { TalentClientRow }` — a type re-export without `from`
// in a "use server" file makes Next's SWC emit a runtime reference
// ("TalentClientRow is not defined") and RSC 500s admin boot. Consumers
// import the type from clients-merge.

async function assertTalentOwner(talentProfileId: string): Promise<boolean> {
  const session = await getCachedActorSession();
  if (!session.user) return false;
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) return false;
  return data?.user_id === session.user.id;
}

/**
 * Clients list for the talent studio.
 * `talent_bookings` columns are `client_label` / no money fields (see
 * `talent_calendar_v1`). Commercial money lives on `agency_bookings` via
 * `booking_talent`. Wrong column names previously hard-failed the whole page.
 *
 * Load order: agency (money + visits) → talent calendar (gap-fill) → inquiries.
 * Merge key is inquiry id or bare booking uuid — never lower-cased name (A5).
 */
export async function loadTalentClients(
  talentProfileId: string,
): Promise<{ ok: true; items: TalentClientRow[] } | { ok: false; error: string }> {
  try {
    if (!(await assertTalentOwner(talentProfileId))) {
      return { ok: false, error: "Forbidden." };
    }
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const byKey = new Map<string, TalentClientRow>();

    // Agenda / commercial bookings (agency_bookings) linked through booking_talent.
    const { data: legs, error: legsError } = await admin
      .from("booking_talent")
      .select(
        "booking_id, client_charge_total, agency_bookings!inner ( id, contact_name, starts_at, ends_at, currency_code, payment_status, total_client_revenue, deposit_amount_cents, source_inquiry_id, status )",
      )
      .eq("talent_profile_id", talentProfileId)
      .limit(200);
    if (legsError) {
      logServerError("talent.clients.agencyBookings", legsError);
      return { ok: false, error: "Could not load clients." };
    }

    for (const leg of legs ?? []) {
      const booking = Array.isArray(leg.agency_bookings)
        ? leg.agency_bookings[0]
        : leg.agency_bookings;
      if (!booking) continue;
      if (booking.status === "cancelled") continue;
      const name = (booking.contact_name as string | null)?.trim() || "Client";
      const start = (booking.starts_at as string | null) ?? null;
      // total_client_revenue / client_charge_total are major units; deposit is cents.
      const totalCents = Math.max(
        0,
        Math.round(Number(booking.total_client_revenue) * 100) || 0,
      );
      const deposit = Math.max(0, Number(booking.deposit_amount_cents) || 0);
      const chargeCents = Math.max(
        0,
        Math.round(Number(leg.client_charge_total) * 100) || 0,
      );
      const basis = chargeCents > 0 ? chargeCents : totalCents;
      let owed: number | null = null;
      if (booking.payment_status === "paid") owed = 0;
      else if (booking.payment_status === "partial") owed = Math.max(0, basis - deposit);
      else if (basis > 0) owed = basis;
      const inquiryId = booking.source_inquiry_id as string | null;
      upsertClient(
        byKey,
        {
          id: `agency:${booking.id}`,
          name,
          lastVisit: start,
          visitCount: 1,
          amountOwedCents: owed,
          currency: (booking.currency_code as string | null) ?? null,
          conversationHref: inquiryId ? `/talent/inbox/${inquiryId}` : null,
          source: "booking",
        },
        { inquiryId, accumulateVisit: true },
      );
    }

    const { data: bookings, error: bookingsError } = await admin
      .from("talent_bookings")
      .select("id, client_label, title, starts_at, inquiry_id, status")
      .eq("talent_profile_id", talentProfileId)
      .order("starts_at", { ascending: false })
      .limit(200);
    if (bookingsError) {
      logServerError("talent.clients.bookings", bookingsError);
      return { ok: false, error: "Could not load clients." };
    }

    for (const row of bookings ?? []) {
      const name =
        (row.client_label as string | null)?.trim() ||
        (row.title as string | null)?.trim() ||
        "Client";
      const start = (row.starts_at as string | null) ?? null;
      const inquiryId = (row.inquiry_id as string | null) ?? null;
      // Do not accumulate visits — agency already counted commercial appointments;
      // shared-PK mirrors would otherwise double every create-slot booking.
      upsertClient(
        byKey,
        {
          id: `booking:${row.id}`,
          name,
          lastVisit: start,
          visitCount: 1,
          amountOwedCents: null,
          currency: null,
          conversationHref: inquiryId ? `/talent/inbox/${inquiryId}` : null,
          source: "booking",
        },
        { inquiryId, accumulateVisit: false },
      );
    }

    const { data: participants, error: participantsError } = await admin
      .from("inquiry_participants")
      .select("inquiry_id, inquiries!inner ( id, contact_name, company, created_at, status )")
      .eq("talent_profile_id", talentProfileId)
      .eq("role", "talent")
      .neq("status", "removed")
      .limit(200);
    if (participantsError) {
      logServerError("talent.clients.participants", participantsError);
      return { ok: false, error: "Could not load clients." };
    }

    for (const part of participants ?? []) {
      const inquiry = Array.isArray(part.inquiries) ? part.inquiries[0] : part.inquiries;
      if (!inquiry) continue;
      const name =
        (inquiry.contact_name as string | null)?.trim() ||
        (inquiry.company as string | null)?.trim() ||
        "Client";
      const created = (inquiry.created_at as string | null) ?? null;
      upsertClient(
        byKey,
        {
          id: `inquiry:${inquiry.id}`,
          name,
          lastVisit: created,
          visitCount: 0,
          amountOwedCents: null,
          currency: null,
          conversationHref: `/talent/inbox/${inquiry.id}`,
          source: "inquiry",
        },
        { inquiryId: inquiry.id as string, accumulateVisit: false },
      );
    }

    const items = Array.from(byKey.values()).sort((a, b) => {
      const left = a.lastVisit ?? "";
      const right = b.lastVisit ?? "";
      return right.localeCompare(left);
    });
    return { ok: true, items };
  } catch (err) {
    logServerError("talent.clients.load", err);
    return { ok: false, error: "Could not load clients." };
  }
}
