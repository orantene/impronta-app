/**
 * Hub `/t/<code>#book` open intent (TUL-246). PURE.
 *
 * Same `BookEntry` rule as vanity sites: any bookable service → sheet (preferred
 * offering); none → inquire (guest chat / form). Returns null when the hash is
 * not a booking entry.
 *
 * TUL-1270 #13: `#book-<id8>` (a service share link) opens that service's sheet
 * when it is still bookable; otherwise it behaves exactly like `#book`.
 */
import { intentForHref, type BookEntry } from "@/lib/talent-site/book-entry";
import { TALENT_BOOK_HREF } from "@/lib/talent-site/contact-channels";
import type { OpenIntent } from "@/lib/talent-site/open-intent-queue";
import { parseHubServiceHash } from "@/lib/talent/service-share-hash";

/** Intent for a hub location hash (or link href fragment). */
export function hubBookHashIntent(
  hashOrHref: string,
  bookEntry: BookEntry | null | undefined,
): OpenIntent | null {
  const id8 = parseHubServiceHash(hashOrHref);
  if (id8) {
    const target = bookEntry?.kind === "sheet" ? bookEntry.targets?.[id8] : undefined;
    if (target) return { channel: "sheet", eventName: target.eventName, detail: target.detail };
    return intentForHref(TALENT_BOOK_HREF, bookEntry);
  }
  const hash = hashOrHref.includes("#")
    ? `#${hashOrHref.split("#").pop() ?? ""}`
    : hashOrHref.startsWith("#")
      ? hashOrHref
      : "";
  if (hash !== TALENT_BOOK_HREF) return null;
  return intentForHref(TALENT_BOOK_HREF, bookEntry);
}
