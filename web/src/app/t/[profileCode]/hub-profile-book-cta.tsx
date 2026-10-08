import Link from "next/link";
import type { ReactNode } from "react";

import { createTranslator } from "@/i18n/messages";
import {
  resolveHubProfileCta,
  type HubProfileCtaSlot,
} from "@/lib/talent-site/hub-profile-book-cta";
import type { TalentAskEntry } from "@/lib/talent/chat-entry";

/**
 * TUL-170: on the hub, a talent with a site gets a primary Book button to her
 * site's booking entry; otherwise the existing Inquire controls (children)
 * render unchanged. Decision lives in `resolveHubProfileCta`.
 *
 * The header, sidebar and footer slots (and the freeform profile bar) all share
 * this wrapper (TUL-246): each renders exactly ONE Book link, never an id (the
 * same page holds several slots), tagged `data-hub-book-slot` so QA and tests can
 * tell them apart.
 */
export function HubProfileCta({
  platformHost,
  maxSiteUrl,
  askEntry,
  locale,
  className,
  slot,
  children,
}: {
  platformHost: boolean;
  maxSiteUrl: string | null;
  askEntry: TalentAskEntry;
  locale: string;
  className: string;
  slot: HubProfileCtaSlot;
  children?: ReactNode;
}) {
  const cta = resolveHubProfileCta({ platformHost, maxSiteUrl, askEntry });
  if (cta.kind !== "book") return <>{children}</>;
  return (
    <Link
      href={cta.href}
      className={className}
      data-hub-book-cta=""
      data-hub-book-slot={slot}
      {...(cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {createTranslator(locale)("public.profileCta.bookCta")}
    </Link>
  );
}
