"use client";

import Link from "next/link";
import { useState } from "react";
import { assignInquiryToCurrentStaffForm } from "@/app/(dashboard)/admin/actions";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { Button } from "@/components/ui/button";
import {
  ADMIN_ACTION_TERTIARY_CLASS,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export type InquiryPeekSummary = {
  id: string;
  status: string;
  statusLabel: string;
  contact_name: string;
  contact_email: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  guest_session_id: string | null;
  created_at: string;
  assigned_staff_id: string | null;
  assigned_staff_display: string | null;
  client_user_id: string | null;
  platform_client_name: string | null;
  client_account_id: string | null;
  client_account_name: string | null;
  linked_contact_name: string | null;
  talent_line: string;
  talent_count: number;
  linked_booking_count: number;
  /** Preformatted `updated_at` from server */
  updated_at_display: string;
};

export function AdminInquiryPeekTrigger({
  summary,
  currentUserId,
}: {
  summary: InquiryPeekSummary;
  currentUserId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const showAssign = Boolean(currentUserId && summary.assigned_staff_id !== currentUserId);

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
        title={summary.contact_name}
        description="Request summary — open the full page for notes, talent edits, and convert to booking."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <AdminCommercialStatusBadge kind="inquiry" status={summary.status}>
              {summary.statusLabel}
            </AdminCommercialStatusBadge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {summary.talent_count} talent · {summary.linked_booking_count} booking
              {summary.linked_booking_count === 1 ? "" : "s"}
            </span>
          </div>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client</dt>
              <dd className="text-muted-foreground">
                {summary.platform_client_name && summary.client_user_id ? (
                  <Link
                    href={`/admin/clients/${summary.client_user_id}`}
                    scroll={false}
                    className="text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    {summary.platform_client_name}
                  </Link>
                ) : summary.platform_client_name ? (
                  <span className="text-foreground">{summary.platform_client_name}</span>
                ) : summary.guest_session_id ? (
                  "Guest session"
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Client Location</dt>
              <dd className="text-muted-foreground">
                {summary.client_account_name && summary.client_account_id ? (
                  <Link
                    href={`/admin/accounts/${summary.client_account_id}`}
                    scroll={false}
                    className="text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    {summary.client_account_name}
                  </Link>
                ) : summary.client_account_name ? (
                  <span className="text-foreground">{summary.client_account_name}</span>
                ) : (
                  "Not linked"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">CRM contact</dt>
              <dd className="text-muted-foreground">
                {summary.linked_contact_name ? (
                  <span className="text-foreground">{summary.linked_contact_name}</span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contact (on request)</dt>
              <dd className="text-muted-foreground">{summary.contact_email}</dd>
            </div>
            {summary.company ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Company (on request)</dt>
                <dd className="text-muted-foreground">{summary.company}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Talent</dt>
              <dd className="text-muted-foreground">{summary.talent_line}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Event</dt>
              <dd className="text-muted-foreground">
                {[summary.event_date, summary.event_location, summary.quantity ? `${summary.quantity} requested` : null]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Manager</dt>
              <dd className="text-muted-foreground">
                {summary.assigned_staff_display ??
                  (summary.assigned_staff_id ? String(summary.assigned_staff_id).slice(0, 8) : "Unassigned")}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last updated</dt>
              <dd className="text-muted-foreground">{summary.updated_at_display}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Created</dt>
              <dd className="text-muted-foreground">{new Date(summary.created_at).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Origin</dt>
              <dd className="text-muted-foreground">
                {summary.guest_session_id ? "Guest session" : "Signed-in platform client"}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2 border-t border-border/40 pt-4">
            {showAssign ? (
              <form action={assignInquiryToCurrentStaffForm}>
                <input type="hidden" name="inquiry_id" value={summary.id} />
                <Button size="sm" variant="outline" type="submit">
                  {summary.assigned_staff_id ? "Take ownership" : "Assign to me"}
                </Button>
              </form>
            ) : null}
            <Button size="sm" variant="secondary" asChild>
              <Link
                href={`/admin/inquiries/${summary.id}#convert-to-booking`}
                scroll={false}
                onClick={() => setOpen(false)}
              >
                Convert to booking
              </Link>
            </Button>
            <Button size="sm" variant="outline" className={cn("text-xs", ADMIN_ACTION_TERTIARY_CLASS)} asChild>
              <Link
                href={`/admin/inquiries/${summary.id}#duplicate-inquiry`}
                scroll={false}
                onClick={() => setOpen(false)}
              >
                Duplicate
              </Link>
            </Button>
            <Button size="sm" className={cn("rounded-xl", LUXURY_GOLD_BUTTON_CLASS)} asChild>
              <Link href={`/admin/inquiries/${summary.id}`} scroll={false} onClick={() => setOpen(false)}>
                Open full detail
              </Link>
            </Button>
          </div>
        </div>
      </DashboardEditPanel>
    </>
  );
}
