"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { BOOKING_POLICY_AGREE, toPolicyLocale } from "@/lib/policies/policy-text";
import { BOOKING_POLICY_PATH } from "@/lib/policies/footer-links";

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Policy pages are served on talent and agency hosts only. The platform's own
 * hosts (marketing apex, app) do not serve `/policies/*`, so the line is not
 * rendered there. Decided after mount from the hostname, so SSR markup and the
 * first client render match (both render nothing).
 */
export function isPolicyHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  const platformHosts = [
    hostOf(process.env.NEXT_PUBLIC_SITE_URL),
    hostOf(process.env.NEXT_PUBLIC_APP_URL),
  ].filter((x): x is string => Boolean(x));
  if (platformHosts.includes(h)) return false;
  if (h === "localhost" || h === "127.0.0.1") return false;
  return true;
}

/**
 * Compact display-only line near a submit or pay control on a talent site:
 * "By continuing you agree to the booking policy." The link opens in a new tab
 * so the visitor's form state is never lost. Acceptance is not recorded here.
 */
export function BookingPolicyAgreeLine({
  locale,
  style,
  className,
}: {
  /** Optional; falls back to the document language. */
  locale?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const [ready, setReady] = useState<{ es: boolean } | null>(null);

  useEffect(() => {
    if (!isPolicyHost(window.location.hostname)) return;
    const lang = locale ?? document.documentElement.lang;
    setReady({ es: toPolicyLocale(lang) === "es" });
  }, [locale]);

  if (!ready) return null;
  const copy = BOOKING_POLICY_AGREE[ready.es ? "es" : "en"];
  return (
    <p
      className={className}
      data-booking-policy-agree=""
      style={{ margin: 0, fontSize: 11, opacity: 0.75, ...style }}
    >
      {copy.before}
      <a
        href={BOOKING_POLICY_PATH}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: "underline", color: "inherit" }}
      >
        {copy.link}
      </a>
      {copy.after}
    </p>
  );
}
