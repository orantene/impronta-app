"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { convertInquiryToBooking } from "@/app/(dashboard)/admin/bookings/actions";
import { actionEngineConvertToBooking } from "@/app/(dashboard)/admin/inquiries/[id]/convert-booking-actions";
import { handleActionResult } from "@/lib/inquiry/inquiry-action-result";
import { ADMIN_FORM_CONTROL, LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { BOOKING_STATUS_VALUES } from "@/lib/admin/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type InquiryTalent = {
  talent_profile_id: string;
  profile_code: string;
  display_name: string | null;
};

type ExistingBooking = { id: string; title: string; status: string };

export const INQUIRY_ENGINE_CONVERT_FORM_ID = "inquiry-engine-convert-form";

function EngineConvertBookingForm({
  inquiryId,
  inquiryVersion,
  formId = INQUIRY_ENGINE_CONVERT_FORM_ID,
}: {
  inquiryId: string;
  inquiryVersion: number;
  formId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState<{ bookingId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (success) {
    return (
      <div className="rounded-2xl border border-[var(--impronta-gold)]/40 bg-[var(--impronta-gold)]/8 px-5 py-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--impronta-gold)]" aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-foreground">Booking confirmed</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This inquiry has been converted. The booking record holds the confirmed pricing, talent,
              and timeline. The inquiry is now read-only.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}>
                <Link href={`/admin/bookings/${success.bookingId}`}>View booking →</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(() => {
      void (async () => {
        const result = await actionEngineConvertToBooking(fd);
        if (result.ok) {
          router.refresh();
          if (result.data?.bookingId) {
            setSuccess({ bookingId: result.data.bookingId });
          } else {
            toast.message(result.message ?? "Booking created.");
          }
        } else {
          setError(result.message);
        }
      })();
    });
  };

  return (
    <form id={formId} onSubmit={onSubmit} className="space-y-4">
      <p className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Engine conversion</span> — requires status{" "}
        <strong>approved</strong>, an <strong>accepted</strong> offer, and a matching roster. Pricing is
        snapshotted into the booking. The workspace refreshes to the booked state immediately.
      </p>
      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <input type="hidden" name="inquiry_id" value={inquiryId} />
      <input type="hidden" name="expected_version" value={String(inquiryVersion)} />
      <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
        {pending ? "Converting…" : "Convert to booking"}
      </Button>
    </form>
  );
}

export function InquiryConvertBookingPanel({
  inquiryId,
  defaultTitle,
  talents,
  existingBookings,
  engineV2,
  inquiryVersion = 1,
}: {
  inquiryId: string;
  defaultTitle: string;
  talents: InquiryTalent[];
  existingBookings: ExistingBooking[];
  engineV2?: boolean;
  inquiryVersion?: number;
}) {
  const [mode, setMode] = useState<"new" | "attach">("new");
  const talentListRef = useRef<HTMLUListElement>(null);

  if (engineV2) {
    return <EngineConvertBookingForm inquiryId={inquiryId} inquiryVersion={inquiryVersion} formId={INQUIRY_ENGINE_CONVERT_FORM_ID} />;
  }

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
