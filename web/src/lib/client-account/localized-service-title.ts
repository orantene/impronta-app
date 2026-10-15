/**
 * TUL-975: a booking page stores the service name as it was when the client booked
 * (usually the primary language). On a page in another language, prefer the service's
 * own title for that language (`title_i18n`); with none, keep the stored name (EN fallback).
 * Pure, so it is testable without a database.
 */
import { offeringText, type TalentOfferingRow } from "@/lib/talent/offerings-types";

type TitleRow = Pick<TalentOfferingRow, "title" | "description" | "title_i18n" | "description_i18n">;

export function localizedServiceTitle(
  offering: { title: string; title_i18n?: unknown } | null | undefined,
  locale: string,
  stored: string,
): string {
  if (!offering) return stored;
  const visitor = (locale ?? "").trim().toLowerCase().slice(0, 2) || "en";
  const i18n = (offering.title_i18n ?? {}) as Record<string, unknown>;
  const own = Object.entries(i18n).find(
    ([code, text]) => code.trim().toLowerCase().slice(0, 2) === visitor && typeof text === "string" && text.trim() !== "",
  );
  if (!own) return stored;
  const hit = offeringText({ title: offering.title, description: null, title_i18n: offering.title_i18n as TitleRow["title_i18n"], description_i18n: null }, "title", visitor, [visitor]);
  return hit?.trim() ? hit : stored;
}
