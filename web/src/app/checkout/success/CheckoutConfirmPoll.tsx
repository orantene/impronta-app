"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CHECKOUT_CONFIRM_POLL_MS } from "@/lib/booking/guest-booking-presentation";

/**
 * Re-asks the server once while the webhook settles the payment. The server
 * builds `nextHref` with the attempt count in it, and stops rendering this
 * component at the cap, so a refresh cannot loop forever.
 */
export function CheckoutConfirmPoll({ nextHref }: { nextHref: string }) {
  const router = useRouter();
  useEffect(() => {
    const t = window.setTimeout(() => router.replace(nextHref), CHECKOUT_CONFIRM_POLL_MS);
    return () => window.clearTimeout(t);
  }, [nextHref, router]);
  return null;
}
