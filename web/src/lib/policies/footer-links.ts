/**
 * Default footer small-print links for talent and agency sites.
 *
 * Pure and client-safe (no server imports). The platform terms link points at
 * the marketing host; everything else is a same-host policy page.
 *
 * "Privacy choices" uses the sentinel href below. Wherever a footer link with
 * this href is clicked, `PrivacyChoicesBridge` dispatches
 * `window.dispatchEvent(new Event("tulala:privacy-choices"))` (another agent
 * owns the listener that opens the consent panel).
 */

export const PRIVACY_CHOICES_HREF = "#privacy-choices";
export const PRIVACY_CHOICES_EVENT = "tulala:privacy-choices";

export const BOOKING_POLICY_PATH = "/policies/booking";
export const PRIVACY_NOTICE_PATH = "/policies/privacy";

export function platformTermsUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://tulala.digital")
    .trim()
    .replace(/\/$/, "");
  return `${base}/legal/terms`;
}

export type DefaultFooterLinkKey = "booking" | "privacy" | "choices" | "terms";

export interface DefaultFooterLink {
  key: DefaultFooterLinkKey;
  label: string;
  href: string;
  external?: boolean;
}

/** The four default small-print links, in display order. */
export function defaultFooterLegalLinks(): DefaultFooterLink[] {
  return [
    { key: "booking", label: "Booking policy", href: BOOKING_POLICY_PATH },
    { key: "privacy", label: "Privacy", href: PRIVACY_NOTICE_PATH },
    { key: "choices", label: "Privacy choices", href: PRIVACY_CHOICES_HREF },
    { key: "terms", label: "Terms", href: platformTermsUrl(), external: true },
  ];
}

/**
 * Which default link an "Add small-print link" click should insert: the first
 * default not already in the list, else the privacy notice.
 */
export function nextDefaultFooterLink(
  existingHrefs: readonly string[],
): DefaultFooterLink {
  const all = defaultFooterLegalLinks();
  return (
    all.find((l) => !existingHrefs.includes(l.href)) ??
    all.find((l) => l.key === "privacy")!
  );
}
