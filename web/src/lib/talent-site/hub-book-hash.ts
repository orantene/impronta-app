/**
 * Hub `/t/<code>#book` open intent (TUL-246). PURE.
 *
 * Same `BookEntry` rule as vanity sites: any bookable service → sheet (preferred
 * offering); none → inquire (guest chat / form). Returns null when the hash is
 * not a booking entry.
 */
import { intentForHref, type BookEntry } from "@/lib/talent-site/book-entry";
import { TALENT_BOOK_HREF } from "@/lib/talent-site/contact-channels";
import type { OpenIntent } from "@/lib/talent-site/open-intent-queue";

/** Intent for a hub location hash (or link href fragment). */
export function hubBookHashIntent(
  hashOrHref: string,
  bookEntry: BookEntry | null | undefined,
): OpenIntent | null {
  const hash = hashOrHref.includes("#")
    ? `#${hashOrHref.split("#").pop() ?? ""}`
    : hashOrHref.startsWith("#")
      ? hashOrHref
      : "";
  if (hash !== TALENT_BOOK_HREF) return null;
  return intentForHref(TALENT_BOOK_HREF, bookEntry);
}
