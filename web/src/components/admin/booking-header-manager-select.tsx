"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  quickUpdateBookingPeek,
  type BookingActionState,
} from "@/app/(dashboard)/admin/bookings/actions";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

type StaffOpt = { id: string; display_name: string | null };

export function BookingHeaderManagerSelect({
  bookingId,
  status,
  ownerStaffId,
  staffOptions,
}: {
  bookingId: string;
  status: string;
  ownerStaffId: string | null;
  staffOptions: StaffOpt[];
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

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="status" value={status} />
      <label htmlFor={`hdr-mgr-${bookingId}`} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Manager
      </label>
      <select
        id={`hdr-mgr-${bookingId}`}
        name="owner_staff_id"
        className={cn(ADMIN_FORM_CONTROL, "h-8 w-[min(200px,42vw)] py-0 text-xs")}
        defaultValue={ownerStaffId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">— Unassigned —</option>
        {staffOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.display_name ?? s.id.slice(0, 8)}
          </option>
        ))}
      </select>
      {state?.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
    </form>
  );
}
