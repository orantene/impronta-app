/**
 * TUL-1471 · the request link of a public hub ENTRY: the workspace's contact form with the
 * entry written into the message (`?message=`, same grammar as a loose roster service). The
 * talents are named only when the entry's show-who gave names (`PublicEntry.who`); no id, price
 * or payment parameter ever goes in the link. Pure.
 */
import type { PublicEntry } from "./public-hub";

const isEs = (locale: string) => locale.toLowerCase().startsWith("es");

export function publicEntryRequestMessage(entry: Pick<PublicEntry, "name" | "who">, locale: string): string {
  const who = entry.who.length > 0 ? entry.who.join(", ") : null;
  const name = entry.name.trim();
  return isEs(locale)
    ? `Quiero solicitar: ${name}${who ? ` (con ${who})` : ""}.`
    : `I'd like to request: ${name}${who ? ` (with ${who})` : ""}.`;
}

export function publicEntryRequestHref(contactHref: string, entry: Pick<PublicEntry, "name" | "who">, locale: string): string {
  const qs = new URLSearchParams({ message: publicEntryRequestMessage(entry, locale) });
  return `${contactHref}?${qs.toString().replace(/\+/g, "%20")}`;
}
