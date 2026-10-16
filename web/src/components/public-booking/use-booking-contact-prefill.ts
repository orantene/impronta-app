"use client";

import { useEffect, useRef } from "react";

import { applyBookingPrefill, type BookingPrefill } from "@/lib/client-account/booking-prefill";

/**
 * TUL-723: when the "who" step opens, ask the server for the signed-in
 * client's own contact details and fill only the fields still empty. Guests
 * and staff get nothing back. Fields stay editable; one fetch per sheet open.
 */
export function useBookingContactPrefill({
  active,
  read,
  write,
}: {
  active: boolean;
  read: () => BookingPrefill;
  write: (next: BookingPrefill) => void;
}) {
  const asked = useRef(false);
  const readRef = useRef(read);
  const writeRef = useRef(write);
  useEffect(() => {
    readRef.current = read;
    writeRef.current = write;
  });
  useEffect(() => {
    if (!active) { asked.current = false; return; }
    if (asked.current) return;
    asked.current = true;
    let live = true;
    fetch("/api/client/booking-prefill", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { prefill?: BookingPrefill | null } | null) => {
        if (!live || !body?.prefill) return;
        writeRef.current(applyBookingPrefill(readRef.current(), body.prefill));
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [active]);
}
