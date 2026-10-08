import Link from "next/link";
import type { ReactNode } from "react";

import { createTranslator } from "@/i18n/messages";
import { resolveHubProfileCta } from "@/lib/talent-site/hub-profile-book-cta";
import type { TalentAskEntry } from "@/lib/talent/chat-entry";

/**
 * TUL-170: on the hub, a talent with a site gets a primary Book button to her
 * site's booking entry; otherwise the existing Inquire controls (children)
 * render unchanged. Decision lives in `resolveHubProfileCta`.
 */
export function HubProfileCta({
  platformHost,
  maxSiteUrl,
  askEntry,
  locale,
  className,
  children,
}: {
  platformHost: boolean;
  maxSiteUrl: string | null;
  askEntry: TalentAskEntry;
  locale: string;
  className: string;
  children: ReactNode;
}) {
  const cta = resolveHubProfileCta({ platformHost, maxSiteUrl, askEntry });
  if (cta.kind !== "book") return <>{children}</>;
  return (
    <Link
      href={cta.href}
      className={className}
      data-hub-book-cta=""
      {...(cta.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {createTranslator(locale)("public.profileCta.bookCta")}
    </Link>
  );
}
