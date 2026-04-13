"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  assignBookingToCurrentStaffForm,
  quickUpdateBookingPeek,
  type BookingActionState,
} from "@/app/(dashboard)/admin/bookings/actions";
import { Button } from "@/components/ui/button";
import {
  ADMIN_ACTION_TERTIARY_CLASS,
  ADMIN_FORM_CONTROL,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { BOOKING_STATUS_VALUES } from "@/lib/admin/validation";
import { cn } from "@/lib/utils";

export function AdminBookingListRowQuickActions({
  bookingId,
  status,
  ownerStaffId,
  currentUserId,
  sourceInquiryId,
}: {
  bookingId: string;
  status: string;
  ownerStaffId: string | null;
  currentUserId: string | null;
  sourceInquiryId: string | null;
}) {
  const router = useRouter();
  const [state, action] = useActionState(
    async (_p: BookingActionState | undefined, fd: FormData) => {
      const next = await quickUpdateBookingPeek(fd);
      if (!next?.error) router.refresh();
      return next;
    },
    undefined as BookingActionState | undefined,
  );

  const showAssign = Boolean(currentUserId && ownerStaffId !== currentUserId);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form action={action} className="flex items-center gap-1">
        <input type="hidden" name="booking_id" value={bookingId} />
        <input type="hidden" name="owner_staff_id" value={ownerStaffId ?? ""} />
        <label htmlFor={`bk-st-${bookingId}`} className="sr-only">
          Status
        </label>
        <select
          id={`bk-st-${bookingId}`}
          name="status"
          className={cn(ADMIN_FORM_CONTROL, "h-8 min-w-[120px] py-0 text-xs capitalize")}
          defaultValue={status}
          onChange={(e) => {
            e.currentTarget.form?.requestSubmit();
          }}
        >
          {BOOKING_STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </form>
      {state?.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
      {showAssign ? (
        <form action={assignBookingToCurrentStaffForm}>
          <input type="hidden" name="booking_id" value={bookingId} />
          <Button size="sm" variant="outline" className="h-8 text-xs">
            Assign to me
          </Button>
        </form>
      ) : null}
      <Button size="sm" className={cn("h-8 rounded-xl text-xs", LUXURY_GOLD_BUTTON_CLASS)} asChild>
        <Link href={`/admin/bookings/${bookingId}`} scroll={false}>
          Open
        </Link>
      </Button>
      {sourceInquiryId ? (
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
          <Link href={`/admin/inquiries/${sourceInquiryId}`} scroll={false}>
            Inquiry
          </Link>
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" className={cn("h-8 px-2 text-xs", ADMIN_ACTION_TERTIARY_CLASS)} asChild>
        <Link href={`/admin/bookings/${bookingId}#duplicate-booking`} scroll={false}>
          Duplicate
        </Link>
      </Button>
    </div>
  );
}
