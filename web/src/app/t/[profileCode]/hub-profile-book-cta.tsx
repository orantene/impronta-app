import Link from "next/link";
import type { ReactNode } from "react";

import { createTranslator } from "@/i18n/messages";
import {
  resolveHubProfileCta,
  type HubProfileCtaSlot,
} from "@/lib/talent-site/hub-profile-book-cta";

/**
 * TUL-246: on the hub, a talent with bookable services gets a primary Book
 * button to `#book` (opens the booking sheet); otherwise the existing Inquire
 * controls (children) render unchanged. Decision lives in `resolveHubProfileCta`.
 *
 * The header, sidebar and footer slots (and the freeform profile bar) all share
 * this wrapper: each renders exactly ONE Book link, never an id (the same page
 * holds several slots), tagged `data-hub-book-slot` so QA and tests can tell
 * them apart.
 */
export function HubProfileCta({
  platformHost,
  hasBookableServices,
  locale,
  className,
  slot,
  children,
}: {
  platformHost: boolean;
  hasBookableServices: boolean;
  locale: string;
  className: string;
  slot: HubProfileCtaSlot;
  children?: ReactNode;
}) {
  const cta = resolveHubProfileCta({ platformHost, hasBookableServices });
  if (cta.kind !== "book") return <>{children}</>;
  return (
    <Link
      href={cta.href}
      className={className}
      data-hub-book-cta=""
      data-hub-book-slot={slot}
    >
      {createTranslator(locale)("public.profileCta.bookCta")}
    </Link>
  );
}
