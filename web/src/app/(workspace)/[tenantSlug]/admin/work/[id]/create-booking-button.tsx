"use client";

/**
 * CreateBookingButton — the workflow-detail "Create booking" CTA.
 *
 * Previously this was a <Link> to `/admin/bookings?fromInquiry=<id>`, but NOTHING
 * reads the `fromInquiry` query param (it appears exactly once in the codebase —
 * the link itself), so the button dead-ended on the bookings LIST without ever
 * converting the inquiry. This calls the real `convertInquiryToBookingAction`
 * (the same engine path the Messages surface uses) and refreshes so the linked
 * booking + payment flow appear in place.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertInquiryToBookingAction } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";

export function CreateBookingButton({
  tenantSlug,
  inquiryId,
  label,
  style,
}: {
  tenantSlug: string;
  inquiryId: string;
  label: string;
  style: React.CSSProperties;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await convertInquiryToBookingAction(tenantSlug, inquiryId);
      if (res.ok) {
        // The page re-renders with `booking` set → CTA swaps to "View booking"
        // and the payment flow opens. Same success handling as the Messages
        // convert action (router.refresh()).
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
        style={{ ...style, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}
      >
        {pending ? "Creating…" : label}
      </button>
      {error ? (
        <span role="status" style={{ fontSize: 11.5, color: "#dc2626", alignSelf: "center" }}>
          {error}
        </span>
      ) : null}
    </>
  );
}
