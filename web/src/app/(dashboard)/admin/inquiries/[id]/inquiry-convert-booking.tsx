"use client";

import { useRef, useState } from "react";
import { convertInquiryToBooking } from "@/app/(dashboard)/admin/bookings/actions";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";
import { BOOKING_STATUS_VALUES } from "@/lib/admin/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type InquiryTalent = {
  talent_profile_id: string;
  profile_code: string;
  display_name: string | null;
};

type ExistingBooking = { id: string; title: string; status: string };

export function InquiryConvertBookingPanel({
  inquiryId,
  defaultTitle,
  talents,
  existingBookings,
}: {
  inquiryId: string;
  defaultTitle: string;
  talents: InquiryTalent[];
  existingBookings: ExistingBooking[];
}) {
  const [mode, setMode] = useState<"new" | "attach">("new");
  const talentListRef = useRef<HTMLUListElement>(null);

  const setAllTalentChecks = (on: boolean) => {
    talentListRef.current?.querySelectorAll<HTMLInputElement>('input[name="talent_profile_ids"]').forEach((el) => {
      el.checked = on;
    });
  };

  return (
    <form action={convertInquiryToBooking} className="space-y-4">
      <p className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">New booking</span> copies inquiry commercial links and snapshots
        into a draft job. <span className="font-medium text-foreground">Attach to existing</span> only works for
        bookings already created from this inquiry; use it to add more talent rows without duplicating the job.
      </p>
      <input type="hidden" name="inquiry_id" value={inquiryId} />
      <input type="hidden" name="convert_mode" value={mode} />
      {mode === "attach" ? (
        <>
          <input type="hidden" name="title" value="" />
          <input type="hidden" name="booking_status" value="draft" />
          <input type="hidden" name="starts_at" value="" />
          <input type="hidden" name="ends_at" value="" />
          <input type="hidden" name="notes" value="" />
        </>
      ) : null}

      <div className="flex flex-wrap gap-2 rounded-lg border border-border/45 bg-muted/20 p-1">
        <button
          type="button"
          onClick={() => setMode("new")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "new" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          New booking
        </button>
        <button
          type="button"
          onClick={() => setMode("attach")}
          disabled={existingBookings.length === 0}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "attach" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            existingBookings.length === 0 && "cursor-not-allowed opacity-50",
          )}
        >
          Add to existing
        </button>
      </div>

      {mode === "attach" ? (
        <div className="space-y-2">
          <Label htmlFor="existing_booking_id">Booking on this inquiry</Label>
          <select
            id="existing_booking_id"
            name="existing_booking_id"
            required={mode === "attach"}
            className={ADMIN_FORM_CONTROL}
            defaultValue={existingBookings[0]?.id ?? ""}
          >
            <option value="">— Select —</option>
            {existingBookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} · {b.status.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="convert_title">Booking title</Label>
            <Input id="convert_title" name="title" defaultValue={defaultTitle} required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="convert_status">Initial status</Label>
              <select id="convert_status" name="booking_status" defaultValue="draft" className={ADMIN_FORM_CONTROL}>
                {BOOKING_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Schedule (optional)</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input name="starts_at" type="datetime-local" aria-label="Starts" />
                <Input name="ends_at" type="datetime-local" aria-label="Ends" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="convert_notes">Notes</Label>
            <Textarea id="convert_notes" name="notes" rows={2} placeholder="Internal notes for this booking" />
          </div>
        </>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-base">Talent to include</Label>
          <div className="flex gap-2 text-xs">
            <button type="button" className="text-[var(--impronta-gold)] underline-offset-2 hover:underline" onClick={() => setAllTalentChecks(true)}>
              All
            </button>
            <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAllTalentChecks(false)}>
              None
            </button>
          </div>
        </div>
        {talents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No talent on this inquiry shortlist.</p>
        ) : (
          <ul ref={talentListRef} className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border/45 p-3">
            {talents.map((t) => (
              <li key={t.talent_profile_id} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="talent_profile_ids"
                  value={t.talent_profile_id}
                  defaultChecked
                  className="size-4 rounded border-border"
                />
                <span>
                  <span className="font-medium">{t.profile_code}</span>
                  {t.display_name ? <span className="text-muted-foreground"> · {t.display_name}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" name="mark_inquiry_converted" value="true" className="size-4 rounded border-border" />
        Mark inquiry as converted
      </label>

      <Button type="submit" className="w-full sm:w-auto">
        {mode === "new" ? "Create booking" : "Add talent to booking"}
      </Button>
    </form>
  );
}
