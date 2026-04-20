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
} from "@/lib/dashboard-shell-classes";
import { formatAdminTimestamp } from "@/lib/admin/format-admin-timestamp";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { loadInquiryRosterPeekMany } from "@/lib/inquiry/inquiry-workspace-data";
import { requireAdminTenantGuard } from "@/lib/saas/admin-scope";

function relOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function inquiryTalentPeekFallback(): { line: string; count: number } {
  return { line: "No talent on shortlist", count: 0 };
}

type RawInquiryRow = {
  id: string;
  status: string;
  uses_new_engine: boolean;
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
  next_action_by: string | null;
  priority: string | null;
  client_accounts: { name: string } | { name: string }[] | null;
  client_account_contacts: { full_name: string } | { full_name: string }[] | null;
  agency_bookings: { id: string }[] | null;
};

/**
 * Filter tokens surfaced in the queue URL (M6.1). All optional; presence means
 * the user narrowed the list from the default "everything the admin can see".
 * Keep the shape flat so `buildAdminInquiriesHref` stays a single call-site.
 */
type QueueUrlFilters = {
  status?: string;
  client_user_id?: string;
  client_account_id?: string;
  q?: string;
  assigned_staff_id?: string;
  created_from?: string;
  created_to?: string;
  /** `admin` | `client` | `talent` — maps to `inquiries.next_action_by`. Admin covers admin+coordinator. */
  waiting_on?: string;
  /** "1" = only show rows the current admin has unread messages in. */
  unread_only?: string;
  /** "1" = only show rows whose `next_action_by` is admin/coordinator (primary action owner = agency). */
  actionable_only?: string;
  /** `all` | `mine` | `unassigned` | uuid of a coordinator profile. Filters on `inquiry_coordinators` (role=primary, status=active). */
  coordinator?: string;
  /** "1" = only show rows with ANY Tier-1 alert (union of unread + actionable + approved-with-no-booking). Drives the sidebar badge click-through (M6.2). */
  tier1_only?: string;
};

function buildAdminInquiriesHref(opts: QueueUrlFilters): string {
  const p = new URLSearchParams();
  if (opts.status && opts.status !== "all") p.set("status", opts.status);
  if (opts.client_user_id) p.set("client_user_id", opts.client_user_id);
  if (opts.client_account_id) p.set("client_account_id", opts.client_account_id);
  if (opts.q) p.set("q", opts.q);
  if (opts.assigned_staff_id) p.set("assigned_staff_id", opts.assigned_staff_id);
  if (opts.created_from) p.set("created_from", opts.created_from);
  if (opts.created_to) p.set("created_to", opts.created_to);
  if (opts.waiting_on) p.set("waiting_on", opts.waiting_on);
  if (opts.unread_only === "1") p.set("unread_only", "1");
  if (opts.actionable_only === "1") p.set("actionable_only", "1");
  if (opts.coordinator && opts.coordinator !== "all") p.set("coordinator", opts.coordinator);
  if (opts.tier1_only === "1") p.set("tier1_only", "1");
  const s = p.toString();
  return s ? `/admin/inquiries?${s}` : "/admin/inquiries";
}

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "new", label: "New" },
  { key: "submitted", label: "Submitted" },
  { key: "coordination", label: "Coordination" },
  { key: "offer_pending", label: "Offer" },
  { key: "approved", label: "Approved" },
  { key: "booked", label: "Booked" },
  { key: "rejected", label: "Rejected" },
  { key: "expired", label: "Expired" },
  { key: "closed_lost", label: "Closed" },
  { key: "archived", label: "Archived" },
];

// Map legacy DB status values to their canonical equivalents for display + filtering
const LEGACY_STATUS_ALIASES: Record<string, string> = {
  reviewing: "coordination",
  in_progress: "coordination",
  waiting_for_client: "coordination",
  talent_suggested: "coordination",
  qualified: "coordination",
  converted: "booked",
  closed: "closed_lost",
};

export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<
    QueueUrlFilters & {
      apanel?: string;
      aid?: string;
    }
  >;
}) {
  const {
    status: statusFilter,
    client_user_id: clientUserId,
    client_account_id: clientAccountId,
    q: query = "",
    assigned_staff_id: assignedStaffId,
    created_from: createdFrom = "",
    created_to: createdTo = "",
    waiting_on: waitingOnParam,
    unread_only: unreadOnlyParam,
    actionable_only: actionableOnlyParam,
    coordinator: coordinatorParam,
    tier1_only: tier1OnlyParam,
  } = await searchParams;
  const waitingOn =
    waitingOnParam === "admin" || waitingOnParam === "client" || waitingOnParam === "talent"
      ? waitingOnParam
      : undefined;
  const unreadOnly = unreadOnlyParam === "1";
  const actionableOnly = actionableOnlyParam === "1";
  const tier1Only = tier1OnlyParam === "1";
  const coordinatorFilter =
    coordinatorParam && coordinatorParam !== "all" ? coordinatorParam : undefined;
  const { supabase, tenantId } = await requireAdminTenantGuard();

  let dbQuery = supabase
    .from("inquiries")
    .select(
      `
      id, status, uses_new_engine, contact_name, contact_email, company,
      event_date, event_location, quantity, guest_session_id,
      created_at, updated_at, assigned_staff_id,
      client_user_id, client_account_id, client_contact_id,
      next_action_by, priority,
      client_accounts ( name ),
      client_account_contacts ( full_name ),
      agency_bookings ( id )
    `,
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") {
    // Build list of DB values to match: the canonical value plus any legacy aliases that map to it
    const statusValues = [
      statusFilter,
      ...Object.entries(LEGACY_STATUS_ALIASES)
        .filter(([, canonical]) => canonical === statusFilter)
        .map(([legacy]) => legacy),
    ];
    if (statusValues.length === 1) {
      dbQuery = dbQuery.eq("status", statusValues[0]!);
    } else {
      dbQuery = dbQuery.in("status", statusValues);
    }
  }
  if (clientUserId) dbQuery = dbQuery.eq("client_user_id", clientUserId);
  if (clientAccountId) dbQuery = dbQuery.eq("client_account_id", clientAccountId);
  if (assignedStaffId) dbQuery = dbQuery.eq("assigned_staff_id", assignedStaffId);
  if (createdFrom) dbQuery = dbQuery.gte("created_at", `${createdFrom}T00:00:00`);
  if (createdTo) dbQuery = dbQuery.lte("created_at", `${createdTo}T23:59:59`);

  // Waiting-on maps to canonical `next_action_by` (set by the engine). Admin
  // covers both `admin` and `coordinator` since both are agency-side owners
  // from the queue's triage point of view.
  if (waitingOn === "admin") {
    dbQuery = dbQuery.in("next_action_by", ["admin", "coordinator"]);
  } else if (waitingOn === "client") {
    dbQuery = dbQuery.eq("next_action_by", "client");
  } else if (waitingOn === "talent") {
    dbQuery = dbQuery.eq("next_action_by", "talent");
  }
  // Actionable-only is an admin-side subset of waiting-on=admin. If both are
  // set, the narrower one wins — `.in()` above is already narrow enough.
  if (actionableOnly && !waitingOn) {
    dbQuery = dbQuery.in("next_action_by", ["admin", "coordinator"]);
  }

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
      ? supabase
          .from("client_accounts")
          .select("id, name")
          .eq("tenant_id", tenantId)
          .eq("id", clientAccountId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("app_role", ["super_admin", "agency_staff"])
      .order("display_name", { ascending: true }),
    supabase.auth.getUser(),
    supabase
      .from("client_accounts")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("client_account_contacts")
      .select("id, client_account_id, full_name, client_accounts(name)")
      .eq("tenant_id", tenantId)
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
  const rosterPeek = await loadInquiryRosterPeekMany(
    supabase,
    rowList.map((r) => r.id),
  );

  // Resolve platform client names
  const platformClientIds = [
    ...new Set(rowList.map((r) => r.client_user_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: platformProfiles } =
    platformClientIds.length > 0
      ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", platformClientIds)
      : { data: [] as { id: string; display_name: string | null; avatar_url: string | null }[] };
  const platformNameById = new Map(
    (platformProfiles ?? []).map((p) => [p.id as string, (p.display_name as string | null)?.trim() || null]),
  );
  const platformAvatarById = new Map(
    (platformProfiles ?? []).map((p) => [p.id as string, (p.avatar_url as string | null) ?? null]),
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

  const inquiryIds = rowList.map((r) => r.id);
  const lastMessageAtByInquiry = new Map<string, string>();
  if (inquiryIds.length > 0) {
    const { data: msgRows } = await supabase
      .from("inquiry_messages")
      .select("inquiry_id, created_at")
      .in("inquiry_id", inquiryIds);
    for (const m of msgRows ?? []) {
      const iid = String((m as { inquiry_id: string }).inquiry_id);
      const ca = String((m as { created_at: string }).created_at);
      const prev = lastMessageAtByInquiry.get(iid);
      if (!prev || new Date(ca) > new Date(prev)) lastMessageAtByInquiry.set(iid, ca);
    }
  }

  const hasUnreadByInquiry = new Map<string, boolean>();
  if (currentUserId && inquiryIds.length > 0) {
    const { data: reads } = await supabase
      .from("inquiry_message_reads")
      .select("inquiry_id, last_read_at")
      .eq("user_id", currentUserId)
      .in("inquiry_id", inquiryIds);
    const readLatestByInquiry = new Map<string, string>();
    for (const r of reads ?? []) {
      const iid = String((r as { inquiry_id: string }).inquiry_id);
      const lr = String((r as { last_read_at: string }).last_read_at);
      const prev = readLatestByInquiry.get(iid);
      if (!prev || new Date(lr) > new Date(prev)) readLatestByInquiry.set(iid, lr);
    }
    for (const id of inquiryIds) {
      const lm = lastMessageAtByInquiry.get(id);
      if (!lm) hasUnreadByInquiry.set(id, false);
      else {
        const rd = readLatestByInquiry.get(id);
        hasUnreadByInquiry.set(id, !rd || new Date(lm) > new Date(rd));
      }
    }
  } else {
    for (const id of inquiryIds) hasUnreadByInquiry.set(id, false);
  }

  // Primary coordinators for every inquiry in the list. Canonical source is
  // `inquiry_coordinators` (see `getInquiryCoordinators`) — we run one batched
  // query instead of per-row helper calls. Only primary+active rows count; the
  // unique partial index guarantees at most one per inquiry.
  const primaryCoordByInquiry = new Map<
    string,
    { user_id: string; display_name: string | null }
  >();
  if (inquiryIds.length > 0) {
    const { data: coordRows, error: coordErr } = await supabase
      .from("inquiry_coordinators")
      .select("inquiry_id, user_id, role, status, profiles:user_id(display_name)")
      .in("inquiry_id", inquiryIds)
      .eq("role", "primary")
      .eq("status", "active");
    if (coordErr) {
      logServerError("admin/inquiries/primaryCoordinators", coordErr);
    } else {
      for (const row of coordRows ?? []) {
        const profile = relOne(
          (row as { profiles: { display_name: string | null } | { display_name: string | null }[] | null }).profiles,
        );
        primaryCoordByInquiry.set(String((row as { inquiry_id: string }).inquiry_id), {
          user_id: String((row as { user_id: string }).user_id),
          display_name: profile?.display_name ?? null,
        });
      }
    }
  }

  // Coordinator filter options: every staff profile that currently holds a
  // primary role on at least one inquiry in the admin's visible set, unioned
  // with the general staff directory. Keeps the dropdown short but complete.
  const coordinatorChoiceById = new Map<string, string>();
  for (const s of staffRes.data ?? []) {
    coordinatorChoiceById.set(
      String(s.id),
      (s.display_name as string | null)?.trim() || String(s.id).slice(0, 8),
    );
  }

  const scopedClientName = clientFilterRes.data?.display_name as string | null | undefined;
  const scopedAccountName = accountFilterRes.data?.name as string | null | undefined;

  const inquiryNavBase: QueueUrlFilters = {
    client_user_id: clientUserId,
    client_account_id: clientAccountId,
    q: trimmedQuery || undefined,
    assigned_staff_id: assignedStaffId || undefined,
    created_from: createdFrom || undefined,
    created_to: createdTo || undefined,
    waiting_on: waitingOn,
    unread_only: unreadOnly ? "1" : undefined,
    actionable_only: actionableOnly ? "1" : undefined,
    coordinator: coordinatorFilter,
    tier1_only: tier1Only ? "1" : undefined,
  };

  function nextActionSortKey(v: string | null): number {
    if (!v) return 99;
    const order: Record<string, number> = { coordinator: 0, admin: 1, client: 2, talent: 3, system: 4 };
    return order[v] ?? 50;
  }

  // Shape rows for the queue component (then sort: unread first, then next_action_by, then recency)
  const queueRowsRaw: InquiryQueueRow[] = rowList.map((row) => {
    const peek = rosterPeek.get(row.id);
    const talentPeek = peek
      ? { line: peek.labelLine, count: peek.count }
      : inquiryTalentPeekFallback();
    const has_unread = hasUnreadByInquiry.get(row.id) ?? false;
    const linked_booking_count = Array.isArray(row.agency_bookings) ? row.agency_bookings.length : 0;
    const actionable =
      row.next_action_by === "admin" || row.next_action_by === "coordinator";
    // Tier-1 union (spec §7.2). Phase-1 rollup: unread messages + actionable
    // by agency + ready-to-convert (status=approved with no booking yet) +
    // cancelled (status=rejected|expired|closed_lost is terminal, skip). The
    // 72h talent-response threshold (§7.2 #3) lives in the per-inquiry
    // derivation and isn't surfaced in the queue badge today — a queue-wide
    // recount is Tier-2 scope.
    const readyToConvert = row.status === "approved" && linked_booking_count === 0;
    const has_tier1_alert = has_unread || actionable || readyToConvert;
    const primary = primaryCoordByInquiry.get(row.id) ?? null;
    return {
      id: row.id,
      status: row.status,
      contact_name: row.contact_name,
      contact_email: row.contact_email,
      contact_avatar_url: row.client_user_id ? platformAvatarById.get(row.client_user_id) ?? null : null,
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
      next_action_by: row.next_action_by ?? null,
      priority: row.priority ?? null,
      has_unread,
      client_account_name: relOne(row.client_accounts as { name: string } | { name: string }[] | null)?.name ?? null,
      linked_contact_name:
        relOne(row.client_account_contacts as { full_name: string } | { full_name: string }[] | null)?.full_name ?? null,
      platform_client_name: row.client_user_id ? platformNameById.get(row.client_user_id) ?? null : null,
      assigned_staff_display: row.assigned_staff_id ? staffMap.get(row.assigned_staff_id) ?? null : null,
      talent_line: talentPeek.line,
      talent_count: talentPeek.count,
      linked_booking_count,
      updated_at_display: formatAdminTimestamp(row.updated_at),
      primary_coordinator_id: primary?.user_id ?? null,
      primary_coordinator_display: primary?.display_name ?? null,
      actionable,
      has_tier1_alert,
    };
  });

  // Post-query filters that can't be expressed cleanly in SQL against the
  // existing joins. Kept small — heavy filters (status, waiting_on, assignment,
  // date, scope) stay in SQL so paging can be added later without refactoring.
  const queueRows = queueRowsRaw.filter((r) => {
    if (unreadOnly && !r.has_unread) return false;
    if (actionableOnly && !r.actionable) return false;
    if (tier1Only && !r.has_tier1_alert) return false;
    if (coordinatorFilter) {
      if (coordinatorFilter === "mine") {
        if (!currentUserId || r.primary_coordinator_id !== currentUserId) return false;
      } else if (coordinatorFilter === "unassigned") {
        if (r.primary_coordinator_id) return false;
      } else {
        if (r.primary_coordinator_id !== coordinatorFilter) return false;
      }
    }
    return true;
  });

  queueRows.sort((a, b) => {
    if (a.has_unread !== b.has_unread) return a.has_unread ? -1 : 1;
    const da = nextActionSortKey(a.next_action_by);
    const db = nextActionSortKey(b.next_action_by);
    if (da !== db) return da - db;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const hasActiveFilters = Boolean(
    trimmedQuery ||
      assignedStaffId ||
      createdFrom ||
      createdTo ||
      waitingOn ||
      unreadOnly ||
      actionableOnly ||
      tier1Only ||
      coordinatorFilter,
  );
  const filterActiveCount =
    (trimmedQuery ? 1 : 0) +
    (assignedStaffId ? 1 : 0) +
    (createdFrom ? 1 : 0) +
    (createdTo ? 1 : 0) +
    (waitingOn ? 1 : 0) +
    (unreadOnly ? 1 : 0) +
    (actionableOnly ? 1 : 0) +
    (tier1Only ? 1 : 0) +
    (coordinatorFilter ? 1 : 0);

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
                  <li>Each row is a lead — not confirmed work yet. Use &ldquo;New request&rdquo; for phone intake.</li>
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
      <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px_160px_140px_140px_auto] md:items-end">
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
          <label htmlFor="coordinator" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Coordinator
          </label>
          <select
            id="coordinator"
            name="coordinator"
            defaultValue={coordinatorFilter ?? ""}
            className={ADMIN_FORM_CONTROL}
          >
            <option value="">All</option>
            <option value="mine">Mine</option>
            <option value="unassigned">Unassigned</option>
            <optgroup label="Staff">
              {[...coordinatorChoiceById.entries()].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="waiting_on" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Waiting on
          </label>
          <select
            id="waiting_on"
            name="waiting_on"
            defaultValue={waitingOn ?? ""}
            className={ADMIN_FORM_CONTROL}
          >
            <option value="">Anyone</option>
            <option value="admin">Admin / Coordinator</option>
            <option value="client">Client</option>
            <option value="talent">Talent</option>
          </select>
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
          {unreadOnly ? <input type="hidden" name="unread_only" value="1" /> : null}
          {actionableOnly ? <input type="hidden" name="actionable_only" value="1" /> : null}
          {tier1Only ? <input type="hidden" name="tier1_only" value="1" /> : null}
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
      {/* Boolean toggle chips. These sit alongside the form because they're
          state-driven and URL-based rather than form fields — clicking toggles
          the param off/on while preserving everything else. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Quick filters
        </span>
        {(
          [
            { key: "unread_only", label: "Unread only", active: unreadOnly },
            { key: "actionable_only", label: "Actionable only", active: actionableOnly },
            { key: "tier1_only", label: "Needs attention", active: tier1Only },
          ] as const
        ).map((chip) => {
          const nextNav: QueueUrlFilters = {
            ...inquiryNavBase,
            status: statusFilter && statusFilter !== "all" ? statusFilter : undefined,
            [chip.key]: chip.active ? undefined : "1",
          };
          return (
            <Link
              key={chip.key}
              href={buildAdminInquiriesHref(nextNav)}
              scroll={false}
              aria-pressed={chip.active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-colors",
                chip.active
                  ? "border-[var(--impronta-gold)]/60 bg-[var(--impronta-gold)]/10 text-foreground"
                  : "border-border/50 bg-background/60 text-muted-foreground hover:border-[var(--impronta-gold)]/40 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "inline-block size-2 rounded-full",
                  chip.active ? "bg-[var(--impronta-gold)]" : "bg-muted-foreground/40",
                )}
                aria-hidden
              />
              {chip.label}
            </Link>
          );
        })}
      </div>
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
