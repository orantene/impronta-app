import { cache } from "react";
import { resolveDashboardIdentity } from "@/lib/impersonation/dashboard-identity";
import { subjectUserId } from "@/lib/impersonation/subject-user";
import { logServerError } from "@/lib/server/safe-error";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClientBookingListRow = {
  id: string;
  title: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  currency_code: string;
  starts_at: string | null;
  ends_at: string | null;
  event_date: string | null;
  venue_name: string | null;
  venue_location_text: string | null;
  client_summary: string | null;
  source_inquiry_id: string | null;
  updated_at: string;
};

export type ClientBookingLineRow = {
  talent_profile_id: string | null;
  talent_name_snapshot: string | null;
  profile_code_snapshot: string | null;
  role_label: string | null;
};

export type ClientBookingsLoadResult =
  | { ok: true; bookings: ClientBookingListRow[] }
  | { ok: false; reason: "no_supabase" | "no_user" | "load_failed" };

async function clientSubjectOwnsBookingRow(
  supabase: SupabaseClient,
  subjectId: string,
  row: { client_user_id: string | null; source_inquiry_id: string | null },
): Promise<boolean> {
  if (row.client_user_id === subjectId) return true;
  if (!row.source_inquiry_id) return false;
  const { data } = await supabase
    .from("inquiries")
    .select("client_user_id")
    .eq("id", row.source_inquiry_id)
    .maybeSingle();
  return data?.client_user_id === subjectId;
}

export const loadClientBookings = cache(async (): Promise<ClientBookingsLoadResult> => {
  const supabase = await createClient();
  if (!supabase) return { ok: false, reason: "no_supabase" };

  const identity = await resolveDashboardIdentity();
  if (!identity) return { ok: false, reason: "no_user" };
  const subjectId = subjectUserId(identity);

  const { data, error } = await supabase
    .from("agency_bookings")
    .select(
      `
      id,
      title,
      status,
      payment_status,
      payment_method,
      currency_code,
      starts_at,
      ends_at,
      event_date,
      venue_name,
      venue_location_text,
      client_summary,
      source_inquiry_id,
      updated_at,
      client_user_id
    `,
    )
    .order("updated_at", { ascending: false });

  if (error) {
    logServerError("client/loadClientBookings", error);
    return { ok: false, reason: "load_failed" };
  }

  const rows = (data ?? []) as (ClientBookingListRow & {
    client_user_id: string | null;
  })[];

  const filtered: ClientBookingListRow[] = [];
  for (const row of rows) {
    const { client_user_id: _c, ...rest } = row;
    const owns = await clientSubjectOwnsBookingRow(supabase, subjectId, {
      client_user_id: row.client_user_id,
      source_inquiry_id: row.source_inquiry_id,
    });
    if (owns) filtered.push(rest);
  }

  return { ok: true, bookings: filtered };
});

export async function loadClientBookingDetail(bookingId: string): Promise<{
  ok: true;
  booking: {
    id: string;
    title: string;
    status: string;
    payment_status: string;
    payment_method: string | null;
    currency_code: string;
    starts_at: string | null;
    ends_at: string | null;
    event_date: string | null;
    venue_name: string | null;
    venue_location_text: string | null;
    client_summary: string | null;
    source_inquiry_id: string | null;
  };
  lines: ClientBookingLineRow[];
} | { ok: false; reason: "no_supabase" | "no_user" | "not_found" | "load_failed" }> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, reason: "no_supabase" };

  const identity = await resolveDashboardIdentity();
  if (!identity) return { ok: false, reason: "no_user" };
  const subjectId = subjectUserId(identity);

  const { data: booking, error: bErr } = await supabase
    .from("agency_bookings")
    .select(
      `
      id,
      title,
      status,
      payment_status,
      payment_method,
      currency_code,
      starts_at,
      ends_at,
      event_date,
      venue_name,
      venue_location_text,
      client_summary,
      source_inquiry_id,
      client_user_id
    `,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr) {
    logServerError("client/loadClientBookingDetail", bErr);
    return { ok: false, reason: "load_failed" };
  }
  if (!booking) return { ok: false, reason: "not_found" };

  const b = booking as {
    id: string;
    title: string;
    status: string;
    payment_status: string;
    payment_method: string | null;
    currency_code: string;
    starts_at: string | null;
    ends_at: string | null;
    event_date: string | null;
    venue_name: string | null;
    venue_location_text: string | null;
    client_summary: string | null;
    source_inquiry_id: string | null;
    client_user_id: string | null;
  };

  const owns = await clientSubjectOwnsBookingRow(supabase, subjectId, {
    client_user_id: b.client_user_id,
    source_inquiry_id: b.source_inquiry_id,
  });
  if (!owns) return { ok: false, reason: "not_found" };

  const { data: lines, error: lErr } = await supabase
    .from("booking_talent")
    .select("talent_profile_id, talent_name_snapshot, profile_code_snapshot, role_label")
    .eq("booking_id", bookingId)
    .order("sort_order", { ascending: true });

  if (lErr) {
    logServerError("client/loadClientBookingDetail/lines", lErr);
    return { ok: false, reason: "load_failed" };
  }

  const { client_user_id: _drop, ...bookingOut } = b;

  return {
    ok: true,
    booking: bookingOut,
    lines: (lines ?? []) as ClientBookingLineRow[],
  };
}
