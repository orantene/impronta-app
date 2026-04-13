import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarRange, ChevronRight, Layers3, Waypoints } from "lucide-react";
import { BookingHeaderForm } from "@/app/(dashboard)/admin/bookings/[id]/booking-header-form";
import { BookingTalentGrid } from "@/app/(dashboard)/admin/bookings/[id]/booking-talent-grid";
import { DuplicateBookingForm } from "@/app/(dashboard)/admin/bookings/[id]/duplicate-booking-form";
import {
  BookingPortalVisibilityExplainer,
  BookingSnapshotDriftCallout,
} from "@/components/admin/booking-commercial-callouts";
import { BookingAccountContactReassignInline, BookingCommercialReassignBar } from "@/components/admin/admin-commercial-reassign";
import { BookingCommercialCrmSheets } from "@/components/admin/admin-inline-commercial-sheets";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { AdminCopyEntityIdButton } from "@/components/admin/admin-copy-entity-id-button";
import { BookingHeaderManagerSelect } from "@/components/admin/booking-header-manager-select";
import { CommercialActivityPanel } from "@/components/admin/commercial-activity-panel";
import { AdminFutureWorkspaceSlot } from "@/components/admin/admin-entity-context";
import { Button } from "@/components/ui/button";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  ADMIN_OUTLINE_CONTROL_CLASS,
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import { formatAdminTimestamp } from "@/lib/admin/format-admin-timestamp";
import { BOOKING_AUDIT } from "@/lib/commercial-audit-events";
import { mapRawActivityRows } from "@/lib/commercial-activity-summary";
import { cn } from "@/lib/utils";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { ChevronDown } from "lucide-react";
import type React from "react";

function one<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function marginPercent(revenue: number, cost: number): string {
  if (!revenue || revenue === 0) return "—";
  const pct = ((revenue - cost) / revenue) * 100;
  return `${Math.round(pct)}%`;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function SecondarySection({
  id,
  title,
  description,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  id?: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group rounded-[1.7rem] border border-border/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.62),rgba(247,244,237,0.48))] shadow-sm open:border-[var(--impronta-gold-border)]/45"
    >
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--impronta-gold-border)]/65 bg-[var(--impronta-gold-muted)] text-[var(--impronta-gold)] shadow-sm">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/75 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" />
          </div>
        </div>
      </summary>
      <div className="border-t border-border/40 px-5 py-5">{children}</div>
    </details>
  );
}

export default async function AdminBookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dup_err?: string }>;
}) {
  const { id } = await params;
  const { dup_err: dupErr } = await searchParams;
  const supabase = await getCachedServerSupabase();
  if (!supabase) notFound();

  const { data: booking, error } = await supabase
    .from("agency_bookings")
    .select(
      `
      id,
      title,
      status,
      starts_at,
      ends_at,
      notes,
      internal_notes,
      client_summary,
      currency_code,
      payment_method,
      payment_status,
      payment_notes,
      total_client_revenue,
      total_talent_cost,
      gross_profit,
      source_inquiry_id,
      client_account_id,
      client_contact_id,
      client_user_id,
      owner_staff_id,
      contact_name,
      contact_email,
      contact_phone,
      client_account_name,
      client_account_type,
      event_type_id,
      event_date,
      venue_name,
      venue_address,
      venue_location_text,
      client_accounts ( id, name, account_type, primary_email ),
      client_account_contacts ( id, full_name, email, phone ),
      client_visible_at
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !booking) notFound();

  const [
    { data: lines },
    { data: staff },
    { data: talentOptions },
    inquiryRes,
    { data: accountRows },
    { data: contactRowsRaw },
    { data: bookingLogs },
    { data: contactPortalRow },
    { data: platformClientProfile },
    { data: clientPickerProfiles },
    { data: recentInquiriesForSource },
  ] = await Promise.all([
    supabase
      .from("booking_talent")
      .select(
        "id, talent_profile_id, talent_name_snapshot, profile_code_snapshot, role_label, pricing_unit, units, talent_cost_rate, client_charge_rate, talent_cost_total, client_charge_total, gross_profit, notes",
      )
      .eq("booking_id", id)
      .order("sort_order", { ascending: true }),
    supabase.from("profiles").select("id, display_name").in("app_role", ["super_admin", "agency_staff"]),
    supabase
      .from("talent_profiles")
      .select("id, profile_code, display_name")
      .is("deleted_at", null)
      .order("profile_code", { ascending: true })
      .limit(400),
    booking.source_inquiry_id
      ? supabase.from("inquiries").select("id, contact_name, status, created_at, client_user_id").eq("id", booking.source_inquiry_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("client_accounts").select("id, name").is("archived_at", null).order("name", { ascending: true }),
    supabase
      .from("client_account_contacts")
      .select("id, client_account_id, full_name, client_accounts(name)")
      .is("archived_at", null)
      .order("full_name", { ascending: true }),
    supabase
      .from("booking_activity_log")
      .select("id, event_type, payload, created_at, actor_user_id")
      .eq("booking_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    booking.client_contact_id
      ? supabase.from("client_account_contacts").select("profile_user_id").eq("id", booking.client_contact_id).maybeSingle()
      : Promise.resolve({ data: null }),
    booking.client_user_id
      ? supabase.from("profiles").select("id, display_name").eq("id", booking.client_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profiles").select("id, display_name").eq("app_role", "client").order("display_name", { ascending: true }).limit(500),
    supabase.from("inquiries").select("id, contact_name, created_at").order("created_at", { ascending: false }).limit(120),
  ]);

  type ContactRow = {
    id: string;
    client_account_id: string;
    full_name: string;
    client_accounts: { name: string } | { name: string }[] | null;
  };
  const contactOptions = (contactRowsRaw ?? []).map((row: ContactRow) => {
    const acc = row.client_accounts;
    const accName = Array.isArray(acc) ? acc[0]?.name : acc?.name;
    return { id: row.id, client_account_id: row.client_account_id, label: accName ? `${row.full_name} · ${accName}` : row.full_name };
  });

  const inquiry = inquiryRes.data;
  const acc = one(booking.client_accounts as unknown as { id: string; name: string; account_type?: string; primary_email?: string | null } | null);
  const contact = one(booking.client_account_contacts as unknown as { id: string; full_name: string; email?: string | null; phone?: string | null } | null);

  const revenue = Number(booking.total_client_revenue);
  const cost = Number(booking.total_talent_cost);
  const profit = Number(booking.gross_profit);
  const talentCount = Array.isArray(lines) ? lines.length : 0;
  const currency = booking.currency_code || "USD";

  const logActorIds = [...new Set((bookingLogs ?? []).map((l) => l.actor_user_id).filter(Boolean))] as string[];
  const { data: logActors } =
    logActorIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", logActorIds)
      : { data: [] as { id: string; display_name: string | null }[] };
  const actorDisplayById = new Map((logActors ?? []).map((p) => [p.id, p.display_name?.trim() || "Staff"]));
  const activityEntries = mapRawActivityRows(
    (bookingLogs ?? []) as { id: string; created_at: string; event_type: string; payload: unknown; actor_user_id: string | null }[],
    actorDisplayById,
  );

  const contactHasPortalUser = !!contactPortalRow?.profile_user_id;
  const ownerLabel = booking.owner_staff_id
    ? ((staff ?? []).find((s) => s.id === booking.owner_staff_id)?.display_name ?? "Manager")
    : "Unassigned";

  const clientOptionsForReassign = (clientPickerProfiles ?? []).map((p) => ({
    id: p.id as string,
    display_name: (p.display_name as string | null) ?? null,
  }));
  const inquiryOptionsForReassign = (recentInquiriesForSource ?? []).map((r) => ({
    id: r.id as string,
    label: `${(r.contact_name as string) || "Request"} · ${new Date(r.created_at as string).toLocaleDateString()} · ${String(r.id).slice(0, 8)}…`,
  }));

  const lastBkStatusLog = (bookingLogs ?? []).find((l) => l.event_type === BOOKING_AUDIT.STATUS_CHANGED);

  return (
    <div className={ADMIN_PAGE_STACK}>

      {/* ── Breadcrumb ─────────────────────────────────────────── */}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/admin/bookings" scroll={false} className="flex items-center gap-1 hover:text-[var(--impronta-gold)] hover:underline underline-offset-4">
          <ArrowLeft className="size-3.5" aria-hidden />
          Bookings
        </Link>
        {inquiry ? (
          <>
            <ChevronRight className="size-3 opacity-40" aria-hidden />
            <Link href={`/admin/inquiries/${inquiry.id}`} scroll={false} className="hover:text-[var(--impronta-gold)] hover:underline underline-offset-4">
              {inquiry.contact_name ? `Request: ${inquiry.contact_name}` : "Source request"}
            </Link>
          </>
        ) : null}
        <ChevronRight className="size-3 opacity-40" aria-hidden />
        <span className="max-w-[180px] truncate text-foreground/80">{booking.title}</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/45 bg-card/60 px-6 py-5 shadow-sm">
        {/* Top meta */}
        <div className="flex flex-wrap items-center gap-2">
          <AdminCommercialStatusBadge kind="booking" status={booking.status} className="px-3 py-1 text-sm" />
          <span className="rounded-full border border-border/50 bg-muted/20 px-2.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
            {booking.payment_status.replace(/_/g, " ")}
          </span>
          <span className="rounded-full border border-border/50 bg-muted/20 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {currency}
          </span>
          <span className="rounded-full border border-border/50 bg-muted/20 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {ownerLabel}
          </span>
          {lastBkStatusLog?.created_at ? (
            <span className="ml-auto text-[11px] text-muted-foreground/70">
              Updated {relativeTime(String(lastBkStatusLog.created_at))}
            </span>
          ) : null}
          <AdminCopyEntityIdButton id={booking.id} />
        </div>

        {/* Title */}
        <h1 className="mt-3 font-display text-xl font-semibold tracking-tight text-foreground">
          {booking.title}
        </h1>

        {/* Location + venue */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          {acc?.name ? (
            <Link href={`/admin/accounts/${booking.client_account_id}`} scroll={false} className="font-medium text-foreground/80 hover:text-[var(--impronta-gold)] hover:underline underline-offset-4">
              {acc.name}
            </Link>
          ) : null}
          {contact?.full_name ? <span>{contact.full_name}</span> : null}
          {booking.venue_name ? <span>{booking.venue_name}</span> : null}
          {booking.venue_location_text ? <span>{booking.venue_location_text}</span> : null}
        </div>

        {/* Source inquiry + platform client */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
          {inquiry ? (
            <Link href={`/admin/inquiries/${inquiry.id}`} scroll={false} className="text-[var(--impronta-gold)] underline-offset-4 hover:underline">
              Request: {inquiry.contact_name || "Source inquiry"}
            </Link>
          ) : null}
          {platformClientProfile?.display_name ? (
            <Link href={`/admin/clients/${booking.client_user_id}`} scroll={false} className="text-sm text-muted-foreground hover:text-[var(--impronta-gold)] hover:underline underline-offset-4">
              Client: {platformClientProfile.display_name as string}
            </Link>
          ) : null}
        </div>

        {/* KPI strip */}
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-border/35 pt-4 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Revenue</span>
            <span className="font-display text-2xl font-semibold tabular-nums text-[var(--impronta-gold)]">
              {revenue > 0 ? formatCurrency(revenue, currency) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Cost</span>
            <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
              {cost > 0 ? formatCurrency(cost, currency) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Margin</span>
            <span className={cn(
              "font-display text-2xl font-semibold tabular-nums",
              profit > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
            )}>
              {profit > 0 ? marginPercent(revenue, cost) : "—"}
            </span>
            {profit > 0 ? (
              <span className="text-[11px] text-muted-foreground">{formatCurrency(profit, currency)} profit</span>
            ) : null}
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl border border-border/40 bg-background/60 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Talent</span>
            <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
              {talentCount}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {talentCount === 1 ? "on lineup" : "on lineup"}
            </span>
          </div>
        </div>

        {/* Quick reassign inline */}
        <div className="mt-4 border-t border-border/35 pt-3">
          <BookingAccountContactReassignInline
            bookingId={booking.id}
            clientAccountId={booking.client_account_id}
            clientContactId={booking.client_contact_id}
            accounts={(accountRows ?? []).map((r) => ({ id: String((r as { id: string }).id), name: String((r as { name: string }).name) }))}
            contacts={contactOptions}
          />
        </div>
      </div>

      {/* Drift warning */}
      <BookingSnapshotDriftCallout
        accountLinkedName={acc?.name ?? null}
        accountSnapshotName={booking.client_account_name}
        contactLinkedName={contact?.full_name ?? null}
        contactSnapshotName={booking.contact_name}
        contactSnapshotEmail={booking.contact_email}
        contactLinkedEmail={contact?.email ?? null}
      />

      {/* ── Summary & operations ──────────────────────────────── */}
      <DashboardSectionCard
        title="Summary & operations"
        description="Status, manager, schedule, venue, payment, and notes."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <BookingHeaderManagerSelect
              bookingId={booking.id}
              status={booking.status}
              ownerStaffId={booking.owner_staff_id}
              staffOptions={(staff ?? []).map((s) => ({ id: s.id as string, display_name: (s.display_name as string | null) ?? null }))}
            />
          </div>
        }
      >
        {dupErr ? (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {(() => { try { return decodeURIComponent(dupErr); } catch { return dupErr; } })()}
          </p>
        ) : null}
        <BookingHeaderForm
          booking={{
            id: booking.id,
            title: booking.title,
            status: booking.status,
            owner_staff_id: booking.owner_staff_id,
            payment_method: booking.payment_method,
            payment_status: booking.payment_status,
            payment_notes: booking.payment_notes,
            internal_notes: booking.internal_notes,
            client_summary: booking.client_summary,
            currency_code: booking.currency_code,
            starts_at: booking.starts_at,
            ends_at: booking.ends_at,
            event_date: booking.event_date,
            venue_name: booking.venue_name,
            venue_location_text: booking.venue_location_text,
            client_account_id: booking.client_account_id,
            client_contact_id: booking.client_contact_id,
            client_visible_at: booking.client_visible_at ?? null,
          }}
          staff={staff ?? []}
          accounts={accountRows ?? []}
          contacts={contactOptions}
        />
      </DashboardSectionCard>

      {/* ── Lineup & pricing ─────────────────────────────────── */}
      <DashboardSectionCard
        title="Lineup & pricing"
        description="Per-talent rates and units. Save each row to recalculate totals."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <BookingTalentGrid
          bookingId={booking.id}
          lines={(lines ?? []) as never}
          talentOptions={(talentOptions ?? []) as { id: string; profile_code: string; display_name: string | null }[]}
          currencyCode={booking.currency_code}
          headerTotals={{ total_talent_cost: cost, total_client_revenue: revenue, gross_profit: profit }}
        />
      </DashboardSectionCard>

      {/* ── CRM reassign ─────────────────────────────────────── */}
      <SecondarySection
        title="Reassign links"
        description="Change Client Location, contact, portal client, or source request. Snapshots can be refreshed on save."
        icon={CalendarRange}
        defaultOpen={false}
      >
        <div className="space-y-4">
          <BookingCommercialCrmSheets
            bookingId={booking.id}
            clientAccountId={booking.client_account_id}
            linkedAccountName={acc?.name ?? null}
            accountOptions={(accountRows ?? []).map((r) => ({
              id: String((r as { id: string }).id),
              name: String((r as { name: string }).name),
            }))}
          />
          <BookingCommercialReassignBar
            bookingId={booking.id}
            clientUserId={booking.client_user_id}
            clientAccountId={booking.client_account_id}
            clientContactId={booking.client_contact_id}
            sourceInquiryId={booking.source_inquiry_id}
            accounts={(accountRows ?? []).map((r) => ({ id: String((r as { id: string }).id), name: String((r as { name: string }).name) }))}
            contacts={contactOptions}
            clientOptions={clientOptionsForReassign}
            inquiryOptions={inquiryOptionsForReassign}
          />
        </div>
      </SecondarySection>

      {/* ── Activity ─────────────────────────────────────────── */}
      <SecondarySection
        title="Activity log"
        description="Status changes, reassigns, and operational events."
        icon={Waypoints}
        defaultOpen={false}
      >
        <CommercialActivityPanel
          title="Booking activity"
          description={lastBkStatusLog?.created_at ? `Last status change ${formatAdminTimestamp(String(lastBkStatusLog.created_at))}` : null}
          entries={activityEntries}
        />
      </SecondarySection>

      {/* ── Portal visibility ────────────────────────────────── */}
      <SecondarySection
        title="Client portal visibility"
        description="Who can see this booking in the client portal (RLS rules)."
        icon={CalendarRange}
        defaultOpen={false}
      >
        <BookingPortalVisibilityExplainer
          clientVisibleAt={booking.client_visible_at ?? null}
          sourceInquiryId={booking.source_inquiry_id}
          clientUserId={booking.client_user_id}
          contactHasPortalUser={contactHasPortalUser}
        />
      </SecondarySection>

      {/* ── Duplicate ────────────────────────────────────────── */}
      <SecondarySection
        id="duplicate-booking"
        title="Duplicate booking"
        description="Copy this job into a new booking and adjust the copy."
        icon={Layers3}
        defaultOpen={false}
      >
        <DuplicateBookingForm
          sourceBookingId={booking.id}
          defaultTitle={`${booking.title} (copy)`}
          accounts={accountRows ?? []}
          contacts={contactOptions}
        />
      </SecondarySection>

      <AdminFutureWorkspaceSlot />
    </div>
  );
}
