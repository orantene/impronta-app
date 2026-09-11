/**
 * Guest portal destinations and bounded verification (no account enumeration).
 */

export const PORTAL_SECTIONS = [
  "upcoming",
  "purchases",
  "passes",
  "projects",
  "messages",
  "profile",
] as const;

export type PortalSection = (typeof PORTAL_SECTIONS)[number];

/**
 * Bounded verification: same response shape whether the receipt exists or not,
 * so callers cannot probe for accounts by timing or message.
 */
export function portalLookupReply(input: {
  found: boolean;
  maskedEmail?: string | null;
}): { ok: true; status: "sent_if_match" } {
  void input.found;
  void input.maskedEmail;
  return { ok: true, status: "sent_if_match" };
}
