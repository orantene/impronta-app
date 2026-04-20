import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/server/staff-api-route";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { loadInquiryRoster } from "@/lib/inquiry/inquiry-workspace-data";
import { getTenantScope } from "@/lib/saas/scope";

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
  const scope = await getTenantScope();
  if (!scope) {
    return NextResponse.json({ error: "No tenant scope" }, { status: 403 });
  }
  const { data, error } = await supabase
    .from("inquiries")
    .select(
      `
      id, status, uses_new_engine, contact_name, contact_email, company,
      event_date, event_location, quantity, message,
      created_at, updated_at,
      client_account_id, client_user_id,
      client_accounts ( name ),
      agency_bookings ( id )
    `,
    )
    .eq("tenant_id", scope.tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logServerError("api/admin/inspector/inquiry", error);
    return NextResponse.json({ error: CLIENT_ERROR.generic }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = data as unknown as {
    id: string;
    status: string;
    uses_new_engine: boolean;
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
    agency_bookings: { id: string }[] | null;
  };

  const acc = Array.isArray(row.client_accounts) ? row.client_accounts[0] : row.client_accounts;
  const roster = await loadInquiryRoster(supabase, row.id);
  const talentNames = roster.map((t) => t.displayName?.trim() || t.profileCode || "Talent");

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
