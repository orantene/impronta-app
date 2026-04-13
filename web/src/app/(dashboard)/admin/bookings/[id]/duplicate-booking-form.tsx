"use client";

import { useState } from "react";
import { duplicateBooking } from "@/app/(dashboard)/admin/bookings/actions";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Account = { id: string; name: string };
type Contact = { id: string; client_account_id: string; label: string };

export function DuplicateBookingForm({
  sourceBookingId,
  defaultTitle,
  accounts,
  contacts,
}: {
  sourceBookingId: string;
  defaultTitle: string;
  accounts: Account[];
  contacts: Contact[];
}) {
  const [keepLinks, setKeepLinks] = useState(true);
  const [newAccountId, setNewAccountId] = useState("");
  const filteredContacts = newAccountId
    ? contacts.filter((c) => c.client_account_id === newAccountId)
    : contacts;

  return (
    <form action={duplicateBooking} className="space-y-4 rounded-lg border border-border/45 bg-muted/10 p-4">
      <input type="hidden" name="source_booking_id" value={sourceBookingId} />
      <p className="text-sm font-medium text-foreground">Duplicate booking</p>
      <p className="text-xs text-muted-foreground">
        Creates a new draft booking. Relational links and snapshots follow the options below — changing account/contact does not
        overwrite stored text unless you opt in to refresh snapshots for the new links.
      </p>
      <div className="space-y-2">
        <Label htmlFor="dup_b_title">New title</Label>
        <Input id="dup_b_title" name="new_title" defaultValue={defaultTitle} />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="keep_client_links"
          value="true"
          checked={keepLinks}
          onChange={(e) => setKeepLinks(e.target.checked)}
          className="size-4 rounded border-border"
        />
        Keep same Client Location &amp; contact links
      </label>
      {!keepLinks ? (
        <div className="grid gap-3 border-l-2 border-border/45 pl-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="dup_new_acc">New Client Location</Label>
            <select
              id="dup_new_acc"
              name="new_client_account_id"
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              className={ADMIN_FORM_CONTROL}
            >
              <option value="">— None —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="dup_new_con">New contact</Label>
            <select id="dup_new_con" name="new_client_contact_id" className={ADMIN_FORM_CONTROL} defaultValue="">
              <option value="">— None —</option>
              {filteredContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="refresh_snapshots_for_new_links" value="true" defaultChecked className="mt-1 size-4 rounded border-border" />
            <span>Refresh contact &amp; account snapshot fields from the new links (uncheck to keep the original booking&apos;s snapshot text)</span>
          </label>
        </div>
      ) : null}
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="keep_source_inquiry" value="true" className="size-4 rounded border-border" />
        Keep link to source inquiry
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="keep_talent" value="true" defaultChecked className="size-4 rounded border-border" />
        Copy talent lineup
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="keep_pricing" value="true" defaultChecked className="size-4 rounded border-border" />
        Copy row rates &amp; totals (uncheck to zero rates, keep units/roles)
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="clear_schedule" value="true" defaultChecked className="size-4 rounded border-border" />
        Clear schedule &amp; venue fields on the copy
      </label>
      <Button type="submit" variant="secondary" size="sm">
        Duplicate
      </Button>
    </form>
  );
}
