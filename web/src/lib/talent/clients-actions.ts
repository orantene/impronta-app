"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

export type TalentClientRow = {
  id: string;
  name: string;
  lastVisit: string | null;
  visitCount: number;
  amountOwedCents: number | null;
  currency: string | null;
  conversationHref: string | null;
  source: "inquiry" | "booking";
};

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

function upsertClient(
  byKey: Map<string, TalentClientRow>,
  row: TalentClientRow,
): void {
  const key = row.name.toLowerCase();
  const existing = byKey.get(key);
  if (!existing) {
    byKey.set(key, row);
    return;
  }
  existing.visitCount += row.visitCount;
  if (row.lastVisit && (!existing.lastVisit || row.lastVisit > existing.lastVisit)) {
    existing.lastVisit = row.lastVisit;
  }
  if (!existing.conversationHref && row.conversationHref) {
    existing.conversationHref = row.conversationHref;
  }
  if (existing.amountOwedCents == null && row.amountOwedCents != null) {
    existing.amountOwedCents = row.amountOwedCents;
    existing.currency = row.currency;
  }
  // Prefer booking provenance when we later learn of a real visit.
  if (existing.source === "inquiry" && row.source === "booking") {
    existing.source = "booking";
  }
}

/**
 * Clients list for the talent studio.
 * `talent_bookings` columns are `client_label` / no money fields (see
 * `talent_calendar_v1`). Commercial money lives on `agency_bookings` via
 * `booking_talent`. Wrong column names previously hard-failed the whole page.
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
      upsertClient(byKey, {
        id: `booking:${row.id}`,
        name,
        lastVisit: start,
        visitCount: 1,
        amountOwedCents: null,
        currency: null,
        conversationHref: row.inquiry_id ? `/talent/inbox/${row.inquiry_id}` : null,
        source: "booking",
      });
    }

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
      const total = Math.max(0, Number(booking.total_client_revenue) || 0);
      const deposit = Math.max(0, Number(booking.deposit_amount_cents) || 0);
      const charge = Math.max(0, Number(leg.client_charge_total) || 0);
      const basis = charge > 0 ? charge : total;
      let owed: number | null = null;
      if (booking.payment_status === "paid") owed = 0;
      else if (booking.payment_status === "partial") owed = Math.max(0, basis - deposit);
      else if (basis > 0) owed = basis;
      const inquiryId = booking.source_inquiry_id as string | null;
      upsertClient(byKey, {
        id: `agency:${booking.id}`,
        name,
        lastVisit: start,
        visitCount: 1,
        amountOwedCents: owed,
        currency: (booking.currency_code as string | null) ?? null,
        conversationHref: inquiryId ? `/talent/inbox/${inquiryId}` : null,
        source: "booking",
      });
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
      upsertClient(byKey, {
        id: `inquiry:${inquiry.id}`,
        name,
        lastVisit: created,
        visitCount: 0,
        amountOwedCents: null,
        currency: null,
        conversationHref: `/talent/inbox/${inquiry.id}`,
        source: "inquiry",
      });
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
