"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import {
  assignBookingToCurrentStaffForm,
  quickUpdateBookingPeek,
  type BookingActionState,
} from "@/app/(dashboard)/admin/bookings/actions";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { Button } from "@/components/ui/button";
import { ADMIN_FORM_CONTROL, ADMIN_ACTION_TERTIARY_CLASS } from "@/lib/dashboard-shell-classes";
import { BOOKING_STATUS_VALUES } from "@/lib/admin/validation";
import { LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export type BookingPeekSummary = {
  id: string;
  title: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  currency_code: string;
  total_client_revenue: number;
  gross_profit: number;
  starts_at: string | null;
  ends_at: string | null;
  source_inquiry_id: string | null;
  client_account_id: string | null;
  account_name: string;
  contact_name: string;
  owner_staff_id: string | null;
  manager_display: string | null;
  talent_count: number;
  updated_at_display: string;
};

type StaffOpt = { id: string; display_name: string | null };

export function AdminBookingPeekTrigger({
  summary,
  staffOptions,
  currentUserId,
}: {
  summary: BookingPeekSummary;
  staffOptions: StaffOpt[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [peekState, peekAction] = useActionState(
    async (_prev: BookingActionState | undefined, formData: FormData) => {
      const next = await quickUpdateBookingPeek(formData);
      if (!next?.error) router.refresh();
      return next;
    },
    undefined as BookingActionState | undefined,
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-8", ADMIN_ACTION_TERTIARY_CLASS)}
        onClick={() => setOpen(true)}
      >
        Preview
      </Button>
      <DashboardEditPanel
        open={open}
        onOpenChange={setOpen}
        title={summary.title}
        description="Booking summary — change status or manager here, or open the workspace for lineup and pricing."
      >
        <div className="space-y-4">
          {peekState?.error ? (
            <p className="text-sm text-destructive">{peekState.error}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <AdminCommercialStatusBadge kind="booking" status={summary.status} />
            <span className="rounded-md border border-border/50 bg-muted/25 px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
              {summary.payment_status.replace(/_/g, " ")}
            </span>
          </div>
          <form action={peekAction} className="space-y-3 rounded-lg border border-border/40 bg-muted/15 p-3">
            <input type="hidden" name="booking_id" value={summary.id} />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick update</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={`peek-status-${summary.id}`} className="text-xs text-muted-foreground">
                  Status
                </label>
                <select
                  id={`peek-status-${summary.id}`}
                  name="status"
                  className={ADMIN_FORM_CONTROL}
                  defaultValue={summary.status}
                >
                  {BOOKING_STATUS_VALUES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor={`peek-owner-${summary.id}`} className="text-xs text-muted-foreground">
                  Manager
                </label>
                <select
                  id={`peek-owner-${summary.id}`}
                  name="owner_staff_id"
                  className={ADMIN_FORM_CONTROL}
                  defaultValue={summary.owner_staff_id ?? ""}
                >
                  <option value="">— Unassigned —</option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name ?? s.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button type="submit" size="sm" variant="secondary">
              Apply status & manager
            </Button>
          </form>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Manager</dt>
              <dd className="text-muted-foreground">{summary.manager_display ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last updated</dt>
              <dd className="text-muted-foreground">{summary.updated_at_display}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lineup</dt>
              <dd className="tabular-nums text-muted-foreground">{summary.talent_count} talent on booking</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client Location</dt>
              <dd className="text-muted-foreground">
                {summary.client_account_id ? (
                  <Link
                    href={`/admin/accounts/${summary.client_account_id}`}
                    scroll={false}
                    className="text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    {summary.account_name}
                  </Link>
                ) : (
                  summary.account_name
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact</dt>
              <dd className="text-muted-foreground">{summary.contact_name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Schedule</dt>
              <dd className="whitespace-nowrap text-muted-foreground">
                {summary.starts_at ? new Date(summary.starts_at).toLocaleString() : "—"}
                {summary.ends_at ? (
                  <>
                    <br />
                    <span className="text-xs">→ {new Date(summary.ends_at).toLocaleString()}</span>
                  </>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Revenue summary</dt>
              <dd className="tabular-nums text-muted-foreground">
                {summary.currency_code} {Number(summary.total_client_revenue).toFixed(2)} client revenue ·{" "}
                {summary.currency_code} {Number(summary.gross_profit).toFixed(2)} gross margin
              </dd>
            </div>
            {summary.payment_method ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment method</dt>
                <dd className="text-muted-foreground">{summary.payment_method}</dd>
              </div>
            ) : null}
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
            {currentUserId && summary.owner_staff_id !== currentUserId ? (
              <form action={assignBookingToCurrentStaffForm}>
                <input type="hidden" name="booking_id" value={summary.id} />
                <Button size="sm" variant="outline" type="submit">
                  Assign to me
                </Button>
              </form>
            ) : null}
            <Button size="sm" className={cn("rounded-xl", LUXURY_GOLD_BUTTON_CLASS)} asChild>
              <Link href={`/admin/bookings/${summary.id}`} scroll={false} onClick={() => setOpen(false)}>
                Open booking
              </Link>
            </Button>
            {summary.source_inquiry_id ? (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/admin/inquiries/${summary.source_inquiry_id}`} scroll={false} onClick={() => setOpen(false)}>
                  Source request
                </Link>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className={cn("text-xs", ADMIN_ACTION_TERTIARY_CLASS)} asChild>
              <Link
                href={`/admin/bookings/${summary.id}#duplicate-booking`}
                scroll={false}
                onClick={() => setOpen(false)}
              >
                Duplicate
              </Link>
            </Button>
          </div>
        </div>
      </DashboardEditPanel>
    </>
  );
}
