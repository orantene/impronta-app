import Link from "next/link";
import { Suspense } from "react";
import { CalendarRange, Info } from "lucide-react";
import { AdminBookingQueue } from "@/app/(dashboard)/admin/bookings/admin-booking-queue";
import type { BookingQueueRow } from "@/app/(dashboard)/admin/bookings/admin-booking-queue";
import { AdminFilterBar } from "@/components/admin/admin-filter-bar";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminCommercialListIntake } from "@/components/admin/admin-commercial-list-intake";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatAdminTimestamp } from "@/lib/admin/format-admin-timestamp";
import {
  ADMIN_FORM_CONTROL,
  ADMIN_HELP_TRIGGER_BUTTON,
  ADMIN_PAGE_STACK,
  ADMIN_POPOVER_CONTENT_CLASS,
} from "@/lib/dashboard-shell-classes";
import { BOOKING_STATUS_VALUES } from "@/lib/admin/validation";
import { cn } from "@/lib/utils";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";

function relOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

type RawBookingRow = {
  id: string;
  title: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  payment_status: string;
  payment_method: string | null;
  total_client_revenue: number;
  total_talent_cost: number;
  gross_profit: number;
  currency_code: string;
  source_inquiry_id: string | null;
  client_account_id: string | null;
  client_contact_id: string | null;
  client_user_id: string | null;
  owner_staff_id: string | null;
  updated_at: string;
  client_accounts: { name: string } | null;
  client_account_contacts: { full_name: string } | null;
  booking_talent: { id: string }[] | null;
};

const BOOKING_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  tentative: "Tentative",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
};

function buildAdminBookingsHref(opts: {
  status?: string;
  client_account_id?: string;
  client_user_id?: string;
  q?: string;
  owner_staff_id?: string;
  updated_from?: string;
  updated_to?: string;
}): string {
  const p = new URLSearchParams();
  if (opts.status && opts.status !== "all") p.set("status", opts.status);
  if (opts.client_account_id) p.set("client_account_id", opts.client_account_id);
  if (opts.client_user_id) p.set("client_user_id", opts.client_user_id);
  if (opts.q) p.set("q", opts.q);
  if (opts.owner_staff_id) p.set("owner_staff_id", opts.owner_staff_id);
  if (opts.updated_from) p.set("updated_from", opts.updated_from);
  if (opts.updated_to) p.set("updated_to", opts.updated_to);
  const s = p.toString();
  return s ? `/admin/bookings?${s}` : "/admin/bookings";
}

const STATUS_TABS = [
  { key: "all", label: "All" },
  ...BOOKING_STATUS_VALUES.map((s) => ({
    key: s,
    label: BOOKING_STATUS_LABEL[s] ?? s.replace(/_/g, " "),
  })),
];

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    client_account_id?: string;
    client_user_id?: string;
    q?: string;
    owner_staff_id?: string;
    updated_from?: string;
    updated_to?: string;
    err?: string;
    apanel?: string;
    aid?: string;
  }>;
}) {
  const {
    status: statusFilter,
    client_account_id: clientAccountIdFilter,
    client_user_id: clientUserIdFilter,
    q: query = "",
    owner_staff_id: ownerStaffId,
    updated_from: updatedFrom = "",
    updated_to: updatedTo = "",
    err: errParam,
  } = await searchParams;
  const supabase = await getCachedServerSupabase();
  if (!supabase) {
    return <p className="text-sm text-muted-foreground">Supabase not configured.</p>;
  }

  const trimmedQuery = query.trim();

  let dbQuery = supabase
    .from("agency_bookings")
    .select(
      `
      id, title, status, starts_at, ends_at,
      payment_status, payment_method,
      total_client_revenue, total_talent_cost, gross_profit, currency_code,
      source_inquiry_id, client_account_id, client_contact_id, client_user_id,
      owner_staff_id, updated_at,
      client_accounts ( name ),
      client_account_contacts ( full_name ),
      booking_talent ( id )
    `,
    )
    .order("updated_at", { ascending: false });

  if (statusFilter && statusFilter !== "all" && BOOKING_STATUS_VALUES.includes(statusFilter as (typeof BOOKING_STATUS_VALUES)[number])) {
    dbQuery = dbQuery.eq("status", statusFilter);
  }
  if (clientAccountIdFilter) dbQuery = dbQuery.eq("client_account_id", clientAccountIdFilter);
  if (clientUserIdFilter) dbQuery = dbQuery.eq("client_user_id", clientUserIdFilter);
  if (ownerStaffId) dbQuery = dbQuery.eq("owner_staff_id", ownerStaffId);
  if (updatedFrom) dbQuery = dbQuery.gte("updated_at", `${updatedFrom}T00:00:00`);
  if (updatedTo) dbQuery = dbQuery.lte("updated_at", `${updatedTo}T23:59:59`);

  if (trimmedQuery) {
    const pattern = `%${trimmedQuery.replace(/[%_]/g, "\\$&")}%`;
    dbQuery = dbQuery.or(
      `title.ilike.${pattern},contact_name.ilike.${pattern},contact_email.ilike.${pattern},venue_name.ilike.${pattern},venue_location_text.ilike.${pattern}`,
    );
  }

  const [
    { data: rawRows, error },
    authRes,
    scopedAccountRes,
    scopedClientRes,
    staffRes,
    intakeAccountsRes,
    intakeContactsRes,
    intakeTalentsRes,
    intakePlatformRes,
  ] = await Promise.all([
    dbQuery,
    supabase.auth.getUser(),
    clientAccountIdFilter
      ? supabase.from("client_accounts").select("name").eq("id", clientAccountIdFilter).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null, error: null }),
    clientUserIdFilter
      ? supabase.from("profiles").select("display_name").eq("id", clientUserIdFilter).maybeSingle()
      : Promise.resolve({ data: null as { display_name: string | null } | null, error: null }),
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("app_role", ["super_admin", "agency_staff"])
      .order("display_name", { ascending: true }),
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
      .limit(400),
    supabase
      .from("profiles")
      .select("id, display_name")
      .eq("app_role", "client")
      .order("display_name", { ascending: true })
      .limit(500),
  ]);

  if (error) {
    logServerError("admin/bookings/list", error);
    return <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>;
  }

  if (staffRes.error) logServerError("admin/bookings/staffOptions", staffRes.error);

  const staffMap = new Map((staffRes.data ?? []).map((s) => [s.id as string, (s.display_name as string | null) ?? null]));
  const currentUserId = authRes.data.user?.id ?? null;
  const staffOptions = (staffRes.data ?? []).map((s) => ({
    id: s.id as string,
    display_name: (s.display_name as string | null) ?? null,
  }));

  type ContactRow = {
    id: string;
    client_account_id: string;
    full_name: string;
    client_accounts: { name: string } | { name: string }[] | null;
  };
  const intakeContacts = (intakeContactsRes.data ?? []).map((row: ContactRow) => {
    const acc = row.client_accounts;
    const accName = Array.isArray(acc) ? acc[0]?.name : acc?.name;
    return {
      id: row.id,
      client_account_id: row.client_account_id,
      label: accName ? `${row.full_name} · ${accName}` : row.full_name,
    };
  });

  const list = (rawRows ?? []) as unknown as RawBookingRow[];

  // Shape rows for the queue component
  const queueRows: BookingQueueRow[] = list.map((b) => ({
    id: b.id,
    title: b.title,
    status: b.status,
    starts_at: b.starts_at,
    ends_at: b.ends_at,
    payment_status: b.payment_status,
    payment_method: b.payment_method,
    total_client_revenue: b.total_client_revenue,
    total_talent_cost: b.total_talent_cost,
    gross_profit: b.gross_profit,
    currency_code: b.currency_code,
    source_inquiry_id: b.source_inquiry_id,
    client_account_id: b.client_account_id,
    client_user_id: b.client_user_id,
    owner_staff_id: b.owner_staff_id,
    updated_at: b.updated_at,
    account_name: relOne(b.client_accounts as { name: string } | null)?.name ?? "—",
    contact_name:
      relOne(b.client_account_contacts as { full_name: string } | null)?.full_name ?? "—",
    manager_display: b.owner_staff_id ? staffMap.get(b.owner_staff_id) ?? null : null,
    talent_count: Array.isArray(b.booking_talent) ? b.booking_talent.length : 0,
    updated_at_display: formatAdminTimestamp(b.updated_at),
  }));

  const bookingNavBase = {
    client_account_id: clientAccountIdFilter,
    client_user_id: clientUserIdFilter,
    q: trimmedQuery || undefined,
    owner_staff_id: ownerStaffId || undefined,
    updated_from: updatedFrom || undefined,
    updated_to: updatedTo || undefined,
  };

  const hasActiveFilters = Boolean(
    trimmedQuery || ownerStaffId || updatedFrom || updatedTo || clientAccountIdFilter || clientUserIdFilter,
  );
  const filterActiveCount =
    (trimmedQuery ? 1 : 0) +
    (ownerStaffId ? 1 : 0) +
    (updatedFrom ? 1 : 0) +
    (updatedTo ? 1 : 0) +
    (clientAccountIdFilter ? 1 : 0) +
    (clientUserIdFilter ? 1 : 0);

  const manualFormKey = `${(intakeAccountsRes.data ?? []).map((a) => a.id).sort().join("-")}`;

  const decodedErr = errParam
    ? (() => {
        try {
          return decodeURIComponent(errParam);
        } catch {
          return errParam;
        }
      })()
    : null;

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={CalendarRange}
        title="Bookings"
        description={
          queueRows.length > 0
            ? `${queueRows.length} booking${queueRows.length === 1 ? "" : "s"} in this view`
            : "No bookings in this view"
        }
        right={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className={ADMIN_HELP_TRIGGER_BUTTON} asChild>
            <Link href="/admin/bookings/new" scroll={false}>
              Full-page form
            </Link>
          </Button>
          <AdminCommercialListIntake
            variant="bookings"
            accounts={(intakeAccountsRes.data ?? []) as { id: string; name: string }[]}
            contacts={intakeContacts}
            talents={(intakeTalentsRes.data ?? []) as { id: string; profile_code: string; display_name: string | null }[]}
            staff={(staffRes.data ?? []) as { id: string; display_name: string | null }[]}
            defaultOwnerId={currentUserId ?? ""}
            platformClients={(intakePlatformRes.data ?? []) as { id: string; display_name: string | null }[]}
            formKey={manualFormKey}
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
                <p className="font-display text-sm font-medium text-foreground">Execution pipeline</p>
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                  <li>Each row is confirmed commercial work — draft through completed or archived.</li>
                  <li>Preview a row to adjust status or manager without opening the full page.</li>
                  <li>New leads and phone intake belong under Requests; confirmed jobs live here.</li>
                </ul>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        }
      />

      {decodedErr && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {decodedErr}
        </p>
      )}

      <AdminStatusTabs
        ariaLabel="Booking status"
        items={STATUS_TABS.map((tab) => ({
          href: buildAdminBookingsHref({
            ...bookingNavBase,
            status: tab.key === "all" ? undefined : tab.key,
          }),
          label: tab.label,
          active:
            tab.key === "all"
              ? !statusFilter || statusFilter === "all"
              : statusFilter === tab.key,
        }))}
      />

      {/* Scope banners */}
      {clientAccountIdFilter && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/45 bg-muted/20 px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            Location:{" "}
            <span className="font-medium text-foreground">
              {scopedAccountRes.data?.name?.trim() || clientAccountIdFilter}
            </span>
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link
              href={buildAdminBookingsHref({ ...bookingNavBase, client_account_id: undefined, status: statusFilter && statusFilter !== "all" ? statusFilter : undefined })}
              scroll={false}
            >
              Clear
            </Link>
          </Button>
        </div>
      )}
      {clientUserIdFilter && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/45 bg-muted/20 px-4 py-3 text-sm">
          <p className="text-muted-foreground">
            Client:{" "}
            <span className="font-medium text-foreground">
              {scopedClientRes.data?.display_name?.trim() || clientUserIdFilter}
            </span>
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link
              href={buildAdminBookingsHref({ ...bookingNavBase, client_user_id: undefined, status: statusFilter && statusFilter !== "all" ? statusFilter : undefined })}
              scroll={false}
            >
              Clear
            </Link>
          </Button>
        </div>
      )}

      <AdminFilterBar title="Search & filters" activeCount={filterActiveCount}>
      <form
        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_150px_150px_auto] md:items-end"
        method="get"
      >
        <div className="space-y-1.5">
          <label htmlFor="bk_q" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Search
          </label>
          <input
            id="bk_q"
            name="q"
            defaultValue={trimmedQuery}
            placeholder="Title, contact, venue…"
            className={ADMIN_FORM_CONTROL}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="bk_owner" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Manager
          </label>
          <select id="bk_owner" name="owner_staff_id" defaultValue={ownerStaffId ?? ""} className={ADMIN_FORM_CONTROL}>
            <option value="">All staff</option>
            {(staffRes.data ?? []).map((staff) => (
              <option key={staff.id as string} value={staff.id as string}>
                {(staff.display_name as string | null) ?? String(staff.id).slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="bk_account" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Location
          </label>
          <select
            id="bk_account"
            name="client_account_id"
            defaultValue={clientAccountIdFilter ?? ""}
            className={ADMIN_FORM_CONTROL}
          >
            <option value="">All locations</option>
            {(intakeAccountsRes.data ?? []).map((a) => (
              <option key={a.id as string} value={a.id as string}>
                {(a.name as string) ?? a.id}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="bk_updated_from" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            From
          </label>
          <input
            id="bk_updated_from"
            name="updated_from"
            type="date"
            defaultValue={updatedFrom}
            className={ADMIN_FORM_CONTROL}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="bk_updated_to" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            To
          </label>
          <input
            id="bk_updated_to"
            name="updated_to"
            type="date"
            defaultValue={updatedTo}
            className={ADMIN_FORM_CONTROL}
          />
        </div>
        <div className="flex gap-2">
          {statusFilter && statusFilter !== "all" ? (
            <input type="hidden" name="status" value={statusFilter} />
          ) : null}
          <Button type="submit">Apply</Button>
          {hasActiveFilters ? (
            <Button variant="outline" asChild>
              <Link
                href={buildAdminBookingsHref({
                  status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
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
                href={buildAdminBookingsHref({
                  ...bookingNavBase,
                  status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
                  owner_staff_id: currentUserId,
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
        <AdminBookingQueue rows={queueRows} currentUserId={currentUserId} staffOptions={staffOptions} />
      </Suspense>
    </div>
  );
}
