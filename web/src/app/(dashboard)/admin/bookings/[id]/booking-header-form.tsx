"use client";

import { useActionState, useState } from "react";
import { updateBooking, type BookingActionState } from "@/app/(dashboard)/admin/bookings/actions";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { BOOKING_STATUS_VALUES, PAYMENT_METHOD_VALUES, PAYMENT_STATUS_VALUES } from "@/lib/admin/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Staff = { id: string; display_name: string | null };
type Account = { id: string; name: string };
type Contact = { id: string; client_account_id: string; label: string };

export function BookingHeaderForm({
  booking,
  staff,
  accounts,
  contacts,
}: {
  booking: {
    id: string;
    title: string;
    status: string;
    owner_staff_id: string | null;
    payment_method: string | null;
    payment_status: string;
    payment_notes: string | null;
    internal_notes: string | null;
    client_summary: string | null;
    currency_code: string;
    starts_at: string | null;
    ends_at: string | null;
    event_date: string | null;
    venue_name: string | null;
    venue_location_text: string | null;
    client_account_id: string | null;
    client_contact_id: string | null;
    client_visible_at: string | null;
  };
  staff: Staff[];
  accounts: Account[];
  contacts: Contact[];
}) {
  const [accountId, setAccountId] = useState(booking.client_account_id ?? "");
  const filteredContacts = accountId ? contacts.filter((c) => c.client_account_id === accountId) : contacts;
  const [state, formAction] = useActionState(updateBooking, undefined as BookingActionState);

  const toLocalInput = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const eventDateVal = booking.event_date
    ? booking.event_date.length >= 10
      ? booking.event_date.slice(0, 10)
      : booking.event_date
    : "";

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="booking_id" value={booking.id} />
      {state?.error ? (
        <p className="sm:col-span-2 text-sm text-destructive">{state.error}</p>
      ) : null}
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="b_title">Title</Label>
        <Input id="b_title" name="title" defaultValue={booking.title} required />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="b_client_account">Work Location</Label>
        <select
          id="b_client_account"
          name="client_account_id"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className={ADMIN_FORM_CONTROL}
        >
          <option value="">— None —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            The business or venue this booking is for. This is separate from the portal Client managed in the relationship tools above.
          </p>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="b_client_contact">Linked contact</Label>
        <select
          id="b_client_contact"
          name="client_contact_id"
          key={`${accountId}-${booking.client_contact_id ?? ""}`}
          defaultValue={booking.client_contact_id ?? ""}
          className={ADMIN_FORM_CONTROL}
        >
          <option value="">— None —</option>
          {filteredContacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Contact at the selected Work Location. If you change the location, only matching contacts stay available.
        </p>
      </div>
      <div className="space-y-3 sm:col-span-2 rounded-md border border-border/40 bg-muted/15 p-3">
        <p className="text-xs font-medium text-muted-foreground">Snapshot refresh (optional)</p>
        <p className="text-xs text-muted-foreground">
          Linked account/contact above only change IDs. Snapshot fields (names on this booking) stay as-is unless you
          refresh — use that when the CRM record was corrected and you want this booking to match.
        </p>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" name="refresh_account_snapshot" value="true" className="mt-0.5 size-4 rounded border-border" />
          <span>On save, overwrite stored account snapshot fields from the linked account</span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" name="refresh_contact_snapshot" value="true" className="mt-0.5 size-4 rounded border-border" />
          <span>On save, overwrite stored contact snapshot fields from the linked contact</span>
        </label>
      </div>
      <div className="space-y-2">
        <Label htmlFor="b_status">Status</Label>
        <select id="b_status" name="status" defaultValue={booking.status} className={ADMIN_FORM_CONTROL}>
          {BOOKING_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="b_owner">Manager</Label>
        <select id="b_owner" name="owner_staff_id" defaultValue={booking.owner_staff_id ?? ""} className={ADMIN_FORM_CONTROL}>
          <option value="">—</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.display_name ?? s.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="b_currency">Currency</Label>
        <Input id="b_currency" name="currency_code" defaultValue={booking.currency_code} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="b_payment_status">Payment status</Label>
        <select id="b_payment_status" name="payment_status" defaultValue={booking.payment_status} className={ADMIN_FORM_CONTROL}>
          {PAYMENT_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="b_payment_method">Payment method</Label>
        <select id="b_payment_method" name="payment_method" defaultValue={booking.payment_method ?? ""} className={ADMIN_FORM_CONTROL}>
          <option value="">—</option>
          {PAYMENT_METHOD_VALUES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="b_payment_notes">Payment notes</Label>
        <Input id="b_payment_notes" name="payment_notes" defaultValue={booking.payment_notes ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="b_starts">Starts</Label>
        <Input id="b_starts" name="starts_at" type="datetime-local" defaultValue={toLocalInput(booking.starts_at)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="b_ends">Ends</Label>
        <Input id="b_ends" name="ends_at" type="datetime-local" defaultValue={toLocalInput(booking.ends_at)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="b_event_date">Event date</Label>
        <Input id="b_event_date" name="event_date" type="date" defaultValue={eventDateVal} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="b_venue_name">Venue name</Label>
        <Input id="b_venue_name" name="venue_name" defaultValue={booking.venue_name ?? ""} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="b_venue_loc">Venue location</Label>
        <Input id="b_venue_loc" name="venue_location_text" defaultValue={booking.venue_location_text ?? ""} />
      </div>
      <div className="space-y-3 sm:col-span-2 rounded-md border border-border/45 bg-muted/10 p-3">
        <div className="space-y-1">
          <Label htmlFor="b_client_visible_at">Client portal — visibility timestamp</Label>
          <p className="text-xs text-muted-foreground">
            When set (and the row has a matching client user or a contact with a login), the booking can appear under{" "}
            <span className="font-medium text-foreground">/client/bookings</span>. Bookings tied to a source inquiry are
            still visible to that inquiry&apos;s client without this. Use <span className="font-medium">Clear</span> to
            remove the timestamp.
          </p>
        </div>
        <Input
          id="b_client_visible_at"
          name="client_visible_at"
          type="datetime-local"
          defaultValue={toLocalInput(booking.client_visible_at)}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="clear_client_visible_at" value="true" className="size-4 rounded border-border" />
          Clear client portal visibility timestamp
        </label>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="b_client_summary">Client-facing summary</Label>
        <Textarea id="b_client_summary" name="client_summary" rows={2} defaultValue={booking.client_summary ?? ""} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="b_internal">Internal notes</Label>
        <Textarea id="b_internal" name="internal_notes" rows={3} defaultValue={booking.internal_notes ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit">Save booking</Button>
      </div>
    </form>
  );
}
