/**
 * Refusals the Offer tab says in the reader's language
 * (`dashboard.clientOffer.refusal.<code>`); `message` stays the English
 * fallback. D-174: the dialog used to print `no_client_participant` raw.
 */
export type OfferRefusalCode = "no_client_participant" | "version_conflict" | "forbidden" | "unavailable";

export function offerRefusalCode(result: {
  conflict?: boolean;
  forbidden?: boolean;
  error?: string;
  reason?: string;
}): OfferRefusalCode {
  if (result.conflict) return "version_conflict";
  if (result.forbidden) return "forbidden";
  const raw = result.reason ?? result.error ?? "";
  if (raw === "no_client_participant") return "no_client_participant";
  if (raw === "version_conflict" || raw === "forbidden") return raw;
  return "unavailable";
}
