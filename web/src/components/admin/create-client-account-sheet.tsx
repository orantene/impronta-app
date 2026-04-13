"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NewAccountForm } from "@/app/(dashboard)/admin/accounts/new/new-account-form";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { Button } from "@/components/ui/button";
import { ADMIN_OUTLINE_CONTROL_CLASS, LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

export type ClientLocationFormValues = {
  id: string;
  name: string;
  account_type: string | null;
  account_type_detail?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
  website_url?: string | null;
  country?: string | null;
  city?: string | null;
  location_text?: string | null;
  address_notes?: string | null;
  google_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function CreateClientAccountSheet({
  open,
  onOpenChange,
  linkInquiryId,
  linkBookingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkInquiryId?: string | null;
  linkBookingId?: string | null;
}) {
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (open) setFormKey((k) => k + 1);
  }, [open]);

  return (
    <DashboardEditPanel
      open={open}
      onOpenChange={onOpenChange}
      title="New Client Location"
      description="This is the place or business unit the work is for — a villa, venue, hotel, etc. One client (person) can have many client locations. This is not a portal login; see Clients in the admin nav for people."
    >
      <div className="space-y-4">
        <NewAccountForm
          key={formKey}
          mode="sheet"
          linkInquiryId={linkInquiryId ?? undefined}
          linkBookingId={linkBookingId ?? undefined}
          onSheetSuccess={(id) => {
            toast.success("Client location created", {
              action: {
                label: "Open location",
                onClick: () => {
                  router.push(`/admin/accounts/${id}`);
                },
              },
              duration: 10000,
            });
            router.refresh();
            onOpenChange(false);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Prefer a full-width page?{" "}
          <Button variant="link" className="h-auto p-0 text-xs" asChild>
            <Link href="/admin/accounts/new" scroll={false}>
              Open full-page form
            </Link>
          </Button>
        </p>
      </div>
    </DashboardEditPanel>
  );
}

export function EditClientAccountSheet({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: ClientLocationFormValues;
}) {
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (open) setFormKey((k) => k + 1);
  }, [open]);

  const panel = (
    <DashboardEditPanel
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${account.name}`}
      description="Update this Client Location in place. Google Places can refresh the address details, and you can still edit everything manually before saving."
    >
      <div className="space-y-4">
        <NewAccountForm
          key={`${account.id}-${formKey}`}
          mode="sheet"
          formMode="edit"
          clientAccountId={account.id}
          initialValues={account}
          onSheetSuccess={() => {
            toast.success("Client location updated");
            router.refresh();
            onOpenChange(false);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Need the full record?{" "}
          <Button variant="link" className="h-auto p-0 text-xs" asChild>
            <Link href={`/admin/accounts/${account.id}`} scroll={false}>
              Open detail page
            </Link>
          </Button>
        </p>
      </div>
    </DashboardEditPanel>
  );

  return panel;
}

export function EditClientAccountButton({
  account,
  label = "Edit",
  className,
}: {
  account: ClientLocationFormValues;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("rounded-full", ADMIN_OUTLINE_CONTROL_CLASS, className)}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <EditClientAccountSheet open={open} onOpenChange={setOpen} account={account} />
    </>
  );
}

export function AdminAccountsToolbar() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" className={cn("rounded-full", LUXURY_GOLD_BUTTON_CLASS)} onClick={() => setOpen(true)}>
        New location
      </Button>
      <Button variant="outline" size="sm" className={cn("rounded-full", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
        <Link href="/admin/accounts/new" scroll={false}>
          Full-page form
        </Link>
      </Button>
      <CreateClientAccountSheet open={open} onOpenChange={setOpen} />
    </div>
  );
}
