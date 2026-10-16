import Link from "next/link";

import {
  SAVE_BOOKINGS_COPY,
  SAVE_BOOKINGS_HREF,
  saveBookingsLocale,
  shouldShowSaveBookings,
} from "@/lib/client-account/save-bookings";

/**
 * TUL-G4: the guest's way into an account from every post-booking surface
 * (pay page after payment, receipt, thread link). One link into the existing
 * email-code client sign-in, returning to /account. Hidden unless the viewer is
 * known to be signed out. Tokens only, so it sits on any storefront theme.
 */
export function SaveBookingsBlock({
  locale,
  signedIn,
  className,
}: {
  locale: string | null | undefined;
  signedIn: boolean | null | undefined;
  className?: string;
}) {
  if (!shouldShowSaveBookings(signedIn)) return null;
  const c = SAVE_BOOKINGS_COPY[saveBookingsLocale(locale)];
  return (
    <section
      data-save-bookings=""
      className={className}
      style={{
        border: "1px solid var(--token-color-line, rgba(0,0,0,.14))",
        background: "var(--token-color-surface-raised, transparent)",
        color: "var(--token-color-ink, inherit)",
        borderRadius: 16,
        padding: 16,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{c.title}</h2>
      <p style={{ margin: "6px 0 12px", fontSize: 13, lineHeight: 1.5, color: "var(--token-color-muted, inherit)" }}>{c.body}</p>
      <Link
        href={SAVE_BOOKINGS_HREF}
        data-save-bookings-cta=""
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 999,
          padding: "10px 18px",
          fontSize: 14,
          fontWeight: 600,
          textDecoration: "none",
          background: "var(--token-color-primary, #111)",
          color: "var(--token-color-primary-on, #fff)",
        }}
      >
        {c.cta}
      </Link>
    </section>
  );
}
