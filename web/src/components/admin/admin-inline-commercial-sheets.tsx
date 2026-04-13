"use client";

import { useState } from "react";
import type { AccountOption } from "@/app/(dashboard)/admin/accounts/[id]/add-contact-form";
import { CreateClientAccountSheet } from "@/components/admin/create-client-account-sheet";
import { CreateClientContactSheetTrigger } from "@/components/admin/create-client-contact-sheet";
import { Button } from "@/components/ui/button";

export function InquiryCommercialCrmSheets({
  inquiryId,
  clientAccountId,
  linkedAccountName,
  accountOptions,
}: {
  inquiryId: string;
  clientAccountId: string | null;
  linkedAccountName: string | null;
  accountOptions: AccountOption[];
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {!clientAccountId ? (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAccountOpen(true)}>
            Create Client Location
          </Button>
          <CreateClientAccountSheet open={accountOpen} onOpenChange={setAccountOpen} linkInquiryId={inquiryId} />
        </>
      ) : null}
      {clientAccountId ? (
        <CreateClientContactSheetTrigger
          accountOptions={accountOptions}
          lockedAccountId={clientAccountId}
          lockedAccountName={linkedAccountName}
          linkInquiryId={inquiryId}
          variant="outline"
          label="Create contact"
        />
      ) : null}
    </div>
  );
}

export function BookingCommercialCrmSheets({
  bookingId,
  clientAccountId,
  linkedAccountName,
  accountOptions,
}: {
  bookingId: string;
  clientAccountId: string | null;
  linkedAccountName: string | null;
  accountOptions: AccountOption[];
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {!clientAccountId ? (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAccountOpen(true)}>
            Create Client Location
          </Button>
          <CreateClientAccountSheet open={accountOpen} onOpenChange={setAccountOpen} linkBookingId={bookingId} />
        </>
      ) : null}
      {clientAccountId ? (
        <CreateClientContactSheetTrigger
          accountOptions={accountOptions}
          lockedAccountId={clientAccountId}
          lockedAccountName={linkedAccountName}
          linkBookingId={bookingId}
          variant="outline"
          label="Create contact"
        />
      ) : null}
    </div>
  );
}

export function ManualBookingCommercialTools({ accountOptions }: { accountOptions: AccountOption[] }) {
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-border/45 bg-muted/15 px-3 py-3 text-sm">
      <span className="text-muted-foreground">Need CRM records? Client = portal login. Client Location = venue / business.</span>
      <Button type="button" size="sm" variant="secondary" onClick={() => setAccountOpen(true)}>
        New Client Location
      </Button>
      <CreateClientContactSheetTrigger
        accountOptions={accountOptions}
        variant="outline"
        size="sm"
        label="New contact"
      />
      <CreateClientAccountSheet open={accountOpen} onOpenChange={setAccountOpen} />
    </div>
  );
}
