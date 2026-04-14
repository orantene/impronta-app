"use client";

import { useRef, useState } from "react";
import { ManualBookingCommercialTools } from "@/components/admin/admin-inline-commercial-sheets";
import { createManualBooking } from "@/app/(dashboard)/admin/bookings/actions";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { BOOKING_STATUS_VALUES } from "@/lib/admin/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Account = { id: string; name: string };
type Contact = { id: string; client_account_id: string; label: string };
type Talent = { id: string; profile_code: string; display_name: string | null };
type Staff = { id: string; display_name: string | null };

export function ManualBookingForm({
  accounts,
  contacts,
  talents,
  staff,
  defaultOwnerId,
  platformClients = [],
  returnTo = "/admin/bookings/new",
  redirectAfterCreate = "detail",
  formClassName,
}: {
  accounts: Account[];
  contacts: Contact[];
  talents: Talent[];
  staff: Staff[];
  defaultOwnerId: string;
  /** Portal logins (profiles.app_role = client). */
  platformClients?: { id: string; display_name: string | null }[];
  /** Used for error redirects and list vs detail after create. */
  returnTo?: string;
  redirectAfterCreate?: "detail" | "list";
  formClassName?: string;
}) {
  const [accountId, setAccountId] = useState("");
  const talentListRef = useRef<HTMLUListElement>(null);

  const filteredContacts = accountId
    ? contacts.filter((c) => c.client_account_id === accountId)
    : contacts;

  const setAllTalent = (on: boolean) => {
    talentListRef.current?.querySelectorAll<HTMLInputElement>('input[name="talent_profile_ids"]').forEach((el) => {
      el.checked = on;
    });
  };

  return (
    <form
      action={createManualBooking}
      className={cn("max-w-3xl space-y-6", formClassName)}
    >
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="redirect_after_create" value={redirectAfterCreate} />
      <ManualBookingCommercialTools accountOptions={accounts} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border/45 bg-muted/15 px-3 py-3 text-xs leading-relaxed text-muted-foreground sm:col-span-2">
          <span className="font-medium text-foreground">Quick reminder:</span> Client = portal login person. Client
          Location = the villa, venue, restaurant, or brand the job is for.
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="mb_title">Title</Label>
          <Input id="mb_title" name="title" required placeholder="e.g. Villa weekend — host team" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mb_status">Status</Label>
          <select id="mb_status" name="booking_status" defaultValue="draft" className={ADMIN_FORM_CONTROL}>
            {BOOKING_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mb_currency">Currency</Label>
          <Input id="mb_currency" name="currency_code" defaultValue="MXN" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="mb_account">Work Location</Label>
          <select
            id="mb_account"
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
          <p className="text-xs text-muted-foreground">The business or venue this booking is for. Keep this separate from the portal Client below.</p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="mb_contact">Contact person</Label>
          <select id="mb_contact" name="client_contact_id" className={ADMIN_FORM_CONTROL} defaultValue="">
            <option value="">— None —</option>
            {filteredContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Contact must belong to the selected account. If you only select a contact, the booking uses that
            contact&apos;s account automatically.
          </p>
        </div>
        {platformClients.length > 0 ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="mb_platform_client">Client (optional)</Label>
            <select id="mb_platform_client" name="client_user_id" className={ADMIN_FORM_CONTROL} defaultValue="">
              <option value="">— None —</option>
              {platformClients.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.display_name ?? "").trim() || p.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Portal Client only. Use this when the person also has a login; the Work Location above still controls the commercial side.
            </p>
          </div>
        ) : null}
        <label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="populate_snapshots" value="true" defaultChecked className="mt-1 size-4 rounded border-border" />
          <span>
            <span className="font-medium">Populate contact &amp; account snapshots</span>
            <span className="block text-xs text-muted-foreground">
              When checked, copies names/emails from the selected account and contact into the booking row. Uncheck to link IDs only
              and fill snapshots later.
            </span>
          </span>
        </label>
        <div className="space-y-2">
          <Label htmlFor="mb_owner">Manager</Label>
          <select id="mb_owner" name="owner_staff_id" defaultValue={defaultOwnerId} className={ADMIN_FORM_CONTROL}>
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name ?? s.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Schedule</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input name="starts_at" type="datetime-local" aria-label="Starts" />
            <Input name="ends_at" type="datetime-local" aria-label="Ends" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mb_event_date">Event date</Label>
          <Input id="mb_event_date" name="event_date" type="date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mb_venue">Venue name</Label>
          <Input id="mb_venue" name="venue_name" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="mb_venue_loc">Venue location</Label>
          <Input id="mb_venue_loc" name="venue_location_text" placeholder="Address or area" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="mb_notes">Internal notes</Label>
          <Textarea id="mb_notes" name="internal_notes" rows={3} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-base">Initial lineup (optional)</Label>
          <div className="flex gap-2 text-xs">
            <button type="button" className="text-[var(--impronta-gold)] underline-offset-2 hover:underline" onClick={() => setAllTalent(true)}>
              All
            </button>
            <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAllTalent(false)}>
              None
            </button>
          </div>
        </div>
        <ul ref={talentListRef} className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border/45 p-3">
          {talents.map((t) => (
            <li key={t.id} className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="talent_profile_ids" value={t.id} className="size-4 rounded border-border" />
              <span>
                {t.profile_code}
                {t.display_name ? <span className="text-muted-foreground"> · {t.display_name}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Button type="submit" className={cn("rounded-full")}>
        Create booking
      </Button>
    </form>
  );
}
