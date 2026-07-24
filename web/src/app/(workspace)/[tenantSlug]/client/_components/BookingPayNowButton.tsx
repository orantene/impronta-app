"use client";

// CH2 (2026-07-24) — real "Pay now" on the client's bookings list.
//
// The payment rail already existed and worked: `createInquiryPaymentIntent`
// + `<PayNowSheet>` (embedded Stripe PaymentElement, platform account,
// webhook settles via metadata.transaction_id). It was only reachable from
// the payment_request chat card inside Messages, so a client looking at
// "PAYMENT DUE" on their bookings page had to go hunting for the thread.
//
// This button mounts the SAME sheet from the bookings row. No new rail, no
// new webhook surface: `booking.id` on the client bookings loader IS the
// inquiry id the action expects.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PayNowSheet } from "@/components/chat-cards/PayNowSheet";

export function BookingPayNowButton({
  inquiryId,
  amountLabel,
  label,
}: {
  inquiryId: string;
  amountLabel: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11.5,
          fontWeight: 700,
          color: "#fff",
          padding: "5px 12px",
          borderRadius: 7,
          background: "#1D4ED8",
          border: "none",
          cursor: "pointer",
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        {label}
      </button>
      {open && (
        <PayNowSheet
          inquiryId={inquiryId}
          amountLabel={amountLabel}
          onClose={() => setOpen(false)}
          onPaid={() => {
            // Pull the fresh payment_status / transaction rows into the list.
            router.refresh();
          }}
        />
      )}
    </>
  );
}
