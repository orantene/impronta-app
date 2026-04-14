import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/server/staff-api-route";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

/**
 * Staff-only snapshot for the contextual inspector when a booking row is selected (`apanel=peek` + `aid`).
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
    .from("agency_bookings")
    .select(
      `
      id, title, status, payment_status, starts_at, ends_at,
      source_inquiry_id, client_account_id, updated_at,
      client_accounts ( name ),
      client_account_contacts ( full_name ),
      booking_talent ( id )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logServerError("api/admin/inspector/booking", error);
    return NextResponse.json({ error: CLIENT_ERROR.generic }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = data as {
    id: string;
    title: string;
    status: string;
    payment_status: string;
    starts_at: string | null;
    ends_at: string | null;
    source_inquiry_id: string | null;
    client_account_id: string | null;
    updated_at: string;
    client_accounts: { name: string } | { name: string }[] | null;
    client_account_contacts: { full_name: string } | { full_name: string }[] | null;
    booking_talent: { id: string }[] | null;
  };

  const acc = Array.isArray(row.client_accounts) ? row.client_accounts[0] : row.client_accounts;
  const contact = Array.isArray(row.client_account_contacts)
    ? row.client_account_contacts[0]
    : row.client_account_contacts;

  return NextResponse.json({
    id: row.id,
    title: row.title,
    status: row.status,
    payment_status: row.payment_status,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    source_inquiry_id: row.source_inquiry_id,
    client_account_id: row.client_account_id,
    account_name: acc?.name ?? null,
    contact_name: contact?.full_name ?? null,
    talent_count: row.booking_talent?.length ?? 0,
    updated_at: row.updated_at,
  });
}
