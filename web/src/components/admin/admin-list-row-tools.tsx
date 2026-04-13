"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { AdminClientInquiriesPanelTrigger } from "@/components/admin/admin-client-inquiries-panel";
import { EditClientAccountButton, type ClientLocationFormValues } from "@/components/admin/create-client-account-sheet";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ADMIN_ACTION_TERTIARY_CLASS, ADMIN_OUTLINE_CONTROL_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export function AdminClientRowTools({
  userId,
  displayName,
  company,
  inquiriesCount,
  savedCount,
}: {
  userId: string;
  displayName: string | null;
  company: string | null;
  inquiriesCount: number;
  savedCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyId = () => {
    void navigator.clipboard.writeText(userId).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="outline" size="sm" className={cn("h-7 px-2 text-[11px]", ADMIN_OUTLINE_CONTROL_CLASS)} onClick={() => setOpen(true)}>
          Preview
        </Button>
        <AdminClientInquiriesPanelTrigger
          userId={userId}
          displayName={displayName}
          trigger="text"
          textVariant="ghost"
          textLabel="Browse requests"
          textButtonClassName={cn("h-7 px-2 text-[11px]", ADMIN_ACTION_TERTIARY_CLASS)}
        />
        <Button type="button" variant="ghost" size="sm" className={cn("h-7 px-2 text-[11px]", ADMIN_ACTION_TERTIARY_CLASS)} onClick={copyId}>
          {copied ? "Copied" : "Copy id"}
        </Button>
      </div>
      <DashboardEditPanel
        open={open}
        onOpenChange={setOpen}
        title={displayName ?? "Client"}
        description="Portal Client (login) — not a Client Location."
      >
        <dl className="space-y-2 text-sm text-muted-foreground">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide">Company</dt>
            <dd>{company ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide">Requests</dt>
            <dd>{inquiriesCount}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide">Saved talent</dt>
            <dd>{savedCount}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/40 pt-4">
          <Button size="sm" asChild>
            <Link href={`/admin/clients/${userId}`} scroll={false} onClick={() => setOpen(false)}>
              Open workspace
            </Link>
          </Button>
        </div>
      </DashboardEditPanel>
    </div>
  );
}

export function AdminAccountRowTools({
  account,
  usage,
}: {
  account: ClientLocationFormValues;
  usage: {
    linkedClientsCount: number;
    linkedClients: { id: string; name: string }[];
    inquiriesCount: number;
    bookingsCount: number;
    latestInquiryAt: string | null;
    latestBookingAt: string | null;
  };
}) {
  const [copied, setCopied] = useState(false);

  const copyId = () => {
    void navigator.clipboard.writeText(account.id).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      <EditClientAccountButton
        account={account}
        label="Edit"
        className="h-7 px-2 text-[11px]"
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className={cn("h-7 px-2 text-[11px]", ADMIN_ACTION_TERTIARY_CLASS)}>
            Usage
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 space-y-4">
          <div className="space-y-1">
            <p className="font-medium text-foreground">{account.name}</p>
            <p className="text-xs text-muted-foreground">Linked usage across requests, bookings, and related Clients.</p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Linked clients</dt>
              <dd className="mt-1 text-foreground">{usage.linkedClientsCount}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Requests</dt>
              <dd className="mt-1 text-foreground">{usage.inquiriesCount}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bookings</dt>
              <dd className="mt-1 text-foreground">{usage.bookingsCount}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent inquiry</dt>
              <dd className="mt-1 text-foreground">
                {usage.latestInquiryAt ? new Date(usage.latestInquiryAt).toLocaleString() : "No inquiries yet"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent booking date</dt>
              <dd className="mt-1 text-foreground">
                {usage.latestBookingAt ? new Date(usage.latestBookingAt).toLocaleString() : "No bookings yet"}
              </dd>
            </div>
          </dl>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Linked clients</p>
            {!usage.linkedClients.length ? (
              <p className="text-sm text-muted-foreground">No portal Clients linked through inquiries or bookings yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {usage.linkedClients.slice(0, 4).map((client) => (
                  <li key={client.id}>
                    <Link
                      href={`/admin/clients/${client.id}`}
                      scroll={false}
                      className="inline-flex items-center gap-1 text-sm text-[var(--impronta-gold)] underline-offset-4 hover:underline"
                    >
                      {client.name}
                      <ExternalLink className="size-3.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border/40 pt-3">
            <Button size="sm" variant="outline" className={cn("h-8 px-2.5 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
              <Link href={`/admin/accounts/${account.id}`} scroll={false}>
                Open detail
              </Link>
            </Button>
            <Button size="sm" variant="outline" className={cn("h-8 px-2.5 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
              <Link href={`/admin/inquiries?client_account_id=${encodeURIComponent(account.id)}`} scroll={false}>
                View requests
              </Link>
            </Button>
            <Button size="sm" variant="outline" className={cn("h-8 px-2.5 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
              <Link href={`/admin/bookings?client_account_id=${encodeURIComponent(account.id)}`} scroll={false}>
                View bookings
              </Link>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="sm" className={cn("h-7 px-2 text-[11px]", ADMIN_ACTION_TERTIARY_CLASS)} asChild>
        <Link href={`/admin/inquiries?client_account_id=${encodeURIComponent(account.id)}`} scroll={false}>
          Filter requests
        </Link>
      </Button>
      <Button type="button" variant="ghost" size="sm" className={cn("h-7 px-2 text-[11px]", ADMIN_ACTION_TERTIARY_CLASS)} onClick={copyId}>
        {copied ? "Copied" : "Copy id"}
      </Button>
    </div>
  );
}
