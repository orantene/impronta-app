"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { AdminInquiryListRowActions } from "@/components/admin/admin-inquiry-list-row-actions";
import { AdminInquiryPeekTrigger } from "@/components/admin/admin-inquiry-peek-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  reviewing: "Reviewing",
  waiting_for_client: "Waiting",
  talent_suggested: "Suggested",
  in_progress: "In progress",
  qualified: "Qualified",
  converted: "Converted",
  closed: "Closed",
  closed_lost: "Lost",
  archived: "Archived",
};

function getInitials(name: string | null): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

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

export type InquiryQueueRow = {
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
  // resolved server-side
  client_account_name: string | null;
  linked_contact_name: string | null;
  platform_client_name: string | null;
  assigned_staff_display: string | null;
  talent_line: string;
  talent_count: number;
  linked_booking_count: number;
  updated_at_display: string;
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

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border/60 bg-muted/[0.04] px-4 py-10 text-center text-sm text-muted-foreground">
        No requests match this view.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/45 bg-card/50 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.35)]">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-gradient-to-b from-muted/35 to-muted/10">
          <tr className="border-b border-border/45">
            <th className="px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Contact
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:table-cell">
              Status
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground md:table-cell">
              Client / Location
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground lg:table-cell">
              Talent
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground lg:table-cell">
              Bookings
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground xl:table-cell">
              Received
            </th>
            <th className="px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/25">
          {rows.map((row) => {
            const clientLabel =
              row.client_account_name ??
              row.linked_contact_name ??
              row.platform_client_name ??
              row.company ??
              null;

            return (
              <tr
                key={row.id}
                className={cn(
                  "cursor-pointer transition-[background-color,box-shadow] duration-150",
                  "hover:bg-[var(--impronta-gold)]/[0.06] hover:shadow-[inset_3px_0_0_0_var(--impronta-gold)]",
                )}
                onMouseEnter={() => prefetch(row.id)}
                onFocus={() => prefetch(row.id)}
                onClick={() => go(row.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    go(row.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Open inquiry from ${row.contact_name}`}
              >
                {/* Contact */}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--impronta-gold)]/12 font-display text-[13px] font-semibold text-[var(--impronta-gold)]"
                    >
                      {getInitials(row.contact_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-display text-[15px] font-medium tracking-tight text-foreground">
                        {row.contact_name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {row.contact_email}
                      </p>
                      {/* Status pill on mobile */}
                      <div className="mt-1.5 sm:hidden">
                        <AdminCommercialStatusBadge kind="inquiry" status={row.status} className="text-[10px]">
                          {STATUS_LABEL[row.status] ?? row.status}
                        </AdminCommercialStatusBadge>
                      </div>
                    </div>
                  </div>
                </td>

                {/* Status */}
                <td className="hidden px-4 py-3.5 sm:table-cell">
                  <AdminCommercialStatusBadge kind="inquiry" status={row.status}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </AdminCommercialStatusBadge>
                  {row.assigned_staff_display && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {row.assigned_staff_display}
                    </p>
                  )}
                </td>

                {/* Client / Location */}
                <td className="hidden max-w-[180px] px-4 py-3.5 md:table-cell">
                  {clientLabel ? (
                    <p className="truncate text-sm text-foreground">{clientLabel}</p>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                  {row.event_location && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {row.event_location}
                    </p>
                  )}
                </td>

                {/* Talent */}
                <td className="hidden px-4 py-3.5 lg:table-cell">
                  {row.talent_count > 0 ? (
                    <div>
                      <span className="tabular-nums text-sm font-medium text-foreground">
                        {row.talent_count}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {row.talent_count === 1 ? "model" : "models"}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">None yet</span>
                  )}
                </td>

                {/* Bookings */}
                <td className="hidden px-4 py-3.5 lg:table-cell">
                  {row.linked_booking_count > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {row.linked_booking_count}
                      {row.linked_booking_count === 1 ? " booking" : " bookings"}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>

                {/* Received */}
                <td className="hidden px-4 py-3.5 xl:table-cell">
                  <span className="text-xs text-muted-foreground">{relativeTime(row.created_at)}</span>
                </td>

                {/* Actions */}
                <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
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
                        row.client_account_id
                          ? `/admin/inquiries?client_account_id=${encodeURIComponent(row.client_account_id)}`
                          : null
                      }
                      clientAccountId={row.client_account_id}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
