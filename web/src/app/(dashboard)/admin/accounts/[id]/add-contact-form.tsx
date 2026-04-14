"use client";

import { useActionState, useEffect, useRef } from "react";
import { createClientAccountContact } from "@/app/(dashboard)/admin/actions";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type AccountOption = { id: string; name: string };

type AddContactFormProps = {
  /** When set with accountLocked, submitted as hidden client_account_id. */
  clientAccountId?: string;
  /** If true, account is fixed (hidden field). If false and accountOptions set, show a select. */
  accountLocked?: boolean;
  lockedAccountName?: string | null;
  /** When account is not locked, staff picks the commercial account. */
  accountOptions?: AccountOption[];
  submitLabel?: string;
  onSuccess?: () => void;
  /** After create, link this contact on the inquiry or booking. */
  linkInquiryId?: string | null;
  linkBookingId?: string | null;
};

export function AddContactForm({
  clientAccountId,
  accountLocked = true,
  lockedAccountName,
  accountOptions,
  submitLabel = "Add contact",
  onSuccess,
  linkInquiryId,
  linkBookingId,
}: AddContactFormProps) {
  const [state, formAction] = useActionState(createClientAccountContact, undefined);
  const successHandled = useRef(false);

  const showAccountSelect = !accountLocked && accountOptions && accountOptions.length > 0;

  useEffect(() => {
    if (!state?.contactCreated || successHandled.current) return;
    successHandled.current = true;
    onSuccess?.();
  }, [state?.contactCreated, onSuccess]);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      {linkInquiryId ? <input type="hidden" name="link_inquiry_id" value={linkInquiryId} /> : null}
      {linkBookingId ? <input type="hidden" name="link_booking_id" value={linkBookingId} /> : null}
      {state?.error ? (
        <p className="sm:col-span-2 text-sm text-destructive">{state.error}</p>
      ) : null}

      {accountLocked && clientAccountId ? (
        <>
          <input type="hidden" name="client_account_id" value={clientAccountId} />
          {lockedAccountName ? (
            <div className="sm:col-span-2 rounded-md border border-border/45 bg-muted/20 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Work Location </span>
              <span className="font-medium text-foreground">{lockedAccountName}</span>
            </div>
          ) : null}
        </>
      ) : null}

      {showAccountSelect ? (
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="client_account_id_select">Work Location</Label>
          <select
            id="client_account_id_select"
            name="client_account_id"
            required
            className={ADMIN_FORM_CONTROL}
            defaultValue={clientAccountId ?? ""}
          >
            <option value="" disabled>
              Select account…
            </option>
            {accountOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {!accountLocked && !showAccountSelect ? (
        <p className="sm:col-span-2 text-sm text-muted-foreground">
          Choose a Work Location on this record first, or open this form from a location that is already linked.
        </p>
      ) : null}

      {(accountLocked && clientAccountId) || showAccountSelect ? (
        <>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" name="full_name" required placeholder="e.g. Mica" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp_phone">WhatsApp</Label>
            <Input id="whatsapp_phone" name="whatsapp_phone" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job_title">Role / job title</Label>
            <Input id="job_title" name="job_title" placeholder="e.g. Estate manager" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" size="sm">
              {submitLabel}
            </Button>
          </div>
        </>
      ) : null}
    </form>
  );
}
