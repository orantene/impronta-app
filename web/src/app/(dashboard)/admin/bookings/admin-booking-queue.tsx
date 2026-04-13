"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AdminBookingListRowQuickActions } from "@/components/admin/admin-booking-list-row-quick-actions";
import { AdminBookingPeekTrigger } from "@/components/admin/admin-booking-peek-sheet";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BOOKING_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  tentative: "Tentative",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
};

const PAYMENT_STATUS_DOT: Record<string, string> = {
  unpaid: "bg-rose-400",
  partially_paid: "bg-amber-400",
  paid: "bg-emerald-400",
  invoiced: "bg-sky-400",
  overpaid: "bg-violet-400",
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

function formatRevenue(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

export type BookingQueueRow = {
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
  client_user_id: string | null;
  owner_staff_id: string | null;
  updated_at: string;
  // resolved server-side
  account_name: string;
  contact_name: string;
  manager_display: string | null;
  talent_count: number;
  updated_at_display: string;
};

export function AdminBookingQueue({
  rows,
  currentUserId,
  staffOptions,
}: {
  rows: BookingQueueRow[];
  currentUserId: string | null;
  staffOptions: { id: string; display_name: string | null }[];
}) {
  const router = useRouter();
  const go = (id: string) => router.push(`/admin/bookings/${id}`);
  const prefetch = (id: string) => router.prefetch(`/admin/bookings/${id}`);

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border/60 bg-muted/[0.04] px-4 py-10 text-center text-sm text-muted-foreground">
        No bookings match this view.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/45 bg-card/50 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.35)]">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-gradient-to-b from-muted/35 to-muted/10">
          <tr className="border-b border-border/45">
            <th className="px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Booking
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
            <th className="hidden px-4 py-3.5 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground lg:table-cell">
              Revenue
            </th>
            <th className="hidden px-4 py-3.5 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground xl:table-cell">
              Margin
            </th>
            <th className="hidden px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground xl:table-cell">
              Updated
            </th>
            <th className="px-4 py-3.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/25">
          {rows.map((b) => {
            const revenue = Number(b.total_client_revenue);
            const cost = Number(b.total_talent_cost);
            const profit = Number(b.gross_profit);
            const marginPct =
              revenue > 0 ? Math.round((profit / revenue) * 100) : null;
            const paymentDot = PAYMENT_STATUS_DOT[b.payment_status] ?? "bg-muted-foreground/40";

            return (
              <tr
                key={b.id}
                className={cn(
                  "cursor-pointer transition-[background-color,box-shadow] duration-150",
                  "hover:bg-[var(--impronta-gold)]/[0.06] hover:shadow-[inset_3px_0_0_0_var(--impronta-gold)]",
                )}
                onMouseEnter={() => prefetch(b.id)}
                onFocus={() => prefetch(b.id)}
                onClick={() => go(b.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    go(b.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Open booking: ${b.title}`}
              >
                {/* Booking title */}
                <td className="px-4 py-3.5">
                  <p className="font-display text-[15px] font-medium tracking-tight text-foreground">
                    {b.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {/* Payment status dot */}
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <span className={cn("inline-block size-1.5 rounded-full", paymentDot)} aria-hidden />
                      {b.payment_status.replace(/_/g, " ")}
                    </span>
                    {/* Status on mobile */}
                    <span className="sm:hidden">
                      <AdminCommercialStatusBadge kind="booking" status={b.status} className="text-[10px]">
                        {BOOKING_STATUS_LABEL[b.status] ?? b.status}
                      </AdminCommercialStatusBadge>
                    </span>
                  </div>
                </td>

                {/* Status */}
                <td className="hidden px-4 py-3.5 sm:table-cell">
                  <AdminCommercialStatusBadge kind="booking" status={b.status}>
                    {BOOKING_STATUS_LABEL[b.status] ?? b.status}
                  </AdminCommercialStatusBadge>
                  {b.manager_display && (
                    <p className="mt-1 text-[10px] text-muted-foreground">{b.manager_display}</p>
                  )}
                </td>

                {/* Client / Location */}
                <td className="hidden max-w-[180px] px-4 py-3.5 md:table-cell">
                  <p className="truncate text-sm text-foreground">{b.account_name}</p>
                  {b.contact_name !== "—" && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{b.contact_name}</p>
                  )}
                </td>

                {/* Talent */}
                <td className="hidden px-4 py-3.5 lg:table-cell">
                  {b.talent_count > 0 ? (
                    <span className="tabular-nums text-sm font-medium text-foreground">
                      {b.talent_count}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {b.talent_count === 1 ? "model" : "models"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>

                {/* Revenue */}
                <td className="hidden px-4 py-3.5 text-right lg:table-cell">
                  {revenue > 0 ? (
                    <span className="tabular-nums text-sm font-semibold text-[var(--impronta-gold)]">
                      {formatRevenue(revenue, b.currency_code)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>

                {/* Margin */}
                <td className="hidden px-4 py-3.5 text-right xl:table-cell">
                  {marginPct !== null ? (
                    <span
                      className={cn(
                        "tabular-nums text-sm font-medium",
                        marginPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500",
                      )}
                    >
                      {marginPct}%
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>

                {/* Updated */}
                <td className="hidden px-4 py-3.5 xl:table-cell">
                  <span className="text-xs text-muted-foreground">{relativeTime(b.updated_at)}</span>
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
                      <Link href={`/admin/bookings/${b.id}`} aria-label="Open booking">
                        <ChevronRight className="size-4" aria-hidden />
                      </Link>
                    </Button>
                    <AdminBookingPeekTrigger
                      currentUserId={currentUserId}
                      staffOptions={staffOptions}
                      summary={{
                        id: b.id,
                        title: b.title,
                        status: b.status,
                        payment_status: b.payment_status,
                        payment_method: b.payment_method,
                        currency_code: b.currency_code,
                        total_client_revenue: b.total_client_revenue,
                        gross_profit: b.gross_profit,
                        starts_at: b.starts_at,
                        ends_at: b.ends_at,
                        source_inquiry_id: b.source_inquiry_id,
                        client_account_id: b.client_account_id,
                        account_name: b.account_name,
                        contact_name: b.contact_name,
                        owner_staff_id: b.owner_staff_id,
                        manager_display: b.manager_display,
                        talent_count: b.talent_count,
                        updated_at_display: b.updated_at_display,
                      }}
                    />
                    <AdminBookingListRowQuickActions
                      bookingId={b.id}
                      status={b.status}
                      ownerStaffId={b.owner_staff_id}
                      currentUserId={currentUserId}
                      sourceInquiryId={b.source_inquiry_id}
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
