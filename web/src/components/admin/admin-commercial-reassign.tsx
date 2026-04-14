"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { patchInquiryEntityLinks, type AdminActionState } from "@/app/(dashboard)/admin/actions";
import { patchBookingEntityLinks, type BookingActionState } from "@/app/(dashboard)/admin/bookings/actions";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { Button } from "@/components/ui/button";
import { ADMIN_FORM_CONTROL, ADMIN_OUTLINE_CONTROL_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

type AccountOpt = { id: string; name: string };
type ContactOpt = { id: string; client_account_id: string; label: string };
type ClientOpt = { id: string; display_name: string | null };
type InquiryOpt = { id: string; label: string };

function SnapshotRefreshFields() {
  return (
    <div className="space-y-2 rounded-md border border-border/40 bg-muted/15 p-3 text-xs">
      <label className="flex cursor-pointer items-start gap-2">
        <input type="checkbox" name="refresh_account_snapshot" value="true" defaultChecked className="mt-0.5 size-4 rounded border-border" />
        <span>Refresh company / location name on this record from the linked Work Location</span>
      </label>
      <label className="flex cursor-pointer items-start gap-2">
        <input type="checkbox" name="refresh_contact_snapshot" value="true" defaultChecked className="mt-0.5 size-4 rounded border-border" />
        <span>Refresh contact name & email from the linked contact</span>
      </label>
      <p className="text-muted-foreground">Uncheck if you are intentionally keeping snapshot text for audit.</p>
    </div>
  );
}

export function InquiryCommercialReassignBar({
  inquiryId,
  clientUserId,
  clientAccountId,
  clientContactId,
  accounts,
  contacts,
  clientOptions,
}: {
  inquiryId: string;
  clientUserId: string | null;
  clientAccountId: string | null;
  clientContactId: string | null;
  accounts: AccountOpt[];
  contacts: ContactOpt[];
  clientOptions: ClientOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "client" | "account" | "contact">(null);
  const [inqState, inqAction] = useActionState(
    async (prev: AdminActionState | undefined, fd: FormData) => {
      const next = await patchInquiryEntityLinks(prev, fd);
      if (!next?.error) {
        setOpen(null);
        router.refresh();
      }
      return next;
    },
    undefined as AdminActionState | undefined,
  );

  const contactChoices = clientAccountId
    ? contacts.filter((c) => c.client_account_id === clientAccountId)
    : contacts;

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" className={cn(ADMIN_OUTLINE_CONTROL_CLASS)} onClick={() => setOpen("client")}>
        Change Client
      </Button>
      <Button type="button" size="sm" variant="outline" className={cn(ADMIN_OUTLINE_CONTROL_CLASS)} onClick={() => setOpen("account")}>
        Change Work Location
      </Button>
      <Button type="button" size="sm" variant="outline" className={cn(ADMIN_OUTLINE_CONTROL_CLASS)} onClick={() => setOpen("contact")}>
        Change contact
      </Button>

      <DashboardEditPanel
        open={open === "client"}
        onOpenChange={(o) => setOpen(o ? "client" : null)}
        title="Change Client (portal login)"
        description="The Client is the portal login person tied to this request. This does not change the billed Work Location."
      >
        <form action={inqAction} className="space-y-4">
          <input type="hidden" name="inquiry_id" value={inquiryId} />
          <input type="hidden" name="patch_mode" value="platform_client" />
          <input type="hidden" name="client_account_id" value="" />
          <input type="hidden" name="client_contact_id" value="" />
          {inqState?.error ? <p className="text-sm text-destructive">{inqState.error}</p> : null}
          <div className="space-y-2">
            <label htmlFor={`inq-client-${inquiryId}`} className="text-sm font-medium">
              Client
            </label>
            <select id={`inq-client-${inquiryId}`} name="client_user_id" className={ADMIN_FORM_CONTROL} defaultValue={clientUserId ?? ""}>
              <option value="">— None (guest / manual) —</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.display_name ?? c.id).slice(0, 60)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </DashboardEditPanel>

      <DashboardEditPanel
        open={open === "account"}
        onOpenChange={(o) => setOpen(o ? "account" : null)}
        title="Change Work Location"
        description="The Work Location is the villa, venue, brand, or business unit the work is for. If the current contact does not belong to the new location, it will be cleared."
      >
        <form action={inqAction} className="space-y-4">
          <input type="hidden" name="inquiry_id" value={inquiryId} />
          <input type="hidden" name="patch_mode" value="billing_account" />
          <input type="hidden" name="client_user_id" value="" />
          <input type="hidden" name="client_contact_id" value="" />
          {inqState?.error ? <p className="text-sm text-destructive">{inqState.error}</p> : null}
          <div className="space-y-2">
            <label htmlFor={`inq-acc-${inquiryId}`} className="text-sm font-medium">
              Work Location
            </label>
            <select id={`inq-acc-${inquiryId}`} name="client_account_id" className={ADMIN_FORM_CONTROL} defaultValue={clientAccountId ?? ""}>
              <option value="">— None —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <SnapshotRefreshFields />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </DashboardEditPanel>

      <DashboardEditPanel
        open={open === "contact"}
        onOpenChange={(o) => setOpen(o ? "contact" : null)}
        title="Change contact"
        description="Person at this Work Location. Link a Work Location first if none is set."
      >
        <form action={inqAction} className="space-y-4">
          <input type="hidden" name="inquiry_id" value={inquiryId} />
          <input type="hidden" name="patch_mode" value="contact" />
          <input type="hidden" name="client_user_id" value="" />
          <input type="hidden" name="client_account_id" value="" />
          {inqState?.error ? <p className="text-sm text-destructive">{inqState.error}</p> : null}
          {!clientAccountId ? (
            <p className="text-sm text-muted-foreground">Link a Work Location first, or use Change Work Location above.</p>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor={`inq-con-${inquiryId}`} className="text-sm font-medium">
                  Contact
                </label>
                <select id={`inq-con-${inquiryId}`} name="client_contact_id" className={ADMIN_FORM_CONTROL} defaultValue={clientContactId ?? ""}>
                  <option value="">— None —</option>
                  {contactChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <SnapshotRefreshFields />
              <Button type="submit" size="sm">
                Save
              </Button>
            </>
          )}
        </form>
      </DashboardEditPanel>
    </div>
  );
}

export function BookingCommercialReassignBar({
  bookingId,
  clientUserId,
  clientAccountId,
  clientContactId,
  sourceInquiryId,
  accounts,
  contacts,
  clientOptions,
  inquiryOptions,
}: {
  bookingId: string;
  clientUserId: string | null;
  clientAccountId: string | null;
  clientContactId: string | null;
  sourceInquiryId: string | null;
  accounts: AccountOpt[];
  contacts: ContactOpt[];
  clientOptions: ClientOpt[];
  inquiryOptions: InquiryOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "client" | "account" | "contact" | "inquiry">(null);
  const [bkState, bkAction] = useActionState(
    async (prev: BookingActionState | undefined, fd: FormData) => {
      const next = await patchBookingEntityLinks(prev, fd);
      if (!next?.error) {
        setOpen(null);
        router.refresh();
      }
      return next;
    },
    undefined as BookingActionState | undefined,
  );

  const contactChoices = clientAccountId
    ? contacts.filter((c) => c.client_account_id === clientAccountId)
    : contacts;

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" className={cn(ADMIN_OUTLINE_CONTROL_CLASS)} onClick={() => setOpen("client")}>
        Change Client
      </Button>
      <Button type="button" size="sm" variant="outline" className={cn(ADMIN_OUTLINE_CONTROL_CLASS)} onClick={() => setOpen("account")}>
        Change Work Location
      </Button>
      <Button type="button" size="sm" variant="outline" className={cn(ADMIN_OUTLINE_CONTROL_CLASS)} onClick={() => setOpen("contact")}>
        Change contact
      </Button>
      <Button type="button" size="sm" variant="outline" className={cn(ADMIN_OUTLINE_CONTROL_CLASS)} onClick={() => setOpen("inquiry")}>
        Change source request
      </Button>

      <DashboardEditPanel
        open={open === "client"}
        onOpenChange={(o) => setOpen(o ? "client" : null)}
        title="Change Client (portal login)"
        description="The Client is the portal login person associated with this booking. This does not change the billed Work Location."
      >
        <form action={bkAction} className="space-y-4">
          <input type="hidden" name="booking_id" value={bookingId} />
          <input type="hidden" name="patch_mode" value="platform_client" />
          <input type="hidden" name="client_account_id" value="" />
          <input type="hidden" name="client_contact_id" value="" />
          <input type="hidden" name="source_inquiry_id" value="" />
          {bkState?.error ? <p className="text-sm text-destructive">{bkState.error}</p> : null}
          <select name="client_user_id" className={ADMIN_FORM_CONTROL} defaultValue={clientUserId ?? ""}>
            <option value="">— None —</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.display_name ?? c.id).slice(0, 60)}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </DashboardEditPanel>

      <DashboardEditPanel
        open={open === "account"}
        onOpenChange={(o) => setOpen(o ? "account" : null)}
        title="Change Work Location"
        description="The Work Location is the villa, venue, brand, or business unit the booking is for. If the current contact does not belong to the new Work Location, it will be cleared."
      >
        <form action={bkAction} className="space-y-4">
          <input type="hidden" name="booking_id" value={bookingId} />
          <input type="hidden" name="patch_mode" value="billing_account" />
          <input type="hidden" name="client_user_id" value="" />
          <input type="hidden" name="client_contact_id" value="" />
          <input type="hidden" name="source_inquiry_id" value="" />
          {bkState?.error ? <p className="text-sm text-destructive">{bkState.error}</p> : null}
          <select name="client_account_id" className={ADMIN_FORM_CONTROL} defaultValue={clientAccountId ?? ""}>
            <option value="">— None —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <SnapshotRefreshFields />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </DashboardEditPanel>

      <DashboardEditPanel
        open={open === "contact"}
        onOpenChange={(o) => setOpen(o ? "contact" : null)}
        title="Change contact"
        description="Person at this Work Location."
      >
        <form action={bkAction} className="space-y-4">
          <input type="hidden" name="booking_id" value={bookingId} />
          <input type="hidden" name="patch_mode" value="contact" />
          <input type="hidden" name="client_user_id" value="" />
          <input type="hidden" name="client_account_id" value="" />
          <input type="hidden" name="source_inquiry_id" value="" />
          {bkState?.error ? <p className="text-sm text-destructive">{bkState.error}</p> : null}
          {!clientAccountId ? (
            <p className="text-sm text-muted-foreground">Link a Work Location first.</p>
          ) : (
            <>
              <select name="client_contact_id" className={ADMIN_FORM_CONTROL} defaultValue={clientContactId ?? ""}>
                <option value="">— None —</option>
                {contactChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <SnapshotRefreshFields />
              <Button type="submit" size="sm">
                Save
              </Button>
            </>
          )}
        </form>
      </DashboardEditPanel>

      <DashboardEditPanel
        open={open === "inquiry"}
        onOpenChange={(o) => setOpen(o ? "inquiry" : null)}
        title="Change source inquiry"
        description="Link back to the client request that created this job, or clear it for direct bookings."
      >
        <form action={bkAction} className="space-y-4">
          <input type="hidden" name="booking_id" value={bookingId} />
          <input type="hidden" name="patch_mode" value="source_inquiry" />
          <input type="hidden" name="client_user_id" value="" />
          <input type="hidden" name="client_account_id" value="" />
          <input type="hidden" name="client_contact_id" value="" />
          {bkState?.error ? <p className="text-sm text-destructive">{bkState.error}</p> : null}
          <select name="source_inquiry_id" className={ADMIN_FORM_CONTROL} defaultValue={sourceInquiryId ?? ""}>
            <option value="">— None —</option>
            {inquiryOptions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </DashboardEditPanel>
    </div>
  );
}

/** Header / toolbar: only billing account + contact sheets (same forms as the full reassign bar). */
export function InquiryAccountContactReassignInline({
  inquiryId,
  clientAccountId,
  clientContactId,
  accounts,
  contacts,
}: {
  inquiryId: string;
  clientAccountId: string | null;
  clientContactId: string | null;
  accounts: AccountOpt[];
  contacts: ContactOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "account" | "contact">(null);
  const [inqState, inqAction] = useActionState(
    async (prev: AdminActionState | undefined, fd: FormData) => {
      const next = await patchInquiryEntityLinks(prev, fd);
      if (!next?.error) {
        setOpen(null);
        router.refresh();
      }
      return next;
    },
    undefined as AdminActionState | undefined,
  );

  const contactChoices = clientAccountId
    ? contacts.filter((c) => c.client_account_id === clientAccountId)
    : contacts;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn("h-8 px-2 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)}
        onClick={() => setOpen("account")}
      >
        Change Work Location
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn("h-8 px-2 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)}
        onClick={() => setOpen("contact")}
      >
        Change contact
      </Button>

      <DashboardEditPanel
        open={open === "account"}
        onOpenChange={(o) => setOpen(o ? "account" : null)}
        title="Change Work Location"
        description="Work Location you invoice. If the current contact does not belong to the new location, it will be cleared."
      >
        <form action={inqAction} className="space-y-4">
          <input type="hidden" name="inquiry_id" value={inquiryId} />
          <input type="hidden" name="patch_mode" value="billing_account" />
          <input type="hidden" name="client_user_id" value="" />
          <input type="hidden" name="client_contact_id" value="" />
          {inqState?.error ? <p className="text-sm text-destructive">{inqState.error}</p> : null}
          <div className="space-y-2">
            <label htmlFor={`inq-h-acc-${inquiryId}`} className="text-sm font-medium">
              Work Location
            </label>
            <select id={`inq-h-acc-${inquiryId}`} name="client_account_id" className={ADMIN_FORM_CONTROL} defaultValue={clientAccountId ?? ""}>
              <option value="">— None —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <SnapshotRefreshFields />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </DashboardEditPanel>

      <DashboardEditPanel
        open={open === "contact"}
        onOpenChange={(o) => setOpen(o ? "contact" : null)}
        title="Change contact"
        description="Person at this Work Location. Link a Work Location first if none is set."
      >
        <form action={inqAction} className="space-y-4">
          <input type="hidden" name="inquiry_id" value={inquiryId} />
          <input type="hidden" name="patch_mode" value="contact" />
          <input type="hidden" name="client_user_id" value="" />
          <input type="hidden" name="client_account_id" value="" />
          {inqState?.error ? <p className="text-sm text-destructive">{inqState.error}</p> : null}
          {!clientAccountId ? (
            <p className="text-sm text-muted-foreground">Link a Work Location first, or use Change Work Location.</p>
          ) : (
            <>
              <div className="space-y-2">
                <label htmlFor={`inq-h-con-${inquiryId}`} className="text-sm font-medium">
                  Contact
                </label>
                <select id={`inq-h-con-${inquiryId}`} name="client_contact_id" className={ADMIN_FORM_CONTROL} defaultValue={clientContactId ?? ""}>
                  <option value="">— None —</option>
                  {contactChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <SnapshotRefreshFields />
              <Button type="submit" size="sm">
                Save
              </Button>
            </>
          )}
        </form>
      </DashboardEditPanel>
    </div>
  );
}

/** Header / toolbar: billing account + contact only. */
export function BookingAccountContactReassignInline({
  bookingId,
  clientAccountId,
  clientContactId,
  accounts,
  contacts,
}: {
  bookingId: string;
  clientAccountId: string | null;
  clientContactId: string | null;
  accounts: AccountOpt[];
  contacts: ContactOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "account" | "contact">(null);
  const [bkState, bkAction] = useActionState(
    async (prev: BookingActionState | undefined, fd: FormData) => {
      const next = await patchBookingEntityLinks(prev, fd);
      if (!next?.error) {
        setOpen(null);
        router.refresh();
      }
      return next;
    },
    undefined as BookingActionState | undefined,
  );

  const contactChoices = clientAccountId
    ? contacts.filter((c) => c.client_account_id === clientAccountId)
    : contacts;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn("h-8 px-2 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)}
        onClick={() => setOpen("account")}
      >
        Change Work Location
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={cn("h-8 px-2 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)}
        onClick={() => setOpen("contact")}
      >
        Change contact
      </Button>

      <DashboardEditPanel
        open={open === "account"}
        onOpenChange={(o) => setOpen(o ? "account" : null)}
        title="Change Work Location"
        description="If the current contact does not belong to the new Work Location, it will be cleared."
      >
        <form action={bkAction} className="space-y-4">
          <input type="hidden" name="booking_id" value={bookingId} />
          <input type="hidden" name="patch_mode" value="billing_account" />
          <input type="hidden" name="client_user_id" value="" />
          <input type="hidden" name="client_contact_id" value="" />
          <input type="hidden" name="source_inquiry_id" value="" />
          {bkState?.error ? <p className="text-sm text-destructive">{bkState.error}</p> : null}
          <select name="client_account_id" className={ADMIN_FORM_CONTROL} defaultValue={clientAccountId ?? ""}>
            <option value="">— None —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <SnapshotRefreshFields />
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      </DashboardEditPanel>

      <DashboardEditPanel
        open={open === "contact"}
        onOpenChange={(o) => setOpen(o ? "contact" : null)}
        title="Change contact"
        description="Person at this Work Location."
      >
        <form action={bkAction} className="space-y-4">
          <input type="hidden" name="booking_id" value={bookingId} />
          <input type="hidden" name="patch_mode" value="contact" />
          <input type="hidden" name="client_user_id" value="" />
          <input type="hidden" name="client_account_id" value="" />
          <input type="hidden" name="source_inquiry_id" value="" />
          {bkState?.error ? <p className="text-sm text-destructive">{bkState.error}</p> : null}
          {!clientAccountId ? (
            <p className="text-sm text-muted-foreground">Link a Work Location first.</p>
          ) : (
            <>
              <select name="client_contact_id" className={ADMIN_FORM_CONTROL} defaultValue={clientContactId ?? ""}>
                <option value="">— None —</option>
                {contactChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <SnapshotRefreshFields />
              <Button type="submit" size="sm">
                Save
              </Button>
            </>
          )}
        </form>
      </DashboardEditPanel>
    </div>
  );
}
