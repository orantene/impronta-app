"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { AdminInquiryListRowActions } from "@/components/admin/admin-inquiry-list-row-actions";
import { AdminInquiryPeekTrigger } from "@/components/admin/admin-inquiry-peek-sheet";
import { AdminResponsiveTable, type AdminResponsiveTableColumn } from "@/components/admin/admin-responsive-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  new: "New",
  submitted: "Submitted",
  reviewing: "Reviewing",
  coordination: "Coordination",
  offer_pending: "Offer pending",
  approved: "Approved",
  booked: "Booked",
  rejected: "Rejected",
  expired: "Expired",
  waiting_for_client: "Waiting",
  talent_suggested: "Suggested",
  in_progress: "In progress",
  qualified: "Qualified",
  converted: "Converted",
  closed: "Closed",
  closed_lost: "Lost",
  archived: "Archived",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function nextActionLabel(v: string | null): string {
  if (!v) return "—";
  const m: Record<string, string> = {
    client: "Client",
    coordinator: "Coordinator",
    admin: "Admin",
    talent: "Talent",
    system: "System",
  };
  return m[v] ?? v;
}

export type InquiryQueueRow = {
  id: string;
  status: string;
  contact_name: string;
  contact_email: string;
  contact_avatar_url: string | null;
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
  has_unread: boolean;
  client_account_name: string | null;
  linked_contact_name: string | null;
  platform_client_name: string | null;
  assigned_staff_display: string | null;
  talent_line: string;
  talent_count: number;
  linked_booking_count: number;
  updated_at_display: string;
  /** Primary+active coordinator user id, or null if unassigned. Canonical via `inquiry_coordinators`. */
  primary_coordinator_id: string | null;
  /** Resolved display name for the primary coordinator (via `profiles.display_name`). */
  primary_coordinator_display: string | null;
  /** `next_action_by` ∈ {admin, coordinator}. Drives the Actionable toggle + row tint (spec §6.2). */
  actionable: boolean;
  /** Union of unread + actionable + ready-to-convert. Drives the sidebar Tier-1 badge click-through (spec §7.2). */
  has_tier1_alert: boolean;
};

export function AdminInquiryQueue({
  rows,
  currentUserId,
}: {
  rows: InquiryQueueRow[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const go = (id: string) => router.push(`/admin/inquiries/${id}`);
  const prefetch = (id: string) => router.prefetch(`/admin/inquiries/${id}`);

  const columns = useMemo((): AdminResponsiveTableColumn<InquiryQueueRow>[] => {
    return [
      {
        id: "contact",
        label: "Contact",
        priority: "high",
        cell: (row) => (
          <div className="flex items-center gap-3" onMouseEnter={() => prefetch(row.id)} onFocus={() => prefetch(row.id)}>
            <UserAvatar src={row.contact_avatar_url} name={row.contact_name} size="md" />
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate font-display text-[15px] tracking-tight text-foreground",
                  row.has_unread ? "font-semibold" : "font-medium",
                )}
              >
                {row.contact_name}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.contact_email}</p>
            </div>
          </div>
        ),
      },
      {
        id: "status",
        label: "Status",
        priority: "high",
        cell: (row) => (
          <div>
            <AdminCommercialStatusBadge kind="inquiry" status={row.status} className="text-[10px]">
              {STATUS_LABEL[row.status] ?? row.status}
            </AdminCommercialStatusBadge>
            {row.assigned_staff_display ? (
              <p className="mt-1 text-[10px] text-muted-foreground">{row.assigned_staff_display}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "waiting_on",
        label: "Waiting on",
        priority: "high",
        cell: (row) => (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              row.actionable
                ? "border-[var(--impronta-gold)]/50 bg-[var(--impronta-gold)]/10 text-foreground"
                : "border-border/40 bg-background/60 text-muted-foreground",
            )}
            title={row.actionable ? "Admin or coordinator action required" : undefined}
          >
            {nextActionLabel(row.next_action_by)}
          </span>
        ),
      },
      {
        id: "coordinator",
        label: "Coordinator",
        priority: "high",
        cell: (row) =>
          row.primary_coordinator_display ? (
            <span className="truncate text-xs text-foreground">{row.primary_coordinator_display}</span>
          ) : row.primary_coordinator_id ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {row.primary_coordinator_id.slice(0, 8)}
            </span>
          ) : (
            <span className="text-[11px] italic text-muted-foreground">Unassigned</span>
          ),
      },
      {
        id: "unread",
        label: " ",
        priority: "high",
        headerClassName: "w-10",
        cellClassName: "w-10",
        cell: (row) =>
          row.has_unread ? (
            <span className="inline-block size-2.5 rounded-full bg-sky-500 shadow-sm" title="Unread messages" />
          ) : (
            <span className="inline-block size-2.5 rounded-full bg-transparent" aria-hidden />
          ),
      },
      {
        id: "updated",
        label: "Updated",
        priority: "high",
        cell: (row) => <span className="text-xs text-muted-foreground">{relativeTime(row.updated_at)}</span>,
      },
      {
        id: "priority",
        label: "Priority",
        priority: "low",
        cell: (row) => (
          <span className="text-xs capitalize text-muted-foreground">{row.priority?.replace(/_/g, " ") ?? "—"}</span>
        ),
      },
      {
        id: "client_loc",
        label: "Client / Location",
        priority: "low",
        cell: (row) => {
          const clientLabel =
            row.client_account_name ??
            row.linked_contact_name ??
            row.platform_client_name ??
            row.company ??
            null;
          return (
            <div className="max-w-[200px]">
              {clientLabel ? <p className="truncate text-sm text-foreground">{clientLabel}</p> : <span className="text-xs text-muted-foreground">—</span>}
              {row.event_location ? (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.event_location}</p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "talent",
        label: "Talent",
        priority: "low",
        cell: (row) =>
          row.talent_count > 0 ? (
            <span className="tabular-nums text-sm font-medium text-foreground">
              {row.talent_count}
              <span className="ml-1 text-xs font-normal text-muted-foreground">{row.talent_count === 1 ? "model" : "models"}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">None yet</span>
          ),
      },
      {
        id: "bookings",
        label: "Bookings",
        priority: "low",
        cell: (row) =>
          row.linked_booking_count > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {row.linked_booking_count}
              {row.linked_booking_count === 1 ? " booking" : " bookings"}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        label: "Actions",
        priority: "low",
        cell: (row) => (
          <div data-stop-row-nav className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-xl border-[var(--impronta-gold)]/35 bg-background/90 text-[var(--impronta-gold)] shadow-sm hover:bg-[var(--impronta-gold)]/10"
              asChild
            >
              <Link href={`/admin/inquiries/${row.id}`} aria-label="Open inquiry">
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <AdminInquiryPeekTrigger
              currentUserId={currentUserId}
              summary={{
                id: row.id,
                status: row.status,
                statusLabel: STATUS_LABEL[row.status] ?? row.status,
                contact_name: row.contact_name,
                contact_email: row.contact_email,
                company: row.company,
                event_date: row.event_date,
                event_location: row.event_location,
                quantity: row.quantity,
                guest_session_id: row.guest_session_id,
                created_at: row.created_at,
                assigned_staff_id: row.assigned_staff_id,
                assigned_staff_display: row.assigned_staff_display,
                client_user_id: row.client_user_id,
                platform_client_name: row.platform_client_name,
                client_account_id: row.client_account_id,
                client_account_name: row.client_account_name,
                linked_contact_name: row.linked_contact_name,
                talent_line: row.talent_line,
                talent_count: row.talent_count,
                linked_booking_count: row.linked_booking_count,
                updated_at_display: row.updated_at_display,
              }}
            />
            <AdminInquiryListRowActions
              inquiryId={row.id}
              status={row.status}
              assignedStaffId={row.assigned_staff_id}
              currentUserId={currentUserId}
              buildDuplicateHref={`/admin/inquiries/${row.id}#duplicate-inquiry`}
              buildFilterByAccountHref={
                row.client_account_id ? `/admin/inquiries?client_account_id=${encodeURIComponent(row.client_account_id)}` : null
              }
              clientAccountId={row.client_account_id}
            />
          </div>
        ),
      },
    ];
  }, [currentUserId]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No requests match this view"
        description="Try another status tab or clear filters."
        className="rounded-2xl border-dashed py-10"
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/45 bg-card/50 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.35)] p-2 md:p-3">
      <AdminResponsiveTable<InquiryQueueRow>
        aria-label="Inquiry requests"
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        emptyMessage="No rows."
        onRowClick={(row) => go(row.id)}
        getRowAriaLabel={(row) => `Open inquiry from ${row.contact_name}`}
      />
    </div>
  );
}
