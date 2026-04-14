"use client";

import { useState } from "react";
import type { AccountOption } from "@/app/(dashboard)/admin/accounts/[id]/add-contact-form";
import { ManualBookingForm } from "@/app/(dashboard)/admin/bookings/new/manual-booking-form";
import { AdminNewInquirySheet } from "@/components/admin/admin-new-inquiry-sheet";
import { CreateClientAccountSheet } from "@/components/admin/create-client-account-sheet";
import { Button } from "@/components/ui/button";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { cn } from "@/lib/utils";

type Contact = { id: string; client_account_id: string; label: string };
type Talent = { id: string; profile_code: string; display_name: string | null };
type Staff = { id: string; display_name: string | null };
type PlatformClient = { id: string; display_name: string | null };

type InquiryProps = {
  variant: "inquiries";
  accounts: AccountOption[];
  contacts: Contact[];
  talents: Talent[];
};

type BookingProps = {
  variant: "bookings";
  accounts: AccountOption[];
  contacts: Contact[];
  talents: Talent[];
  staff: Staff[];
  defaultOwnerId: string;
  platformClients: PlatformClient[];
  formKey: string;
};

type Props = InquiryProps | BookingProps;

export function AdminCommercialListIntake(props: Props) {
  const [clientOpen, setClientOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {props.variant === "inquiries" ? (
        <AdminNewInquirySheet
          accounts={props.accounts}
          contacts={props.contacts}
          talents={props.talents}
        />
      ) : (
        <>
          <Button type="button" size="sm" className="rounded-full" onClick={() => setBookingOpen(true)}>
            New booking
          </Button>
          <DashboardEditPanel
            open={bookingOpen}
            onOpenChange={setBookingOpen}
            title="Manual booking"
            description="Create a job from the list — same fields as the full-page form. Optional CRM tools refresh after save."
            className="max-w-[720px]"
          >
            {bookingOpen ? (
              <div className="max-h-[min(80vh,680px)] overflow-y-auto pr-1">
                <ManualBookingForm
                  key={props.formKey}
                  accounts={props.accounts}
                  contacts={props.contacts}
                  talents={props.talents}
                  staff={props.staff}
                  defaultOwnerId={props.defaultOwnerId}
                  platformClients={props.platformClients}
                  returnTo="/admin/bookings"
                  redirectAfterCreate="list"
                  formClassName="max-w-none"
                />
              </div>
            ) : null}
          </DashboardEditPanel>
        </>
      )}
      <Button type="button" variant="outline" size="sm" className={cn("rounded-full")} onClick={() => setClientOpen(true)}>
        New Work Location
      </Button>
      <CreateClientAccountSheet open={clientOpen} onOpenChange={setClientOpen} />
    </div>
  );
}
