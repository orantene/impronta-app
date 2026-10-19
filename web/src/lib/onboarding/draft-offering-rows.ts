/**
 * AI-drafted services at onboarding: one DRAFT quote row per stated service.
 *
 * `blankOffering` defaults to `bookingMode: "instant"`, and `validateOffering`
 * refuses instant + quote (an exact price is required to book instantly), so a
 * quote draft MUST be request/inquiry mode or the validation filter drops every
 * row and the talent lands on an empty Services page (Services Phase 0 item 5b).
 */

import { blankOffering, offeringToRowPatch, validateOffering } from "@/lib/talent/offerings-types";

export function buildDraftOfferingRows(input: {
  talentProfileId: string;
  tenantId: string;
  services: readonly string[];
  /** Lower-cased trimmed titles the profile already has. */
  known: ReadonlySet<string>;
}): Array<ReturnType<typeof offeringToRowPatch> & { talent_profile_id: string }> {
  const seen = new Set(input.known);
  const out: Array<ReturnType<typeof offeringToRowPatch> & { talent_profile_id: string }> = [];
  input.services.forEach((raw, i) => {
    const title = raw.trim();
    if (!title || seen.has(title.toLowerCase())) return;
    const o = {
      ...blankOffering({ kind: "talent", talentProfileId: input.talentProfileId }, "USD", i),
      tenantId: input.tenantId,
      title,
      priceDisplay: "quote" as const,
      priceType: "custom" as const,
      bookingMode: "inquiry" as const,
      status: "draft" as const,
    };
    if (validateOffering(o).length > 0) return;
    seen.add(title.toLowerCase());
    out.push({ ...offeringToRowPatch(o), talent_profile_id: input.talentProfileId });
  });
  return out;
}
