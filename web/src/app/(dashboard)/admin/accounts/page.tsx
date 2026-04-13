import { MapPinned } from "lucide-react";
import { AdminAccountQueue } from "@/app/(dashboard)/admin/accounts/admin-account-queue";
import type { AccountQueueRow } from "@/app/(dashboard)/admin/accounts/admin-account-queue";
import { AdminAccountsToolbar } from "@/components/admin/create-client-account-sheet";
import {
  ADMIN_PAGE_STACK,
} from "@/lib/dashboard-shell-classes";
import { formatClientLocationAccountType } from "@/lib/admin/validation";
import { CLIENT_ERROR, isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { createClient } from "@/lib/supabase/server";

type ClientAccountListRow = {
  id: string;
  name: string;
  account_type: string;
  primary_email: string | null;
  primary_phone?: string | null;
  website_url?: string | null;
  location_text?: string | null;
  archived_at?: string | null;
  account_type_detail?: string | null;
  city?: string | null;
  country?: string | null;
  address_notes?: string | null;
  google_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function tallyByAccountId(rows: { client_account_id: string | null }[] | null): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows ?? []) {
    const id = r.client_account_id;
    if (id == null || id === "") continue;
    m[id] = (m[id] ?? 0) + 1;
  }
  return m;
}

export default async function AdminClientAccountsPage() {
  const supabase = await createClient();
  if (!supabase) {
    return <p className="text-sm text-muted-foreground">Supabase not configured.</p>;
  }

  const listSelectExtended =
    "id, name, account_type, account_type_detail, primary_email, primary_phone, website_url, location_text, city, country, address_notes, google_place_id, latitude, longitude, archived_at";
  const listSelectBase =
    "id, name, account_type, primary_email, primary_phone, website_url, location_text, archived_at";

  const firstList = await supabase
    .from("client_accounts")
    .select(listSelectExtended)
    .is("archived_at", null)
    .order("name", { ascending: true });

  let error = firstList.error;
  let rows: ClientAccountListRow[] | null = firstList.data as ClientAccountListRow[] | null;

  if (error && isPostgrestMissingColumnError(error)) {
    logServerError("admin/accounts/list/schema-fallback", error);
    const second = await supabase
      .from("client_accounts")
      .select(listSelectBase)
      .is("archived_at", null)
      .order("name", { ascending: true });
    error = second.error;
    rows = second.data as ClientAccountListRow[] | null;
  }

  if (error) {
    logServerError("admin/accounts/list", error);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }

  const accountIds = (rows ?? []).map((r) => r.id).filter(Boolean);
  let inquiryCountByAccount: Record<string, number> = {};
  let bookingCountByAccount: Record<string, number> = {};
  const linkedClientIdsByAccount: Record<string, Set<string>> = {};
  const latestInquiryAtByAccount: Record<string, string> = {};
  const latestBookingAtByAccount: Record<string, string> = {};
  const clientNameById: Record<string, string> = {};

  if (accountIds.length > 0) {
    const [inqRes, bkRes] = await Promise.all([
      supabase
        .from("inquiries")
        .select("client_account_id, client_user_id, created_at")
        .in("client_account_id", accountIds),
      supabase
        .from("agency_bookings")
        .select("client_account_id, client_user_id, starts_at, updated_at")
        .in("client_account_id", accountIds),
    ]);

    if (inqRes.error) {
      logServerError("admin/accounts/list/inquiry-counts", inqRes.error);
    } else {
      inquiryCountByAccount = tallyByAccountId(inqRes.data);
      for (const row of inqRes.data ?? []) {
        const id = row.client_account_id;
        if (!id) continue;
        if (row.client_user_id) {
          if (!linkedClientIdsByAccount[id]) linkedClientIdsByAccount[id] = new Set<string>();
          linkedClientIdsByAccount[id].add(String(row.client_user_id));
        }
        if (row.created_at) {
          const cur = latestInquiryAtByAccount[id];
          if (!cur || Date.parse(String(row.created_at)) > Date.parse(cur)) {
            latestInquiryAtByAccount[id] = String(row.created_at);
          }
        }
      }
    }

    if (bkRes.error) {
      logServerError("admin/accounts/list/booking-counts", bkRes.error);
    } else {
      bookingCountByAccount = tallyByAccountId(bkRes.data);
      for (const row of bkRes.data ?? []) {
        const id = row.client_account_id;
        if (!id) continue;
        if (row.client_user_id) {
          if (!linkedClientIdsByAccount[id]) linkedClientIdsByAccount[id] = new Set<string>();
          linkedClientIdsByAccount[id].add(String(row.client_user_id));
        }
        const recent = row.starts_at || row.updated_at;
        if (recent) {
          const cur = latestBookingAtByAccount[id];
          if (!cur || Date.parse(String(recent)) > Date.parse(cur)) {
            latestBookingAtByAccount[id] = String(recent);
          }
        }
      }
    }

    const clientIds = Array.from(
      new Set(Object.values(linkedClientIdsByAccount).flatMap((set) => Array.from(set))),
    );
    if (clientIds.length > 0) {
      const profilesRes = await supabase.from("profiles").select("id, display_name").in("id", clientIds);
      if (profilesRes.error) {
        logServerError("admin/accounts/list/linked-clients", profilesRes.error);
      } else {
        for (const profile of profilesRes.data ?? []) {
          clientNameById[String(profile.id)] = String(profile.display_name ?? profile.id);
        }
      }
    }
  }

  const queueRows: AccountQueueRow[] = (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    account_type: row.account_type,
    account_type_detail: (row.account_type_detail as string | null) ?? null,
    primary_email: (row.primary_email as string | null) ?? null,
    primary_phone: (row.primary_phone as string | null) ?? null,
    website_url: (row.website_url as string | null) ?? null,
    location_text: (row.location_text as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    address_notes: (row.address_notes as string | null) ?? null,
    google_place_id: (row.google_place_id as string | null) ?? null,
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    typeLabel: formatClientLocationAccountType(
      String(row.account_type),
      (row.account_type_detail as string | null) ?? null,
    ),
    inquiriesCount: inquiryCountByAccount[row.id] ?? 0,
    bookingsCount: bookingCountByAccount[row.id] ?? 0,
    linkedClientsCount: (linkedClientIdsByAccount[row.id] ?? new Set<string>()).size,
    linkedClients: Array.from(linkedClientIdsByAccount[row.id] ?? [])
      .slice(0, 4)
      .map((clientId) => ({ id: clientId, name: clientNameById[clientId] ?? clientId })),
    latestInquiryAt: latestInquiryAtByAccount[row.id] ?? null,
    latestBookingAt: latestBookingAtByAccount[row.id] ?? null,
  }));

  return (
    <div className={ADMIN_PAGE_STACK}>
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--impronta-gold)]/25 bg-[var(--impronta-gold)]/10">
            <MapPinned className="size-5 text-[var(--impronta-gold)]" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
              Client Locations
            </h1>
            <p className="text-sm text-muted-foreground">
              {queueRows.length > 0
                ? `${queueRows.length} location${queueRows.length === 1 ? "" : "s"}`
                : "No locations yet"}{" "}
              · villas, venues, hotels linked to jobs
            </p>
          </div>
        </div>
        <AdminAccountsToolbar />
      </div>

      {/* Queue table */}
      <AdminAccountQueue rows={queueRows} />
    </div>
  );
}
