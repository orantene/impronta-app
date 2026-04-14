"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AddContactForm,
  type AccountOption,
} from "@/app/(dashboard)/admin/accounts/[id]/add-contact-form";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { Button } from "@/components/ui/button";

export function CreateClientContactSheet({
  open,
  onOpenChange,
  accountOptions,
  lockedAccountId,
  lockedAccountName,
  linkInquiryId,
  linkBookingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountOptions: AccountOption[];
  /** When set, the commercial account is fixed (typical on account detail or linked inquiry/booking). */
  lockedAccountId?: string | null;
  lockedAccountName?: string | null;
  linkInquiryId?: string | null;
  linkBookingId?: string | null;
}) {
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (open) setFormKey((k) => k + 1);
  }, [open]);

  const accountLocked = Boolean(lockedAccountId);
  const canShowForm = Boolean(lockedAccountId) || accountOptions.length > 0;

  return (
    <DashboardEditPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Create client contact"
      description={
        accountLocked
          ? "A person at this Work Location (not a portal login). They can be linked to this inquiry or booking when you save."
          : "Pick the Work Location, then add the contact — without leaving this page."
      }
    >
      <div className="space-y-4">
        {canShowForm ? (
          <AddContactForm
            key={formKey}
            clientAccountId={lockedAccountId ?? undefined}
            accountLocked={accountLocked}
            lockedAccountName={lockedAccountName}
            accountOptions={accountLocked ? undefined : accountOptions}
            submitLabel="Save contact"
            linkInquiryId={linkInquiryId ?? undefined}
            linkBookingId={linkBookingId ?? undefined}
            onSuccess={() => {
              toast.success("Contact added");
              setFormKey((k) => k + 1);
              router.refresh();
              onOpenChange(false);
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            No Work Locations available. Create a Work Location first, then add contacts.
          </p>
        )}
      </div>
    </DashboardEditPanel>
  );
}

export function CreateClientContactSheetTrigger({
  accountOptions,
  lockedAccountId,
  lockedAccountName,
  linkInquiryId,
  linkBookingId,
  label = "Add contact",
  variant = "secondary",
  size = "sm",
}: {
  accountOptions: AccountOption[];
  lockedAccountId?: string | null;
  lockedAccountName?: string | null;
  linkInquiryId?: string | null;
  linkBookingId?: string | null;
  label?: string;
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <CreateClientContactSheet
        open={open}
        onOpenChange={setOpen}
        accountOptions={accountOptions}
        lockedAccountId={lockedAccountId ?? undefined}
        lockedAccountName={lockedAccountName ?? undefined}
        linkInquiryId={linkInquiryId ?? undefined}
        linkBookingId={linkBookingId ?? undefined}
      />
    </>
  );
}
