import { offeringText, type TalentOfferingRow } from "@/lib/talent/offerings-types";

/**
 * TUL-1922: a class title in the session picker, resolved the way /book does
 * (`rowToOffering` -> `offeringText`): `title_i18n` for the page locale, the
 * base title as fallback. No locale means the base title.
 */
export function localizedPickerTitle(o: { title?: unknown; title_i18n?: unknown }, locale: string | undefined): string {
  const base = typeof o.title === "string" && o.title.trim() ? o.title.trim() : "Class";
  const loc = (locale ?? "").trim();
  if (!loc) return base;
  const hit = offeringText(
    { title: base, description: null, title_i18n: o.title_i18n as TalentOfferingRow["title_i18n"], description_i18n: null },
    "title",
    loc,
  );
  return hit?.trim() ? hit.trim() : base;
}
