/**
 * picker-config.ts — is this block configured, or is it broken?
 *
 * Pure, so it gates in CI and the island's behaviour is testable without a
 * renderer.
 *
 * The builder renders the session picker with
 * `tenantId={options.dataSources.tenantId ?? ""}`. A block placed on a page
 * whose data sources carry no tenant therefore arrives with an empty string,
 * and an empty string is refused downstream — both picker actions parse
 * `z.string().uuid()`, so it dies at the schema before any query is built.
 *
 * WHAT IS ACTUALLY WRONG IS THE ANSWER IT PRODUCES. Without this the block
 * renders "we could not reach the seat count", which is precisely what a real
 * outage renders, and the author who mis-placed it goes looking for a fault in
 * the engine. That is the cost of the `?? ""` sentinel: it turns a
 * configuration mistake into a runtime symptom that resembles a different
 * problem.
 *
 * So absence is made structurally distinct from a value, which is the rule this
 * area keeps relearning: a bare empty string cannot say "nobody set me up".
 */

export type PickerConfig =
  | { ok: true; tenantId: string; offeringId: string }
  | { ok: false; missing: "tenant" | "offering" | "both" };

/**
 * Whether the block has what it needs, and which half is absent when it does
 * not — the author has to be told which field to fill, not merely that
 * something is wrong.
 *
 * Deliberately NOT a uuid check. Rejecting a malformed id here would render
 * "not set up" for a genuinely wrong id, which is a different fault with a
 * different fix; the schema downstream owns that and answers it as invalid.
 * This answers exactly one question: was anything supplied at all.
 */
export function pickerConfig(
  tenantId: string | null | undefined,
  offeringId: string | null | undefined,
): PickerConfig {
  const tenant = (tenantId ?? "").trim();
  const offering = (offeringId ?? "").trim();
  if (!tenant && !offering) return { ok: false, missing: "both" };
  if (!tenant) return { ok: false, missing: "tenant" };
  if (!offering) return { ok: false, missing: "offering" };
  return { ok: true, tenantId: tenant, offeringId: offering };
}
