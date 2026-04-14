import Link from "next/link";
import { Suspense } from "react";
import { Info, MessageSquareText } from "lucide-react";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminCommercialListIntake } from "@/components/admin/admin-commercial-list-intake";
import { AdminInquiryQueue } from "@/app/(dashboard)/admin/inquiries/admin-inquiry-queue";
import type { InquiryQueueRow } from "@/app/(dashboard)/admin/inquiries/admin-inquiry-queue";
import { Button, buttonVariants } from "@/components/ui/button";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import {
  ADMIN_FORM_CONTROL,
  ADMIN_HELP_TRIGGER_BUTTON,
  ADMIN_PAGE_STACK,
  ADMIN_POPOVER_CONTENT_CLASS,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import { formatAdminTimestamp } from "@/lib/admin/format-admin-timestamp";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function relOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function inquiryTalentPeek(row: {
  inquiry_talent?:
    | {
        talent_profile_id: string;
        talent_profiles:
          | { profile_code: string; display_name: string | null }
          | { profile_code: string; display_name: string | null }[]
          | null;
      }[]
    | null;
}): { line: string; count: number } {
  const rows = row.inquiry_talent ?? [];
  const count = rows.length;
  if (count === 0) return { line: "No talent on shortlist", count: 0 };
  const labels = rows
    .slice(0, 3)
    .map((r) => {
      const tp = relOne(r.talent_profiles);
      if (!tp) return null;
      return `${tp.profile_code}${tp.display_name ? ` · ${tp.display_name}` : ""}`;
    })
    .filter(Boolean) as string[];
  const extra = count > 3 ? ` (+${count - 3} more)` : "";
  return { line: `${labels.join(", ")}${extra}`, count };
}

type RawInquiryRow = {
  id: string;
  status: string;
  contact_name: string;
  contact_email: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  guest_session_id: string | null;
  created_at: string;
  updated_at: string;
  assigned_staff_id: string | null;
  client_user_id: string | null;
  client_account_id: string | null;
  client_accounts: { name: string } | { name: string }[] | null;
  client_account_contacts: { full_name: string } | { full_name: string }[] | null;
  inquiry_talent:
    | {
        talent_profile_id: string;
        talent_profiles:
          | { profile_code: string; display_name: string | null }
          | { profile_code: string; display_name: string | null }[]
          | null;
      }[]
    | null;
  agency_bookings: { id: string }[] | null;
};

function buildAdminInquiriesHref(opts: {
  status?: string;
  client_user_id?: string;
  client_account_id?: string;
  q?: string;
  assigned_staff_id?: string;
  created_from?: string;
  created_to?: string;
}): string {
  const p = new URLSearchParams();
  if (opts.status && opts.status !== "all") p.set("status", opts.status);
  if (opts.client_user_id) p.set("client_user_id", opts.client_user_id);
  if (opts.client_account_id) p.set("client_account_id", opts.client_account_id);
  if (opts.q) p.set("q", opts.q);
  if (opts.assigned_staff_id) p.set("assigned_staff_id", opts.assigned_staff_id);
  if (opts.created_from) p.set("created_from", opts.created_from);
  if (opts.created_to) p.set("created_to", opts.created_to);
  const s = p.toString();
  return s ? `/admin/inquiries?${s}` : "/admin/inquiries";
}

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "reviewing", label: "Reviewing" },
  { key: "in_progress", label: "In progress" },
  { key: "waiting_for_client", label: "Waiting" },
  { key: "talent_suggested", label: "Suggested" },
  { key: "converted", label: "Converted" },
  { key: "closed", label: "Closed" },
  { key: "archived", label: "Archived" },
];

export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    client_user_id?: string;
    client_account_id?: string;
    q?: string;
    assigned_staff_id?: string;
    created_from?: string;
    created_to?: string;
    apanel?: string;
    aid?: string;
  }>;
}) {
  const {
    status: statusFilter,
    client_user_id: clientUserId,
    client_account_id: clientAccountId,
    q: query = "",
    assigned_staff_id: assignedStaffId,
    created_from: createdFrom = "",
    created_to: createdTo = "",
  } = await searchParams;
  const supabase = await getCachedServerSupabase();

  if (!supabase) {
    return <p className="text-sm text-muted-foreground">Supabase not configured.</p>;
  }

  let dbQuery = supabase
    .from("inquiries")
    .select(
      `
      id, status, contact_name, contact_email, company,
      event_date, event_location, quantity, guest_session_id,
      created_at, updated_at, assigned_staff_id,
      client_user_id, client_account_id, client_contact_id,
      client_accounts ( name ),
      client_account_contacts ( full_name ),
      inquiry_talent (
        talent_profile_id,
        talent_profiles ( profile_code, display_name )
      ),
      agency_bookings ( id )
    `,
    )
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") dbQuery = dbQuery.eq("status", statusFilter);
  if (clientUserId) dbQuery = dbQuery.eq("client_user_id", clientUserId);
  if (clientAccountId) dbQuery = dbQuery.eq("client_account_id", clientAccountId);
  if (assignedStaffId) dbQuery = dbQuery.eq("assigned_staff_id", assignedStaffId);
  if (createdFrom) dbQuery = dbQuery.gte("created_at", `${createdFrom}T00:00:00`);
  if (createdTo) dbQuery = dbQuery.lte("created_at", `${createdTo}T23:59:59`);

  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    const pattern = `%${trimmedQuery.replace(/[%_]/g, "\\$&")}%`;
    dbQuery = dbQuery.or(
      `contact_name.ilike.${pattern},contact_email.ilike.${pattern},company.ilike.${pattern},event_location.ilike.${pattern}`,
    );
  }

  const [
    { data: rawRows, error },
    clientFilterRes,
    accountFilterRes,
    staffRes,
    authRes,
    intakeAccountsRes,
    intakeContactsRes,
    intakeTalentsRes,
  ] = await Promise.all([
    dbQuery,
    clientUserId
      ? supabase.from("profiles").select("id, display_name").eq("id", clientUserId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    clientAccountId
      ? supabase.from("client_accounts").select("id, name").eq("id", clientAccountId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("app_role", ["super_admin", "agency_staff"])
      .order("display_name", { ascending: true }),
    supabase.auth.getUser(),
    supabase.from("client_accounts").select("id, name").is("archived_at", null).order("name", { ascending: true }),
    supabase
      .from("client_account_contacts")
      .select("id, client_account_id, full_name, client_accounts(name)")
      .is("archived_at", null)
      .order("full_name", { ascending: true }),
    supabase
      .from("talent_profiles")
      .select("id, profile_code, display_name")
      .is("deleted_at", null)
      .order("profile_code", { ascending: true })
      .limit(500),
  ]);

  if (error) {
    logServerError("admin/inquiries/list", error);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }

  const rowList = (rawRows ?? []) as RawInquiryRow[];

  // Resolve platform client names
  const platformClientIds = [
    ...new Set(rowList.map((r) => r.client_user_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: platformProfiles } =
    platformClientIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", platformClientIds)
      : { data: [] as { id: string; display_name: string | null }[] };
  const platformNameById = new Map(
    (platformProfiles ?? []).map((p) => [p.id as string, (p.display_name as string | null)?.trim() || null]),
  );

  if (staffRes.error) logServerError("admin/inquiries/staffOptions", staffRes.error);

  const staffMap = new Map(
    (staffRes.data ?? []).map((s) => [s.id as string, (s.display_name as string | null) ?? null]),
  );

  type IntakeContactRow = {
    id: string;
    client_account_id: string;
    full_name: string;
    client_accounts: { name: string } | { name: string }[] | null;
  };
  const intakeContacts = (intakeContactsRes.data ?? []).map((row: IntakeContactRow) => {
    const acc = row.client_accounts;
    const accName = Array.isArray(acc) ? acc[0]?.name : acc?.name;
    return {
      id: row.id,
      client_account_id: row.client_account_id,
      label: accName ? `${row.full_name} · ${accName}` : row.full_name,
    };
  });

  const currentUserId = authRes.data.user?.id ?? null;
  const scopedClientName = clientFilterRes.data?.display_name as string | null | undefined;
  const scopedAccountName = accountFilterRes.data?.name as string | null | undefined;

  const inquiryNavBase = {
    client_user_id: clientUserId,
    client_account_id: clientAccountId,
    q: trimmedQuery || undefined,
    assigned_staff_id: assignedStaffId || undefined,
    created_from: createdFrom || undefined,
    created_to: createdTo || undefined,
  };

  // Shape rows for the queue component
  const queueRows: InquiryQueueRow[] = rowList.map((row) => {
    const talentPeek = inquiryTalentPeek(row);
    return {
      id: row.id,
      status: row.status,
      contact_name: row.contact_name,
      contact_email: row.contact_email,
      company: row.company,
      event_date: row.event_date,
      event_location: row.event_location,
      quantity: row.quantity,
      guest_session_id: row.guest_session_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      assigned_staff_id: row.assigned_staff_id,
      client_user_id: row.client_user_id,
      client_account_id: row.client_account_id,
      client_account_name: relOne(row.client_accounts as { name: string } | { name: string }[] | null)?.name ?? null,
      linked_contact_name:
        relOne(row.client_account_contacts as { full_name: string } | { full_name: string }[] | null)?.full_name ?? null,
      platform_client_name: row.client_user_id ? platformNameById.get(row.client_user_id) ?? null : null,
      assigned_staff_display: row.assigned_staff_id ? staffMap.get(row.assigned_staff_id) ?? null : null,
      talent_line: talentPeek.line,
      talent_count: talentPeek.count,
      linked_booking_count: Array.isArray(row.agency_bookings) ? row.agency_bookings.length : 0,
      updated_at_display: formatAdminTimestamp(row.updated_at),
    };
  });

  const hasActiveFilters = Boolean(trimmedQuery || assignedStaffId || createdFrom || createdTo);
  const filterActiveCount =
    (trimmedQuery ? 1 : 0) +
    (assignedStaffId ? 1 : 0) +
    (createdFrom ? 1 : 0) +
    (createdTo ? 1 : 0);

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={MessageSquareText}
        title="Requests"
        description={
          queueRows.length > 0
            ? `${queueRows.length} request${queueRows.length === 1 ? "" : "s"} in this view`
            : "No requests in this view"
        }
        right={
        <div className="flex flex-wrap items-center gap-2">
          <AdminCommercialListIntake
            variant="inquiries"
            accounts={(intakeAccountsRes.data ?? []) as { id: string; name: string }[]}
            contacts={intakeContacts}
            talents={(intakeTalentsRes.data ?? []) as { id: string; profile_code: string; display_name: string | null }[]}
          />
          <Popover>
            <PopoverTrigger
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), ADMIN_HELP_TRIGGER_BUTTON)}
            >
              <Info className="size-4 text-[var(--impronta-gold)]" aria-hidden />
              How it works
            </PopoverTrigger>
            <PopoverContent align="end" className={ADMIN_POPOVER_CONTENT_CLASS}>
              <div className="space-y-2">
                <p className="font-display text-sm font-medium text-foreground">Intake pipeline</p>
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                  <li>Each row is a lead — not confirmed work yet. Use "New request" for phone intake.</li>
                  <li>Preview without leaving the list, or open the full page to convert to a booking.</li>
                  <li>Confirmed jobs live under Bookings once you convert.</li>
                </ul>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        }
      />

      <AdminStatusTabs
        ariaLabel="Request status"
        items={STATUS_TABS.map((tab) => ({
          href: buildAdminInquiriesHref({
            ...inquiryNavBase,
            status: tab.key === "all" ? undefined : tab.key,
          }),
          label: tab.label,
          active: tab.key === "all" ? !statusFilter : statusFilter === tab.key,
        }))}
      />

      {/* Scope banners */}
      {clientUserId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/45 bg-muted/20 px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            Scoped to client:{" "}
            <span className="font-medium text-foreground">{scopedClientName?.trim() || clientUserId}</span>
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/inquiries" scroll={false}>Clear scope</Link>
          </Button>
        </div>
      )}
      {clientAccountId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/45 bg-muted/20 px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            Scoped to location:{" "}
            <span className="font-medium text-foreground">{scopedAccountName?.trim() || clientAccountId}</span>
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/inquiries" scroll={false}>Clear scope</Link>
          </Button>
        </div>
      )}

      <AdminFilterBar title="Search & filters" activeCount={filterActiveCount}>
      <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_160px_160px_auto] md:items-end">
        <div className="space-y-1.5">
          <label htmlFor="q" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={trimmedQuery}
            placeholder="Contact, company, location…"
            className={ADMIN_FORM_CONTROL}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="assigned_staff_id" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assigned to
          </label>
          <select
            id="assigned_staff_id"
            name="assigned_staff_id"
            defaultValue={assignedStaffId ?? ""}
            className={ADMIN_FORM_CONTROL}
          >
            <option value="">All staff</option>
            {(staffRes.data ?? []).map((staff) => (
              <option key={staff.id as string} value={staff.id as string}>
                {(staff.display_name as string | null) ?? String(staff.id).slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="created_from" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            From
          </label>
          <input
            id="created_from"
            name="created_from"
            type="date"
            defaultValue={createdFrom}
            className={ADMIN_FORM_CONTROL}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="created_to" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            To
          </label>
          <input
            id="created_to"
            name="created_to"
            type="date"
            defaultValue={createdTo}
            className={ADMIN_FORM_CONTROL}
          />
        </div>
        <div className="flex gap-2">
          {statusFilter ? <input type="hidden" name="status" value={statusFilter} /> : null}
          {clientUserId ? <input type="hidden" name="client_user_id" value={clientUserId} /> : null}
          {clientAccountId ? <input type="hidden" name="client_account_id" value={clientAccountId} /> : null}
          <Button type="submit">Apply</Button>
          {hasActiveFilters ? (
            <Button variant="outline" asChild>
              <Link
                href={buildAdminInquiriesHref({
                  status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
                  client_user_id: clientUserId,
                  client_account_id: clientAccountId,
                })}
                scroll={false}
              >
                Clear
              </Link>
            </Button>
          ) : null}
          {currentUserId ? (
            <Button variant="outline" asChild>
              <Link
                href={buildAdminInquiriesHref({
                  ...inquiryNavBase,
                  status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
                  assigned_staff_id: currentUserId,
                })}
                scroll={false}
              >
                Mine
              </Link>
            </Button>
          ) : null}
        </div>
      </form>
      </AdminFilterBar>

      {/* Queue table — Suspense: peek triggers use `useSearchParams` */}
      <Suspense
        fallback={
          <div className="h-48 animate-pulse rounded-2xl border border-border/40 bg-muted/20" aria-hidden />
        }
      >
        <AdminInquiryQueue rows={queueRows} currentUserId={currentUserId} />
      </Suspense>
    </div>
  );
}
