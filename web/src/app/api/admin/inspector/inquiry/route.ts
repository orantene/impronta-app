import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/server/staff-api-route";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

function relOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

/**
 * Staff-only snapshot for inspector + inquiry-draft assistant context.
 */
export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if ("error" in auth) return auth.error;

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { supabase } = auth;
  const { data, error } = await supabase
    .from("inquiries")
    .select(
      `
      id, status, contact_name, contact_email, company,
      event_date, event_location, quantity, message,
      created_at, updated_at,
      client_account_id, client_user_id,
      client_accounts ( name ),
      inquiry_talent (
        talent_profile_id,
        talent_profiles ( display_name, profile_code )
      ),
      agency_bookings ( id )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logServerError("api/admin/inspector/inquiry", error);
    return NextResponse.json({ error: CLIENT_ERROR.generic }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = data as {
    id: string;
    status: string;
    contact_name: string;
    contact_email: string;
    company: string | null;
    event_date: string | null;
    event_location: string | null;
    quantity: number | null;
    message: string | null;
    created_at: string;
    updated_at: string;
    client_account_id: string | null;
    client_user_id: string | null;
    client_accounts: { name: string } | { name: string }[] | null;
    inquiry_talent:
      | {
          talent_profile_id: string;
          talent_profiles:
            | { display_name: string | null; profile_code: string }
            | { display_name: string | null; profile_code: string }[]
            | null;
        }[]
      | null;
    agency_bookings: { id: string }[] | null;
  };

  const acc = Array.isArray(row.client_accounts) ? row.client_accounts[0] : row.client_accounts;
  const talentNames =
    row.inquiry_talent?.map((t) => {
      const tp = relOne(t.talent_profiles);
      const label = tp?.display_name?.trim() || tp?.profile_code || "Talent";
      return label;
    }) ?? [];

  return NextResponse.json({
    id: row.id,
    status: row.status,
    contact_name: row.contact_name,
    contact_email: row.contact_email,
    company: row.company,
    event_date: row.event_date,
    event_location: row.event_location,
    quantity: row.quantity,
    message: row.message,
    created_at: row.created_at,
    updated_at: row.updated_at,
    client_account_id: row.client_account_id,
    client_user_id: row.client_user_id,
    client_account_name: acc?.name ?? null,
    talent_names: talentNames,
    linked_booking_count: row.agency_bookings?.length ?? 0,
  });
}
