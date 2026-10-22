/**
 * TUL-1372 (slice 3): the REQUEST-ONLY action for a roster service on the
 * workspace site (PM decision: no price checkout, no pay button until the
 * listing checkout reader lands). The action is the workspace's existing
 * contact form with the service and the talent written into the message.
 * Pure.
 *
 * The talent is named only when the entry's show-who says so (`talentName` is
 * null otherwise). No listing id, profile id or payment parameter ever goes in
 * the link.
 */
import type { RosterServiceItem } from "./roster-services";

const isEs = (locale: string) => locale.toLowerCase().startsWith("es");

export const CONTACT_PREFILL_MAX_LENGTH = 600;

/**
 * TUL-1844: where a roster/hub "Request" button goes. NOT `/contact`: on a business (agency) host
 * `/contact` is a CMS page the owner may never have made (it 404s), while `/book` is on the host
 * allow-list, so `/book/request` always exists and renders the workspace inquiry form.
 */
export const WORKSPACE_REQUEST_PATH = "/book/request";

export function rosterRequestMessage(item: RosterServiceItem, locale: string): string {
  const who = item.talentName?.trim() || null;
  return isEs(locale)
    ? `Quiero solicitar: ${item.title.trim()}${who ? ` (con ${who})` : ""}.`
    : `I'd like to request: ${item.title.trim()}${who ? ` (with ${who})` : ""}.`;
}

export function rosterRequestHref(contactHref: string, item: RosterServiceItem, locale: string): string {
  const qs = new URLSearchParams({ message: rosterRequestMessage(item, locale) });
  return `${contactHref}?${qs.toString().replace(/\+/g, "%20")}`;
}

// eslint-disable-next-line no-control-regex -- strips control characters from a query-supplied prefill
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

/** `?message=` on the contact page: trimmed, control characters removed, capped. A convenience, never a submission. */
export function contactMessagePrefill(params: { message?: string | string[] | undefined } | null | undefined): string | null {
  const raw = params?.message;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL_CHARS, "").trim();
  return cleaned ? cleaned.slice(0, CONTACT_PREFILL_MAX_LENGTH) : null;
}
