"use client";

import { translatorFor } from "@/i18n/use-t";
import { openPrivacyChoices } from "@/lib/analytics/consent";

/**
 * "Privacy choices" footer control. Reopens the consent banner so a visitor can
 * change their cookie and analytics choice at any time. Pass the surface's
 * `locale` (public surfaces take it from the URL, not a cookie).
 */
export function PrivacyChoicesLink({
  locale = "en",
  className,
  style,
}: {
  locale?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const label = translatorFor(locale)("public.consent.privacyChoices");
  return (
    <button
      type="button"
      onClick={openPrivacyChoices}
      className={className ?? "underline-offset-2 hover:underline"}
      style={style}
    >
      {label}
    </button>
  );
}
